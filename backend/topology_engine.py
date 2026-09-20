"""
Topology Engine Module
Generates candidate architectural spatial topologies:
- Central Circulation Spine
- Side Circulation Scheme
- Public-Private Zonal Split
- LLM Architectural Concept Strategies (topological constraints, zoning & adjacencies)

These topological blueprints guide the CP-SAT geometric solver without prescribing raw coordinates.
"""

from typing import List, Dict, Any, Optional
from models import Room, Site, Rect, ZoneType

class ArchitecturalScheme:
    def __init__(self, scheme_id: str, name: str, description: str):
        self.scheme_id = scheme_id
        self.name = name
        self.description = description
        # Relative positioning hints: room_id -> {"rel_x": "left"|"center"|"right", "rel_y": "front"|"middle"|"rear"}
        self.zone_placements: Dict[str, Dict[str, str]] = {}
        self.circulation_type: str = "central"  # "central", "side", "linear"
        self.priority_adjacencies: List[List[str]] = []
        self.priority_separations: List[List[str]] = []


def generate_architectural_schemes(
    rooms: List[Room],
    site: Site,
    vastu_compliant: bool = False,
    ai_concepts: Optional[List[Any]] = None
) -> List[ArchitecturalScheme]:
    """
    Produces distinct, architecturally grounded schemes adapted to
    the plot geometry, road frontage, functional zones, and Groq architectural concepts.
    """
    road = site.road_side  # "north", "south", "east", "west"
    schemes: List[ArchitecturalScheme] = []

    # -------------------------------------------------------------------------
    # 1. Translate Groq AI Architectural Concept Strategies if provided
    # -------------------------------------------------------------------------
    if ai_concepts:
        for idx, concept in enumerate(ai_concepts):
            strategy_id = getattr(concept, "strategy_id", f"scheme_concept_{idx+1}")
            name = getattr(concept, "name", f"Concept Strategy {idx+1}")
            thesis = getattr(concept, "architectural_thesis", getattr(concept, "description", "Architectural Concept"))
            circ_type = getattr(concept, "circulation_type", "central")
            zoning = getattr(concept, "zoning_placement", {})
            adj = getattr(concept, "priority_adjacencies", [])
            sep = getattr(concept, "priority_separations", [])

            s = ArchitecturalScheme(
                scheme_id=strategy_id,
                name=name,
                description=thesis
            )
            s.circulation_type = circ_type
            s.priority_adjacencies = adj
            s.priority_separations = sep

            for r in rooms:
                # Map from concept zoning dictionary if specified for room type or zone
                hint = None
                if isinstance(zoning, dict):
                    hint = zoning.get(r.type) or zoning.get(r.zone)

                if hint and isinstance(hint, dict) and "rel_y" in hint and "rel_x" in hint:
                    s.zone_placements[r.id] = {
                        "rel_y": str(hint["rel_y"]),
                        "rel_x": str(hint["rel_x"])
                    }
                else:
                    # Smart architectural fallback for this room
                    if r.zone == "public" or r.type == "entry_foyer":
                        s.zone_placements[r.id] = {"rel_y": "front", "rel_x": "center"}
                    elif r.zone == "service":
                        s.zone_placements[r.id] = {"rel_y": "middle", "rel_x": "right"}
                    elif r.zone == "private":
                        s.zone_placements[r.id] = {"rel_y": "rear", "rel_x": "left"}
                    elif r.type in ["hallway", "staircase"]:
                        s.zone_placements[r.id] = {"rel_y": "middle", "rel_x": "center"}
                    else:
                        s.zone_placements[r.id] = {"rel_y": "middle", "rel_x": "center"}

            schemes.append(s)

    # -------------------------------------------------------------------------
    # 2. Add Deterministic Architectural Schemes (ensures >= 3 robust candidates)
    # -------------------------------------------------------------------------
    # Scheme 1: Central Circulation Spine (Balanced Modern Villa)
    s1 = ArchitecturalScheme(
        scheme_id="scheme_central_circulation",
        name="Central Circulation Spine",
        description="A central foyer and hallway connects the public entertaining zone seamlessly to quiet rear private suites."
    )
    s1.circulation_type = "central"
    s1.priority_adjacencies = [["living_room", "entry_foyer"], ["dining", "kitchen"]]
    s1.priority_separations = [["master_bedroom", "living_room"]]
    for r in rooms:
        if r.type in ["entry_foyer", "living_room"]:
            s1.zone_placements[r.id] = {"rel_y": "front", "rel_x": "center"}
        elif r.type in ["dining", "kitchen", "utility", "pantry"]:
            s1.zone_placements[r.id] = {"rel_y": "front" if vastu_compliant and road == "south" else "middle", "rel_x": "right"}
        elif r.type in ["master_bedroom", "dressing"]:
            s1.zone_placements[r.id] = {"rel_y": "front" if vastu_compliant and road == "south" else "rear", "rel_x": "left"}
        elif r.type in ["bedroom", "guest_bedroom"]:
            s1.zone_placements[r.id] = {"rel_y": "rear", "rel_x": "right"}
        elif r.type in ["bathroom", "powder_room"]:
            s1.zone_placements[r.id] = {"rel_y": "middle", "rel_x": "left"}
        elif r.type in ["hallway", "staircase"]:
            s1.zone_placements[r.id] = {"rel_y": "middle", "rel_x": "center"}
        else:
            s1.zone_placements[r.id] = {"rel_y": "middle", "rel_x": "center"}
    
    # Avoid duplicate scheme IDs if AI concept used the same ID
    existing_ids = {s.scheme_id for s in schemes}
    if s1.scheme_id not in existing_ids:
        schemes.append(s1)

    # Scheme 2: Public-Private Zonal Split (Maximum Bedroom Privacy)
    s2 = ArchitecturalScheme(
        scheme_id="scheme_public_private_split",
        name="Public-Private Zonal Split",
        description="Strict acoustic and visual separation: public living & dining at frontage, all sleeping quarters isolated in a private wing."
    )
    s2.circulation_type = "side"
    s2.priority_adjacencies = [["dining", "kitchen"]]
    s2.priority_separations = [["master_bedroom", "entry_foyer"], ["bedroom", "kitchen"]]
    for r in rooms:
        if r.zone == "public" or r.type == "entry_foyer":
            s2.zone_placements[r.id] = {"rel_y": "front", "rel_x": "center"}
        elif r.zone == "service":
            s2.zone_placements[r.id] = {"rel_y": "front", "rel_x": "right"}
        elif r.zone == "private":
            s2.zone_placements[r.id] = {"rel_y": "rear", "rel_x": "center"}
        elif r.type in ["hallway", "staircase"]:
            s2.zone_placements[r.id] = {"rel_y": "middle", "rel_x": "left"}
        else:
            s2.zone_placements[r.id] = {"rel_y": "middle", "rel_x": "center"}
    if s2.scheme_id not in existing_ids:
        schemes.append(s2)

    # Scheme 3: Side Circulation & Open Daylight Flow (Linear Garden Orientation)
    s3 = ArchitecturalScheme(
        scheme_id="scheme_side_circulation",
        name="Side Gallery Circulation",
        description="Linear circulation corridor along one flank provides natural cross-ventilation and uninterrupted garden views."
    )
    s3.circulation_type = "side"
    s3.priority_adjacencies = [["living_room", "dining"]]
    for r in rooms:
        if r.type in ["entry_foyer", "living_room"]:
            s3.zone_placements[r.id] = {"rel_y": "front", "rel_x": "left"}
        elif r.type in ["dining", "family_lounge"]:
            s3.zone_placements[r.id] = {"rel_y": "middle", "rel_x": "left"}
        elif r.type in ["kitchen", "utility"]:
            s3.zone_placements[r.id] = {"rel_y": "middle", "rel_x": "right"}
        elif r.type in ["master_bedroom", "bedroom"]:
            s3.zone_placements[r.id] = {"rel_y": "rear", "rel_x": "left"}
        elif r.type in ["bathroom", "powder_room"]:
            s3.zone_placements[r.id] = {"rel_y": "rear", "rel_x": "right"}
        elif r.type in ["hallway", "staircase"]:
            s3.zone_placements[r.id] = {"rel_y": "middle", "rel_x": "right"}
        else:
            s3.zone_placements[r.id] = {"rel_y": "middle", "rel_x": "center"}
    if s3.scheme_id not in existing_ids:
        schemes.append(s3)

    return schemes
