"""
Phase 2 Focused Tests: DesignIntent, Groq Architect, Scheme Diversification, and Ranking
"""
import pytest
from models import ArchitecturalRequirements, Site, Rect, Setbacks, ArchitecturalScores, ArchitecturalValidation
from architecture.design_intent import DesignIntent, FloorPlanDSL, RoomRequirementIntent, RoomRelationIntent
from ai.groq_architect import create_deterministic_design_intent, rank_architectural_candidates


def test_1_typed_design_intent_and_dsl_schema():
    """Verify typed Pydantic structure for DesignIntent and FloorPlanDSL."""
    intent = DesignIntent(
        project_title="Test Villa",
        selected_spaces=[
            RoomRequirementIntent(
                id="living", type="living_room", name="Living Room", zone="public",
                min_width_ft=12.0, min_length_ft=14.0, preferred_width_ft=14.0, preferred_length_ft=16.0
            )
        ],
        relationships=[
            RoomRelationIntent(room_a="living", room_b="dining", relation_type="direct")
        ]
    )
    assert intent.project_title == "Test Villa"
    assert len(intent.selected_spaces) == 1
    assert intent.relationships[0].relation_type == "direct"

    dsl = FloorPlanDSL(
        plot_width=40.0, plot_length=50.0,
        buildable_x=4.0, buildable_y=3.0, buildable_width=32.0, buildable_length=43.0,
        scheme_typology="central_spine",
        rooms=intent.selected_spaces,
        relationships=intent.relationships
    )
    assert dsl.plot_width == 40.0
    assert dsl.scheme_typology == "central_spine"


def test_2_deterministic_architect_fallback():
    """Verify deterministic fallback creates comprehensive DesignIntent with correct spaces and relationships."""
    req = ArchitecturalRequirements(
        plot_width=35.0, plot_length=50.0,
        bedrooms=3, bathrooms=2.0, road_side="south",
        special_rooms=["Pooja"]
    )
    intent = create_deterministic_design_intent(req)
    assert intent.llm_source == "deterministic_fallback"
    assert len(intent.selected_spaces) >= 6
    room_types = [r.type for r in intent.selected_spaces]
    assert "master_bedroom" in room_types
    assert "kitchen" in room_types
    assert "pooja" in room_types

    # Attached master bath relation must exist
    attached_rel = [r for r in intent.relationships if r.relation_type == "attached"]
    assert len(attached_rel) >= 1


def test_3_scheme_diversification_narrow_vs_wide():
    """Verify genuinely different architectural typologies for narrow vs wide plots."""
    narrow_req = ArchitecturalRequirements(plot_width=25.0, plot_length=60.0, bedrooms=3)
    narrow_intent = create_deterministic_design_intent(narrow_req)
    assert narrow_intent.design_strategy.typology == "side_circulation"

    wide_req = ArchitecturalRequirements(plot_width=60.0, plot_length=35.0, bedrooms=3)
    wide_intent = create_deterministic_design_intent(wide_req)
    assert wide_intent.design_strategy.typology == "public_private_split"


def test_4_multi_objective_candidate_ranking():
    """Verify rank_architectural_candidates prioritizes valid layouts with superior scores."""
    c_good = {
        "summary": {"scheme_id": "good"},
        "scores": ArchitecturalScores(
            circulation_score=90.0, privacy_score=85.0, daylight_score=88.0,
            ventilation_score=85.0, space_efficiency_score=90.0, furniture_fit_score=85.0,
            adjacency_score=85.0, overall_score=87.0
        ),
        "validation": ArchitecturalValidation(is_valid=True)
    }
    c_invalid = {
        "summary": {"scheme_id": "invalid"},
        "scores": ArchitecturalScores(overall_score=95.0),
        "validation": ArchitecturalValidation(is_valid=False, errors=["Envelope breach"])
    }
    ranked = rank_architectural_candidates([c_invalid, c_good])
    assert ranked[0]["summary"]["scheme_id"] == "good"
