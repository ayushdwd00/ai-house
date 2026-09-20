"""
Structural Planning Module
Provides preliminary architectural structural planning for residential houses:
- RCC Column Grid Suggestions (standard 10ft-15ft residential span grids placed at room corners)
- Load-Bearing Wall Candidates (continuous longitudinal & transverse exterior and spine walls)
- Staircase Core Structural Zoning
- Slab Assumptions (One-way vs Two-way spanning, thickness)

DISCLAIMER: Preliminary architectural planning only. Final structural design must be
verified and certified by a qualified, licensed structural engineer.
"""

from typing import List, Dict, Any, Optional
import math
from models import FloorPlan, Room, Wall, ConstructionSpecification, StructuralPlanning, Rect


def plan_preliminary_structure(
    floors: List[FloorPlan],
    construction_spec: Optional[ConstructionSpecification] = None
) -> StructuralPlanning:
    """
    Synthesizes preliminary structural column grid locations, candidate load-bearing
    walls, and slab assumptions based on architectural floor plans.
    """
    if not floors:
        return StructuralPlanning(
            structural_system="RCC Frame",
            column_grid_suggestions=[],
            structural_zones=[],
            load_bearing_wall_candidates=[],
            slab_assumptions={"thickness_in": 5.5, "type": "two_way_solid_slab"}
        )

    spec = construction_spec or ConstructionSpecification()
    ground_floor = floors[0]
    rooms = ground_floor.rooms
    walls = ground_floor.walls

    column_grid: List[Dict[str, Any]] = []
    structural_zones: List[Dict[str, Any]] = []
    load_bearing_candidates: List[str] = []
    stair_core_loc: Optional[Dict[str, float]] = None

    # 1. RCC Column Grid Suggestions
    # Collect room corner coordinates and snap them to 0.5ft increments
    raw_corners = set()
    for r in rooms:
        if not r.rect:
            continue
        rx, ry = r.rect.x, r.rect.y
        rw, rl = r.rect.width, r.rect.length
        raw_corners.add((round(rx, 1), round(ry, 1)))
        raw_corners.add((round(rx + rw, 1), round(ry, 1)))
        raw_corners.add((round(rx, 1), round(ry + rl, 1)))
        raw_corners.add((round(rx + rw, 1), round(ry + rl, 1)))

    # Deduplicate proximate corners within 3.0ft span
    sorted_pts = sorted(list(raw_corners))
    filtered_cols = []
    for pt in sorted_pts:
        if not any(math.hypot(pt[0] - fc[0], pt[1] - fc[1]) < 3.5 for fc in filtered_cols):
            filtered_cols.append(pt)

    col_idx = 1
    for cx, cy in filtered_cols:
        column_grid.append({
            "column_id": f"C{col_idx:02d}",
            "x": cx,
            "y": cy,
            "dimensions_in": "9x12" if spec.structural_system == "rcc_frame" else "9x9",
            "type": "preliminary_column_candidate"
        })
        col_idx += 1

    # 2. Load-Bearing Candidates (if load-bearing or hybrid)
    for w in walls:
        w_len = math.hypot(w.end.x - w.start.x, w.end.y - w.start.y)
        if w.is_exterior or (w.wall_type == "interior" and w_len >= 8.0 and w.thickness >= 0.375):
            load_bearing_candidates.append(w.id)

    # 3. Staircase Core
    stair_rooms = [r for r in rooms if r.type == "staircase" and r.rect]
    if stair_rooms:
        sr = stair_rooms[0]
        stair_core_loc = {"x": sr.rect.x, "y": sr.rect.y, "width": sr.rect.width, "length": sr.rect.length}
        structural_zones.append({
            "zone_name": "Staircase Shear / Core Zone",
            "bounds": {"x": sr.rect.x, "y": sr.rect.y, "width": sr.rect.width, "length": sr.rect.length},
            "recommendation": "Four perimeter columns with tied tie-beams around stair opening."
        })

    # 4. Slab Assumptions
    slab_data = {
        "slab_thickness_in": spec.slab_thickness_in,
        "concrete_grade": "M20 (Standard Residential)" if spec.quality_tier != "premium" else "M25 (High Strength)",
        "steel_grade": "Fe500 / Fe550 TMT Rebars",
        "span_assumption": "Maximum clear span recommended <= 16 ft without intermediate beam."
    }

    return StructuralPlanning(
        structural_system="RCC Frame + Masonry Infill" if spec.structural_system == "rcc_frame" else "Load-Bearing Masonry",
        column_grid_suggestions=column_grid,
        structural_zones=structural_zones,
        load_bearing_wall_candidates=load_bearing_candidates,
        stair_core_location=stair_core_loc,
        slab_assumptions=slab_data,
        disclaimer="Preliminary architectural planning only. Final structural design must be verified by a qualified structural engineer."
    )
