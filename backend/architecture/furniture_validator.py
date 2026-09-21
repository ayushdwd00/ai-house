"""
Furniture Validator Module
Architectural furniture program placement and clearance validation.
Ensures habitable rooms are functionally valid with proper human circulation clearances.
"""

from typing import List, Dict, Tuple, Optional
from shapely.geometry import box, Polygon
from models import Room, FurnitureItem, Rect, Point2D

def validate_and_place_furniture(room: Room) -> Tuple[List[FurnitureItem], float, List[str]]:
    """
    Attempts to fit standard architectural furniture programs inside the room.
    Returns (items, fit_score, warnings).
    """
    if not room.rect:
        return [], 0.0, ["Room has no geometry"]

    rx, ry = room.rect.x, room.rect.y
    rw, rl = room.rect.width, room.rect.length
    items: List[FurnitureItem] = []
    warnings: List[str] = []
    
    # 1. Master Bedroom Program (King Bed, 2 Side Tables, Wardrobe)
    if room.type == "master_bedroom":
        bed_w, bed_l = 6.5, 6.5
        if rw < 10.0 or rl < 11.0:
            warnings.append(f"Master Bedroom ({rw}x{rl}ft) is tight for King Bed suite.")
        
        # Place bed against top or left wall
        bed_x = rx + (rw - bed_w) / 2.0
        bed_y = ry + 1.5  # Clearance from back wall
        items.append(FurnitureItem(
            id=f"{room.id}_bed",
            type="king_bed",
            room_id=room.id,
            position=Point2D(x=round(bed_x, 2), y=round(bed_y, 2)),
            dimensions=Point2D(x=bed_w, y=bed_l),
            clearance_requirements={"front": 3.0, "sides": 2.0}
        ))
        
        # Side tables
        items.append(FurnitureItem(
            id=f"{room.id}_nightstand_1",
            type="side_table",
            room_id=room.id,
            position=Point2D(x=round(bed_x - 1.8, 2), y=round(bed_y, 2)),
            dimensions=Point2D(x=1.5, y=1.5)
        ))
        items.append(FurnitureItem(
            id=f"{room.id}_nightstand_2",
            type="side_table",
            room_id=room.id,
            position=Point2D(x=round(bed_x + bed_w + 0.3, 2), y=round(bed_y, 2)),
            dimensions=Point2D(x=1.5, y=1.5)
        ))
        
        # Wardrobe against opposite wall or side
        wardrobe_w = min(8.0, max(4.0, rw - 2.0))
        items.append(FurnitureItem(
            id=f"{room.id}_wardrobe",
            type="wardrobe",
            room_id=room.id,
            position=Point2D(x=round(rx + 1.0, 2), y=round(ry + rl - 2.2, 2)),
            dimensions=Point2D(x=round(wardrobe_w, 2), y=2.0),
            clearance_requirements={"front": 3.0}
        ))

    # 2. Standard Bedroom Program (Queen Bed, 1 Side Table, Wardrobe)
    elif room.type in ["bedroom", "guest_bedroom"]:
        bed_w, bed_l = 5.0, 6.5
        bed_x = rx + 1.5
        bed_y = ry + 1.5
        items.append(FurnitureItem(
            id=f"{room.id}_bed",
            type="queen_bed",
            room_id=room.id,
            position=Point2D(x=round(bed_x, 2), y=round(bed_y, 2)),
            dimensions=Point2D(x=bed_w, y=bed_l),
            clearance_requirements={"front": 2.5, "sides": 1.5}
        ))
        items.append(FurnitureItem(
            id=f"{room.id}_nightstand",
            type="side_table",
            room_id=room.id,
            position=Point2D(x=round(bed_x + bed_w + 0.3, 2), y=round(bed_y, 2)),
            dimensions=Point2D(x=1.5, y=1.5)
        ))
        items.append(FurnitureItem(
            id=f"{room.id}_wardrobe",
            type="wardrobe",
            room_id=room.id,
            position=Point2D(x=round(rx + rw - 2.2, 2), y=round(ry + 1.5, 2)),
            dimensions=Point2D(x=2.0, y=min(6.0, rl - 3.0)),
            clearance_requirements={"front": 2.5}
        ))

    # 3. Living Room Program (3-Seater Sofa, Coffee Table, Armchairs, TV Unit)
    elif room.type in ["living_room", "family_lounge"]:
        sofa_w, sofa_l = 7.0, 3.0
        sofa_x = rx + (rw - sofa_w) / 2.0
        sofa_y = ry + 2.0
        items.append(FurnitureItem(
            id=f"{room.id}_sofa",
            type="sofa",
            room_id=room.id,
            position=Point2D(x=round(sofa_x, 2), y=round(sofa_y, 2)),
            dimensions=Point2D(x=sofa_w, y=sofa_l),
            clearance_requirements={"front": 2.0}
        ))
        # Coffee Table
        items.append(FurnitureItem(
            id=f"{room.id}_coffee_table",
            type="coffee_table",
            room_id=room.id,
            position=Point2D(x=round(sofa_x + 1.5, 2), y=round(sofa_y + 4.0, 2)),
            dimensions=Point2D(x=4.0, y=2.0)
        ))
        # Media / TV Console against opposite wall
        tv_w = min(8.0, rw - 2.0)
        items.append(FurnitureItem(
            id=f"{room.id}_tv_console",
            type="tv_unit",
            room_id=room.id,
            position=Point2D(x=round(rx + (rw - tv_w) / 2.0, 2), y=round(ry + rl - 1.8, 2)),
            dimensions=Point2D(x=round(tv_w, 2), y=1.5)
        ))

    # 4. Dining Room Program (Dining Table, 6 Chairs, Buffet Counter)
    elif room.type == "dining":
        dt_w, dt_l = 5.5, 3.2
        dt_x = rx + (rw - dt_w) / 2.0
        dt_y = ry + (rl - dt_l) / 2.0
        items.append(FurnitureItem(
            id=f"{room.id}_table",
            type="dining_table",
            room_id=room.id,
            position=Point2D(x=round(dt_x, 2), y=round(dt_y, 2)),
            dimensions=Point2D(x=dt_w, y=dt_l),
            clearance_requirements={"all_around": 3.0}
        ))

    # 5. Kitchen Program (Countertop, Hob, Sink, Refrigerator)
    elif room.type == "kitchen":
        # Continuous counter along top wall
        counter_len = max(6.0, rw - 1.0)
        items.append(FurnitureItem(
            id=f"{room.id}_counter",
            type="kitchen_counter",
            room_id=room.id,
            position=Point2D(x=round(rx + 0.5, 2), y=round(ry + 0.5, 2)),
            dimensions=Point2D(x=round(counter_len, 2), y=2.0)
        ))
        # Hob on counter
        items.append(FurnitureItem(
            id=f"{room.id}_hob",
            type="cooktop",
            room_id=room.id,
            position=Point2D(x=round(rx + 1.5, 2), y=round(ry + 0.6, 2)),
            dimensions=Point2D(x=2.5, y=1.8)
        ))
        # Sink on counter
        items.append(FurnitureItem(
            id=f"{room.id}_sink",
            type="kitchen_sink",
            room_id=room.id,
            position=Point2D(x=round(rx + counter_len - 3.2, 2), y=round(ry + 0.6, 2)),
            dimensions=Point2D(x=2.5, y=1.8)
        ))
        # Refrigerator in corner
        items.append(FurnitureItem(
            id=f"{room.id}_fridge",
            type="refrigerator",
            room_id=room.id,
            position=Point2D(x=round(rx + rw - 3.2, 2), y=round(ry + rl - 3.2, 2)),
            dimensions=Point2D(x=2.8, y=2.8),
            clearance_requirements={"front": 3.0}
        ))

    # 6. Bathroom Program (WC, Vanity Basin, Shower Enclosure)
    elif room.type in ["bathroom", "powder_room"]:
        # Vanity Basin
        items.append(FurnitureItem(
            id=f"{room.id}_basin",
            type="basin",
            room_id=room.id,
            position=Point2D(x=round(rx + 0.5, 2), y=round(ry + 0.5, 2)),
            dimensions=Point2D(x=2.2, y=1.8)
        ))
        # Water Closet (WC)
        items.append(FurnitureItem(
            id=f"{room.id}_wc",
            type="toilet",
            room_id=room.id,
            position=Point2D(x=round(rx + 0.5, 2), y=round(ry + rl - 2.8, 2)),
            dimensions=Point2D(x=1.8, y=2.2),
            clearance_requirements={"front": 2.0}
        ))
        if room.type == "bathroom":
            # Shower stall
            items.append(FurnitureItem(
                id=f"{room.id}_shower",
                type="shower",
                room_id=room.id,
                position=Point2D(x=round(rx + rw - 3.2, 2), y=round(ry + 0.5, 2)),
                dimensions=Point2D(x=3.0, y=3.0)
            ))

    # Calculate actual clearance validity using Shapely containment and clearances
    room_poly = box(rx, ry, rx + rw, ry + rl)
    colliding_count = 0
    
    for itm in items:
        itm_poly = box(
            itm.position.x,
            itm.position.y,
            itm.position.x + itm.dimensions.x,
            itm.position.y + itm.dimensions.y
        )
        if not room_poly.buffer(0.1).contains(itm_poly):
            colliding_count += 1
            warnings.append(f"Fixture '{itm.type}' in {room.name} extends beyond room boundary.")

        # Check required clearance zones
        if itm.clearance_requirements:
            front_clr = itm.clearance_requirements.get("front", 0.0)
            if front_clr > 0.0:
                clr_box = box(
                    itm.position.x,
                    itm.position.y + itm.dimensions.y,
                    itm.position.x + itm.dimensions.x,
                    itm.position.y + itm.dimensions.y + front_clr
                )
                if not room_poly.buffer(0.1).contains(clr_box):
                    warnings.append(f"Clearance for '{itm.type}' in {room.name} requires {front_clr}ft path.")

    # Geometric fit score: 100 base minus penalties
    if not items:
        score = 85.0
    else:
        score = max(30.0, 100.0 - (colliding_count * 25.0) - (len(warnings) * 10.0))

    return items, round(score, 1), warnings


def get_minimum_dimensions_for_furniture(room_type: str) -> Tuple[float, float]:
    """
    Returns minimum (width, length) required in feet to comfortably house
    the standard architectural furniture program with proper clearances.
    """
    if room_type == "master_bedroom":
        # King bed (6.5') + 2 side tables (3.0') + side circulation (2.0') = 11.5' width; 6.5' bed + 3' front + 2' wardrobe = 11.5' length
        return (11.5, 12.0)
    elif room_type in ["bedroom", "guest_bedroom"]:
        # Queen bed (5.0') + side table (1.5') + circulation (2.5') = 9.0' width; 6.5' bed + 2.5' front + 2' wardrobe = 11.0' length
        return (9.5, 10.5)
    elif room_type in ["living_room", "family_lounge"]:
        # Sofa (7.0') + 3.0' circulation = 10.0' width; Sofa + table + TV path = 12.0' length
        return (12.0, 13.0)
    elif room_type == "dining":
        # Table (3.5') + 2x 3.0' chair pull-out = 9.5' width; Table (5.5') + 2x 3.0' pullout = 11.5' length
        return (9.5, 11.0)
    elif room_type == "kitchen":
        # Counter (2.0') + work triangle walkway (3.5') + opposite wall/fridge (2.5') = 8.0' width
        return (7.5, 9.0)
    elif room_type in ["bathroom", "powder_room"]:
        # Basin + WC + Shower stall = 4.5' width x 7.0' length
        return (4.5, 7.0)
    elif room_type == "staircase":
        # Flight (3.5') x 2 + central well (0.5') = 7.5' width; 8 treads x 10.5" + landing (3.5') = 10.5' length
        return (7.0, 10.5)
    return (7.0, 7.0)

