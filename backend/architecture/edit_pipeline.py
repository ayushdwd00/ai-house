"""
Canonical edit pipeline:

User request → Groq EditIntent → architectural engine (OR-Tools/Shapely)
→ validate → save revision → invalidate derived outputs.

HouseLayout remains the single source of truth.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from models import ConstructionSpecification, EditIntent, HouseLayout, Room
from ai.groq_service import interpret_modification_with_groq, NaturalLanguageModificationCommand
from ai.refinement_engine import refine_current_house_layout
from ai.visualization_engine import mark_visuals_stale
from architecture.architectural_validator import validate_design
from architecture.furniture_validator import validate_and_place_furniture
from architecture.wall_network import generate_wall_network_and_openings
from construction.structural_planner import plan_preliminary_structure
from construction.building_services_engine import plan_building_services
from estimation.material_quantity_engine import calculate_material_quantities
from estimation.cost_estimator import estimate_construction_cost


INVALID_EDIT_MESSAGE = "That change could not be applied without breaking the layout."


def interpret_edit_intent(
    instruction: str,
    current_layout: HouseLayout,
    target_room_id: Optional[str] = None,
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

    if any(k in lower for k in ["plot", "setback"]) and any(k in lower for k in ["change", "increase", "decrease", "dimension", "x"]):
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

    matched_id = target_room_id
    if not matched_id and target_type:
        for r in _all_rooms(current_layout):
            if r.type == target_type or target_type in (r.id or "") or target_type in (r.name or "").lower().replace(" ", "_"):
                matched_id = r.id
                break

    return EditIntent(
        operation=operation,
        target_room_id=matched_id,
        target_room_type=target_type,
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
) -> Tuple[HouseLayout, Dict[str, Any], Optional[str]]:
    """
    Returns (layout, diff, error).
    On failure, returns the original layout unchanged plus error message.
    """
    original = current_layout.model_copy(deep=True)
    intent = interpret_edit_intent(instruction, current_layout, target_room_id)

    try:
        if intent.operation == "remove_room":
            updated, diff = _remove_room(current_layout, intent)
        elif intent.operation == "add_room":
            updated, diff = _add_program_room(current_layout, intent, "bedroom")
        elif intent.operation == "add_balcony":
            updated, diff = _add_program_room(current_layout, intent, "balcony")
        elif intent.operation == "change_plot_dimensions":
            updated, diff = _change_plot(current_layout, intent, instruction)
        else:
            mapped = _instruction_for_engine(instruction, intent)
            updated, diff = refine_current_house_layout(
                current_layout=current_layout,
                instruction=mapped,
                target_room_id=intent.target_room_id,
            )
    except Exception as e:
        return original, {"status": "rejected", "edit_intent": intent.model_dump()}, f"{INVALID_EDIT_MESSAGE} ({e})"

    if not updated or getattr(diff, "get", lambda *_: None)("status") == "unmodified":
        return original, {"status": "rejected", "edit_intent": intent.model_dump(), **(diff or {})}, INVALID_EDIT_MESSAGE

    validation = validate_design(updated)
    updated.validation = validation
    if validation and validation.is_valid is False and (validation.errors or []):
        blocking = [e for e in (validation.errors or []) if "overlap" in str(e).lower() or "envelope" in str(e).lower()]
        if blocking:
            return original, {"status": "rejected", "edit_intent": intent.model_dump(), "errors": blocking}, INVALID_EDIT_MESSAGE

    updated = mark_visuals_stale(updated, instruction)
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
