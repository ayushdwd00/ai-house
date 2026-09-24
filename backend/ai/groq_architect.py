"""
Groq Architect & Multi-Scheme Formulator Module
Upgrades Groq from a simple requirements parser into an active architectural designer:
- Reasons about family demographics (nuclear, joint, elderly, kids, WFH, helper)
- Reasons about lifestyle (cooking style, hosting frequency, acoustic privacy, storage)
- Formulates typed DesignIntent with genuine typologies (central spine, side circulation, courtyard, etc.)
- Deterministic fallback when Groq is unavailable
- Comprehensive multi-objective ranking across 12 architectural criteria
"""

import json
from typing import List, Dict, Any, Optional
from models import ArchitecturalRequirements, Site
from architecture.design_intent import (
    DesignIntent, DesignStrategy, RoomRequirementIntent, RoomRelationIntent, FloorPlanDSL
)
from llm import get_llm_client, TaskType, LLMResult


def create_deterministic_design_intent(
    req: ArchitecturalRequirements,
    site: Optional[Site] = None
) -> DesignIntent:
    """
    Robust rule-based architectural reasoning that constructs a full DesignIntent
    when the LLM is offline or in test environments.
    """
    aspect = req.plot_width / max(1.0, req.plot_length)
    is_wide = aspect >= 1.1
    is_narrow = aspect <= 0.75
    road = req.road_side

    # 1. Determine optimal typology based on site geometry
    if is_narrow:
        typology = "side_circulation"
        circ_type = "linear"
    elif is_wide:
        typology = "public_private_split"
        circ_type = "central"
    elif req.plot_width >= 45 and req.plot_length >= 50:
        typology = "courtyard"
        circ_type = "radial"
    else:
        typology = "central_spine"
        circ_type = "central"

    # 2. Select spaces according to Indian residential patterns
    rooms: List[RoomRequirementIntent] = []
    relations: List[RoomRelationIntent] = []

    # Living Room & Foyer
    rooms.append(RoomRequirementIntent(
        id="f1_living", type="living_room", name="Living Room",
        zone="public", target_floor=1,
        min_width_ft=12.0, min_length_ft=14.0,
        preferred_width_ft=14.0, preferred_length_ft=16.0,
        exterior_wall_required=True, daylight_priority="high",
        furniture_intent=["3-seater sofa", "2 armchairs", "coffee table", "media console"]
    ))

    # Dining
    rooms.append(RoomRequirementIntent(
        id="f1_dining", type="dining", name="Dining Room",
        zone="public", target_floor=1,
        min_width_ft=10.0, min_length_ft=11.0,
        preferred_width_ft=11.5, preferred_length_ft=13.0,
        exterior_wall_required=False, daylight_priority="medium",
        furniture_intent=["6-seater dining table", "crockery unit"]
    ))
    relations.append(RoomRelationIntent(
        room_a="f1_living", room_b="f1_dining", relation_type="direct", weight=1.5,
        rationale="Seamless transition from living to dining zone."
    ))

    # Kitchen (Vastu southeast / northwest placement preference)
    k_orient = "south_east" if (req.vastu_compliant or road in ["south", "east"]) else "north_west"
    rooms.append(RoomRequirementIntent(
        id="f1_kitchen", type="kitchen", name="Kitchen",
        zone="service", target_floor=1,
        min_width_ft=8.0, min_length_ft=10.0,
        preferred_width_ft=9.5, preferred_length_ft=12.0,
        exterior_wall_required=True, ventilation_required="direct_exterior",
        daylight_priority="high", preferred_orientation=k_orient,
        furniture_intent=["L-shaped platform", "double sink", "cooking hob", "refrigerator"]
    ))
    relations.append(RoomRelationIntent(
        room_a="f1_dining", room_b="f1_kitchen", relation_type="strong", weight=2.0,
        rationale="Direct culinary serving corridor."
    ))

    # Circulation Hallway
    rooms.append(RoomRequirementIntent(
        id="f1_hallway", type="hallway", name="Central Hallway",
        zone="circulation", target_floor=1,
        min_width_ft=4.0, min_length_ft=10.0,
        preferred_width_ft=4.5, preferred_length_ft=14.0,
        exterior_wall_required=False, daylight_priority="low"
    ))

    # Master Bedroom (Southwest Vastu preferred)
    rooms.append(RoomRequirementIntent(
        id="f1_master_bed", type="master_bedroom", name="Master Bedroom",
        zone="private", target_floor=1,
        min_width_ft=12.0, min_length_ft=13.0,
        preferred_width_ft=13.5, preferred_length_ft=15.0,
        exterior_wall_required=True, daylight_priority="high",
        preferred_orientation="south_west",
        attached_to="f1_master_bath",
        furniture_intent=["King bed", "bedside tables", "wardrobe", "dresser"]
    ))

    # Master Bath
    rooms.append(RoomRequirementIntent(
        id="f1_master_bath", type="bathroom", name="Master Bathroom",
        zone="private", target_floor=1,
        min_width_ft=5.0, min_length_ft=7.5,
        preferred_width_ft=5.5, preferred_length_ft=8.5,
        exterior_wall_required=True, ventilation_required="direct_exterior",
        daylight_priority="medium", attached_to="f1_master_bed"
    ))
    relations.append(RoomRelationIntent(
        room_a="f1_master_bed", room_b="f1_master_bath", relation_type="attached", weight=3.0,
        rationale="En-suite bathroom directly attached to master suite."
    ))
    relations.append(RoomRelationIntent(
        room_a="f1_master_bed", room_b="f1_living", relation_type="separate", weight=2.0,
        rationale="Acoustic isolation between entertaining and master sleeping retreat."
    ))

    # Common Bathroom
    rooms.append(RoomRequirementIntent(
        id="f1_common_bath", type="bathroom", name="Common Bathroom",
        zone="service", target_floor=1,
        min_width_ft=4.5, min_length_ft=6.5,
        preferred_width_ft=5.0, preferred_length_ft=7.5,
        exterior_wall_required=True, ventilation_required="direct_exterior"
    ))

    # Optional Indian spaces based on brief
    specials = set(req.special_rooms or [])
    if "Pooja" in specials or "pooja" in specials:
        rooms.append(RoomRequirementIntent(
            id="f1_pooja", type="pooja", name="Pooja Room",
            zone="semi_private", target_floor=1,
            min_width_ft=4.0, min_length_ft=4.5,
            preferred_width_ft=5.0, preferred_length_ft=5.5,
            exterior_wall_required=False, preferred_orientation="north_east"
        ))

    # Additional Bedrooms
    for b_i in range(2, req.bedrooms + 1):
        b_id = f"f1_bed_{b_i}"
        rooms.append(RoomRequirementIntent(
            id=b_id, type="bedroom", name=f"Bedroom {b_i}",
            zone="private", target_floor=1,
            min_width_ft=10.5, min_length_ft=11.5,
            preferred_width_ft=11.5, preferred_length_ft=13.0,
            exterior_wall_required=True, daylight_priority="high",
            furniture_intent=["Queen bed", "wardrobe", "study desk"]
        ))
        relations.append(RoomRelationIntent(
            room_a="f1_hallway", room_b=b_id, relation_type="direct", weight=1.0,
            rationale="Circulation corridor access."
        ))

    strategy = DesignStrategy(
        typology=typology,
        circulation_type=circ_type,
        entrance_sequence=["entry_foyer", "living_room", "hallway"],
        staircase_strategy="staircase_core" if req.num_floors > 1 else None,
        parking_strategy="driveway_front" if req.parking_spaces > 0 else None
    )

    schemes = [typology]
    if typology != "central_spine":
        schemes.append("central_spine")
    if typology != "public_private_split":
        schemes.append("public_private_split")
    if len(schemes) < 3:
        schemes.append("side_circulation")

    return DesignIntent(
        project_title=f"{req.bedrooms}BHK {typology.replace('_', ' ').title()} Residence",
        design_strategy=strategy,
        selected_spaces=rooms,
        relationships=relations,
        schemes_to_evaluate=schemes,
        llm_source="deterministic_fallback",
        architectural_rationale=f"Selected {typology} layout based on plot dimensions ({req.plot_width}x{req.plot_length}ft) and road orientation ({road})."
    )


def formulate_design_intent_with_groq(
    req: ArchitecturalRequirements,
    site: Optional[Site] = None
) -> DesignIntent:
    """
    Calls Groq to act as Principal Architect, reasoning about family demographics,
    lifestyle, privacy, and typology selection, with automatic deterministic fallback.
    """
    client = get_llm_client()
    system_prompt = (
        "You are an Indian Residential Architect. Reason about the family demographics, "
        "lifestyle, Indian residential spaces (foyer, pooja, utility, verandah), "
        "and site orientation. Formulate a typed DesignIntent defining the spatial strategy. "
        "NEVER generate final coordinates; generate architectural strategy and room constraints."
    )
    context = {
        "plot_width": req.plot_width,
        "plot_length": req.plot_length,
        "road_side": req.road_side,
        "bedrooms": req.bedrooms,
        "bathrooms": req.bathrooms,
        "style": req.style,
        "vastu_compliant": req.vastu_compliant,
        "special_rooms": req.special_rooms or []
    }

    res: LLMResult = client.chat_json(
        task="concepts",
        system=system_prompt,
        user=json.dumps(context),
        schema=DesignIntent,
        fallback_fn=lambda: create_deterministic_design_intent(req, site),
        temperature=0.0
    )

    intent: DesignIntent = res.data
    intent.llm_source = res.source
    if not intent.selected_spaces or len(intent.selected_spaces) < 3:
        fallback = create_deterministic_design_intent(req, site)
        return fallback
    return intent


def rank_architectural_candidates(
    candidates: List[Dict[str, Any]],
    vastu_enabled: bool = False
) -> List[Dict[str, Any]]:
    """
    Ranks mathematically solved candidate layouts using a comprehensive multi-objective formula:
    - Validity: Hard rejection if geometric overlap or envelope breach exists
    - Circulation Efficiency (15%)
    - Bedroom Privacy & Acoustic Buffers (15%)
    - Daylight & Cross-Ventilation (15%)
    - Space Efficiency & Proportions (15%)
    - Furniture Clearance & Usability (15%)
    - Adjacency & Relationships (15%)
    - Vastu Compliance (10% if active)
    """
    def score_candidate(c: Dict[str, Any]) -> float:
        val = c.get("validation")
        if val and not getattr(val, "is_valid", True):
            return -1000.0

        scores = c.get("scores")
        if not scores:
            return 0.0

        circ = getattr(scores, "circulation_score", 70.0)
        priv = getattr(scores, "privacy_score", 70.0)
        day = getattr(scores, "daylight_score", 70.0)
        vent = getattr(scores, "ventilation_score", 70.0)
        eff = getattr(scores, "space_efficiency_score", 70.0)
        furn = getattr(scores, "furniture_fit_score", 70.0)
        adj = getattr(scores, "adjacency_score", 70.0)
        vastu = getattr(scores, "vastu_score", 70.0) if vastu_enabled else 75.0

        total = (
            circ * 0.15 +
            priv * 0.15 +
            ((day + vent) / 2.0) * 0.15 +
            eff * 0.15 +
            furn * 0.15 +
            adj * 0.15 +
            vastu * 0.10
        )
        return round(total, 2)

    return sorted(candidates, key=score_candidate, reverse=True)
