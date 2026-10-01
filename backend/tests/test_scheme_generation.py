from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
from architecture.architectural_engine import generate_architectural_house_layout
from architecture import generate_design_schemes
from architecture.scheme_generation import SchemeGenerationError, generate_house_schemes
from architecture import spatial_solver
from architecture.topology_engine import generate_architectural_schemes
from models import ArchitecturalRequirements, HouseLayout


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
    assert 1 <= len(result.variants) <= 3
    assert result.variants[0].scheme_id == "scheme_central_circulation"
    assert {variant.scheme_id for variant in result.variants}.issubset({
        "scheme_central_circulation",
        "scheme_public_private_split",
        "scheme_side_circulation",
    })
    if len(result.variants) < 3:
        assert result.warnings
    assert _rect_signature(source) == source_positions
    assert len({_rect_signature(variant.layout) for variant in result.variants}) == len(result.variants)
    assert len({variant.scheme_id for variant in result.variants}) == len(result.variants)
    assert len({variant.layout.id for variant in result.variants}) == len(result.variants)
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
    response = generate_design_schemes(source_layout, count=3, vastu_enabled=False)
    entries = response["schemes"]

    assert response["requested_variants"] == 3
    assert response["generated_variants"] == len(entries)
    assert 1 <= len(entries) <= 3
    if len(entries) < 3:
        assert response["generation_warning"]
    else:
        assert response["generation_warning"] is None
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
    vastu_entries = generate_design_schemes(source_layout, count=3, vastu_enabled=True)["schemes"]
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

    regular_entries = generate_design_schemes(source_layout, count=3, vastu_enabled=False)["schemes"]
    assert all("vastu" not in entry["id"].lower() for entry in regular_entries)
    assert all("vastu" not in entry["name"].lower() for entry in regular_entries)
    assert all(entry["layout"]["scores"]["vastu_score"] is None for entry in regular_entries)


def test_partial_generation_returns_available_valid_variants(source_layout, monkeypatch):
    monkeypatch.setattr(
        "architecture.scheme_generation._solve_all_floors",
        lambda floors, *_args, **_kwargs: list(floors),
    )

    response = generate_design_schemes(source_layout, count=4, vastu_enabled=False)

    assert response["requested_variants"] == 4
    assert response["generated_variants"] == 1
    assert len(response["schemes"]) == 1
    assert response["generation_warning"] == "Only one valid architectural scheme was found."
    assert response["schemes"][0]["validation_status"]["is_valid"] is True


def test_zero_candidates_include_actionable_rejection_reasons(source_layout, monkeypatch):
    monkeypatch.setattr(
        "architecture.scheme_generation._solve_all_floors",
        lambda *_args, **_kwargs: None,
    )

    with pytest.raises(SchemeGenerationError) as error:
        generate_house_schemes(source_layout, count=4, variant_seed=42)

    assert str(error.value) == "No valid layout could satisfy the current hard constraints."
    assert error.value.reasons
    assert all("No solver result" in reason for reason in error.value.reasons)


def test_unknown_objective_solve_retries_hard_constraint_feasibility(source_layout, monkeypatch):
    real_solver_type = spatial_solver.cp_model.CpSolver
    real_model = source_layout.floors[0]
    scheme = generate_architectural_schemes(
        real_model.rooms,
        source_layout.site,
        vastu_compliant=False,
    )[0]
    solver_instances = []

    class UnknownSolver:
        parameters = type("Parameters", (), {})()

        @staticmethod
        def Solve(_model):
            return spatial_solver.cp_model.UNKNOWN

        @staticmethod
        def StatusName(_status):
            return "UNKNOWN"

    class RealSolverProxy:
        def __init__(self):
            self.solver = real_solver_type()
            self.parameters = self.solver.parameters

        def Solve(self, model):
            return self.solver.Solve(model)

        def StatusName(self, status):
            return self.solver.StatusName(status)

        def Value(self, variable):
            return self.solver.Value(variable)

    def solver_factory():
        instance = UnknownSolver() if not solver_instances else RealSolverProxy()
        solver_instances.append(instance)
        return instance

    monkeypatch.setattr(spatial_solver.cp_model, "CpSolver", solver_factory)
    diagnostics = {}
    candidate = spatial_solver.solve_spatial_layout(
        rooms=real_model.rooms,
        site=source_layout.site,
        scheme=scheme,
        time_limit_sec=5.0,
        variant_seed=42,
        diagnostics=diagnostics,
    )

    assert candidate is not None
    assert candidate.solver_status in {"FEASIBLE", "OPTIMAL"}
    assert diagnostics["solver_status_attempts"][0] == "UNKNOWN"
    assert diagnostics["solver_status"] in {"FEASIBLE", "OPTIMAL"}
    assert len(solver_instances) == 2


def test_scheme_endpoint_returns_partial_generation_metadata(source_layout, monkeypatch):
    response_body = {
        "schemes": [{"id": "one-valid-scheme"}],
        "requested_variants": 4,
        "generated_variants": 1,
        "generation_warning": "Only one valid architectural scheme was found.",
    }
    monkeypatch.setattr(main, "generate_design_schemes", lambda **_kwargs: response_body)
    client = TestClient(main.app)

    response = client.post(
        "/api/design-schemes?count=4",
        json=source_layout.model_dump(mode="json"),
    )

    assert response.status_code == 200
    assert response.json() == response_body


def test_scheme_endpoint_returns_structured_zero_candidate_error(source_layout, monkeypatch):
    def fail_generation(**_kwargs):
        raise SchemeGenerationError(
            "No valid layout could satisfy the current hard constraints.",
            reasons=["CP-SAT returned INFEASIBLE for scheme_central_circulation."],
        )

    monkeypatch.setattr(main, "generate_design_schemes", fail_generation)
    client = TestClient(main.app)

    response = client.post(
        "/api/design-schemes?count=4",
        json=source_layout.model_dump(mode="json"),
    )

    assert response.status_code == 422
    assert response.json() == {
        "code": "NO_VALID_ARCHITECTURAL_SCHEME",
        "message": "No valid layout could satisfy the current hard constraints.",
        "reasons": ["CP-SAT returned INFEASIBLE for scheme_central_circulation."],
    }


def test_create_request_to_scheme_endpoint_end_to_end():
    client = TestClient(main.app)
    project_id = None
    generated = client.post(
        "/api/generate",
        json={
            "plot_width": 30,
            "plot_length": 40,
            "bedrooms": 2,
            "bathrooms": 2,
            "num_floors": 1,
            "parking_cars": 1,
            "vastu_compliant": False,
        },
    )
    assert generated.status_code == 200, generated.text
    base_layout = generated.json()
    project_id = base_layout["id"]
    try:
        schemes_response = client.post(
            "/api/design-schemes?count=4&vastu_enabled=false",
            json=base_layout,
        )
        assert schemes_response.status_code == 200, schemes_response.text
        data = schemes_response.json()
        assert data["requested_variants"] == 4
        assert data["generated_variants"] >= 1
        assert len(data["schemes"]) == data["generated_variants"]
        for scheme in data["schemes"]:
            assert scheme["validation_status"]["is_valid"] is True
            layout = HouseLayout.model_validate(scheme["layout"])
            assert layout.floors and layout.rooms
            assert layout.validation and layout.validation.is_valid
    finally:
        if project_id:
            assert client.delete(f"/api/projects/{project_id}").status_code == 200
