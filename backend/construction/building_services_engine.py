"""
Building Services Coordination Engine Module
Coordinates residential vertical MEP services across single and multi-story floor plans:
- Plumbing Stacks (identifying wet-room vertical stacking: bath over bath, kitchen over utility)
- Electrical Risers / Shafts
- Drainage Drop Points
- Vertical Shaft Core Coordination
- Plumbing Stacking Efficiency Scoring

DISCLAIMER: Preliminary architectural MEP planning. Final plumbing/electrical designs must be
engineered according to local building codes and municipal authority bylaws.
"""

from typing import List, Dict, Any, Optional
import math
from models import FloorPlan, Room, BuildingServices, Point2D


def plan_building_services(
    floors: List[FloorPlan],
    plot_width: float,
    plot_length: float
) -> BuildingServices:
    """
    Analyzes room locations across all floors and generates preliminary
    plumbing stacks, electrical riser shafts, and drainage points.
    Scores vertical stacking efficiency.
    """
    plumbing_stacks: List[Dict[str, Any]] = []
    electrical_shafts: List[Dict[str, Any]] = []
    vertical_cores: List[Dict[str, Any]] = []
    drainage_points: List[Dict[str, Any]] = []
    service_zones: List[Dict[str, Any]] = []

    # Identify wet rooms on each floor
    wet_room_types = {"bathroom", "powder_room", "kitchen", "utility"}
    floor_wet_rooms: Dict[int, List[Room]] = {}
    for f in floors:
        wet_rooms = [r for r in f.rooms if r.type in wet_room_types and r.rect]
        floor_wet_rooms[f.floor_number] = wet_rooms

    stack_counter = 1
    aligned_stacks = 0
    total_upper_wet_rooms = 0

    # Ground floor wet rooms establish base plumbing stacks
    ground_wet = floor_wet_rooms.get(1, [])
    for r in ground_wet:
        if not r.rect:
            continue
        stack_id = f"stack_plumb_{stack_counter:02d}"
        stack_counter += 1
        
        # Position stack in outer corner of wet room
        stack_x = round(r.rect.right - 0.5, 2)
        stack_y = round(r.rect.bottom - 0.5, 2)
        serviced = [f"F1:{r.id}"]

        # Check if any upper floor wet room aligns within 6.0 ft
        for f_num in range(2, len(floors) + 1):
            upper_wet = floor_wet_rooms.get(f_num, [])
            for ur in upper_wet:
                if not ur.rect:
                    continue
                dist = math.hypot(ur.rect.center.x - r.rect.center.x, ur.rect.center.y - r.rect.center.y)
                if dist <= 6.0:
                    serviced.append(f"F{f_num}:{ur.id}")
                    aligned_stacks += 1

        plumbing_stacks.append({
            "stack_id": stack_id,
            "type": "soil_and_waste_stack",
            "x": stack_x,
            "y": stack_y,
            "diameter_in": 4.0,
            "serviced_spaces": serviced,
            "is_vertical_stack": len(serviced) > 1
        })

        drainage_points.append({
            "drain_id": f"gully_trap_{stack_counter:02d}",
            "x": stack_x,
            "y": stack_y,
            "type": "inspection_chamber_connection"
        })

    # Count total upper floor wet rooms
    for f_num in range(2, len(floors) + 1):
        total_upper_wet_rooms += len(floor_wet_rooms.get(f_num, []))

    if total_upper_wet_rooms > 0:
        stacking_score = min(100.0, max(60.0, round((aligned_stacks / max(1, total_upper_wet_rooms)) * 100.0, 1)))
    else:
        stacking_score = 95.0

    # Electrical main riser: near entry foyer or staircase
    stair_rooms = [r for r in floors[0].rooms if r.type == "staircase" and r.rect] if floors else []
    foyer_rooms = [r for r in floors[0].rooms if r.type == "entry_foyer" and r.rect] if floors else []

    if stair_rooms:
        sr = stair_rooms[0]
        elec_x, elec_y = round(sr.rect.x + 0.5, 2), round(sr.rect.y + 0.5, 2)
    elif foyer_rooms:
        fr = foyer_rooms[0]
        elec_x, elec_y = round(fr.rect.x + 0.5, 2), round(fr.rect.y + 0.5, 2)
    else:
        elec_x, elec_y = 3.0, 3.0

    electrical_shafts.append({
        "shaft_id": "elec_riser_01",
        "x": elec_x,
        "y": elec_y,
        "type": "vertical_distribution_riser",
        "description": "Main electrical and low-voltage distribution conduit core."
    })

    vertical_cores.append({
        "core_id": "mep_core_01",
        "location": {"x": elec_x, "y": elec_y},
        "shaft_count": len(plumbing_stacks) + len(electrical_shafts),
        "coordination_status": "aligned"
    })

    return BuildingServices(
        plumbing_stacks=plumbing_stacks,
        electrical_shafts=electrical_shafts,
        vertical_cores=vertical_cores,
        drainage_points=drainage_points,
        service_zones=service_zones,
        stacking_efficiency_score=stacking_score,
        notes=f"Building services preliminary layout coordinated. Vertical stacking efficiency: {stacking_score}%."
    )
