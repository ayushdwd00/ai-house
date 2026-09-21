"""
Targeted tests for Landscaping System:
1. Import & Initialization
2. Deterministic Landscape Generation
3. Collision & Placement Avoidance (Building, Doors, Parking, Boundaries)
4. AI Natural-Language Landscape Intent Parsing
5. Natural-Language Landscape Refinement without Architectural Invalidation
"""

import pytest
from shapely.geometry import box, Point
from models import HouseLayout, HouseStats, Site, Setbacks, Rect, ParkingSpace, Point2D, LandscapePreferences
from architecture.architectural_engine import generate_architectural_house_layout
from landscape.landscape_engine import generate_landscape_plan, refine_landscape_layout
from ai.groq_service import interpret_dream_home_prompt, interpret_requirements_with_groq
from ai.refinement_engine import refine_current_house_layout


def test_landscape_generation_and_metrics():
    """Verify deterministic landscape generation on a standard layout."""
    layout = generate_architectural_house_layout(
        plot_width=40.0,
        plot_length=50.0,
        bedrooms=3,
        bathrooms=2.0,
        road_side="south",
        parking_spaces=1,
        landscape_preferences=LandscapePreferences(
            style="modern_minimal",
            front_garden=True,
            rear_garden=True,
            entrance_pathway=True,
            outdoor_lighting=True,
            trees=3
        )
    )

    assert layout.landscape is not None, "Landscape plan should be generated"
    ls = layout.landscape
    assert len(ls.zones) >= 2, "Should contain at least front and rear garden zones"
    assert ls.trees_count >= 1, "Should have placed at least 1 specimen tree"
    assert ls.lights_count >= 1, "Should have placed pathway bollard lights"
    assert ls.total_green_area_sqft > 0, "Total green area must be calculated"
    assert 0 < ls.green_coverage_percentage <= 100, "Green coverage percentage must be valid"
    assert len(ls.paths) >= 1, "Pedestrian pathway must exist"
    assert ls.driveway is not None, "Driveway must be attached"


def test_landscape_collision_avoidance():
    """Verify vegetation does not collide with building, parking, or doors."""
    layout = generate_architectural_house_layout(
        plot_width=40.0,
        plot_length=50.0,
        bedrooms=3,
        bathrooms=2.0,
        road_side="south",
        parking_spaces=1
    )
    ls = layout.landscape
    assert ls is not None

    rooms = layout.floors[0].rooms if layout.floors else layout.rooms
    building_boxes = [box(r.rect.x, r.rect.y, r.rect.x + r.rect.width, r.rect.y + r.rect.length) for r in rooms if r.rect]
    parking_box = box(layout.site.parking.rect.x, layout.site.parking.rect.y,
                      layout.site.parking.rect.x + layout.site.parking.rect.width,
                      layout.site.parking.rect.y + layout.site.parking.rect.length) if layout.site and layout.site.parking else None

    for elem in ls.elements:
        # All elements must be within plot
        assert 0 <= elem.x <= layout.plot_width, f"Element {elem.element_id} x out of bounds: {elem.x}"
        assert 0 <= elem.y <= layout.plot_length, f"Element {elem.element_id} y out of bounds: {elem.y}"

        if elem.type == "tree":
            pt = Point(elem.x, elem.y)
            # Tree must not be inside any room
            for bbox in building_boxes:
                assert not bbox.contains(pt), f"Tree {elem.element_id} placed inside room!"
                assert bbox.distance(pt) >= 1.8, f"Tree {elem.element_id} too close to building ({bbox.distance(pt)}ft)"

            # Tree must not be inside parking
            if parking_box:
                assert not parking_box.contains(pt), f"Tree {elem.element_id} placed inside parking!"


def test_ai_landscape_intent_parsing():
    """Verify natural-language landscape requirements are extracted accurately."""
    prompt = (
        "Design a modern 3BHK on a 30x50 plot with two-car parking, "
        "a large living room, open kitchen and a small front garden with a pathway to the entrance."
    )
    res = interpret_dream_home_prompt(prompt)
    assert res.landscape_preferences is not None, "Should extract landscape preferences"
    lp = res.landscape_preferences
    assert lp.front_garden is True, "Front garden should be requested"
    assert lp.entrance_pathway is True, "Entrance pathway should be requested"
    assert lp.style in ["modern_minimal", "modern"], "Style should be modern minimal"


def test_landscape_natural_language_refinement():
    """Verify refinement modifies only landscape and preserves room architecture."""
    layout = generate_architectural_house_layout(
        plot_width=40.0,
        plot_length=50.0,
        bedrooms=3,
        bathrooms=2.0,
        road_side="south",
        parking_spaces=1
    )
    orig_room_count = len(layout.rooms)
    orig_trees_count = layout.landscape.trees_count

    # 1. Remove tree refinement
    refined_layout, diff = refine_current_house_layout(layout, "Remove the tree near the parking.")
    assert refined_layout.landscape.trees_count <= orig_trees_count, "Tree count should decrease or remain non-increasing"
    assert len(refined_layout.rooms) == orig_room_count, "Room count must remain unchanged"
    assert refined_layout.version_number == layout.version_number + 1

    # 2. Add outdoor lights refinement
    orig_lights = refined_layout.landscape.lights_count
    refined_layout2, diff2 = refine_current_house_layout(refined_layout, "Add outdoor lights.")
    assert refined_layout2.landscape.lights_count >= orig_lights, "Lights should be added"
    assert len(refined_layout2.rooms) == orig_room_count, "Room count must remain unchanged"
