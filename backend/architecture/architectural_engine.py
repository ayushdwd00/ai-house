"""
Architectural Engine Module
Unified end-to-end architectural floor plan generation pipeline:
Site Analysis -> Functional Zoning -> Relationship Graph -> Topology ->
CP-SAT Spatial Solver -> Shapely Geometry -> Furniture Programs ->
Shared Wall Network -> Doors & Windows -> Mathematical Scoring ->
Groq Architectural Critic -> Canonical HouseLayout Model.
"""

from typing import List, Dict, Tuple, Optional, Any
import uuid

from models import (
    HouseLayout, FloorPlan, Room, Rect, FurnitureItem, Wall, Door, Window,
    HouseStats, Site, Point2D, ArchitecturalScores, ArchitecturalValidation,
    Stair, StairGeometry, CirculationNetwork, ConstructionSpecification,
    MaterialQuantities, CostEstimate, BuildingServices, StructuralPlanning,
    LandscapePlan, LandscapePreferences
)
from architecture.site_planner import plan_site
from architecture.zoning_graph import ZONE_MAP, PRIVACY_MAP
from architecture.topology_engine import generate_architectural_schemes, ArchitecturalScheme
from architecture.spatial_solver import solve_spatial_layout, SolverCandidate
from architecture.furniture_validator import validate_and_place_furniture
from architecture.wall_network import generate_wall_network_and_openings
from architecture.architectural_scorer import calculate_architectural_scores
from vastu.vastu_engine import compute_north_angle
from construction.construction_engine import recommend_construction_specification
from construction.building_services_engine import plan_building_services
from construction.structural_planner import plan_preliminary_structure
from estimation.material_quantity_engine import calculate_material_quantities
from estimation.cost_estimator import estimate_construction_cost
from ai.groq_service import (
    critique_architectural_candidates_with_groq,
    generate_architectural_concepts_with_groq,
    ArchitecturalRequirements,
    ArchitecturalCritique
)

ROOM_COLORS = {
    "living_room": "#F8F4EE",
    "family_lounge": "#F6F1EA",
    "dining": "#F5EFE6",
    "kitchen": "#F1EBE1",
    "utility": "#EFEAE3",
    "master_bedroom": "#E9EFEA",
    "bedroom": "#EBF1F6",
    "guest_bedroom": "#E8EFF4",
    "bathroom": "#E5EDEF",
    "powder_room": "#ECECE8",
    "dressing": "#EDECE6",
    "entry_foyer": "#F1EDE6",
    "hallway": "#FAF7F2",
    "staircase": "#F2ECE4",
    "office": "#EBE7F1",
    "pooja": "#FBF5E8",
    "balcony": "#E7ECE6",
    "patio": "#E7ECE6",
    "parking": "#EFEFEF",
}

_CONCEPTS_CACHE: Dict[str, Any] = {}
_CRITIQUE_CACHE: Dict[str, Any] = {}


def build_room_program(
    floor_num: int,
    total_floors: int,
    bedrooms: int,
    bathrooms: float,
    attached_bathroom_count: Optional[int] = None,
    special_rooms: Optional[List[str]] = None,
    open_concept: bool = True,
    room_allocations: Optional[List[Any]] = None
) -> List[Room]:
    """
    Synthesizes an architectural room program with hard minimums,
    preferred optimization targets, and required adjacencies.
    Supports user-specified attached_bathroom_count and explicit room_allocations.
    """
    rooms: List[Room] = []
    special_rooms = special_rooms or []

    # If explicit user room allocations are supplied for this floor, build program from them
    if room_allocations and len(room_allocations) > 0:
        floor_allocs = []
        for a in room_allocations:
            f_num = getattr(a, "floor_number", None)
            if f_num is None and isinstance(a, dict):
                f_num = a.get("floor_number", 1)
            if f_num == floor_num:
                floor_allocs.append(a)

        if floor_allocs:
            for alloc in floor_allocs:
                r_id = getattr(alloc, "room_id", None) or getattr(alloc, "id", None)
                if not r_id and isinstance(alloc, dict):
                    r_id = alloc.get("room_id") or alloc.get("id")
                r_name = getattr(alloc, "name", None) or (alloc.get("name") if isinstance(alloc, dict) else "Room")
                r_type = getattr(alloc, "type", None) or (alloc.get("type") if isinstance(alloc, dict) else "bedroom")
                r_zone = getattr(alloc, "zone", None) or (alloc.get("zone") if isinstance(alloc, dict) else "private")

                clean_type = r_type.lower()
                alloc_len = getattr(alloc, "length", None) or (alloc.get("length") if isinstance(alloc, dict) else None)
                alloc_wid = getattr(alloc, "width", None) or (alloc.get("width") if isinstance(alloc, dict) else None)
                size_mode = getattr(alloc, "size_mode", "ai_recommended") or (alloc.get("size_mode") if isinstance(alloc, dict) else "ai_recommended")
                is_hard = getattr(alloc, "is_hard_constraint", False) or (alloc.get("is_hard_constraint") if isinstance(alloc, dict) else False)
                min_len = getattr(alloc, "min_length", None) or (alloc.get("min_length") if isinstance(alloc, dict) else None)
                min_wid = getattr(alloc, "min_width", None) or (alloc.get("min_width") if isinstance(alloc, dict) else None)
                pref_len = getattr(alloc, "preferred_length", None) or (alloc.get("preferred_length") if isinstance(alloc, dict) else None)
                pref_wid = getattr(alloc, "preferred_width", None) or (alloc.get("preferred_width") if isinstance(alloc, dict) else None)

                if "master" in clean_type or "primary" in clean_type:
                    mw, ml, pw, pl, xw, xl = 11.5, 13.0, 13.5, 15.5, 18.0, 20.0
                    zone = "private"
                    privacy = "intimate"
                    daylight = "high"
                elif "bed" in clean_type or "guest" in clean_type:
                    mw, ml, pw, pl, xw, xl = 10.0, 11.0, 11.5, 13.0, 15.0, 16.0
                    zone = "private"
                    privacy = "private"
                    daylight = "high"
                elif "living" in clean_type or "drawing" in clean_type or "lounge" in clean_type:
                    mw, ml, pw, pl, xw, xl = 12.0, 14.0, 14.0, 17.0, 18.0, 22.0
                    zone = "public"
                    privacy = "public"
                    daylight = "high"
                elif "dining" in clean_type:
                    mw, ml, pw, pl, xw, xl = 9.0, 10.5, 11.0, 13.0, 14.0, 16.0
                    zone = "public"
                    privacy = "semi_private"
                    daylight = "high"
                elif "kitchen" in clean_type:
                    mw, ml, pw, pl, xw, xl = 8.0, 9.5, 10.0, 12.0, 15.0, 16.0
                    zone = "service"
                    privacy = "semi_private"
                    daylight = "high"
                elif "bath" in clean_type or "toilet" in clean_type or "powder" in clean_type:
                    mw, ml, pw, pl, xw, xl = 4.5, 6.5, 5.5, 7.5, 8.0, 10.0
                    zone = "service"
                    privacy = "intimate"
                    daylight = "low"
                elif "pooja" in clean_type or "mandir" in clean_type or "puja" in clean_type:
                    mw, ml, pw, pl, xw, xl = 4.5, 5.0, 5.5, 6.5, 8.0, 9.0
                    zone = "special"
                    privacy = "semi_private"
                    daylight = "medium"
                elif "office" in clean_type or "study" in clean_type:
                    mw, ml, pw, pl, xw, xl = 8.0, 9.0, 10.0, 11.5, 13.0, 14.0
                    zone = "special"
                    privacy = "semi_private"
                    daylight = "high"
                elif "balcony" in clean_type or "terrace" in clean_type or "patio" in clean_type:
                    mw, ml, pw, pl, xw, xl = 4.5, 7.0, 6.0, 10.0, 10.0, 16.0
                    zone = "special"
                    privacy = "semi_private"
                    daylight = "high"
                elif "utility" in clean_type or "laundry" in clean_type or "store" in clean_type:
                    mw, ml, pw, pl, xw, xl = 5.0, 6.0, 6.0, 7.5, 8.0, 10.0
                    zone = "service"
                    privacy = "semi_private"
                    daylight = "low"
                else:
                    mw, ml, pw, pl, xw, xl = 8.0, 9.0, 10.0, 11.0, 13.0, 14.0
                    zone = r_zone or "private"
                    privacy = "semi_private"
                    daylight = "medium"

                # Override dimensions if user provided manual or recommended values
                if alloc_len and alloc_wid:
                    w = float(min(alloc_len, alloc_wid))
                    l = float(max(alloc_len, alloc_wid))
                    if size_mode == "manual" or is_hard:
                        # Hard user constraint: exact target dimensions strictly locked
                        mw = w
                        pw = w
                        xw = w
                        ml = l
                        pl = l
                        xl = l
                    else:
                        # AI Recommended dimension: preferred target with architectural tolerance
                        pw = float(pref_wid) if pref_wid else w
                        pl = float(pref_len) if pref_len else l
                        mw = float(min_wid) if min_wid else max(3.5, pw * 0.85)
                        ml = float(min_len) if min_len else max(3.5, pl * 0.85)
                        xw = pw * 1.25
                        xl = pl * 1.25

                rooms.append(Room(
                    id=r_id or f"f{floor_num}_{clean_type}_{len(rooms)+1}",
                    name=r_name,
                    type=clean_type,
                    zone=zone,
                    floor=floor_num,
                    min_width=mw, min_length=ml,
                    preferred_width=pw, preferred_length=pl,
                    max_width=xw, max_length=xl,
                    is_hard_constraint=(size_mode == "manual" or is_hard),
                    size_mode="manual" if (size_mode == "manual" or is_hard) else "ai_recommended",
                    privacy_level=privacy,
                    daylight_requirement=daylight,
                    exterior_wall_requirement=("bed" in clean_type or "living" in clean_type or "kitchen" in clean_type),
                    color=ROOM_COLORS.get(clean_type, "#E5EDEF"),
                    rationale=f"{r_name} allocated to Level {floor_num}."
                ))

            # Ensure vertical circulation stairs if total_floors > 1
            if total_floors > 1 and not any(r.type == "staircase" for r in rooms):
                rooms.append(Room(
                    id=f"f{floor_num}_staircase",
                    name="Staircase Core",
                    type="staircase",
                    zone="circulation",
                    floor=floor_num,
                    min_width=7.0, min_length=9.0,
                    preferred_width=8.0, preferred_length=10.0,
                    max_width=9.5, max_length=12.0,
                    privacy_level="semi_private",
                    color=ROOM_COLORS["staircase"],
                    rationale="Central vertical circulation core with ergonomic risers and treads."
                ))

            # Ensure circulation hallway
            if not any(r.type == "hallway" for r in rooms):
                rooms.append(Room(
                    id=f"f{floor_num}_hallway",
                    name="Circulation Hall",
                    type="hallway",
                    zone="circulation",
                    floor=floor_num,
                    min_width=4.0, min_length=8.0,
                    preferred_width=5.0, preferred_length=12.0,
                    max_width=7.0, max_length=24.0,
                    privacy_level="semi_private",
                    color=ROOM_COLORS["hallway"],
                    rationale="Acoustic buffer corridor linking living zones to quiet quarters."
                ))

            # If ground floor and no foyer, add foyer
            if floor_num == 1 and not any("foyer" in r.type for r in rooms):
                rooms.insert(0, Room(
                    id=f"f{floor_num}_entry_foyer",
                    name="Entry Foyer",
                    type="entry_foyer",
                    zone="public",
                    floor=floor_num,
                    min_width=5.5, min_length=6.0,
                    preferred_width=7.5, preferred_length=8.0,
                    max_width=12.0, max_length=12.0,
                    privacy_level="public",
                    daylight_requirement="medium",
                    color=ROOM_COLORS["entry_foyer"],
                    rationale="Transitional airlock providing privacy buffer and welcoming arrival."
                ))

            return rooms

    # Determine target attached bathrooms (default to 1 if bedrooms >= 1)
    if attached_bathroom_count is not None:
        target_attached = max(0, min(int(attached_bathroom_count), bedrooms))
    else:
        target_attached = min(1, bedrooms)

    # Single-story OR Ground floor of multi-story (procedural fallback)
    if floor_num == 1:
        # 1. Entry Foyer
        rooms.append(Room(
            id=f"f{floor_num}_entry_foyer",
            name="Entry Foyer",
            type="entry_foyer",
            zone="public",
            floor=floor_num,
            min_width=5.5, min_length=6.0,
            preferred_width=7.5, preferred_length=8.0,
            max_width=12.0, max_length=12.0,
            privacy_level="public",
            daylight_requirement="medium",
            color=ROOM_COLORS["entry_foyer"],
            rationale="Transitional airlock providing privacy buffer and welcoming arrival."
        ))

        # 2. Living Room
        rooms.append(Room(
            id=f"f{floor_num}_living_room",
            name="Living Room",
            type="living_room",
            zone="public",
            floor=floor_num,
            min_width=12.0, min_length=13.0,
            preferred_width=14.5, preferred_length=17.0,
            max_width=22.0, max_length=24.0,
            privacy_level="public",
            daylight_requirement="high",
            exterior_wall_requirement=True,
            preferred_adjacencies=[f"f{floor_num}_entry_foyer", f"f{floor_num}_dining"],
            color=ROOM_COLORS["living_room"],
            rationale="Primary public living sanctuary with direct exterior daylight."
        ))

        # 3. Dining
        rooms.append(Room(
            id=f"f{floor_num}_dining",
            name="Dining Room",
            type="dining",
            zone="public",
            floor=floor_num,
            min_width=9.5, min_length=10.5,
            preferred_width=12.0, preferred_length=13.5,
            max_width=16.0, max_length=18.0,
            privacy_level="semi_private",
            daylight_requirement="medium",
            required_adjacencies=[f"f{floor_num}_kitchen"],
            color=ROOM_COLORS["dining"],
            rationale="Dining hub connecting culinary service with entertaining spaces."
        ))

        # 4. Kitchen
        rooms.append(Room(
            id=f"f{floor_num}_kitchen",
            name="Kitchen",
            type="kitchen",
            zone="service",
            floor=floor_num,
            min_width=8.0, min_length=9.5,
            preferred_width=10.0, preferred_length=12.0,
            max_width=15.0, max_length=16.0,
            privacy_level="semi_private",
            daylight_requirement="high",
            exterior_wall_requirement=True,
            ventilation_requirement="direct_exterior",
            required_adjacencies=[f"f{floor_num}_dining"],
            color=ROOM_COLORS["kitchen"],
            rationale="Culinary work triangle with exterior ventilation."
        ))

        # 5. Circulation Hallway
        rooms.append(Room(
            id=f"f{floor_num}_hallway",
            name="Circulation Hall",
            type="hallway",
            zone="circulation",
            floor=floor_num,
            min_width=4.0, min_length=8.0,
            preferred_width=5.0, preferred_length=12.0,
            max_width=7.0, max_length=24.0,
            privacy_level="semi_private",
            color=ROOM_COLORS["hallway"],
            rationale="Acoustic buffer corridor linking living zones to quiet quarters."
        ))

        # 6. Staircase (if multi-floor)
        if total_floors > 1:
            rooms.append(Room(
                id=f"f{floor_num}_staircase",
                name="Staircase Core",
                type="staircase",
                zone="circulation",
                floor=floor_num,
                min_width=7.0, min_length=9.0,
                preferred_width=8.0, preferred_length=10.0,
                max_width=9.5, max_length=12.0,
                privacy_level="semi_private",
                color=ROOM_COLORS["staircase"],
                rationale="Central vertical circulation core with ergonomic risers and treads."
            ))

        # Bedrooms for Ground Floor
        if total_floors == 1:
            # Single story: Master Bedroom + attached bath (if target_attached >= 1)
            m_id = f"f{floor_num}_master_bed"
            mb_id = f"f{floor_num}_master_bath"
            master_has_attached = (target_attached >= 1)

            rooms.append(Room(
                id=m_id,
                name="Primary Suite",
                type="master_bedroom",
                zone="private",
                floor=floor_num,
                min_width=11.5, min_length=13.0,
                preferred_width=13.5, preferred_length=15.5,
                max_width=18.0, max_length=20.0,
                privacy_level="intimate",
                daylight_requirement="high",
                exterior_wall_requirement=True,
                attached_room_id=mb_id if master_has_attached else None,
                required_adjacencies=[mb_id] if master_has_attached else [],
                color=ROOM_COLORS["master_bedroom"],
                rationale="Secluded primary retreat with attached en-suite bathroom." if master_has_attached else "Secluded primary retreat."
            ))

            if master_has_attached:
                rooms.append(Room(
                    id=mb_id,
                    name="Primary Bath",
                    type="bathroom",
                    zone="private",
                    floor=floor_num,
                    parent_room_id=m_id,
                    attached_room_id=m_id,
                    min_width=5.0, min_length=7.0,
                    preferred_width=6.0, preferred_length=8.5,
                    max_width=8.5, max_length=10.0,
                    privacy_level="intimate",
                    ventilation_requirement="direct_exterior",
                    required_adjacencies=[m_id],
                    color=ROOM_COLORS["bathroom"],
                    rationale="Attached en-suite bathroom with shower stall, vanity, and WC."
                ))

            # Additional bedrooms on single floor
            for b_idx in range(2, bedrooms + 1):
                b_id = f"f{floor_num}_bedroom_{b_idx}"
                bed_has_attached = (b_idx <= target_attached)
                bath_id = f"f{floor_num}_bath_bed_{b_idx}" if bed_has_attached else None

                rooms.append(Room(
                    id=b_id,
                    name=f"Bedroom {b_idx}",
                    type="bedroom",
                    zone="private",
                    floor=floor_num,
                    min_width=10.0, min_length=11.0,
                    preferred_width=11.5, preferred_length=13.0,
                    max_width=15.0, max_length=16.0,
                    privacy_level="private",
                    daylight_requirement="high",
                    exterior_wall_requirement=True,
                    attached_room_id=bath_id,
                    required_adjacencies=[bath_id] if bath_id else [],
                    color=ROOM_COLORS["bedroom"],
                    rationale=f"Comfortable quiet bedroom with attached en-suite bathroom." if bed_has_attached else f"Comfortable quiet bedroom with natural daylight and wardrobe clearance."
                ))

                if bed_has_attached and bath_id:
                    rooms.append(Room(
                        id=bath_id,
                        name=f"Bath {b_idx}",
                        type="bathroom",
                        zone="private",
                        floor=floor_num,
                        parent_room_id=b_id,
                        attached_room_id=b_id,
                        min_width=4.5, min_length=6.0,
                        preferred_width=5.5, preferred_length=7.5,
                        max_width=7.5, max_length=9.0,
                        privacy_level="intimate",
                        ventilation_requirement="direct_exterior",
                        required_adjacencies=[b_id],
                        color=ROOM_COLORS["bathroom"],
                        rationale=f"Attached en-suite bathroom serving Bedroom {b_idx}."
                    ))

            # Common bathroom if at least one bedroom does not have an attached bath, or for guests
            if target_attached < bedrooms or bathrooms > target_attached or bedrooms >= 2:
                rooms.append(Room(
                    id=f"f{floor_num}_common_bath",
                    name="Common Bath",
                    type="bathroom",
                    zone="service",
                    floor=floor_num,
                    min_width=4.5, min_length=6.5,
                    preferred_width=5.5, preferred_length=7.5,
                    max_width=7.5, max_length=9.0,
                    privacy_level="intimate",
                    ventilation_requirement="direct_exterior",
                    color=ROOM_COLORS["bathroom"],
                    rationale="Centrally accessible bathroom serving guest and secondary bedrooms."
                ))
        else:
            # Multi-story ground floor: Guest Bedroom / Bed 1 + Powder/Bath
            b_id = f"f{floor_num}_bedroom_1"
            guest_has_attached = (target_attached >= 2)
            gb_id = f"f{floor_num}_guest_bath" if guest_has_attached else None

            rooms.append(Room(
                id=b_id,
                name="Guest Suite",
                type="guest_bedroom",
                zone="private",
                floor=floor_num,
                min_width=10.5, min_length=11.5,
                preferred_width=12.0, preferred_length=13.5,
                max_width=15.0, max_length=16.0,
                privacy_level="private",
                daylight_requirement="high",
                exterior_wall_requirement=True,
                attached_room_id=gb_id,
                required_adjacencies=[gb_id] if gb_id else [],
                color=ROOM_COLORS["guest_bedroom"],
                rationale="Ground floor guest suite with en-suite bath." if guest_has_attached else "Ground floor guest suite convenient for visitors and elders."
            ))

            if guest_has_attached and gb_id:
                rooms.append(Room(
                    id=gb_id,
                    name="Guest Bath",
                    type="bathroom",
                    zone="private",
                    floor=floor_num,
                    parent_room_id=b_id,
                    attached_room_id=b_id,
                    min_width=4.5, min_length=6.0,
                    preferred_width=5.5, preferred_length=7.5,
                    max_width=7.5, max_length=9.0,
                    privacy_level="intimate",
                    ventilation_requirement="direct_exterior",
                    required_adjacencies=[b_id],
                    color=ROOM_COLORS["bathroom"],
                    rationale="Attached en-suite bathroom for Ground Floor Guest Suite."
                ))

            rooms.append(Room(
                id=f"f{floor_num}_powder_room",
                name="Powder Room",
                type="powder_room",
                zone="service",
                floor=floor_num,
                min_width=4.0, min_length=5.5,
                preferred_width=5.0, preferred_length=6.5,
                max_width=6.5, max_length=8.0,
                privacy_level="semi_private",
                color=ROOM_COLORS["powder_room"],
                rationale="Guest half-bath located near the entry foyer."
            ))

    # Level 2 / Upper floor of multi-story
    elif floor_num == 2:
        # Staircase landing
        rooms.append(Room(
            id=f"f{floor_num}_staircase",
            name="Staircase Landing",
            type="staircase",
            zone="circulation",
            floor=floor_num,
            min_width=7.0, min_length=9.0,
            preferred_width=8.0, preferred_length=10.0,
            max_width=9.5, max_length=12.0,
            privacy_level="semi_private",
            color=ROOM_COLORS["staircase"],
            rationale="Upper floor stair landing opening directly to private family quarters."
        ))
        # Hallway
        rooms.append(Room(
            id=f"f{floor_num}_hallway",
            name="Family Gallery",
            type="hallway",
            zone="circulation",
            floor=floor_num,
            min_width=4.0, min_length=8.0,
            preferred_width=5.0, preferred_length=12.0,
            max_width=7.0, max_length=20.0,
            privacy_level="semi_private",
            color=ROOM_COLORS["hallway"],
            rationale="Upper gallery lounge linking bedroom suites."
        ))
        # Master Bedroom Suite on Level 2
        m_id = f"f{floor_num}_master_bed"
        mb_id = f"f{floor_num}_master_bath"
        master_has_attached = (target_attached >= 1)

        rooms.append(Room(
            id=m_id,
            name="Primary Suite",
            type="master_bedroom",
            zone="private",
            floor=floor_num,
            min_width=12.0, min_length=13.5,
            preferred_width=14.0, preferred_length=16.0,
            max_width=19.0, max_length=22.0,
            privacy_level="intimate",
            daylight_requirement="high",
            exterior_wall_requirement=True,
            attached_room_id=mb_id if master_has_attached else None,
            required_adjacencies=[mb_id] if master_has_attached else [],
            color=ROOM_COLORS["master_bedroom"],
            rationale="Expansive upper-level primary sanctuary with en-suite luxury bath." if master_has_attached else "Expansive upper-level primary sanctuary."
        ))

        if master_has_attached:
            rooms.append(Room(
                id=mb_id,
                name="Primary Bath",
                type="bathroom",
                zone="private",
                floor=floor_num,
                parent_room_id=m_id,
                attached_room_id=m_id,
                min_width=5.5, min_length=7.5,
                preferred_width=6.5, preferred_length=9.0,
                max_width=9.0, max_length=11.0,
                privacy_level="intimate",
                ventilation_requirement="direct_exterior",
                required_adjacencies=[m_id],
                color=ROOM_COLORS["bathroom"],
                rationale="Primary en-suite with double vanity, walk-in shower, and WC."
            ))

        # Remaining bedrooms on Level 2
        # Ground floor has 1 bedroom (f1_bedroom_1), Level 2 has Master (1 bed) + (bedrooms - 2) beds
        remaining_beds = max(0, bedrooms - 2)
        for b_sub in range(remaining_beds):
            b_idx = b_sub + 2
            b_id = f"f{floor_num}_bedroom_{b_idx}"
            bed_has_attached = (target_attached >= 3 + b_sub)
            bath_id = f"f{floor_num}_bath_bed_{b_idx}" if bed_has_attached else None

            rooms.append(Room(
                id=b_id,
                name=f"Bedroom {b_idx}",
                type="bedroom",
                zone="private",
                floor=floor_num,
                min_width=10.0, min_length=11.0,
                preferred_width=11.5, preferred_length=13.0,
                max_width=15.0, max_length=16.0,
                privacy_level="private",
                daylight_requirement="high",
                exterior_wall_requirement=True,
                attached_room_id=bath_id,
                required_adjacencies=[bath_id] if bath_id else [],
                color=ROOM_COLORS["bedroom"],
                rationale=f"Quiet upper-level bedroom with en-suite bath." if bed_has_attached else "Quiet upper-level bedroom with exterior daylight."
            ))

            if bed_has_attached and bath_id:
                rooms.append(Room(
                    id=bath_id,
                    name=f"Bath {b_idx}",
                    type="bathroom",
                    zone="private",
                    floor=floor_num,
                    parent_room_id=b_id,
                    attached_room_id=b_id,
                    min_width=4.5, min_length=6.0,
                    preferred_width=5.5, preferred_length=7.5,
                    max_width=7.5, max_length=9.0,
                    privacy_level="intimate",
                    ventilation_requirement="direct_exterior",
                    required_adjacencies=[b_id],
                    color=ROOM_COLORS["bathroom"],
                    rationale=f"Attached en-suite bathroom for Bedroom {b_idx}."
                ))

        # Upper common bath
        rooms.append(Room(
            id=f"f{floor_num}_common_bath",
            name="Upper Bath",
            type="bathroom",
            zone="service",
            floor=floor_num,
            min_width=4.5, min_length=6.5,
            preferred_width=5.5, preferred_length=7.5,
            max_width=7.5, max_length=9.0,
            privacy_level="intimate",
            color=ROOM_COLORS["bathroom"],
            rationale="Upper level family bathroom."
        ))

    # Special rooms (Pooja, Office, Balcony)
    for s in special_rooms:
        s_lower = s.lower()
        if "pooja" in s_lower and floor_num == 1:
            rooms.append(Room(
                id=f"f{floor_num}_pooja",
                name="Pooja Sanctuary",
                type="pooja",
                zone="special",
                floor=floor_num,
                min_width=4.5, min_length=5.0,
                preferred_width=6.0, preferred_length=6.5,
                max_width=8.0, max_length=8.0,
                privacy_level="semi_private",
                color=ROOM_COLORS["pooja"],
                rationale="Serene sacred sanctuary oriented for peace and meditation."
            ))
        elif ("office" in s_lower or "study" in s_lower) and floor_num == 1:
            rooms.append(Room(
                id=f"f{floor_num}_office",
                name="Home Office",
                type="office",
                zone="special",
                floor=floor_num,
                min_width=8.5, min_length=9.5,
                preferred_width=10.5, preferred_length=12.0,
                max_width=14.0, max_length=15.0,
                privacy_level="semi_private",
                daylight_requirement="high",
                exterior_wall_requirement=True,
                color=ROOM_COLORS["office"],
                rationale="Dedicated acoustic work sanctuary with natural daylight."
            ))

    return rooms


def generate_architectural_house_layout(
    plot_width: float = 40.0,
    plot_length: float = 50.0,
    num_floors: int = 1,
    bedrooms: int = 3,
    bathrooms: float = 2.0,
    attached_bathroom_count: Optional[int] = None,
    style: str = "Modern Scandinavian",
    road_side: str = "south",
    north_direction: Optional[float] = None,
    parking_spaces: int = 1,
    special_rooms: Optional[List[str]] = None,
    open_concept: bool = True,
    vastu_compliant: bool = False,
    user_prompt: str = "",
    variant_seed: Optional[int] = None,
    construction_spec: Optional[ConstructionSpecification] = None,
    landscape_preferences: Optional[LandscapePreferences] = None,
    room_allocations: Optional[List[Any]] = None
) -> HouseLayout:
    """
    Executes the complete site-first architectural design pipeline:
    Site setbacks & envelope -> Functional zoning & topology -> CP-SAT constraint solver ->
    Furniture clearances -> Construction spec wall network & openings -> Multi-floor coordination ->
    Building services & structural planning -> Quantities takeoff & cost estimation -> Canonical HouseLayout.
    """
    plot_width = round(max(15.0, min(200.0, float(plot_width))), 1)
    plot_length = round(max(20.0, min(250.0, float(plot_length))), 1)
    num_floors = max(1, min(3, int(num_floors)))
    parking_spaces = max(0, min(3, int(parking_spaces)))
    road_side = road_side if road_side in ["north", "south", "east", "west"] else "south"

    # Derive sensible total bathrooms if attached_bathroom_count is specified
    if attached_bathroom_count is not None:
        target_att = max(0, min(bedrooms, int(attached_bathroom_count)))
        if target_att < bedrooms:
            bathrooms = max(float(bathrooms), float(target_att + 1.0))
        else:
            bathrooms = max(float(bathrooms), float(target_att))

    # 1. Plan Construction Specification (wall thicknesses, vertical heights, quality tier)
    active_spec = construction_spec or recommend_construction_specification(
        plot_width=plot_width,
        plot_length=plot_length,
        num_floors=num_floors
    )

    # 2. Plan Site with SetbackProfile
    site = plan_site(
        plot_width=plot_width,
        plot_length=plot_length,
        road_side=road_side,
        parking_spaces=parking_spaces
    )
    site.north_direction = compute_north_angle(road_side, north_direction)

    # 3. Structure architectural requirements via Pydantic model
    arch_req = ArchitecturalRequirements(
        plot_width=plot_width,
        plot_length=plot_length,
        num_floors=num_floors,
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        attached_bathroom_count=attached_bathroom_count,
        road_side=road_side,
        north_direction=north_direction,
        parking_spaces=parking_spaces,
        style=style,
        special_rooms=special_rooms or [],
        open_concept=open_concept,
        vastu_compliant=vastu_compliant,
        designer_intent=user_prompt or "",
        room_allocations=room_allocations
    )

    # 4. Formulate Architectural Concept Strategies via Groq Active Reasoning Layer (with caching)
    concepts_key = f"{plot_width}_{plot_length}_{num_floors}_{bedrooms}_{bathrooms}_{road_side}_{style}_{vastu_compliant}_{open_concept}_{sorted(special_rooms or [])}_{user_prompt}"
    if concepts_key in _CONCEPTS_CACHE:
        ai_concepts = _CONCEPTS_CACHE[concepts_key]
    else:
        ai_concepts_res = generate_architectural_concepts_with_groq(arch_req)
        ai_concepts = ai_concepts_res.concepts if ai_concepts_res else []
        if ai_concepts:
            _CONCEPTS_CACHE[concepts_key] = ai_concepts

    floors_list: List[FloorPlan] = []
    all_rooms_combined: List[Room] = []
    champion_scores: Optional[ArchitecturalScores] = None
    champion_validation: Optional[ArchitecturalValidation] = None
    groq_critique_data: Dict[str, Any] = {}
    ground_stair_rect: Optional[Rect] = None

    for floor_idx in range(1, num_floors + 1):
        floor_name = "Ground Floor" if floor_idx == 1 else ("First Floor" if floor_idx == 2 else ("Second Floor" if floor_idx == 3 else f"Level {floor_idx}"))
        
        # Build room program for this floor
        floor_rooms = build_room_program(
            floor_num=floor_idx,
            total_floors=num_floors,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            attached_bathroom_count=attached_bathroom_count,
            special_rooms=special_rooms,
            open_concept=open_concept,
            room_allocations=room_allocations
        )

        # Generate architectural topological schemes (integrating Groq concept strategies)
        schemes = generate_architectural_schemes(
            rooms=floor_rooms,
            site=site,
            vastu_compliant=vastu_compliant,
            ai_concepts=ai_concepts
        )

        # Solve candidates with OR-Tools CP-SAT and evaluate
        pinned_rooms: Dict[str, Rect] = {}
        if floor_idx > 1 and ground_stair_rect:
            pinned_rooms[f"f{floor_idx}_staircase"] = ground_stair_rect

        solved_candidates = []
        candidate_summaries = []

        for s in schemes:
            candidate = solve_spatial_layout(
                floor_rooms, site, s,
                pinned_rooms=pinned_rooms if pinned_rooms else None,
                variant_seed=variant_seed
            )
            if not candidate or not candidate.is_valid:
                if pinned_rooms:
                    candidate = solve_spatial_layout(
                        floor_rooms, site, s,
                        variant_seed=variant_seed
                    )

            if candidate and candidate.is_valid:
                # Deduplicate walls with real thickness from ConstructionSpecification
                walls, doors, windows = generate_wall_network_and_openings(
                    candidate.rooms,
                    site,
                    wall_height=active_spec.wall_height_ft,
                    construction_spec=active_spec
                )

                # Place furniture aligned with walls and clear of doors/windows
                furn_scores = []
                for r in candidate.rooms:
                    f_items, f_score, _ = validate_and_place_furniture(r, doors=doors, windows=windows)
                    r.furniture = f_items
                    r.furniture_ids = [f.id for f in f_items]
                    furn_scores.append(f_score)

                # Compute real architectural scores
                scores, validation = calculate_architectural_scores(
                    rooms=candidate.rooms,
                    site=site,
                    walls=walls,
                    doors=doors,
                    windows=windows,
                    furniture_scores=furn_scores,
                    vastu_enabled=vastu_compliant
                )

                candidate_obj = {
                    "candidate": candidate,
                    "walls": walls,
                    "doors": doors,
                    "windows": windows,
                    "scores": scores,
                    "validation": validation,
                    "summary": {
                        "scheme_id": s.scheme_id,
                        "name": s.name,
                        "description": s.description,
                        "overall_score": scores.overall_score,
                        "circulation_score": scores.circulation_score,
                        "privacy_score": scores.privacy_score,
                        "daylight_score": scores.daylight_score,
                        "space_efficiency_score": scores.space_efficiency_score,
                        "furniture_fit_score": scores.furniture_fit_score,
                        "vastu_score": scores.vastu_score,
                        "warnings": validation.warnings
                    }
                }
                solved_candidates.append(candidate_obj)
                candidate_summaries.append(candidate_obj["summary"])

        if not solved_candidates:
            default_scheme = schemes[0]
            candidate = solve_spatial_layout(floor_rooms, site, default_scheme, time_limit_sec=4.0, variant_seed=variant_seed)
            if not candidate or not candidate.is_valid:
                empty_val = ArchitecturalValidation(
                    is_valid=False,
                    errors=[f"Plot buildable envelope ({site.buildable_envelope.width}x{site.buildable_envelope.length}ft) is insufficient for {bedrooms} bedrooms and requested spaces."]
                )
                return HouseLayout(
                    id=f"layout_{uuid.uuid4().hex[:8]}",
                    title="Design Constraint Conflict",
                    designer_rationale="The requested room program exceeds the buildable envelope of the plot. Please increase plot size or reduce bedroom count.",
                    plot_width=plot_width,
                    plot_length=plot_length,
                    num_floors=num_floors,
                    site=site,
                    validation=empty_val,
                    rooms=[],
                    construction_spec=active_spec,
                    stats=HouseStats(
                        total_area_sqft=0.0,
                        living_area_sqft=0.0,
                        width_ft=plot_width,
                        length_ft=plot_length,
                        num_floors=num_floors,
                        bedroom_count=bedrooms,
                        bathroom_count=bathrooms,
                        aspect_ratio=round(plot_width / max(1.0, plot_length), 2)
                    )
                )
            else:
                walls, doors, windows = generate_wall_network_and_openings(
                    candidate.rooms,
                    site,
                    wall_height=active_spec.wall_height_ft,
                    construction_spec=active_spec
                )
                furn_scores = []
                for r in candidate.rooms:
                    f_items, f_score, _ = validate_and_place_furniture(r, doors=doors, windows=windows)
                    r.furniture = f_items
                    r.furniture_ids = [f.id for f in f_items]
                    furn_scores.append(f_score)

                scores, validation = calculate_architectural_scores(
                    rooms=candidate.rooms,
                    site=site,
                    walls=walls,
                    doors=doors,
                    windows=windows,
                    furniture_scores=furn_scores,
                    vastu_enabled=vastu_compliant
                )
                candidate_obj = {
                    "candidate": candidate,
                    "walls": walls,
                    "doors": doors,
                    "windows": windows,
                    "scores": scores,
                    "validation": validation,
                    "summary": {
                        "scheme_id": default_scheme.scheme_id,
                        "name": default_scheme.name,
                        "description": default_scheme.description,
                        "overall_score": scores.overall_score,
                        "circulation_score": scores.circulation_score,
                        "privacy_score": scores.privacy_score,
                        "daylight_score": scores.daylight_score,
                        "space_efficiency_score": scores.space_efficiency_score,
                        "furniture_fit_score": scores.furniture_fit_score,
                        "vastu_score": scores.vastu_score,
                        "warnings": validation.warnings
                    }
                }
                solved_candidates.append(candidate_obj)
                candidate_summaries.append(candidate_obj["summary"])

        # Deterministic Candidate Ranking
        def candidate_rank_score(c):
            base = c["scores"].overall_score
            v_val = (c["scores"].vastu_score or 80.0) if vastu_compliant else 0.0
            return base + 0.15 * v_val

        solved_candidates.sort(key=candidate_rank_score, reverse=True)

        prompt_with_context = user_prompt or f"{bedrooms} bedroom {style} home"
        if vastu_compliant and "vastu" not in prompt_with_context.lower():
            prompt_with_context += " (Strict Vastu Shastra orientation compliance required)"

        if vastu_compliant:
            winner_id = max(solved_candidates, key=lambda c: (c["scores"].vastu_score or 0.0))["summary"]["scheme_id"]
        elif floor_idx == 1 and not variant_seed:
            critique_key = f"{concepts_key}_{len(candidate_summaries)}"
            if critique_key in _CRITIQUE_CACHE:
                groq_critique_data = _CRITIQUE_CACHE[critique_key]
            else:
                groq_critique_obj = critique_architectural_candidates_with_groq(
                    candidate_summaries=candidate_summaries,
                    user_prompt=prompt_with_context
                )
                groq_critique_data = groq_critique_obj.model_dump() if hasattr(groq_critique_obj, "model_dump") else groq_critique_obj
                _CRITIQUE_CACHE[critique_key] = groq_critique_data

            winner_id = groq_critique_data.get("selected_candidate", solved_candidates[0]["summary"]["scheme_id"])
        else:
            winner_id = solved_candidates[0]["summary"]["scheme_id"]

        chosen = next((c for c in solved_candidates if c["summary"]["scheme_id"] == winner_id), solved_candidates[0])

        champion_rooms = chosen["candidate"].rooms
        champion_walls = chosen["walls"]
        champion_doors = chosen["doors"]
        champion_windows = chosen["windows"]
        champion_scores = chosen["scores"]
        champion_validation = chosen["validation"]

        # Format dimension labels
        for r in champion_rooms:
            if r.rect:
                r.dimensions_label = f"{round(r.rect.width, 1)}' × {round(r.rect.length, 1)}'"
                r.area_sqft = r.rect.area

        # Staircase object if multi-floor
        staircase_obj = None
        stair_room = next((r for r in champion_rooms if r.type == "staircase"), None)
        if stair_room and stair_room.rect:
            if floor_idx == 1:
                ground_stair_rect = stair_room.rect

            stair_dir = "up" if floor_idx == 1 else "down"
            staircase_obj = Stair(
                id=f"stair_f{floor_idx}",
                stair_id=f"stair_f{floor_idx}",
                floor_from=floor_idx,
                floor_to=min(num_floors, floor_idx + 1) if floor_idx == 1 else max(1, floor_idx - 1),
                direction=stair_dir,
                rect=stair_room.rect,
                width=stair_room.rect.width,
                riser_inches=7.0,
                tread_inches=10.5,
                num_steps=16,
                stair_type="straight_run",
                has_landing=True,
                landing=True,
                stringer=True,
                handrail=True,
                balustrade=True,
                head_clearance_ft=7.0,
                railing_metadata={
                    "material": "hardwood_glass",
                    "handrail_height_inches": 36.0,
                    "baluster_spacing_inches": 4.0,
                    "load_bearing": True
                }
            )

        elevation = round((floor_idx - 1) * active_spec.floor_to_floor_height_ft, 2)
        floor_plan = FloorPlan(
            floor_id=f"floor_{floor_idx}",
            floor_number=floor_idx,
            floor_name=floor_name,
            elevation_ft=elevation,
            floor_to_floor_height_ft=active_spec.floor_to_floor_height_ft,
            clear_ceiling_height_ft=active_spec.clear_ceiling_height_ft,
            wall_height_ft=active_spec.wall_height_ft,
            slab_thickness_ft=active_spec.slab_thickness_ft,
            rooms=champion_rooms,
            walls=champion_walls,
            doors=champion_doors,
            windows=champion_windows,
            staircase=staircase_obj or (stair_room.rect if stair_room else None),
            exterior_walls=[w for w in champion_walls if w.wall_type == "exterior"],
            interior_walls=[w for w in champion_walls if w.wall_type == "interior"]
        )
        floors_list.append(floor_plan)
        all_rooms_combined.extend(champion_rooms)

    # Synthesize Complete Canonical HouseLayout
    ground_floor = floors_list[0]
    total_home_area = round(sum(r.rect.area for r in all_rooms_combined if r.rect), 1)
    living_home_area = round(sum(r.rect.area for r in all_rooms_combined if r.rect and r.type not in ["patio", "parking"]), 1)
    actual_bed_count = sum(1 for r in all_rooms_combined if "bedroom" in r.type)
    actual_bath_count = round(sum(1.0 if r.type == "bathroom" else 0.5 for r in all_rooms_combined if "bath" in r.type or "powder" in r.type), 1)

    ground_built_area = sum(r.rect.area for r in ground_floor.rooms if r.rect and r.type != "parking")
    coverage_percentage = round((ground_built_area / max(1.0, site.total_plot_area)) * 100.0, 1)

    stats = HouseStats(
        total_area_sqft=total_home_area,
        living_area_sqft=living_home_area,
        width_ft=plot_width,
        length_ft=plot_length,
        num_floors=num_floors,
        bedroom_count=actual_bed_count,
        bathroom_count=actual_bath_count,
        aspect_ratio=round(plot_width / plot_length, 2),
        coverage_percentage=coverage_percentage
    )

    floor_text = f"{num_floors}-Story" if num_floors > 1 else "Single-Story"
    critic_reasoning = groq_critique_data.get("reasoning", "")
    designer_rationale = (
        f"{critic_reasoning} "
        f"Site-first planning with {site.road_side.capitalize()} frontage, {site.setbacks.front}ft front setback, "
        f"and {actual_bed_count} bedrooms across {total_home_area} sq ft."
    ).strip()

    entry_pt = Point2D(x=round(plot_width / 2.0, 1), y=site.setbacks.rear if road_side == "north" else (plot_length - site.setbacks.front))

    layout_id = f"layout_{uuid.uuid4().hex[:8]}"
    layout = HouseLayout(
        id=layout_id,
        project_id=layout_id,
        version_number=1,
        title=f"{actual_bed_count} Bed · {actual_bath_count} Bath {floor_text} {style} Residence",
        designer_rationale=designer_rationale,
        plot_width=plot_width,
        plot_length=plot_length,
        num_floors=num_floors,
        site=site,
        stats=stats,
        scores=champion_scores,
        validation=champion_validation,
        vastu_result=champion_scores.vastu_result if (champion_scores and hasattr(champion_scores, "vastu_result")) else None,
        construction_spec=active_spec,
        floors=floors_list,
        metadata={
            "groq_critique": groq_critique_data,
            "style": style,
            "vastu_compliant": vastu_compliant,
            "road_side": road_side
        },
        # Backwards compatible top-level ground floor fields
        rooms=ground_floor.rooms,
        walls=ground_floor.walls,
        doors=ground_floor.doors,
        windows=ground_floor.windows,
        exterior_walls=ground_floor.exterior_walls,
        interior_walls=ground_floor.interior_walls,
        entry_point={"x": entry_pt.x, "y": entry_pt.y, "direction": 0.0}
    )

    # 5. Multi-floor MEP & Structural Planning
    layout.building_services = plan_building_services(floors_list, plot_width, plot_length)
    layout.structural_planning = plan_preliminary_structure(
        floors_list, active_spec, site=site, plot_width=plot_width, plot_length=plot_length, layout=layout
    )
    layout.structural_system = layout.structural_planning.structural_system

    # 6. Physical Material Takeoff & Bottom-Up Cost Estimation
    layout.quantities = calculate_material_quantities(layout, active_spec)
    layout.cost_estimate = estimate_construction_cost(layout, layout.quantities)

    # 7. Deterministic Site Landscaping
    try:
        from landscape.landscape_engine import generate_landscape_plan
        layout.landscape = generate_landscape_plan(layout, preferences=landscape_preferences)
    except Exception as e:
        print(f"[LANDSCAPE WARNING] Could not generate landscape plan: {e}")

    return layout
