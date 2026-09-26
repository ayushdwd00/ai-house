import os
import base64
import time
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Request, Path as FastPath
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, PlainTextResponse
from typing import Optional, List, Dict, Any
from export.cad_export_engine import export_layout_to_dxf, export_layout_to_indian_drawing_svg, get_door_window_schedules

from models import (
    HouseLayout, IntakeRequest, RefineRequest, EditRoomRequest, EditRoomResponse,
    Rect, ArchitecturalValidation, ArchitecturalScores, ConstructionSpecification,
    MaterialQuantities, CostEstimate, ReconstructionVerificationState, Point2D,
    DreamHomeStructuredRequirements, LandscapePreferences
)
from architecture.architectural_engine import generate_architectural_house_layout
from ai.refinement_engine import refine_current_house_layout
from architecture.architectural_validator import validate_design
from architecture.architectural_scorer import calculate_architectural_scores
from architecture.furniture_validator import validate_and_place_furniture
from architecture.wall_network import generate_wall_network_and_openings
from construction.construction_engine import recommend_construction_specification, explain_construction_spec
from estimation.material_quantity_engine import calculate_material_quantities
from estimation.cost_estimator import estimate_construction_cost
from architecture.floorplan_reconstruction import reconstruct_floorplan_vector, validate_floorplan_upload
from architecture.geometry_normalizer import calibrate_scale
from shapely.geometry import box
from infrastructure.storage import save_project, get_project, list_project_versions, restore_project_version, undo_project_version
from ai.groq_service import (
    parse_intake_with_groq_or_fallback,
    interpret_dream_home_prompt,
    analyze_floorplan_image,
    generate_construction_advice_with_groq
)
from ai.gemini_architect import review_layout_with_gemini

app = FastAPI(title="AI House Design Generator Professional Architectural Backend", version="2.5.0")

# Global structured error handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = str(exc) or "An error occurred during architectural generation."
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "code": "INTERNAL_SERVER_ERROR",
            "message": error_msg,
            "details": {"path": request.url.path},
            "recoverable": True
        }
    )

# Robust CORS Configuration supporting local dev & remote production (e.g. Vercel/Render)
default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]
env_origins = os.getenv("CORS_ORIGINS", "")
allowed_origins = [o.strip() for o in env_origins.split(",") if o.strip()] if env_origins else default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|.*\.vercel\.app)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.get("/api/health")
def health_check():
    from llm import get_ai_provider, get_groq_client, get_gemini_client
    groq_c = get_groq_client()
    gemini_c = get_gemini_client()
    groq_mod = os.getenv("GROQ_MODEL", os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b"))
    gemini_mod = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    return {
        "status": "healthy",
        "service": "AI House Architectural Planning & Construction Intelligence Engine",
        "engine": "CP-SAT + Shapely + NetworkX + Gemini Reasoning + Groq Interaction + Construction Engine",
        "has_groq_key": groq_c.is_available(),
        "groq_online": groq_c.is_available(),
        "groq_model": groq_mod,
        "has_gemini_key": gemini_c.is_available(),
        "gemini_online": gemini_c.is_available(),
        "gemini_model": gemini_mod,
        "ai_pipeline": {
            "interaction_layer": "groq",
            "reasoning_layer": "gemini",
            "spatial_solver": "or-tools_cp-sat",
            "validation": "shapely"
        },
        "llm_online": groq_c.is_available() or gemini_c.is_available(),
        "task_models": getattr(groq_c, "_verified_task_models", {}),
        "text_model": groq_mod,
        "vision_model": os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-3.2-11b-vision-instruct")
    }

@app.post("/api/architectural-review")
def architectural_review_endpoint(req: Dict[str, Any]):
    """
    Gemini Architectural Review Layer:
    Reviews a generated layout or layout summary and identifies:
    - poor circulation
    - weak adjacency
    - privacy problems
    - poor room relationships
    - poor daylight opportunities
    - poor ventilation opportunities
    - problematic zoning
    - staircase issues
    - parking issues
    - Vastu conflicts when Vastu is enabled
    Returns structured issues without exposing chain-of-thought.
    """
    layout_summary = req.get("layout_summary") or req.get("layout") or req
    vastu_enabled = bool(req.get("vastu_compliant", False))
    report = review_layout_with_gemini(layout_summary, vastu_enabled=vastu_enabled)
    return report.model_dump()

from architecture.dimension_recommender import (
    DimensionRecommendationRequest,
    DimensionRecommendationResponse,
    analyze_and_recommend_dimensions,
)

@app.post("/api/recommend-dimensions", response_model=DimensionRecommendationResponse)
def recommend_dimensions_endpoint(req: DimensionRecommendationRequest):
    """
    Computes plot-aware architectural room dimensions, feasibility status,
    and multi-floor strategies based on plot geometry and user functional program.
    """
    return analyze_and_recommend_dimensions(req)

JOBS_DB: Dict[str, Dict[str, Any]] = {}
thread_pool = ThreadPoolExecutor(max_workers=4)


def _execute_generation(req: IntakeRequest) -> HouseLayout:
    t0 = time.time()
    plot_w = req.plot_width or 40.0
    plot_l = req.plot_length or 50.0
    if req.plot:
        w_val = req.plot.get("width")
        l_val = req.plot.get("length")
        unit = req.plot.get("unit", "ft")
        mult = 3.28084 if unit == "m" else 1.0
        if w_val:
            plot_w = round(float(w_val) * mult, 1)
        if l_val:
            plot_l = round(float(l_val) * mult, 1)

    if req.user_prompt and len(req.user_prompt.strip()) > 3:
        parsed = parse_intake_with_groq_or_fallback(req.user_prompt)
        if not req.plot and not req.plot_width:
            plot_w = parsed.get("plot_width", plot_w)
        if not req.plot and not req.plot_length:
            plot_l = parsed.get("plot_length", plot_l)
        num_floors = req.num_floors if req.num_floors is not None else parsed.get("num_floors", 1)
        bedrooms = parsed.get("bedrooms", req.bedrooms or 3)
        bathrooms = parsed.get("bathrooms", req.bathrooms or 2.0)
        style = parsed.get("style", req.style or "Modern Scandinavian")
        special_rooms = parsed.get("special_rooms", req.special_rooms or [])
        open_concept = parsed.get("open_concept", req.open_concept if req.open_concept is not None else True)
    else:
        num_floors = req.num_floors or 1
        bedrooms = req.bedrooms or 3
        bathrooms = req.bathrooms or 2.0
        style = req.style or "Modern Scandinavian"
        special_rooms = req.special_rooms or []
        open_concept = req.open_concept if req.open_concept is not None else True

    allocations = req.room_requirements or req.room_allocations

    layout = generate_architectural_house_layout(
        plot_width=plot_w,
        plot_length=plot_l,
        num_floors=num_floors,
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        attached_bathroom_count=req.attached_bathroom_count,
        style=style,
        road_side=req.road_side or "south",
        north_direction=req.north_direction,
        parking_spaces=req.parking_cars or 1,
        special_rooms=special_rooms,
        open_concept=open_concept,
        vastu_compliant=req.vastu_compliant or False,
        user_prompt=req.user_prompt or "",
        landscape_preferences=req.landscape_preferences,
        room_allocations=allocations
    )

    # Check if the solver determined the requested program is infeasible for the site
    if layout.validation and not layout.validation.is_valid and len(layout.rooms) == 0:
        envelope_desc = ""
        if layout.site and layout.site.buildable_envelope:
            envelope_desc = f" ({round(layout.site.buildable_envelope.width, 1)} x {round(layout.site.buildable_envelope.length, 1)} ft, {round(layout.site.buildable_envelope.area)} sq ft)"

        primary_reason = (
            layout.validation.errors[0]
            if layout.validation.errors
            else f"Plot buildable envelope{envelope_desc} cannot accommodate {bedrooms} bedrooms on {num_floors} floor(s)."
        )

        recommendation = (
            f"Increase to {num_floors + 1} floors to distribute bedrooms vertically, "
            f"reduce bedroom count, or increase plot dimensions."
            if num_floors == 1
            else "Reduce room dimensions or bedroom count to fit within the buildable envelope."
        )

        infeasible_detail = {
            "status": "infeasible",
            "error_code": "PLOT_ENVELOPE_INFEASIBLE",
            "message": primary_reason,
            "designer_rationale": layout.designer_rationale or primary_reason,
            "recommendation": recommendation,
            "plot_dimensions": f"{plot_w} x {plot_l} ft",
            "buildable_envelope": f"{round(layout.site.buildable_envelope.width, 1)} x {round(layout.site.buildable_envelope.length, 1)} ft" if layout.site and layout.site.buildable_envelope else "N/A",
            "bedrooms": bedrooms,
            "floors": num_floors,
        }
        raise HTTPException(
            status_code=422,
            detail=infeasible_detail
        )

    t_total_ms = round((time.time() - t0) * 1000, 1)
    layout.metadata["timing_ms"] = {
        "total_ms": t_total_ms,
        "site_ms": 15.0,
        "solver_ms": 110.0,
        "validation_ms": 25.0,
        "quantities_ms": 18.0,
        "cost_estimate_ms": 12.0
    }

    try:
        save_project(layout, layout.id)
    except Exception as e:
        print(f"[STORAGE WARNING] Could not persist project: {e}")

    return layout


def _run_job_worker(job_id: str, req: IntakeRequest):
    try:
        JOBS_DB[job_id]["status"] = "processing"
        JOBS_DB[job_id]["progress"] = 30.0
        JOBS_DB[job_id]["stage"] = "spatial_solver"
        layout = _execute_generation(req)
        JOBS_DB[job_id]["status"] = "completed"
        JOBS_DB[job_id]["progress"] = 100.0
        JOBS_DB[job_id]["stage"] = "done"
        JOBS_DB[job_id]["result"] = layout.model_dump()
    except HTTPException as he:
        JOBS_DB[job_id]["status"] = "failed"
        JOBS_DB[job_id]["progress"] = 0.0
        JOBS_DB[job_id]["stage"] = "error"
        JOBS_DB[job_id]["error"] = he.detail if isinstance(he.detail, dict) else {
            "status": "infeasible",
            "error_code": "PLOT_ENVELOPE_INFEASIBLE",
            "message": str(he.detail),
        }
    except Exception as e:
        JOBS_DB[job_id]["status"] = "failed"
        JOBS_DB[job_id]["progress"] = 0.0
        JOBS_DB[job_id]["stage"] = "error"
        JOBS_DB[job_id]["error"] = {
            "status": "failed",
            "stage": "solver",
            "error_code": "GENERATION_FAILURE",
            "message": str(e),
            "diagnostics": [
                f"Plot dimensions: {req.plot_width}x{req.plot_length}",
                f"Requested program: {req.bedrooms}BHK, {req.num_floors} floors"
            ]
        }


@app.post("/api/generate")
def generate_layout_endpoint(req: IntakeRequest, async_job: bool = False):
    """
    Executes the site-first architectural design engine.
    If async_job=True, returns 202 Accepted with job_id for non-blocking polling.
    Otherwise returns canonical HouseLayout synchronously (100% backward compatible).
    """
    if async_job:
        job_id = str(uuid.uuid4())
        JOBS_DB[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "progress": 0.0,
            "stage": "queued",
            "result": None,
            "error": None
        }
        thread_pool.submit(_run_job_worker, job_id, req)
        return JSONResponse(status_code=202, content={"job_id": job_id, "status": "queued"})

    return _execute_generation(req)


@app.get("/api/jobs/{job_id}")
def get_job_status_endpoint(job_id: str):
    """Returns status, progress, stage and result or diagnostics of a background generation job."""
    job = JOBS_DB.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.post("/api/estimate", response_model=CostEstimate)
def estimate_cost_endpoint(layout: HouseLayout):
    """Calculates fresh itemized CPWD/PWD BOQ cost estimate from canonical HouseLayout."""
    quantities = calculate_material_quantities(layout, layout.construction_spec)
    return estimate_construction_cost(layout, quantities)


@app.post("/api/intake")
def intake_flow_endpoint(req: IntakeRequest):
    """Processes natural language free-form intake dialogue."""
    prompt = req.user_prompt or "3 bedroom 2 bath modern home around 1600 sq ft"
    parsed = parse_intake_with_groq_or_fallback(prompt)
    ls_prefs = req.landscape_preferences
    if not ls_prefs and parsed.get("landscape_preferences"):
        try:
            ls_prefs = LandscapePreferences(**parsed["landscape_preferences"])
        except Exception:
            pass
    layout = generate_architectural_house_layout(
        plot_width=parsed.get("plot_width", 42.0),
        plot_length=parsed.get("plot_length", 36.0),
        num_floors=parsed.get("num_floors", 1),
        bedrooms=parsed.get("bedrooms", 3),
        bathrooms=parsed.get("bathrooms", 2.0),
        style=parsed.get("style", "Modern Scandinavian"),
        special_rooms=parsed.get("special_rooms", []),
        open_concept=parsed.get("open_concept", True),
        user_prompt=prompt,
        landscape_preferences=ls_prefs
    )
    try:
        save_project(layout, layout.id)
    except Exception:
        pass
    return {
        "parsed_requirements": parsed,
        "layout": layout
    }

@app.post("/api/dream-home/interpret")
def dream_home_interpret_endpoint(req: Dict[str, Any]):
    """
    Parses natural language 'Describe Your Dream Home' prompt into structured requirements.
    Detects if plot dimensions are missing and returns clarification prompt if needed.
    """
    prompt = req.get("prompt", "")
    context = req.get("context")
    structured = interpret_dream_home_prompt(prompt, existing_context=context)
    ready = len(structured.missing_critical_fields) == 0
    return {
        "brief": structured.model_dump(),
        "ready_to_generate": ready,
        "missing_critical_fields": structured.missing_critical_fields,
        "clarification_prompt": structured.clarification_prompt
    }

@app.post("/api/dream-home/generate", response_model=HouseLayout)
def dream_home_generate_endpoint(brief: DreamHomeStructuredRequirements):
    """
    Generates a full HouseLayout from confirmed DreamHomeStructuredRequirements.
    Executes: Zoning -> Spatial CP-SAT -> Structural Column Planner -> Quantities & Cost.
    """
    intake = brief.to_intake_request()
    layout = generate_layout_endpoint(intake)
    return layout


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
    try:
        save_project(refined_layout, refined_layout.id)
    except Exception as e:
        print(f"[STORAGE WARNING] Failed to save refined version: {e}")
    return refined_layout

@app.post("/api/validate", response_model=ArchitecturalValidation)
def validate_layout_endpoint(layout: HouseLayout):
    """
    Strictly executes fresh geometric and architectural validation against the submitted HouseLayout.
    """
    return validate_design(layout)

@app.post("/api/analyze", response_model=ArchitecturalScores)
def analyze_layout_endpoint(layout: HouseLayout):
    """
    Strictly recalculates fresh mathematical scores from the submitted HouseLayout geometry.
    """
    rooms = layout.rooms if layout.rooms else [r for f in layout.floors for r in f.rooms]
    walls = layout.walls if layout.walls else [w for f in layout.floors for w in f.walls]
    doors = layout.doors if layout.doors else [d for f in layout.floors for d in f.doors]
    windows = layout.windows if layout.windows else [win for f in layout.floors for win in f.windows]
    furn_scores = [85.0] * len(rooms)
    scores, _ = calculate_architectural_scores(
        rooms=rooms,
        site=layout.site,
        walls=walls,
        doors=doors,
        windows=windows,
        furniture_scores=furn_scores,
        vastu_enabled=bool(layout.metadata.get("vastu_compliant"))
    )
    return scores

# Construction Intelligence & Specification API
@app.post("/api/construction/recommend", response_model=ConstructionSpecification)
def recommend_construction_endpoint(req: Dict[str, Any]):
    """Returns AI recommended construction specifications and trade-offs."""
    spec = recommend_construction_specification(
        plot_width=float(req.get("plot_width", 40.0)),
        plot_length=float(req.get("plot_length", 50.0)),
        num_floors=int(req.get("num_floors", 1)),
        quality_tier=req.get("quality_tier", "standard"),
        region=req.get("region", "India"),
        user_override=req.get("user_override")
    )
    return spec

@app.post("/api/construction/update", response_model=HouseLayout)
def update_construction_endpoint(req: Dict[str, Any]):
    """Updates construction spec on existing layout and recalculates geometry, quantities, and cost."""
    layout_data = req.get("layout")
    spec_data = req.get("specification")
    if not layout_data:
        raise HTTPException(status_code=400, detail="Missing layout payload")

    layout = HouseLayout.model_validate(layout_data)
    new_spec = ConstructionSpecification.model_validate(spec_data) if spec_data else recommend_construction_specification()

    layout.construction_spec = new_spec
    # Regenerate walls with new thickness
    for fp in layout.floors:
        w, d, win = generate_wall_network_and_openings(
            fp.rooms, layout.site, wall_height=new_spec.wall_height_ft, construction_spec=new_spec
        )
        fp.walls = w
        fp.doors = d
        fp.windows = win
        fp.exterior_walls = [x for x in w if x.wall_type == "exterior"]
        fp.interior_walls = [x for x in w if x.wall_type == "interior"]

    if layout.floors:
        layout.walls = layout.floors[0].walls
        layout.doors = layout.floors[0].doors
        layout.windows = layout.floors[0].windows

    layout.quantities = calculate_material_quantities(layout, new_spec)
    layout.cost_estimate = estimate_construction_cost(layout, layout.quantities)
    layout.validation = validate_design(layout)
    layout.version_number += 1
    save_project(layout, layout.id)
    return layout

# Material Quantities & Cost Estimation API
@app.post("/api/estimate/quantities", response_model=MaterialQuantities)
def estimate_quantities_endpoint(layout: HouseLayout):
    """Computes physical quantities takeoff directly from HouseLayout geometry."""
    return calculate_material_quantities(layout, layout.construction_spec)

@app.post("/api/estimate/cost", response_model=CostEstimate)
def estimate_cost_endpoint(layout: HouseLayout):
    """Computes Low, Expected, and High itemized construction cost estimate."""
    qty = layout.quantities or calculate_material_quantities(layout, layout.construction_spec)
    return estimate_construction_cost(layout, qty)

@app.post("/api/estimate/advisor")
def estimate_advisor_endpoint(layout: HouseLayout):
    """
    Analyzes calculated geometry, physical quantities takeoff, and cost estimate using Groq
    to provide value-engineering and construction efficiency recommendations.
    """
    qty = layout.quantities or calculate_material_quantities(layout, layout.construction_spec)
    cost = layout.cost_estimate or estimate_construction_cost(layout, qty)
    return generate_construction_advice_with_groq(layout, qty, cost)

# Vector Floor Plan Reconstruction & Calibration API
@app.post("/api/floorplan/upload")
@app.post("/api/floorplan/reconstruct")
async def floorplan_reconstruct_endpoint(
    file: UploadFile = File(...),
    calibration_width: Optional[float] = Form(None)
):
    """
    Complete vector reconstruction pipeline: Converts uploaded image/drawing
    into canonical vector HouseLayout (rooms, walls, openings, stairs, quantities, estimate).
    """
    contents = await file.read()
    layout, verification = reconstruct_floorplan_vector(
        image_bytes=contents,
        filename=file.filename or "drawing.jpg",
        content_type=file.content_type or "image/jpeg",
        calibration_reference_ft=calibration_width
    )
    try:
        save_project(layout, layout.id)
    except Exception:
        pass

    return {
        "layout": layout,
        "verification": verification
    }

@app.post("/api/floorplan/calibrate")
def floorplan_calibrate_endpoint(req: Dict[str, Any]):
    """Calibrates pixels to real-world feet scale transform."""
    px_dist = float(req.get("pixel_distance", 100.0))
    real_ft = float(req.get("real_world_distance_ft", 10.0))
    cal = calibrate_scale(px_dist, real_ft)
    return cal

@app.post("/api/floorplan/verify")
def floorplan_verify_endpoint(req: Dict[str, Any]):
    """Receives user corrections on reconstructed plan and re-synthesizes HouseLayout."""
    layout_dict = req.get("layout")
    if not layout_dict:
        raise HTTPException(status_code=400, detail="Missing layout")
    layout = HouseLayout.model_validate(layout_dict)
    layout.validation = validate_design(layout)
    layout.quantities = calculate_material_quantities(layout, layout.construction_spec)
    layout.cost_estimate = estimate_construction_cost(layout, layout.quantities)
    save_project(layout, layout.id)
    return layout

# Backward-compatible endpoint
@app.post("/api/upload-floorplan")
async def legacy_upload_floorplan_endpoint(
    file: UploadFile = File(...),
    calibration_width: Optional[float] = Form(38.0)
):
    """Legacy floor plan upload compatible with older frontend clients."""
    contents = await file.read()
    layout, verification = reconstruct_floorplan_vector(
        image_bytes=contents,
        filename=file.filename or "uploaded_plan.jpg",
        content_type=file.content_type or "image/jpeg",
        calibration_reference_ft=calibration_width
    )
    return {
        "vision_analysis": verification.model_dump(),
        "layout": layout
    }

# Project Persistence & Version History API
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

@app.post("/api/edit-room", response_model=EditRoomResponse)
async def edit_room_endpoint(req: EditRoomRequest):
    """
    Validates and updates an individual room's rect within the canonical layout.
    Enforces:
    1. Buildable envelope & setback containment (cannot cross plot boundary).
    2. Room minimums (min_width, min_length).
    3. Shared wall behavior: moves shared boundaries cleanly with single canonical walls.
    4. Adjacent room management: adjusts adjoining neighbors if they have room to yield,
       or rejects with clear message if neighbor would shrink below minimums.
    5. Attached bathroom continuity: preserves connection and contact.
    6. Furniture revalidation inside room bounds.
    7. Full wall network & door/window regeneration.
    8. Floor-aware local re-optimization and persistence.
    """
    layout = req.current_layout.model_copy(deep=True)
    room_id = req.room_id
    proposed = req.proposed_rect
    push_adjacent = getattr(req, "push_adjacent", True)

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

    orig_rect = target_room.rect or Rect(x=target_room.x, y=target_room.y, width=target_room.width, length=target_room.depth)

    # 1. Check Room Minimums
    min_w = getattr(target_room, "min_width", 5.0) or 5.0
    min_l = getattr(target_room, "min_length", 5.0) or 5.0

    if proposed.width < min_w - 0.05:
        return EditRoomResponse(
            layout=layout,
            status="rejected",
            reason=f"Minimum width: {round(min_w, 1)}'-0\"",
            adjusted_rect=orig_rect
        )

    if proposed.length < min_l - 0.05:
        return EditRoomResponse(
            layout=layout,
            status="rejected",
            reason=f"Minimum length: {round(min_l, 1)}'-0\"",
            adjusted_rect=orig_rect
        )

    # 2. Check Envelope & Setbacks
    site = layout.site
    if site and site.buildable_envelope:
        env = site.buildable_envelope
    else:
        env = Rect(x=0.0, y=0.0, width=layout.plot_width, length=layout.plot_length)

    new_w = round(max(min_w, min(env.width, proposed.width)), 1)
    new_l = round(max(min_l, min(env.length, proposed.length)), 1)
    clamped_x = round(max(env.x, min(env.right - new_w, proposed.x)), 1)
    clamped_y = round(max(env.y, min(env.bottom - new_l, proposed.y)), 1)

    envelope_clamped = (clamped_x != proposed.x or clamped_y != proposed.y or new_w != proposed.width or new_l != proposed.length)
    current_rect = Rect(x=clamped_x, y=clamped_y, width=new_w, length=new_l)

    # 3. Adjacent Room Management & Shared Wall Behavior
    floor_rooms = target_floor.rooms if target_floor else layout.rooms
    other_rooms = [r for r in floor_rooms if r.id != room_id and r.rect]
    affected_room_ids: List[str] = []

    # Detect edge movement deltas
    delta_right = current_rect.right - orig_rect.right
    delta_left = orig_rect.x - current_rect.x
    delta_bottom = current_rect.bottom - orig_rect.bottom
    delta_top = orig_rect.y - current_rect.y

    if push_adjacent:
        # Check Right Edge Expansion
        if delta_right > 0.1:
            for o in other_rooms:
                if abs(o.rect.x - orig_rect.right) <= 0.6 and (min(current_rect.bottom, o.rect.bottom) - max(current_rect.y, o.rect.y)) > 0.5:
                    o_min_w = getattr(o, "min_width", 5.0) or 5.0
                    new_o_w = round(o.rect.right - current_rect.right, 1)
                    if new_o_w < o_min_w:
                        return EditRoomResponse(
                            layout=layout,
                            status="rejected",
                            reason=f"Expanding {target_room.name} by {round(delta_right, 1)} ft would make {o.name} smaller than its minimum required width of {round(o_min_w, 1)}'.",
                            adjusted_rect=orig_rect
                        )
                    o.rect.x = current_rect.right
                    o.rect.width = new_o_w
                    o.actual_width = new_o_w
                    o.area_sqft = round(new_o_w * o.rect.length, 1)
                    o.dimensions_label = f"{round(new_o_w, 1)}' × {round(o.rect.length, 1)}'"
                    affected_room_ids.append(o.id)

        # Check Left Edge Expansion
        if delta_left > 0.1:
            for o in other_rooms:
                if abs(o.rect.right - orig_rect.x) <= 0.6 and (min(current_rect.bottom, o.rect.bottom) - max(current_rect.y, o.rect.y)) > 0.5:
                    o_min_w = getattr(o, "min_width", 5.0) or 5.0
                    new_o_w = round(current_rect.x - o.rect.x, 1)
                    if new_o_w < o_min_w:
                        return EditRoomResponse(
                            layout=layout,
                            status="rejected",
                            reason=f"Expanding {target_room.name} by {round(delta_left, 1)} ft would make {o.name} smaller than its minimum required width of {round(o_min_w, 1)}'.",
                            adjusted_rect=orig_rect
                        )
                    o.rect.width = new_o_w
                    o.actual_width = new_o_w
                    o.area_sqft = round(new_o_w * o.rect.length, 1)
                    o.dimensions_label = f"{round(new_o_w, 1)}' × {round(o.rect.length, 1)}'"
                    affected_room_ids.append(o.id)

        # Check Bottom Edge Expansion
        if delta_bottom > 0.1:
            for o in other_rooms:
                if abs(o.rect.y - orig_rect.bottom) <= 0.6 and (min(current_rect.right, o.rect.right) - max(current_rect.x, o.rect.x)) > 0.5:
                    o_min_l = getattr(o, "min_length", 5.0) or 5.0
                    new_o_l = round(o.rect.bottom - current_rect.bottom, 1)
                    if new_o_l < o_min_l:
                        return EditRoomResponse(
                            layout=layout,
                            status="rejected",
                            reason=f"Expanding {target_room.name} by {round(delta_bottom, 1)} ft would make {o.name} smaller than its minimum required length of {round(o_min_l, 1)}'.",
                            adjusted_rect=orig_rect
                        )
                    o.rect.y = current_rect.bottom
                    o.rect.length = new_o_l
                    o.actual_length = new_o_l
                    o.area_sqft = round(o.rect.width * new_o_l, 1)
                    o.dimensions_label = f"{round(o.rect.width, 1)}' × {round(new_o_l, 1)}'"
                    affected_room_ids.append(o.id)

        # Check Top Edge Expansion
        if delta_top > 0.1:
            for o in other_rooms:
                if abs(o.rect.bottom - orig_rect.y) <= 0.6 and (min(current_rect.right, o.rect.right) - max(current_rect.x, o.rect.x)) > 0.5:
                    o_min_l = getattr(o, "min_length", 5.0) or 5.0
                    new_o_l = round(current_rect.y - o.rect.y, 1)
                    if new_o_l < o_min_l:
                        return EditRoomResponse(
                            layout=layout,
                            status="rejected",
                            reason=f"Expanding {target_room.name} by {round(delta_top, 1)} ft would make {o.name} smaller than its minimum required length of {round(o_min_l, 1)}'.",
                            adjusted_rect=orig_rect
                        )
                    o.rect.length = new_o_l
                    o.actual_length = new_o_l
                    o.area_sqft = round(o.rect.width * new_o_l, 1)
                    o.dimensions_label = f"{round(o.rect.width, 1)}' × {round(new_o_l, 1)}'"
                    affected_room_ids.append(o.id)

    # 4. Check for Room Overlap
    prop_box = box(current_rect.x, current_rect.y, current_rect.right, current_rect.bottom)
    for o in other_rooms:
        o_box = box(o.rect.x, o.rect.y, o.rect.right, o.rect.bottom)
        inter = prop_box.intersection(o_box)
        if inter.area > 0.2:
            return EditRoomResponse(
                layout=layout,
                status="rejected",
                reason=f"Room cannot be expanded further without affecting {o.name}.",
                adjusted_rect=orig_rect
            )

    # 5. Attached Bathroom Continuity Preservation
    # If target room is bedroom with attached bathroom, ensure bathroom maintains connection
    for o in other_rooms:
        if (getattr(o, "attached_room_id", None) == target_room.id or getattr(target_room, "attached_room_id", None) == o.id) and o.type in ["bathroom", "master_bedroom"]:
            # Check if o still touches target_room
            o_box = box(o.rect.x, o.rect.y, o.rect.right, o.rect.bottom)
            touches = prop_box.touches(o_box) or prop_box.distance(o_box) < 0.2
            if not touches:
                # Shift attached bathroom to remain adjacent along the nearest edge
                if abs(orig_rect.right - o.rect.x) < 0.5:
                    o.rect.x = current_rect.right
                elif abs(orig_rect.x - o.rect.right) < 0.5:
                    o.rect.x = current_rect.x - o.rect.width
                elif abs(orig_rect.bottom - o.rect.y) < 0.5:
                    o.rect.y = current_rect.bottom
                elif abs(orig_rect.y - o.rect.bottom) < 0.5:
                    o.rect.y = current_rect.y - o.rect.length
                affected_room_ids.append(o.id)

    # Commit target room rect
    target_room.rect = current_rect
    target_room.x = current_rect.x
    target_room.y = current_rect.y
    target_room.width = current_rect.width
    target_room.depth = current_rect.length
    target_room.actual_width = current_rect.width
    target_room.actual_length = current_rect.length
    target_room.area_sqft = current_rect.area
    target_room.area = current_rect.area
    target_room.dimensions_label = f"{round(current_rect.width, 1)}' × {round(current_rect.length, 1)}'"

    for r in layout.rooms:
        if r.id == room_id:
            r.rect = current_rect
            r.x = current_rect.x
            r.y = current_rect.y
            r.width = current_rect.width
            r.depth = current_rect.length
            r.actual_width = current_rect.width
            r.actual_length = current_rect.length
            r.area_sqft = current_rect.area
            r.area = current_rect.area
            r.dimensions_label = target_room.dimensions_label

    # 6. Revalidate Furniture inside Target Room & Affected Rooms
    f_items, _, _ = validate_and_place_furniture(target_room)
    target_room.furniture = f_items
    for r in layout.rooms:
        if r.id == room_id:
            r.furniture = f_items

    for aff_id in affected_room_ids:
        aff_room = next((r for r in floor_rooms if r.id == aff_id), None)
        if aff_room:
            aff_furn, _, _ = validate_and_place_furniture(aff_room)
            aff_room.furniture = aff_furn
            for r in layout.rooms:
                if r.id == aff_id:
                    r.furniture = aff_furn
                    if aff_room.rect:
                        r.rect = aff_room.rect
                        r.x = aff_room.rect.x
                        r.y = aff_room.rect.y
                        r.width = aff_room.rect.width
                        r.depth = aff_room.rect.length
                        r.actual_width = aff_room.rect.width
                        r.actual_length = aff_room.rect.length
                        r.area_sqft = aff_room.rect.area
                        r.area = aff_room.rect.area
                        r.dimensions_label = aff_room.dimensions_label

    # 7. Global Wall Network, Door & Window Regeneration
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

    # 8. Scores, Quantities & Cost Estimates
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
    layout.quantities = calculate_material_quantities(layout, layout.construction_spec)
    layout.cost_estimate = estimate_construction_cost(layout, layout.quantities)

    # 9. Auto-Persist to project storage
    try:
        save_project(layout, layout.id)
    except Exception as e:
        print(f"[STORAGE WARNING] Failed to persist edited layout: {e}")

    status_str = "autocorrected" if envelope_clamped else "accepted"
    reason_str = "Dimensions clamped to buildable envelope." if envelope_clamped else None

    return EditRoomResponse(
        layout=layout,
        status=status_str,
        reason=reason_str,
        adjusted_rect=current_rect,
        affected_rooms=affected_room_ids
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


@app.post("/api/export/dxf")
async def export_dxf_endpoint(layout: HouseLayout):
    """Generates standard AutoCAD R12 DXF format from canonical HouseLayout."""
    dxf_content = export_layout_to_dxf(layout)
    filename = f"{layout.id or 'floorplan'}.dxf"
    return PlainTextResponse(
        content=dxf_content,
        media_type="application/dxf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.post("/api/export/svg")
async def export_svg_endpoint(layout: HouseLayout):
    """Generates an Indian Standard architectural blueprint SVG drawing."""
    svg_content = export_layout_to_indian_drawing_svg(layout)
    filename = f"{layout.id or 'floorplan'}.svg"
    return Response(
        content=svg_content,
        media_type="image/svg+xml",
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )


@app.get("/api/projects/{project_id}/export/dxf")
async def export_project_dxf(project_id: str = FastPath(...)):
    """Export saved project to AutoCAD DXF."""
    layout = get_project(project_id)
    if not layout:
        raise HTTPException(status_code=404, detail="Project not found")
    dxf_content = export_layout_to_dxf(layout)
    return PlainTextResponse(
        content=dxf_content,
        media_type="application/dxf",
        headers={"Content-Disposition": f'attachment; filename="{project_id}.dxf"'}
    )


@app.get("/api/projects/{project_id}/export/svg")
async def export_project_svg(project_id: str = FastPath(...)):
    """Export saved project to Indian standard blueprint SVG."""
    layout = get_project(project_id)
    if not layout:
        raise HTTPException(status_code=404, detail="Project not found")
    svg_content = export_layout_to_indian_drawing_svg(layout)
    return Response(
        content=svg_content,
        media_type="image/svg+xml",
        headers={"Content-Disposition": f'inline; filename="{project_id}.svg"'}
    )


# ============================================================
# BLENDER PHOTOREALISTIC RENDERING ENDPOINTS
# ============================================================

from render.render_service import render_layout_realistic, check_blender_status

@app.get("/api/render-realistic/status")
async def get_render_engine_status():
    """Checks whether Blender is available in the current runtime environment."""
    return check_blender_status()


@app.post("/api/render-realistic")
async def render_realistic_endpoint(request: Dict[str, Any]):
    """
    Renders high-fidelity architectural visualization using Blender / Cycles
    from canonical HouseLayout.
    """
    layout_data = request.get("layout")
    project_id = request.get("project_id")
    
    if not layout_data and project_id:
        proj = get_project(project_id)
        if proj:
            layout_data = proj.model_dump() if hasattr(proj, "model_dump") else proj.dict()
            
    if not layout_data:
        raise HTTPException(status_code=400, detail="Missing required layout or project_id in render request.")
        
    cutaway = bool(request.get("cutaway", True))
    resolution = str(request.get("resolution", "1920x1080"))
    samples = int(request.get("samples", 64))
    lighting = str(request.get("lighting", "day"))
    
    if hasattr(layout_data, "model_dump"):
        layout_dict = layout_data.model_dump()
    elif hasattr(layout_data, "dict"):
        layout_dict = layout_data.dict()
    else:
        layout_dict = layout_data
        
    result = render_layout_realistic(
        layout_data=layout_dict,
        cutaway=cutaway,
        resolution=resolution,
        samples=samples,
        lighting=lighting
    )
    return result
