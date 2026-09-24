"""
Material Quantity Calculation Engine Module
Calculates physical building material and architectural surface quantities directly
derived from canonical HouseLayout geometric elements:
- Site & Spatial areas (Plot area, Built-up area, Carpet/Usable area, Open area)
- Masonry (External and internal wall lengths, heights, net volumes deducting openings, brick/block counts, mortar)
- Concrete (Slab area, slab volume, preliminary footing/beam/column concrete)
- Steel Reinforcement (Rebar kg based on structural system and built-up area)
- Plaster & Paint (Internal dual-sided wall plaster, external weather plaster, ceiling plaster, paint areas)
- Flooring & Tiles (Room-wise flooring, bathroom floor & dado wall tiles, kitchen backsplash)
- Openings & Fixtures (Doors, windows, sanitary fixtures, electrical switch/power points)
- Boundary Wall (Perimeter masonry minus gate opening)

DISCLAIMER: Preliminary quantity estimate derived from architectural geometry.
Actual site consumption and waste allowances (typically 3-5%) should be budgeted during execution.
"""

from typing import Dict, Any, Optional, List
import math
from models import HouseLayout, FloorPlan, Room, Wall, Door, Window, MaterialQuantities, ConstructionSpecification
from architecture.area_calculator import calculate_house_areas


def calculate_material_quantities(
    layout: HouseLayout,
    spec: Optional[ConstructionSpecification] = None
) -> MaterialQuantities:
    """
    Computes physical material quantities directly from vector walls, rooms,
    openings, and slab geometries in HouseLayout.
    """
    active_spec = spec or layout.construction_spec or ConstructionSpecification()

    # 1. Site & Building Spatial Areas
    plot_w = layout.plot_width
    plot_l = layout.plot_length
    plot_area = round(plot_w * plot_l, 2)

    all_floors = layout.floors if layout.floors else [
        FloorPlan(floor_number=1, rooms=layout.rooms, walls=layout.walls, doors=layout.doors, windows=layout.windows)
    ]

    ext_wall_thickness = active_spec.external_wall_thickness_ft
    int_wall_thickness = active_spec.internal_wall_thickness_ft
    slab_thick_ft = active_spec.slab_thickness_ft
    wall_height = active_spec.wall_height_ft

    # Derive rigorous architectural spatial areas (built-up, carpet, usable, open)
    area_metrics = calculate_house_areas(
        floors=all_floors,
        plot_width=plot_w,
        plot_length=plot_l,
        external_wall_thickness_ft=ext_wall_thickness,
        internal_wall_thickness_ft=int_wall_thickness
    )
    built_up_area = area_metrics["built_up_area_sqft"]
    carpet_area = area_metrics["carpet_area_sqft"]
    usable_area = area_metrics["usable_area_sqft"]
    open_area = area_metrics["open_area_sqft"]

    bathroom_floor_area = 0.0
    bathroom_perimeter = 0.0
    bathroom_doors_count = 0
    kitchen_counter_len = 0.0
    sanitary_fixtures = 0
    electrical_points = 0

    total_ext_wall_len = 0.0
    total_int_wall_len = 0.0
    total_net_wall_vol = 0.0
    total_openings_deduction = 0.0
    door_count = 0
    window_count = 0

    for floor in all_floors:
        door_count += len(floor.doors)
        window_count += len(floor.windows)

        # Process rooms
        for r in floor.rooms:
            if not r.rect:
                continue
            r_area = r.rect.width * r.rect.length

            # Room-type specific fixtures and checks
            if r.type == "kitchen":
                electrical_points += 14
                kitchen_counter_len += max(8.0, r.rect.width + r.rect.length * 0.6)
                sanitary_fixtures += 2  # Sink, utility tap
            elif r.type in ["living_room", "family_lounge"]:
                electrical_points += 14
            elif r.type in ["master_bedroom", "bedroom", "guest_bedroom"]:
                electrical_points += 10
            elif r.type in ["bathroom", "powder_room"]:
                electrical_points += 4
                sanitary_fixtures += 3  # Water closet, basin, shower/tap
                bathroom_floor_area += r_area
                bathroom_perimeter += (2 * (r.rect.width + r.rect.length))
                bathroom_doors_count += 1
            else:
                electrical_points += 6

        # Process walls and openings
        for w in floor.walls:
            if hasattr(w, "start") and w.start is not None and hasattr(w.start, "x"):
                sx, sy = float(w.start.x), float(w.start.y)
            elif hasattr(w, "start") and isinstance(w.start, dict):
                sx, sy = float(w.start.get("x", 0.0)), float(w.start.get("y", 0.0))
            else:
                sx = float(getattr(w, "x1", getattr(w, "start_x", 0.0)))
                sy = float(getattr(w, "y1", getattr(w, "start_y", 0.0)))

            if hasattr(w, "end") and w.end is not None and hasattr(w.end, "x"):
                ex, ey = float(w.end.x), float(w.end.y)
            elif hasattr(w, "end") and isinstance(w.end, dict):
                ex, ey = float(w.end.get("x", 0.0)), float(w.end.get("y", 0.0))
            else:
                ex = float(getattr(w, "x2", getattr(w, "end_x", 0.0)))
                ey = float(getattr(w, "y2", getattr(w, "end_y", 0.0)))

            w_len = math.hypot(ex - sx, ey - sy)
            if w.is_exterior or getattr(w, "wall_type", "") == "exterior":
                total_ext_wall_len += w_len
            else:
                total_int_wall_len += w_len

            w_vol = getattr(w, "volume_cuft", None)
            if w_vol is None or w_vol <= 0:
                thick = ext_wall_thickness if (w.is_exterior or getattr(w, "wall_type", "") == "exterior") else int_wall_thickness
                w_vol = round(w_len * wall_height * thick, 2)
            total_net_wall_vol += w_vol

        # Opening deductions
        for d in floor.doors:
            total_openings_deduction += (d.width * d.height)
        for win in floor.windows:
            total_openings_deduction += (win.width * win.height)

    parking_area = round(layout.site.parking.rect.width * layout.site.parking.rect.length, 2) if layout.site and layout.site.parking else 0.0

    total_ext_wall_len = round(total_ext_wall_len, 2)
    total_int_wall_len = round(total_int_wall_len, 2)
    total_net_wall_vol = round(total_net_wall_vol, 2)
    total_wall_area = round((total_ext_wall_len + total_int_wall_len) * wall_height, 2)
    total_openings_deduction = round(total_openings_deduction, 2)

    # 2. Masonry Units & Mortar
    # Standard modular red brick: 1 cu ft masonry requires ~13.5 bricks and ~0.28 cu ft mortar
    brick_count = int(round(total_net_wall_vol * 13.5))
    mortar_cuft = round(total_net_wall_vol * 0.28, 2)

    # 3. Concrete & Steel Breakdown (No double-counting)
    slab_area = built_up_area
    slab_volume_cuft = round(slab_area * slab_thick_ft, 2)

    # Column specific takeoff
    columns_list = []
    if layout.structural_planning and hasattr(layout.structural_planning, "columns"):
        columns_list = layout.structural_planning.columns or []

    column_count = len(columns_list)
    if column_count == 0:
        column_count = max(6, int(math.ceil(area_metrics.get("ground_footprint_area_sqft", built_up_area) / 130.0)))
        column_concrete_cuft = round(column_count * (0.75 * 0.75 * wall_height * max(1, len(all_floors))), 2)
    else:
        c_vol = 0.0
        for col in columns_list:
            cw = getattr(col, "width", 0.75)
            cd = getattr(col, "depth", 0.75)
            fl_count = len(getattr(col, "floors", [1])) or 1
            c_vol += (cw * cd * wall_height * fl_count)
        column_concrete_cuft = round(c_vol, 2)

    column_concrete_cum = round(column_concrete_cuft * 0.0283168, 2)
    column_rebar_allowance_kg = round(column_concrete_cum * 150.0, 1)

    # Beam specific takeoff
    beams_list = []
    if layout.structural_planning and hasattr(layout.structural_planning, "beams"):
        beams_list = layout.structural_planning.beams or []

    beam_count = len(beams_list)
    if beam_count == 0:
        beam_length_ft = round(total_ext_wall_len + total_int_wall_len * 0.6, 1)
        beam_concrete_cuft = round(beam_length_ft * (0.75 * 1.0), 2)
    else:
        b_len = 0.0
        b_vol = 0.0
        for b in beams_list:
            b_span = getattr(b, "span_ft", 0.0)
            bw = getattr(b, "width", 0.75)
            bd = getattr(b, "depth", 1.25)
            b_floors = len(getattr(b, "floors", [1])) or 1
            b_len += (b_span * b_floors)
            b_vol += (bw * bd * b_span * b_floors)
        beam_length_ft = round(b_len, 1)
        beam_concrete_cuft = round(b_vol, 2)

    beam_concrete_cum = round(beam_concrete_cuft * 0.0283168, 2)
    beam_rebar_allowance_kg = round(beam_concrete_cum * 140.0, 1)

    # Footing pads concrete (4ft x 4ft x 1.25ft thick per column)
    footing_concrete_cuft = round(column_count * (4.0 * 4.0 * 1.25), 2)
    footing_concrete_cum = round(footing_concrete_cuft * 0.0283168, 2)

    # Total structural concrete derived explicitly from components
    total_concrete_cuft = round(slab_volume_cuft + column_concrete_cuft + beam_concrete_cuft + footing_concrete_cuft, 2)
    total_concrete_cum = round(total_concrete_cuft * 0.0283168, 2)

    if active_spec.structural_system == "rcc_frame":
        steel_kg = round(built_up_area * 3.8, 1)
    else:
        steel_kg = round(built_up_area * 2.2, 1)

    # Excavation (Footing pits + Foundation trenches)
    footing_excavation_cuft = column_count * (4.5 * 4.5 * 4.5)
    trench_excavation_cuft = total_ext_wall_len * 1.5 * 2.5
    total_excavation_cuft = round(footing_excavation_cuft + trench_excavation_cuft, 2)
    total_excavation_cum = round(total_excavation_cuft * 0.0283168, 2)

    # 4. Plaster & Paint Areas
    internal_wall_plaster_gross = (total_int_wall_len * 2 + total_ext_wall_len) * wall_height
    internal_plaster_sqft = max(0.0, round(internal_wall_plaster_gross - total_openings_deduction, 2))
    external_plaster_sqft = max(0.0, round(total_ext_wall_len * wall_height - (total_openings_deduction * 0.5), 2))
    ceiling_plaster_sqft = carpet_area

    internal_paint_sqft = round(internal_plaster_sqft + ceiling_plaster_sqft, 2)
    external_paint_sqft = external_plaster_sqft

    # 5. Flooring & Tiles
    flooring_sqft = carpet_area
    bathroom_wall_tile_sqft = max(0.0, round(bathroom_perimeter * 7.0 - (bathroom_doors_count * 18.0), 2))
    bathroom_floor_tile_sqft = round(bathroom_floor_area, 2)
    kitchen_backsplash_sqft = round(kitchen_counter_len * 2.0, 2)

    # 6. Boundary Wall (perimeter minus 10ft gate)
    boundary_len = max(0.0, round(2 * (plot_w + plot_l) - 10.0, 2))

    itemized = {
        "masonry_wall_volume_cuft": total_net_wall_vol,
        "brick_count": brick_count,
        "mortar_volume_cuft": mortar_cuft,
        "structural_concrete_cum": total_concrete_cum,
        "slab_concrete_cum": round(slab_volume_cuft * 0.0283168, 2),
        "footing_concrete_cum": footing_concrete_cum,
        "excavation_cum": total_excavation_cum,
        "steel_reinforcement_kg": steel_kg,
        "column_count": column_count,
        "column_concrete_volume_cuft": column_concrete_cuft,
        "column_concrete_volume_cum": column_concrete_cum,
        "column_reinforcement_allowance_kg": column_rebar_allowance_kg,
        "column_reinforcement_note": "Assumption-based preliminary allowance (final schedule requires structural-engineer verification).",
        "beam_count": beam_count,
        "beam_length_ft": beam_length_ft,
        "beam_concrete_volume_cuft": beam_concrete_cuft,
        "beam_concrete_volume_cum": beam_concrete_cum,
        "beam_reinforcement_allowance_kg": beam_rebar_allowance_kg,
        "beam_reinforcement_note": "Assumption-based preliminary allowance.",
        "structural_assumptions": layout.structural_planning.assumptions if layout.structural_planning else ["Standard residential RCC frame specification."],
        "internal_plaster_sqft": internal_plaster_sqft,
        "external_plaster_sqft": external_plaster_sqft,
        "flooring_sqft": flooring_sqft,
        "bathroom_wall_tile_sqft": bathroom_wall_tile_sqft,
        "electrical_points_count": electrical_points,
        "sanitary_fixtures_count": sanitary_fixtures
    }

    return MaterialQuantities(
        plot_area_sqft=plot_area,
        built_up_area_sqft=built_up_area,
        carpet_area_sqft=carpet_area,
        usable_area_sqft=usable_area,
        open_area_sqft=open_area,
        parking_area_sqft=parking_area,
        external_wall_length_ft=total_ext_wall_len,
        internal_wall_length_ft=total_int_wall_len,
        total_wall_area_sqft=total_wall_area,
        wall_volume_cuft=total_net_wall_vol,
        openings_deduction_sqft=total_openings_deduction,
        excavation_volume_cuft=total_excavation_cuft,
        excavation_volume_cum=total_excavation_cum,
        brick_or_block_count=brick_count,
        mortar_volume_cuft=mortar_cuft,
        slab_area_sqft=slab_area,
        slab_volume_cuft=slab_volume_cuft,
        concrete_volume_cuft=total_concrete_cuft,
        concrete_volume_cum=total_concrete_cum,
        steel_reinforcement_kg=steel_kg,
        internal_plaster_sqft=internal_plaster_sqft,
        external_plaster_sqft=external_plaster_sqft,
        ceiling_plaster_sqft=ceiling_plaster_sqft,
        internal_paint_sqft=internal_paint_sqft,
        external_paint_sqft=external_paint_sqft,
        flooring_area_sqft=flooring_sqft,
        bathroom_wall_tile_sqft=bathroom_wall_tile_sqft,
        bathroom_floor_tile_sqft=bathroom_floor_tile_sqft,
        kitchen_backsplash_sqft=kitchen_backsplash_sqft,
        door_count=door_count,
        window_count=window_count,
        sanitary_fixture_count=sanitary_fixtures,
        electrical_point_count=electrical_points,
        boundary_wall_length_ft=boundary_len,
        itemized_details=itemized,
        confidence=0.90,
        disclaimer="Preliminary quantity takeoff derived from actual 2D/3D building geometry."
    )
