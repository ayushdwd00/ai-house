from fastapi.testclient import TestClient

import main
from ai.groq_service import NaturalLanguageModificationCommand
from architecture import edit_pipeline
from models import ArchitecturalValidation, EditIntent, FloorPlan, HouseLayout, ProjectEditRequest, Rect, Stair


def _layout():
    return HouseLayout(
        id="project-edit-test",
        title="Edit Test",
        designer_rationale="Fixture",
        plot_width=30,
        plot_length=40,
    )


def test_edit_intent_preview_uses_canonical_typed_parser(monkeypatch):
    layout = _layout()
    parsed = EditIntent(
        operation="resize_room",
        target_room_id="room-1",
        target_room_type="bedroom",
        architectural_rationale="Internal reasoning must not be returned.",
    )
    monkeypatch.setattr(main, "get_project", lambda _project_id: layout)
    monkeypatch.setattr(edit_pipeline, "interpret_edit_intent", lambda *_args, **_kwargs: parsed)

    result = main.project_edit_intent_endpoint(
        "project-edit-test",
        ProjectEditRequest(edit_instruction="make bedroom larger"),
    )

    assert result["intent"]["operation"] == "resize_room"
    assert result["intent"]["target_room_id"] == "room-1"
    assert result["intent"]["architectural_rationale"] == ""


def test_edit_applies_validated_candidate_and_reconciles_mep(monkeypatch):
    current = _layout()
    candidate = current.model_copy(deep=True)
    intent = EditIntent(operation="change_parking", target_room_type="parking")
    persisted = []
    mep_calls = []

    monkeypatch.setattr(main, "get_project", lambda _project_id: current)
    monkeypatch.setattr(
        edit_pipeline,
        "apply_canonical_edit",
        lambda **_kwargs: (candidate, {"operation": "change_parking", "parking_capacity": 2, "edit_intent": intent.model_dump()}, None),
    )
    monkeypatch.setattr(main, "build_mep_plan", lambda layout: mep_calls.append(layout) or layout)
    monkeypatch.setattr(main, "validate_design", lambda _layout: ArchitecturalValidation(is_valid=True))
    monkeypatch.setattr(main, "save_project", lambda layout, project_id: persisted.append((layout, project_id)))

    response = TestClient(main.app).post(
        "/api/projects/project-edit-test/edit",
        json={"edit_instruction": "add two-car parking"},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "ok"
    assert result["intent"]["operation"] == "change_parking"
    assert result["diff"] == {"operation": "change_parking", "parking_capacity": 2}
    assert [stage["stage"] for stage in result["stages"]] == [
        "understanding_change",
        "updating_architecture",
        "validating_layout",
        "updating_2d_plan",
        "updating_3d_model",
    ]
    assert len(mep_calls) == 1
    assert persisted[0][0].version_number == current.version_number + 1


def test_invalid_candidate_is_rejected_without_persisting(monkeypatch):
    current = _layout()
    candidate = current.model_copy(deep=True)
    intent = EditIntent(operation="resize_room")
    persisted = []

    monkeypatch.setattr(main, "get_project", lambda _project_id: current)
    monkeypatch.setattr(
        edit_pipeline,
        "apply_canonical_edit",
        lambda **_kwargs: (candidate, {"edit_intent": intent.model_dump()}, None),
    )
    monkeypatch.setattr(main, "build_mep_plan", lambda layout: layout)
    monkeypatch.setattr(
        main,
        "validate_design",
        lambda _layout: ArchitecturalValidation(is_valid=False, errors=["Candidate geometry overlaps."]),
    )
    monkeypatch.setattr(main, "save_project", lambda *args: persisted.append(args))

    response = TestClient(main.app).post(
        "/api/projects/project-edit-test/edit",
        json={"edit_instruction": "make bedroom larger"},
    )

    assert response.status_code == 422
    result = response.json()
    assert result["status"] == "rejected"
    assert result["layout"] == current.model_dump(mode="json")
    assert result["reason"] == "Candidate geometry overlaps."
    assert persisted == []


def test_unsupported_entrance_operation_is_rejected(monkeypatch):
    current = _layout()
    candidate = current.model_copy(deep=True)
    intent = EditIntent(operation="change_entrance")
    persisted = []

    monkeypatch.setattr(main, "get_project", lambda _project_id: current)
    monkeypatch.setattr(
        edit_pipeline,
        "apply_canonical_edit",
        lambda **_kwargs: (candidate, {"edit_intent": intent.model_dump()}, None),
    )
    monkeypatch.setattr(main, "save_project", lambda *args: persisted.append(args))

    response = TestClient(main.app).post(
        "/api/projects/project-edit-test/edit",
        json={"edit_instruction": "move the entrance"},
    )

    assert response.status_code == 422
    assert response.json()["reason"] == (
        "The 'change_entrance' operation is not supported by the canonical geometry pipeline."
    )
    assert response.json()["layout"] == current.model_dump(mode="json")
    assert persisted == []


def test_unsaved_request_layout_is_rejected_as_stale(monkeypatch):
    persisted = _layout()
    unsaved = persisted.model_copy(deep=True)
    unsaved.plot_width += 1
    monkeypatch.setattr(main, "get_project", lambda _project_id: persisted)

    response = TestClient(main.app).post(
        "/api/projects/project-edit-test/edit-intent",
        json={
            "edit_instruction": "delete selected wall",
            "current_layout": unsaved.model_dump(mode="json"),
            "target_entity_id": "wall-1",
        },
    )

    assert response.status_code == 409
    assert "not saved yet" in response.json()["detail"]


def test_entity_selection_is_forwarded_by_preview_and_apply(monkeypatch):
    current = _layout()
    target_entity_id = "selected-wall-42"
    intent = EditIntent(operation="delete_wall", target_entity_id=target_entity_id)
    preview_calls = []
    apply_calls = []
    persisted = []

    monkeypatch.setattr(main, "get_project", lambda _project_id: current)
    monkeypatch.setattr(
        edit_pipeline,
        "interpret_edit_intent",
        lambda *args, **kwargs: preview_calls.append(kwargs) or intent,
    )
    monkeypatch.setattr(
        edit_pipeline,
        "apply_canonical_edit",
        lambda **kwargs: (
            apply_calls.append(kwargs) or current.model_copy(deep=True),
            {"edit_intent": intent.model_dump(), "operation": "delete_wall"},
            None,
        ),
    )
    monkeypatch.setattr(main, "build_mep_plan", lambda layout: layout)
    monkeypatch.setattr(main, "validate_design", lambda _layout: ArchitecturalValidation(is_valid=True))
    monkeypatch.setattr(main, "save_project", lambda layout, project_id: persisted.append((layout, project_id)))

    client = TestClient(main.app)
    payload = {
        "edit_instruction": "delete selected wall",
        "current_layout": current.model_dump(mode="json"),
        "target_entity_id": target_entity_id,
    }
    preview = client.post("/api/projects/project-edit-test/edit-intent", json=payload)
    applied = client.post("/api/projects/project-edit-test/edit", json=payload)

    assert preview.status_code == 200
    assert applied.status_code == 200
    assert preview_calls[0]["target_entity_id"] == target_entity_id
    assert apply_calls[0]["target_entity_id"] == target_entity_id


def test_staircase_move_route_applies_and_persists_single_floor_edit(monkeypatch):
    current = HouseLayout(
        id="project-edit-test",
        title="Stair Edit",
        designer_rationale="Fixture",
        plot_width=30,
        plot_length=40,
        floors=[
            FloorPlan(
                floor_number=1,
                staircase=Stair(id="stair-1", rect=Rect(x=5, y=5, width=3.5, length=8)),
            )
        ],
    )
    persisted = []
    monkeypatch.setattr(main, "get_project", lambda _project_id: current)
    monkeypatch.setattr(
        edit_pipeline,
        "interpret_modification_with_groq",
        lambda *_args, **_kwargs: NaturalLanguageModificationCommand(
            target_room_type="staircase",
            operation="general_adjust",
            llm_source="test",
        ),
    )
    monkeypatch.setattr(main, "build_mep_plan", lambda layout: layout)
    monkeypatch.setattr(main, "validate_design", lambda _layout: ArchitecturalValidation(is_valid=True))
    monkeypatch.setattr(main, "save_project", lambda layout, project_id: persisted.append(layout.model_copy(deep=True)))

    response = TestClient(main.app).post(
        "/api/projects/project-edit-test/edit",
        json={
            "edit_instruction": "move staircase east",
            "current_layout": current.model_dump(mode="json"),
            "target_entity_id": "stair-1",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["intent"]["operation"] == "move_staircase"
    assert response.json()["layout"]["floors"][0]["staircase"]["rect"]["x"] == 6
    assert persisted[0].floors[0].staircase.rect.x == 6
