"""
Refinement Engine Module
Implements localized architectural cluster re-optimization.
Preserves unaffected rooms when the user requests modifications like:
- "Make master bedroom bigger"
- "Make bedroom 2 bigger"
- "Move kitchen closer to dining"
- "Add attached bathroom to bedroom 2"
- "Make living room larger"
- "Make external walls 9 inches"
Maps natural language to stable entity IDs, recalculates quantities and cost estimates,
and creates an immutable new project version.
"""

from typing import List, Dict, Tuple, Optional, Any
import copy
from shapely.geometry import box
from models import HouseLayout, FloorPlan, Room, Rect, Point2D, ConstructionSpecification
from architecture.furniture_validator import validate_and_place_furniture
from architecture.wall_network import generate_wall_network_and_openings
from architecture.architectural_scorer import calculate_architectural_scores
from architecture.architectural_validator import validate_design
from architecture.spatial_solver import solve_spatial_layout, GRID_SCALE
from architecture.topology_engine import ArchitecturalScheme
from estimation.material_quantity_engine import calculate_material_quantities
from estimation.cost_estimator import estimate_construction_cost
from construction.building_services_engine import plan_building_services
from construction.structural_planner import plan_preliminary_structure
from ortools.sat.python import cp_model

from ai.groq_service import interpret_modification_with_groq, NaturalLanguageModificationCommand


def parse_refinement_intent(instruction: str, current_layout: HouseLayout) -> Dict[str, Any]:
    """
    Identifies target room and modification parameters from natural language
    using Groq Pydantic structured output with robust deterministic fallback.
    """
    rooms_summary = {"rooms": [r.type for r in getattr(current_layout, "rooms", [])]}
    cmd: NaturalLanguageModificationCommand = interpret_modification_with_groq(instruction, rooms_summary)

    target_type = cmd.target_room_type
    operation = cmd.operation
    delta_w = cmd.delta_width
    delta_l = cmd.delta_length
    partner_room = cmd.partner_room

    # Check for specific room indexing in instruction (e.g. "bedroom 2", "bed 2")
    inst_lower = instruction.lower()
    target_room = None

    all_rooms = current_layout.rooms if current_layout.rooms else [r for fp in current_layout.floors for r in fp.rooms]

    if "bedroom 2" in inst_lower or "bed 2" in inst_lower:
        candidates = [r for r in all_rooms if r.type == "bedroom" and "master" not in r.id and "master" not in r.name.lower()]
        if len(candidates) >= 2:
            target_room = candidates[1]
        elif candidates:
            target_room = candidates[0]
    elif "bedroom 1" in inst_lower or "master bedroom" in inst_lower:
        target_room = next((r for r in all_rooms if r.type == "master_bedroom"), None)

    if not target_room and target_type:
        for r in all_rooms:
            if r.type == target_type or target_type in r.id.lower() or target_type in r.name.lower():
                target_room = r
                break

    if not target_room and all_rooms:
        target_room = all_rooms[0]

    return {
        "target_room_id": target_room.id if target_room else None,
        "target_type": target_type,
        "operation": operation,
        "delta_w": delta_w,
        "delta_l": delta_l,
        "partner_room": partner_room,
        "instruction": instruction,
        "architectural_rationale": cmd.architectural_rationale
    }


def refine_current_house_layout(
    current_layout: HouseLayout,
    instruction: str,
    target_room_id: Optional[str] = None,
    variant_seed: Optional[int] = None
) -> Tuple[HouseLayout, Dict[str, Any]]:
    """
    Performs localized cluster re-optimization preserving unaffected rooms.
    Returns (updated_layout, diff_summary).
    """
    inst_lower = instruction.lower()
    active_spec = current_layout.construction_spec or ConstructionSpecification()

    # 1. Check for Construction Specification Updates (e.g., "make external walls 9 inches")
    if "wall" in inst_lower and ("thick" in inst_lower or "inch" in inst_lower or "9" in inst_lower or "4.5" in inst_lower):
        new_layout = current_layout.model_copy(deep=True)
        spec = new_layout.construction_spec or ConstructionSpecification()
        if "9" in inst_lower or "nine" in inst_lower:
            spec.external_wall_thickness_in = 9.0
            spec.external_wall_thickness_ft = 0.75
        elif "4.5" in inst_lower or "four and a half" in inst_lower:
            spec.external_wall_thickness_in = 4.5
            spec.external_wall_thickness_ft = 0.375

        new_layout.construction_spec = spec
        site = new_layout.site

        # Regenerate walls across all floors
        for fp in new_layout.floors:
            w, d, win = generate_wall_network_and_openings(
                fp.rooms, site, wall_height=spec.wall_height_ft, construction_spec=spec
            )
            fp.walls = w
            fp.doors = d
            fp.windows = win
            fp.exterior_walls = [x for x in w if x.wall_type == "exterior"]
            fp.interior_walls = [x for x in w if x.wall_type == "interior"]

        if new_layout.floors:
            new_layout.walls = new_layout.floors[0].walls
            new_layout.doors = new_layout.floors[0].doors
            new_layout.windows = new_layout.floors[0].windows

        new_layout.quantities = calculate_material_quantities(new_layout, spec)
        new_layout.cost_estimate = estimate_construction_cost(new_layout, new_layout.quantities)
        new_layout.validation = validate_design(new_layout)
        new_layout.version_number = (current_layout.version_number or 1) + 1
        new_layout.designer_rationale = f"Updated construction specification: external walls configured as {spec.external_wall_thickness_in}\" ({spec.external_wall_thickness_ft}ft)."

        diff = {
            "modified_element": "Construction Specification",
            "instruction": instruction,
            "external_wall_thickness": f"{spec.external_wall_thickness_in} inches",
            "new_quantities": new_layout.quantities.model_dump(),
            "new_estimate": new_layout.cost_estimate.model_dump()
        }
        return new_layout, diff

    # 2. Localized Room Refinement
    intent = parse_refinement_intent(instruction, current_layout)
    tid = target_room_id or intent.get("target_room_id")

    # Find room to modify
    matched_room = None
    matched_floor_idx = 0
    for f_idx, fp in enumerate(current_layout.floors):
        for r in fp.rooms:
            if r.id == tid or (intent.get("target_type") and (r.type == intent["target_type"] or intent["target_type"] in r.id)):
                matched_room = r
                matched_floor_idx = f_idx
                break
        if matched_room:
            break

    if not matched_room or not matched_room.rect:
        return current_layout, {"status": "unmodified", "reason": "Target room not found in current layout"}

    # Deep copy layout for local update
    new_layout = current_layout.model_copy(deep=True)
    floor_plan = new_layout.floors[matched_floor_idx]
    
    old_w = matched_room.rect.width
    old_l = matched_room.rect.length

    # Find neighboring rooms that share an edge with matched_room
    target_box = box(matched_room.rect.x, matched_room.rect.y, matched_room.rect.right, matched_room.rect.bottom)
    neighbors: List[Room] = []
    unaffected_rooms: List[Room] = []

    for r in floor_plan.rooms:
        if r.id == matched_room.id:
            continue
        if not r.rect:
            unaffected_rooms.append(r)
            continue
        r_box = box(r.rect.x, r.rect.y, r.rect.right, r.rect.bottom)
        if target_box.distance(r_box) < 1.0:
            neighbors.append(r)
        else:
            unaffected_rooms.append(r)

    # Apply localized modification
    op = intent.get("operation")
    if op == "enlarge":
        matched_room.preferred_width = min(22.0, matched_room.preferred_width + intent.get("delta_w", 2.0))
        matched_room.preferred_length = min(24.0, matched_room.preferred_length + intent.get("delta_l", 2.0))
        cluster_rooms = [matched_room] + neighbors
    elif op == "shrink":
        matched_room.preferred_width = max(matched_room.min_width, matched_room.preferred_width + intent.get("delta_w", -2.0))
        matched_room.preferred_length = max(matched_room.min_length, matched_room.preferred_length + intent.get("delta_l", -2.0))
        cluster_rooms = [matched_room] + neighbors
    elif op == "add_attached_bath":
        bath_id = f"f{matched_floor_idx+1}_attached_bath_{matched_room.id}"
        new_bath = Room(
            id=bath_id,
            name=f"En-suite Bath ({matched_room.name})",
            type="bathroom",
            zone="private",
            floor=matched_floor_idx + 1,
            parent_room_id=matched_room.id,
            attached_room_id=matched_room.id,
            min_width=5.0, min_length=7.0,
            preferred_width=6.0, preferred_length=8.0,
            privacy_level="intimate",
            required_adjacencies=[matched_room.id],
            rationale=f"Dedicated private en-suite bath attached to {matched_room.name}."
        )
        matched_room.attached_room_id = bath_id
        matched_room.required_adjacencies.append(bath_id)
        cluster_rooms = [matched_room, new_bath] + neighbors
        floor_plan.rooms.append(new_bath)
    elif op in ["relocate_closer", "relocate"]:
        partner_name = intent.get("partner_room")
        partner_room = None
        if partner_name:
            partner_room = next((r for r in floor_plan.rooms if partner_name in r.type or partner_name in r.id.lower() or partner_name in r.name.lower()), None)
        if partner_room and partner_room.id != matched_room.id and partner_room not in neighbors:
            cluster_rooms = [matched_room, partner_room] + neighbors
        else:
            cluster_rooms = [matched_room] + neighbors
    else:
        cluster_rooms = [matched_room] + neighbors

    # Bounding envelope of the cluster
    c_min_x = min(r.rect.x for r in cluster_rooms if r.rect)
    c_min_y = min(r.rect.y for r in cluster_rooms if r.rect)
    c_max_x = max(r.rect.right for r in cluster_rooms if r.rect)
    c_max_y = max(r.rect.bottom for r in cluster_rooms if r.rect)

    # Expand bounding box slightly (2 ft) towards site envelope if enlarging
    site = new_layout.site
    if site and site.buildable_envelope:
        c_min_x = max(site.buildable_envelope.x, c_min_x - (1.0 if op == "enlarge" else 0.0))
        c_min_y = max(site.buildable_envelope.y, c_min_y - (1.0 if op == "enlarge" else 0.0))
        c_max_x = min(site.buildable_envelope.right, c_max_x + (2.0 if op == "enlarge" else 0.0))
        c_max_y = min(site.buildable_envelope.bottom, c_max_y + (2.0 if op == "enlarge" else 0.0))

    env_w_int = int(round((c_max_x - c_min_x) * GRID_SCALE))
    env_l_int = int(round((c_max_y - c_min_y) * GRID_SCALE))

    # Formulate CP-SAT local cluster model
    model = cp_model.CpModel()
    x_vars: Dict[str, cp_model.IntVar] = {}
    y_vars: Dict[str, cp_model.IntVar] = {}
    w_vars: Dict[str, cp_model.IntVar] = {}
    l_vars: Dict[str, cp_model.IntVar] = {}
    x_intervals = []
    y_intervals = []
    objs = []

    for r in cluster_rooms:
        min_w = int(round(r.min_width * GRID_SCALE))
        min_l = int(round(r.min_length * GRID_SCALE))
        max_w = min(env_w_int, int(round((r.max_width or 22.0) * GRID_SCALE)))
        max_l = min(env_l_int, int(round((r.max_length or 24.0) * GRID_SCALE)))
        min_w = min(min_w, max_w)
        min_l = min(min_l, max_l)

        w = model.NewIntVar(min_w, max_w, f"w_{r.id}")
        l = model.NewIntVar(min_l, max_l, f"l_{r.id}")
        x = model.NewIntVar(0, max(0, env_w_int - min_w), f"x_{r.id}")
        y = model.NewIntVar(0, max(0, env_l_int - min_l), f"y_{r.id}")

        x_end = model.NewIntVar(min_w, env_w_int, f"xend_{r.id}")
        y_end = model.NewIntVar(min_l, env_l_int, f"yend_{r.id}")
        model.Add(x_end == x + w)
        model.Add(y_end == y + l)

        x_iv = model.NewIntervalVar(x, w, x_end, f"xiv_{r.id}")
        y_iv = model.NewIntervalVar(y, l, y_end, f"yiv_{r.id}")

        x_vars[r.id] = x
        y_vars[r.id] = y
        w_vars[r.id] = w
        l_vars[r.id] = l
        x_intervals.append(x_iv)
        y_intervals.append(y_iv)

        pref_w = int(round(r.preferred_width * GRID_SCALE))
        pref_l = int(round(r.preferred_length * GRID_SCALE))
        dw = model.NewIntVar(0, env_w_int, f"dw_{r.id}")
        dl = model.NewIntVar(0, env_l_int, f"dl_{r.id}")
        model.Add(dw >= w - pref_w)
        model.Add(dw >= pref_w - w)
        model.Add(dl >= l - pref_l)
        model.Add(dl >= pref_l - l)
        objs.append(dw * 5 + dl * 5)

    partner_name = intent.get("partner_room")
    if op in ["relocate_closer", "relocate"] and partner_name:
        p_room = next((r for r in cluster_rooms if partner_name in r.type or partner_name in r.id.lower() or partner_name in r.name.lower()), None)
        if p_room and p_room.id in x_vars and matched_room.id in x_vars:
            pdx = model.NewIntVar(0, env_w_int * 2, "pdx")
            pdy = model.NewIntVar(0, env_l_int * 2, "pdy")
            c1_x = 2 * x_vars[matched_room.id] + w_vars[matched_room.id]
            c2_x = 2 * x_vars[p_room.id] + w_vars[p_room.id]
            c1_y = 2 * y_vars[matched_room.id] + l_vars[matched_room.id]
            c2_y = 2 * y_vars[p_room.id] + l_vars[p_room.id]
            model.Add(pdx >= c1_x - c2_x)
            model.Add(pdx >= c2_x - c1_x)
            model.Add(pdy >= c1_y - c2_y)
            model.Add(pdy >= c2_y - c1_y)
            objs.append((pdx + pdy) * 12)

    model.AddNoOverlap2D(x_intervals, y_intervals)
    model.Minimize(sum(objs))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 2.0
    solver.parameters.max_deterministic_time = 1.0
    solver.parameters.random_seed = int(variant_seed if variant_seed is not None else 42)
    solver.parameters.num_workers = 1
    status = solver.Solve(model)

    if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        for r in cluster_rooms:
            rx = c_min_x + (solver.Value(x_vars[r.id]) / GRID_SCALE)
            ry = c_min_y + (solver.Value(y_vars[r.id]) / GRID_SCALE)
            rw = solver.Value(w_vars[r.id]) / GRID_SCALE
            rl = solver.Value(l_vars[r.id]) / GRID_SCALE
            r.rect = Rect(x=round(rx, 2), y=round(ry, 2), width=round(rw, 2), length=round(rl, 2))
            r.actual_width = r.rect.width
            r.actual_length = r.rect.length
            r.area_sqft = r.rect.area
            r.dimensions_label = f"{round(rw, 1)}' × {round(rl, 1)}'"

    # Regenerate furniture and walls with ConstructionSpecification
    furn_scores = []
    for r in floor_plan.rooms:
        items, sc, _ = validate_and_place_furniture(r)
        r.furniture = items
        furn_scores.append(sc)

    new_walls, new_doors, new_windows = generate_wall_network_and_openings(
        floor_plan.rooms,
        site,
        wall_height=active_spec.wall_height_ft,
        construction_spec=active_spec
    )
    floor_plan.walls = new_walls
    floor_plan.doors = new_doors
    floor_plan.windows = new_windows
    floor_plan.exterior_walls = [w for w in new_walls if w.wall_type == "exterior"]
    floor_plan.interior_walls = [w for w in new_walls if w.wall_type == "interior"]

    # Recalculate scores and validation
    scores, validation = calculate_architectural_scores(
        rooms=floor_plan.rooms,
        site=site,
        walls=new_walls,
        doors=new_doors,
        windows=new_windows,
        furniture_scores=furn_scores
    )
    new_layout.scores = scores
    new_layout.validation = validation

    # Sync backwards-compatible ground floor fields
    if matched_floor_idx == 0:
        new_layout.rooms = floor_plan.rooms
        new_layout.walls = new_walls
        new_layout.doors = new_doors
        new_layout.windows = new_windows
        new_layout.exterior_walls = floor_plan.exterior_walls
        new_layout.interior_walls = floor_plan.interior_walls

    new_w = matched_room.rect.width if matched_room.rect else old_w
    new_l = matched_room.rect.length if matched_room.rect else old_l

    # Recalculate quantities & cost estimate
    new_layout.quantities = calculate_material_quantities(new_layout, active_spec)
    new_layout.cost_estimate = estimate_construction_cost(new_layout, new_layout.quantities)
    new_layout.building_services = plan_building_services(new_layout.floors, new_layout.plot_width, new_layout.plot_length)
    new_layout.structural_planning = plan_preliminary_structure(new_layout.floors, active_spec)
    new_layout.version_number = (current_layout.version_number or 1) + 1

    diff_summary = {
        "modified_room": matched_room.name,
        "previous_dimensions": f"{round(old_w, 1)}' × {round(old_l, 1)}'",
        "new_dimensions": f"{round(new_w, 1)}' × {round(new_l, 1)}'",
        "affected_neighbors": [n.name for n in neighbors],
        "unaffected_rooms_count": len(unaffected_rooms),
        "instruction": instruction,
        "rationale": intent.get("architectural_rationale", ""),
        "scores": scores.model_dump(),
        "version": new_layout.version_number
    }

    new_layout.designer_rationale = (
        f"Localized re-optimization: {matched_room.name} adjusted from {old_w}'×{old_l}' to {new_w}'×{new_l}'. "
        f"Preserved {len(unaffected_rooms)} unaffected spaces with zero disturbance to main building massing."
    )

    return new_layout, diff_summary
