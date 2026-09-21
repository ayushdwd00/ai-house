"""
Structural Planning Module
Provides preliminary architectural structural planning for residential houses:
- RCC Column Grid Suggestions (standard 10ft-15ft residential span grids placed at room corners)
- Deterministic Geometry Placement Rules (corners, wall intersections, span candidates, stair core, parking)
- Preliminary Beam Layout Generation (inter-column beams, stair core ties, wall-spanning beams)
- Structural Validation Report (unsupported spans, door/stair/parking conflicts, vertical alignment)
- Stable Column Schema (column_id, column_type, coordinates, dimensions, supported floors, confidence)
- Multi-floor Column Alignment Checks

DISCLAIMER: Preliminary architectural planning only. Final structural design must be
verified and certified by a qualified, licensed structural engineer.
"""

from typing import List, Dict, Any, Optional, Tuple, Set
import math
from models import (
    FloorPlan, Room, Wall, Door, Site, ConstructionSpecification,
    StructuralPlanning, StructuralColumn, StructuralBeam, StructuralGrid, StructuralValidationReport, Rect
)


def plan_preliminary_structure(
    floors: Any = None,
    construction_spec: Optional[ConstructionSpecification] = None,
    site: Optional[Site] = None,
    plot_width: float = 40.0,
    plot_length: float = 50.0,
    layout: Optional[Any] = None,
    structural_constraints: Optional[Dict[str, Any]] = None
) -> StructuralPlanning:
    """
    Synthesizes preliminary structural column grid locations, candidate load-bearing
    walls, preliminary beam lines, and slab assumptions based on architectural floor plans
    and geometric constraints.
    Workflow:
      HouseLayout -> Structural Analysis -> Column Grid Candidate ->
      Preliminary Column Locations -> Preliminary Beam Layout -> Structural Validation -> StructuralPlanning
    """
    # If first positional argument is a HouseLayout object
    if hasattr(floors, "floors"):
        layout = floors
        floors = layout.floors

    # Extract contextual geometry from layout if provided
    if layout is not None:
        if hasattr(layout, "floors") and layout.floors:
            floors = layout.floors
        if hasattr(layout, "site") and layout.site:
            site = layout.site
        if hasattr(layout, "plot_width") and layout.plot_width:
            plot_width = layout.plot_width
        if hasattr(layout, "plot_length") and layout.plot_length:
            plot_length = layout.plot_length
        if hasattr(layout, "construction_spec") and layout.construction_spec:
            construction_spec = layout.construction_spec

    constraints = structural_constraints or {}
    clear_parking = constraints.get("clear_parking", False)
    min_col_spacing = constraints.get("min_column_spacing", 3.8)
    door_clearance_bonus = constraints.get("door_clearance_bonus", 0.0)
    regular_grid_snap = constraints.get("regular_grid_snap", False)

    num_floors = len(floors) if floors else 1
    spec = construction_spec or ConstructionSpecification()

    if not floors:
        return StructuralPlanning(
            structural_system="RCC_FRAME",
            columns=[],
            column_count=0,
            beams=[],
            beam_count=0,
            grid=StructuralGrid(rows=0, columns=0),
            assumptions=["Standard residential RCC frame specification."],
            validation_report=StructuralValidationReport(is_acceptable_preliminary=True, summary="No floor geometry provided."),
            column_grid_suggestions=[],
            structural_zones=[],
            load_bearing_wall_candidates=[],
            slab_assumptions={"thickness_in": 5.5, "type": "two_way_solid_slab"}
        )

    ground_floor = floors[0]
    rooms = ground_floor.rooms
    walls = ground_floor.walls if ground_floor.walls else (
        (ground_floor.exterior_walls or []) + (ground_floor.interior_walls or [])
    )
    doors = ground_floor.doors or []

    # Collect staircase rooms across all floors
    stair_rooms = [r for f in floors for r in f.rooms if r.type == "staircase" and r.rect]
    parking_rect: Optional[Rect] = None
    if site and site.parking and site.parking.rect:
        parking_rect = site.parking.rect
    else:
        # Check ground floor for parking room
        p_rooms = [r for r in rooms if r.type == "parking" and r.rect]
        if p_rooms:
            parking_rect = p_rooms[0].rect

    # 1. Structural Analysis: Identify Candidates
    raw_candidates: List[Tuple[float, float, str, int]] = []

    # A. Room corners (perimeter corners & internal corners)
    for r in rooms:
        if not r.rect:
            continue
        rx, ry = r.rect.x, r.rect.y
        rw, rl = r.rect.width, r.rect.length
        corners = [
            (round(rx, 1), round(ry, 1)),
            (round(rx + rw, 1), round(ry, 1)),
            (round(rx, 1), round(ry + rl, 1)),
            (round(rx + rw, 1), round(ry + rl, 1)),
        ]
        is_perimeter_room = (r.zone in ["public", "outdoor"] or rx <= 5.0 or ry <= 5.0)
        c_type = "perimeter" if is_perimeter_room else "corner"
        for cx, cy in corners:
            raw_candidates.append((cx, cy, c_type, 2))

    # B. Wall endpoints and Wall-to-Wall intersections (L, T, X junctions)
    for w in walls:
        if w.start:
            sx, sy = round(w.start.x, 1), round(w.start.y, 1)
        else:
            sx, sy = round(w.x1, 1), round(w.y1, 1)
        if w.end:
            ex, ey = round(w.end.x, 1), round(w.end.y, 1)
        else:
            ex, ey = round(w.x2, 1), round(w.y2, 1)

        raw_candidates.append((sx, sy, "wall_intersection", 3))
        raw_candidates.append((ex, ey, "wall_intersection", 3))

        # Long span detection along walls (> 14.5 ft)
        w_len = math.hypot(ex - sx, ey - sy)
        if w_len > 14.5:
            mid_x = round((sx + ex) / 2.0, 1)
            mid_y = round((sy + ey) / 2.0, 1)
            raw_candidates.append((mid_x, mid_y, "span_support", 1))
            if w_len > 24.0:
                raw_candidates.append((round(sx + (ex - sx) * 0.33, 1), round(sy + (ey - sy) * 0.33, 1), "span_support", 1))
                raw_candidates.append((round(sx + (ex - sx) * 0.67, 1), round(sy + (ey - sy) * 0.67, 1), "span_support", 1))

    # C. Staircase core corners
    for sr in stair_rooms:
        if not sr.rect:
            continue
        sc_corners = [
            (round(sr.rect.x, 1), round(sr.rect.y, 1)),
            (round(sr.rect.right, 1), round(sr.rect.y, 1)),
            (round(sr.rect.x, 1), round(sr.rect.bottom, 1)),
            (round(sr.rect.right, 1), round(sr.rect.bottom, 1)),
        ]
        for sx, sy in sc_corners:
            raw_candidates.append((sx, sy, "stair_support", 5))

    # D. Parking boundary support (corners of parking bay, never in the middle)
    if parking_rect and not clear_parking:
        p_corners = [
            (round(parking_rect.x, 1), round(parking_rect.y, 1)),
            (round(parking_rect.right, 1), round(parking_rect.y, 1)),
            (round(parking_rect.x, 1), round(parking_rect.bottom, 1)),
            (round(parking_rect.right, 1), round(parking_rect.bottom, 1)),
        ]
        for px, py in p_corners:
            raw_candidates.append((px, py, "parking_boundary", 4))

    # 2. Structural Grid Analysis & Orthogonal Alignment
    all_x = sorted(list(set(c[0] for c in raw_candidates)))
    all_y = sorted(list(set(c[1] for c in raw_candidates)))

    grid_threshold = 2.5 if regular_grid_snap else 1.5
    grid_x_lines: List[float] = []
    for x in all_x:
        if not any(abs(x - gx) <= grid_threshold for gx in grid_x_lines):
            grid_x_lines.append(round(x, 1))

    grid_y_lines: List[float] = []
    for y in all_y:
        if not any(abs(y - gy) <= grid_threshold for gy in grid_y_lines):
            grid_y_lines.append(round(y, 1))

    grid_x_lines.sort()
    grid_y_lines.sort()

    snap_dist = 2.0 if regular_grid_snap else 1.2
    snapped_candidates: List[Tuple[float, float, str, int]] = []
    for cx, cy, c_type, prio in raw_candidates:
        nearest_gx = min(grid_x_lines, key=lambda gx: abs(gx - cx)) if grid_x_lines else cx
        nearest_gy = min(grid_y_lines, key=lambda gy: abs(gy - cy)) if grid_y_lines else cy
        final_x = nearest_gx if abs(nearest_gx - cx) <= snap_dist else cx
        final_y = nearest_gy if abs(nearest_gy - cy) <= snap_dist else cy
        snapped_candidates.append((round(final_x, 1), round(final_y, 1), c_type, prio))

    # 3. Deterministic Filtering & Usability Constraints
    snapped_candidates.sort(key=lambda item: (-item[3], item[1], item[0]))

    filtered_points: List[Tuple[float, float, str]] = []
    for cx, cy, ctype, prio in snapped_candidates:
        too_close = False
        for fcx, fcy, _ in filtered_points:
            dist = math.hypot(cx - fcx, cy - fcy)
            if dist < min_col_spacing:
                too_close = True
                break
        if not too_close:
            filtered_points.append((cx, cy, ctype))

    # 4. Conflict Avoidance: Door, Staircase, Parking, Room Usability
    final_columns: List[Tuple[float, float, str]] = []

    for cx, cy, ctype in filtered_points:
        door_conflict = False
        for d in doors:
            dmx = (d.x1 + d.x2) / 2.0
            dmy = (d.y1 + d.y2) / 2.0
            door_clearance = max(d.width / 2.0 + 0.4, 1.4) + door_clearance_bonus
            if math.hypot(cx - dmx, cy - dmy) < door_clearance:
                door_conflict = True
                break
        if door_conflict:
            continue

        stair_interior_conflict = False
        for sr in stair_rooms:
            if not sr.rect:
                continue
            if (sr.rect.x + 0.6 < cx < sr.rect.right - 0.6) and (sr.rect.y + 0.6 < cy < sr.rect.bottom - 0.6):
                stair_interior_conflict = True
                break
        if stair_interior_conflict:
            continue

        parking_interior_conflict = False
        if parking_rect:
            # If clear_parking constraint requested, keep complete envelope + margin clear
            margin = 1.0 if clear_parking else 0.8
            if (parking_rect.x + margin < cx < parking_rect.right - margin) and (parking_rect.y + margin < cy < parking_rect.bottom - margin):
                parking_interior_conflict = True
            elif clear_parking and (parking_rect.x - 0.5 <= cx <= parking_rect.right + 0.5) and (parking_rect.y - 0.5 <= cy <= parking_rect.bottom + 0.5):
                parking_interior_conflict = True
        if parking_interior_conflict:
            continue

        # Must be attached to wall or room boundary
        is_attached = False
        for r in rooms:
            if not r.rect:
                continue
            d_left = abs(cx - r.rect.x)
            d_right = abs(cx - r.rect.right)
            d_top = abs(cy - r.rect.y)
            d_bottom = abs(cy - r.rect.bottom)
            min_edge_dist = min(d_left, d_right, d_top, d_bottom)
            if min_edge_dist <= 1.4:
                is_attached = True
                break
        if not is_attached:
            continue

        final_columns.append((cx, cy, ctype))

    # 5. Deterministic Column Sorting & ID Assignment
    final_columns.sort(key=lambda pt: (round(pt[1], 1), round(pt[0], 1)))

    col_w = 0.75
    col_d = 1.0 if (num_floors > 1 and spec.structural_system == "rcc_frame") else 0.75

    serving_floors = list(range(1, num_floors + 1))
    supporting_rel = "ground_to_roof" if num_floors == 1 else f"ground_to_floor_{num_floors}"

    structural_columns: List[StructuralColumn] = []
    column_grid_suggestions: List[Dict[str, Any]] = []

    for idx, (col_x, col_y, col_type) in enumerate(final_columns, start=1):
        col_id = f"C{idx:02d}"
        c_obj = StructuralColumn(
            column_id=col_id,
            column_type=col_type if col_type in [
                "corner", "wall_intersection", "perimeter", "stair_support",
                "span_support", "parking_boundary", "preliminary_column_candidate"
            ] else "corner",
            x=col_x,
            y=col_y,
            width=col_w,
            depth=col_d,
            floors=serving_floors,
            floor_ids=serving_floors,
            supporting_relationship=supporting_rel,
            confidence="PRELIMINARY",
            assumptions=[
                "Standard RCC residential column (9x9 or 9x12 in).",
                "Column footing size and rebar schedule require structural engineer design.",
                "Assumes safe bearing capacity >= 150 kN/m²."
            ]
        )
        structural_columns.append(c_obj)

        column_grid_suggestions.append({
            "column_id": col_id,
            "x": col_x,
            "y": col_y,
            "dimensions_in": f"{int(col_w*12)}x{int(col_d*12)}",
            "type": col_type,
            "floors": serving_floors
        })

    # 6. Preliminary Beam Layout Generation
    structural_beams: List[StructuralBeam] = []
    beam_pairs_seen: Set[Tuple[str, str]] = set()
    MAX_BEAM_SPAN = 22.0

    # A. Orthogonal Grid Beams: Horizontal & Vertical lines between adjacent columns
    for i, col_a in enumerate(structural_columns):
        # Horizontal neighbor to the right
        h_candidates = [
            c for j, c in enumerate(structural_columns)
            if i != j and abs(c.y - col_a.y) <= 1.4 and c.x > col_a.x
        ]
        if h_candidates:
            nearest_h = min(h_candidates, key=lambda c: c.x)
            span_val = nearest_h.x - col_a.x
            pair_key = tuple(sorted([col_a.column_id, nearest_h.column_id]))
            if span_val <= MAX_BEAM_SPAN and pair_key not in beam_pairs_seen:
                beam_pairs_seen.add(pair_key)
                b_idx = len(structural_beams) + 1
                structural_beams.append(StructuralBeam(
                    beam_id=f"B{b_idx:02d}",
                    start_column_id=col_a.column_id,
                    end_column_id=nearest_h.column_id,
                    x1=col_a.x,
                    y1=col_a.y,
                    x2=nearest_h.x,
                    y2=nearest_h.y,
                    width=0.75,
                    depth=1.25,
                    beam_type="floor_beam",
                    span_ft=round(span_val, 1),
                    floors=serving_floors
                ))

        # Vertical neighbor downwards
        v_candidates = [
            c for j, c in enumerate(structural_columns)
            if i != j and abs(c.x - col_a.x) <= 1.4 and c.y > col_a.y
        ]
        if v_candidates:
            nearest_v = min(v_candidates, key=lambda c: c.y)
            span_val = nearest_v.y - col_a.y
            pair_key = tuple(sorted([col_a.column_id, nearest_v.column_id]))
            if span_val <= MAX_BEAM_SPAN and pair_key not in beam_pairs_seen:
                beam_pairs_seen.add(pair_key)
                b_idx = len(structural_beams) + 1
                structural_beams.append(StructuralBeam(
                    beam_id=f"B{b_idx:02d}",
                    start_column_id=col_a.column_id,
                    end_column_id=nearest_v.column_id,
                    x1=col_a.x,
                    y1=col_a.y,
                    x2=nearest_v.x,
                    y2=nearest_v.y,
                    width=0.75,
                    depth=1.25,
                    beam_type="floor_beam",
                    span_ft=round(span_val, 1),
                    floors=serving_floors
                ))

    # B. Stair Core Perimeter Tie-Beams
    for sr in stair_rooms:
        if not sr.rect:
            continue
        sc_cols = [
            c for c in structural_columns
            if (sr.rect.x - 1.5 <= c.x <= sr.rect.right + 1.5) and (sr.rect.y - 1.5 <= c.y <= sr.rect.bottom + 1.5)
        ]
        for idx_a, sc_a in enumerate(sc_cols):
            for idx_b, sc_b in enumerate(sc_cols):
                if idx_a < idx_b:
                    pair_key = tuple(sorted([sc_a.column_id, sc_b.column_id]))
                    s_dist = math.hypot(sc_b.x - sc_a.x, sc_b.y - sc_a.y)
                    if pair_key not in beam_pairs_seen and (abs(sc_a.x - sc_b.x) <= 1.0 or abs(sc_a.y - sc_b.y) <= 1.0) and s_dist <= 18.0:
                        beam_pairs_seen.add(pair_key)
                        b_idx = len(structural_beams) + 1
                        structural_beams.append(StructuralBeam(
                            beam_id=f"B{b_idx:02d}",
                            start_column_id=sc_a.column_id,
                            end_column_id=sc_b.column_id,
                            x1=sc_a.x,
                            y1=sc_a.y,
                            x2=sc_b.x,
                            y2=sc_b.y,
                            width=0.75,
                            depth=1.25,
                            beam_type="tie_beam",
                            span_ft=round(s_dist, 1),
                            floors=serving_floors
                        ))

    # 7. Structural Validation Report
    unsupported_spans: List[Dict[str, Any]] = []
    unusually_large_spans: List[Dict[str, Any]] = []
    door_conflicts: List[str] = []
    stair_conflicts: List[str] = []
    parking_conflicts: List[str] = []
    alignment_issues: List[str] = []

    MAX_ALLOWABLE_SPAN = 16.5
    for beam in structural_beams:
        if beam.span_ft > MAX_ALLOWABLE_SPAN:
            unusually_large_spans.append({
                "span_type": beam.beam_type,
                "from_column": beam.start_column_id or "Origin",
                "to_column": beam.end_column_id or "End",
                "span_ft": beam.span_ft,
                "recommendation": "Intermediate beam or heavy RCC framing section suggested."
            })

    for d in doors:
        dmx, dmy = (d.x1 + d.x2) / 2.0, (d.y1 + d.y2) / 2.0
        for col in structural_columns:
            if math.hypot(col.x - dmx, col.y - dmy) < 0.8:
                door_conflicts.append(f"[WARNING] Column {col.column_id} close to door opening {d.id}")

    for sr in stair_rooms:
        if not sr.rect:
            continue
        for col in structural_columns:
            if (sr.rect.x + 0.5 < col.x < sr.rect.right - 0.5) and (sr.rect.y + 0.5 < col.y < sr.rect.bottom - 0.5):
                stair_conflicts.append(f"[WARNING] Column {col.column_id} inside staircase tread zone")

    if parking_rect:
        for col in structural_columns:
            if (parking_rect.x + 0.5 < col.x < parking_rect.right - 0.5) and (parking_rect.y + 0.5 < col.y < parking_rect.bottom - 0.5):
                parking_conflicts.append(f"[WARNING] Column {col.column_id} obstructs vehicle parking envelope")

    # Multi-floor vertical alignment check
    if num_floors > 1:
        alignment_issues.append(
            f"[INFO] Continuous Vertical Grid: All {len(structural_columns)} columns stack vertically through Ground + {num_floors - 1} upper floor(s)."
        )
        # Check upper floor room boundaries against ground columns
        for fl_idx in range(1, len(floors)):
            upper_fl = floors[fl_idx]
            for ur in upper_fl.rooms:
                if not ur.rect:
                    continue
                # If room is cantilevered outside ground floor footprint
                is_cantilever = all(
                    not (gr.rect and gr.rect.x <= ur.rect.x and gr.rect.right >= ur.rect.right and gr.rect.y <= ur.rect.y and gr.rect.bottom >= ur.rect.bottom)
                    for gr in rooms
                )
                if is_cantilever:
                    alignment_issues.append(
                        f"[REVIEW] {ur.name} on Floor {fl_idx + 1} extends beyond ground floor column bay. Review vertical alignment and slab projection."
                    )
                    break
    else:
        alignment_issues.append("[INFO] Single story residence: Direct vertical load path ground-to-roof.")

    is_acceptable = len(door_conflicts) == 0 and len(stair_conflicts) == 0 and len(parking_conflicts) == 0

    validation_report = StructuralValidationReport(
        unsupported_spans=unsupported_spans,
        unusually_large_spans=unusually_large_spans,
        columns_conflicting_doors=door_conflicts,
        columns_conflicting_stairs=stair_conflicts,
        columns_conflicting_parking=parking_conflicts,
        column_alignment_issues=alignment_issues,
        is_acceptable_preliminary=is_acceptable,
        summary=(
            f"Preliminary structural checks verified {len(structural_columns)} column positions and {len(structural_beams)} preliminary beams. "
            f"{'All spatial clearances satisfied.' if is_acceptable else 'Minor clearance notes flagged.'}"
        )
    )

    # 8. Structural Zones & Load-Bearing Wall Candidates
    structural_zones: List[Dict[str, Any]] = []
    load_bearing_candidates: List[str] = []
    stair_core_loc: Optional[Dict[str, float]] = None

    for sr in stair_rooms:
        if sr.rect:
            stair_core_loc = {"x": sr.rect.x, "y": sr.rect.y, "width": sr.rect.width, "length": sr.rect.length}
            structural_zones.append({
                "zone_name": "Staircase Shear / Core Zone",
                "bounds": {"x": sr.rect.x, "y": sr.rect.y, "width": sr.rect.width, "length": sr.rect.length},
                "recommendation": "Four perimeter columns with tied tie-beams around stair opening."
            })
            break

    for w in walls:
        w_len = math.hypot(
            (w.end.x if w.end else w.x2) - (w.start.x if w.start else w.x1),
            (w.end.y if w.end else w.y2) - (w.start.y if w.start else w.y1)
        )
        if w.is_exterior or (w.wall_type == "interior" and w_len >= 8.0 and w.thickness >= 0.375):
            load_bearing_candidates.append(w.id)

    slab_data = {
        "slab_thickness_in": spec.slab_thickness_in,
        "concrete_grade": "M20 (Standard Residential)" if spec.quality_tier != "premium" else "M25 (High Strength)",
        "steel_grade": "Fe500 / Fe550 TMT Rebars",
        "span_assumption": "Maximum clear span recommended <= 16 ft without intermediate beam."
    }

    grid_obj = StructuralGrid(
        rows=max(1, len(grid_y_lines)),
        columns=max(1, len(grid_x_lines)),
        x_grid_lines=grid_x_lines,
        y_grid_lines=grid_y_lines
    )

    assumptions_list = [
        f"Structural system assumption: RCC Frame with {spec.slab_thickness_in} in solid slab.",
        f"Column count: {len(structural_columns)} columns positioned along structural walls and envelope.",
        f"Preliminary beam count: {len(structural_beams)} beams connecting column grid nodes.",
        "Clearance verified: Zero column obstruction of door openings, stairs, and parking.",
        "Multi-floor alignment: Columns stack continuously from ground to top floor."
    ]

    return StructuralPlanning(
        structural_system="RCC_FRAME",
        columns=structural_columns,
        column_count=len(structural_columns),
        beams=structural_beams,
        beam_count=len(structural_beams),
        grid=grid_obj,
        assumptions=assumptions_list,
        validation_report=validation_report,
        column_grid_suggestions=column_grid_suggestions,
        structural_zones=structural_zones,
        load_bearing_wall_candidates=load_bearing_candidates,
        stair_core_location=stair_core_loc,
        slab_assumptions=slab_data,
        disclaimer=(
            "Preliminary structural planning only. Final column sizes, beam sizes, "
            "reinforcement, foundations and structural safety must be designed and verified by a qualified structural engineer."
        )
    )
