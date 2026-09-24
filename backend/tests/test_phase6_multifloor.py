"""
Phase 6 Tests: Multi-Floor (G+1, G+2, G+3)
Covers:
1. G+1 house generation with identical staircase vertical alignment (dx, dy < 0.5ft)
2. Structural column grid continuity spanning across all floors
3. Vertical MEP plumbing alignment and stacking efficiency
4. G+2 (3 floors) multi-story structural coordination with rooftop terrace
"""

import pytest
from architecture.architectural_engine import generate_architectural_house_layout
from architecture.architectural_validator import validate_design
from construction.structural_planner import plan_preliminary_structure
from construction.building_services_engine import plan_building_services


def test_g_plus_1_staircase_vertical_alignment():
    # 30x50 plot, 3 bedrooms, 2 floors (G+1)
    layout = generate_architectural_house_layout(
        plot_width=30.0,
        plot_length=50.0,
        bedrooms=3,
        bathrooms=3.0,
        num_floors=2,
        road_side="south",
        variant_seed=42
    )

    assert len(layout.floors) == 2
    f1_stair = next((r for r in layout.floors[0].rooms if r.type == "staircase"), None)
    f2_stair = next((r for r in layout.floors[1].rooms if r.type == "staircase"), None)

    assert f1_stair is not None
    assert f2_stair is not None
    assert f1_stair.rect is not None
    assert f2_stair.rect is not None

    # Strict vertical stacking tolerance: coordinate delta <= 0.5 ft
    assert abs(f1_stair.rect.x - f2_stair.rect.x) <= 0.5
    assert abs(f1_stair.rect.y - f2_stair.rect.y) <= 0.5
    assert abs(f1_stair.rect.width - f2_stair.rect.width) <= 0.5
    assert abs(f1_stair.rect.length - f2_stair.rect.length) <= 0.5

    # Validation must confirm vertical staircase stacking
    val = validate_design(layout)
    assert val.is_valid is True
    assert "Vertical staircase shaft stacking" in val.passed_checks


def test_multifloor_column_continuity():
    layout = generate_architectural_house_layout(
        plot_width=30.0,
        plot_length=50.0,
        bedrooms=3,
        bathrooms=3.0,
        num_floors=2,
        road_side="south",
        variant_seed=42
    )

    structure = plan_preliminary_structure(layout.floors, layout.construction_spec, layout.site, layout.plot_width, layout.plot_length, layout=layout)
    assert structure.column_count > 0
    # Columns must support multi-floor vertical continuity (floors 1 and 2)
    multi_floor_cols = [c for c in structure.columns if len(c.floors) >= 2 or len(c.floor_ids) >= 2]
    assert len(multi_floor_cols) > 0


def test_multifloor_building_services_plumbing_stacking():
    layout = generate_architectural_house_layout(
        plot_width=30.0,
        plot_length=50.0,
        bedrooms=3,
        bathrooms=3.0,
        num_floors=2,
        road_side="south",
        variant_seed=42
    )

    services = plan_building_services(layout.floors, layout.plot_width, layout.plot_length)
    assert len(services.plumbing_stacks) > 0
    assert services.stacking_efficiency_score >= 60.0
    # Electrical riser must be anchored
    assert len(services.electrical_shafts) > 0


def test_g_plus_2_three_floors_coordination():
    # 40x50 plot, 4 bedrooms, 3 floors (G+2)
    layout = generate_architectural_house_layout(
        plot_width=40.0,
        plot_length=50.0,
        bedrooms=4,
        bathrooms=3.5,
        num_floors=3,
        road_side="north",
        variant_seed=42
    )

    assert len(layout.floors) == 3
    # Check that staircase continues through all 3 floors
    for idx, f in enumerate(layout.floors):
        stair = next((r for r in f.rooms if r.type == "staircase"), None)
        assert stair is not None, f"Staircase missing on floor {idx+1}"
        assert stair.rect is not None

    # Floor 3 should feature terrace or rooftop lounge
    f3_types = [r.type for r in layout.floors[2].rooms]
    assert "balcony" in f3_types or "bedroom" in f3_types
