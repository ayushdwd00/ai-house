"""
Groq AI Architectural Reasoning Layer
Implements an active architectural intelligence layer using Pydantic structured outputs:
1. Structured Requirement Interpretation
2. Architectural Concept Generation (2-3 distinct spatial strategies)
3. Room Zoning & Adjacency Reasoning
4. Architectural Design Critique of mathematically solved layouts
5. Natural-Language Modification Interpretation
6. Floor Plan Vision Analysis
7. Construction & Value-Engineering Advisory

All LLM operations are routed through the unified LLMClient layer (backend/llm/).
"""

import os
import re
import json
from typing import Dict, Any, Optional, List, Tuple, Literal
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from llm import get_llm_client, LLMResult
from models import ArchitecturalRequirements, DreamHomeStructuredRequirements, LandscapePreferences

load_dotenv()


def get_groq_client():
    """Legacy helper for backwards-compatibility; returns underlying client if available."""
    client = get_llm_client()
    return getattr(client, "_raw_client", None)


# 1. Pydantic Structured Output Models

class ArchitecturalConceptStrategy(BaseModel):
    strategy_id: str = Field(..., description="Unique scheme identifier, e.g. scheme_central_circulation")
    name: str = Field(..., description="Human-readable concept name")
    architectural_thesis: str = Field(..., description="Core design rationale and spatial philosophy")
    circulation_philosophy: str = Field(..., description="How hallways and entry buffers navigate human flow")
    circulation_type: Literal["central", "side", "linear"] = Field(default="central")
    zoning_placement: Dict[str, Dict[str, str]] = Field(
        default_factory=dict,
        description="Topological quadrant placement hints for the CP-SAT solver"
    )
    priority_adjacencies: List[List[str]] = Field(default_factory=list, description="Pairs of rooms that must be adjacent")
    priority_separations: List[List[str]] = Field(default_factory=list, description="Pairs of rooms that must be acoustically separated")


class ArchitecturalConceptsResult(BaseModel):
    concepts: List[ArchitecturalConceptStrategy] = Field(default_factory=list)
    architectural_reasoning: str = Field(default="")
    llm_source: Optional[str] = Field(default="llm", description="Source tracking: 'llm', 'retry', or 'deterministic_fallback'")


class ArchitecturalCritique(BaseModel):
    selected_candidate: str = Field(..., description="ID of winning layout scheme")
    reasoning: str = Field(..., description="Architectural critique justifying selection")
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)
    local_reoptimization_target: Optional[str] = Field(default=None, description="Optional room type requiring local re-optimization, e.g. master_bedroom, kitchen")
    local_reoptimization_operation: Optional[str] = Field(default=None, description="Operation such as enlarge, shrink, relocate_closer")
    architectural_coherence_score: float = Field(default=90.0)
    llm_source: Optional[str] = Field(default="llm", description="Source tracking: 'llm', 'retry', or 'deterministic_fallback'")


class CriticIssue(BaseModel):
    severity: Literal["high", "medium", "low"] = Field(..., description="Issue severity")
    entity_id: str = Field(..., description="Entity identifier, e.g. room_001, wall_014, door_008")
    category: str = Field(..., description="Category: geometry, daylight, circulation, privacy, vastu, cost")
    problem: str = Field(..., description="Concise statement of the architectural problem")


class CriticSuggestion(BaseModel):
    entity_id: str = Field(..., description="Entity identifier targeted for refinement")
    action: str = Field(..., description="Actionable recommendation, e.g. enlarge by 2ft, add window, relocate closer")


class GroqCriticReport(BaseModel):
    issues: List[CriticIssue] = Field(default_factory=list)
    suggestions: List[CriticSuggestion] = Field(default_factory=list)
    llm_source: Optional[str] = Field(default="llm")


class NaturalLanguageModificationCommand(BaseModel):
    target_room_type: str = Field(..., description="Canonical room type to modify, e.g. master_bedroom, kitchen, parking, budget")
    operation: Literal["enlarge", "shrink", "add_attached_bath", "relocate_closer", "set_parking", "set_budget", "general_adjust"] = Field(default="enlarge")
    delta_width: float = Field(default=0.0, description="Proposed width change in feet")
    delta_length: float = Field(default=0.0, description="Proposed length change in feet")
    target_value: Optional[float] = Field(default=None, description="Numeric target value (e.g. 2 for 2-car parking, 4500000 for budget)")
    partner_room: Optional[str] = Field(default=None, description="Related room for proximity adjustments, e.g. dining")
    architectural_rationale: str = Field(default="", description="Architectural justification for this edit")
    llm_source: Optional[str] = Field(default="llm", description="Source tracking: 'llm', 'retry', or 'deterministic_fallback'")


# 2. Structured Requirement Interpretation

def _deterministic_requirement_fallback(prompt: str) -> ArchitecturalRequirements:
    """Heuristic Architectural Fallback Parser when LLM is unavailable or unneeded."""
    lower = prompt.lower()

    # Floors
    num_floors = 1
    if any(k in lower for k in ["2-story", "2 story", "two story", "two stories", "2 floors", "2 floor", "two levels", "g+1"]):
        num_floors = 2
    elif any(k in lower for k in ["3-story", "3 story", "three story", "three levels", "g+2"]):
        num_floors = 3

    # Bedrooms
    bed_match = re.search(r'(\d+)\s*(?:bed|bedroom|bds|br|bhk)\b', lower)
    bedrooms = int(bed_match.group(1)) if bed_match else 3
    bedrooms = max(1, min(6, bedrooms))

    # Bathrooms
    bath_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:bath|bathroom|ba)\b', lower)
    bathrooms = float(bath_match.group(1)) if bath_match else 2.0
    bathrooms = max(1.0, min(5.0, bathrooms))

    # Plot dimensions
    dim_match = re.search(r'(\d{2,3})\s*(?:x|by|\*|×)\s*(\d{2,3})', lower)
    if dim_match:
        plot_w = float(dim_match.group(1))
        plot_l = float(dim_match.group(2))
    else:
        sqft_match = re.search(r'(\d{3,5})\s*(?:sq\s*ft|sqft)', lower)
        if sqft_match:
            sqft = float(sqft_match.group(1))
            side = (sqft / num_floors / 1.15) ** 0.5
            plot_l = round(side, 1)
            plot_w = round((sqft / num_floors) / plot_l, 1)
        else:
            plot_w, plot_l = 40.0, 50.0

    # Road orientation
    road = "south"
    if "north" in lower:
        road = "north"
    elif "east" in lower:
        road = "east"
    elif "west" in lower:
        road = "west"

    # Parking
    parking = 2 if ("2 car" in lower or "two car" in lower) else (0 if "no parking" in lower else 1)

    # Special rooms
    special = []
    has_office = any(k in lower for k in ["office", "study", "work from home", "studio"])
    if has_office:
        special.append("Home Office")
    if any(k in lower for k in ["pooja", "puja", "prayer"]):
        special.append("Pooja")
    has_patio = any(k in lower for k in ["balcony", "patio", "deck", "terrace"])
    if has_patio:
        special.append("Covered Patio")
    has_courtyard = "courtyard" in lower

    vastu = "vastu" in lower or "vaastu" in lower

    # Landscape intent parsing
    has_landscape_request = any(k in lower for k in [
        "garden", "greenery", "landscape", "landscaping", "lawn", "trees", "tree", "plants",
        "pathway", "path", "courtyard", "outdoor light", "lights", "water feature", "backyard"
    ])
    ls_prefs = None
    if has_landscape_request:
        ls_style = "modern_minimal"
        if "tropical" in lower or "lush" in lower:
            ls_style = "lush_tropical"
        elif "traditional" in lower or "classical" in lower:
            ls_style = "traditional"
        elif "scandinavian" in lower or "nordic" in lower:
            ls_style = "scandinavian"

        greenery_lvl = "medium"
        if "lots of greenery" in lower or "dense greenery" in lower or "lots of plants" in lower:
            greenery_lvl = "dense"
        elif "minimal" in lower or "minimalist" in lower:
            greenery_lvl = "low"

        tree_count = None
        tree_match = re.search(r'(\d+)\s*(?:tree|trees)\b', lower)
        if tree_match:
            tree_count = int(tree_match.group(1))

        ls_prefs = LandscapePreferences(
            style=ls_style,
            front_garden="front garden" in lower or "garden in the front" in lower or "small front garden" in lower or "garden" in lower,
            rear_garden="rear garden" in lower or "back garden" in lower or "backyard" in lower or ("keep the backyard open" not in lower),
            pathway_type="stepping_stones" if "minimal" in lower else "paved_stone",
            entrance_pathway="pathway" in lower or "path" in lower or "entrance" in lower,
            outdoor_lighting="light" in lower or "lighting" in lower,
            greenery_level=greenery_lvl,
            boundary_hedges="boundary" in lower or "hedge" in lower or "hedges" in lower,
            boundary_planting="boundary" in lower or "perimeter" in lower,
            trees=tree_count,
            courtyard="courtyard" in lower,
            water_feature="water feature" in lower or "fountain" in lower or "pond" in lower,
            lawn_priority=True,
            outdoor_seating="seating" in lower or "bench" in lower
        )

    req = ArchitecturalRequirements(
        plot_width=plot_w,
        plot_length=plot_l,
        num_floors=num_floors,
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        road_side=road,
        parking_spaces=parking,
        style="Modern Scandinavian" if "scandinavian" in lower else ("Modern Farmhouse" if "farmhouse" in lower else "Modern Contemporary"),
        special_rooms=special,
        open_concept="closed kitchen" not in lower,
        vastu_compliant=vastu,
        office_requirement=has_office,
        patio_balcony_requirement=has_patio,
        courtyard_requirement=has_courtyard,
        user_prompt=prompt,
        designer_intent=f"Residential layout for {bedrooms} bedrooms on {plot_w}x{plot_l}ft site facing {road}.",
        landscape_preferences=ls_prefs
    )
    return req


def interpret_requirements_with_groq(prompt: str) -> ArchitecturalRequirements:
    """
    Parses natural language requirements into structured ArchitecturalRequirements.
    Uses Groq LLM with Pydantic JSON schema when available; falls back to smart rule parser.
    """
    if not prompt or len(prompt.strip()) < 3:
        return _deterministic_requirement_fallback(prompt)

    client = get_llm_client()
    system_prompt = (
        "You are a Principal Residential Architect. "
        "Extract structured architectural parameters from the user's design request. "
        "Extract plot width, plot length, num_floors, bedrooms, bathrooms, road orientation, "
        "parking spaces, architectural style, special rooms, and vastu preferences."
    )

    res: LLMResult = client.chat_json(
        task="requirements",
        system=system_prompt,
        user=prompt,
        schema=ArchitecturalRequirements,
        fallback_fn=lambda: _deterministic_requirement_fallback(prompt),
        temperature=0.15
    )

    req: ArchitecturalRequirements = res.data
    req.llm_source = res.source
    if hasattr(req, "metadata") and isinstance(req.metadata, dict):
        req.metadata["_llm_source"] = res.source
    return req


def parse_intake_with_groq_or_fallback(prompt: str) -> Dict[str, Any]:
    """Backwards-compatible dict interface for intake endpoints."""
    req = interpret_requirements_with_groq(prompt)
    res = req.model_dump()
    res["ai_note"] = req.designer_intent
    res["_llm_source"] = getattr(req, "metadata", {}).get("_llm_source", "llm")
    return res


# 3. Dream Home Interpreter

def _deterministic_dream_home_fallback(
    prompt: str,
    existing_context: Optional[Dict[str, Any]] = None
) -> DreamHomeStructuredRequirements:
    lower = prompt.lower().strip()
    ctx = existing_context or {}

    dim_match = re.search(r'(\d{2,3})\s*(?:x|by|\*|×)\s*(\d{2,3})', lower)
    sqft_match = re.search(r'(\d{3,5})\s*(?:sq\s*ft|sqft)', lower)

    plot_w: Optional[float] = None
    plot_l: Optional[float] = None
    if dim_match:
        plot_w = float(dim_match.group(1))
        plot_l = float(dim_match.group(2))
    elif sqft_match:
        sqft = float(sqft_match.group(1))
        side = (sqft / 1.15) ** 0.5
        plot_l = round(side, 1)
        plot_w = round(sqft / plot_l, 1)
    elif ctx.get("plot", {}).get("width") and ctx.get("plot", {}).get("length"):
        plot_w = float(ctx["plot"]["width"])
        plot_l = float(ctx["plot"]["length"])

    floors = ctx.get("floors", 1)
    if any(k in lower for k in ["g+1", "g + 1", "2-story", "2 story", "two story", "two floors", "2 floors", "duplex"]):
        floors = 2
    elif any(k in lower for k in ["g+2", "g + 2", "3-story", "3 story", "three story"]):
        floors = 3

    has_future_floor = any(k in lower for k in ["future first floor", "future 1st floor", "future floor", "future expansion", "future level"])
    staircase_needed = has_future_floor or floors > 1 or any(k in lower for k in ["staircase", "stairs", "stair"])

    bedrooms = ctx.get("bedrooms", 3)
    bhk_match = re.search(r'(\d+)\s*bhk\b', lower)
    bed_match = re.search(r'(\d+)\s*(?:bed|bedroom|bds|br)\b', lower)
    if bhk_match:
        bedrooms = int(bhk_match.group(1))
    elif bed_match:
        bedrooms = int(bed_match.group(1))
    bedrooms = max(1, min(6, bedrooms))

    bathrooms = float(ctx.get("bathrooms", 2.0))
    bath_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:bath|bathroom|ba)\b', lower)
    if bath_match:
        bathrooms = float(bath_match.group(1))
    bathrooms = max(1.0, min(5.0, bathrooms))

    attached_baths: Optional[int] = ctx.get("attached_bathrooms")
    if "one attached" in lower or "1 attached" in lower:
        attached_baths = 1
    elif "two attached" in lower or "2 attached" in lower:
        attached_baths = 2
    elif "all attached" in lower or "each attached" in lower:
        attached_baths = bedrooms
    else:
        att_match = re.search(r'(\d+)\s*attached\b', lower)
        if att_match:
            attached_baths = int(att_match.group(1))

    cars = 1
    parking_req = True
    if any(k in lower for k in ["two car", "two cars", "2 car", "2 cars", "two suv", "two suvs", "2 suv", "2 suvs"]):
        cars = 2
    elif "no parking" in lower or "without parking" in lower:
        parking_req = False
        cars = 0
    elif "parking" in lower or "car" in lower:
        cars = 1

    open_kitchen = True
    if "closed kitchen" in lower or "separate kitchen" in lower:
        open_kitchen = False

    style = "modern"
    if "contemporary" in lower:
        style = "contemporary"
    elif "farmhouse" in lower:
        style = "farmhouse"
    elif "scandinavian" in lower:
        style = "scandinavian"
    elif "minimalist" in lower:
        style = "minimalist"
    elif "traditional" in lower:
        style = "traditional"

    prefs: List[str] = []
    natural_light = ("lots of natural light" in lower or "natural light" in lower or "sunlight" in lower or "bright" in lower)
    if natural_light:
        prefs.append("Maximized natural daylight and cross ventilation")
    if "large living" in lower or "big living" in lower:
        prefs.append("Expanded living room area")
    if "privacy" in lower:
        prefs.append("Enhanced bedroom privacy zoning")
    if open_kitchen:
        prefs.append("Seamless open kitchen and dining integration")
    if has_future_floor:
        prefs.append("Future first-floor expansion with structural stair core alignment")
    if "parents" in lower:
        prefs.append("Ground floor elderly-accessible bedroom near living")

    specials: List[str] = []
    if any(k in lower for k in ["pooja", "puja", "mandir"]):
        specials.append("Pooja Room")
    if any(k in lower for k in ["office", "study", "work from home"]):
        specials.append("Home Office")
    if any(k in lower for k in ["balcony", "patio", "terrace", "deck"]):
        specials.append("Covered Balcony / Patio")
    if "courtyard" in lower:
        specials.append("Central Courtyard")

    missing_fields: List[str] = []
    clarification: Optional[str] = None
    if plot_w is None or plot_l is None:
        missing_fields.append("plot_dimensions")
        clarification = "What is your plot size? (e.g. 30×50 ft)"

    intent = (
        f"Custom {bedrooms}BHK {style.capitalize()} home brief"
        + (f" on {plot_w}×{plot_l} ft site" if plot_w and plot_l else "")
        + f" with {cars}-car parking"
        + (", open kitchen" if open_kitchen else "")
        + (", future first-floor stair core" if has_future_floor else "")
        + "."
    )

    return DreamHomeStructuredRequirements(
        plot={"length": plot_l, "width": plot_w, "unit": "ft"},
        floors=floors,
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        attached_bathrooms=attached_baths,
        kitchen=True,
        living_room=True,
        dining_room=True,
        parking={"required": parking_req, "cars": cars},
        staircase={"required": staircase_needed, "future_floor": has_future_floor},
        preferences=prefs,
        style=style,
        natural_light_priority=natural_light,
        open_kitchen=open_kitchen,
        special_requirements=specials,
        missing_critical_fields=missing_fields,
        clarification_prompt=clarification,
        designer_intent=intent,
        landscape_preferences=None
    )


def interpret_dream_home_prompt(
    prompt: str,
    existing_context: Optional[Dict[str, Any]] = None
) -> DreamHomeStructuredRequirements:
    """
    Translates free-form natural language dream home briefs into structured
    architectural requirements adhering to DreamHomeStructuredRequirements schema.
    """
    if not prompt or len(prompt.strip()) < 3:
        return _deterministic_dream_home_fallback(prompt, existing_context)

    client = get_llm_client()
    system_prompt = (
        "You are a Principal Residential Architect. "
        "Extract structured architectural requirements from the user's natural language dream home description. "
        "CRITICAL RULES:\n"
        "- If plot dimensions are completely omitted and not in context, flag 'missing_critical_fields': ['plot_dimensions'] "
        "and set 'clarification_prompt': 'What is your plot size? (e.g. 30×50 ft)'\n"
        "- If 'future first floor' or 'future floor' is requested, set staircase.required=true and staircase.future_floor=true, with floors=1.\n"
        "- For 'open kitchen', set open_kitchen=true.\n"
        "- Extract bedroom count, attached bathrooms, car parking, and priorities."
    )
    user_payload = prompt
    if existing_context:
        user_payload += f"\nExisting context: {json.dumps(existing_context)}"

    res: LLMResult = client.chat_json(
        task="requirements",
        system=system_prompt,
        user=user_payload,
        schema=DreamHomeStructuredRequirements,
        fallback_fn=lambda: _deterministic_dream_home_fallback(prompt, existing_context),
        temperature=0.15
    )
    return res.data


# 4. Architectural Concept Generation

def _deterministic_concepts_fallback(req: ArchitecturalRequirements) -> ArchitecturalConceptsResult:
    road = req.road_side

    s1 = ArchitecturalConceptStrategy(
        strategy_id="scheme_central_circulation",
        name="Central Circulation Spine",
        architectural_thesis="Central foyer and gallery provides an intuitive spine separating public gathering from quiet sleeping quarters.",
        circulation_philosophy="Minimal hallway square footage with direct line-of-sight privacy buffers.",
        circulation_type="central",
        zoning_placement={
            "entry_foyer": {"rel_y": "front", "rel_x": "center"},
            "living_room": {"rel_y": "front", "rel_x": "center"},
            "dining": {"rel_y": "middle", "rel_x": "right"},
            "kitchen": {"rel_y": "middle", "rel_x": "right"},
            "master_bedroom": {"rel_y": "rear", "rel_x": "left"},
            "bedroom": {"rel_y": "rear", "rel_x": "right"},
            "bathroom": {"rel_y": "middle", "rel_x": "left"},
            "hallway": {"rel_y": "middle", "rel_x": "center"}
        },
        priority_adjacencies=[["dining", "kitchen"], ["living_room", "entry_foyer"]],
        priority_separations=[["master_bedroom", "entry_foyer"], ["bedroom", "kitchen"]]
    )

    s2 = ArchitecturalConceptStrategy(
        strategy_id="scheme_public_private_split",
        name="Public-Private Zonal Split",
        architectural_thesis="Strict acoustic partition: all entertaining spaces placed at frontage; sleeping wing isolated at the quiet rear.",
        circulation_philosophy="Transitional acoustic buffer door isolating the private bedroom wing.",
        circulation_type="side",
        zoning_placement={
            "entry_foyer": {"rel_y": "front", "rel_x": "center"},
            "living_room": {"rel_y": "front", "rel_x": "left"},
            "dining": {"rel_y": "front", "rel_x": "right"},
            "kitchen": {"rel_y": "front", "rel_x": "right"},
            "master_bedroom": {"rel_y": "rear", "rel_x": "center"},
            "bedroom": {"rel_y": "rear", "rel_x": "right"},
            "bathroom": {"rel_y": "middle", "rel_x": "center"},
            "hallway": {"rel_y": "middle", "rel_x": "left"}
        },
        priority_adjacencies=[["dining", "kitchen"]],
        priority_separations=[["master_bedroom", "living_room"]]
    )

    s3 = ArchitecturalConceptStrategy(
        strategy_id="scheme_side_circulation",
        name="Side Gallery Daylight Flow",
        architectural_thesis="Uninterrupted side circulation gallery maximizes cross-ventilation and outdoor garden exposures.",
        circulation_philosophy="Linear natural-light gallery framing garden views.",
        circulation_type="side",
        zoning_placement={
            "entry_foyer": {"rel_y": "front", "rel_x": "left"},
            "living_room": {"rel_y": "front", "rel_x": "left"},
            "dining": {"rel_y": "middle", "rel_x": "left"},
            "kitchen": {"rel_y": "middle", "rel_x": "right"},
            "master_bedroom": {"rel_y": "rear", "rel_x": "left"},
            "bedroom": {"rel_y": "rear", "rel_x": "right"},
            "bathroom": {"rel_y": "rear", "rel_x": "right"},
            "hallway": {"rel_y": "middle", "rel_x": "right"}
        }
    )

    return ArchitecturalConceptsResult(
        concepts=[s1, s2, s3],
        architectural_reasoning=f"Formulated 3 distinct residential typologies optimized for {road.capitalize()} frontage and {req.bedrooms} bedrooms.",
        llm_source="deterministic_fallback"
    )


def generate_architectural_concepts_with_groq(req: ArchitecturalRequirements) -> ArchitecturalConceptsResult:
    """
    Generates 2-3 distinct architectural spatial strategies.
    The LLM reasons about zoning hierarchy, circulation spines, and privacy gradients.
    Does NOT generate raw coordinates; generates topological placement constraints for CP-SAT.
    """
    client = get_llm_client()
    system_prompt = (
        "You are a Chief Residential Architect. "
        "Formulate 2-3 distinct architectural layout strategies for a house plot. "
        "Define zoning, acoustic privacy buffers, and circulation spines."
    )
    context = {
        "plot_dimensions": f"{req.plot_width}x{req.plot_length} ft",
        "road_orientation": req.road_side,
        "bedrooms": req.bedrooms,
        "bathrooms": req.bathrooms,
        "style": req.style,
        "vastu_compliant": req.vastu_compliant,
        "special_rooms": req.special_rooms
    }

    res: LLMResult = client.chat_json(
        task="concepts",
        system=system_prompt,
        user=json.dumps(context),
        schema=ArchitecturalConceptsResult,
        fallback_fn=lambda: _deterministic_concepts_fallback(req),
        temperature=0.0
    )

    result: ArchitecturalConceptsResult = res.data
    result.llm_source = res.source
    if len(result.concepts) < 2:
        fallback = _deterministic_concepts_fallback(req)
        fallback.llm_source = "deterministic_fallback"
        return fallback
    return result


# 5. Architectural Design Critique

def _deterministic_critique_fallback(candidate_summaries: List[Dict[str, Any]]) -> ArchitecturalCritique:
    if not candidate_summaries:
        return ArchitecturalCritique(
            selected_candidate="scheme_central_circulation",
            reasoning="Default central circulation scheme.",
            architectural_coherence_score=85.0,
            llm_source="deterministic_fallback"
        )
    sorted_summaries = sorted(candidate_summaries, key=lambda c: str(c.get("scheme_id", "")))
    best = max(sorted_summaries, key=lambda c: c.get("overall_score", 0.0))
    return ArchitecturalCritique(
        selected_candidate=best.get("scheme_id", "scheme_central_circulation"),
        reasoning=f"Scheme '{best.get('name')}' demonstrated superior spatial efficiency ({best.get('space_efficiency_score')}%), optimal circulation ({best.get('circulation_score')}%), and high bedroom acoustic privacy ({best.get('privacy_score')}%).",
        strengths=[
            f"Strong circulation efficiency ({best.get('circulation_score', 0)}%)",
            f"Bedroom acoustic buffer and privacy ({best.get('privacy_score', 0)}%)",
            f"Effective daylight opening exposure ({best.get('daylight_score', 0)}%)"
        ],
        weaknesses=best.get("warnings", [])[:2],
        suggestions=[
            "Consider sliding glazed doors between dining and patio for expanded entertaining.",
            "Utility sector can integrate stacked laundry and recessed pantry storage."
        ],
        architectural_coherence_score=float(best.get("overall_score", 88.0)),
        llm_source="deterministic_fallback"
    )


def _deterministic_critic_report_fallback(layout_dict: Dict[str, Any]) -> GroqCriticReport:
    issues: List[CriticIssue] = []
    suggestions: List[CriticSuggestion] = []

    rooms = layout_dict.get("rooms", [])
    for r in rooms:
        rid = r.get("id", "room")
        rtype = r.get("type", "")
        w = float(r.get("width", 0.0) or 0.0)
        l = float(r.get("length", 0.0) or 0.0)
        aspect = (max(w, l) / max(0.1, min(w, l))) if min(w, l) > 0.1 else 1.0
        if aspect > 2.0 and rtype not in ["hallway", "corridor", "staircase"]:
            issues.append(CriticIssue(
                severity="medium",
                entity_id=rid,
                category="geometry",
                problem=f"{r.get('name', rid)} aspect ratio {aspect:.2f}:1 is elongated."
            ))
            suggestions.append(CriticSuggestion(
                entity_id=rid,
                action=f"Rebalance {r.get('name', rid)} dimensions closer to 1.3:1 ratio."
            ))

    scores = layout_dict.get("scores", {})
    if float(scores.get("daylight_score", 100.0) or 100.0) < 70.0:
        issues.append(CriticIssue(
            severity="medium",
            entity_id="windows_network",
            category="daylight",
            problem="Living areas daylight exposure is below recommended threshold."
        ))
        suggestions.append(CriticSuggestion(
            entity_id="living_room",
            action="Increase window glazing along external facade to maximize daylight."
        ))

    if float(scores.get("circulation_score", 100.0) or 100.0) < 65.0:
        issues.append(CriticIssue(
            severity="low",
            entity_id="hallway",
            category="circulation",
            problem="Circulation path fraction is elevated relative to usable carpet area."
        ))
        suggestions.append(CriticSuggestion(
            entity_id="hallway",
            action="Consolidate circulation corridor to reduce transitional space."
        ))

    return GroqCriticReport(
        issues=issues,
        suggestions=suggestions,
        llm_source="deterministic_fallback"
    )


def run_groq_architectural_critic(layout_summary: Dict[str, Any]) -> GroqCriticReport:
    """
    Evaluates layout metrics and returns structured advisory issues and suggestions.
    Advisory only: suggestions are evaluated and applied only if re-validation passes.
    """
    client = get_llm_client()
    system_prompt = (
        "You are a Principal Architectural Critic evaluating a mathematically solved residential layout. "
        "Review the structured numeric data (dimensions, aspect ratios, daylight, circulation, privacy). "
        "Return structured issues and advisory suggestions. "
        "Do NOT return chain-of-thought; return strictly JSON matching the GroqCriticReport schema."
    )
    res: LLMResult = client.chat_json(
        task="critic",
        system=system_prompt,
        user=json.dumps(layout_summary),
        schema=GroqCriticReport,
        fallback_fn=lambda: _deterministic_critic_report_fallback(layout_summary),
        temperature=0.0
    )
    report: GroqCriticReport = res.data
    report.llm_source = res.source
    return report


def critique_architectural_candidates_with_groq(
    candidate_summaries: List[Dict[str, Any]],
    user_prompt: str = ""
) -> ArchitecturalCritique:
    """
    Acts as an expert architectural critic evaluating candidate layouts.
    Never generates raw coordinates; reviews zoning, privacy, circulation,
    daylight, and spatial efficiency metrics to select the optimal scheme.
    """
    if not candidate_summaries:
        return _deterministic_critique_fallback(candidate_summaries)

    sorted_summaries = sorted(candidate_summaries, key=lambda c: str(c.get("scheme_id", "")))
    client = get_llm_client()
    system_prompt = (
        "You are a Principal Residential Architect and critic. "
        "You are evaluating multiple mathematically solved architectural layout candidates. "
        "Critique their functional zoning, bedroom privacy, circulation efficiency, and natural daylight. "
        "Select the superior candidate and explain your architectural rationale."
    )
    context = {
        "user_prompt": user_prompt,
        "candidates": sorted_summaries
    }

    res: LLMResult = client.chat_json(
        task="critique",
        system=system_prompt,
        user=json.dumps(context),
        schema=ArchitecturalCritique,
        fallback_fn=lambda: _deterministic_critique_fallback(sorted_summaries),
        temperature=0.0
    )

    critique: ArchitecturalCritique = res.data
    critique.llm_source = res.source
    return critique


# 6. Natural-Language Modification Interpretation

def _deterministic_modification_fallback(instruction: str) -> NaturalLanguageModificationCommand:
    lower = instruction.lower().strip()

    # 1. Budget modifications in English & Hinglish (e.g. "budget 45 lakh ke andar rakho", "keep budget under 50 lakh")
    if any(k in lower for k in ["budget", "lakh", "lac", "crore", "kharach", "paisa"]):
        num_m = re.search(r'(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|cr|crore|crores)?', lower)
        if num_m:
            base_num = float(num_m.group(1))
            unit = num_m.group(2) or ""
            if "cr" in unit or "crore" in unit:
                val = base_num * 10000000.0
            elif "lakh" in unit or "lac" in unit:
                val = base_num * 100000.0
            elif base_num > 100000:
                val = base_num
            else:
                val = base_num * 100000.0
            return NaturalLanguageModificationCommand(
                target_room_type="budget",
                operation="set_budget",
                target_value=val,
                architectural_rationale=f"Target budget configured to INR {val:,.0f} from '{instruction}'.",
                llm_source="deterministic_fallback"
            )

    # 2. Parking modifications (e.g. "2 car parking chahiye", "parking for 2 cars", "do car parking")
    if any(k in lower for k in ["parking", "car", "gadi", "suv"]):
        cars = 2 if any(k in lower for k in ["2 car", "two car", "2 cars", "do car", "2 gadi", "2-car"]) else 1
        return NaturalLanguageModificationCommand(
            target_room_type="parking",
            operation="set_parking",
            target_value=float(cars),
            architectural_rationale=f"Configured vehicular parking capacity to {cars} car(s).",
            llm_source="deterministic_fallback"
        )

    # 3. Target room identification (English + Hinglish)
    target_type = "master_bedroom"
    if "kitchen" in lower or "rasoi" in lower:
        target_type = "kitchen"
    elif "living" in lower or "hall" in lower or "baithak" in lower:
        target_type = "living_room"
    elif "dining" in lower or "khana" in lower:
        target_type = "dining"
    elif "staircase" in lower or "stair" in lower or "seedhi" in lower:
        target_type = "staircase"
    elif "pooja" in lower or "puja" in lower or "mandir" in lower:
        target_type = "pooja"
    elif "bedroom 2" in lower or "second bedroom" in lower or "dusra bedroom" in lower:
        target_type = "bedroom"
    elif "master" in lower or "bada bedroom" in lower:
        target_type = "master_bedroom"
    elif "bedroom" in lower or "kamra" in lower:
        target_type = "bedroom"
    elif "foyer" in lower or "entry" in lower or "darwaza" in lower:
        target_type = "entry_foyer"

    op = "enlarge"
    dw, dl = 2.0, 2.0
    partner = None

    # Hinglish & English operations
    if any(k in lower for k in ["smaller", "reduce", "shrink", "chota", "chhota", "kam karo", "ghatao"]):
        op = "shrink"
        dw, dl = -2.0, -2.0
    elif any(k in lower for k in ["bada karo", "badhao", "enlarge", "bigger", "large", "expand", "bada"]):
        op = "enlarge"
        dw, dl = 2.0, 2.0
    elif any(k in lower for k in ["attached bath", "add bathroom", "bathroom jodo", "attach bath"]):
        op = "add_attached_bath"
    elif any(k in lower for k in ["closer", "move", "near", "put", "paas", "nazdeek", "lao"]):
        op = "relocate_closer"
        if "dining" in lower or "khana" in lower:
            partner = "dining"
        elif any(k in lower for k in ["entrance", "entry", "foyer", "darwaza"]):
            partner = "entry_foyer"
        elif "living" in lower or "hall" in lower:
            partner = "living_room"
    elif "private" in lower or "privacy" in lower:
        op = "general_adjust"
        dw, dl = 0.0, 0.0

    if not partner and target_type == "kitchen":
        partner = "dining"

    return NaturalLanguageModificationCommand(
        target_room_type=target_type,
        operation=op,
        delta_width=dw,
        delta_length=dl,
        partner_room=partner,
        architectural_rationale=f"Localized re-optimization applying '{instruction}' on {target_type}.",
        llm_source="deterministic_fallback"
    )


def interpret_modification_with_groq(
    instruction: str,
    current_layout_summary: Dict[str, Any]
) -> NaturalLanguageModificationCommand:
    """
    Parses natural language modification prompts into structured mathematical instructions
    for localized cluster re-optimization.
    """
    client = get_llm_client()
    system_prompt = (
        "You are an Architectural Systems Engineer. "
        "Convert natural language modification requests into structured geometric modification parameters. "
        "Identify the targeted room type, operation (enlarge, shrink, add_attached_bath, relocate_closer), "
        "and dimension changes in feet."
    )
    context = {
        "instruction": instruction,
        "existing_rooms": current_layout_summary.get("rooms", [])
    }

    res: LLMResult = client.chat_json(
        task="edit_parsing",
        system=system_prompt,
        user=json.dumps(context),
        schema=NaturalLanguageModificationCommand,
        fallback_fn=lambda: _deterministic_modification_fallback(instruction),
        temperature=0.1
    )

    cmd: NaturalLanguageModificationCommand = res.data
    cmd.llm_source = res.source
    return cmd


# 7. Floor Plan Image Analysis (Vision)

def _deterministic_vision_fallback() -> Dict[str, Any]:
    return {
        "detected_rooms": [
            {"name": "Living Room", "type": "living_room"},
            {"name": "Kitchen", "type": "kitchen"},
            {"name": "Dining Room", "type": "dining"},
            {"name": "Primary Suite", "type": "master_bedroom"},
            {"name": "Bedroom 2", "type": "bedroom"},
            {"name": "Primary Bath", "type": "bathroom"}
        ],
        "estimated_bedrooms": 2,
        "estimated_bathrooms": 1.5,
        "suggested_width": 38.0,
        "suggested_length": 32.0,
        "confidence": 0.88,
        "llm_source": "deterministic_fallback"
    }


def analyze_floorplan_image(image_base64: str) -> Dict[str, Any]:
    """
    Extracts room information and layout from an uploaded floor plan image using Groq Vision.
    """
    client = get_llm_client()
    prompt = (
        "You are an expert architectural vision model. Analyze this floor plan image. "
        "Identify approximate rooms, bedroom count, bathroom count, and estimated aspect ratio."
    )

    res: LLMResult = client.vision_json(
        task="vision",
        prompt=prompt,
        image_bytes_or_base64=image_base64,
        mime_type="image/jpeg",
        fallback_fn=_deterministic_vision_fallback,
        temperature=0.1
    )

    data = res.data if isinstance(res.data, dict) else _deterministic_vision_fallback()
    data["llm_source"] = res.source
    return data


# 8. AI Construction & Value-Engineering Advisor

def _deterministic_construction_advice_fallback(
    quantities: Any,
    cost_estimate: Any,
    layout: Any
) -> Dict[str, Any]:
    bua = getattr(quantities, "built_up_area_sqft", 1500.0) or 1500.0
    total_exp = getattr(cost_estimate, "total_expected", 3500000.0) or 3500000.0
    col_count = getattr(quantities, "structural_columns_count", 12) or 12
    spec = getattr(layout, "construction_spec", None)
    tier = getattr(spec, "quality_tier", "STANDARD") if spec else "STANDARD"

    recs = [
        {
            "title": "Optimize Internal Wall Thickness & Material",
            "reason": (
                "Using 4.5-inch AAC (Autoclaved Aerated Concrete) lightweight blocks for non-load-bearing internal partitions "
                "instead of standard 9-inch red clay brick reduces dead load on beams and foundation while increasing carpet area by 2–4%."
            ),
            "impact": "HIGH",
            "category": "MATERIAL",
            "estimated_impact": "4-6% structural dead-load savings and improved thermal insulation."
        },
        {
            "title": "Consolidated Vertical Plumbing Stacks",
            "reason": (
                "Ensure wet areas (kitchen, powder room, and attached bathrooms) share contiguous vertical shafts. "
                "Minimizing horizontal pipe runs through RCC slabs prevents water seepage risks and reduces piping expenditure."
            ),
            "impact": "MEDIUM",
            "category": "SERVICES",
            "estimated_impact": "Reduces sanitary pipe footage by 15–20% and lowers maintenance complexity."
        },
        {
            "title": "Standardize Structural Column Grid Spacing",
            "reason": (
                f"With {col_count} preliminary columns planned, aligning columns along common grid axes within 12–15 ft spans "
                "maximizes two-way slab action and eliminates excessive depth requirements for transfer beams."
            ),
            "impact": "MEDIUM",
            "category": "CONSTRUCTION",
            "estimated_impact": "Optimizes RCC slab thickness to 125–150 mm, avoiding deep drops."
        },
        {
            "title": "Natural Daylight & Cross-Ventilation Strategy",
            "reason": (
                "Orient habitable room fenestration towards North and East elevations where possible to harness glare-free daylight "
                "while minimizing heat ingress from harsh South-West solar radiation."
            ),
            "impact": "LOW",
            "category": "LAYOUT",
            "estimated_impact": "Long-term reduction in daylight electrical load and HVAC power demand."
        }
    ]

    return {
        "summary": (
            f"Preliminary budget of ₹{round(total_exp):,} at ₹{round(total_exp / max(100.0, bua)):,}/sqft "
            f"reflects a solid {tier} specification. The structural envelope and wall layout demonstrate good material efficiency."
        ),
        "recommendations": recs,
        "llm_source": "deterministic_fallback"
    }


def generate_construction_advice_with_groq(
    layout: Any,
    quantities: Any,
    cost_estimate: Any
) -> Dict[str, Any]:
    """
    Analyzes calculated geometry, physical quantities takeoff, and cost estimates using Groq
    to provide actionable value-engineering recommendations.
    Deterministic rules calculate quantities/costs; Groq provides qualitative architectural advice.
    """
    client = get_llm_client()
    bua = getattr(quantities, "built_up_area_sqft", 1500.0) or 1500.0
    total_exp = getattr(cost_estimate, "total_expected", 3500000.0) or 3500000.0
    col_count = getattr(quantities, "structural_columns_count", 12) or 12
    spec = getattr(layout, "construction_spec", None)
    tier = getattr(spec, "quality_tier", "STANDARD") if spec else "STANDARD"

    def _safe_float(val: Any, default: float = 0.0) -> float:
        try:
            return float(val) if val is not None else default
        except (ValueError, TypeError):
            return default

    context = {
        "built_up_area_sqft": round(_safe_float(getattr(quantities, "built_up_area_sqft", None), 1500.0), 1),
        "total_expected_inr": round(_safe_float(getattr(cost_estimate, "total_expected", None), 3500000.0), 2),
        "cost_per_sqft_inr": round(_safe_float(total_exp) / max(100.0, _safe_float(bua, 1500.0)), 1),
        "quality_tier": str(tier).upper(),
        "preliminary_column_count": int(_safe_float(getattr(quantities, "structural_columns_count", None), 12)),
        "external_wall_length_ft": _safe_float(getattr(quantities, "external_wall_length_ft", None), 0.0),
        "internal_wall_length_ft": _safe_float(getattr(quantities, "internal_wall_length_ft", None), 0.0),
        "flooring_area_sqft": _safe_float(getattr(quantities, "flooring_area_sqft", None), 0.0),
        "concrete_volume_cum": _safe_float(getattr(quantities, "concrete_volume_cum", None), 0.0),
        "steel_reinforcement_kg": _safe_float(getattr(quantities, "steel_reinforcement_kg", None), 0.0)
    }

    system_prompt = (
        "You are a Chief Residential Construction Engineer and Value-Engineering Specialist for Indian homes. "
        "Analyze the provided actual geometric takeoff and cost estimate. "
        "Formulate 3-5 concrete, actionable architectural recommendations to optimize cost, structural efficiency, "
        "material consumption, and services routing without sacrificing aesthetic quality. "
        "CRITICAL: Do NOT invent arbitrary quantities or exact rupee savings unless directly based on the provided data."
    )

    fallback = lambda: _deterministic_construction_advice_fallback(quantities, cost_estimate, layout)

    res: LLMResult = client.chat_json(
        task="advisor",
        system=system_prompt,
        user=json.dumps(context, default=str),
        fallback_fn=fallback,
        temperature=0.2
    )

    data = res.data if isinstance(res.data, dict) else fallback()
    data["llm_source"] = res.source
    return data
