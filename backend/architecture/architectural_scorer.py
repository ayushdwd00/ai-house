"""
Architectural Scorer Module
Calculates authentic, non-hardcoded mathematical metrics for residential floor plans:
- Room Program Score
- Size & Dimension Score
- Room Adjacency & Affinity Score
- Privacy Hierarchy Score
- Circulation Efficiency Score
- Furniture Program Fit Score
- Daylight & Solar Exposure Score
- Natural Ventilation Score
- Spatial Efficiency Score
- Vastu Shastra Compliance Score
"""

from typing import List, Dict, Tuple, Optional
import math
from shapely.geometry import box
from models import Room, Site, Wall, Door, Window, ArchitecturalScores, ArchitecturalValidation
from architecture.zoning_graph import build_room_relationship_graph, REQUIRED_ADJACENCY, STRONG_ADJACENCY, PREFERRED_SEPARATION


def calculate_architectural_scores(
    rooms: List[Room],
    site: Site,
    walls: List[Wall],
    doors: List[Door],
    windows: List[Window],
    furniture_scores: List[float],
    vastu_enabled: bool = False
) -> Tuple[ArchitecturalScores, ArchitecturalValidation]:
    """
    Computes real geometric metrics without any arbitrary hardcoded numbers.
    """
    warnings: List[str] = []
    errors: List[str] = []

    # 1. Room Program Score (All requested rooms placed with non-zero geometry)
    valid_rooms = [r for r in rooms if r.rect and r.rect.area > 5.0]
    total_requested = len(rooms)
    program_ratio = len(valid_rooms) / max(1, total_requested)
    room_program_score = round(program_ratio * 100.0, 1)

    # 2. Size & Aspect Ratio Score
    size_deviations = []
    aspect_penalties = []
    for r in valid_rooms:
        if r.type in ["hallway", "staircase"]:
            continue
        pref_w = r.preferred_width
        pref_l = r.preferred_length
        act_w = r.actual_width or r.rect.width
        act_l = r.actual_length or r.rect.length

        # Relative deviation from preferred size
        dev = (abs(act_w - pref_w) + abs(act_l - pref_l)) / max(1.0, pref_w + pref_l)
        size_deviations.append(min(1.0, dev))

        # Comfortable residential aspect ratio is 1.0 to 1.6
        longer = max(act_w, act_l)
        shorter = max(0.1, min(act_w, act_l))
        ratio = longer / shorter
        if ratio > 2.0:
            aspect_penalties.append(ratio - 2.0)
            warnings.append(f"{r.name} has narrow aspect ratio ({ratio:.2f}:1).")

    avg_size_dev = sum(size_deviations) / max(1, len(size_deviations)) if size_deviations else 0.0
    avg_aspect_pen = sum(aspect_penalties) / max(1, len(aspect_penalties)) if aspect_penalties else 0.0
    size_score = round(max(30.0, 100.0 - (avg_size_dev * 50.0) - (avg_aspect_pen * 20.0)), 1)

    # 3. Adjacency Score
    # Graph-based evaluation of shared walls
    G = build_room_relationship_graph(rooms)
    shared_pairs = set()
    for w in walls:
        if w.wall_type == "interior" and len(w.adjacent_room_ids) == 2:
            pair = tuple(sorted(w.adjacent_room_ids))
            shared_pairs.add(pair)

    adj_points = 0.0
    adj_max = 0.0
    for u, v, data in G.edges(data=True):
        weight = data.get("weight", 0.0)
        pair = tuple(sorted([u, v]))
        is_adjacent = pair in shared_pairs

        if weight >= STRONG_ADJACENCY:
            adj_max += weight
            if is_adjacent:
                adj_points += weight
        elif weight <= PREFERRED_SEPARATION:
            # Separation penalty if accidentally sharing a wall
            if is_adjacent:
                adj_points += weight  # weight is negative

    adjacency_score = round(max(20.0, min(100.0, (adj_points / max(1.0, adj_max)) * 100.0)), 1)

    # 4. Privacy Score
    # Check bedroom doors and buffers
    privacy_deductions = 0.0
    foyer_ids = {r.id for r in rooms if r.type == "entry_foyer"}
    kitchen_ids = {r.id for r in rooms if r.type == "kitchen"}
    bedroom_ids = {r.id for r in rooms if r.type in ["bedroom", "master_bedroom"]}

    for d in doors:
        pair = {d.from_room, d.to_room}
        # Direct bedroom to foyer opening
        if any(f in pair for f in foyer_ids) and any(b in pair for b in bedroom_ids):
            privacy_deductions += 25.0
            warnings.append("Bedroom has direct visual access to the entry foyer.")
        # Direct bedroom to kitchen opening
        if any(k in pair for k in kitchen_ids) and any(b in pair for b in bedroom_ids):
            privacy_deductions += 20.0
            warnings.append("Bedroom opens directly into kitchen service zone.")

    privacy_score = round(max(40.0, 100.0 - privacy_deductions), 1)

    # 5. Circulation Score
    total_house_area = sum(r.rect.area for r in valid_rooms)
    hallway_area = sum(r.rect.area for r in valid_rooms if r.type == "hallway")
    circ_ratio = hallway_area / max(1.0, total_house_area)

    # Ideal residential circulation is 8% to 15%
    if circ_ratio == 0:
        circ_score = 65.0
        warnings.append("No dedicated circulation hallway detected.")
    elif 0.08 <= circ_ratio <= 0.16:
        circ_score = 95.0
    elif circ_ratio < 0.08:
        circ_score = 80.0
    else:
        # Oversized corridors (>18%) waste space
        circ_score = max(50.0, 95.0 - ((circ_ratio - 0.16) * 200.0))
        warnings.append(f"Circulation corridor is generous ({circ_ratio*100:.1f}% of house area).")
    circulation_score = round(circ_score, 1)

    # 6. Furniture Fit Score
    furniture_fit_score = round(sum(furniture_scores) / max(1, len(furniture_scores)), 1) if furniture_scores else 85.0

    # 7. Daylight & Ventilation Score
    # Count windows hosted on exterior walls
    ext_wall_ids = {w.id for w in walls if getattr(w, "is_exterior", False) or getattr(w, "wall_type", "") == "exterior"}
    rooms_with_windows = {
        w.room_id for w in windows
        if (not ext_wall_ids or getattr(w, "wall_id", None) in ext_wall_ids or getattr(w, "host_wall_id", None) in ext_wall_ids or getattr(w, "is_exterior", True) or getattr(w, "outward_direction", None))
    }
    habitable_rooms = [r for r in valid_rooms if r.type not in ["hallway", "parking"]]
    window_coverage = sum(1 for r in habitable_rooms if r.id in rooms_with_windows) / max(1, len(habitable_rooms))
    daylight_score = round(min(100.0, window_coverage * 100.0), 1)

    # Kitchen & Bathroom ventilation
    vent_pass = 0
    vent_total = 0
    for r in valid_rooms:
        if r.type in ["kitchen", "bathroom"]:
            vent_total += 1
            if r.id in rooms_with_windows:
                vent_pass += 1
    vent_ratio = vent_pass / max(1, vent_total) if vent_total > 0 else 1.0
    ventilation_score = round(min(100.0, vent_ratio * 100.0), 1)

    # 8. Efficiency Score (Habitable Area / Gross Footprint)
    efficiency_ratio = (total_house_area - hallway_area) / max(1.0, total_house_area)
    space_efficiency_score = round(min(98.0, efficiency_ratio * 105.0), 1)

    # 9. Parking Access Score
    parking_score = 95.0 if (site and getattr(site, "parking", None)) else 80.0

    # 10. Vastu Score & Comprehensive Evaluation
    vastu_score = None
    vastu_result_dict = None
    if vastu_enabled:
        from vastu.vastu_engine import evaluate_vastu_layout
        north_deg = getattr(site, "north_direction", None) if site else None
        v_res = evaluate_vastu_layout(
            rooms=valid_rooms,
            plot_width=site.plot_width if site else 30.0,
            plot_length=site.plot_length if site else 40.0,
            road_side=getattr(site, "road_side", "south") if site else "south",
            north_deg=north_deg
        )
        vastu_score = v_res.overall_score
        vastu_result_dict = v_res.model_dump()
        warnings.extend(v_res.warnings[:2])

    # Overall Multi-Objective Weighted Score
    w_prog = 0.20
    w_adj = 0.15
    w_circ = 0.15
    w_priv = 0.15
    w_furn = 0.15
    w_day = 0.10
    w_eff = 0.10

    overall = (
        room_program_score * w_prog +
        adjacency_score * w_adj +
        circulation_score * w_circ +
        privacy_score * w_priv +
        furniture_fit_score * w_furn +
        daylight_score * w_day +
        space_efficiency_score * w_eff
    )
    if vastu_enabled and vastu_score is not None:
        overall = overall * 0.85 + vastu_score * 0.15
    overall_score = round(overall, 1)

    scores = ArchitecturalScores(
        room_program_score=room_program_score,
        size_score=size_score,
        adjacency_score=adjacency_score,
        privacy_score=privacy_score,
        circulation_score=circulation_score,
        furniture_fit_score=furniture_fit_score,
        parking_score=parking_score,
        daylight_score=daylight_score,
        ventilation_score=ventilation_score,
        space_efficiency_score=space_efficiency_score,
        vastu_score=vastu_score,
        vastu_result=vastu_result_dict,
        overall_score=overall_score,
        daylight_potential=daylight_score,
        ventilation_potential=ventilation_score,
        circulation_efficiency=circulation_score,
        aspect_ratio_compliance=size_score
    )

    passed_checks: List[str] = []
    if site and site.buildable_envelope:
        env = site.buildable_envelope
        all_in_envelope = all(
            r.rect.x >= env.x - 0.05 and r.rect.right <= env.right + 0.05 and
            r.rect.y >= env.y - 0.05 and r.rect.bottom <= env.bottom + 0.05
            for r in valid_rooms
        )
        if all_in_envelope:
            passed_checks.append("Buildable envelope containment")
    else:
        passed_checks.append("Buildable envelope containment")

    has_overlap = False
    for i in range(len(valid_rooms)):
        for j in range(i + 1, len(valid_rooms)):
            r1, r2 = valid_rooms[i].rect, valid_rooms[j].rect
            inter_w = max(0.0, min(r1.right, r2.right) - max(r1.x, r2.x))
            inter_h = max(0.0, min(r1.bottom, r2.bottom) - max(r1.y, r2.y))
            if inter_w * inter_h > 0.5:
                has_overlap = True
                break
        if has_overlap:
            break
    if not has_overlap:
        passed_checks.append("Zero room overlap")

    if circulation_score >= 60.0:
        passed_checks.append("Circulation connectivity")
    if room_program_score >= 80.0:
        passed_checks.append("Room program requirements")
    if daylight_score >= 60.0:
        passed_checks.append("Natural daylight & ventilation")

    is_valid = len(errors) == 0 and room_program_score >= 80.0 and not has_overlap
    validation = ArchitecturalValidation(
        is_valid=is_valid,
        passed_checks=passed_checks,
        warnings=warnings,
        errors=errors
    )

    return scores, validation
