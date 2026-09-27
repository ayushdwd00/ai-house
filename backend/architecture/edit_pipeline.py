"""
Canonical edit pipeline:

User request → Groq EditIntent → architectural engine (OR-Tools/Shapely)
→ validate → save revision → invalidate derived outputs.

HouseLayout remains the single source of truth.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from models import (
    ConstructionSpecification, Door, EditIntent, FloorPlan, HouseLayout, Point2D,
    Rect, Room, Stair, StairGeometry, Wall, Window,
)
from ai.groq_service import interpret_modification_with_groq, NaturalLanguageModificationCommand
from ai.refinement_engine import refine_current_house_layout
from architecture.architectural_validator import validate_design
from architecture.furniture_validator import validate_and_place_furniture
from architecture.wall_network import generate_wall_network_and_openings
from construction.structural_planner import plan_preliminary_structure
from construction.building_services_engine import plan_building_services
from estimation.material_quantity_engine import calculate_material_quantities
from estimation.cost_estimator import estimate_construction_cost


INVALID_EDIT_MESSAGE = "That change could not be applied without breaking the layout."
ENTITY_EDIT_OPERATIONS = {
    "add_wall", "delete_wall", "move_wall", "resize_wall",
    "add_door", "delete_door", "move_door", "resize_door",
    "add_window", "delete_window", "move_window", "resize_window",
    "move_staircase",
}


def interpret_edit_intent(
    instruction: str,
    current_layout: HouseLayout,
    target_room_id: Optional[str] = None,
    target_entity_id: Optional[str] = None,
) -> EditIntent:
    rooms_summary = {
        "rooms": [
            {"id": r.id, "type": r.type, "name": r.name}
            for r in _all_rooms(current_layout)
        ]
    }
    cmd: NaturalLanguageModificationCommand = interpret_modification_with_groq(instruction, rooms_summary)
    lower = instruction.lower()

    operation = "general_adjust"
    target_type = cmd.target_room_type
    constraints: Dict[str, Any] = {}
    relationships: List[str] = []
    entity_edit, direction = _classify_entity_edit(instruction)

    all_entities = _layout_entities(current_layout)
    entity_kind = entity_edit.split("_")[-1] if entity_edit else None
    if entity_edit == "move_staircase":
        entity_kind = "staircase"
    provided_target = target_entity_id
    matched_entity_id = None
    if (
        provided_target
        and entity_edit in {"add_door", "add_window"}
        and provided_target in all_entities["wall"]
    ):
        matched_entity_id = provided_target
    if not provided_target and target_room_id and entity_kind in all_entities and target_room_id in all_entities[entity_kind]:
        provided_target = target_room_id
    else:
        provided_target = provided_target or target_room_id
    if not matched_entity_id and provided_target and provided_target in all_entities.get(entity_kind or "", {}):
        matched_entity_id = provided_target
    if not matched_entity_id:
        mentioned_ids = sorted(
            (entity_id for entities in all_entities.values() for entity_id in entities),
            key=len,
            reverse=True,
        )
        matched_entity_id = next((entity_id for entity_id in mentioned_ids if entity_id.lower() in lower), None)

    if entity_edit:
        operation = entity_edit
        constraints["direction"] = direction
        if operation.startswith("resize_"):
            constraints["size_delta"] = -1.0 if any(
                word in lower for word in ["smaller", "shorter", "narrower", "reduce", "shrink", "decrease"]
            ) else 1.0
        if operation == "add_wall":
            constraints["orientation"] = "vertical" if any(
                word in lower for word in ["vertical", "north-south", "north south"]
            ) else "horizontal"
        target_type = operation.split("_")[-1]
    elif any(k in lower for k in ["plot", "setback"]) and any(k in lower for k in ["change", "increase", "decrease", "dimension", "x"]):
        operation = "change_plot_dimensions"
        dim = __import__("re").search(r"(\d{2,3})\s*(?:x|by|\*|×)\s*(\d{2,3})", lower)
        if dim:
            constraints["plot_width"] = float(dim.group(1))
            constraints["plot_length"] = float(dim.group(2))
    elif "parking" in lower or cmd.operation == "set_parking":
        operation = "change_parking"
        constraints["increase_area"] = "increase" in lower or "more" in lower or "add" in lower
    elif any(k in lower for k in ["remove", "delete", "drop"]) and any(k in lower for k in ["bedroom", "bathroom", "room", "balcony"]):
        operation = "remove_room"
    elif "balcony" in lower and any(k in lower for k in ["add", "new", "create"]):
        operation = "add_balcony"
        target_type = "balcony"
    elif any(k in lower for k in ["add one bedroom", "add a bedroom", "another bedroom", "add bedroom"]):
        operation = "add_room"
        target_type = "bedroom"
        constraints["room_type"] = "bedroom"
    elif cmd.operation == "add_attached_bath" or ("attached" in lower and "bath" in lower):
        operation = "add_attached_bathroom"
    elif "stair" in lower and any(k in lower for k in ["move", "relocate", "shift"]):
        operation = "move_staircase"
        target_type = "staircase"
    elif any(k in lower for k in ["entrance", "entry", "front door"]) and any(k in lower for k in ["change", "move", "relocate", "shift"]):
        operation = "change_entrance"
        target_type = "entry_foyer"
    elif cmd.operation in ("relocate_closer",) or any(k in lower for k in ["move", "closer", "near", "rear", "front"]):
        operation = "move_room"
        if cmd.partner_room:
            relationships.append(f"near_{cmd.partner_room}")
        if "rear" in lower:
            relationships.append("toward_rear")
        if "dining" in lower:
            relationships.append("near_dining")
        if "utility" in lower:
            relationships.append("near_utility")
    elif cmd.operation in ("enlarge", "shrink") or any(k in lower for k in ["bigger", "larger", "smaller", "resize", "expand"]):
        operation = "resize_room"
        constraints["increase_area"] = cmd.operation != "shrink" and "small" not in lower
        if target_type in ("master_bedroom",):
            constraints["preserve_adjacencies"] = ["master_bath", "dressing", "bathroom"]

    matched_id = target_room_id if target_room_id in all_entities["room"] else None
    if matched_entity_id and not matched_id:
        matched_id = _classify_target_room(current_layout, matched_entity_id)
    if not matched_id and target_type:
        for r in _all_rooms(current_layout):
            if r.type == target_type or target_type in (r.id or "") or target_type in (r.name or "").lower().replace(" ", "_"):
                matched_id = r.id
                break

    return EditIntent(
        operation=operation,
        target_room_id=matched_id,
        target_room_type=target_type,
        target_entity_id=matched_entity_id,
        constraints=constraints,
        relationship_constraints=relationships,
        delta_width=cmd.delta_width,
        delta_length=cmd.delta_length,
        target_value=cmd.target_value,
        architectural_rationale=cmd.architectural_rationale or f"Apply '{instruction}' to canonical HouseLayout.",
        llm_source=cmd.llm_source,
    )


def apply_canonical_edit(
    current_layout: HouseLayout,
    instruction: str,
    target_room_id: Optional[str] = None,
    target_entity_id: Optional[str] = None,
) -> Tuple[HouseLayout, Dict[str, Any], Optional[str]]:
    """
    Returns (layout, diff, error).
    On failure, returns the original layout unchanged plus error message.
    """
    original = current_layout.model_copy(deep=True)
    baseline_entity_errors = set(_validate_entity_geometry(original))
    intent = interpret_edit_intent(instruction, current_layout, target_room_id, target_entity_id)

    try:
        entity_action = intent.operation.split("_", 1)[0] if intent.operation != "move_staircase" else "move"
        if intent.operation in ENTITY_EDIT_OPERATIONS and entity_action not in {"add"} and not intent.target_entity_id:
            return original, {"status": "rejected", "edit_intent": intent.model_dump()}, "A target wall, door, or window ID is required."
        if intent.operation == "add_wall" and not intent.target_room_id:
            return original, {"status": "rejected", "edit_intent": intent.model_dump()}, "Adding a wall requires a target room ID."
        if intent.operation in {"add_door", "add_window"} and not intent.target_entity_id and not intent.target_room_id:
            return original, {"status": "rejected", "edit_intent": intent.model_dump()}, "Adding an opening requires a target room or wall ID."
        if intent.operation == "move_staircase" and not intent.target_entity_id and not intent.target_room_id:
            return original, {"status": "rejected", "edit_intent": intent.model_dump()}, "A target staircase ID is required."
        if intent.operation in ENTITY_EDIT_OPERATIONS:
            candidate = current_layout.model_copy(deep=True)
            updated, diff = _apply_entity_edit(candidate, intent)
        elif intent.operation == "remove_room":
            updated, diff = _remove_room(original.model_copy(deep=True), intent)
        elif intent.operation == "add_room":
            updated, diff = _add_program_room(original.model_copy(deep=True), intent, "bedroom")
        elif intent.operation == "add_balcony":
            updated, diff = _add_program_room(original.model_copy(deep=True), intent, "balcony")
        elif intent.operation == "change_plot_dimensions":
            updated, diff = _change_plot(original.model_copy(deep=True), intent, instruction)
        else:
            mapped = _instruction_for_engine(instruction, intent)
            updated, diff = refine_current_house_layout(
                current_layout=original.model_copy(deep=True),
                instruction=mapped,
                target_room_id=intent.target_room_id,
            )
    except Exception as e:
        return original, {"status": "rejected", "edit_intent": intent.model_dump()}, f"{INVALID_EDIT_MESSAGE} ({e})"

    if not updated or getattr(diff, "get", lambda *_: None)("status") == "unmodified":
        return original, {"status": "rejected", "edit_intent": intent.model_dump(), **(diff or {})}, INVALID_EDIT_MESSAGE

    validation = validate_design(updated)
    updated.validation = validation
    if intent.operation in ENTITY_EDIT_OPERATIONS:
        geometry_errors = [
            error for error in _validate_entity_geometry(updated)
            if error not in baseline_entity_errors
        ]
        if geometry_errors:
            return original, {
                "status": "rejected",
                "edit_intent": intent.model_dump(),
                "errors": geometry_errors[:5],
            }, INVALID_EDIT_MESSAGE
    if intent.operation in ENTITY_EDIT_OPERATIONS and validation and not validation.is_valid:
        errors = validation.errors or validation.hard_failures
        return original, {"status": "rejected", "edit_intent": intent.model_dump(), "errors": errors[:5]}, INVALID_EDIT_MESSAGE
    if validation and validation.is_valid is False and (validation.errors or []):
        blocking = [e for e in (validation.errors or []) if "overlap" in str(e).lower() or "envelope" in str(e).lower()]
        if blocking:
            return original, {"status": "rejected", "edit_intent": intent.model_dump(), "errors": blocking}, INVALID_EDIT_MESSAGE

    updated.parent_revision_id = original.revision_id or f"rev_{original.version_number or 1}"
    updated.id = original.id
    updated.project_id = original.project_id or original.id
    diff = dict(diff or {})
    diff["edit_intent"] = intent.model_dump()
    diff["status"] = "applied"
    return updated, diff, None


def _instruction_for_engine(instruction: str, intent: EditIntent) -> str:
    if intent.operation == "add_attached_bathroom":
        return instruction if "bath" in instruction.lower() else f"Add attached bathroom to {intent.target_room_type or 'bedroom'}"
    if intent.operation == "move_staircase":
        return instruction if "stair" in instruction.lower() else "Move the staircase"
    if intent.operation == "change_entrance":
        return instruction
    if intent.operation == "change_parking":
        return instruction
    return instruction


def _classify_entity_edit(instruction: str) -> Tuple[str, Optional[str]]:
    lower = instruction.lower()
    kind = None
    if any(word in lower for word in ("staircase", "stairs", "stair")):
        kind = "staircase"
    elif "window" in lower:
        kind = "window"
    elif "door" in lower or "opening" in lower:
        kind = "door"
    elif "wall" in lower:
        kind = "wall"
    if not kind:
        return "", None

    if any(word in lower for word in ("delete", "remove", "demolish")):
        action = "delete"
    elif any(word in lower for word in ("move", "relocate", "shift")):
        action = "move"
    elif any(word in lower for word in (
        "resize", "wider", "narrower", "shorter", "longer", "larger", "smaller", "bigger", "expand"
    )):
        action = "resize"
    elif any(word in lower for word in ("add", "create", "new", "install")):
        action = "add"
    else:
        return "", None

    if kind == "staircase":
        return ("move_staircase" if action == "move" else ""), _movement_direction(lower)
    return f"{action}_{kind}", _movement_direction(lower)


def _movement_direction(lower: str) -> Optional[str]:
    for word, direction in (
        ("north", "north"), ("up", "north"),
        ("south", "south"), ("down", "south"),
        ("east", "east"), ("right", "east"),
        ("west", "west"), ("left", "west"),
    ):
        if re.search(rf"\b{re.escape(word)}\b", lower):
            return direction
    return None


def _layout_entities(layout: HouseLayout) -> Dict[str, Dict[str, Any]]:
    entities: Dict[str, Dict[str, Any]] = {kind: {} for kind in ("wall", "door", "window", "staircase", "room")}
    for floor in layout.floors or []:
        for kind, values in (
            ("wall", floor.walls), ("door", floor.doors), ("window", floor.windows), ("room", floor.rooms)
        ):
            entities[kind].update({entity.id: entity for entity in values or []})
        for entity in floor.walls + floor.doors + floor.windows + floor.rooms:
            if entity.floor_id:
                entities.setdefault(f"floor:{entity.floor_id}", {})
                entities[f"floor:{entity.floor_id}"][entity.id] = entity
        stair = floor.staircase
        if stair is not None:
            stair_id = getattr(stair, "id", None) or f"staircase_{floor.floor_id or floor.floor_number}"
            entities["staircase"][stair_id] = stair
    for kind in ("wall", "door", "window", "room"):
        flat_values = getattr(layout, f"{kind}s", []) or []
        entities[kind].update({entity.id: entity for entity in flat_values})
    return entities


def _classify_target_room(layout: HouseLayout, target_id: Optional[str]) -> Optional[str]:
    if target_id and target_id in _layout_entities(layout)["room"]:
        return target_id
    entity = next(
        (entities[target_id] for kind, entities in _layout_entities(layout).items()
         if kind != "room" and target_id in entities),
        None,
    ) if target_id else None
    if entity is not None:
        room_ids = getattr(entity, "adjacent_room_ids", None) or [
            getattr(entity, "room_id", None), getattr(entity, "from_room_id", None),
            getattr(entity, "to_room_id", None),
        ]
        return next((room_id for room_id in room_ids if room_id in _layout_entities(layout)["room"]), None)
    return None


def _ensure_edit_floor(layout: HouseLayout) -> None:
    if layout.floors:
        return
    layout.floors = [FloorPlan(
        floor_number=1,
        floor_name="Ground Floor",
        rooms=layout.rooms,
        walls=layout.walls,
        doors=layout.doors,
        windows=layout.windows,
        staircase=None,
    )]
    layout.floors[0].exterior_walls = layout.exterior_walls
    layout.floors[0].interior_walls = layout.interior_walls


def _sync_edit_floor(layout: HouseLayout, floor_idx: int) -> None:
    floor = layout.floors[floor_idx]
    if floor_idx == 0:
        layout.rooms = floor.rooms
        layout.walls = floor.walls
        layout.exterior_walls = floor.exterior_walls
        layout.interior_walls = floor.interior_walls
        layout.doors = floor.doors
        layout.windows = floor.windows


def _get_wall_points(wall: Wall) -> Tuple[float, float, float, float]:
    return (
        float(wall.start.x if wall.start else wall.x1),
        float(wall.start.y if wall.start else wall.y1),
        float(wall.end.x if wall.end else wall.x2),
        float(wall.end.y if wall.end else wall.y2),
    )


def _same_segment(first: Wall, second: Wall, tolerance: float = 0.05) -> bool:
    a = _get_wall_points(first)
    b = _get_wall_points(second)
    direct = max(abs(a[i] - b[i]) for i in range(4))
    reverse = max(abs(a[0] - b[2]), abs(a[1] - b[3]), abs(a[2] - b[0]), abs(a[3] - b[1]))
    return min(direct, reverse) <= tolerance


def _wall_length(wall: Wall) -> float:
    x1, y1, x2, y2 = _get_wall_points(wall)
    return ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5


def _sync_wall_opening_metrics(floor: FloorPlan, wall: Wall) -> None:
    hosted_doors = [door for door in floor.doors if door.wall_id == wall.id]
    hosted_windows = [window for window in floor.windows if window.wall_id == wall.id]
    wall.openings = [item.id for item in hosted_doors + hosted_windows]
    gross_area = _wall_length(wall) * wall.height
    opening_area = sum(item.width * item.height for item in hosted_doors + hosted_windows)
    wall.net_surface_area_sqft = round(max(0.0, gross_area - opening_area), 2)
    wall.volume_cuft = round(wall.net_surface_area_sqft * wall.thickness, 2)


def _validate_entity_geometry(layout: HouseLayout) -> List[str]:
    errors = []
    for floor in layout.floors:
        walls = {wall.id: wall for wall in floor.walls}
        for wall in floor.walls:
            if _wall_length(wall) < 0.1 or wall.thickness <= 0 or wall.height <= 0:
                errors.append(f"Wall '{wall.id}' has invalid geometry.")
        for collection in (floor.doors, floor.windows):
            for opening in collection:
                host = walls.get(opening.wall_id)
                if not host:
                    errors.append(f"Opening '{opening.id}' has no valid host wall.")
                    continue
                x1, y1, x2, y2 = _get_wall_points(host)
                dx, dy = x2 - x1, y2 - y1
                length = (dx * dx + dy * dy) ** 0.5
                expected_x = x1 + opening.position_along_wall * dx
                expected_y = y1 + opening.position_along_wall * dy
                if length < opening.width + 0.5:
                    errors.append(f"Opening '{opening.id}' exceeds the length of its host wall.")
                    continue
                if abs(expected_x - opening.x) > 0.25 or abs(expected_y - opening.y) > 0.25:
                    errors.append(f"Opening '{opening.id}' is not positioned on its host wall.")
                if opening.id not in host.openings:
                    errors.append(f"Host wall '{host.id}' does not reference opening '{opening.id}'.")
        for wall in floor.walls:
            hosted = [
                item for item in floor.doors + floor.windows if item.wall_id == wall.id
            ]
            length = _wall_length(wall)
            for idx, first in enumerate(hosted):
                for second in hosted[idx + 1:]:
                    separation = abs(first.position_along_wall - second.position_along_wall) * length
                    if separation < (first.width + second.width) / 2.0:
                        errors.append(f"Openings '{first.id}' and '{second.id}' overlap on wall '{wall.id}'.")
    return errors


def _room_for_wall(layout: HouseLayout, wall: Wall, target_room_id: Optional[str]) -> Optional[Room]:
    rooms = _layout_entities(layout)["room"]
    if target_room_id in rooms:
        return rooms[target_room_id]
    room_ids = wall.adjacent_room_ids or wall.room_ids
    return next((rooms[room_id] for room_id in room_ids if room_id in rooms), None)


def _wall_fits_room(wall: Wall, room: Room, margin: float = 0.05) -> bool:
    if not room.rect:
        return False
    x1, y1, x2, y2 = _get_wall_points(wall)
    rect = room.rect
    return (
        rect.x + margin <= min(x1, x2) <= max(x1, x2) <= rect.right - margin
        and rect.y + margin <= min(y1, y2) <= max(y1, y2) <= rect.bottom - margin
    )


def _canonical_geometry(layout: HouseLayout, floor: FloorPlan):
    return generate_wall_network_and_openings(
        floor.rooms,
        layout.site,
        floor.wall_height_ft,
        construction_spec=layout.construction_spec,
    )


def _apply_entity_edit(layout: HouseLayout, intent: EditIntent) -> Tuple[HouseLayout, Dict[str, Any]]:
    updated = layout.model_copy(deep=True)
    _ensure_edit_floor(updated)
    selected_id = intent.target_entity_id
    if intent.operation == "move_staircase" and not selected_id:
        staircase_floors = [
            idx for idx, floor in enumerate(updated.floors)
            if floor.staircase is not None
        ]
        if len(staircase_floors) != 1:
            return layout, {"status": "unmodified", "reason": "A unique target staircase is required."}
        floor_idx = staircase_floors[0]
    else:
        floor_idx = None
    if not selected_id and intent.target_room_id:
        selected_id = intent.target_room_id if intent.target_room_id in _layout_entities(updated).get(intent.operation.split("_")[-1], {}) else None
    if not intent.target_room_id:
        intent.target_room_id = _classify_target_room(updated, selected_id)

    if floor_idx is None:
        floor_idx = next(
            (
                idx for idx, floor in enumerate(updated.floors)
                if selected_id and (
                    any(entity.id == selected_id for entity in floor.walls + floor.doors + floor.windows + floor.rooms)
                    or getattr(floor.staircase, "id", None) == selected_id
                )
            ),
            0,
        )
    if selected_id and sum(
        any(entity.id == selected_id for entity in floor.walls + floor.doors + floor.windows + floor.rooms)
        or getattr(floor.staircase, "id", None) == selected_id
        for floor in updated.floors
    ) > 1:
        return layout, {"status": "unmodified", "reason": "The selected entity ID is ambiguous across floors."}
    floor = updated.floors[floor_idx]
    op = intent.operation
    if op == "move_staircase":
        return _move_staircase(updated, floor_idx, intent)
    if op.endswith("_wall"):
        intent.target_room_id = intent.target_room_id or selected_id
        return _edit_wall(updated, floor_idx, intent, selected_id)
    if op.endswith("_door") or op.endswith("_window"):
        return _edit_opening(updated, floor_idx, intent, selected_id)
    return layout, {"status": "unmodified", "reason": f"Unsupported operation '{op}'"}


def _edit_wall(
    layout: HouseLayout, floor_idx: int, intent: EditIntent, selected_id: Optional[str]
) -> Tuple[HouseLayout, Dict[str, Any]]:
    from shapely.geometry import LineString

    floor = layout.floors[floor_idx]
    op = intent.operation
    canonical_walls, _, _ = _canonical_geometry(layout, floor)
    if op == "add_wall":
        room = _room_for_wall(layout, Wall(id="room-target", adjacent_room_ids=[intent.target_room_id] if intent.target_room_id else []), intent.target_room_id)
        if not room or not room.rect:
            return layout, {"status": "unmodified", "reason": "Adding a wall requires a target room with canonical bounds."}
        orientation = intent.constraints.get("orientation", "horizontal")
        rect = room.rect
        if orientation == "vertical":
            x = round(rect.x + rect.width / 2.0, 2)
            start, end = Point2D(x=x, y=rect.y + 0.5), Point2D(x=x, y=rect.bottom - 0.5)
        else:
            y = round(rect.y + rect.length / 2.0, 2)
            start, end = Point2D(x=rect.x + 0.5, y=y), Point2D(x=rect.right - 0.5, y=y)
        existing_wall_ids = {wall.id for wall in floor.walls}
        suffix = 1
        while f"edit_wall_{suffix}" in existing_wall_ids:
            suffix += 1
        wall_id = f"edit_wall_{suffix}"
        candidate_wall = Wall(
            id=wall_id,
            start=start,
            end=end,
            thickness=(layout.construction_spec.internal_wall_thickness_ft if layout.construction_spec else 0.375),
            height=(layout.construction_spec.wall_height_ft if layout.construction_spec else floor.wall_height_ft),
            wall_type="interior",
            adjacent_room_ids=[room.id],
            metadata={"canonical_edit": True, "host_room_id": room.id},
        )
        line = LineString([(start.x, start.y), (end.x, end.y)])
        if _wall_length(candidate_wall) < 3.0 or any(
            line.distance(LineString([(_get_wall_points(w)[0], _get_wall_points(w)[1]), (_get_wall_points(w)[2], _get_wall_points(w)[3])])) < 0.1
            for w in floor.walls
        ):
            return layout, {"status": "unmodified", "reason": "The target room has no clear space for a new partition."}
        # The shared generator defines canonical room-boundary geometry; never duplicate it.
        if any(_same_segment(candidate_wall, canonical) for canonical in canonical_walls):
            return layout, {"status": "unmodified", "reason": "The proposed partition duplicates a canonical wall."}
        floor.walls.append(candidate_wall)
        floor.interior_walls.append(candidate_wall)
        _sync_wall_opening_metrics(floor, candidate_wall)
        _sync_edit_floor(layout, floor_idx)
        return layout, {"operation": op, "modified_element": wall_id}

    wall = next((wall for wall in floor.walls if wall.id == selected_id), None)
    if not wall:
        return layout, {"status": "unmodified", "reason": "A valid target wall is required."}
    is_generated_wall = any(_same_segment(wall, canonical) for canonical in canonical_walls)
    if is_generated_wall and op != "delete_wall":
        return layout, {"status": "unmodified", "reason": "Canonical room-boundary and exterior walls cannot be independently changed."}
    if is_generated_wall and wall.wall_type == "exterior":
        return layout, {"status": "unmodified", "reason": "Exterior envelope walls cannot be deleted independently of the room geometry."}
    host_room = _room_for_wall(layout, wall, intent.target_room_id)
    if not host_room or not host_room.rect:
        return layout, {"status": "unmodified", "reason": "The target wall has no containing room context."}

    if op == "delete_wall":
        removed_opening_ids = {entity.id for entity in floor.doors + floor.windows if entity.wall_id == wall.id}
        floor.walls = [item for item in floor.walls if item.id != wall.id]
        floor.interior_walls = [item for item in floor.interior_walls if item.id != wall.id]
        floor.exterior_walls = [item for item in floor.exterior_walls if item.id != wall.id]
        floor.doors = [item for item in floor.doors if item.id not in removed_opening_ids]
        floor.windows = [item for item in floor.windows if item.id not in removed_opening_ids]
        for room in floor.rooms:
            room.door_ids = [entity_id for entity_id in room.door_ids if entity_id not in removed_opening_ids]
            room.window_ids = [entity_id for entity_id in room.window_ids if entity_id not in removed_opening_ids]
        _sync_edit_floor(layout, floor_idx)
        return layout, {"operation": op, "modified_element": wall.id}

    x1, y1, x2, y2 = _get_wall_points(wall)
    if op == "move_wall":
        direction = intent.constraints.get("direction")
        if not direction:
            return layout, {"status": "unmodified", "reason": "Moving a wall requires a cardinal direction in the instruction."}
        horizontal = abs(y2 - y1) <= abs(x2 - x1)
        dx, dy = {
            "north": (0, -1), "south": (0, 1), "east": (1, 0), "west": (-1, 0),
        }.get(direction, (0, 0))
        if (horizontal and dy == 0) or (not horizontal and dx == 0):
            return layout, {"status": "unmodified", "reason": "A wall can only move perpendicular to its length."}
        x1, x2, y1, y2 = x1 + dx, x2 + dx, y1 + dy, y2 + dy
    elif op == "resize_wall":
        delta = float(intent.constraints.get("size_delta", 1.0))
        if _wall_length(wall) + delta < 3.0:
            return layout, {"status": "unmodified", "reason": "A wall must remain at least 3 feet long."}
        if abs(y2 - y1) <= abs(x2 - x1):
            x1, x2 = x1 - delta / 2.0, x2 + delta / 2.0
        else:
            y1, y2 = y1 - delta / 2.0, y2 + delta / 2.0

    changed = Wall.model_validate({
        **wall.model_dump(),
        "start": {"x": x1, "y": y1},
        "end": {"x": x2, "y": y2},
        "x1": x1, "y1": y1, "x2": x2, "y2": y2,
    })
    if not _wall_fits_room(changed, host_room):
        return layout, {"status": "unmodified", "reason": "The edited wall would leave its target room bounds."}
    new_line = LineString([(x1, y1), (x2, y2)])
    if any(
        other.id != wall.id and new_line.distance(LineString([(_get_wall_points(other)[0], _get_wall_points(other)[1]), (_get_wall_points(other)[2], _get_wall_points(other)[3])])) < 0.1
        for other in floor.walls
    ):
        return layout, {"status": "unmodified", "reason": "The edited wall would collide with another wall."}
    if any(entity.wall_id == wall.id for entity in floor.doors + floor.windows):
        return layout, {"status": "unmodified", "reason": "Move or remove wall-hosted doors/windows before changing this wall."}
    floor.walls = [changed if item.id == wall.id else item for item in floor.walls]
    floor.interior_walls = [changed if item.id == wall.id else item for item in floor.interior_walls]
    floor.exterior_walls = [changed if item.id == wall.id else item for item in floor.exterior_walls]
    _sync_wall_opening_metrics(floor, changed)
    _sync_edit_floor(layout, floor_idx)
    return layout, {"operation": op, "modified_element": wall.id}


def _edit_opening(
    layout: HouseLayout, floor_idx: int, intent: EditIntent, selected_id: Optional[str]
) -> Tuple[HouseLayout, Dict[str, Any]]:
    floor = layout.floors[floor_idx]
    is_door = intent.operation.endswith("_door")
    collection = floor.doors if is_door else floor.windows
    walls = floor.walls
    helper_walls, helper_doors, helper_windows = _canonical_geometry(layout, floor)
    is_add = intent.operation.startswith("add_")
    if is_add:
        target_wall = next((wall for wall in walls if wall.id == selected_id), None)
        if not target_wall:
            room = _layout_entities(layout)["room"].get(intent.target_room_id)
            candidates = [
                wall for wall in walls
                if room and room.id in wall.adjacent_room_ids
                and (wall.wall_type == "exterior" if not is_door else wall.wall_type == "interior")
            ]
            target_wall = max(candidates, key=_wall_length) if candidates else None
        if not target_wall:
            return layout, {"status": "unmodified", "reason": "Adding an opening requires a target room or hosted wall."}
        generated = helper_doors if is_door else helper_windows
        helper_candidate = next(
            (
                opening for opening in generated
                if any(_same_segment(target_wall, generated_wall) and opening.wall_id == generated_wall.id
                       for generated_wall in helper_walls)
            ),
            None,
        )
        if helper_candidate is None:
            helper_candidate = next(
                (
                    opening for opening in generated
                    if (
                        (getattr(opening, "door_type", "") != "entrance")
                        == (target_wall.wall_type == "interior")
                    )
                ),
                None,
            )
        if helper_candidate is None:
            return layout, {"status": "unmodified", "reason": "The canonical wall/opening helper has no compatible opening geometry."}
        target_length = _wall_length(target_wall)
        width = helper_candidate.width
        if target_length < width + 0.5:
            return layout, {"status": "unmodified", "reason": "The target wall is too short for this opening."}
        position_along_wall = next(
            (
                t for t in (0.5, 0.25, 0.75, 0.375, 0.625)
                if t * target_length >= width / 2.0 + 0.25
                and (1.0 - t) * target_length >= width / 2.0 + 0.25
                and not any(
                    opening.wall_id == target_wall.id
                    and abs(opening.position_along_wall - t) * target_length < (opening.width + width) / 2.0 + 0.25
                    for opening in collection
                )
            ),
            None,
        )
        if position_along_wall is None:
            return layout, {"status": "unmodified", "reason": "The target wall has no clear space for another opening."}
        existing_ids = {item.id for item in collection}
        prefix = "edit_door" if is_door else "edit_window"
        suffix = 1
        while f"{prefix}_{suffix}" in existing_ids:
            suffix += 1
        new_id = f"{prefix}_{suffix}"
        x1, y1, x2, y2 = _get_wall_points(target_wall)
        px = x1 + position_along_wall * (x2 - x1)
        py = y1 + position_along_wall * (y2 - y1)
        horizontal = abs(y2 - y1) <= abs(x2 - x1)
        half = width / 2.0
        payload = helper_candidate.model_dump()
        payload.update({
            "id": new_id,
            "wall_id": target_wall.id,
            "host_wall_id": target_wall.id,
            "position_along_wall": position_along_wall,
            "position": {"x": px, "y": py},
            "x": px, "y": py,
            "x1": px - half if horizontal else px,
            "y1": py if horizontal else py - half,
            "x2": px + half if horizontal else px,
            "y2": py if horizontal else py + half,
        })
        if is_door and payload.get("clearance_zone"):
            payload["clearance_zone"] = {
                **payload["clearance_zone"],
                "x": max(0.0, px - half),
                "y": max(0.0, py - half),
            }
        opening = Door.model_validate(payload) if is_door else Window.model_validate(payload)
        collection.append(opening)
        target_wall.openings.append(new_id)
        _sync_wall_opening_metrics(floor, target_wall)
        _sync_edit_floor(layout, floor_idx)
        return layout, {"operation": intent.operation, "modified_element": new_id}

    opening = next((item for item in collection if item.id == selected_id), None)
    if not opening:
        return layout, {"status": "unmodified", "reason": f"A valid target {'door' if is_door else 'window'} is required."}
    host = next((wall for wall in walls if wall.id == opening.wall_id), None)
    if not host:
        return layout, {"status": "unmodified", "reason": "The target opening has no valid host wall."}
    if intent.operation.startswith("delete_"):
        collection.remove(opening)
        host.openings = [opening_id for opening_id in host.openings if opening_id != opening.id]
        for room in floor.rooms:
            if is_door:
                room.door_ids = [entity_id for entity_id in room.door_ids if entity_id != opening.id]
            else:
                room.window_ids = [entity_id for entity_id in room.window_ids if entity_id != opening.id]
        _sync_wall_opening_metrics(floor, host)
        _sync_edit_floor(layout, floor_idx)
        return layout, {"operation": intent.operation, "modified_element": opening.id}

    direction = intent.constraints.get("direction")
    along_delta = 0.0
    if intent.operation.startswith("move_"):
        if not direction:
            return layout, {"status": "unmodified", "reason": "Moving an opening requires a cardinal direction in the instruction."}
        x1, y1, x2, y2 = _get_wall_points(host)
        horizontal = abs(y2 - y1) <= abs(x2 - x1)
        along_delta = {"east": 1.0, "west": -1.0}.get(direction, 0.0) if horizontal else {"south": 1.0, "north": -1.0}.get(direction, 0.0)
        if not along_delta:
            return layout, {"status": "unmodified", "reason": "The opening can only move along its host wall."}
    old_t = opening.position_along_wall
    new_t = old_t + along_delta / max(0.01, _wall_length(host))
    new_width = opening.width
    if intent.operation.startswith("resize_"):
        new_width += float(intent.constraints.get("size_delta", 0.5)) * 0.5
    wall_length = _wall_length(host)
    if new_width <= 1.0 or new_t * wall_length < new_width / 2.0 + 0.25 or (1.0 - new_t) * wall_length < new_width / 2.0 + 0.25:
        return layout, {"status": "unmodified", "reason": "The edited opening would not fit safely within its host wall."}
    for other in collection:
        if other.id == opening.id or other.wall_id != opening.wall_id:
            continue
        separation = abs(other.position_along_wall - new_t) * wall_length
        if separation < (other.width + new_width) / 2.0 + 0.25:
            return layout, {"status": "unmodified", "reason": "The edited opening would overlap another opening."}

    x1, y1, x2, y2 = _get_wall_points(host)
    px, py = x1 + new_t * (x2 - x1), y1 + new_t * (y2 - y1)
    horizontal = abs(y2 - y1) <= abs(x2 - x1)
    half = new_width / 2.0
    payload = opening.model_dump()
    payload.update({
        "position_along_wall": new_t,
        "position": {"x": px, "y": py},
        "x": px, "y": py,
        "x1": px - half if horizontal else px,
        "y1": py if horizontal else py - half,
        "x2": px + half if horizontal else px,
        "y2": py if horizontal else py + half,
        "width": new_width,
    })
    if is_door and payload.get("clearance_zone") is not None:
        clearance = payload["clearance_zone"]
        clearance.update({
            "x": clearance.get("x", 0.0) + px - opening.x,
            "y": clearance.get("y", 0.0) + py - opening.y,
        })
    changed = Door.model_validate(payload) if is_door else Window.model_validate(payload)
    collection[:] = [changed if item.id == opening.id else item for item in collection]
    _sync_wall_opening_metrics(floor, host)
    _sync_edit_floor(layout, floor_idx)
    return layout, {"operation": intent.operation, "modified_element": opening.id}


def _move_staircase(
    layout: HouseLayout, floor_idx: int, intent: EditIntent
) -> Tuple[HouseLayout, Dict[str, Any]]:
    stair_floors = [fp for fp in layout.floors if fp.staircase is not None]
    if len(stair_floors) > 1:
        return layout, {"status": "unmodified", "reason": "Moving a multi-floor staircase stack is not supported."}
    floor = layout.floors[floor_idx]
    stair = floor.staircase
    if isinstance(stair, Rect):
        shape = stair
        stair_id = f"staircase_{floor.floor_id or floor.floor_number}"
    elif isinstance(stair, (Stair, StairGeometry)):
        shape = stair.rect
        stair_id = stair.id
    else:
        return layout, {"status": "unmodified", "reason": "The target floor has no canonical staircase geometry."}
    if intent.target_entity_id and intent.target_entity_id not in (stair_id, getattr(stair, "id", None)):
        return layout, {"status": "unmodified", "reason": "The selected staircase does not exist on the target floor."}
    direction = intent.constraints.get("direction")
    if not direction:
        return layout, {"status": "unmodified", "reason": "Moving the staircase requires a cardinal direction in the instruction."}
    dx, dy = {
        "north": (0.0, -1.0), "south": (0.0, 1.0),
        "east": (1.0, 0.0), "west": (-1.0, 0.0),
    }[direction]
    moved = Rect(x=shape.x + dx, y=shape.y + dy, width=shape.width, length=shape.length)
    bounds = layout.site.buildable_envelope if layout.site and layout.site.buildable_envelope else Rect(
        x=0, y=0, width=layout.plot_width, length=layout.plot_length
    )
    if moved.x < bounds.x or moved.y < bounds.y or moved.right > bounds.right or moved.bottom > bounds.bottom:
        return layout, {"status": "unmodified", "reason": "The moved staircase would leave the buildable bounds."}
    from shapely.geometry import box as shape_box
    stair_shape = shape_box(moved.x, moved.y, moved.right, moved.bottom)
    for room in floor.rooms:
        if not room.rect or room.type == "staircase":
            continue
        room_shape = shape_box(room.rect.x, room.rect.y, room.rect.right, room.rect.bottom)
        if stair_shape.intersection(room_shape).area > 0.25:
            return layout, {"status": "unmodified", "reason": "The moved staircase would overlap a non-staircase room."}
    if isinstance(stair, Rect):
        floor.staircase = moved
    else:
        stair_payload = stair.model_dump()
        stair_payload["rect"] = moved.model_dump()
        floor.staircase = type(stair).model_validate(stair_payload)
    return layout, {"operation": intent.operation, "modified_element": stair_id}


def _all_rooms(layout: HouseLayout) -> List[Room]:
    rooms = []
    for fp in layout.floors or []:
        rooms.extend(fp.rooms or [])
    return rooms or list(layout.rooms or [])


def _rebuild_floor_derived(layout: HouseLayout, floor_idx: int) -> HouseLayout:
    spec = layout.construction_spec or ConstructionSpecification()
    fp = layout.floors[floor_idx]
    for r in fp.rooms:
        items, _, _ = validate_and_place_furniture(r)
        r.furniture = items
    walls, doors, windows = generate_wall_network_and_openings(
        fp.rooms, layout.site, wall_height=spec.wall_height_ft, construction_spec=spec
    )
    fp.walls = walls
    fp.doors = doors
    fp.windows = windows
    fp.exterior_walls = [w for w in walls if w.wall_type == "exterior"]
    fp.interior_walls = [w for w in walls if w.wall_type == "interior"]
    if floor_idx == 0:
        layout.rooms = fp.rooms
        layout.walls = walls
        layout.doors = doors
        layout.windows = windows
        layout.exterior_walls = fp.exterior_walls
        layout.interior_walls = fp.interior_walls
    layout.quantities = calculate_material_quantities(layout, spec)
    layout.cost_estimate = estimate_construction_cost(layout, layout.quantities)
    layout.building_services = plan_building_services(layout.floors, layout.plot_width, layout.plot_length)
    layout.structural_planning = plan_preliminary_structure(
        layout.floors, spec, site=layout.site,
        plot_width=layout.plot_width, plot_length=layout.plot_length, layout=layout
    )
    layout.validation = validate_design(layout)
    layout.version_number = (layout.version_number or 1) + 1
    return layout


def _remove_room(layout: HouseLayout, intent: EditIntent) -> Tuple[HouseLayout, Dict[str, Any]]:
    new_layout = layout.model_copy(deep=True)
    target_id = intent.target_room_id
    removed = None
    floor_idx = 0
    for fi, fp in enumerate(new_layout.floors):
        for r in list(fp.rooms):
            if r.id == target_id or (intent.target_room_type and r.type == intent.target_room_type and target_id is None):
                removed = r
                fp.rooms = [x for x in fp.rooms if x.id != r.id]
                floor_idx = fi
                break
        if removed:
            break
    if not removed:
        return layout, {"status": "unmodified", "reason": "Room not found"}
    new_layout = _rebuild_floor_derived(new_layout, floor_idx)
    new_layout.designer_rationale = f"Removed {removed.name} while preserving remaining canonical rooms."
    return new_layout, {"modified_element": removed.id, "operation": "remove_room"}


def _add_program_room(layout: HouseLayout, intent: EditIntent, room_type: str) -> Tuple[HouseLayout, Dict[str, Any]]:
    new_layout = layout.model_copy(deep=True)
    floor_idx = 0
    fp = new_layout.floors[floor_idx] if new_layout.floors else None
    if not fp:
        return layout, {"status": "unmodified", "reason": "No floor to modify"}

    n = len([r for r in fp.rooms if r.type == room_type]) + 1
    rid = f"f1_{room_type}_{n}"
    if room_type == "balcony":
        room = Room(
            id=rid, name="Balcony", type="balcony", zone="outdoor", floor=1,
            min_width=4.0, min_length=8.0, preferred_width=5.0, preferred_length=10.0,
            privacy_level="semi_private", rationale="Added balcony per client edit.",
        )
        host = next((r for r in fp.rooms if r.type in ("living_room", "master_bedroom", "bedroom")), None)
        if host:
            room.required_adjacencies = [host.id]
    else:
        room = Room(
            id=rid, name=f"Bedroom {n}", type="bedroom", zone="private", floor=1,
            min_width=9.0, min_length=10.0, preferred_width=11.0, preferred_length=12.0,
            privacy_level="private", rationale="Added bedroom per client edit.",
        )
    fp.rooms.append(room)

    mapped = f"Make the {room.name} fit the layout"
    refined, diff = refine_current_house_layout(new_layout, mapped, target_room_id=rid)
    if getattr(diff, "get", lambda *_: None)("status") == "unmodified":
        refined = _rebuild_floor_derived(new_layout, floor_idx)
        refined.designer_rationale = f"Added {room.name} to the canonical program."
        diff = {"operation": f"add_{room_type}", "modified_element": rid}
    return refined, diff


def _change_plot(layout: HouseLayout, intent: EditIntent, instruction: str) -> Tuple[HouseLayout, Dict[str, Any]]:
    new_layout = layout.model_copy(deep=True)
    pw = float(intent.constraints.get("plot_width") or new_layout.plot_width)
    pl = float(intent.constraints.get("plot_length") or new_layout.plot_length)
    new_layout.plot_width = pw
    new_layout.plot_length = pl
    if new_layout.site:
        new_layout.site.plot_width = pw
        new_layout.site.plot_length = pl
        new_layout.site.total_plot_area = pw * pl
        if new_layout.site.buildable_envelope:
            env = new_layout.site.buildable_envelope
            sb = new_layout.site.setbacks
            env.width = max(10.0, pw - (sb.left + sb.right if sb else 8.0))
            env.length = max(12.0, pl - (sb.front + sb.rear if sb else 8.0))
    refined, diff = refine_current_house_layout(new_layout, "Make the living room fit the updated plot", None)
    refined.plot_width = pw
    refined.plot_length = pl
    refined.designer_rationale = f"Plot dimensions updated to {pw}' × {pl}' from '{instruction}'."
    diff["operation"] = "change_plot_dimensions"
    return refined, diff
