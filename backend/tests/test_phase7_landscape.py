"""
Phase 7 Tests: Landscape Engine
Covers:
1. Deterministic collision-free landscape synthesis (zero footprint or parking overlap)
2. Indian residential landscape use cases (Tulsi planter, kitchen garden, rainwater recharge)
3. Landscape natural-language refinement without altering room geometries
4. Integration with canonical HouseLayout
"""

import pytest
from shapely.geometry import box, MultiPolygon
from architecture.architectural_engine import generate_architectural_house_layout
from landscape.landscape_engine import generate_landscape_plan, refine_landscape_layout
from models import LandscapePreferences


def test_collision_free_landscape_synthesis():
    layout = generate_architectural_house_layout(
        plot_width=30.0,
        plot_length=50.0,
        bedrooms=3,
        bathrooms=2.0,
        num_floors=1,
        road_side="south",
        variant_seed=42
    )

    plan = generate_landscape_plan(layout, LandscapePreferences(style="traditional"))
    assert plan is not None
    assert len(plan.elements) > 0
    assert plan.total_green_area_sqft > 0

    # Build footprint polygon
    ground_rooms = layout.floors[0].rooms if layout.floors else layout.rooms
    footprint = MultiPolygon([box(r.rect.x, r.rect.y, r.rect.right, r.rect.bottom) for r in ground_rooms if r.rect]).buffer(0.01)

    parking_box = None
    if layout.site and layout.site.parking and layout.site.parking.rect:
        pr = layout.site.parking.rect
        parking_box = box(pr.x, pr.y, pr.right, pr.bottom).buffer(0.01)

    for elem in plan.elements:
        ex = float(getattr(elem, "x", 0.0) or 0.0)
        ey = float(getattr(elem, "y", 0.0) or 0.0)
        ew = float(getattr(elem, "width", 0.0) or 0.0)
        el = float(getattr(elem, "length", 0.0) or 0.0)
        rad = float(getattr(elem, "radius", 0.0) or 0.0)

        if ew > 0 and el > 0:
            e_poly = box(ex - ew / 2.0, ey - el / 2.0, ex + ew / 2.0, ey + el / 2.0)
        elif rad > 0:
            e_poly = box(ex - rad, ey - rad, ex + rad, ey + rad)
        else:
            continue

        # Must not intersect building footprint
        assert footprint.intersection(e_poly).area < 0.5, f"Element {elem.element_id} intersects building footprint"
        if parking_box:
            assert parking_box.intersection(e_poly).area < 0.5, f"Element {elem.element_id} intersects parking"


def test_indian_domestic_landscape_features():
    layout = generate_architectural_house_layout(
        plot_width=35.0,
        plot_length=50.0,
        bedrooms=3,
        bathrooms=2.0,
        num_floors=1,
        road_side="south",
        variant_seed=42
    )

    plan = generate_landscape_plan(layout, LandscapePreferences(style="traditional"))
    element_names = [getattr(e, "name", "") for e in plan.elements]
    element_ids = [e.element_id for e in plan.elements]

    # Verify presence of Indian use cases
    has_tulsi = "TULSI_PLANTER_01" in element_ids or any("Tulsi" in n for n in element_names)
    has_kitchen_garden = "KITCHEN_GARDEN_01" in element_ids or any("Kitchen Garden" in n for n in element_names)
    has_rainwater = "RAINWATER_PIT_01" in element_ids or any("Rainwater" in n for n in element_names)

    assert has_tulsi or has_kitchen_garden or has_rainwater, "At least one Indian domestic landscape feature must be placed"


def test_landscape_refinement_preserves_rooms():
    layout = generate_architectural_house_layout(
        plot_width=30.0,
        plot_length=50.0,
        bedrooms=3,
        bathrooms=2.0,
        num_floors=1,
        road_side="south",
        variant_seed=42
    )

    initial_room_rects = {r.id: (r.rect.x, r.rect.y, r.rect.width, r.rect.length) for r in layout.floors[0].rooms if r.rect}

    refined, diff = refine_landscape_layout(layout, "Add more greenery and trees")

    # Indoor rooms must remain untouched
    for r in refined.floors[0].rooms:
        if r.rect:
            assert initial_room_rects[r.id] == (r.rect.x, r.rect.y, r.rect.width, r.rect.length)

    assert len(diff["changes"]) > 0
    assert refined.landscape is not None
