"""
Global Wall Network, Door & Window Planner Module
Constructs a unified, deduplicated global wall network with shared boundary tracking.
Consumes ConstructionSpecification for real geometric wall thicknesses (external & internal),
heights, opening cutouts, surface areas, and 3D volumes.
Generates architectural doors (hinges, swings, clearance zones, circulation connectivity)
and exterior daylight/ventilation windows with verified orientation and wall hosting.
"""

from typing import List, Dict, Tuple, Optional, Set
import math
from models import Room, Wall, Door, Window, Rect, Point2D, Site, ConstructionSpecification


def generate_wall_network_and_openings(
    rooms: List[Room],
    site: Site,
    wall_height: float = 10.0,
    construction_spec: Optional[ConstructionSpecification] = None
) -> Tuple[List[Wall], List[Door], List[Window]]:
    """
    Generates single shared walls for adjacent rooms, external perimeter walls,
    circulation-driven doors, and exterior daylight windows.
    Wall thicknesses and heights derive from ConstructionSpecification when supplied.
    Computes net surface areas and volumes deducting door/window openings.
    """
    walls: List[Wall] = []
    doors: List[Door] = []
    windows: List[Window] = []
    
    wall_counter = 1
    door_counter = 1
    win_counter = 1

    # Resolve wall thickness and height from ConstructionSpecification if available
    if construction_spec:
        ext_thickness = construction_spec.external_wall_thickness_ft
        int_thickness = construction_spec.internal_wall_thickness_ft
        active_wall_height = construction_spec.wall_height_ft
    else:
        ext_thickness = 0.75  # standard 9-inch masonry
        int_thickness = 0.375 # standard 4.5-inch masonry (or 0.5ft baseline)
        active_wall_height = wall_height

    # Map of room_id to Room
    room_map = {r.id: r for r in rooms if r.rect}

    # Extract all horizontal and vertical segment slices from rooms
    h_lines: Dict[float, List[Tuple[float, float, str, str]]] = {}
    v_lines: Dict[float, List[Tuple[float, float, str, str]]] = {}

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
            thickness = int_thickness if is_interior else ext_thickness

            if is_horizontal:
                start_pt = Point2D(x=p1, y=line_val)
                end_pt = Point2D(x=p2, y=line_val)
            else:
                start_pt = Point2D(x=line_val, y=p1)
                end_pt = Point2D(x=line_val, y=p2)

            w_id = f"wall_{wall_counter:03d}"
            wall_counter += 1

            # Initial gross surface area and volume
            w_len = round(p2 - p1, 2)
            gross_area = round(w_len * active_wall_height, 2)

            walls.append(Wall(
                id=w_id,
                wall_id=w_id,
                start=start_pt,
                end=end_pt,
                thickness=thickness,
                height=active_wall_height,
                wall_type=wall_type,
                is_exterior=(not is_interior),
                adjacent_room_ids=r_ids,
                openings=[],
                volume_cuft=round(gross_area * thickness, 2),
                net_surface_area_sqft=gross_area
            ))

    for y_coord, segs in h_lines.items():
        resolve_segments_on_line(y_coord, segs, is_horizontal=True)

    for x_coord, segs in v_lines.items():
        resolve_segments_on_line(x_coord, segs, is_horizontal=False)

    # Generate Doors
    # 1. Main Entrance Door on exterior wall of foyer or living room
    entry_candidates = [r for r in rooms if r.type in ["entry_foyer", "living_room"] and r.rect]
    entry_room = entry_candidates[0] if entry_candidates else (rooms[0] if rooms else None)

    valid_rects = [r.rect for r in rooms if r.rect]
    env_mid_x = (min(r.x for r in valid_rects) + max(r.x + r.width for r in valid_rects)) / 2.0 if valid_rects else (site.width / 2.0 if site else 20.0)
    env_mid_y = (min(r.y for r in valid_rects) + max(r.y + r.length for r in valid_rects)) / 2.0 if valid_rects else (site.length / 2.0 if site else 25.0)

    # Helper to calculate wall orientation and outward direction relative to envelope/site
    def get_wall_orientation(w: Wall) -> Tuple[str, str]:
        dx = w.end.x - w.start.x
        dy = w.end.y - w.start.y
        is_horiz = abs(dy) <= abs(dx)
        if is_horiz:
            mid_y = (w.start.y + w.end.y) / 2.0
            orient = "north" if mid_y < env_mid_y else "south"
            return "horizontal", orient
        else:
            mid_x = (w.start.x + w.end.x) / 2.0
            orient = "west" if mid_x < env_mid_x else "east"
            return "vertical", orient

    # Assign orientations to all walls
    for w in walls:
        w_dir, w_orient = get_wall_orientation(w)
        w.wall_direction = w_dir
        w.wall_orientation = w_orient

    # Generate Doors
    # 1. Main Entrance Door on exterior wall of foyer or living room
    entry_candidates = [r for r in rooms if r.type in ["entry_foyer", "living_room"] and r.rect]
    entry_room = entry_candidates[0] if entry_candidates else (rooms[0] if rooms else None)

    if entry_room:
        road = site.road_side if site and hasattr(site, "road_side") and site.road_side else "south"
        entry_walls = [
            w for w in walls
            if w.wall_type == "exterior" and entry_room.id in w.adjacent_room_ids
        ]
        
        chosen_entry_wall = None
        # Prefer wall matching road side
        road_matched_walls = [w for w in entry_walls if w.wall_orientation == road]
        candidate_pool = road_matched_walls if road_matched_walls else entry_walls
        for w in candidate_pool:
            w_len = math.hypot(w.end.x - w.start.x, w.end.y - w.start.y)
            if w_len >= 3.5:
                chosen_entry_wall = w
                break
        if not chosen_entry_wall and entry_walls:
            chosen_entry_wall = entry_walls[0]

        if chosen_entry_wall:
            d_id = f"D{door_counter:02d}"
            door_counter += 1
            d_pos_x = round((chosen_entry_wall.start.x + chosen_entry_wall.end.x) / 2.0, 2)
            d_pos_y = round((chosen_entry_wall.start.y + chosen_entry_wall.end.y) / 2.0, 2)
            d_pos = Point2D(x=d_pos_x, y=d_pos_y)
            
            # Wall vector and orientation
            w_dir = chosen_entry_wall.wall_direction or "horizontal"
            d_orient = chosen_entry_wall.wall_orientation or "south"
            label_char = d_orient[0].upper()
            dir_label = f"{d_id} · {label_char}"

            # Calculate door start and end
            if w_dir == "horizontal":
                dx1, dx2 = d_pos_x - 1.75, d_pos_x + 1.75
                dy1, dy2 = d_pos_y, d_pos_y
            else:
                dx1, dx2 = d_pos_x, d_pos_x
                dy1, dy2 = d_pos_y - 1.75, d_pos_y + 1.75

            # 3ft clear swing zone in front of entrance
            cz_x = max(0.0, d_pos_x - 1.75)
            cz_y = max(0.0, d_pos_y - 1.75)
            d_entry = Door(
                id=d_id,
                door_id=d_id,
                floor_id=getattr(entry_room, "floor_id", "floor_1"),
                wall_id=chosen_entry_wall.id,
                host_wall_id=chosen_entry_wall.id,
                room_id="outdoor",
                from_room="outdoor",
                from_room_id="outdoor",
                connected_room_id=entry_room.id,
                to_room=entry_room.id,
                to_room_id=entry_room.id,
                position_along_wall=0.5,
                position=d_pos,
                x=d_pos_x,
                y=d_pos_y,
                x1=round(dx1, 2),
                y1=round(dy1, 2),
                x2=round(dx2, 2),
                y2=round(dy2, 2),
                width=3.5,
                height=7.0,
                hinge_side="left",
                swing_direction="inward",
                swing_angle=90.0,
                door_type="entrance",
                orientation=d_orient,
                direction_label=dir_label,
                connects_room_ids=["outdoor", entry_room.id],
                clearance_zone=Rect(x=cz_x, y=cz_y, width=3.5, length=3.0)
            )
            doors.append(d_entry)
            chosen_entry_wall.openings.append(d_id)
            if hasattr(entry_room, "door_ids") and entry_room.door_ids is not None:
                entry_room.door_ids.append(d_id)

    # 2. Interior doors connecting rooms to circulation or attached rooms
    for r in rooms:
        if r.type in ["hallway", "parking"]:
            continue

        target_connector_id = r.attached_room_id
        if not target_connector_id:
            hallways = [h for h in rooms if h.type == "hallway"]
            target_connector_id = hallways[0].id if hallways else "living_room"

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
                d_id = f"D{door_counter:02d}"
                door_counter += 1
                
                door_w = 2.5 if r.type in ["bathroom", "powder_room", "utility"] else 3.0
                door_type = "pocket" if r.type == "bathroom" and w_len < 3.5 else "single_swing"

                # Position door slightly off the corner (20% to 30% along the wall) for natural hinge swing against the partition
                t = min(0.75, max(0.25, (door_w / 2.0 + 0.5) / max(0.1, w_len)))
                dx = host.start.x + t * (host.end.x - host.start.x)
                dy = host.start.y + t * (host.end.y - host.start.y)
                
                is_horiz = abs(host.end.y - host.start.y) <= abs(host.end.x - host.start.x)
                if is_horiz:
                    dx1, dx2 = dx - door_w / 2.0, dx + door_w / 2.0
                    dy1, dy2 = dy, dy
                else:
                    dx1, dx2 = dx, dx
                    dy1, dy2 = dy - door_w / 2.0, dy + door_w / 2.0

                d_orient = host.wall_orientation or ("south" if is_horiz else "east")
                label_char = d_orient[0].upper()
                dir_label = f"{d_id} · {label_char}"

                conn_id = host.adjacent_room_ids[1] if len(host.adjacent_room_ids) > 1 and host.adjacent_room_ids[0] == r.id else host.adjacent_room_ids[0]

                d_int = Door(
                    id=d_id,
                    door_id=d_id,
                    floor_id=getattr(r, "floor_id", "floor_1"),
                    wall_id=host.id,
                    host_wall_id=host.id,
                    room_id=r.id,
                    from_room=conn_id,
                    from_room_id=conn_id,
                    connected_room_id=r.id,
                    to_room=r.id,
                    to_room_id=r.id,
                    position_along_wall=round(t, 3),
                    position=Point2D(x=round(dx, 2), y=round(dy, 2)),
                    x=round(dx, 2),
                    y=round(dy, 2),
                    x1=round(dx1, 2),
                    y1=round(dy1, 2),
                    x2=round(dx2, 2),
                    y2=round(dy2, 2),
                    width=door_w,
                    height=7.0,
                    hinge_side="left",
                    swing_direction="inward",
                    swing_angle=90.0,
                    door_type=door_type,
                    orientation=d_orient,
                    direction_label=dir_label,
                    connects_room_ids=[conn_id, r.id],
                    clearance_zone=Rect(x=round(dx - door_w/2.0, 2), y=round(dy, 2), width=door_w, length=3.0)
                )
                doors.append(d_int)
                host.openings.append(d_id)
                if hasattr(r, "door_ids") and r.door_ids is not None:
                    r.door_ids.append(d_id)

    # Generate Windows
    for r in rooms:
        if r.type in ["hallway", "parking"]:
            continue
        ext_walls = [
            w for w in walls
            if w.wall_type == "exterior" and r.id in w.adjacent_room_ids
        ]
        if not ext_walls:
            continue

        for ext_w in ext_walls:
            w_len = math.hypot(ext_w.end.x - ext_w.start.x, ext_w.end.y - ext_w.start.y)
            if w_len < 3.2:
                continue

            # Determine window sizing
            if r.type in ["living_room", "family_lounge"]:
                win_w = min(5.5, max(3.5, w_len - 1.5))
                win_h = 5.0
                sill = 2.5
                w_type = "sliding" if win_w >= 5.0 else "casement"
            elif r.type in ["master_bedroom", "bedroom", "guest_bedroom"]:
                win_w = min(4.5, max(3.0, w_len - 1.5))
                win_h = 4.5
                sill = 3.0
                w_type = "casement"
            elif r.type == "kitchen":
                win_w = min(3.5, max(2.5, w_len - 1.0))
                win_h = 3.5
                sill = 3.5
                w_type = "sliding"
            elif r.type in ["bathroom", "powder_room", "utility"]:
                win_w = 2.0
                win_h = 1.5
                sill = 6.0
                w_type = "ventilator"
            else:
                win_w = 3.0
                win_h = 4.0
                sill = 3.0
                w_type = "casement"

            mid_x = (ext_w.start.x + ext_w.end.x) / 2.0
            mid_y = (ext_w.start.y + ext_w.end.y) / 2.0

            # Exact orientation and outward direction
            w_dir = ext_w.wall_direction or "horizontal"
            orient = ext_w.wall_orientation or ("north" if mid_y < 25.0 else "south")
            label_char = orient[0].upper()

            win_id = f"W{win_counter:02d}"
            win_counter += 1
            dir_label = f"{win_id} · {label_char}"

            # Calculate window segment start/end
            if w_dir == "horizontal":
                wx1 = mid_x - win_w / 2.0
                wx2 = mid_x + win_w / 2.0
                wy1 = mid_y
                wy2 = mid_y
            else:
                wx1 = mid_x
                wx2 = mid_x
                wy1 = mid_y - win_w / 2.0
                wy2 = mid_y + win_w / 2.0

            win = Window(
                id=win_id,
                window_id=win_id,
                floor_id=getattr(r, "floor_id", "floor_1"),
                wall_id=ext_w.id,
                host_wall_id=ext_w.id,
                room_id=r.id,
                position_along_wall=0.5,
                position=Point2D(x=round(mid_x, 2), y=round(mid_y, 2)),
                x=round(mid_x, 2),
                y=round(mid_y, 2),
                x1=round(wx1, 2),
                y1=round(wy1, 2),
                x2=round(wx2, 2),
                y2=round(wy2, 2),
                width=round(win_w, 2),
                height=win_h,
                sill_height=sill,
                head_height=round(sill + win_h, 2),
                window_type=w_type,
                type=w_type,
                orientation=orient,
                outward_direction=orient,
                direction_label=dir_label
            )
            windows.append(win)
            ext_w.openings.append(win_id)
            if hasattr(r, "window_ids") and r.window_ids is not None:
                r.window_ids.append(win_id)
            break

    # Recalculate Net Wall Surface Area & Volume deducting openings
    door_area_by_wall: Dict[str, float] = {}
    for d in doors:
        if d.host_wall_id:
            door_area_by_wall[d.host_wall_id] = door_area_by_wall.get(d.host_wall_id, 0.0) + (d.width * d.height)

    win_area_by_wall: Dict[str, float] = {}
    for w in windows:
        if w.host_wall_id:
            win_area_by_wall[w.host_wall_id] = win_area_by_wall.get(w.host_wall_id, 0.0) + (w.width * w.height)

    for w in walls:
        w_len = math.hypot(w.end.x - w.start.x, w.end.y - w.start.y)
        gross_area = round(w_len * w.height, 2)
        openings_area = round(door_area_by_wall.get(w.id, 0.0) + win_area_by_wall.get(w.id, 0.0), 2)
        net_area = max(0.0, round(gross_area - openings_area, 2))
        w.net_surface_area_sqft = net_area
        w.volume_cuft = round(net_area * w.thickness, 2)

    return walls, doors, windows
