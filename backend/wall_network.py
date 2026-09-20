"""
Global Wall Network, Door & Window Planner Module
Constructs a unified, deduplicated global wall network with shared boundary tracking.
Generates architectural doors (hinges, swings, circulation connectivity)
and exterior daylight/ventilation windows.
"""

from typing import List, Dict, Tuple, Optional, Set
import math
from models import Room, Wall, Door, Window, Rect, Point2D, Site

def generate_wall_network_and_openings(
    rooms: List[Room],
    site: Site,
    wall_height: float = 10.0
) -> Tuple[List[Wall], List[Door], List[Window]]:
    """
    Generates single shared walls for adjacent rooms, external perimeter walls,
    circulation-driven doors, and exterior daylight windows.
    """
    walls: List[Wall] = []
    doors: List[Door] = []
    windows: List[Window] = []
    
    wall_counter = 1
    door_counter = 1
    win_counter = 1

    # Map of room_id to Room
    room_map = {r.id: r for r in rooms if r.rect}

    # Extract all horizontal and vertical segment slices from rooms
    # Horizontal segments: y -> list of (x_start, x_end, room_id, orientation)
    # Vertical segments: x -> list of (y_start, y_end, room_id, orientation)
    h_lines: Dict[float, List[Tuple[float, float, str, str]]] = {}
    v_lines: Dict[float, List[Tuple[float, float, str, str]]] = {}

    TOL = 0.1  # Coordinate snapping tolerance

    def snap_coord(val: float) -> float:
        return round(val * 2.0) / 2.0

    for r in rooms:
        if not r.rect:
            continue
        rx, ry = snap_coord(r.rect.x), snap_coord(r.rect.y)
        rw, rl = snap_coord(r.rect.width), snap_coord(r.rect.length)
        rx2, ry2 = rx + rw, ry + rl

        # Top edge
        h_lines.setdefault(ry, []).append((rx, rx2, r.id, "top"))
        # Bottom edge
        h_lines.setdefault(ry2, []).append((rx, rx2, r.id, "bottom"))
        # Left edge
        v_lines.setdefault(rx, []).append((ry, ry2, r.id, "left"))
        # Right edge
        v_lines.setdefault(rx2, []).append((ry, ry2, r.id, "right"))

    # Helper to resolve 1D overlapping segments on a single line
    def resolve_segments_on_line(line_val: float, raw_segs: List[Tuple[float, float, str, str]], is_horizontal: bool):
        nonlocal wall_counter
        # Collect critical split points
        points = set()
        for s, e, _, _ in raw_segs:
            points.add(round(s, 2))
            points.add(round(e, 2))
        sorted_pts = sorted(list(points))

        for i in range(len(sorted_pts) - 1):
            p1, p2 = sorted_pts[i], sorted_pts[i + 1]
            if p2 - p1 < 0.2:  # Ignore microscopic slivers
                continue
            mid = (p1 + p2) / 2.0

            # Find which rooms overlap this sub-segment
            touching_rooms = set()
            for s, e, rid, orient in raw_segs:
                if s <= mid <= e:
                    touching_rooms.add(rid)

            if not touching_rooms:
                continue

            r_ids = sorted(list(touching_rooms))
            is_interior = len(r_ids) >= 2
            wall_type = "interior" if is_interior else "exterior"
            thickness = 0.5 if is_interior else 0.75

            if is_horizontal:
                start_pt = Point2D(x=p1, y=line_val)
                end_pt = Point2D(x=p2, y=line_val)
            else:
                start_pt = Point2D(x=line_val, y=p1)
                end_pt = Point2D(x=line_val, y=p2)

            w_id = f"wall_{wall_counter:03d}"
            wall_counter += 1

            walls.append(Wall(
                id=w_id,
                start=start_pt,
                end=end_pt,
                thickness=thickness,
                height=wall_height,
                wall_type=wall_type,
                adjacent_room_ids=r_ids,
                openings=[]
            ))

    for y_coord, segs in h_lines.items():
        resolve_segments_on_line(y_coord, segs, is_horizontal=True)

    for x_coord, segs in v_lines.items():
        resolve_segments_on_line(x_coord, segs, is_horizontal=False)

    # -------------------------------------------------------------------------
    # Generate Doors
    # -------------------------------------------------------------------------
    # 1. Main Entrance Door on exterior wall of foyer or living room
    entry_candidates = [r for r in rooms if r.type in ["entry_foyer", "living_room"] and r.rect]
    entry_room = entry_candidates[0] if entry_candidates else (rooms[0] if rooms else None)

    if entry_room:
        # Find exterior wall of entry_room facing road
        road = site.road_side if site and hasattr(site, "road_side") and site.road_side else "south"
        entry_walls = [
            w for w in walls
            if w.wall_type == "exterior" and entry_room.id in w.adjacent_room_ids
        ]
        
        # Pick best wall facing road frontage
        chosen_entry_wall = None
        for w in entry_walls:
            w_len = math.hypot(w.end.x - w.start.x, w.end.y - w.start.y)
            if w_len >= 3.5:
                chosen_entry_wall = w
                break
        if not chosen_entry_wall and entry_walls:
            chosen_entry_wall = entry_walls[0]

        if chosen_entry_wall:
            d_id = f"door_{door_counter:03d}"
            door_counter += 1
            # Position door safely offset along the wall
            d_pos = Point2D(
                x=round((chosen_entry_wall.start.x + chosen_entry_wall.end.x) / 2.0, 2),
                y=round((chosen_entry_wall.start.y + chosen_entry_wall.end.y) / 2.0, 2)
            )
            d_entry = Door(
                id=d_id,
                host_wall_id=chosen_entry_wall.id,
                from_room="outdoor",
                to_room=entry_room.id,
                position=d_pos,
                width=3.5,
                height=7.0,
                hinge_side="left",
                swing_direction="inward",
                door_type="entrance"
            )
            doors.append(d_entry)
            chosen_entry_wall.openings.append(d_id)

    # 2. Interior doors connecting rooms to circulation or attached rooms
    for r in rooms:
        if r.type in ["hallway", "parking"]:
            continue

        # Attached bathroom door directly connects to parent bedroom
        target_connector_id = r.attached_room_id
        if not target_connector_id:
            # Connect to hallway or living room
            hallways = [h for h in rooms if h.type == "hallway"]
            target_connector_id = hallways[0].id if hallways else "living_room"

        # Find shared interior wall between r and target_connector_id
        shared_walls = [
            w for w in walls
            if w.wall_type == "interior"
            and r.id in w.adjacent_room_ids
            and (target_connector_id in w.adjacent_room_ids or any(h.id in w.adjacent_room_ids for h in rooms if h.type in ["hallway", "living_room"]))
        ]

        if shared_walls:
            host = shared_walls[0]
            w_len = math.hypot(host.end.x - host.start.x, host.end.y - host.start.y)
            if w_len >= 2.5:
                d_id = f"door_{door_counter:03d}"
                door_counter += 1
                
                # Offset 1 ft from start for clean door jamb
                t = min(0.8, max(0.2, 1.2 / max(0.1, w_len)))
                dx = host.start.x + t * (host.end.x - host.start.x)
                dy = host.start.y + t * (host.end.y - host.start.y)

                door_w = 2.5 if r.type in ["bathroom", "powder_room", "utility"] else 3.0
                door_type = "pocket" if r.type == "bathroom" and w_len < 3.5 else "single_swing"

                d_int = Door(
                    id=d_id,
                    host_wall_id=host.id,
                    from_room=host.adjacent_room_ids[0],
                    to_room=host.adjacent_room_ids[1] if len(host.adjacent_room_ids) > 1 else r.id,
                    position=Point2D(x=round(dx, 2), y=round(dy, 2)),
                    width=door_w,
                    height=7.0,
                    hinge_side="left",
                    swing_direction="inward",
                    door_type=door_type
                )
                doors.append(d_int)
                host.openings.append(d_id)

    # -------------------------------------------------------------------------
    # Generate Windows
    # -------------------------------------------------------------------------
    for r in rooms:
        if r.type in ["hallway", "parking"]:
            continue
        # Find exterior walls for room
        ext_walls = [
            w for w in walls
            if w.wall_type == "exterior" and r.id in w.adjacent_room_ids
        ]
        if not ext_walls:
            continue

        for ext_w in ext_walls:
            w_len = math.hypot(ext_w.end.x - ext_w.start.x, ext_w.end.y - ext_w.start.y)
            if w_len < 3.5:
                continue

            # Determine window sizing based on room daylight requirements
            if r.type in ["living_room", "family_lounge"]:
                win_w = min(6.0, w_len - 1.5)
                win_h = 5.0
                sill = 2.5
                w_type = "picture" if win_w >= 5.0 else "casement"
            elif r.type in ["master_bedroom", "bedroom", "guest_bedroom"]:
                win_w = min(4.5, w_len - 1.5)
                win_h = 4.5
                sill = 3.0
                w_type = "casement"
            elif r.type == "kitchen":
                win_w = min(3.5, w_len - 1.0)
                win_h = 3.5
                sill = 3.5  # Sits above standard kitchen counter
                w_type = "sliding"
            elif r.type in ["bathroom", "powder_room", "utility"]:
                win_w = 2.0
                win_h = 1.5
                sill = 6.0  # High frosted ventilator window for privacy
                w_type = "ventilator"
            else:
                win_w = 3.0
                win_h = 4.0
                sill = 3.0
                w_type = "casement"

            mid_x = (ext_w.start.x + ext_w.end.x) / 2.0
            mid_y = (ext_w.start.y + ext_w.end.y) / 2.0

            win_id = f"win_{win_counter:03d}"
            win_counter += 1

            win = Window(
                id=win_id,
                host_wall_id=ext_w.id,
                room_id=r.id,
                position=Point2D(x=round(mid_x, 2), y=round(mid_y, 2)),
                width=round(win_w, 2),
                height=win_h,
                sill_height=sill,
                window_type=w_type
            )
            windows.append(win)
            ext_w.openings.append(win_id)
            break  # One primary architectural window per room is clean

    return walls, doors, windows
