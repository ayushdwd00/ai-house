"""
Design Intent & FloorPlan DSL Module
Defines typed Pydantic schema for architectural design intent formulated by the
Groq Architect reasoning layer, translated deterministically into FloorPlanDSL
constraints for the OR-Tools CP-SAT and Shapely geometric solver.
"""

from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field


class RoomRelationIntent(BaseModel):
    room_a: str
    room_b: str
    relation_type: Literal["attached", "direct", "strong", "preferred", "separate", "acoustic_buffer"]
    weight: float = 1.0
    rationale: str = ""


class RoomRequirementIntent(BaseModel):
    id: str
    type: str
    name: str
    zone: Literal["public", "semi_private", "private", "service", "circulation", "outdoor"]
    target_floor: int = 1
    min_width_ft: float
    min_length_ft: float
    preferred_width_ft: float
    preferred_length_ft: float
    max_width_ft: Optional[float] = None
    max_length_ft: Optional[float] = None
    exterior_wall_required: bool = True
    ventilation_required: Literal["direct_exterior", "shaft", "none"] = "direct_exterior"
    daylight_priority: Literal["high", "medium", "low"] = "medium"
    preferred_orientation: Optional[Literal["north", "south", "east", "west", "north_east", "south_east", "south_west", "north_west"]] = None
    attached_to: Optional[str] = None
    is_hard_constraint: bool = False
    furniture_intent: List[str] = Field(default_factory=list)


class DesignStrategy(BaseModel):
    typology: Literal["central_spine", "side_circulation", "public_private_split", "courtyard", "linear", "compact", "l_shaped"] = "central_spine"
    circulation_type: Literal["central", "linear", "perimeter", "radial"] = "central"
    entrance_sequence: List[str] = Field(default_factory=lambda: ["entry_foyer", "living_room"])
    privacy_gradient: List[str] = Field(default_factory=lambda: ["public", "semi_private", "private"])
    zoning_placement: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    climate_orientation: Dict[str, str] = Field(default_factory=dict)
    staircase_strategy: Optional[str] = "central_core"
    parking_strategy: Optional[str] = "front_corner"
    landscape_strategy: Optional[str] = "perimeter_buffer"
    expansion_strategy: Optional[str] = "vertical_future_floor"


class DesignIntent(BaseModel):
    project_title: str = "Residential Architectural Scheme"
    family_profile: Dict[str, Any] = Field(default_factory=lambda: {
        "family_type": "nuclear",
        "family_size": 4,
        "has_elderly": False,
        "has_children": True,
        "work_from_home": False,
        "entertains_guests": True
    })
    lifestyle_priorities: List[str] = Field(default_factory=lambda: [
        "abundant_daylight", "cross_ventilation", "spacious_kitchen", "privacy_buffers"
    ])
    design_strategy: DesignStrategy = Field(default_factory=DesignStrategy)
    selected_spaces: List[RoomRequirementIntent] = Field(default_factory=list)
    relationships: List[RoomRelationIntent] = Field(default_factory=list)
    vastu_preferences: Dict[str, Any] = Field(default_factory=dict)
    schemes_to_evaluate: List[str] = Field(default_factory=lambda: [
        "central_spine", "public_private_split", "side_circulation"
    ])
    llm_source: Literal["groq_architect", "deterministic_fallback"] = "deterministic_fallback"
    architectural_rationale: str = "Architectural program formulated to optimize zoning, ventilation, and circulation."


class FloorPlanDSL(BaseModel):
    """
    Direct solver input: strict typed mathematical contract for OR-Tools CP-SAT.
    """
    plot_width: float
    plot_length: float
    buildable_x: float
    buildable_y: float
    buildable_width: float
    buildable_length: float
    scheme_typology: str
    rooms: List[RoomRequirementIntent]
    relationships: List[RoomRelationIntent]
    pinned_rooms: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    zone_hints: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    vastu_enabled: bool = False
    vastu_orientations: Dict[str, str] = Field(default_factory=dict)
