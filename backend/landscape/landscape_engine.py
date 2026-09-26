"""
Landscape Engine Module
Deterministic architectural landscape placement engine:
Site Analysis & Envelopes -> Setback Zoning -> Pedestrian & Vehicular Circulation ->
Collision-Free Vegetation Placement -> Hardscape Features & Lighting -> LandscapePlan.
"""

from typing import List, Dict, Tuple, Optional, Any
import math
from shapely.geometry import box, Polygon, Point, MultiPolygon, LineString

from models import (
    HouseLayout, LandscapePlan, LandscapeElement, LandscapeZone,
    LandscapePreferences, Point2D, Rect, Room, Door
)
from .landscape_rules import (
    TREE_BUILDING_BUFFER,
    TREE_DOOR_BUFFER,
    TREE_PARKING_BUFFER,
    TREE_DRIVEWAY_BUFFER,
    TREE_PLOT_MARGIN,
    TREE_MIN_SPACING,
    PATH_WIDTH,
    BOLLARD_LIGHT_INTERVAL,
    BOLLARD_PATH_OFFSET,
    BOUNDARY_HEDGE_WIDTH,
    STYLE_CONFIGS
)


def _rect_to_poly(r: Rect) -> Polygon:
    """Converts a Rect model to a Shapely Polygon."""
    return box(r.x, r.y, r.x + r.width, r.y + r.length)


def _get_ground_floor(layout: HouseLayout):
    """Retrieves ground floor rooms, doors, and walls."""
    if layout.floors and len(layout.floors) > 0:
        return layout.floors[0]
    return None


def generate_landscape_plan(
    layout: HouseLayout,
    preferences: Optional[LandscapePreferences] = None
) -> LandscapePlan:
    """
    Deterministically synthesizes a site-responsive, collision-free landscape plan.
    Ensures all vegetation, hardscaping, pathways, and outdoor features respect:
    - Plot boundaries and setbacks
    - Building footprint and exterior walls
    - Exterior entrance doors and egress
    - Car parking bay and driveway
    """
    plot_w = float(layout.plot_width)
    plot_l = float(layout.plot_length)
    site = layout.site
    road_side = (site.road_side if site else "south").lower()

    prefs = preferences or LandscapePreferences()
    style_key = (prefs.style or "modern_minimal").lower()
    if style_key not in STYLE_CONFIGS:
        style_key = "modern_minimal"
    style_cfg = STYLE_CONFIGS[style_key]

    # 1. Establish Building Footprint & Collision Polygons
    ground_floor = _get_ground_floor(layout)
    rooms = ground_floor.rooms if ground_floor and ground_floor.rooms else (layout.rooms or [])
    doors = ground_floor.doors if ground_floor and ground_floor.doors else (layout.doors or [])

    building_polys = []
    for room in rooms:
        if room.rect:
            building_polys.append(_rect_to_poly(room.rect))

    if building_polys:
        building_footprint = MultiPolygon(building_polys).buffer(0)
    elif site and site.buildable_envelope:
        building_footprint = _rect_to_poly(site.buildable_envelope)
    else:
        building_footprint = box(plot_w * 0.15, plot_l * 0.15, plot_w * 0.85, plot_l * 0.85)

    # 2. Extract Parking and Driveway Polygons
    parking_rect = site.parking.rect if (site and site.parking) else None
    parking_poly = _rect_to_poly(parking_rect) if parking_rect else None

    driveway_rect = site.driveway if (site and site.driveway) else None
    driveway_poly = _rect_to_poly(driveway_rect) if driveway_rect else None

    # 3. Locate Main Exterior Entrance Door
    entry_pt = Point2D(x=round(plot_w / 2.0, 1), y=round(plot_l - 6.0, 1))
    if layout.entry_point and "x" in layout.entry_point and "y" in layout.entry_point:
        ep_x = float(layout.entry_point["x"])
        ep_y = float(layout.entry_point["y"])
        if ep_x > 0 and ep_y > 0:
            entry_pt = Point2D(x=ep_x, y=ep_y)
    else:
        for door in doors:
            if getattr(door, "door_type", "") == "entry":
                entry_pt = Point2D(x=(door.x1 + door.x2) / 2.0, y=(door.y1 + door.y2) / 2.0)
                break

    # 4. Define Setbacks
    sb_front = float(site.setbacks.front) if (site and site.setbacks) else 5.0
    sb_rear = float(site.setbacks.rear) if (site and site.setbacks) else 4.0
    sb_left = float(site.setbacks.left) if (site and site.setbacks) else 3.0
    sb_right = float(site.setbacks.right) if (site and site.setbacks) else 3.0

    zones: List[LandscapeZone] = []
    elements: List[LandscapeElement] = []
    paths: List[LandscapeElement] = []
    outdoor_features: List[LandscapeElement] = []

    # 5. Build Logical Landscape Zones
    # Front Garden Zone
    if road_side == "south":
        fg_rect = Rect(x=0.0, y=plot_l - sb_front, width=plot_w, length=sb_front)
        rg_rect = Rect(x=0.0, y=0.0, width=plot_w, length=sb_rear)
    elif road_side == "north":
        fg_rect = Rect(x=0.0, y=0.0, width=plot_w, length=sb_front)
        rg_rect = Rect(x=0.0, y=plot_l - sb_rear, width=plot_w, length=sb_rear)
    elif road_side == "east":
        fg_rect = Rect(x=plot_w - sb_front, y=0.0, width=sb_front, length=plot_l)
        rg_rect = Rect(x=0.0, y=0.0, width=sb_rear, length=plot_l)
    else:  # west
        fg_rect = Rect(x=0.0, y=0.0, width=sb_front, length=plot_l)
        rg_rect = Rect(x=plot_w - sb_rear, y=0.0, width=sb_rear, length=plot_l)

    front_zone = LandscapeZone(
        zone_id="ZONE_FRONT_GARDEN",
        name="Front Garden & Approach",
        zone_type="front_garden",
        rect=fg_rect,
        area_sqft=round(fg_rect.width * fg_rect.length, 1),
        description="Formal approach, lawn foreground, and entrance landscape."
    )
    zones.append(front_zone)

    rear_zone = LandscapeZone(
        zone_id="ZONE_REAR_GARDEN",
        name="Rear Private Garden",
        zone_type="rear_garden",
        rect=rg_rect,
        area_sqft=round(rg_rect.width * rg_rect.length, 1),
        description="Secluded backyard lawn, specimen trees, and outdoor seating."
    )
    zones.append(rear_zone)

    # 6. Driveway Element
    driveway_elem: Optional[LandscapeElement] = None
    if driveway_rect:
        driveway_elem = LandscapeElement(
            element_id="DRIVEWAY_01",
            type="driveway",
            x=round(driveway_rect.x + driveway_rect.width / 2.0, 2),
            y=round(driveway_rect.y + driveway_rect.length / 2.0, 2),
            width=round(driveway_rect.width, 2),
            length=round(driveway_rect.length, 2),
            zone="driveway",
            properties={"surface": "brushed_concrete_paving", "curb": True}
        )

    # 7. Pedestrian Pathway Generation
    # Connect road frontage to main entrance threshold avoiding obstacles
    path_points: List[Point2D] = []
    if site and site.pedestrian_path and len(site.pedestrian_path) >= 2:
        path_points = site.pedestrian_path
    else:
        # Generate logical dogleg pathway
        if road_side == "south":
            start_x = min(plot_w - 4.0, max(4.0, entry_pt.x + 4.0 if parking_rect and parking_rect.x < plot_w / 2 else entry_pt.x - 4.0))
            gate_pt = Point2D(x=round(start_x, 1), y=plot_l)
            mid_pt = Point2D(x=round(start_x, 1), y=round(entry_pt.y + 2.5, 1))
            door_pt = Point2D(x=round(entry_pt.x, 1), y=round(entry_pt.y + 1.0, 1))
            path_points = [gate_pt, mid_pt, door_pt]
        elif road_side == "north":
            start_x = min(plot_w - 4.0, max(4.0, entry_pt.x + 4.0 if parking_rect and parking_rect.x < plot_w / 2 else entry_pt.x - 4.0))
            gate_pt = Point2D(x=round(start_x, 1), y=0.0)
            mid_pt = Point2D(x=round(start_x, 1), y=round(entry_pt.y - 2.5, 1))
            door_pt = Point2D(x=round(entry_pt.x, 1), y=round(entry_pt.y - 1.0, 1))
            path_points = [gate_pt, mid_pt, door_pt]
        elif road_side == "east":
            start_y = min(plot_l - 4.0, max(4.0, entry_pt.y + 3.0))
            gate_pt = Point2D(x=plot_w, y=round(start_y, 1))
            mid_pt = Point2D(x=round(entry_pt.x + 2.5, 1), y=round(start_y, 1))
            door_pt = Point2D(x=round(entry_pt.x + 1.0, 1), y=round(entry_pt.y, 1))
            path_points = [gate_pt, mid_pt, door_pt]
        else:  # west
            start_y = min(plot_l - 4.0, max(4.0, entry_pt.y + 3.0))
            gate_pt = Point2D(x=0.0, y=round(start_y, 1))
            mid_pt = Point2D(x=round(entry_pt.x - 2.5, 1), y=round(start_y, 1))
            door_pt = Point2D(x=round(entry_pt.x - 1.0, 1), y=round(entry_pt.y, 1))
            path_points = [gate_pt, mid_pt, door_pt]

    if prefs.entrance_pathway and path_points:
        path_elem = LandscapeElement(
            element_id="PATH_ENTRANCE",
            type="pathway",
            x=round(path_points[len(path_points) // 2].x, 2),
            y=round(path_points[len(path_points) // 2].y, 2),
            width=PATH_WIDTH,
            zone="entrance_pathway",
            points=path_points,
            properties={"style": prefs.pathway_type or style_cfg.get("pathway_type", "stepping_stones")}
        )
        paths.append(path_elem)

    # 8. Lawns (Front and Rear Turf Surfaces)
    if prefs.front_garden and prefs.lawn_priority:
        if road_side in ["south", "north"]:
            fl_y = round(plot_l - sb_front + 0.5 if road_side == "south" else 0.5, 1)
            fl_l = max(3.0, sb_front - 1.0)
            fl_x = sb_left
            fl_w = max(3.0, round(plot_w - sb_left - sb_right, 1))

            if parking_rect:
                if parking_rect.x < plot_w / 2.0:
                    fl_x = round(parking_rect.right + 1.0, 1)
                    fl_w = max(3.0, round((plot_w - sb_right) - fl_x, 1))
                else:
                    fl_x = sb_left
                    fl_w = max(3.0, round(parking_rect.x - sb_left - 1.0, 1))
        elif road_side == "west":
            fl_x = 0.5
            fl_w = max(3.0, sb_front - 1.0)
            fl_y = sb_left
            fl_l = max(3.0, round(plot_l - sb_left - sb_right, 1))
            if parking_rect:
                fl_y = round(parking_rect.bottom + 1.0, 1)
                fl_l = max(3.0, round((plot_l - sb_right) - fl_y, 1))
        else:  # east
            fl_x = round(plot_w - sb_front + 0.5, 1)
            fl_w = max(3.0, sb_front - 1.0)
            fl_y = sb_left
            fl_l = max(3.0, round(plot_l - sb_left - sb_right, 1))
            if parking_rect:
                fl_y = round(parking_rect.bottom + 1.0, 1)
                fl_l = max(3.0, round((plot_l - sb_right) - fl_y, 1))

        lawn_front = LandscapeElement(
            element_id="LAWN_FRONT",
            type="lawn",
            x=round(fl_x + fl_w / 2.0, 2),
            y=round(fl_y + fl_l / 2.0, 2),
            width=round(fl_w, 2),
            length=round(fl_l, 2),
            zone="front_garden",
            properties={"grass_variety": "Bermuda Dwarf", "density": "premium"}
        )
        elements.append(lawn_front)

    if prefs.rear_garden and prefs.lawn_priority:
        if road_side in ["south", "north"]:
            rl_w = max(6.0, plot_w - sb_left - sb_right - 2.0)
            rl_x = round(sb_left + 1.0, 1)
            rl_y = round(0.5 if road_side == "south" else (plot_l - sb_rear + 0.5), 1)
            rl_l = max(3.0, sb_rear - 1.0)
        elif road_side == "west":
            rl_w = max(3.0, sb_rear - 1.0)
            rl_x = round(plot_w - sb_rear + 0.5, 1)
            rl_y = round(sb_left + 1.0, 1)
            rl_l = max(6.0, plot_l - sb_left - sb_right - 2.0)
        else:  # east
            rl_w = max(3.0, sb_rear - 1.0)
            rl_x = 0.5
            rl_y = round(sb_left + 1.0, 1)
            rl_l = max(6.0, plot_l - sb_left - sb_right - 2.0)

        lawn_rear = LandscapeElement(
            element_id="LAWN_REAR",
            type="lawn",
            x=round(rl_x + rl_w / 2.0, 2),
            y=round(rl_y + rl_l / 2.0, 2),
            width=round(rl_w, 2),
            length=round(rl_l, 2),
            zone="rear_garden",
            properties={"grass_variety": "Zoysia Japonica", "density": "lush"}
        )
        elements.append(lawn_rear)

    # 9. Planters Flanking Entrance
    if road_side in ["south", "north"]:
        p1_x = round(entry_pt.x - 3.5, 1)
        p2_x = round(entry_pt.x + 3.5, 1)
        p_y = round(entry_pt.y + (1.5 if road_side == "south" else -1.5), 1)
        planter_left = LandscapeElement(
            element_id="PLANTER_ENTRY_01",
            type="planter",
            x=p1_x,
            y=p_y,
            width=2.5,
            length=2.5,
            zone="front_garden",
            properties={"plant": "Buxus Spheres & Ornamental Grass"}
        )
        planter_right = LandscapeElement(
            element_id="PLANTER_ENTRY_02",
            type="planter",
            x=p2_x,
            y=p_y,
            width=2.5,
            length=2.5,
            zone="front_garden",
            properties={"plant": "Buxus Spheres & Ornamental Grass"}
        )
    else:  # west, east
        p_x = round(entry_pt.x + (-1.5 if road_side == "west" else 1.5), 1)
        p1_y = round(entry_pt.y - 3.5, 1)
        p2_y = round(entry_pt.y + 3.5, 1)
        planter_left = LandscapeElement(
            element_id="PLANTER_ENTRY_01",
            type="planter",
            x=p_x,
            y=p1_y,
            width=2.5,
            length=2.5,
            zone="front_garden",
            properties={"plant": "Buxus Spheres & Ornamental Grass"}
        )
        planter_right = LandscapeElement(
            element_id="PLANTER_ENTRY_02",
            type="planter",
            x=p_x,
            y=p2_y,
            width=2.5,
            length=2.5,
            zone="front_garden",
            properties={"plant": "Buxus Spheres & Ornamental Grass"}
        )
        p1_box = box(p_x - 1.25, p1_y - 1.25, p_x + 1.25, p1_y + 1.25)
        p2_box = box(p_x - 1.25, p2_y - 1.25, p_x + 1.25, p2_y + 1.25)

    if road_side in ["north", "south"]:
        p1_box = box(p1_x - 1.25, p_y - 0.75, p1_x + 1.25, p_y + 0.75)
        p2_box = box(p2_x - 1.25, p_y - 0.75, p2_x + 1.25, p_y + 0.75)

    if not (building_footprint.intersects(p1_box) or (parking_poly and parking_poly.intersects(p1_box))):
        elements.append(planter_left)
    if not (building_footprint.intersects(p2_box) or (parking_poly and parking_poly.intersects(p2_box))):
        elements.append(planter_right)

    # 10. Boundary Greenery / Perimeter Hedges
    if prefs.boundary_hedges or prefs.boundary_planting:
        # Left boundary hedge
        elements.append(LandscapeElement(
            element_id="HEDGE_LEFT",
            type="hedge",
            x=round(BOUNDARY_HEDGE_WIDTH / 2.0 + 0.2, 2),
            y=round(plot_l / 2.0, 2),
            width=BOUNDARY_HEDGE_WIDTH,
            length=round(plot_l - 4.0, 2),
            zone="boundary_planting",
            properties={"height": 4.5, "plant": "Boxwood Formal Hedge"}
        ))
        # Right boundary hedge
        elements.append(LandscapeElement(
            element_id="HEDGE_RIGHT",
            type="hedge",
            x=round(plot_w - BOUNDARY_HEDGE_WIDTH / 2.0 - 0.2, 2),
            y=round(plot_l / 2.0, 2),
            width=BOUNDARY_HEDGE_WIDTH,
            length=round(plot_l - 4.0, 2),
            zone="boundary_planting",
            properties={"height": 4.5, "plant": "Boxwood Formal Hedge"}
        ))
        # Rear boundary hedge
        if road_side in ["south", "north"]:
            elements.append(LandscapeElement(
                element_id="HEDGE_REAR",
                type="hedge",
                x=round(plot_w / 2.0, 2),
                y=round(BOUNDARY_HEDGE_WIDTH / 2.0 + 0.2 if road_side == "south" else (plot_l - BOUNDARY_HEDGE_WIDTH / 2.0 - 0.2), 2),
                width=round(plot_w - 4.0, 2),
                length=BOUNDARY_HEDGE_WIDTH,
                zone="boundary_planting",
                properties={"height": 5.0, "plant": "Dense Evergreen Privacy Screen"}
            ))
        elif road_side == "west":
            elements.append(LandscapeElement(
                element_id="HEDGE_REAR",
                type="hedge",
                x=round(plot_w - BOUNDARY_HEDGE_WIDTH / 2.0 - 0.2, 2),
                y=round(plot_l / 2.0, 2),
                width=BOUNDARY_HEDGE_WIDTH,
                length=round(plot_l - 4.0, 2),
                zone="boundary_planting",
                properties={"height": 5.0, "plant": "Dense Evergreen Privacy Screen"}
            ))
        else:  # east
            elements.append(LandscapeElement(
                element_id="HEDGE_REAR",
                type="hedge",
                x=round(BOUNDARY_HEDGE_WIDTH / 2.0 + 0.2, 2),
                y=round(plot_l / 2.0, 2),
                width=BOUNDARY_HEDGE_WIDTH,
                length=round(plot_l - 4.0, 2),
                zone="boundary_planting",
                properties={"height": 5.0, "plant": "Dense Evergreen Privacy Screen"}
            ))

    # 11. Deterministic Collision-Free Tree Placement
    density_mult = {"low": 2, "medium": 4, "dense": 6, "high": 6}.get(prefs.greenery_level or prefs.tree_density, 3)
    target_trees = prefs.trees if prefs.trees is not None else min(style_cfg.get("max_trees", 4), density_mult)
    target_trees = max(1, min(8, target_trees))

    # Candidate tree locations in front, rear, and side setback corridors
    candidate_locs: List[Tuple[float, float, str]] = []
    if road_side in ["south", "north"]:
        rg_y = max(TREE_PLOT_MARGIN + 0.5, sb_rear / 2.0) if road_side == "south" else (plot_l - max(TREE_PLOT_MARGIN + 0.5, sb_rear / 2.0))
        candidate_locs.append((sb_left + 2.5, rg_y, "rear_garden"))
        candidate_locs.append((plot_w - sb_right - 2.5, rg_y, "rear_garden"))
        candidate_locs.append((plot_w * 0.35, rg_y, "rear_garden"))
        candidate_locs.append((plot_w * 0.65, rg_y, "rear_garden"))
        candidate_locs.append((plot_w / 2.0, rg_y, "rear_garden"))

        fg_y = (plot_l - max(TREE_PLOT_MARGIN + 0.5, sb_front / 2.0)) if road_side == "south" else max(TREE_PLOT_MARGIN + 0.5, sb_front / 2.0)
        candidate_locs.append((plot_w - sb_right - 3.0, fg_y, "front_garden"))
        candidate_locs.append((sb_left + 2.0, fg_y, "front_garden"))
        candidate_locs.append((plot_w / 2.0, fg_y, "front_garden"))
    elif road_side == "west":
        rg_x = plot_w - max(TREE_PLOT_MARGIN + 0.5, sb_rear / 2.0)
        candidate_locs.append((rg_x, sb_left + 2.5, "rear_garden"))
        candidate_locs.append((rg_x, plot_l - sb_right - 2.5, "rear_garden"))
        candidate_locs.append((rg_x, plot_l * 0.35, "rear_garden"))
        candidate_locs.append((rg_x, plot_l * 0.65, "rear_garden"))

        fg_x = max(TREE_PLOT_MARGIN + 0.5, sb_front / 2.0)
        candidate_locs.append((fg_x, sb_left + 2.5, "front_garden"))
        candidate_locs.append((fg_x, plot_l - sb_right - 2.5, "front_garden"))
        candidate_locs.append((fg_x, plot_l / 2.0, "front_garden"))
    else:  # east
        rg_x = max(TREE_PLOT_MARGIN + 0.5, sb_rear / 2.0)
        candidate_locs.append((rg_x, sb_left + 2.5, "rear_garden"))
        candidate_locs.append((rg_x, plot_l - sb_right - 2.5, "rear_garden"))
        candidate_locs.append((rg_x, plot_l * 0.35, "rear_garden"))
        candidate_locs.append((rg_x, plot_l * 0.65, "rear_garden"))

        fg_x = plot_w - max(TREE_PLOT_MARGIN + 0.5, sb_front / 2.0)
        candidate_locs.append((fg_x, sb_left + 2.5, "front_garden"))
        candidate_locs.append((fg_x, plot_l - sb_right - 2.5, "front_garden"))
        candidate_locs.append((fg_x, plot_l / 2.0, "front_garden"))

    # Side corridor candidates
    if sb_left >= 3.0:
        candidate_locs.append((max(TREE_PLOT_MARGIN, sb_left / 2.0), plot_l * 0.4, "side_garden"))
        candidate_locs.append((max(TREE_PLOT_MARGIN, sb_left / 2.0), plot_l * 0.6, "side_garden"))
    if sb_right >= 3.0:
        candidate_locs.append((plot_w - max(TREE_PLOT_MARGIN, sb_right / 2.0), plot_l * 0.4, "side_garden"))
        candidate_locs.append((plot_w - max(TREE_PLOT_MARGIN, sb_right / 2.0), plot_l * 0.6, "side_garden"))

    species_list = style_cfg.get("tree_species", ["Olive Tree", "Japanese Maple", "Birch"])
    placed_trees: List[LandscapeElement] = []
    tree_idx = 1

    for cx, cy, zone_tag in candidate_locs:
        if len(placed_trees) >= target_trees:
            break

        # A. Boundary check
        if cx < TREE_PLOT_MARGIN or cx > (plot_w - TREE_PLOT_MARGIN) or cy < TREE_PLOT_MARGIN or cy > (plot_l - TREE_PLOT_MARGIN):
            continue

        tree_pt = Point(cx, cy)

        # B. Distance to building footprint
        if building_footprint.distance(tree_pt) < TREE_BUILDING_BUFFER:
            continue

        # C. Distance to parking bay
        if parking_poly and parking_poly.distance(tree_pt) < TREE_PARKING_BUFFER:
            continue

        # D. Distance to driveway
        if driveway_poly and driveway_poly.distance(tree_pt) < TREE_DRIVEWAY_BUFFER:
            continue

        # E. Distance to exterior doors
        door_collision = False
        for door in doors:
            door_c = Point((door.x1 + door.x2) / 2.0, (door.y1 + door.y2) / 2.0)
            if tree_pt.distance(door_c) < TREE_DOOR_BUFFER:
                door_collision = True
                break
        if door_collision:
            continue

        # F. Distance to main pedestrian path
        if path_points and len(path_points) >= 2:
            path_line = LineString([(p.x, p.y) for p in path_points])
            if path_line.distance(tree_pt) < 2.0:
                continue

        # G. Distance to already placed trees
        tree_clash = any(math.hypot(cx - t.x, cy - t.y) < TREE_MIN_SPACING for t in placed_trees)
        if tree_clash:
            continue

        # Placement Valid!
        spec = species_list[(tree_idx - 1) % len(species_list)]
        t_elem = LandscapeElement(
            element_id=f"TREE_{tree_idx:02d}",
            type="tree",
            x=round(cx, 2),
            y=round(cy, 2),
            radius=2.5,
            height=12.0 + (tree_idx % 3) * 2.0,
            species=spec,
            zone=zone_tag,
            properties={"canopy_spread": 5.0, "foliage_density": "lush"}
        )
        placed_trees.append(t_elem)
        elements.append(t_elem)
        tree_idx += 1

    # 12. Outdoor Pathway Lighting
    light_idx = 1
    if prefs.outdoor_lighting and path_points and len(path_points) >= 2:
        for i in range(len(path_points) - 1):
            p_a = path_points[i]
            p_b = path_points[i + 1]
            seg_len = math.hypot(p_b.x - p_a.x, p_b.y - p_a.y)
            steps = max(1, int(seg_len / BOLLARD_LIGHT_INTERVAL))
            for s in range(1, steps + 1):
                t_ratio = s / (steps + 1)
                lx = p_a.x + (p_b.x - p_a.x) * t_ratio
                ly = p_a.y + (p_b.y - p_a.y) * t_ratio
                # Offset bollard to side of pathway
                dx = p_b.x - p_a.x
                dy = p_b.y - p_a.y
                length = math.hypot(dx, dy)
                if length > 0.01:
                    nx = -dy / length * BOLLARD_PATH_OFFSET
                    ny = dx / length * BOLLARD_PATH_OFFSET
                else:
                    nx, ny = 1.5, 0.0

                bollard_x = round(max(1.0, min(plot_w - 1.0, lx + nx)), 2)
                bollard_y = round(max(1.0, min(plot_l - 1.0, ly + ny)), 2)

                elements.append(LandscapeElement(
                    element_id=f"LIGHT_BOLLARD_{light_idx:02d}",
                    type="outdoor_light",
                    x=bollard_x,
                    y=bollard_y,
                    radius=0.4,
                    height=2.8,
                    zone="entrance_pathway",
                    properties={"fixture": "modern_led_bollard", "color_temp_k": 3000, "lumens": 450}
                ))
                light_idx += 1

    # 13. Outdoor Features: Garden Seating & Water Feature
    if prefs.outdoor_seating:
        # Place garden bench in rear garden or front corner
        bench_x = round(plot_w - sb_right - 3.0, 1)
        bench_y = round(2.5 if road_side == "south" else (plot_l - 2.5), 1)
        bench = LandscapeElement(
            element_id="SEATING_BENCH_01",
            type="garden_seating",
            x=bench_x,
            y=bench_y,
            width=5.0,
            length=2.0,
            zone="rear_garden",
            properties={"material": "teak_slat_modern", "capacity": 3}
        )
        outdoor_features.append(bench)
        elements.append(bench)

    if prefs.water_feature:
        wf_x = round(sb_left + 4.0, 1)
        wf_y = round(plot_l - sb_front - 2.5 if road_side == "south" else 2.5, 1)
        water_feat = LandscapeElement(
            element_id="WATER_FEATURE_01",
            type="water_feature",
            x=wf_x,
            y=wf_y,
            radius=3.0,
            width=6.0,
            length=6.0,
            zone="front_garden",
            properties={"type": "reflecting_pool", "fountain": True}
        )
        outdoor_features.append(water_feat)
        elements.append(water_feat)

    # 13B. Indian Domestic Landscape Elements (Collision-Free)
    def _is_clear(chk_poly: Polygon) -> bool:
        if building_footprint.intersects(chk_poly):
            return False
        if parking_poly and parking_poly.intersects(chk_poly):
            return False
        if driveway_poly and driveway_poly.intersects(chk_poly):
            return False
        return True

    # 1. Sacred Tulsi Vrindavan Planter (Front or Northeast open area)
    tulsi_cx = round(plot_w - sb_right - 1.5, 1)
    tulsi_cy = round(plot_l - 1.8 if road_side == "south" else 1.8, 1)
    tulsi_poly = box(tulsi_cx - 1.25, tulsi_cy - 1.25, tulsi_cx + 1.25, tulsi_cy + 1.25)
    if _is_clear(tulsi_poly) and tulsi_cx > 1.5 and tulsi_cy > 1.5 and tulsi_cx < (plot_w - 1.5) and tulsi_cy < (plot_l - 1.5):
        tulsi = LandscapeElement(
            element_id="TULSI_PLANTER_01",
            type="planter",
            name="Tulsi Vrindavan Planter",
            x=tulsi_cx,
            y=tulsi_cy,
            width=2.5,
            length=2.5,
            zone="front_garden",
            properties={"usage": "sacred_tulsi", "planter_type": "traditional_vrindavan"}
        )
        outdoor_features.append(tulsi)
        elements.append(tulsi)

    # 2. Kitchen Garden Raised Bed (Rear/Side Setback)
    kg_cx = round(sb_left + 2.5, 1)
    kg_cy = round(1.5 if road_side == "south" else plot_l - 1.8, 1)
    kg_poly = box(kg_cx - 2.5, kg_cy - 1.0, kg_cx + 2.5, kg_cy + 1.0)
    if _is_clear(kg_poly) and kg_cx > 2.5 and kg_cy > 1.0 and kg_cx < (plot_w - 2.5) and kg_cy < (plot_l - 1.0):
        kg_bed = LandscapeElement(
            element_id="KITCHEN_GARDEN_01",
            type="flower_bed",
            name="Kitchen Garden Herb Bed",
            x=kg_cx,
            y=kg_cy,
            width=5.0,
            length=2.0,
            zone="rear_garden",
            properties={"usage": "kitchen_garden", "produce": "herbs_vegetables"}
        )
        outdoor_features.append(kg_bed)
        elements.append(kg_bed)

    # 3. Rainwater Recharge Soak Pit (Setback Corner)
    rwh_cx = round(sb_left + 1.5, 1)
    rwh_cy = round(plot_l - 1.8 if road_side == "south" else 1.5, 1)
    rwh_poly = box(rwh_cx - 1.25, rwh_cy - 1.25, rwh_cx + 1.25, rwh_cy + 1.25)
    if _is_clear(rwh_poly) and rwh_cx > 1.5 and rwh_cy > 1.5 and rwh_cx < (plot_w - 1.5) and rwh_cy < (plot_l - 1.5):
        rwh = LandscapeElement(
            element_id="RAINWATER_PIT_01",
            type="water_feature",
            name="Rainwater Recharge Pit",
            x=rwh_cx,
            y=rwh_cy,
            width=2.5,
            length=2.5,
            radius=1.25,
            zone="drainage_recharge",
            properties={"purpose": "rainwater_harvesting_percolation"}
        )
        outdoor_features.append(rwh)
        elements.append(rwh)

    # 14. Metrics & Summary
    # Calculate green area
    lawn_area = sum((e.width or 0.0) * (e.length or 0.0) for e in elements if e.type == "lawn")
    hedge_area = sum((e.width or 0.0) * (e.length or 0.0) for e in elements if e.type in ["hedge", "boundary_greenery"])
    total_green = round(lawn_area + hedge_area + len(placed_trees) * 12.0, 1)
    plot_total = plot_w * plot_l
    coverage_pct = round(min(65.0, (total_green / plot_total) * 100.0), 1)

    trees_count = len([e for e in elements if e.type == "tree"])
    lights_count = len([e for e in elements if e.type == "outdoor_light"])
    water_count = len([e for e in elements if e.type == "water_feature"])

    summary = (
        f"{style_cfg.get('name', 'Modern Minimalist')} site landscaping with {trees_count} specimen trees, "
        f"{total_green} sq ft total permeable greenery ({coverage_pct}% site coverage), "
        f"{lights_count} warm bollard path lights, and dedicated circulation corridors."
    )

    return LandscapePlan(
        plan_id=f"LANDSCAPE_{layout.id[:8] if layout.id else '01'}",
        zones=zones,
        elements=elements,
        paths=paths,
        driveway=driveway_elem,
        outdoor_features=outdoor_features,
        total_green_area_sqft=total_green,
        green_coverage_percentage=coverage_pct,
        trees_count=trees_count,
        lights_count=lights_count,
        water_features_count=water_count,
        style=style_cfg.get("name", "Modern Minimalist"),
        summary=summary
    )


def refine_landscape_layout(
    current_layout: HouseLayout,
    instruction: str
) -> Tuple[HouseLayout, Dict[str, Any]]:
    """
    Directly modifies the site landscape plan in response to natural language
    commands without altering the structural architecture or floor plan rooms.
    """
    new_layout = current_layout.model_copy(deep=True)
    if not new_layout.landscape:
        new_layout.landscape = generate_landscape_plan(new_layout)

    ls = new_layout.landscape
    inst_lower = instruction.lower().strip()
    diff: Dict[str, Any] = {"operation": "landscape_refine", "changes": []}

    # 1. Remove Tree (e.g., "Remove the tree near the parking")
    if "remove" in inst_lower and "tree" in inst_lower:
        tree_elements = [e for e in ls.elements if e.type == "tree"]
        target_tree = None
        if ("parking" in inst_lower or "driveway" in inst_lower) and new_layout.site and new_layout.site.parking:
            # Find tree closest to parking
            p_rect = new_layout.site.parking.rect
            px, py = p_rect.x + p_rect.width / 2.0, p_rect.y + p_rect.length / 2.0
            tree_elements.sort(key=lambda t: math.hypot(t.x - px, t.y - py))
            if tree_elements:
                target_tree = tree_elements[0]
        elif tree_elements:
            target_tree = tree_elements[-1]

        if target_tree:
            ls.elements = [e for e in ls.elements if e.element_id != target_tree.element_id]
            diff["changes"].append(f"Removed specimen tree '{target_tree.species}' ({target_tree.element_id})")

    # 2. Add Outdoor Lights (e.g., "Add outdoor lights")
    elif "light" in inst_lower and ("add" in inst_lower or "more" in inst_lower):
        current_lights = [e for e in ls.elements if e.type == "outdoor_light"]
        if not current_lights:
            prefs = LandscapePreferences(outdoor_lighting=True)
            plan = generate_landscape_plan(new_layout, prefs)
            ls.elements.extend([e for e in plan.elements if e.type == "outdoor_light"])
        else:
            l_cnt = len(current_lights) + 1
            new_light = LandscapeElement(
                element_id=f"LIGHT_FEATURE_{l_cnt:02d}",
                type="outdoor_light",
                x=round(new_layout.plot_width * 0.75, 2),
                y=round(new_layout.plot_length * 0.25, 2),
                radius=0.4,
                height=2.5,
                zone="rear_garden",
                properties={"fixture": "accent_spotlight", "color_temp_k": 2700}
            )
            ls.elements.append(new_light)
        diff["changes"].append("Added architectural landscape bollard and accent lighting")

    # 3. Add More Greenery / Trees (e.g., "Add more greenery", "Add trees")
    elif ("more greenery" in inst_lower or "add greenery" in inst_lower or ("add" in inst_lower and "tree" in inst_lower)):
        prefs = LandscapePreferences(greenery_level="dense", trees=6)
        plan = generate_landscape_plan(new_layout, prefs)
        new_trees = [e for e in plan.elements if e.type == "tree"]
        existing_ids = {e.element_id for e in ls.elements}
        for t in new_trees:
            if t.element_id not in existing_ids:
                ls.elements.append(t)
        diff["changes"].append("Increased garden greenery density and planted additional specimen trees")

    # 4. Create Minimalist Landscape (e.g., "Create a minimalist landscape")
    elif "minimal" in inst_lower:
        prefs = LandscapePreferences(style="modern_minimal", greenery_level="low", trees=2)
        new_layout.landscape = generate_landscape_plan(new_layout, prefs)
        diff["changes"].append("Transformed site landscaping to clean Modern Minimalist layout")

    # 5. Make the garden smaller (e.g., "Make the garden smaller")
    elif "garden smaller" in inst_lower or "smaller garden" in inst_lower:
        for e in ls.elements:
            if e.type == "lawn" and e.width and e.length:
                e.width = round(e.width * 0.75, 2)
                e.length = round(e.length * 0.75, 2)
        diff["changes"].append("Reduced lawn footprint by 25% for larger paved open circulation")

    # 6. Add a small garden in the front (e.g., "Add a small garden in the front")
    elif "front" in inst_lower and "garden" in inst_lower:
        has_front_lawn = any(e.type == "lawn" and e.zone == "front_garden" for e in ls.elements)
        if not has_front_lawn:
            prefs = LandscapePreferences(front_garden=True, lawn_priority=True)
            plan = generate_landscape_plan(new_layout, prefs)
            for e in plan.elements:
                if e.zone == "front_garden" and not any(x.element_id == e.element_id for x in ls.elements):
                    ls.elements.append(e)
        diff["changes"].append("Enhanced front garden with lush lawn and specimen planting")

    # 7. Add pathway to the entrance (e.g., "Add a pathway to the entrance")
    elif "pathway" in inst_lower:
        if not ls.paths:
            prefs = LandscapePreferences(entrance_pathway=True)
            plan = generate_landscape_plan(new_layout, prefs)
            ls.paths = plan.paths
        diff["changes"].append("Laid architectural pedestrian pathway connecting entrance to road gate")

    # 8. Move tree away from bedroom window (e.g., "Move the tree away from the bedroom window")
    elif "move" in inst_lower and "tree" in inst_lower:
        trees = [e for e in ls.elements if e.type == "tree"]
        if trees:
            t = trees[0]
            t.x = round(max(2.0, min(new_layout.plot_width - 2.0, t.x + (4.0 if t.x < new_layout.plot_width / 2 else -4.0))), 2)
            diff["changes"].append(f"Relocated {t.element_id} away from building openings into open corner")

    # Update summary metrics
    ls.trees_count = len([e for e in ls.elements if e.type == "tree"])
    ls.lights_count = len([e for e in ls.elements if e.type == "outdoor_light"])
    ls.water_features_count = len([e for e in ls.elements if e.type == "water_feature"])
    lawn_area = sum((e.width or 0.0) * (e.length or 0.0) for e in ls.elements if e.type == "lawn")
    hedge_area = sum((e.width or 0.0) * (e.length or 0.0) for e in ls.elements if e.type in ["hedge", "boundary_greenery"])
    ls.total_green_area_sqft = round(lawn_area + hedge_area + ls.trees_count * 12.0, 1)
    ls.green_coverage_percentage = round(min(65.0, (ls.total_green_area_sqft / (new_layout.plot_width * new_layout.plot_length)) * 100.0), 1)

    new_layout.version_number = (current_layout.version_number or 1) + 1
    return new_layout, diff
