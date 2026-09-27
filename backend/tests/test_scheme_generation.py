from types import SimpleNamespace

import pytest

from architecture.architectural_engine import generate_architectural_house_layout
from architecture import generate_design_schemes
from architecture.scheme_generation import generate_house_schemes
from models import ArchitecturalRequirements


@pytest.fixture(scope="module")
def source_layout(monkeypatch_module):
    monkeypatch_module.setattr(
        "architecture.architectural_engine.generate_architectural_concepts_with_gemini",
        lambda _requirements: SimpleNamespace(concepts=[]),
    )
    return generate_architectural_house_layout(
        plot_width=30.0,
        plot_length=40.0,
        num_floors=1,
        bedrooms=2,
        bathrooms=2.0,
        parking_spaces=0,
        variant_seed=42,
    )


@pytest.fixture(scope="module")
def monkeypatch_module():
    patcher = pytest.MonkeyPatch()
    yield patcher
    patcher.undo()


def _rect_signature(layout):
    return tuple(
        (room.id, room.rect.x, room.rect.y, room.rect.width, room.rect.length)
        for floor in layout.floors
        for room in floor.rooms
    )


def test_scheme_service_returns_valid_topological_variants_and_preserves_program(source_layout):
    source = source_layout
    source_positions = _rect_signature(source)
    requirements = ArchitecturalRequirements(
        plot_width=30.0,
        plot_length=40.0,
        bedrooms=2,
        bathrooms=2.0,
        road_side="south",
    )

    result = generate_house_schemes(
        source,
        requirements=requirements,
        count=3,
        variant_seed=42,
        preferences={"solver_time_limit_sec": 3.0},
    )

    assert result.deterministic_fallback_used is True
    assert len(result.variants) == 3
    assert [variant.scheme_id for variant in result.variants] == [
        "scheme_central_circulation",
        "scheme_public_private_split",
        "scheme_side_circulation",
    ]
    assert _rect_signature(source) == source_positions
    assert len({_rect_signature(variant.layout) for variant in result.variants}) == 3
    assert len({variant.scheme_id for variant in result.variants}) == 3
    assert len({variant.layout.id for variant in result.variants}) == 3
    assert all(variant.layout.project_id == source.project_id for variant in result.variants)

    expected_rooms = {room.id for room in source.rooms}
    for variant in result.variants:
        assert variant.validation.is_valid
        assert variant.layout.validation.is_valid
        assert {room.id for room in variant.layout.rooms} == expected_rooms
        assert variant.layout.scores is not None
        assert variant.name
        assert variant.tags
        assert variant.feature_summary
        assert variant.layout.metadata["scheme"]["id"] == variant.scheme_id


def test_public_scheme_api_returns_documented_json_ready_entries(source_layout):
    entries = generate_design_schemes(source_layout, count=3, vastu_enabled=False)

    assert len(entries) == 3
    assert set(entries[0]) == {
        "id",
        "name",
        "concept",
        "characteristics",
        "validation_status",
        "layout",
    }
    for entry in entries:
        assert entry["id"]
        assert entry["name"]
        assert entry["concept"]
        assert entry["characteristics"]["tags"]
        assert entry["characteristics"]["feature_summary"]
        assert entry["validation_status"]["is_valid"] is True
        assert isinstance(entry["layout"], dict)
        assert entry["layout"]["id"]
        assert "vastu_audit" not in entry["validation_status"]


def test_vastu_option_is_included_only_when_enabled_and_has_audit_evidence(source_layout):
    vastu_entries = generate_design_schemes(source_layout, count=3, vastu_enabled=True)
    vastu_schemes = [
        entry for entry in vastu_entries
        if entry["id"] == "scheme_vastu_optimized"
    ]

    assert len(vastu_schemes) == 1
    vastu_scheme = vastu_schemes[0]
    assert vastu_scheme["name"] == "Vastu-Oriented Directional Scheme"
    assert vastu_scheme["validation_status"]["is_valid"] is True
    audit = vastu_scheme["validation_status"]["vastu_audit"]
    assert audit is not None
    assert isinstance(audit["overall_score"], (int, float))
    assert audit["rule_results"]
    assert vastu_scheme["layout"]["scores"]["vastu_score"] == audit["overall_score"]
    assert any(
        str(audit["overall_score"]) in feature
        for feature in vastu_scheme["characteristics"]["feature_summary"]
    )
    for entry in vastu_entries:
        assert entry["layout"]["scores"]["vastu_score"] is not None

    regular_entries = generate_design_schemes(source_layout, count=3, vastu_enabled=False)
    assert all("vastu" not in entry["id"].lower() for entry in regular_entries)
    assert all("vastu" not in entry["name"].lower() for entry in regular_entries)
    assert all(entry["layout"]["scores"]["vastu_score"] is None for entry in regular_entries)
