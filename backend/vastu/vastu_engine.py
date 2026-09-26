"""
Vastu Shastra Architectural Intelligence Engine
Implements authentic, configurable directional rules, orientation-aware coordinate
transformations, and structured multi-criteria evaluations.
"""

from typing import Dict, List, Tuple, Optional, Any, Literal
import math
from pydantic import BaseModel, Field

# 9 Sacred Vastu Zones (Padavinyasa / Directional Sectors)
VastuZone = Literal[
    "northeast",   # Ishanya (Water / Spiritual / Clarity)
    "east",        # Indra (Solar / Vitality)
    "southeast",   # Agneya (Fire / Metabolic energy)
    "south",       # Yama (Rest / Earth stability)
    "southwest",   # Nairrutya (Earth / Heaviness / Mastery)
    "west",        # Varuna (Water / Commerce / Dining)
    "northwest",   # Vayavya (Air / Movement / Guests)
    "north",       # Kubera (Wealth / Prosperity)
    "center"       # Brahmasthan (Ether / Void / Openness)
]

class VastuRuleEvaluation(BaseModel):
    rule_id: str
    room_id: str
    room_name: str
    category: str
    severity: Literal["mandatory", "preferred", "neutral", "avoid"] = "preferred"
    expected_zone: str
    actual_zone: str
    status: Literal["satisfied", "partially_satisfied", "violated"]
    explanation: str
    score_contribution: float = 0.0

class VastuResult(BaseModel):
    overall_score: float = 85.0
    orientation_interpreted: str = "North-Facing Site"
    rule_results: List[VastuRuleEvaluation] = Field(default_factory=list)
    satisfied_rules: List[str] = Field(default_factory=list)
    violated_rules: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    zone_occupancy: Dict[str, List[str]] = Field(default_factory=dict)

# Configurable Vastu rules and zone suitability matrix
# Higher weight = stronger architectural preference
VASTU_PREFERENCES: Dict[str, Dict[str, Any]] = {
    "master_bedroom": {
        "ideal": ["southwest"],
        "acceptable": ["south", "west"],
        "forbidden": ["northeast"],
        "severity": "preferred",
        "rationale": "Master bedroom in Southwest (Nairrutya) grounds the home with stability and authority; Northeast causes instability."
    },
    "kitchen": {
        "ideal": ["southeast"],
        "acceptable": ["northwest"],
        "forbidden": ["northeast", "southwest"],
        "severity": "preferred",
        "rationale": "Cooking in Southeast (Agneya) harnesses the fire element; Northwest is an acceptable secondary air sector."
    },
    "pooja": {
        "ideal": ["northeast"],
        "acceptable": ["east", "north"],
        "forbidden": ["south", "southwest"],
        "severity": "mandatory",
        "rationale": "Sacred/Pooja space belongs in Ishanya (Northeast) for pure solar morning illumination."
    },
    "living_room": {
        "ideal": ["north", "east", "northeast"],
        "acceptable": ["northwest", "center"],
        "forbidden": ["southwest"],
        "severity": "preferred",
        "rationale": "Living and social gathering flourishes in North and East sectors welcoming daylight and positive energy."
    },
    "family_lounge": {
        "ideal": ["north", "east", "center"],
        "acceptable": ["northwest"],
        "forbidden": ["southwest"],
        "severity": "neutral",
        "rationale": "Family lounge thrives in open, accessible central-north zones."
    },
    "dining": {
        "ideal": ["west", "northwest"],
        "acceptable": ["east", "south"],
        "forbidden": ["northeast"],
        "severity": "neutral",
        "rationale": "Dining in West or East promotes nourishment and wholesome communal dining."
    },
    "bedroom": {
        "ideal": ["south", "west", "northwest"],
        "acceptable": ["north", "southeast"],
        "forbidden": ["northeast"],
        "severity": "preferred",
        "rationale": "Secondary bedrooms are well positioned in South, West or Northwest sectors."
    },
    "guest_bedroom": {
        "ideal": ["northwest"],
        "acceptable": ["west", "south"],
        "forbidden": ["southwest"],
        "severity": "preferred",
        "rationale": "Guest quarters in Northwest (Vayavya / Air element) ensures hospitable stay without territorial disruption."
    },
    "bathroom": {
        "ideal": ["west", "northwest"],
        "acceptable": ["south", "southeast"],
        "forbidden": ["northeast", "center"],
        "severity": "mandatory",
        "rationale": "Wet zones and drainage in West/Northwest keep toxins away from the sacred Northeast (Ishanya) and center."
    },
    "powder_room": {
        "ideal": ["west", "northwest"],
        "acceptable": ["south"],
        "forbidden": ["northeast", "center"],
        "severity": "mandatory",
        "rationale": "Powder room drainage must never pollute Northeast or Brahmasthan."
    },
    "staircase": {
        "ideal": ["south", "west", "southwest"],
        "acceptable": ["southeast", "northwest"],
        "forbidden": ["northeast", "center"],
        "severity": "mandatory",
        "rationale": "Heavy vertical load-bearing stairs belong in South or West; strictly avoid Ishanya (Northeast) and Brahmasthan (Center)."
    },
    "utility": {
        "ideal": ["southeast", "northwest"],
        "acceptable": ["south", "west"],
        "forbidden": ["northeast"],
        "severity": "neutral",
        "rationale": "Washing and utility functions pair well with service zones in Southeast or Northwest."
    },
    "entry_foyer": {
        "ideal": ["north", "east", "northeast"],
        "acceptable": ["southeast", "northwest"],
        "forbidden": ["southwest"],
        "severity": "preferred",
        "rationale": "Main threshold in auspicious North/East sectors channels light and welcome."
    },
    "parking": {
        "ideal": ["northwest", "southeast"],
        "acceptable": ["south", "north"],
        "forbidden": ["northeast"],
        "severity": "neutral",
        "rationale": "Vehicular access aligns with road frontage, favoring Northwest or Southeast."
    }
}


def compute_north_angle(road_side: str, explicit_north_deg: Optional[float] = None) -> float:
    """
    Returns the angle of North in degrees relative to the 2D CAD coordinate system
    where +X is Right (East), +Y is Bottom (South), and -Y is Top (North).
    Geographic North is ALWAYS Top (0.0 degrees) unless explicitly overridden by the user.
    'Facing' determines which plot edge is FRONT / ROAD, without rotating geographic North.
    """
    if explicit_north_deg is not None:
        return explicit_north_deg % 360.0
    return 0.0


def get_vastu_zone_for_point(
    x: float,
    y: float,
    plot_width: float,
    plot_length: float,
    road_side: str = "south",
    north_deg: Optional[float] = None
) -> VastuZone:
    """
    Determines the authentic Vastu zone for a given coordinate (x, y)
    within a plot of dimensions (plot_width, plot_length).
    Geographic cardinal directions:
    - Top (-Y) is North
    - Bottom (+Y) is South
    - Right (+X) is East
    - Left (-X) is West
    """
    if plot_width <= 0 or plot_length <= 0:
        return "center"

    norm_x = max(0.0, min(1.0, x / plot_width))
    norm_y = max(0.0, min(1.0, y / plot_length))

    # Center Brahmasthan zone: central 25% area
    if 0.35 <= norm_x <= 0.65 and 0.35 <= norm_y <= 0.65:
        return "center"

    # Screen quadrant relative to center:
    dx = norm_x - 0.5
    dy = norm_y - 0.5

    # Screen angle in degrees (0 = +X / right / East, 90 = +Y / bottom / South, 180 = -X / left / West, 270 = -Y / top / North)
    screen_angle = math.degrees(math.atan2(dy, dx)) % 360.0

    # North orientation angle: where North points in screen coords (Top is 270 screen deg)
    site_north_screen_angle = (270.0 + (north_deg or 0.0)) % 360.0

    # Angle relative to North (0 = North, 90 = East, 180 = South, 270 = West)
    angle_from_north = (screen_angle - site_north_screen_angle) % 360.0

    # 8 directional 45-degree wedges centered on cardinals and intercardinals
    if 337.5 <= angle_from_north or angle_from_north < 22.5:
        return "north"
    elif 22.5 <= angle_from_north < 67.5:
        return "northeast"
    elif 67.5 <= angle_from_north < 112.5:
        return "east"
    elif 112.5 <= angle_from_north < 157.5:
        return "southeast"
    elif 157.5 <= angle_from_north < 202.5:
        return "south"
    elif 202.5 <= angle_from_north < 247.5:
        return "southwest"
    elif 247.5 <= angle_from_north < 292.5:
        return "west"
    else:
        return "northwest"


def evaluate_room_vastu(
    room_type: str,
    room_name: str,
    room_id: str,
    actual_zone: VastuZone
) -> VastuRuleEvaluation:
    """Evaluates a single room placement against Vastu preferences."""
    r_type = room_type.lower()
    # Normalize type to match preferences table
    lookup_type = "bedroom"
    for key in VASTU_PREFERENCES:
        if key in r_type or r_type in key:
            lookup_type = key
            break

    rules = VASTU_PREFERENCES.get(lookup_type, {
        "ideal": ["north", "east", "west"],
        "acceptable": ["south", "northwest", "southeast"],
        "forbidden": [],
        "severity": "neutral",
        "rationale": f"{room_name} adheres to general architectural placement."
    })

    ideal_zones = rules.get("ideal", [])
    acceptable_zones = rules.get("acceptable", [])
    forbidden_zones = rules.get("forbidden", [])
    severity = rules.get("severity", "preferred")
    rationale = rules.get("rationale", "")

    expected_str = " / ".join([z.capitalize() for z in ideal_zones])
    actual_str = actual_zone.capitalize()

    if actual_zone in ideal_zones:
        status = "satisfied"
        explanation = f"{room_name} placed in auspicious {actual_str} zone. {rationale}"
        score = 100.0
    elif actual_zone in acceptable_zones:
        status = "partially_satisfied"
        explanation = f"{room_name} placed in acceptable {actual_str} zone (ideal is {expected_str})."
        score = 80.0
    elif actual_zone in forbidden_zones:
        status = "violated"
        explanation = f"{room_name} located in unadvisable {actual_str} zone (conflicts with Vastu principles: {expected_str} preferred)."
        score = 30.0
    else:
        # Neutral zone
        status = "partially_satisfied"
        explanation = f"{room_name} located in neutral {actual_str} zone (ideal is {expected_str})."
        score = 70.0

    return VastuRuleEvaluation(
        rule_id=f"vastu_{lookup_type}_{room_id}",
        room_id=room_id,
        room_name=room_name,
        category=lookup_type,
        severity=severity,
        expected_zone=expected_str,
        actual_zone=actual_str,
        status=status,
        explanation=explanation,
        score_contribution=score
    )


def evaluate_vastu_layout(
    rooms: List[Any],
    plot_width: float,
    plot_length: float,
    road_side: str = "south",
    north_deg: Optional[float] = None
) -> VastuResult:
    """
    Complete Vastu Shastra audit for all rooms in a canonical house layout.
    """
    rule_results: List[VastuRuleEvaluation] = []
    zone_occupancy: Dict[str, List[str]] = {}
    satisfied: List[str] = []
    violated: List[str] = []
    warnings: List[str] = []
    recommendations: List[str] = []

    total_weight = 0.0
    weighted_score = 0.0

    severity_weights = {
        "mandatory": 3.0,
        "preferred": 2.0,
        "neutral": 1.0,
        "avoid": 2.5
    }

    road_facing = (road_side or "south").capitalize()
    orientation_desc = f"{road_facing}-Road Site (Vastu Oriented)"

    for r in rooms:
        rect = getattr(r, "rect", None)
        if not rect:
            continue

        center_x = rect.x + rect.width / 2.0
        center_y = rect.y + rect.length / 2.0
        zone = get_vastu_zone_for_point(
            center_x, center_y,
            plot_width, plot_length,
            road_side=road_side,
            north_deg=north_deg
        )

        zone_str = zone.capitalize()
        zone_occupancy.setdefault(zone_str, []).append(r.name)

        evaluation = evaluate_room_vastu(r.type, r.name, r.id, zone)
        rule_results.append(evaluation)

        weight = severity_weights.get(evaluation.severity, 1.0)
        total_weight += weight
        weighted_score += evaluation.score_contribution * weight

        if evaluation.status == "satisfied":
            satisfied.append(f"{r.name} in {evaluation.actual_zone}")
        elif evaluation.status == "violated":
            violated.append(f"{r.name} in {evaluation.actual_zone} (expected {evaluation.expected_zone})")
            if evaluation.severity in ["mandatory", "preferred"]:
                warnings.append(evaluation.explanation)
                recommendations.append(f"Consider relocating {r.name} towards {evaluation.expected_zone} zone.")

    # Check Brahmasthan (Center) openness
    center_occupants = zone_occupancy.get("Center", [])
    has_heavy_toilet_in_center = any("bath" in o.lower() or "toilet" in o.lower() for o in center_occupants)
    if has_heavy_toilet_in_center:
        warnings.append("Brahmasthan (Center) contains wet sanitary drainage; ideally keep central zone open.")
        weighted_score -= 15.0

    overall = round(max(0.0, min(100.0, weighted_score / max(1.0, total_weight))), 1)

    if not recommendations and overall >= 80.0:
        recommendations.append("Layout harmoniously balances core Vastu quadrants with architectural flow.")

    return VastuResult(
        overall_score=overall,
        orientation_interpreted=orientation_desc,
        rule_results=rule_results,
        satisfied_rules=satisfied,
        violated_rules=violated,
        warnings=warnings,
        recommendations=recommendations,
        zone_occupancy=zone_occupancy
    )


def get_vastu_topological_scheme_placements(
    road_side: str,
    rooms: List[Any],
    plot_width: float,
    plot_length: float
) -> Dict[str, Dict[str, str]]:
    """
    Generates solver placement hints (rel_y: front/middle/rear, rel_x: left/center/right)
    for CP-SAT that steer rooms towards their auspicious Vastu sectors.
    """
    placements: Dict[str, Dict[str, str]] = {}
    road = (road_side or "south").lower()

    # Define cardinal mappings relative to screen coordinates
    # For road_side == "south":
    # front = South (+Y), rear = North (-Y)
    # left = West (-X), right = East (+X)
    #
    # Vastu Zones:
    # NE (Ishanya): rear, right
    # SE (Agneya): front, right
    # SW (Nairrutya): front, left
    # NW (Vayavya): rear, left
    # Center: middle, center
    # North: rear, center
    # South: front, center
    # East: middle, right
    # West: middle, left

    zone_to_screen_rel: Dict[str, Dict[str, str]] = {}
    if road == "south":
        zone_to_screen_rel = {
            "northeast": {"rel_y": "rear", "rel_x": "right"},
            "southeast": {"rel_y": "front", "rel_x": "right"},
            "southwest": {"rel_y": "front", "rel_x": "left"},
            "northwest": {"rel_y": "rear", "rel_x": "left"},
            "north": {"rel_y": "rear", "rel_x": "center"},
            "south": {"rel_y": "front", "rel_x": "center"},
            "east": {"rel_y": "middle", "rel_x": "right"},
            "west": {"rel_y": "middle", "rel_x": "left"},
            "center": {"rel_y": "middle", "rel_x": "center"},
        }
    elif road == "north":
        # Front is North (+Y), rear is South (-Y)
        # left is East (-X), right is West (+X)
        zone_to_screen_rel = {
            "northeast": {"rel_y": "front", "rel_x": "left"},
            "southeast": {"rel_y": "rear", "rel_x": "left"},
            "southwest": {"rel_y": "rear", "rel_x": "right"},
            "northwest": {"rel_y": "front", "rel_x": "right"},
            "north": {"rel_y": "front", "rel_x": "center"},
            "south": {"rel_y": "rear", "rel_x": "center"},
            "east": {"rel_y": "middle", "rel_x": "left"},
            "west": {"rel_y": "middle", "rel_x": "right"},
            "center": {"rel_y": "middle", "rel_x": "center"},
        }
    elif road == "east":
        # Front is East (+X), Rear is West (-X)
        # In lateral (looking west from east road): left is South (+Y), right is North (-Y)
        zone_to_screen_rel = {
            "northeast": {"rel_y": "front", "rel_x": "right"},
            "southeast": {"rel_y": "front", "rel_x": "left"},
            "southwest": {"rel_y": "rear", "rel_x": "left"},
            "northwest": {"rel_y": "rear", "rel_x": "right"},
            "north": {"rel_y": "middle", "rel_x": "right"},
            "south": {"rel_y": "middle", "rel_x": "left"},
            "east": {"rel_y": "front", "rel_x": "center"},
            "west": {"rel_y": "rear", "rel_x": "center"},
            "center": {"rel_y": "middle", "rel_x": "center"},
        }
    else:  # west
        # Front is West (-X), Rear is East (+X)
        # In lateral (looking east from west road): left is North (-Y), right is South (+Y)
        zone_to_screen_rel = {
            "northwest": {"rel_y": "front", "rel_x": "left"},
            "southwest": {"rel_y": "front", "rel_x": "right"},
            "northeast": {"rel_y": "rear", "rel_x": "left"},
            "southeast": {"rel_y": "rear", "rel_x": "right"},
            "north": {"rel_y": "middle", "rel_x": "left"},
            "south": {"rel_y": "middle", "rel_x": "right"},
            "west": {"rel_y": "front", "rel_x": "center"},
            "east": {"rel_y": "rear", "rel_x": "center"},
            "center": {"rel_y": "middle", "rel_x": "center"},
        }

    for r in rooms:
        r_type = getattr(r, "type", "").lower()
        if "entry" in r_type or "foyer" in r_type:
            placements[r.id] = {"rel_y": "front", "rel_x": "center"}
        elif "living" in r_type:
            placements[r.id] = {"rel_y": "front", "rel_x": "center"}
        elif "master_bedroom" in r_type:
            placements[r.id] = zone_to_screen_rel.get("southwest", {"rel_y": "rear", "rel_x": "left"})
        elif "kitchen" in r_type:
            placements[r.id] = zone_to_screen_rel.get("southeast", {"rel_y": "front", "rel_x": "right"})
        elif "pooja" in r_type:
            placements[r.id] = zone_to_screen_rel.get("northeast", {"rel_y": "rear", "rel_x": "right"})
        elif "dining" in r_type:
            placements[r.id] = zone_to_screen_rel.get("west", {"rel_y": "middle", "rel_x": "left"})
        elif "guest" in r_type:
            placements[r.id] = zone_to_screen_rel.get("northwest", {"rel_y": "rear", "rel_x": "left"})
        elif "stair" in r_type:
            placements[r.id] = zone_to_screen_rel.get("south", {"rel_y": "front", "rel_x": "left"})
        elif "bath" in r_type:
            placements[r.id] = zone_to_screen_rel.get("west", {"rel_y": "middle", "rel_x": "left"})
        elif "entry" in r_type or "foyer" in r_type:
            placements[r.id] = {"rel_y": "front", "rel_x": "center"}
        elif "hall" in r_type:
            placements[r.id] = {"rel_y": "middle", "rel_x": "center"}

    return placements
