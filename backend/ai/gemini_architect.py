"""
Gemini Architectural Reasoning Layer
Acts as the Principal Architectural Reasoning Model:
- Reasons about zoning, room relationships, and adjacencies
- Evaluates public, private, and service zone boundaries
- Plans circulation, entrance sequence, and staircase strategy
- Reasons about kitchen/dining relationships, bedroom relationships, and elderly accessibility
- Evaluates daylight, ventilation, and solar orientation
- Applies Vastu preferences (SE kitchen, SW master bed, NE pooja/entry)
- Designs for parking, garden integration, multi-floor planning, and future vertical expansion
- Performs concise architectural review without exposing chain-of-thought
- Falls back to Groq, then to deterministic architectural fallback
"""

import json
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field

from models import ArchitecturalRequirements, Site
from architecture.design_intent import (
    DesignIntent, DesignStrategy, RoomRequirementIntent, RoomRelationIntent
)
from .groq_service import (
    ArchitecturalConceptsResult,
    ArchitecturalConceptStrategy,
    ArchitecturalCritique,
    CriticIssue,
    CriticSuggestion,
    GroqCriticReport
)
from .groq_architect import create_deterministic_design_intent
from llm import get_ai_provider, LLMResult


# Structured Architectural Review Models (Matching user requirements)
class ArchitecturalReviewIssue(BaseModel):
    severity: Literal["high", "medium", "low"] = Field(..., description="Issue severity: high, medium, low")
    type: str = Field(..., description="Issue type: circulation, adjacency, privacy, daylight, ventilation, zoning, staircase, parking, vastu")
    room_id: str = Field(..., description="Entity or room identifier, e.g. bedroom_02, kitchen, hallway")
    description: str = Field(..., description="Concise statement of the architectural problem")
    suggested_action: str = Field(..., description="Concise, actionable improvement recommendation")


class ArchitecturalReviewReport(BaseModel):
    issues: List[ArchitecturalReviewIssue] = Field(default_factory=list)
    llm_source: Optional[str] = Field(default="gemini")


def _deterministic_review_fallback(layout_dict: Dict[str, Any], vastu_enabled: bool = False) -> ArchitecturalReviewReport:
    """Deterministic architectural review when LLMs are offline."""
    issues: List[ArchitecturalReviewIssue] = []
    rooms = layout_dict.get("rooms", [])

    for r in rooms:
        rid = r.get("id", "room")
        rtype = r.get("type", "")
        w = float(r.get("width", 0.0) or 0.0)
        l = float(r.get("length", 0.0) or 0.0)
        aspect = (max(w, l) / max(0.1, min(w, l))) if min(w, l) > 0.1 else 1.0

        if aspect > 2.2 and rtype not in ["hallway", "corridor", "staircase", "balcony"]:
            issues.append(ArchitecturalReviewIssue(
                severity="medium",
                type="zoning",
                room_id=rid,
                description=f"{r.get('name', rid)} aspect ratio {aspect:.2f}:1 is elongated.",
                suggested_action="Rebalance room aspect ratio closer to 1.3:1."
            ))

    scores = layout_dict.get("scores", {})
    daylight = float(scores.get("daylight_score", 85.0) or 85.0)
    if daylight < 70.0:
        issues.append(ArchitecturalReviewIssue(
            severity="medium",
            type="daylight",
            room_id="living_room",
            description="Habitable living spaces daylight exposure is below recommended threshold.",
            suggested_action="Increase external fenestration and glazing on perimeter walls."
        ))

    circ = float(scores.get("circulation_score", 80.0) or 80.0)
    if circ < 65.0:
        issues.append(ArchitecturalReviewIssue(
            severity="high",
            type="circulation",
            room_id="hallway",
            description="Circulation path fraction is elevated relative to usable carpet area.",
            suggested_action="Consolidate transitional circulation spine to improve private access."
        ))

    priv = float(scores.get("privacy_score", 80.0) or 80.0)
    if priv < 65.0:
        issues.append(ArchitecturalReviewIssue(
            severity="high",
            type="privacy",
            room_id="master_bedroom",
            description="Private sleeping quarters lack acoustic and visual buffer from public entertainment zone.",
            suggested_action="Introduce an acoustic vestibule or buffer corridor between living and master suite."
        ))

    if vastu_enabled:
        vastu_score = float(scores.get("vastu_score", 80.0) or 80.0)
        if vastu_score < 70.0:
            issues.append(ArchitecturalReviewIssue(
                severity="medium",
                type="vastu",
                room_id="kitchen",
                description="Kitchen placement deviates from primary Agni (South-East) or Vayu (North-West) sectors.",
                suggested_action="Reorient culinary sector towards South-East quadrant."
            ))

    return ArchitecturalReviewReport(
        issues=issues,
        llm_source="deterministic_fallback"
    )


def formulate_design_intent_with_gemini(
    req: ArchitecturalRequirements,
    site: Optional[Site] = None
) -> DesignIntent:
    """
    Invokes Gemini as the Principal Architectural Reasoning model.
    Reasons about:
    - zoning hierarchy (public / semi-private / private / service)
    - room relationships and adjacencies
    - privacy buffers and acoustic isolation
    - circulation network and entrance sequences
    - kitchen/dining adjacency and serving corridor
    - bedroom relationships and elderly accessibility (ground floor preference)
    - staircase core and vertical circulation strategy
    - daylight, solar orientation, and cross-ventilation
    - Vastu orientation compliance
    - parking and garden integration
    - future expansion strategy
    Produces the architectural DesignIntent consumed by the spatial solver.
    """
    provider = get_ai_provider()
    system_prompt = (
        "You are a Chief Architectural Designer. "
        "Reason deeply about architectural planning: "
        "1. Zoning: Strict separation of public (living, foyer), private (master suite, bedrooms), "
        "and service (kitchen, utilities, baths). "
        "2. Adjacency: Dining must directly neighbor kitchen; living opens to dining; master bedroom isolated. "
        "3. Accessibility: If parents or elderly reside, place ground-floor bedroom near accessible bath. "
        "4. Circulation & Entrance: Clean entrance sequence (foyer -> living -> circulation spine). "
        "5. Climate & Orientation: Maximize North/East daylight, South-West solar protection, and cross-ventilation. "
        "6. Vastu: When requested, prioritize South-East for Kitchen, South-West for Master Suite, North-East for Pooja/Entry. "
        "7. Stairs & Parking: Strategic stair core location and driveway parking clearance. "
        "Output strictly valid JSON matching the DesignIntent schema. "
        "NEVER generate final geometric coordinates; generate architectural strategy and room constraints."
    )

    context = {
        "plot_width": req.plot_width,
        "plot_length": req.plot_length,
        "num_floors": req.num_floors,
        "road_side": req.road_side,
        "bedrooms": req.bedrooms,
        "bathrooms": req.bathrooms,
        "parking_spaces": req.parking_spaces,
        "style": req.style,
        "vastu_compliant": req.vastu_compliant,
        "open_concept": req.open_concept,
        "special_rooms": req.special_rooms or [],
        "user_prompt": req.user_prompt or req.designer_intent or ""
    }

    res: LLMResult = provider.execute_reasoning(
        task="design_intent",
        system=system_prompt,
        user=json.dumps(context),
        schema=DesignIntent,
        deterministic_fallback=lambda: create_deterministic_design_intent(req, site),
        temperature=0.1
    )

    intent: DesignIntent = res.data
    intent.llm_source = res.source if res.source != "llm" else "gemini_architect"
    if not intent.selected_spaces or len(intent.selected_spaces) < 3:
        return create_deterministic_design_intent(req, site)
    return intent


def generate_architectural_concepts_with_gemini(
    req: ArchitecturalRequirements
) -> ArchitecturalConceptsResult:
    """
    Generates 2-3 distinct architectural spatial strategies using Gemini as the architectural reasoning layer.
    Defines zoning placement, circulation spines, and priority adjacencies.
    """
    provider = get_ai_provider()
    system_prompt = (
        "You are a Chief Residential Architect. "
        "Formulate 2-3 distinct architectural layout strategies for a residential house plot. "
        "Reason about functional zoning, bedroom privacy gradients, acoustic buffers, and circulation spines. "
        "Ensure entrance foyer, public entertainment, and quiet sleeping sectors are thoughtfully arranged. "
        "Return strictly JSON matching the ArchitecturalConceptsResult schema."
    )
    context = {
        "plot_dimensions": f"{req.plot_width}x{req.plot_length} ft",
        "num_floors": req.num_floors,
        "facing": req.road_side,
        "front_side": req.road_side,
        "road_side": req.road_side,
        "road_orientation": req.road_side,
        "bedrooms": req.bedrooms,
        "bathrooms": req.bathrooms,
        "parking_spaces": req.parking_spaces,
        "style": req.style,
        "vastu_compliant": req.vastu_compliant,
        "open_concept": req.open_concept,
        "special_rooms": req.special_rooms or [],
        "user_prompt": req.user_prompt or ""
    }

    from .groq_service import _deterministic_concepts_fallback
    res: LLMResult = provider.execute_reasoning(
        task="concepts",
        system=system_prompt,
        user=json.dumps(context),
        schema=ArchitecturalConceptsResult,
        deterministic_fallback=lambda: _deterministic_concepts_fallback(req),
        temperature=0.1
    )

    result: ArchitecturalConceptsResult = res.data
    result.llm_source = res.source if res.source != "llm" else "gemini"
    if not result.concepts or len(result.concepts) < 2:
        fallback = _deterministic_concepts_fallback(req)
        fallback.llm_source = "deterministic_fallback"
        return fallback
    return result


def review_layout_with_gemini(
    layout_summary: Dict[str, Any],
    vastu_enabled: bool = False
) -> ArchitecturalReviewReport:
    """
    Executes an architectural review on a mathematically solved layout using Gemini.
    Identifies:
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

    Returns structured issues without chain-of-thought.
    """
    provider = get_ai_provider()
    system_prompt = (
        "You are an expert Architectural Critic reviewing a mathematically solved residential floor plan layout. "
        "Evaluate the structured numeric data (dimensions, aspect ratios, daylight score, circulation score, privacy score, vastu score). "
        "Identify critical architectural issues: "
        "- poor circulation (hallway sprawl, bottlenecks) "
        "- weak adjacency (kitchen far from dining, entry far from living) "
        "- privacy problems (bedroom opening directly into public living, lack of acoustic buffer) "
        "- poor room relationships "
        "- poor daylight opportunities "
        "- poor ventilation opportunities "
        "- problematic zoning "
        "- staircase issues "
        "- parking issues "
        "- Vastu conflicts (if Vastu enabled) "
        "CRITICAL RULES: "
        "1. Do NOT return chain-of-thought or reasoning paragraphs. "
        "2. Return strictly concise structured issues in the ArchitecturalReviewReport schema: "
        "   [{ 'severity': 'high'|'medium'|'low', 'type': 'circulation'|'adjacency'|'privacy'|'daylight'|'ventilation'|'zoning'|'staircase'|'parking'|'vastu', 'room_id': str, 'description': str, 'suggested_action': str }]"
    )

    context = {
        "layout_summary": layout_summary,
        "vastu_enabled": vastu_enabled
    }

    res: LLMResult = provider.execute_reasoning(
        task="review",
        system=system_prompt,
        user=json.dumps(context),
        schema=ArchitecturalReviewReport,
        deterministic_fallback=lambda: _deterministic_review_fallback(layout_summary, vastu_enabled),
        temperature=0.0
    )

    report: ArchitecturalReviewReport = res.data
    report.llm_source = res.source if res.source != "llm" else "gemini"
    return report


def critique_architectural_candidates_with_gemini(
    candidate_summaries: List[Dict[str, Any]],
    user_prompt: str = ""
) -> ArchitecturalCritique:
    """
    Invokes Gemini to evaluate multiple solved layout candidate schemes and select the champion.
    """
    from .groq_service import _deterministic_critique_fallback
    if not candidate_summaries:
        return _deterministic_critique_fallback(candidate_summaries)

    sorted_summaries = sorted(candidate_summaries, key=lambda c: str(c.get("scheme_id", "")))
    provider = get_ai_provider()
    system_prompt = (
        "You are a Chief Residential Architect and Critic evaluating multiple candidate floor plans. "
        "Review functional zoning, circulation efficiency, privacy buffers, daylight exposure, and spatial efficiency. "
        "Select the superior candidate scheme and explain concise architectural rationale. "
        "Return strictly JSON matching the ArchitecturalCritique schema."
    )
    context = {
        "user_prompt": user_prompt,
        "candidates": sorted_summaries
    }

    res: LLMResult = provider.execute_reasoning(
        task="critique",
        system=system_prompt,
        user=json.dumps(context),
        schema=ArchitecturalCritique,
        deterministic_fallback=lambda: _deterministic_critique_fallback(sorted_summaries),
        temperature=0.0
    )

    critique: ArchitecturalCritique = res.data
    critique.llm_source = res.source if res.source != "llm" else "gemini"
    return critique
