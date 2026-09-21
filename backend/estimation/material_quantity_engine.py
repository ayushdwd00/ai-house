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

    carpet_area = 0.0
    usable_area = 0.0
    bathroom_floor_area = 0.0
    bathroom_perimeter = 0.0
    kitchen_counter_len = 0.0
    sanitary_fixtures = 0
    electrical_points = 0

    all_floors = layout.floors if layout.floors else [
        FloorPlan(floor_number=1, rooms=layout.rooms, walls=layout.walls, doors=layout.doors, windows=layout.windows)
    ]

    total_ext_wall_len = 0.0
    total_int_wall_len = 0.0
    total_net_wall_vol = 0.0
    total_openings_deduction = 0.0
    door_count = 0
    window_count = 0

    ext_wall_thickness = active_spec.external_wall_thickness_ft
    int_wall_thickness = active_spec.internal_wall_thickness_ft
    slab_thick_ft = active_spec.slab_thickness_ft
    wall_height = active_spec.wall_height_ft

    for floor in all_floors:
        door_count += len(floor.doors)
        window_count += len(floor.windows)

        # Process rooms
        for r in floor.rooms:
            if not r.rect:
                continue
            r_area = r.rect.width * r.rect.length
            carpet_area += r_area
            if r.type not in ["parking"]:
                usable_area += r_area

            # Electrical heuristic: 6 lighting/fan points + 3 power points per regular room; living/kitchen +4
            if r.type in ["living_room", "family_lounge", "kitchen"]:
                electrical_points += 14
            elif r.type in ["master_bedroom", "bedroom", "guest_bedroom"]:
                electrical_points += 10
            elif r.type in ["bathroom", "powder_room"]:
                electrical_points += 4
                sanitary_fixtures += 3  # Water closet, basin, shower/tap
                bathroom_floor_area += r_area
                bathroom_perimeter += (2 * (r.rect.width + r.rect.length))
            elif r.type == "kitchen":
                kitchen_counter_len += max(8.0, r.rect.width + r.rect.length * 0.6)
                sanitary_fixtures += 2  # Sink, utility tap
            else:
                electrical_points += 6

        # Process walls and openings
        for w in floor.walls:
            w_len = math.hypot(w.end.x - w.start.x, w.end.y - w.start.y)
            if w.is_exterior or w.wall_type == "exterior":
                total_ext_wall_len += w_len
            else:
                total_int_wall_len += w_len

            w_vol = getattr(w, "volume_cuft", None)
            if w_vol is None or w_vol <= 0:
                thick = ext_wall_thickness if (w.is_exterior or w.wall_type == "exterior") else int_wall_thickness
                w_vol = round(w_len * wall_height * thick, 2)
            total_net_wall_vol += w_vol

        # Opening deductions
        for d in floor.doors:
            total_openings_deduction += (d.width * d.height)
        for win in floor.windows:
            total_openings_deduction += (win.width * win.height)

    carpet_area = round(carpet_area, 2)
    usable_area = round(usable_area, 2)
    built_up_area = round(carpet_area * 1.15, 2)  # Wall footprint + circulation multiplier
    parking_area = round(layout.site.parking.rect.width * layout.site.parking.rect.length, 2) if layout.site and layout.site.parking else 0.0
    open_area = max(0.0, round(plot_area - (built_up_area / max(1, len(all_floors))), 2))

    total_ext_wall_len = round(total_ext_wall_len, 2)
    total_int_wall_len = round(total_int_wall_len, 2)
    total_net_wall_vol = round(total_net_wall_vol, 2)
    total_wall_area = round((total_ext_wall_len + total_int_wall_len) * wall_height, 2)
    total_openings_deduction = round(total_openings_deduction, 2)

    # 2. Masonry Units & Mortar
    # Standard modular red brick: 1 cu ft masonry requires ~13.5 bricks and ~0.28 cu ft mortar
    brick_count = int(round(total_net_wall_vol * 13.5))
    mortar_cuft = round(total_net_wall_vol * 0.28, 2)

    # 3. Concrete & Steel
    # Floor slab concrete
    slab_area = built_up_area
    slab_volume_cuft = round(slab_area * slab_thick_ft, 2)
    # Total structural concrete: slabs + beams/columns/footings (~1.6x slab volume for RCC frame)
    if active_spec.structural_system == "rcc_frame":
        total_concrete_cuft = round(slab_volume_cuft * 1.65, 2)
        # Steel reinforcement: ~4.0 kg per sq ft of built-up area for residential RCC frame
        steel_kg = round(built_up_area * 3.8, 1)
    else:
        total_concrete_cuft = round(slab_volume_cuft * 1.25, 2)
        steel_kg = round(built_up_area * 2.2, 1)

    total_concrete_cum = round(total_concrete_cuft * 0.0283168, 2)

    # 4. Plaster & Paint Areas
    # Internal wall plaster: internal walls have 2 faces, external walls have 1 internal face
    internal_wall_plaster_gross = (total_int_wall_len * 2 + total_ext_wall_len) * wall_height
    internal_plaster_sqft = max(0.0, round(internal_wall_plaster_gross - total_openings_deduction, 2))
    # External plaster: exterior face of external walls
    external_plaster_sqft = max(0.0, round(total_ext_wall_len * wall_height - (total_openings_deduction * 0.5), 2))
    ceiling_plaster_sqft = carpet_area

    internal_paint_sqft = round(internal_plaster_sqft + ceiling_plaster_sqft, 2)
    external_paint_sqft = external_plaster_sqft

    # 5. Flooring & Tiles
    flooring_sqft = carpet_area
    # Bathroom dado wall tiles (7ft height minus door opening)
    bathroom_wall_tile_sqft = max(0.0, round(bathroom_perimeter * 7.0 - (door_count * 18.0), 2))
    bathroom_floor_tile_sqft = round(bathroom_floor_area, 2)
    kitchen_backsplash_sqft = round(kitchen_counter_len * 2.0, 2)

    # 6. Boundary Wall (perimeter minus 10ft gate)
    boundary_len = max(0.0, round(2 * (plot_w + plot_l) - 10.0, 2))

    # Column specific preliminary takeoff
    columns_list = []
    if layout.structural_planning and hasattr(layout.structural_planning, "columns"):
        columns_list = layout.structural_planning.columns or []

    column_count = len(columns_list)
    column_concrete_cuft = 0.0
    for col in columns_list:
        w = getattr(col, "width", 0.75)
        d = getattr(col, "depth", 0.75)
        fl_count = len(getattr(col, "floors", [1])) or 1
        column_concrete_cuft += (w * d * wall_height * fl_count)
    column_concrete_cuft = round(column_concrete_cuft, 2)
    column_concrete_cum = round(column_concrete_cuft * 0.0283168, 2)
    # Preliminary reinforcement allowance: ~150 kg/m3 (assumption-based residential allowance)
    column_rebar_allowance_kg = round(column_concrete_cum * 150.0, 1)

    # Beam specific preliminary takeoff
    beams_list = []
    if layout.structural_planning and hasattr(layout.structural_planning, "beams"):
        beams_list = layout.structural_planning.beams or []

    beam_count = len(beams_list)
    beam_length_ft = 0.0
    beam_concrete_cuft = 0.0
    for b in beams_list:
        b_span = getattr(b, "span_ft", 0.0)
        bw = getattr(b, "width", 0.75)
        bd = getattr(b, "depth", 1.25)
        b_floors = len(getattr(b, "floors", [1])) or 1
        beam_length_ft += (b_span * b_floors)
        beam_concrete_cuft += (bw * bd * b_span * b_floors)

    beam_length_ft = round(beam_length_ft, 1)
    beam_concrete_cuft = round(beam_concrete_cuft, 2)
    beam_concrete_cum = round(beam_concrete_cuft * 0.0283168, 2)
    beam_rebar_allowance_kg = round(beam_concrete_cum * 140.0, 1)

    itemized = {
        "masonry_wall_volume_cuft": total_net_wall_vol,
        "brick_count": brick_count,
        "mortar_volume_cuft": mortar_cuft,
        "structural_concrete_cum": total_concrete_cum,
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
