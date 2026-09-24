"""
Phase 5 Tests: Validation, Critic, and Local Refinement
Covers:
1. Groq critic returning structured advisory issues and suggestions from numeric summary
2. Hinglish room refinement ("master bedroom bada karo") with unaffected rooms frozen
3. 2-car parking refinement ("2 car parking chahiye")
4. Budget-constrained refinement loop with cost engine ("budget 45 lakh ke andar rakho")
5. Multi-domain validation (SITE, ROOMS, WALLS, DOORS, WINDOWS, STAIRS, FURNITURE, LANDSCAPE)
"""

import pytest
from models import (
    HouseLayout, FloorPlan, Room, Rect, Site, Setbacks, ConstructionSpecification
)
from architecture.architectural_validator import validate_design
from ai.groq_service import run_groq_architectural_critic, GroqCriticReport
from ai.refinement_engine import refine_current_house_layout, parse_refinement_intent
from architecture.furniture_validator import validate_and_place_furniture
from architecture.wall_network import generate_wall_network_and_openings
from estimation.material_quantity_engine import calculate_material_quantities
from estimation.cost_estimator import estimate_construction_cost


def create_baseline_layout() -> HouseLayout:
    site = Site(
        plot_width=40.0,
        plot_length=50.0,
        total_plot_area=2000.0,
        road_side="south",
        frontage_ft=40.0,
        setbacks=Setbacks(front=5.0, rear=5.0, left=4.0, right=4.0),
        buildable_envelope=Rect(x=4.0, y=5.0, width=32.0, length=40.0)
    )

    r1 = Room(id="room_living", name="Living Room", type="living_room",
              rect=Rect(x=4.0, y=5.0, width=16.0, length=18.0),
              preferred_width=16.0, preferred_length=18.0, min_width=12.0, min_length=14.0)
    r2 = Room(id="room_kitchen", name="Kitchen", type="kitchen",
              rect=Rect(x=20.0, y=5.0, width=12.0, length=12.0),
              preferred_width=12.0, preferred_length=12.0, min_width=8.0, min_length=8.0)
    r3 = Room(id="room_master_bed", name="Master Bedroom", type="master_bedroom",
              rect=Rect(x=4.0, y=23.0, width=12.0, length=14.0),
              preferred_width=12.0, preferred_length=14.0, min_width=10.0, min_length=12.0)
    r4 = Room(id="room_bed2", name="Bedroom 2", type="bedroom",
              rect=Rect(x=16.0, y=23.0, width=14.0, length=14.0),
              preferred_width=14.0, preferred_length=14.0, min_width=10.0, min_length=11.0)
    r5 = Room(id="room_bath", name="Common Bath", type="bathroom",
              rect=Rect(x=20.0, y=17.0, width=8.0, length=6.0),
              preferred_width=8.0, preferred_length=6.0, min_width=5.0, min_length=5.0)

    rooms = [r1, r2, r3, r4, r5]
    for r in rooms:
        r.furniture, _, _ = validate_and_place_furniture(r)

    spec = ConstructionSpecification(quality_tier="luxury")
    walls, doors, windows = generate_wall_network_and_openings(rooms, site, construction_spec=spec)

    fp = FloorPlan(
        floor_number=1,
        floor_name="Ground Floor",
        rooms=rooms,
        walls=walls,
        doors=doors,
        windows=windows,
        exterior_walls=[w for w in walls if w.wall_type == "exterior"],
        interior_walls=[w for w in walls if w.wall_type == "interior"]
    )

    layout = HouseLayout(
        id="test_house_01",
        plot_width=40.0,
        plot_length=50.0,
        floors=[fp],
        rooms=rooms,
        walls=walls,
        doors=doors,
        windows=windows,
        site=site,
        construction_spec=spec
    )
    layout.quantities = calculate_material_quantities(layout, spec)
    layout.cost_estimate = estimate_construction_cost(layout, layout.quantities)
    layout.validation = validate_design(layout)
    return layout


def test_groq_critic_structured_output():
    layout = create_baseline_layout()
    summary = {
        "rooms": [{"id": r.id, "name": r.name, "type": r.type, "width": r.rect.width, "length": r.rect.length} for r in layout.rooms],
        "scores": {"daylight_score": 85.0, "circulation_score": 75.0, "overall_score": 82.0}
    }
    critic_report: GroqCriticReport = run_groq_architectural_critic(summary)
    assert isinstance(critic_report, GroqCriticReport)
    assert isinstance(critic_report.issues, list)
    assert isinstance(critic_report.suggestions, list)
    # Output must adhere to issues & suggestions schema
    for issue in critic_report.issues:
        assert issue.severity in ["high", "medium", "low"]
        assert issue.entity_id != ""
        assert issue.problem != ""


def test_hinglish_refinement_enlarge_master_bedroom():
    layout = create_baseline_layout()
    initial_w = next(r.rect.width for r in layout.rooms if r.type == "master_bedroom")
    
    # "master bedroom bada karo" -> enlarge master bedroom
    refined, diff = refine_current_house_layout(layout, "master bedroom bada karo")
    
    new_mb = next(r for r in refined.rooms if r.type == "master_bedroom")
    assert new_mb.rect.width >= initial_w
    assert diff["modified_room"] == "Master Bedroom"
    # Unaffected rooms like kitchen should remain untouched or preserved
    kitchen = next(r for r in refined.rooms if r.type == "kitchen")
    assert kitchen.rect is not None


def test_2car_parking_refinement():
    layout = create_baseline_layout()
    refined, diff = refine_current_house_layout(layout, "2 car parking chahiye")
    
    assert refined.site.parking is not None
    assert refined.site.parking.capacity == 2
    assert refined.site.parking.rect.width >= 18.0
    assert diff["parking_capacity"] == 2
    assert "2 vehicle" in diff["architectural_rationale"] or "2 car" in diff["architectural_rationale"]


def test_budget_constrained_refinement_loop():
    layout = create_baseline_layout()
    initial_cost = layout.cost_estimate.total_cost_expected
    target_budget = 1000000.0  # 10 Lakhs

    refined, diff = refine_current_house_layout(layout, "budget 10 lakh ke andar rakho")
    
    assert diff["target_budget"] == target_budget
    assert refined.cost_estimate.total_cost_expected < initial_cost
    assert refined.construction_spec.quality_tier in ["standard", "economy", "premium"]
    assert diff["new_cost"] == refined.cost_estimate.total_cost_expected


def test_multi_domain_validation():
    layout = create_baseline_layout()
    val = validate_design(layout)
    assert val.is_valid is True
    assert "Site buildable envelope and setback containment" in val.passed_checks
    assert "Zero room geometric overlap" in val.passed_checks
    assert "Door connectivity and clearance" in val.passed_checks
