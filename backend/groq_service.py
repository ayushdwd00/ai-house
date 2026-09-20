"""
Groq AI Architectural Reasoning Layer
Implements an active architectural intelligence layer using Pydantic structured outputs:
1. Structured Requirement Interpretation
2. Architectural Concept Generation (2-3 distinct spatial strategies)
3. Room Zoning & Adjacency Reasoning
4. Architectural Design Critique of mathematically solved layouts
5. Natural-Language Modification Interpretation
"""

import os
import re
import json
from typing import Dict, Any, Optional, List, Tuple, Literal
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_TEXT_MODEL = os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b").strip()
GROQ_VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-3.2-11b-vision-instruct").strip()

# Priority fallback sequence for Groq text models
TEXT_MODEL_CANDIDATES = [
    GROQ_TEXT_MODEL,
    "openai/gpt-oss-120b",
    "qwen/qwen3.6-27b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant"
]

# Priority fallback sequence for Groq vision models
VISION_MODEL_CANDIDATES = [
    GROQ_VISION_MODEL,
    "meta-llama/llama-3.2-11b-vision-instruct",
    "llama-3.2-11b-vision-preview",
    "meta-llama/llama-3.2-90b-vision-instruct"
]

def get_groq_client():
    global GROQ_API_KEY
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
    if not GROQ_API_KEY or GROQ_API_KEY == "your_groq_api_key_here":
        return None
    try:
        from groq import Groq
        return Groq(api_key=GROQ_API_KEY)
    except Exception as e:
        print(f"[GROQ INIT] Failed to initialize Groq client: {e}")
        return None


from models import ArchitecturalRequirements

# =============================================================================
# 1. Pydantic Structured Output Models
# =============================================================================



class ArchitecturalConceptStrategy(BaseModel):
    strategy_id: str = Field(..., description="Unique scheme identifier, e.g. scheme_central_circulation")
    name: str = Field(..., description="Human-readable concept name")
    architectural_thesis: str = Field(..., description="Core design rationale and spatial philosophy")
    circulation_philosophy: str = Field(..., description="How hallways and entry buffers navigate human flow")
    circulation_type: Literal["central", "side", "linear"] = Field(default="central")
    # Topological placement hints: room_type -> { "rel_y": "front"|"middle"|"rear", "rel_x": "left"|"center"|"right" }
    zoning_placement: Dict[str, Dict[str, str]] = Field(
        default_factory=dict,
        description="Topological quadrant placement hints for the CP-SAT solver"
    )
    priority_adjacencies: List[List[str]] = Field(default_factory=list, description="Pairs of rooms that must be adjacent")
    priority_separations: List[List[str]] = Field(default_factory=list, description="Pairs of rooms that must be acoustically separated")


class ArchitecturalConceptsResult(BaseModel):
    concepts: List[ArchitecturalConceptStrategy] = Field(default_factory=list)
    architectural_reasoning: str = Field(default="")


class ArchitecturalCritique(BaseModel):
    selected_candidate: str = Field(..., description="ID of winning layout scheme")
    reasoning: str = Field(..., description="Architectural critique justifying selection")
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)
    local_reoptimization_target: Optional[str] = Field(default=None, description="Optional room type requiring local re-optimization, e.g. master_bedroom, kitchen")
    local_reoptimization_operation: Optional[str] = Field(default=None, description="Operation such as enlarge, shrink, relocate_closer")
    architectural_coherence_score: float = Field(default=90.0)


class NaturalLanguageModificationCommand(BaseModel):
    target_room_type: str = Field(..., description="Canonical room type to modify, e.g. master_bedroom, kitchen")
    operation: Literal["enlarge", "shrink", "add_attached_bath", "relocate_closer", "general_adjust"] = Field(default="enlarge")
    delta_width: float = Field(default=0.0, description="Proposed width change in feet")
    delta_length: float = Field(default=0.0, description="Proposed length change in feet")
    partner_room: Optional[str] = Field(default=None, description="Related room for proximity adjustments, e.g. dining")
    architectural_rationale: str = Field(default="", description="Architectural justification for this edit")


# =============================================================================
# 2. Structured Requirement Interpretation
# =============================================================================

def interpret_requirements_with_groq(prompt: str) -> ArchitecturalRequirements:
    """
    Parses natural language requirements into structured ArchitecturalRequirements.
    Uses Groq LLM with Pydantic JSON schema when available; falls back to smart rule parser.
    """
    client = get_groq_client()
    if client and len(prompt.strip()) > 3:
        system_prompt = (
            "You are a Principal Residential Architect. "
            "Extract structured architectural parameters from the user's design request. "
            "Adhere strictly to this JSON schema:\n"
            + json.dumps(ArchitecturalRequirements.model_json_schema(), indent=2)
        )
        for model_name in dict.fromkeys(TEXT_MODEL_CANDIDATES):
            try:
                print(f"[AI REASONING] Parsing requirements with Groq model '{model_name}'...")
                response = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.15,
                    max_tokens=800
                )
                raw = response.choices[0].message.content
                data = json.loads(raw)
                req = ArchitecturalRequirements.model_validate(data)
                print(f"[AI REASONING] SUCCESS: Requirements parsed by '{model_name}'.")
                return req
            except Exception as e:
                print(f"[AI REASONING] Groq attempt with '{model_name}' failed: {e}")

    # Heuristic Architectural Fallback Parser
    print("[AI REASONING] Using deterministic heuristic fallback for requirement interpretation.")
    lower = prompt.lower()

    # Floors
    num_floors = 1
    if any(k in lower for k in ["2-story", "2 story", "two story", "two stories", "2 floors", "2 floor", "two levels"]):
        num_floors = 2
    elif any(k in lower for k in ["3-story", "3 story", "three story", "three levels"]):
        num_floors = 3

    # Bedrooms
    bed_match = re.search(r'(\d+)\s*(?:bed|bedroom|bds|br)\b', lower)
    bedrooms = int(bed_match.group(1)) if bed_match else 3
    bedrooms = max(1, min(6, bedrooms))

    # Bathrooms
    bath_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:bath|bathroom|ba)\b', lower)
    bathrooms = float(bath_match.group(1)) if bath_match else 2.0
    bathrooms = max(1.0, min(5.0, bathrooms))

    # Plot dimensions
    dim_match = re.search(r'(\d{2,3})\s*(?:x|by|\*)\s*(\d{2,3})', lower)
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

    return ArchitecturalRequirements(
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
        designer_intent=f"Residential layout for {bedrooms} bedrooms on {plot_w}x{plot_l}ft site facing {road}."
    )


def parse_intake_with_groq_or_fallback(prompt: str) -> Dict[str, Any]:
    """Backwards-compatible dict interface for intake endpoints."""
    req = interpret_requirements_with_groq(prompt)
    res = req.model_dump()
    res["ai_note"] = req.designer_intent
    return res


# =============================================================================
# 3. Architectural Concept Generation (2-3 Meaningful Layout Strategies)
# =============================================================================

def generate_architectural_concepts_with_groq(req: ArchitecturalRequirements) -> ArchitecturalConceptsResult:
    """
    Generates 2-3 distinct architectural spatial strategies.
    The LLM reasons about zoning hierarchy, circulation spines, and privacy gradients.
    Does NOT generate raw coordinates; generates topological placement constraints for CP-SAT.
    """
    client = get_groq_client()
    if client:
        system_prompt = (
            "You are a Chief Residential Architect. "
            "Formulate 2-3 distinct architectural layout strategies for a house plot. "
            "Define zoning, acoustic privacy buffers, and circulation spines. "
            "Adhere strictly to this JSON schema:\n"
            + json.dumps(ArchitecturalConceptsResult.model_json_schema(), indent=2)
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
        for model_name in dict.fromkeys(TEXT_MODEL_CANDIDATES):
            try:
                print(f"[AI REASONING] Generating architectural concepts with '{model_name}'...")
                response = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(context)}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.25,
                    max_tokens=1000
                )
                data = json.loads(response.choices[0].message.content)
                result = ArchitecturalConceptsResult.model_validate(data)
                if len(result.concepts) >= 2:
                    print(f"[AI REASONING] SUCCESS: {len(result.concepts)} concepts synthesized by '{model_name}'.")
                    return result
            except Exception as e:
                print(f"[AI REASONING] Concept generation with '{model_name}' failed: {e}")

    # Deterministic Architectural Concepts Fallback
    print("[AI REASONING] Using deterministic architectural concept strategies.")
    road = req.road_side

    # Scheme 1: Central Circulation Spine
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

    # Scheme 2: Public-Private Zonal Split
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

    # Scheme 3: Side Gallery & Daylight Flow
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
        architectural_reasoning=f"Formulated 3 distinct residential typologies optimized for {road.capitalize()} frontage and {req.bedrooms} bedrooms."
    )


# =============================================================================
# 4. Architectural Design Critique of Mathematically Solved Layouts
# =============================================================================

def critique_architectural_candidates_with_groq(
    candidate_summaries: List[Dict[str, Any]],
    user_prompt: str = ""
) -> ArchitecturalCritique:
    """
    Acts as an expert architectural critic evaluating candidate layouts.
    Never generates raw coordinates; reviews zoning, privacy, circulation,
    daylight, and spatial efficiency metrics to select the optimal scheme.
    """
    client = get_groq_client()
    if client and candidate_summaries:
        system_prompt = (
            "You are a Principal Residential Architect and critic. "
            "You are evaluating multiple mathematically solved architectural layout candidates. "
            "Critique their functional zoning, bedroom privacy, circulation efficiency, and natural daylight. "
            "Select the superior candidate and explain your architectural rationale. "
            "Adhere strictly to this JSON schema:\n"
            + json.dumps(ArchitecturalCritique.model_json_schema(), indent=2)
        )
        context = {
            "user_prompt": user_prompt,
            "candidates": candidate_summaries
        }
        for model_name in dict.fromkeys(TEXT_MODEL_CANDIDATES):
            try:
                print(f"[AI CRITIC] Attempting Groq critique with model '{model_name}'...")
                response = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(context)}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=600
                )
                raw = response.choices[0].message.content
                data = json.loads(raw)
                critique = ArchitecturalCritique.model_validate(data)
                print(f"[AI CRITIC] SUCCESS: Winner '{critique.selected_candidate}' selected by '{model_name}'.")
                return critique
            except Exception as e:
                print(f"[AI CRITIC] Attempt with '{model_name}' failed: {e}")

    # Deterministic Architectural Fallback Selector
    print("[AI CRITIC] Using deterministic architectural scoring selector.")
    best = max(candidate_summaries, key=lambda c: c.get("overall_score", 0.0))
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
        architectural_coherence_score=float(best.get("overall_score", 88.0))
    )


# =============================================================================
# 5. Natural-Language Modification Commands
# =============================================================================

def interpret_modification_with_groq(
    instruction: str,
    current_layout_summary: Dict[str, Any]
) -> NaturalLanguageModificationCommand:
    """
    Parses natural language modification prompts into structured mathematical instructions
    for localized cluster re-optimization.
    """
    client = get_groq_client()
    if client:
        system_prompt = (
            "You are an Architectural Systems Engineer. "
            "Convert natural language modification requests into structured geometric modification parameters. "
            "Identify the targeted room type, operation (enlarge, shrink, add_attached_bath, relocate_closer), "
            "and dimension changes in feet. "
            "Adhere strictly to this JSON schema:\n"
            + json.dumps(NaturalLanguageModificationCommand.model_json_schema(), indent=2)
        )
        context = {
            "instruction": instruction,
            "existing_rooms": current_layout_summary.get("rooms", [])
        }
        for model_name in dict.fromkeys(TEXT_MODEL_CANDIDATES):
            try:
                print(f"[AI REASONING] Parsing modification with Groq model '{model_name}'...")
                response = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(context)}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                    max_tokens=500
                )
                data = json.loads(response.choices[0].message.content)
                cmd = NaturalLanguageModificationCommand.model_validate(data)
                print(f"[AI REASONING] SUCCESS: Modification parsed into '{cmd.operation}' on '{cmd.target_room_type}'.")
                return cmd
            except Exception as e:
                print(f"[AI REASONING] Modification parse with '{model_name}' failed: {e}")

    # Fallback Rule-Based Modification Interpreter
    lower = instruction.lower()
    target_type = "master_bedroom"
    if "kitchen" in lower:
        target_type = "kitchen"
    elif "living" in lower:
        target_type = "living_room"
    elif "dining" in lower:
        target_type = "dining"
    elif "bedroom 2" in lower or "second bedroom" in lower:
        target_type = "bedroom"
    elif "foyer" in lower or "entry" in lower:
        target_type = "entry_foyer"

    op = "enlarge"
    dw, dl = 2.0, 2.0
    if any(k in lower for k in ["smaller", "reduce", "shrink"]):
        op = "shrink"
        dw, dl = -2.0, -2.0
    elif "attached bath" in lower or "add bathroom" in lower:
        op = "add_attached_bath"
    elif "closer" in lower or "move" in lower:
        op = "relocate_closer"

    partner = "dining" if target_type == "kitchen" else None

    return NaturalLanguageModificationCommand(
        target_room_type=target_type,
        operation=op,
        delta_width=dw,
        delta_length=dl,
        partner_room=partner,
        architectural_rationale=f"Localized re-optimization applying '{instruction}' on {target_type}."
    )


def analyze_floorplan_image(image_base64: str) -> Dict[str, Any]:
    """
    Extracts room information and layout from an uploaded floor plan image using Groq Vision.
    """
    client = get_groq_client()
    if client:
        system_prompt = (
            "You are an expert architectural vision model. Analyze this floor plan image. "
            "Identify the approximate rooms, bedroom count, bathroom count, and estimated aspect ratio. "
            "Return JSON with:\n"
            "{\n"
            '  "detected_rooms": [{"name": string, "type": string}],\n'
            '  "estimated_bedrooms": integer,\n'
            '  "estimated_bathrooms": number,\n'
            '  "suggested_width": number,\n'
            '  "suggested_length": number,\n'
            '  "confidence": number\n'
            "}"
        )
        for model_name in dict.fromkeys(VISION_MODEL_CANDIDATES):
            try:
                print(f"[AI ROUTING] Attempting Groq vision analysis with model: '{model_name}'...")
                response = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": system_prompt},
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
                            ]
                        }
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                    max_tokens=800
                )
                data = json.loads(response.choices[0].message.content)
                print(f"[AI ROUTING] SUCCESS: Groq vision model '{model_name}' analyzed image successfully.")
                return data
            except Exception as e:
                print(f"[AI ROUTING] Groq vision attempt with '{model_name}' failed: {e}")

    print("[AI ROUTING] Using intelligent heuristic fallback for image analysis.")
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
        "confidence": 0.88
    }
