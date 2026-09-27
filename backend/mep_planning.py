"""Deterministic, preliminary MEP layout generation and reconciliation."""

from __future__ import annotations

import hashlib
import math
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from models import (
    Door,
    FloorPlan,
    HouseLayout,
    MEPPlan,
    MEPPoint,
    MEPRoute,
    MEPVerticalStack,
    MEPRoomAssociation,
    Point2D,
    Room,
    Wall,
    Window,
)


_NON_CONDITIONED_ROOMS = {"balcony", "patio", "parking"}
_HABITABLE_ROOMS = {
    "living_room", "family_lounge", "dining", "master_bedroom", "bedroom",
    "guest_bedroom", "office", "hallway", "entry_foyer",
}
_PRELIMINARY_METADATA = {
    "planning_stage": "preliminary",
    "certified": False,
    "disclaimer": "For preliminary coordination only; requires licensed engineering and code review.",
}


def _key_id(prefix: str, key: str) -> str:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]
    return f"mep-{prefix}-{digest}"


def _identity_key(entity: object) -> Optional[str]:
    explicit = getattr(entity, "semantic_key", None)
    if explicit:
        return explicit
    required = ("floor_id", "room_id", "category", "kind")
    if all(getattr(entity, field, None) is not None for field in required):
        return "|".join(str(getattr(entity, field)) for field in required)
    return None


def _rooms_on_floor(layout: HouseLayout, floor: FloorPlan) -> Iterable[Room]:
    if floor.rooms:
        return floor.rooms
    if len(layout.floors) <= 1:
        return layout.rooms
    return ()


def _walls_on_floor(layout: HouseLayout, floor: FloorPlan) -> Sequence[Wall]:
    if floor.walls:
        return floor.walls
    if len(layout.floors) <= 1:
        return layout.walls
    return ()


def _inside(room: Room, x: float, y: float) -> bool:
    rect = room.rect
    return bool(
        rect
        and rect.width > 0
        and rect.length > 0
        and rect.x - 1e-7 <= x <= rect.right + 1e-7
        and rect.y - 1e-7 <= y <= rect.bottom + 1e-7
    )


def _room_point(room: Room, x_fraction: float, y_fraction: float) -> Point2D:
    rect = room.rect
    assert rect is not None
    inset_x = min(0.5, rect.width / 4.0)
    inset_y = min(0.5, rect.length / 4.0)
    x = rect.x + inset_x + max(0.0, min(1.0, x_fraction)) * (rect.width - 2 * inset_x)
    y = rect.y + inset_y + max(0.0, min(1.0, y_fraction)) * (rect.length - 2 * inset_y)
    return Point2D(x=round(x, 3), y=round(y, 3))


def _wall_segment(wall: Wall) -> Tuple[float, float, float, float]:
    return (
        float(wall.start.x if wall.start else wall.x1),
        float(wall.start.y if wall.start else wall.y1),
        float(wall.end.x if wall.end else wall.x2),
        float(wall.end.y if wall.end else wall.y2),
    )


def _is_room_boundary(wall: Wall, room: Room) -> bool:
    if not room.rect:
        return False
    x1, y1, x2, y2 = _wall_segment(wall)
    epsilon = 0.05
    return (
        (abs(y1 - y2) < epsilon and (abs(y1 - room.rect.y) < epsilon or abs(y1 - room.rect.bottom) < epsilon))
        or (abs(x1 - x2) < epsilon and (abs(x1 - room.rect.x) < epsilon or abs(x1 - room.rect.right) < epsilon))
    )


def _point_on_wall(point: Point2D, wall: Wall) -> bool:
    x1, y1, x2, y2 = _wall_segment(wall)
    if abs(y1 - y2) <= 0.05:
        return abs(point.y - y1) < 0.15 and min(x1, x2) - 0.05 <= point.x <= max(x1, x2) + 0.05
    if abs(x1 - x2) <= 0.05:
        return abs(point.x - x1) < 0.15 and min(y1, y2) - 0.05 <= point.y <= max(y1, y2) + 0.05
    return False


def _opening_rectangles(
    room: Room, walls: Sequence[Wall], doors: Sequence[Door], windows: Sequence[Window]
) -> List[Tuple[str, float, float, float, float]]:
    walls_by_id = {wall.id: wall for wall in walls}
    rectangles = []
    for opening in list(doors) + list(windows):
        wall_id = opening.host_wall_id or opening.wall_id
        wall = walls_by_id.get(wall_id) if wall_id else None
        if opening.position:
            center_x, center_y = opening.position.x, opening.position.y
        elif wall:
            x1, y1, x2, y2 = _wall_segment(wall)
            fraction = max(0.0, min(1.0, opening.position_along_wall))
            center_x = x1 + (x2 - x1) * fraction
            center_y = y1 + (y2 - y1) * fraction
        elif opening.x or opening.y:
            center_x, center_y = opening.x, opening.y
        else:
            continue
        half_width = max(0.5, float(opening.width) / 2.0)
        depth = max(0.4, float(wall.thickness) if wall else 0.4)
        if wall and abs(wall.x1 - wall.x2) < abs(wall.y1 - wall.y2):
            bounds = (center_x - depth, center_y - half_width, center_x + depth, center_y + half_width)
        elif wall:
            bounds = (center_x - half_width, center_y - depth, center_x + half_width, center_y + depth)
        else:
            bounds = (
                center_x - half_width, center_y - half_width,
                center_x + half_width, center_y + half_width,
            )
        rect = room.rect
        if rect and bounds[0] <= rect.right and bounds[2] >= rect.x and bounds[1] <= rect.bottom and bounds[3] >= rect.y:
            rectangles.append((opening.id, *bounds))
    return rectangles


def _inside_opening(point: Point2D, openings: Sequence[Tuple[str, float, float, float, float]]) -> bool:
    return any(x1 <= point.x <= x2 and y1 <= point.y <= y2 for _, x1, y1, x2, y2 in openings)


def _segment_hits_opening(
    a: Point2D, b: Point2D, opening: Tuple[str, float, float, float, float]
) -> bool:
    _, x1, y1, x2, y2 = opening
    if abs(a.y - b.y) < 0.001:
        return y1 <= a.y <= y2 and max(min(a.x, b.x), x1) <= min(max(a.x, b.x), x2)
    if abs(a.x - b.x) < 0.001:
        return x1 <= a.x <= x2 and max(min(a.y, b.y), y1) <= min(max(a.y, b.y), y2)
    return False


def _clear_point(
    room: Room,
    point: Point2D,
    walls: Sequence[Wall],
    openings: Sequence[Tuple[str, float, float, float, float]],
) -> Point2D:
    blocking = [wall for wall in walls if not _is_room_boundary(wall, room)]
    if not any(_point_on_wall(point, wall) for wall in blocking) and not _inside_opening(point, openings):
        return point
    rect = room.rect
    assert rect is not None
    candidates = [
        _room_point(room, xf, yf)
        for xf, yf in ((0.2, 0.2), (0.8, 0.2), (0.2, 0.8), (0.8, 0.8),
                       (0.5, 0.2), (0.5, 0.8), (0.2, 0.5), (0.8, 0.5), (0.5, 0.5))
    ]
    candidates = [p for p in candidates if _inside(room, p.x, p.y)]
    candidates.sort(key=lambda p: ((p.x - point.x) ** 2 + (p.y - point.y) ** 2, p.x, p.y))
    return next(
        (candidate for candidate in candidates
         if not any(_point_on_wall(candidate, wall) for wall in blocking)
         and not _inside_opening(candidate, openings)),
        point,
    )


def _segment_crosses_wall(a: Point2D, b: Point2D, wall: Wall) -> bool:
    x1, y1, x2, y2 = _wall_segment(wall)
    epsilon = 0.05
    if abs(y1 - y2) <= epsilon and abs(a.y - b.y) <= epsilon:
        return abs(a.y - y1) <= epsilon and max(min(a.x, b.x), min(x1, x2)) < min(max(a.x, b.x), max(x1, x2))
    if abs(x1 - x2) <= epsilon and abs(a.x - b.x) <= epsilon:
        return abs(a.x - x1) <= epsilon and max(min(a.y, b.y), min(y1, y2)) < min(max(a.y, b.y), max(y1, y2))
    if abs(y1 - y2) <= epsilon and abs(a.x - b.x) <= epsilon:
        return min(a.x, b.x) + epsilon < x1 < max(a.x, b.x) - epsilon and min(y1, y2) - epsilon <= a.y <= max(y1, y2) + epsilon
    if abs(x1 - x2) <= epsilon and abs(a.y - b.y) <= epsilon:
        return min(a.y, b.y) + epsilon < y1 < max(a.y, b.y) - epsilon and min(x1, x2) - epsilon <= a.x <= max(x1, x2) + epsilon
    return False


def _route_between(
    room: Room,
    a: Point2D,
    b: Point2D,
    walls: Sequence[Wall],
    openings: Sequence[Tuple[str, float, float, float, float]],
) -> List[Point2D]:
    """Choose a deterministic Manhattan path with the fewest wall crossings."""
    rect = room.rect
    assert rect is not None
    inset_x = min(0.5, rect.width / 4.0)
    inset_y = min(0.5, rect.length / 4.0)
    candidates = [
        [a, Point2D(x=b.x, y=a.y), b],
        [a, Point2D(x=a.x, y=b.y), b],
        [a, Point2D(x=a.x, y=rect.y + inset_y), Point2D(x=b.x, y=rect.y + inset_y), b],
        [a, Point2D(x=a.x, y=rect.bottom - inset_y), Point2D(x=b.x, y=rect.bottom - inset_y), b],
        [a, Point2D(x=rect.x + inset_x, y=a.y), Point2D(x=rect.x + inset_x, y=b.y), b],
        [a, Point2D(x=rect.right - inset_x, y=a.y), Point2D(x=rect.right - inset_x, y=b.y), b],
    ]
    interior_walls = [wall for wall in walls if not _is_room_boundary(wall, room)]

    def normalized(path: List[Point2D]) -> List[Point2D]:
        result: List[Point2D] = []
        for point in path:
            point = Point2D(x=round(point.x, 3), y=round(point.y, 3))
            if not _inside(room, point.x, point.y):
                return []
            if not result or point != result[-1]:
                result.append(point)
        return result

    evaluated = []
    for index, path in enumerate(candidates):
        points = normalized(path)
        if not points:
            continue
        crossings = sum(
            1 for start, end in zip(points, points[1:])
            for wall in interior_walls
            if _segment_crosses_wall(start, end, wall)
        )
        opening_crossings = sum(
            1 for start, end in zip(points, points[1:])
            for opening in openings
            if _segment_hits_opening(start, end, opening)
        )
        distance = sum(math.hypot(end.x - start.x, end.y - start.y) for start, end in zip(points, points[1:]))
        evaluated.append(((crossings, opening_crossings, round(distance, 6), index), points))
    return min(evaluated, key=lambda item: item[0])[1] if evaluated else [a, b]


def _room_definitions(room: Room) -> List[Tuple[str, str, float, float]]:
    room_type = str(room.type)
    definitions: List[Tuple[str, str, float, float]] = []
    if room_type not in _NON_CONDITIONED_ROOMS:
        definitions.extend([
            ("electrical", "light", 0.5, 0.5),
            ("electrical", "switch", 0.08, 0.5),
        ])
        if room_type in {"living_room", "family_lounge", "dining", "master_bedroom", "bedroom", "guest_bedroom", "office", "kitchen"}:
            definitions.append(("electrical", "outlet", 0.12, 0.12))
        if room_type in _HABITABLE_ROOMS:
            definitions.extend([
                ("electrical", "fan", 0.5, 0.5),
                ("electrical", "ac_point", 0.88, 0.12),
            ])

    if room_type == "bathroom":
        definitions.extend([
            ("plumbing", "wc", 0.25, 0.25),
            ("plumbing", "basin", 0.72, 0.25),
            ("plumbing", "shower", 0.25, 0.72),
            ("plumbing", "floor_drain", 0.78, 0.78),
            ("plumbing", "supply", 0.72, 0.72),
            ("plumbing", "waste", 0.25, 0.82),
            ("hvac", "exhaust", 0.78, 0.22),
            ("hvac", "ventilation", 0.22, 0.22),
        ])
    elif room_type == "powder_room":
        definitions.extend([
            ("plumbing", "wc", 0.3, 0.3),
            ("plumbing", "basin", 0.7, 0.3),
            ("plumbing", "floor_drain", 0.75, 0.75),
            ("plumbing", "supply", 0.7, 0.7),
            ("plumbing", "waste", 0.3, 0.8),
            ("hvac", "exhaust", 0.75, 0.2),
            ("hvac", "ventilation", 0.25, 0.2),
        ])
    elif room_type == "kitchen":
        definitions.extend([
            ("plumbing", "sink", 0.22, 0.22),
            ("plumbing", "supply", 0.22, 0.28),
            ("plumbing", "waste", 0.22, 0.36),
            ("plumbing", "floor_drain", 0.78, 0.78),
            ("hvac", "exhaust", 0.78, 0.2),
            ("hvac", "ventilation", 0.22, 0.2),
        ])
    elif room_type == "utility":
        definitions.extend([
            ("plumbing", "supply", 0.22, 0.22),
            ("plumbing", "waste", 0.78, 0.78),
            ("plumbing", "floor_drain", 0.78, 0.78),
            ("hvac", "exhaust", 0.78, 0.2),
            ("hvac", "ventilation", 0.22, 0.2),
        ])

    if room_type in _HABITABLE_ROOMS:
        definitions.extend([
            ("hvac", "supply", 0.25, 0.5),
            ("hvac", "return", 0.75, 0.5),
            ("hvac", "indoor_ac", 0.8, 0.2),
            ("hvac", "outdoor_ac", 0.95, 0.8),
            ("hvac", "ventilation", 0.5, 0.08),
        ])
    return definitions


def _floor_list(layout: HouseLayout) -> List[FloorPlan]:
    if layout.floors:
        return sorted(layout.floors, key=lambda item: (item.floor_number, item.floor_id or ""))
    return [
        FloorPlan(
            floor_id="floor_1",
            floor_number=1,
            rooms=layout.rooms,
            walls=layout.walls,
            doors=layout.doors,
            windows=layout.windows,
        )
    ]


def _wet_room_family(room: Room) -> Optional[str]:
    if room.type in {"bathroom", "powder_room"}:
        return "bathroom"
    if room.type in {"kitchen", "utility"}:
        return "kitchen"
    return None


def _aligned_wet_groups(
    layout: HouseLayout, floors: Sequence[FloorPlan]
) -> List[List[Tuple[FloorPlan, Room]]]:
    """Greedily associate wet rooms on neighboring modeled floors by plan proximity."""
    groups: List[List[Tuple[FloorPlan, Room]]] = []
    groups_by_family: Dict[str, List[List[Tuple[FloorPlan, Room]]]] = {}
    for floor in floors:
        floor_rooms = [
            room for room in _rooms_on_floor(layout, floor)
            if room.rect and room.rect.width > 0 and room.rect.length > 0 and _wet_room_family(room)
        ]
        floor_rooms.sort(key=lambda room: room.id)
        families = sorted({str(_wet_room_family(room)) for room in floor_rooms})
        for family in families:
            room_groups = groups_by_family.setdefault(family, [])
            available = [group for group in room_groups if group[-1][0].floor_number < floor.floor_number]
            candidates = []
            for room in floor_rooms:
                if _wet_room_family(room) != family:
                    continue
                for group in available:
                    last_floor, last_room = group[-1]
                    if last_floor.floor_number >= floor.floor_number or last_room.rect is None:
                        continue
                    distance = math.hypot(
                        room.rect.center.x - last_room.rect.center.x,
                        room.rect.center.y - last_room.rect.center.y,
                    )
                    if distance <= 6.0:
                        candidates.append((round(distance, 6), room.id, last_room.id, group, room))
            used_rooms = set()
            used_groups = set()
            for _, room_id, _, group, room in sorted(candidates, key=lambda item: item[:3]):
                if room_id in used_rooms or id(group) in used_groups:
                    continue
                group.append((floor, room))
                used_rooms.add(room_id)
                used_groups.add(id(group))
            for room in floor_rooms:
                if _wet_room_family(room) == family and room.id not in used_rooms:
                    group = [(floor, room)]
                    room_groups.append(group)
                    groups.append(group)
    return [group for group in groups if len(group) > 1]


def _common_stack_position(
    layout: HouseLayout, group: Sequence[Tuple[FloorPlan, Room]]
) -> Optional[Point2D]:
    left = max(room.rect.x for _, room in group if room.rect)
    top = max(room.rect.y for _, room in group if room.rect)
    right = min(room.rect.right for _, room in group if room.rect)
    bottom = min(room.rect.bottom for _, room in group if room.rect)
    if right - left < 0.2 or bottom - top < 0.2:
        return None
    xs = sorted({round(left + (right - left) * fraction, 3) for fraction in (0.2, 0.35, 0.5, 0.65, 0.8)})
    ys = sorted({round(top + (bottom - top) * fraction, 3) for fraction in (0.2, 0.35, 0.5, 0.65, 0.8)})
    target_x, target_y = (left + right) / 2.0, (top + bottom) / 2.0
    candidates = sorted(
        (Point2D(x=x, y=y) for x in xs for y in ys),
        key=lambda point: ((point.x - target_x) ** 2 + (point.y - target_y) ** 2, point.x, point.y),
    )
    for candidate in candidates:
        clear_for_all = True
        for floor, room in group:
            floor_walls = _walls_on_floor(layout, floor)
            doors = floor.doors if floor.doors else (layout.doors if len(layout.floors) <= 1 else [])
            windows = floor.windows if floor.windows else (layout.windows if len(layout.floors) <= 1 else [])
            openings = _opening_rectangles(room, floor_walls, doors, windows)
            if (
                not _inside(room, candidate.x, candidate.y)
                or _inside_opening(candidate, openings)
                or any(
                    _point_on_wall(candidate, wall)
                    for wall in floor_walls
                    if not _is_room_boundary(wall, room)
                )
            ):
                clear_for_all = False
                break
        if clear_for_all:
            return candidate
    return None


def reconcile_mep_plan(
    layout: HouseLayout, existing_plan: Optional[MEPPlan] = None
) -> MEPPlan:
    """Regenerate preliminary room services while retaining IDs for matching entities.

    Only generated entities are rebuilt. Existing manually-authored entities are retained
    while their referenced room/floor still exists; room-dependent stale entities are dropped.
    """
    previous = existing_plan if existing_plan is not None else layout.mep_plan
    prior_points = previous.points if previous else []
    prior_routes = previous.routes if previous else []
    prior_stacks = previous.vertical_stacks if previous else []
    point_ids = {_identity_key(item): item.id for item in prior_points if _identity_key(item)}
    route_ids = {_identity_key(item): item.id for item in prior_routes if _identity_key(item)}
    stack_ids = {item.semantic_key: item.id for item in prior_stacks if item.semantic_key}

    generated_points: List[MEPPoint] = []
    generated_routes: List[MEPRoute] = []
    live_rooms: set[Tuple[str, str]] = set()
    floors = _floor_list(layout)

    for floor in floors:
        floor_id = floor.floor_id or f"floor_{floor.floor_number}"
        walls = _walls_on_floor(layout, floor)
        doors = floor.doors if floor.doors else (layout.doors if len(layout.floors) <= 1 else [])
        windows = floor.windows if floor.windows else (layout.windows if len(layout.floors) <= 1 else [])
        rooms = sorted(_rooms_on_floor(layout, floor), key=lambda item: item.id)
        valid_rooms = [room for room in rooms if room.rect and room.rect.width > 0 and room.rect.length > 0]
        by_category: Dict[str, List[MEPPoint]] = {}
        for room in valid_rooms:
            if not room.rect or room.rect.width <= 0 or room.rect.length <= 0:
                continue
            live_rooms.add((floor_id, room.id))
            openings = _opening_rectangles(room, walls, doors, windows)
            for category, kind, xf, yf in _room_definitions(room):
                semantic_key = "|".join((floor_id, room.id, category, kind))
                raw_position = _room_point(room, xf, yf)
                position = _clear_point(room, raw_position, walls, openings)
                identity = semantic_key
                point = MEPPoint(
                    id=point_ids.get(identity, _key_id("point", identity)),
                    category=category,
                    kind=kind,
                    position=position,
                    floor_id=floor_id,
                    floor_number=floor.floor_number,
                    room_id=room.id,
                    semantic_key=semantic_key,
                    metadata=dict(_PRELIMINARY_METADATA),
                )
                generated_points.append(point)
                by_category.setdefault(category, []).append(point)

        board_room = next(
            (room for room in valid_rooms if room.type == "entry_foyer"),
            next(
                (room for room in valid_rooms if room.type == "staircase"),
                next((room for room in valid_rooms if room.type not in _NON_CONDITIONED_ROOMS), None),
            ),
        )
        if board_room:
            semantic_key = "|".join((floor_id, board_room.id, "electrical", "distribution_board"))
            position = _clear_point(
                board_room,
                _room_point(board_room, 0.12, 0.12),
                walls,
                _opening_rectangles(board_room, walls, doors, windows),
            )
            generated_points.append(
                MEPPoint(
                    id=point_ids.get(semantic_key, _key_id("point", semantic_key)),
                    category="electrical",
                    kind="distribution_board",
                    position=position,
                    floor_id=floor_id,
                    floor_number=floor.floor_number,
                    room_id=board_room.id,
                    semantic_key=semantic_key,
                    metadata=dict(_PRELIMINARY_METADATA),
                )
            )

        for room in valid_rooms:
            for category, points in by_category.items():
                room_points = [item for item in points if item.room_id == room.id]
                if len(room_points) < 2:
                    continue
                room_openings = _opening_rectangles(room, walls, doors, windows)
                room_points.sort(key=lambda item: item.semantic_key or "")
                route_kind = "room_branch"
                route_key = "|".join((floor_id, room.id, category, route_kind))
                route_points: List[Point2D] = []
                for start, end in zip(room_points, room_points[1:]):
                    segment = _route_between(room, start.position, end.position, walls, room_openings)
                    if route_points and segment and route_points[-1] == segment[0]:
                        route_points.extend(segment[1:])
                    else:
                        route_points.extend(segment)
                generated_routes.append(
                    MEPRoute(
                        id=route_ids.get(route_key, _key_id("route", route_key)),
                        category=category,
                        kind=route_kind,
                        points=route_points,
                        floor_id=floor_id,
                        floor_number=floor.floor_number,
                        room_id=room.id,
                        point_ids=[item.id for item in room_points],
                        semantic_key=route_key,
                        metadata={
                            **_PRELIMINARY_METADATA,
                            "wall_ids_considered": [wall.id for wall in walls],
                            "opening_ids_considered": [opening[0] for opening in room_openings],
                        },
                    )
                )

    generated_stacks: List[MEPVerticalStack] = []
    aligned_room_refs = set()
    for group in _aligned_wet_groups(layout, floors):
        shared_position = _common_stack_position(layout, group)
        if shared_position is None:
            continue
        anchor_floor, anchor_room = group[0]
        family = str(_wet_room_family(anchor_room))
        floor_id = anchor_floor.floor_id or f"floor_{anchor_floor.floor_number}"
        for stack_kind, point_kind in (
            ("soil_waste_stack", "soil_waste_stack"),
            ("water_supply_stack", "water_supply_stack"),
        ):
            stack_key = "|".join((floor_id, anchor_room.id, family, stack_kind))
            associations = []
            for member_floor, room in group:
                member_floor_id = member_floor.floor_id or f"floor_{member_floor.floor_number}"
                aligned_room_refs.add((member_floor_id, room.id))
                semantic_key = "|".join((member_floor_id, room.id, "plumbing", "stack", stack_key))
                point = MEPPoint(
                    id=point_ids.get(semantic_key, _key_id("point", semantic_key)),
                    category="plumbing",
                    kind="stack",
                    position=shared_position,
                    floor_id=member_floor_id,
                    floor_number=member_floor.floor_number,
                    room_id=room.id,
                    semantic_key=semantic_key,
                    metadata={**_PRELIMINARY_METADATA, "vertical_stack_key": stack_key, "stack_kind": point_kind},
                )
                generated_points.append(point)
                associations.append(
                    MEPRoomAssociation(
                        floor_id=member_floor_id,
                        floor_number=member_floor.floor_number,
                        room_id=room.id,
                        point_id=point.id,
                    )
                )
            generated_stacks.append(
                MEPVerticalStack(
                    id=stack_ids.get(stack_key, _key_id("stack", stack_key)),
                    kind=stack_kind,
                    room_associations=associations,
                    alignment=shared_position,
                    semantic_key=stack_key,
                    metadata={**_PRELIMINARY_METADATA, "alignment_tolerance_ft": 6.0},
                )
            )

    for floor in floors:
            floor_id = floor.floor_id or f"floor_{floor.floor_number}"
            walls = _walls_on_floor(layout, floor)
            doors = floor.doors if floor.doors else (layout.doors if len(layout.floors) <= 1 else [])
            windows = floor.windows if floor.windows else (layout.windows if len(layout.floors) <= 1 else [])
            for room in _rooms_on_floor(layout, floor):
                if (floor_id, room.id) in aligned_room_refs or not room.rect or not _wet_room_family(room):
                    continue
                semantic_key = "|".join((floor_id, room.id, "plumbing", "stack", "local"))
                generated_points.append(
                    MEPPoint(
                        id=point_ids.get(semantic_key, _key_id("point", semantic_key)),
                        category="plumbing",
                        kind="stack",
                        position=_clear_point(
                            room,
                            _room_point(room, 0.88, 0.88),
                            walls,
                            _opening_rectangles(room, walls, doors, windows),
                        ),
                        floor_id=floor_id,
                        floor_number=floor.floor_number,
                        room_id=room.id,
                        semantic_key=semantic_key,
                        metadata={**_PRELIMINARY_METADATA, "stack_kind": "local_waste_stack"},
                    )
                )

    retained_points = [
        item for item in prior_points
        if not item.generated and (item.floor_id, item.room_id) in live_rooms
    ]
    retained_routes = [
        item for item in prior_routes
        if not item.generated
        and (item.floor_id, item.room_id) in live_rooms
        and all(
            any(point.id == point_id for point in retained_points + generated_points)
            for point_id in item.point_ids
        )
    ]
    retained_stacks = [
        item for item in prior_stacks
        if not item.generated
        and all((association.floor_id, association.room_id) in live_rooms for association in item.room_associations)
        and all(
            any(point.id == association.point_id for point in retained_points + generated_points)
            for association in item.room_associations
        )
    ]
    return MEPPlan(
        points=generated_points + retained_points,
        routes=generated_routes + retained_routes,
        vertical_stacks=generated_stacks + retained_stacks,
        planning_stage="preliminary",
        certified=False,
        metadata=dict(_PRELIMINARY_METADATA),
    )


def generate_mep_plan(layout: HouseLayout) -> HouseLayout:
    """Return a layout copy with its canonical ``mep_plan`` generated or updated.

    The input is not mutated. The attached field is ``HouseLayout.mep_plan``
    (a typed ``MEPPlan`` containing ``points`` and ``routes``).
    """
    return layout.model_copy(update={"mep_plan": reconcile_mep_plan(layout)})
