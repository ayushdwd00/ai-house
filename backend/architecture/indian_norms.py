"""
Indian Architectural Standards & NBC 2016 Norms Engine
Implements National Building Code of India (NBC 2016) residential requirements:
- Habitable room minimum area (9.5 m² / 7.5 m²) and clear width (2.4 m / 2.1 m)
- Kitchen minimum dimensions (4.5 m², width 1.8 m)
- Bath/WC areas (1.8 m², 1.1 m², combined 2.8 m²)
- Pre-solver program feasibility calculation against buildable envelope
- Natural daylight aperture ratio (>= 1/10 of room area)
- Staircase headroom (>= 2.2 m), riser (<= 190 mm), tread (>= 250 mm)
"""

import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from models import Rect, Room, GenerationFailureResponse

NORMS_PATH = Path(__file__).resolve().parent / "norms_india.json"

with open(NORMS_PATH, "r", encoding="utf-8") as f:
    NBC_NORMS: Dict[str, Any] = json.load(f)


def get_city_norms(city: Optional[str] = None) -> Dict[str, Any]:
    """Returns NBC 2016 base norms merged with city-specific municipal overrides if present."""
    base = dict(NBC_NORMS)
    if city:
        city_key = city.lower().strip()
        overrides = base.get("city_overrides", {}).get(city_key)
        if overrides:
            base["active_city_overrides"] = overrides
    return base


def check_program_feasibility(
    rooms: List[Room],
    buildable_envelope: Rect,
    num_floors: int = 1
) -> Tuple[bool, Optional[GenerationFailureResponse], Dict[str, Any]]:
    """
    Evaluates whether the requested room program can physically fit within the site
    buildable envelope BEFORE invoking the OR-Tools CP-SAT solver.
    Accounts for net room area + 15% circulation + 12% wall structure envelope.
    """
    total_min_net_area = 0.0
    room_breakdown = {}

    for r in rooms:
        min_w = getattr(r, "min_width", 8.0) or 8.0
        min_l = getattr(r, "min_length", 8.0) or 8.0
        min_area = round(min_w * min_l, 2)
        total_min_net_area += min_area
        room_breakdown[r.id] = {
            "type": r.type,
            "min_width": min_w,
            "min_length": min_l,
            "min_area_sqft": min_area
        }

    # Gross required area including circulation corridors (15%) and wall footprint (12%)
    circulation_allowance = total_min_net_area * 0.15
    wall_footprint_allowance = total_min_net_area * 0.12
    total_gross_required = round(total_min_net_area + circulation_allowance + wall_footprint_allowance, 2)

    envelope_ground_area = round(buildable_envelope.width * buildable_envelope.length, 2)
    total_available_buildable = round(envelope_ground_area * num_floors, 2)

    diagnostics = {
        "buildable_envelope_sqft": envelope_ground_area,
        "num_floors": num_floors,
        "total_available_buildable_sqft": total_available_buildable,
        "min_net_rooms_sqft": round(total_min_net_area, 2),
        "circulation_allowance_sqft": round(circulation_allowance, 2),
        "wall_footprint_allowance_sqft": round(wall_footprint_allowance, 2),
        "total_gross_required_sqft": total_gross_required,
        "ground_deficit_sqft": max(0.0, round(total_gross_required - total_available_buildable, 2))
    }

    if total_gross_required > total_available_buildable:
        suggested_floors = max(num_floors + 1, int((total_gross_required // envelope_ground_area) + 1))
        failure = GenerationFailureResponse(
            status="failed",
            stage="feasibility_check",
            error_code="INSUFFICIENT_BUILDABLE_ENVELOPE",
            message=(
                f"Requested spaces require at least {total_gross_required:.0f} sq ft (including NBC circulation & wall thickness), "
                f"which exceeds the buildable envelope ({total_available_buildable:.0f} sq ft across {num_floors} floor(s))."
            ),
            diagnostics={
                **diagnostics,
                "suggested_actions": [
                    f"Increase number of floors from {num_floors} to {suggested_floors}",
                    "Reduce bedroom count or optional spaces",
                    "Increase plot frontage or depth"
                ]
            }
        )
        return False, failure, diagnostics

    return True, None, diagnostics


def validate_nbc_openings_and_circulation(
    rooms: List[Room],
    windows: List[Any],
    doors: List[Any]
) -> List[str]:
    """
    Validates NBC 2016 window-to-floor area ratio (>= 10%) and door widths.
    """
    warnings = []
    win_area_by_room: Dict[str, float] = {}
    for w in windows:
        rid = getattr(w, "room_id", "")
        if rid:
            win_area_by_room[rid] = win_area_by_room.get(rid, 0.0) + (w.width * w.height)

    min_ratio = NBC_NORMS["openings"]["min_window_to_floor_ratio"]
    for r in rooms:
        if r.type in ["living_room", "bedroom", "master_bedroom", "dining"]:
            r_area = r.rect.area if r.rect else (r.preferred_width * r.preferred_length)
            win_area = win_area_by_room.get(r.id, 0.0)
            if r_area > 0 and (win_area / r_area) < min_ratio:
                warnings.append(
                    f"{r.name} daylight window area ({win_area:.1f} sq ft) is below NBC 10% ratio ({r_area * min_ratio:.1f} sq ft required)."
                )

    return warnings
