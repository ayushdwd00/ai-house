from architecture import edit_pipeline
from architecture.wall_network import generate_wall_network_and_openings
from ai.groq_service import NaturalLanguageModificationCommand
from models import (
    ArchitecturalValidation, EditIntent, FloorPlan, HouseLayout, Rect, Room,
    Site, Stair,
)


def _layout(with_stair=False):
    rooms = [
        Room(
            id="living",
            name="Living Room",
            type="living_room",
            rect=Rect(x=0, y=0, width=15, length=20),
        ),
        Room(
            id="bedroom",
            name="Bedroom",
            type="bedroom",
            rect=Rect(x=15, y=0, width=15, length=20),
        ),
    ]
    site = Site(
        plot_width=30,
        plot_length=20,
        total_plot_area=600,
        frontage_ft=30,
        buildable_envelope=Rect(x=0, y=0, width=30, length=20),
    )
    walls, doors, windows = generate_wall_network_and_openings(rooms, site)
    floor = FloorPlan(
        floor_number=1,
        rooms=rooms,
        walls=walls,
        doors=doors,
        windows=windows,
        staircase=(
            Stair(id="stair-1", rect=Rect(x=21, y=4, width=3.5, length=8))
            if with_stair else None
        ),
    )
    return HouseLayout(
        id="entity-edit-test",
        title="Entity edit test",
        designer_rationale="Fixture",
        plot_width=30,
        plot_length=20,
        site=site,
        floors=[floor],
        rooms=rooms,
        walls=walls,
        doors=doors,
        windows=windows,
    )


def _apply(monkeypatch, layout, intent):
    monkeypatch.setattr(edit_pipeline, "interpret_edit_intent", lambda *_args, **_kwargs: intent)
    monkeypatch.setattr(
        edit_pipeline,
        "validate_design",
        lambda _layout: ArchitecturalValidation(is_valid=True),
    )
    return edit_pipeline.apply_canonical_edit(layout, "deterministic test edit")


def test_add_wall_is_derived_from_target_room_and_not_llm_coordinates(monkeypatch):
    layout = _layout()
    result, diff, error = _apply(
        monkeypatch,
        layout,
        EditIntent(operation="add_wall", target_room_id="living"),
    )

    assert error is None
    assert diff["operation"] == "add_wall"
    added = next(wall for wall in result.floors[0].walls if wall.id == diff["modified_element"])
    assert (added.x1, added.y1, added.x2, added.y2) == (0.5, 10.0, 14.5, 10.0)
    assert layout.floors[0].walls != result.floors[0].walls


def test_custom_wall_delete_move_and_resize(monkeypatch):
    layout = _layout()
    custom = edit_pipeline.Wall(
        id="custom-partition",
        x1=2, y1=10, x2=13, y2=10,
        adjacent_room_ids=["living"],
        metadata={"canonical_edit": True, "host_room_id": "living"},
    )
    layout.floors[0].walls.append(custom)
    layout.walls.append(custom)

    moved, _, error = _apply(
        monkeypatch,
        layout,
        EditIntent(
            operation="move_wall",
            target_entity_id=custom.id,
            constraints={"direction": "north"},
        ),
    )
    assert error is None
    moved_wall = next(wall for wall in moved.floors[0].walls if wall.id == custom.id)
    assert moved_wall.y1 == 9 and moved_wall.y2 == 9

    resized, _, error = _apply(
        monkeypatch,
        layout,
        EditIntent(
            operation="resize_wall",
            target_entity_id=custom.id,
            constraints={"size_delta": 1},
        ),
    )
    assert error is None
    resized_wall = next(wall for wall in resized.floors[0].walls if wall.id == custom.id)
    assert resized_wall.x1 == 1.5 and resized_wall.x2 == 13.5

    deleted, _, error = _apply(
        monkeypatch, layout, EditIntent(operation="delete_wall", target_entity_id=custom.id)
    )
    assert error is None
    assert all(wall.id != custom.id for wall in deleted.floors[0].walls)


def test_add_delete_move_and_resize_hosted_openings(monkeypatch):
    layout = _layout()
    interior = next(wall for wall in layout.floors[0].walls if wall.wall_type == "interior")
    added, _, error = _apply(
        monkeypatch, layout,
        EditIntent(operation="add_door", target_entity_id=interior.id),
    )
    assert error is None
    added_door = next(door for door in added.floors[0].doors if door.id.startswith("edit_door_"))
    assert added_door.wall_id == interior.id

    existing_door = next(
        door for door in layout.floors[0].doors
        if next(wall for wall in layout.floors[0].walls if wall.id == door.wall_id).wall_type == "exterior"
    )
    moved, _, error = _apply(
        monkeypatch, layout,
        EditIntent(
            operation="move_door",
            target_entity_id=existing_door.id,
            constraints={"direction": "east"},
        ),
    )
    assert error is None
    moved_door = next(door for door in moved.floors[0].doors if door.id == existing_door.id)
    assert moved_door.position_along_wall > existing_door.position_along_wall

    resized, _, error = _apply(
        monkeypatch, layout,
        EditIntent(
            operation="resize_door",
            target_entity_id=existing_door.id,
            constraints={"size_delta": 1},
        ),
    )
    assert error is None
    resized_door = next(door for door in resized.floors[0].doors if door.id == existing_door.id)
    assert resized_door.width == existing_door.width + 0.5
    deleted_door, _, error = _apply(
        monkeypatch, layout,
        EditIntent(operation="delete_door", target_entity_id=existing_door.id),
    )
    assert error is None
    assert all(door.id != existing_door.id for door in deleted_door.floors[0].doors)

    exterior = next(wall for wall in layout.floors[0].walls if wall.wall_type == "exterior" and "living" in wall.adjacent_room_ids)
    added_window, _, error = _apply(
        monkeypatch, layout,
        EditIntent(operation="add_window", target_entity_id=exterior.id),
    )
    assert error is None
    assert any(window.id.startswith("edit_window_") for window in added_window.floors[0].windows)

    existing_window = layout.floors[0].windows[0]
    deleted_window, _, error = _apply(
        monkeypatch, layout,
        EditIntent(operation="delete_window", target_entity_id=existing_window.id),
    )
    assert error is None
    assert all(window.id != existing_window.id for window in deleted_window.floors[0].windows)

    host_wall = next(wall for wall in layout.floors[0].walls if wall.id == existing_window.wall_id)
    move_direction = "east" if host_wall.wall_direction == "horizontal" else "south"
    moved_window, _, error = _apply(
        monkeypatch, layout,
        EditIntent(
            operation="move_window",
            target_entity_id=existing_window.id,
            constraints={"direction": move_direction},
        ),
    )
    assert error is None
    moved_window_item = next(window for window in moved_window.floors[0].windows if window.id == existing_window.id)
    assert moved_window_item.position_along_wall > existing_window.position_along_wall

    resized_window, _, error = _apply(
        monkeypatch, layout,
        EditIntent(
            operation="resize_window",
            target_entity_id=existing_window.id,
            constraints={"size_delta": 1},
        ),
    )
    assert error is None
    resized_window_item = next(window for window in resized_window.floors[0].windows if window.id == existing_window.id)
    assert resized_window_item.width == existing_window.width + 0.5


def test_invalid_or_underspecified_entity_edits_reject_unchanged(monkeypatch):
    layout = _layout()
    original = layout.model_dump(mode="json")
    candidate, _, error = _apply(
        monkeypatch, layout,
        EditIntent(operation="move_wall", target_entity_id="missing-wall"),
    )
    assert error
    assert candidate.model_dump(mode="json") == original

    custom = edit_pipeline.Wall(
        id="custom-partition",
        x1=2, y1=10, x2=13, y2=10,
        adjacent_room_ids=["living"],
    )
    layout.floors[0].walls.append(custom)
    original = layout.model_dump(mode="json")
    candidate, _, error = _apply(
        monkeypatch, layout,
        EditIntent(operation="move_wall", target_entity_id=custom.id),
    )
    assert error
    assert candidate.model_dump(mode="json") == original


def test_move_staircase_uses_one_foot_offset_inside_buildable_bounds(monkeypatch):
    layout = _layout(with_stair=True)
    layout.floors[0].rooms[1].rect.width = 5
    moved, diff, error = _apply(
        monkeypatch,
        layout,
        EditIntent(
            operation="move_staircase",
            target_entity_id="stair-1",
            constraints={"direction": "east"},
        ),
    )
    assert error is None
    assert diff["operation"] == "move_staircase"
    assert moved.floors[0].staircase.rect.x == 22


def test_intent_parser_classifies_entity_operations_and_ignores_llm_geometry(monkeypatch):
    layout = _layout(with_stair=True)
    custom_wall = edit_pipeline.Wall(
        id="editable-wall",
        x1=2, y1=10, x2=13, y2=10,
        adjacent_room_ids=["living"],
    )
    layout.floors[0].walls.append(custom_wall)
    layout.walls.append(custom_wall)
    monkeypatch.setattr(
        edit_pipeline,
        "interpret_modification_with_groq",
        lambda *_args, **_kwargs: NaturalLanguageModificationCommand(
            target_room_type="bedroom",
            operation="enlarge",
            delta_width=999,
            delta_length=999,
            target_value=999,
        ),
    )

    wall = edit_pipeline.interpret_edit_intent(
        "move wall editable-wall north",
        layout,
        target_entity_id="editable-wall",
    )
    assert wall.operation == "move_wall"
    assert wall.target_entity_id == "editable-wall"
    assert wall.constraints["direction"] == "north"
    assert wall.delta_width == 999
    assert wall.constraints.get("x") is None
    monkeypatch.setattr(
        edit_pipeline,
        "validate_design",
        lambda _layout: ArchitecturalValidation(is_valid=True),
    )
    moved_layout, _, error = edit_pipeline.apply_canonical_edit(
        layout,
        "move wall editable-wall north",
        target_entity_id="editable-wall",
    )
    assert error is None
    moved_custom = next(wall for wall in moved_layout.floors[0].walls if wall.id == "editable-wall")
    assert moved_custom.y1 == 9

    opening = edit_pipeline.interpret_edit_intent(
        "delete window",
        layout,
        target_entity_id=layout.floors[0].windows[0].id,
    )
    assert opening.operation == "delete_window"
    assert opening.target_entity_id == layout.floors[0].windows[0].id

    staircase = edit_pipeline.interpret_edit_intent(
        "move staircase east",
        layout,
        target_entity_id="stair-1",
    )
    assert staircase.operation == "move_staircase"
    assert staircase.constraints["direction"] == "east"


def test_ambiguous_duplicate_entity_id_is_rejected_unchanged(monkeypatch):
    layout = _layout()
    second_floor = layout.floors[0].model_copy(deep=True)
    second_floor.floor_number = 2
    second_floor.floor_id = "upper"
    layout.floors.append(second_floor)
    original = layout.model_dump(mode="json")
    candidate, _, error = _apply(
        monkeypatch,
        layout,
        EditIntent(
            operation="delete_window",
            target_entity_id=layout.floors[0].windows[0].id,
        ),
    )
    assert error
    assert candidate.model_dump(mode="json") == original


def test_selected_entity_id_is_used_for_delete_without_coordinates(monkeypatch):
    layout = _layout()
    custom_wall = edit_pipeline.Wall(
        id="selected-partition",
        x1=2, y1=10, x2=13, y2=10,
        adjacent_room_ids=["living"],
        metadata={"canonical_edit": True, "host_room_id": "living"},
    )
    layout.floors[0].walls.append(custom_wall)
    layout.walls.append(custom_wall)
    monkeypatch.setattr(
        edit_pipeline,
        "interpret_modification_with_groq",
        lambda *_args, **_kwargs: NaturalLanguageModificationCommand(
            target_room_type="living_room",
            operation="general_adjust",
        ),
    )
    monkeypatch.setattr(
        edit_pipeline,
        "validate_design",
        lambda _layout: ArchitecturalValidation(is_valid=True),
    )

    updated, diff, error = edit_pipeline.apply_canonical_edit(
        layout,
        "delete selected wall",
        target_entity_id=custom_wall.id,
    )

    assert error is None
    assert diff["operation"] == "delete_wall"
    assert all(wall.id != custom_wall.id for wall in updated.floors[0].walls)
    assert all(wall.id != custom_wall.id for wall in updated.walls)


def test_selected_canonical_interior_wall_can_be_deleted(monkeypatch):
    layout = _layout()
    interior_wall = next(wall for wall in layout.floors[0].walls if wall.wall_type == "interior")
    monkeypatch.setattr(
        edit_pipeline,
        "interpret_modification_with_groq",
        lambda *_args, **_kwargs: NaturalLanguageModificationCommand(
            target_room_type="living_room",
            operation="general_adjust",
        ),
    )
    monkeypatch.setattr(
        edit_pipeline,
        "validate_design",
        lambda _layout: ArchitecturalValidation(is_valid=True),
    )

    updated, diff, error = edit_pipeline.apply_canonical_edit(
        layout,
        "delete selected wall",
        target_entity_id=interior_wall.id,
    )

    assert error is None
    assert diff["operation"] == "delete_wall"
    assert all(wall.id != interior_wall.id for wall in updated.floors[0].walls)
    assert all(wall.id != interior_wall.id for wall in updated.walls)


def test_selected_wall_can_host_new_opening_intent(monkeypatch):
    layout = _layout()
    host_wall = next(wall for wall in layout.floors[0].walls if wall.wall_type == "interior")
    monkeypatch.setattr(
        edit_pipeline,
        "interpret_modification_with_groq",
        lambda *_args, **_kwargs: NaturalLanguageModificationCommand(
            target_room_type="living_room",
            operation="general_adjust",
        ),
    )

    intent = edit_pipeline.interpret_edit_intent(
        "add door to selected wall",
        layout,
        target_entity_id=host_wall.id,
    )

    assert intent.operation == "add_door"
    assert intent.target_entity_id == host_wall.id


def test_entity_validation_failure_rolls_back_candidate(monkeypatch):
    layout = _layout()
    custom_wall = edit_pipeline.Wall(
        id="custom-partition",
        x1=2, y1=10, x2=13, y2=10,
        adjacent_room_ids=["living"],
        metadata={"canonical_edit": True, "host_room_id": "living"},
    )
    layout.floors[0].walls.append(custom_wall)
    layout.walls.append(custom_wall)
    original = layout.model_dump(mode="json")
    monkeypatch.setattr(
        edit_pipeline,
        "interpret_edit_intent",
        lambda *_args, **_kwargs: EditIntent(
            operation="delete_wall",
            target_entity_id=custom_wall.id,
        ),
    )
    monkeypatch.setattr(
        edit_pipeline,
        "validate_design",
        lambda _layout: ArchitecturalValidation(is_valid=False, errors=["Candidate is invalid."]),
    )

    candidate, _, error = edit_pipeline.apply_canonical_edit(layout, "delete wall")

    assert error
    assert candidate.model_dump(mode="json") == original
