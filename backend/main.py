import os
import base64
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Path as FastPath
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict, Any

from models import HouseLayout, IntakeRequest, RefineRequest, EditRoomRequest, EditRoomResponse, Rect, ArchitecturalValidation, ArchitecturalScores
from architectural_engine import generate_architectural_house_layout
from refinement_engine import refine_current_house_layout
from architectural_validator import validate_design
from architectural_scorer import calculate_architectural_scores
from furniture_validator import validate_and_place_furniture
from wall_network import generate_wall_network_and_openings
from shapely.geometry import box
from storage import save_project, get_project, list_project_versions, restore_project_version, undo_project_version
from groq_service import (
    parse_intake_with_groq_or_fallback,
    analyze_floorplan_image
)

app = FastAPI(title="AI House Design Generator Professional Architectural Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "AI House Design Generator Architectural Core",
        "engine": "CP-SAT + Shapely + NetworkX + Groq Critic",
        "has_groq_key": bool(os.getenv("GROQ_API_KEY") and os.getenv("GROQ_API_KEY") != "your_groq_api_key_here"),
        "text_model": os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b"),
        "vision_model": os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-3.2-11b-vision-instruct")
    }

@app.post("/api/generate", response_model=HouseLayout)
def generate_layout_endpoint(req: IntakeRequest):
    """
    Executes the site-first architectural design engine:
    Site setbacks & envelope -> Functional zoning & relationship graph ->
    CP-SAT constraint solver -> Furniture programs -> Shared wall network ->
    Real mathematical scoring -> Groq critic candidate selection.
    """
    if req.user_prompt and len(req.user_prompt.strip()) > 3:
        parsed = parse_intake_with_groq_or_fallback(req.user_prompt)
        plot_w = parsed.get("plot_width", req.plot_width or 42.0)
        plot_l = parsed.get("plot_length", req.plot_length or 36.0)
        num_floors = parsed.get("num_floors", req.num_floors or 1)
        bedrooms = parsed.get("bedrooms", req.bedrooms or 3)
        bathrooms = parsed.get("bathrooms", req.bathrooms or 2.0)
        style = parsed.get("style", req.style or "Modern Scandinavian")
        special_rooms = parsed.get("special_rooms", req.special_rooms or [])
        open_concept = parsed.get("open_concept", req.open_concept if req.open_concept is not None else True)
    else:
        plot_w = req.plot_width or 42.0
        plot_l = req.plot_length or 36.0
        num_floors = req.num_floors or 1
        bedrooms = req.bedrooms or 3
        bathrooms = req.bathrooms or 2.0
        style = req.style or "Modern Scandinavian"
        special_rooms = req.special_rooms or []
        open_concept = req.open_concept if req.open_concept is not None else True

    layout = generate_architectural_house_layout(
        plot_width=plot_w,
        plot_length=plot_l,
        num_floors=num_floors,
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        attached_bathroom_count=req.attached_bathroom_count,
        style=style,
        road_side=req.road_side or "south",
        parking_spaces=req.parking_cars or 1,
        special_rooms=special_rooms,
        open_concept=open_concept,
        vastu_compliant=req.vastu_compliant or False,
        user_prompt=req.user_prompt or ""
    )

    # Persist as initial project version (v1)
    try:
        save_project(layout, layout.id)
    except Exception as e:
        print(f"[STORAGE WARNING] Could not persist project: {e}")

    return layout

@app.post("/api/intake")
def intake_flow_endpoint(req: IntakeRequest):
    """Processes natural language free-form intake dialogue."""
    prompt = req.user_prompt or "3 bedroom 2 bath modern home around 1600 sq ft"
    parsed = parse_intake_with_groq_or_fallback(prompt)
    layout = generate_architectural_house_layout(
        plot_width=parsed.get("plot_width", 42.0),
        plot_length=parsed.get("plot_length", 36.0),
        num_floors=parsed.get("num_floors", 1),
        bedrooms=parsed.get("bedrooms", 3),
        bathrooms=parsed.get("bathrooms", 2.0),
        style=parsed.get("style", "Modern Scandinavian"),
        special_rooms=parsed.get("special_rooms", []),
        open_concept=parsed.get("open_concept", True),
        user_prompt=prompt
    )
    try:
        save_project(layout, layout.id)
    except Exception:
        pass
    return {
        "parsed_requirements": parsed,
        "layout": layout
    }

@app.post("/api/refine", response_model=HouseLayout)
def refine_layout_endpoint(req: RefineRequest):
    """
    Performs localized cluster re-optimization preserving unaffected rooms.
    Creates an immutable version snapshot in project history.
    """
    refined_layout, diff = refine_current_house_layout(
        current_layout=req.current_layout,
        instruction=req.edit_instruction,
        target_room_id=req.target_room_id
    )
    # Save as new version
    try:
        save_project(refined_layout, refined_layout.id)
    except Exception as e:
        print(f"[STORAGE WARNING] Failed to save refined version: {e}")
    return refined_layout

@app.post("/api/validate", response_model=ArchitecturalValidation)
def validate_layout_endpoint(layout: HouseLayout):
    """
    Validates architectural containment, zero overlaps, circulation,
    aspect ratios, attached bath adjacencies, and staircase vertical alignment.
    """
    return validate_design(layout)

@app.post("/api/analyze", response_model=ArchitecturalScores)
def analyze_layout_endpoint(layout: HouseLayout):
    """Returns mathematical architectural metrics."""
    if layout.scores:
        return layout.scores
    return ArchitecturalScores()

# -----------------------------------------------------------------------------
# Project Persistence & Version History API
# -----------------------------------------------------------------------------
@app.get("/api/projects/{project_id}", response_model=HouseLayout)
def get_project_endpoint(project_id: str):
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj

@app.post("/api/projects", response_model=HouseLayout)
def save_project_endpoint(layout: HouseLayout):
    pid, ver = save_project(layout, layout.id)
    return layout

@app.get("/api/projects/{project_id}/versions")
def list_versions_endpoint(project_id: str):
    return {"project_id": project_id, "versions": list_project_versions(project_id)}

@app.post("/api/projects/{project_id}/restore/{version_number}", response_model=HouseLayout)
def restore_version_endpoint(project_id: str, version_number: int):
    restored = restore_project_version(project_id, version_number)
    if not restored:
        raise HTTPException(status_code=404, detail="Version not found")
    return restored

@app.post("/api/projects/{project_id}/undo", response_model=HouseLayout)
def undo_version_endpoint(project_id: str):
    undone = undo_project_version(project_id)
    if not undone:
        raise HTTPException(status_code=404, detail="Cannot undo")
    return undone

@app.post("/api/upload-floorplan")
async def upload_floorplan_endpoint(
    file: UploadFile = File(...),
    calibration_width: Optional[float] = Form(38.0)
):
    """
    Ingests an image of a floor plan, uses vision AI to extract rooms,
    and synthesizes into canonical architectural model.
    """
    contents = await file.read()
    b64_img = base64.b64encode(contents).decode("utf-8")
    vision_res = analyze_floorplan_image(b64_img)

    width = float(calibration_width or vision_res.get("suggested_width", 38.0))
    aspect = vision_res.get("suggested_width", 38.0) / max(20.0, vision_res.get("suggested_length", 32.0))
    length = round(width / max(0.6, min(2.0, aspect)), 1)
    bedrooms = int(vision_res.get("estimated_bedrooms", 3))
    bathrooms = float(vision_res.get("estimated_bathrooms", 2.0))

    layout = generate_architectural_house_layout(
        plot_width=width,
        plot_length=length,
        num_floors=1,
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        style="Architectural Scan"
    )
    layout.title = f"Digitized Architectural Plan ({width}' × {length}')"
    return {
        "vision_analysis": vision_res,
        "layout": layout
    }

@app.post("/api/edit-room", response_model=EditRoomResponse)
def edit_room_endpoint(req: EditRoomRequest):
    """
    Validates and updates an individual room's rect within the canonical layout.
    Checks buildable envelope containment and zero-overlap constraints.
    Accepts, auto-corrects (snaps to envelope/nearest boundary), or rejects with reason.
    """
    layout = req.current_layout.model_copy(deep=True)
    room_id = req.room_id
    proposed = req.proposed_rect

    # Find the room in the layout
    target_room = None
    target_floor = None
    for floor in layout.floors:
        for r in floor.rooms:
            if r.id == room_id:
                target_room = r
                target_floor = floor
                break
        if target_room:
            break

    if not target_room:
        for r in layout.rooms:
            if r.id == room_id:
                target_room = r
                break

    if not target_room:
        return EditRoomResponse(
            layout=layout,
            status="rejected",
            reason=f"Room '{room_id}' not found in layout.",
            adjusted_rect=proposed
        )

    # 1. Check Envelope Bounds
    site = layout.site
    if site and site.buildable_envelope:
        env = site.buildable_envelope
    else:
        env = Rect(x=0.0, y=0.0, width=layout.plot_width, length=layout.plot_length)

    # Dimensions constraints
    min_w = getattr(target_room, "min_width", 5.0)
    min_l = getattr(target_room, "min_length", 5.0)

    new_w = round(max(min_w, min(env.width, proposed.width)), 1)
    new_l = round(max(min_l, min(env.length, proposed.length)), 1)

    # Boundary clamp: ensure inside buildable envelope
    clamped_x = round(max(env.x, min(env.right - new_w, proposed.x)), 1)
    clamped_y = round(max(env.y, min(env.bottom - new_l, proposed.y)), 1)

    autocorrected = (clamped_x != proposed.x or clamped_y != proposed.y or new_w != proposed.width or new_l != proposed.length)
    current_rect = Rect(x=clamped_x, y=clamped_y, width=new_w, length=new_l)
    prop_box = box(current_rect.x, current_rect.y, current_rect.right, current_rect.bottom)

    # 2. Check Overlap with Other Rooms on the Same Floor
    other_rooms = [r for r in (target_floor.rooms if target_floor else layout.rooms) if r.id != room_id and r.rect]

    conflicts = []
    for o in other_rooms:
        o_box = box(o.rect.x, o.rect.y, o.rect.right, o.rect.bottom)
        inter = prop_box.intersection(o_box)
        if inter.area > 0.2:
            conflicts.append((o, inter.area))

    if conflicts:
        resolved = False
        conflicts.sort(key=lambda x: x[1], reverse=True)
        conf_room, max_inter_area = conflicts[0]

        # Significant collision (> 55% of room area) -> Reject immediately
        room_area = new_w * new_l
        if max_inter_area / max(1.0, room_area) > 0.55:
            return EditRoomResponse(
                layout=layout,
                status="rejected",
                reason=f"Position overlaps with {conf_room.name} ({round(max_inter_area, 1)} sq ft). Returned to valid position.",
                adjusted_rect=target_room.rect
            )

        # Snap candidates to push clear of conflict
        snap_candidates = [
            Rect(x=round(conf_room.rect.right, 1), y=current_rect.y, width=new_w, length=new_l),
            Rect(x=round(conf_room.rect.x - new_w, 1), y=current_rect.y, width=new_w, length=new_l),
            Rect(x=current_rect.x, y=round(conf_room.rect.bottom, 1), width=new_w, length=new_l),
            Rect(x=current_rect.x, y=round(conf_room.rect.y - new_l, 1), width=new_w, length=new_l),
        ]

        env_box = box(env.x, env.y, env.right, env.bottom)
        for cand in snap_candidates:
            c_box = box(cand.x, cand.y, cand.right, cand.bottom)
            if not env_box.contains(c_box):
                continue
            has_coll = False
            for o in other_rooms:
                ob = box(o.rect.x, o.rect.y, o.rect.right, o.rect.bottom)
                if c_box.intersection(ob).area > 0.15:
                    has_coll = True
                    break
            if not has_coll:
                current_rect = cand
                resolved = True
                autocorrected = True
                break

        if not resolved:
            return EditRoomResponse(
                layout=layout,
                status="rejected",
                reason=f"Position overlaps with {conf_room.name}. Snapped back to original position.",
                adjusted_rect=target_room.rect
            )

    # 3. Apply the valid/auto-corrected rect
    target_room.rect = current_rect
    target_room.actual_width = current_rect.width
    target_room.actual_length = current_rect.length
    target_room.area_sqft = current_rect.area
    target_room.dimensions_label = f"{round(current_rect.width, 1)}' × {round(current_rect.length, 1)}'"

    for r in layout.rooms:
        if r.id == room_id:
            r.rect = current_rect
            r.actual_width = current_rect.width
            r.actual_length = current_rect.length
            r.area_sqft = current_rect.area
            r.dimensions_label = target_room.dimensions_label

    # Recompute furniture for edited room
    f_items, f_score, _ = validate_and_place_furniture(target_room)
    target_room.furniture = f_items
    for r in layout.rooms:
        if r.id == room_id:
            r.furniture = f_items

    # Regenerate walls, doors, windows for the floor
    floor_rooms = target_floor.rooms if target_floor else layout.rooms
    walls, doors, windows = generate_wall_network_and_openings(floor_rooms, site or layout.site)
    if target_floor:
        target_floor.walls = walls
        target_floor.doors = doors
        target_floor.windows = windows
    layout.walls = walls
    layout.exterior_walls = [w for w in walls if w.wall_type == "exterior" or w.is_exterior]
    layout.interior_walls = [w for w in walls if w.wall_type != "exterior" and not w.is_exterior]
    layout.doors = doors
    layout.windows = windows

    # Recalculate architectural scores & stats
    furn_scores = [getattr(r, "furniture_score", 85.0) for r in floor_rooms]
    scores, validation = calculate_architectural_scores(
        rooms=floor_rooms,
        site=site,
        walls=walls,
        doors=doors,
        windows=windows,
        furniture_scores=furn_scores,
        vastu_enabled=getattr(layout, "vastu_compliant", False)
    )
    layout.scores = scores
    layout.validation = validation
    layout.stats.total_area_sqft = sum(r.area_sqft for r in layout.rooms if r.rect)
    layout.stats.living_area_sqft = sum(r.area_sqft for r in layout.rooms if r.rect and r.type not in ["parking", "patio", "balcony"])

    status_str = "autocorrected" if autocorrected else "accepted"
    reason_str = "Position auto-aligned to stay within bounds and avoid room collision." if autocorrected else None

    return EditRoomResponse(
        layout=layout,
        status=status_str,
        reason=reason_str,
        adjusted_rect=current_rect
    )


@app.websocket("/ws/refine")
async def websocket_refine(websocket: WebSocket):
    """WebSocket for live plain-language edits."""
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            instruction = data.get("instruction", "")
            current_layout_dict = data.get("layout")
            
            if current_layout_dict and instruction:
                current_layout = HouseLayout.model_validate(current_layout_dict)
                refined, diff = refine_current_house_layout(current_layout, instruction)
                await websocket.send_json({"status": "ok", "layout": refined.model_dump(), "diff": diff})
            else:
                await websocket.send_json({"status": "error", "message": "Missing layout or instruction"})
    except WebSocketDisconnect:
        pass
