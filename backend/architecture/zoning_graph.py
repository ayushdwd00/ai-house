"""
Zoning & Room Relationship Graph Module
Establishes residential architectural functional zoning, privacy hierarchy,
and weighted relationship graphs using NetworkX.
"""

from typing import List, Dict, Tuple, Optional, Any
import networkx as nx
from models import ZoneType, RoomType, PrivacyLevel, Room

# Weighted relationship constants
REQUIRED_ADJACENCY = 100.0
STRONG_ADJACENCY = 75.0
PREFERRED_ADJACENCY = 50.0
NEUTRAL = 10.0
PREFERRED_SEPARATION = -40.0
REQUIRED_SEPARATION = -100.0

# Canonical zone assignments
ZONE_MAP: Dict[str, ZoneType] = {
    "living_room": "public",
    "family_lounge": "public",
    "dining": "public",
    "entry_foyer": "public",
    "kitchen": "service",
    "utility": "service",
    "pantry": "service",
    "master_bedroom": "private",
    "bedroom": "private",
    "guest_bedroom": "private",
    "dressing": "private",
    "bathroom": "service",      # or private if attached
    "powder_room": "public",
    "pooja": "special",
    "office": "special",
    "balcony": "outdoor",
    "patio": "outdoor",
    "hallway": "circulation",
    "staircase": "circulation",
    "parking": "parking",
}

# Default privacy level
PRIVACY_MAP: Dict[str, PrivacyLevel] = {
    "entry_foyer": "public",
    "living_room": "public",
    "dining": "semi_private",
    "kitchen": "semi_private",
    "utility": "semi_private",
    "guest_bedroom": "semi_private",
    "powder_room": "semi_private",
    "office": "semi_private",
    "pooja": "semi_private",
    "bedroom": "private",
    "master_bedroom": "intimate",
    "dressing": "intimate",
    "bathroom": "intimate",
    "hallway": "semi_private",
    "staircase": "semi_private",
}


def build_room_relationship_graph(rooms: List[Room]) -> nx.Graph:
    """
    Constructs an explicit weighted relationship graph for a collection of rooms.
    Edges encode architectural attraction or repulsion forces.
    """
    G = nx.Graph()
    
    # Add room nodes with rich architectural metadata
    for r in rooms:
        G.add_node(
            r.id,
            name=r.name,
            type=r.type,
            zone=r.zone,
            privacy=r.privacy_level,
            attached_to=r.attached_room_id,
            min_width=r.min_width,
            min_length=r.min_length,
            preferred_width=r.preferred_width,
            preferred_length=r.preferred_length
        )

    # Define pairwise standard residential rules
    room_dict = {r.id: r for r in rooms}
    room_ids = list(room_dict.keys())

    for i in range(len(room_ids)):
        for j in range(i + 1, len(room_ids)):
            r1 = room_dict[room_ids[i]]
            r2 = room_dict[room_ids[j]]
            
            weight = compute_relationship_weight(r1, r2)
            if weight != 0.0:
                G.add_edge(r1.id, r2.id, weight=weight)
                
    return G


def compute_relationship_weight(r1: Room, r2: Room) -> float:
    """
    Evaluates the architectural affinity between two rooms.
    """
    # 1. Direct Parent / Child or Attached Room relationship (e.g. Master -> Attached Bath)
    if r1.attached_room_id == r2.id or r2.attached_room_id == r1.id:
        return REQUIRED_ADJACENCY

    # Explicit adjacency constraints on rooms
    if r2.id in r1.required_adjacencies or r1.id in r2.required_adjacencies:
        return REQUIRED_ADJACENCY
    if r2.id in r1.forbidden_adjacencies or r1.id in r2.forbidden_adjacencies:
        return REQUIRED_SEPARATION
    if r2.id in r1.preferred_adjacencies or r1.id in r2.preferred_adjacencies:
        return STRONG_ADJACENCY

    types = {r1.type, r2.type}

    # 2. Service & Dining relationships
    if types == {"dining", "kitchen"}:
        return REQUIRED_ADJACENCY
    if types == {"kitchen", "utility"}:
        return STRONG_ADJACENCY
    if types == {"kitchen", "pantry"}:
        return STRONG_ADJACENCY

    # 3. Public Entry sequence
    if types == {"entry_foyer", "living_room"}:
        return STRONG_ADJACENCY
    if types == {"living_room", "dining"}:
        return STRONG_ADJACENCY
    if types == {"living_room", "family_lounge"}:
        return PREFERRED_ADJACENCY

    # 4. Circulation connectivity
    if "hallway" in types:
        other_type = list(types - {"hallway"})[0] if len(types) > 1 else "hallway"
        if other_type in ["bedroom", "master_bedroom", "bathroom", "living_room", "staircase"]:
            return STRONG_ADJACENCY

    if "staircase" in types:
        other_type = list(types - {"staircase"})[0] if len(types) > 1 else "staircase"
        if other_type in ["living_room", "hallway", "entry_foyer"]:
            return STRONG_ADJACENCY
        if other_type in ["master_bedroom", "bedroom"]:
            return PREFERRED_SEPARATION

    # 5. Master Suite cluster
    if types == {"master_bedroom", "dressing"}:
        return STRONG_ADJACENCY

    # 6. Privacy Separations (Bedrooms shouldn't open directly to main entrance or kitchen)
    if "entry_foyer" in types and ("master_bedroom" in types or "bedroom" in types):
        return PREFERRED_SEPARATION
    if "kitchen" in types and ("master_bedroom" in types or "bedroom" in types):
        return PREFERRED_SEPARATION
    if "kitchen" in types and "bathroom" in types:
        # Bathrooms should never open directly into kitchens
        return REQUIRED_SEPARATION

    return NEUTRAL


def validate_circulation_network(
    rooms: List[Room],
    doors: List[Any]
) -> Tuple[bool, List[str], List[str]]:
    """
    Verifies that all habitable rooms are reachable from the entrance without
    violating privacy hierarchies (no through-bedroom paths; no bath-to-kitchen opening).
    Returns (is_valid, errors, warnings).
    """
    errors: List[str] = []
    warnings: List[str] = []

    # Build connectivity graph from door links
    CG = nx.Graph()
    for r in rooms:
        CG.add_node(r.id, type=r.type, zone=r.zone)

    door_pairs = []
    for d in doors:
        r1 = getattr(d, "from_room_id", getattr(d, "from_room", None))
        r2 = getattr(d, "to_room_id", getattr(d, "to_room", None))
        if not r1 or not r2:
            conn = getattr(d, "connects_room_ids", [])
            if len(conn) >= 2:
                r1, r2 = conn[0], conn[1]
        if r1 and r2:
            door_pairs.append((r1, r2))
            CG.add_edge(r1, r2)

    # 1. Entrance reachability
    entry_nodes = [r.id for r in rooms if r.type in ["entry_foyer", "living_room"]]
    if "outdoor" in CG:
        entry_nodes.append("outdoor")

    for r in rooms:
        if r.type in ["hallway", "balcony", "patio", "parking"]:
            continue
        has_path = any(nx.has_path(CG, r.id, ent) for ent in entry_nodes if ent in CG)
        if not has_path:
            errors.append(f"Room '{r.name}' ({r.id}) is unreachable from the entrance.")

    # 2. Privacy Rule: Bedrooms must not be through-circulation corridors
    bedroom_ids = {r.id for r in rooms if r.type in ["bedroom", "master_bedroom", "guest_bedroom"]}
    for b_id in bedroom_ids:
        attached_bath = next((r.id for r in rooms if r.type == "bathroom" and r.attached_room_id == b_id), None)
        neighbors = set(CG.neighbors(b_id)) if b_id in CG else set()
        # Non-attached neighbors
        external_links = [n for n in neighbors if n != attached_bath and n != "outdoor"]
        if len(external_links) > 1:
            errors.append(f"Bedroom {b_id} functions as a through-room connected to multiple spaces: {external_links}.")

    # 3. Direct kitchen to bathroom prohibition
    kitchen_ids = {r.id for r in rooms if r.type == "kitchen"}
    bathroom_ids = {r.id for r in rooms if r.type in ["bathroom", "powder_room"]}
    for k_id in kitchen_ids:
        for b_id in bathroom_ids:
            if CG.has_edge(k_id, b_id):
                errors.append(f"Sanitary conflict: Bathroom '{b_id}' opens directly into Kitchen '{k_id}'.")

    return (len(errors) == 0, errors, warnings)

