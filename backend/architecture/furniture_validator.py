"""
Furniture Validator Module
Architectural furniture program placement and clearance validation.
Ensures habitable rooms are functionally valid with proper human circulation clearances.
"""

from typing import List, Dict, Tuple, Optional, Any
from shapely.geometry import box, Polygon
from models import Room, FurnitureItem, Rect, Point2D

def validate_and_place_furniture(
    room: Room,
    doors: Optional[List[Any]] = None,
    windows: Optional[List[Any]] = None
) -> Tuple[List[FurnitureItem], float, List[str]]:
    """
    Intelligently aligns standard architectural furniture programs inside the room
    aligned with room walls, functional groupings, and avoiding door swing zones.
    Returns (items, fit_score, warnings).
    """
    if not room.rect:
        return [], 0.0, ["Room has no geometry"]

    rx, ry = room.rect.x, room.rect.y
    rw, rl = room.rect.width, room.rect.length
    items: List[FurnitureItem] = []
    warnings: List[str] = []
    room_poly = box(rx, ry, rx + rw, ry + rl)

    # Collect door clearance / swing zones inside or touching this room
    door_conflict_boxes: List[Polygon] = []
    if doors:
        for d in doors:
            # Check if door belongs or connects to this room
            is_connected = False
            if hasattr(d, "room_id") and d.room_id == room.id:
                is_connected = True
            elif hasattr(d, "connected_room_id") and d.connected_room_id == room.id:
                is_connected = True
            elif hasattr(d, "from_room_id") and d.from_room_id == room.id:
                is_connected = True
            elif hasattr(d, "to_room_id") and d.to_room_id == room.id:
                is_connected = True
            elif hasattr(d, "connects_room_ids") and room.id in (d.connects_room_ids or []):
                is_connected = True

            if is_connected:
                # Door swing zone (3ft radius around door position)
                d_x = getattr(d, "x", (getattr(d, "x1", 0.0) + getattr(d, "x2", 0.0)) / 2.0)
                d_y = getattr(d, "y", (getattr(d, "y1", 0.0) + getattr(d, "y2", 0.0)) / 2.0)
                d_box = box(d_x - 1.8, d_y - 1.8, d_x + 1.8, d_y + 1.8)
                door_conflict_boxes.append(d_box)

    def is_in_door_swing(fx: float, fy: float, fw: float, fl: float) -> bool:
        f_box = box(fx, fy, fx + fw, fy + fl)
        for d_box in door_conflict_boxes:
            if f_box.intersects(d_box):
                return True
        return False

    # 1. Master Bedroom Program (King Bed, 2 Side Tables, Wardrobe)
    if room.type == "master_bedroom":
        bed_w, bed_l = 6.5, 6.5
        nightstand_w, nightstand_l = 1.6, 1.6
        wardrobe_w, wardrobe_d = min(7.5, max(4.5, rw - 3.0)), 2.0

        # Pattern A: Bed on Top (North) wall facing South
        pos_a_x = rx + (rw - bed_w) / 2.0
        pos_a_y = ry + 0.4
        
        # Pattern B: Bed on Left (West) wall facing East
        pos_b_x = rx + 0.4
        pos_b_y = ry + (rl - bed_w) / 2.0

        # Check door clearance for pattern A vs B
        if not is_in_door_swing(pos_a_x, pos_a_y, bed_w, bed_l) and rl >= 10.5:
            # Place Bed against North wall
            items.append(FurnitureItem(
                id=f"{room.id}_bed",
                type="king_bed",
                floor_id=getattr(room, "floor_id", "floor_1"),
                room_id=room.id,
                x=round(pos_a_x + bed_w / 2.0, 2),
                y=round(pos_a_y + bed_l / 2.0, 2),
                width=bed_w,
                length=bed_l,
                depth=bed_l,
                height=2.8,
                rotation=0.0,
                orientation="north",
                clearance_requirements={"front": 3.0, "sides": 2.0}
            ))
            # Two Symmetrical Nightstands
            items.append(FurnitureItem(
                id=f"{room.id}_nightstand_1",
                type="side_table",
                floor_id=getattr(room, "floor_id", "floor_1"),
                room_id=room.id,
                x=round(pos_a_x - nightstand_w / 2.0 - 0.2, 2),
                y=round(pos_a_y + nightstand_l / 2.0, 2),
                width=nightstand_w,
                length=nightstand_l,
                depth=nightstand_l,
                height=1.8,
                rotation=0.0
            ))
            items.append(FurnitureItem(
                id=f"{room.id}_nightstand_2",
                type="side_table",
                floor_id=getattr(room, "floor_id", "floor_1"),
                room_id=room.id,
                x=round(pos_a_x + bed_w + nightstand_w / 2.0 + 0.2, 2),
                y=round(pos_a_y + nightstand_l / 2.0, 2),
                width=nightstand_w,
                length=nightstand_l,
                depth=nightstand_l,
                height=1.8,
                rotation=0.0
            ))
            # Wardrobe aligned against opposite or lateral wall
            wardrobe_y = ry + rl - wardrobe_d - 0.4
            wardrobe_x = rx + 1.0
            if not is_in_door_swing(wardrobe_x, wardrobe_y, wardrobe_w, wardrobe_d):
                items.append(FurnitureItem(
                    id=f"{room.id}_wardrobe",
                    type="wardrobe",
                    floor_id=getattr(room, "floor_id", "floor_1"),
                    room_id=room.id,
                    x=round(wardrobe_x + wardrobe_w / 2.0, 2),
                    y=round(wardrobe_y + wardrobe_d / 2.0, 2),
                    width=round(wardrobe_w, 2),
                    length=wardrobe_d,
                    depth=wardrobe_d,
                    height=7.0,
                    rotation=0.0,
                    clearance_requirements={"front": 2.5}
                ))
        else:
            # Place Bed against West wall
            items.append(FurnitureItem(
                id=f"{room.id}_bed",
                type="king_bed",
                floor_id=getattr(room, "floor_id", "floor_1"),
                room_id=room.id,
                x=round(pos_b_x + bed_l / 2.0, 2),
                y=round(pos_b_y + bed_w / 2.0, 2),
                width=bed_l,
                length=bed_w,
                depth=bed_l,
                height=2.8,
                rotation=90.0,
                orientation="west",
                clearance_requirements={"front": 3.0, "sides": 2.0}
            ))
            # Nightstands on lateral sides
            items.append(FurnitureItem(
                id=f"{room.id}_nightstand_1",
                type="side_table",
                floor_id=getattr(room, "floor_id", "floor_1"),
                room_id=room.id,
                x=round(pos_b_x + nightstand_w / 2.0, 2),
                y=round(pos_b_y - nightstand_l / 2.0 - 0.2, 2),
                width=nightstand_w,
                length=nightstand_l,
                depth=nightstand_l,
                height=1.8,
                rotation=90.0
            ))
            items.append(FurnitureItem(
                id=f"{room.id}_nightstand_2",
                type="side_table",
                floor_id=getattr(room, "floor_id", "floor_1"),
                room_id=room.id,
                x=round(pos_b_x + nightstand_w / 2.0, 2),
                y=round(pos_b_y + bed_w + nightstand_l / 2.0 + 0.2, 2),
                width=nightstand_w,
                length=nightstand_l,
                depth=nightstand_l,
                height=1.8,
                rotation=90.0
            ))

    # 2. Standard Bedroom / Guest Bedroom Program (Queen Bed, 1 Side Table, Wardrobe)
    elif room.type in ["bedroom", "guest_bedroom"]:
        bed_w, bed_l = 5.0, 6.5
        nightstand_w, nightstand_l = 1.5, 1.5
        wardrobe_w, wardrobe_d = min(6.0, max(3.5, rw - 3.0)), 2.0

        pos_x = rx + 0.8
        pos_y = ry + 0.4
        if is_in_door_swing(pos_x, pos_y, bed_w + nightstand_w, bed_l):
            pos_x = rx + rw - bed_w - nightstand_w - 0.8

        items.append(FurnitureItem(
            id=f"{room.id}_bed",
            type="queen_bed",
            floor_id=getattr(room, "floor_id", "floor_1"),
            room_id=room.id,
            x=round(pos_x + bed_w / 2.0, 2),
            y=round(pos_y + bed_l / 2.0, 2),
            width=bed_w,
            length=bed_l,
            depth=bed_l,
            height=2.6,
            rotation=0.0,
            orientation="north",
            clearance_requirements={"front": 2.5, "sides": 1.5}
        ))
        items.append(FurnitureItem(
            id=f"{room.id}_nightstand",
            type="side_table",
            floor_id=getattr(room, "floor_id", "floor_1"),
            room_id=room.id,
            x=round(pos_x + bed_w + nightstand_w / 2.0 + 0.2, 2),
            y=round(pos_y + nightstand_l / 2.0, 2),
            width=nightstand_w,
            length=nightstand_l,
            depth=nightstand_l,
            height=1.8,
            rotation=0.0
        ))
        # Wardrobe along side or bottom wall
        w_x = rx + rw - wardrobe_w - 0.4
        w_y = ry + rl - wardrobe_d - 0.4
        if not is_in_door_swing(w_x, w_y, wardrobe_w, wardrobe_d):
            items.append(FurnitureItem(
                id=f"{room.id}_wardrobe",
                type="wardrobe",
                floor_id=getattr(room, "floor_id", "floor_1"),
                room_id=room.id,
                x=round(w_x + wardrobe_w / 2.0, 2),
                y=round(w_y + wardrobe_d / 2.0, 2),
                width=round(wardrobe_w, 2),
                length=wardrobe_d,
                depth=wardrobe_d,
                height=7.0,
                rotation=0.0
            ))

    # 3. Living Room Program (3-Seater Sofa, Coffee Table, TV Unit)
    elif room.type in ["living_room", "family_lounge"]:
        sofa_w, sofa_l = 6.5, 2.8
        sofa_x = rx + (rw - sofa_w) / 2.0
        sofa_y = ry + 1.2
        if is_in_door_swing(sofa_x, sofa_y, sofa_w, sofa_l):
            sofa_y = ry + 2.5

        items.append(FurnitureItem(
            id=f"{room.id}_sofa",
            type="sofa",
            floor_id=getattr(room, "floor_id", "floor_1"),
            room_id=room.id,
            x=round(sofa_x + sofa_w / 2.0, 2),
            y=round(sofa_y + sofa_l / 2.0, 2),
            width=sofa_w,
            length=sofa_l,
            depth=sofa_l,
            height=2.8,
            rotation=0.0,
            clearance_requirements={"front": 2.0}
        ))
        # Coffee Table
        items.append(FurnitureItem(
            id=f"{room.id}_coffee_table",
            type="coffee_table",
            floor_id=getattr(room, "floor_id", "floor_1"),
            room_id=room.id,
            x=round(sofa_x + sofa_w / 2.0, 2),
            y=round(sofa_y + sofa_l + 1.6, 2),
            width=3.8,
            length=2.0,
            depth=2.0,
            height=1.5
        ))
        # TV Media Console against opposite wall
        tv_w = min(7.5, max(4.0, rw - 2.5))
        tv_y = ry + rl - 1.6
        items.append(FurnitureItem(
            id=f"{room.id}_tv_console",
            type="tv_unit",
            floor_id=getattr(room, "floor_id", "floor_1"),
            room_id=room.id,
            x=round(rx + rw / 2.0, 2),
            y=round(tv_y + 0.75, 2),
            width=round(tv_w, 2),
            length=1.5,
            depth=1.5,
            height=2.0
        ))

    # 4. Dining Room Program (Dining Table, Chairs)
    elif room.type == "dining":
        dt_w, dt_l = 5.2, 3.2
        dt_x = rx + (rw - dt_w) / 2.0
        dt_y = ry + (rl - dt_l) / 2.0
        items.append(FurnitureItem(
            id=f"{room.id}_table",
            type="dining_table",
            floor_id=getattr(room, "floor_id", "floor_1"),
            room_id=room.id,
            x=round(dt_x + dt_w / 2.0, 2),
            y=round(dt_y + dt_l / 2.0, 2),
            width=dt_w,
            length=dt_l,
            depth=dt_l,
            height=2.5,
            rotation=0.0,
            clearance_requirements={"all_around": 2.5}
        ))

    # 5. Kitchen Program (Countertop, Cooktop/Hob, Sink, Refrigerator)
    elif room.type == "kitchen":
        counter_len = max(6.0, rw - 1.0)
        items.append(FurnitureItem(
            id=f"{room.id}_counter",
            type="kitchen_counter",
            floor_id=getattr(room, "floor_id", "floor_1"),
            room_id=room.id,
            x=round(rx + 0.4 + counter_len / 2.0, 2),
            y=round(ry + 1.0, 2),
            width=round(counter_len, 2),
            length=2.0,
            depth=2.0,
            height=2.8
        ))
        # 3-burner gas hob
        items.append(FurnitureItem(
            id=f"{room.id}_hob",
            type="cooktop",
            floor_id=getattr(room, "floor_id", "floor_1"),
            room_id=room.id,
            x=round(rx + 1.8, 2),
            y=round(ry + 1.0, 2),
            width=2.5,
            length=1.8,
            depth=1.8,
            height=0.3
        ))
        # Stainless steel sink with drainboard
        items.append(FurnitureItem(
            id=f"{room.id}_sink",
            type="kitchen_sink",
            floor_id=getattr(room, "floor_id", "floor_1"),
            room_id=room.id,
            x=round(rx + counter_len - 1.8, 2),
            y=round(ry + 1.0, 2),
            width=2.5,
            length=1.8,
            depth=1.8,
            height=0.8
        ))
        # Refrigerator
        fridge_x = rx + rw - 1.8
        fridge_y = ry + rl - 1.8
        if not is_in_door_swing(fridge_x - 1.4, fridge_y - 1.4, 2.8, 2.8):
            items.append(FurnitureItem(
                id=f"{room.id}_fridge",
                type="refrigerator",
                floor_id=getattr(room, "floor_id", "floor_1"),
                room_id=room.id,
                x=round(fridge_x, 2),
                y=round(fridge_y, 2),
                width=2.8,
                length=2.8,
                depth=2.8,
                height=6.0,
                clearance_requirements={"front": 2.5}
            ))

    # 6. Bathroom Program (WC, Vanity Basin, Shower)
    elif room.type in ["bathroom", "powder_room"]:
        # Vanity Basin
        items.append(FurnitureItem(
            id=f"{room.id}_basin",
            type="basin",
            floor_id=getattr(room, "floor_id", "floor_1"),
            room_id=room.id,
            x=round(rx + 1.3, 2),
            y=round(ry + 1.0, 2),
            width=2.2,
            length=1.6,
            depth=1.6,
            height=2.8
        ))
        # WC toilet
        items.append(FurnitureItem(
            id=f"{room.id}_wc",
            type="toilet",
            floor_id=getattr(room, "floor_id", "floor_1"),
            room_id=room.id,
            x=round(rx + 1.3, 2),
            y=round(ry + rl - 1.5, 2),
            width=1.8,
            length=2.2,
            depth=2.2,
            height=2.5,
            clearance_requirements={"front": 2.0}
        ))
        if room.type == "bathroom" and rw >= 6.0:
            # Shower stall
            items.append(FurnitureItem(
                id=f"{room.id}_shower",
                type="shower",
                floor_id=getattr(room, "floor_id", "floor_1"),
                room_id=room.id,
                x=round(rx + rw - 1.6, 2),
                y=round(ry + 1.6, 2),
                width=3.0,
                length=3.0,
                depth=3.0,
                height=6.5
            ))

    # Populate room.furniture_ids
    room.furniture_ids = [itm.id for itm in items]

    # Calculate actual clearance validity using Shapely containment and clearances
    colliding_count = 0
    for itm in items:
        # Re-derive position or x, y box
        half_w = itm.width / 2.0
        half_l = (itm.depth or itm.length) / 2.0
        itm_poly = box(itm.x - half_w, itm.y - half_l, itm.x + half_w, itm.y + half_l)
        if not room_poly.buffer(0.1).contains(itm_poly):
            colliding_count += 1
            warnings.append(f"Fixture '{itm.type}' in {room.name} extends beyond room boundary.")

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

