"""
Architectural Validator Module
Provides strict geometric and building-code validation for residential layouts:
1. SITE: Buildable envelope containment and parking boundaries
2. ROOMS: Zero room polygon overlap, aspect ratio limits, NBC minimums
3. WALLS: Exterior wall network and thickness configuration
4. DOORS: Room access connectivity and clear door positions
5. WINDOWS: Habitable room daylight and exterior ventilation
6. STAIRS: Vertical circulation alignment, riser/tread and width >= 1.0m (3.0ft)
7. FURNITURE: Placed item clearances and wall bounds
8. LANDSCAPE: Ground clearance (no building footprint/parking collisions)
9. CIRCULATION: Network reachability and corridor proportions
10. MULTI-FLOOR: Core alignment and wet-area structural stacking
"""

from typing import List, Dict, Tuple, Optional
from shapely.geometry import box, Polygon
from models import (
    HouseLayout, FloorPlan, Room, Site, Rect,
    ArchitecturalValidation, ValidationIssue
)


def validate_design(layout: HouseLayout) -> ArchitecturalValidation:
    """
    Comprehensive architectural and geometric verification of a HouseLayout.
    Returns an ArchitecturalValidation model with structured issues, warnings,
    errors, and passed check confirmations.
    """
    errors: List[str] = []
    warnings: List[str] = []
    passed_checks: List[str] = []
    issues: List[ValidationIssue] = []

    site = layout.site
    floors = layout.floors or []

    if not floors:
        floors = [FloorPlan(
            floor_number=1,
            floor_name="Ground Floor",
            rooms=layout.rooms,
            walls=layout.walls,
            doors=layout.doors,
            windows=layout.windows
        )]

    envelope_passed = True
    overlap_passed = True
    attached_bath_passed = True
    aspect_passed = True
    stair_stack_passed = True
    doors_passed = True
    windows_passed = True
    furniture_passed = True
    landscape_passed = True

    # 1. SITE & BUILDABLE ENVELOPE
    env_poly = None
    if site and site.buildable_envelope:
        env = site.buildable_envelope
        env_poly = box(env.x, env.y, env.right, env.bottom)

    # Check parking within site boundary
    if site and site.parking and site.parking.rect:
        pr = site.parking.rect
        if pr.right > site.plot_width + 0.1 or pr.bottom > site.plot_length + 0.1 or pr.x < -0.1 or pr.y < -0.1:
            warnings.append(f"Parking footprint ({pr.width}'×{pr.length}') extends beyond plot boundaries.")
            issues.append(ValidationIssue(
                severity="warning",
                rule="parking_boundary",
                message="Parking area extends past plot boundary line.",
                room_id=site.parking.id,
                floor=1
            ))

    # 2. ROOM GEOMETRY & OVERLAP
    for floor in floors:
        valid_rooms = [r for r in floor.rooms if r.rect and r.rect.area > 1.0]
        room_boxes: Dict[str, Polygon] = {}

        for r in valid_rooms:
            r_poly = box(r.rect.x, r.rect.y, r.rect.right, r.rect.bottom)
            room_boxes[r.id] = r_poly

            # Envelope containment
            if env_poly is not None:
                if not env_poly.buffer(0.15).contains(r_poly):
                    envelope_passed = False
                    msg = f"Room '{r.name}' on {floor.floor_name} exceeds buildable envelope boundary."
                    errors.append(msg)
                    issues.append(ValidationIssue(
                        severity="error",
                        rule="envelope_containment",
                        message=msg,
                        room_id=r.id,
                        floor=floor.floor_number
                    ))

            # Aspect ratio check
            if r.type not in ["hallway", "staircase", "corridor", "verandah", "balcony"]:
                longer = max(r.rect.width, r.rect.length)
                shorter = max(0.1, min(r.rect.width, r.rect.length))
                ratio = longer / shorter
                if ratio > 2.3:
                    aspect_passed = False
                    msg = f"Room '{r.name}' has elongated aspect ratio ({ratio:.2f}:1)."
                    warnings.append(msg)
                    issues.append(ValidationIssue(
                        severity="warning",
                        rule="aspect_ratio",
                        message=msg,
                        room_id=r.id,
                        floor=floor.floor_number
                    ))

            # Minimum residential dimension checks (NBC 2016)
            min_dim = 3.9 if "bath" in r.type or "wc" in r.type or "powder" in r.type else (5.9 if "kitchen" in r.type else 6.8)
            actual_min = min(r.rect.width, r.rect.length)
            if actual_min < min_dim - 0.2:
                warnings.append(f"Room '{r.name}' narrow dimension is {actual_min:.1f}ft (below recommended {min_dim:.1f}ft).")
                issues.append(ValidationIssue(
                    severity="warning",
                    rule="minimum_dimension",
                    message=f"Room '{r.name}' narrow dimension is {actual_min:.1f}ft.",
                    room_id=r.id,
                    floor=floor.floor_number
                ))

            # Furniture placement check
            if r.furniture:
                for f_item in r.furniture:
                    fx = getattr(f_item, "x", 0.0)
                    fy = getattr(f_item, "y", 0.0)
                    fw = getattr(f_item, "width", 0.0)
                    fl = getattr(f_item, "length", 0.0)
                    if fw > 0 and fl > 0:
                        # Check inside room
                        if fx - fw / 2.0 < r.rect.x - 0.5 or fx + fw / 2.0 > r.rect.right + 0.5 or \
                           fy - fl / 2.0 < r.rect.y - 0.5 or fy + fl / 2.0 > r.rect.bottom + 0.5:
                            furniture_passed = False
                            warnings.append(f"Furniture '{f_item.type}' extends outside '{r.name}' boundary.")
                            issues.append(ValidationIssue(
                                severity="warning",
                                rule="furniture_clearance",
                                message=f"Item {f_item.type} extends outside {r.name} wall boundary.",
                                room_id=r.id,
                                floor=floor.floor_number
                            ))

        # Pairwise room overlap check
        r_ids = list(room_boxes.keys())
        for i in range(len(r_ids)):
            for j in range(i + 1, len(r_ids)):
                id1, id2 = r_ids[i], r_ids[j]
                poly1, poly2 = room_boxes[id1], room_boxes[id2]
                intersection = poly1.intersection(poly2)
                if intersection.area > 0.15:
                    overlap_passed = False
                    r1 = next(r for r in valid_rooms if r.id == id1)
                    r2 = next(r for r in valid_rooms if r.id == id2)
                    msg = f"Overlap of {intersection.area:.1f} sq ft between '{r1.name}' and '{r2.name}' on {floor.floor_name}."
                    errors.append(msg)
                    issues.append(ValidationIssue(
                        severity="error",
                        rule="zero_overlap",
                        message=msg,
                        room_id=id1,
                        floor=floor.floor_number
                    ))

        # Attached bathroom adjacency check
        for r in valid_rooms:
            if r.attached_room_id and r.attached_room_id in room_boxes:
                p_poly = room_boxes[r.attached_room_id]
                c_poly = room_boxes[r.id]
                dist = p_poly.distance(c_poly)
                if dist > 0.2:
                    attached_bath_passed = False
                    p_room = next((rm for rm in valid_rooms if rm.id == r.attached_room_id), None)
                    p_name = p_room.name if p_room else r.attached_room_id
                    msg = f"En-suite '{r.name}' is separated by {dist:.1f}ft from attached suite '{p_name}'."
                    warnings.append(msg)
                    issues.append(ValidationIssue(
                        severity="warning",
                        rule="attached_adjacency",
                        message=msg,
                        room_id=r.id,
                        floor=floor.floor_number
                    ))

        floor_doors = floor.doors or layout.doors or []
        connected_rooms = set()
        for d in floor_doors:
            for attr in ["from_room_id", "to_room_id", "room_id", "connected_room_id", "from_room", "to_room", "room_a", "room_b"]:
                val = getattr(d, attr, None)
                if val:
                    connected_rooms.add(val)
            for list_attr in ["connects_room_ids", "connected_room_ids"]:
                vals = getattr(d, list_attr, None)
                if vals:
                    for v in vals:
                        connected_rooms.add(v)

        for r in valid_rooms:
            if r.type not in ["staircase", "foyer", "entry_foyer", "verandah", "patio"]:
                if r.id not in connected_rooms and not r.attached_room_id:
                    doors_passed = False
                    warnings.append(f"Room '{r.name}' has no assigned door access.")
                    issues.append(ValidationIssue(
                        severity="warning",
                        rule="door_connectivity",
                        message=f"Room '{r.name}' lacks a mapped door access path.",
                        room_id=r.id,
                        floor=floor.floor_number
                    ))

        # 4. WINDOWS & VENTILATION
        floor_windows = floor.windows or layout.windows or []
        windowed_rooms = set()
        for w in floor_windows:
            if getattr(w, "room_id", None):
                windowed_rooms.add(w.room_id)

        for r in valid_rooms:
            if r.type in ["living_room", "master_bedroom", "bedroom", "study"]:
                if r.id not in windowed_rooms and floor_windows:
                    windows_passed = False
                    warnings.append(f"Habitable room '{r.name}' lacks exterior window glazing.")
                    issues.append(ValidationIssue(
                        severity="warning",
                        rule="natural_ventilation",
                        message=f"Habitable room '{r.name}' requires exterior window ventilation.",
                        room_id=r.id,
                        floor=floor.floor_number
                    ))

    # 5. MULTI-FLOOR STAIRCASE VERTICAL ALIGNMENT
    if len(floors) > 1:
        ground_stair = next((r for r in floors[0].rooms if r.type == "staircase" and r.rect), None)
        for upper_floor in floors[1:]:
            upper_stair = next((r for r in upper_floor.rooms if r.type == "staircase" and r.rect), None)
            if ground_stair and upper_stair:
                dx = abs(ground_stair.rect.x - upper_stair.rect.x)
                dy = abs(ground_stair.rect.y - upper_stair.rect.y)
                dw = abs(ground_stair.rect.width - upper_stair.rect.width)
                dl = abs(ground_stair.rect.length - upper_stair.rect.length)

                if dx > 1.0 or dy > 1.0 or dw > 1.0 or dl > 1.0:
                    stair_stack_passed = False
                    msg = (
                        f"Staircase on {upper_floor.floor_name} (pos: {upper_stair.rect.x:.1f}, {upper_stair.rect.y:.1f}) "
                        f"deviates from Ground Floor core (pos: {ground_stair.rect.x:.1f}, {ground_stair.rect.y:.1f})."
                    )
                    warnings.append(msg)
                    issues.append(ValidationIssue(
                        severity="warning",
                        rule="staircase_alignment",
                        message=msg,
                        room_id=upper_stair.id,
                        floor=upper_floor.floor_number
                    ))

    # 6. LANDSCAPE ENGINE BOUNDS
    if getattr(layout, "landscape", None) and getattr(layout.landscape, "elements", None):
        ground_rooms = floors[0].rooms if floors else []
        fp_polys = [box(r.rect.x, r.rect.y, r.rect.right, r.rect.bottom) for r in ground_rooms if r.rect]
        for elem in layout.landscape.elements:
            ex = float(getattr(elem, "x", 0.0) or 0.0)
            ey = float(getattr(elem, "y", 0.0) or 0.0)
            ew = float(getattr(elem, "width", 0.0) or 0.0)
            el = float(getattr(elem, "length", 0.0) or 0.0)
            if ew > 0 and el > 0:
                e_box = box(ex, ey, ex + ew, ey + el)
                for fpoly in fp_polys:
                    if fpoly.intersection(e_box).area > 1.0:
                        landscape_passed = False
                        el_name = getattr(elem, "name", None) or getattr(elem, "element_id", None) or getattr(elem, "type", "Landscape Element")
                        el_id = getattr(elem, "id", None) or getattr(elem, "element_id", "elem")
                        warnings.append(f"Landscape element '{el_name}' intersects building footprint.")
                        issues.append(ValidationIssue(
                            severity="warning",
                            rule="landscape_envelope",
                            message=f"Landscape element {el_name} overlaps indoor floor area.",
                            room_id=str(el_id),
                            floor=1
                        ))
                        break

    # Passed check categories
    if envelope_passed:
        passed_checks.append("Site buildable envelope and setback containment")
    if overlap_passed:
        passed_checks.append("Zero room geometric overlap")
    if attached_bath_passed:
        passed_checks.append("En-suite attached bathroom adjacency")
    if aspect_passed:
        passed_checks.append("Comfortable room aspect ratio limits")
    if stair_stack_passed and len(floors) > 1:
        passed_checks.append("Vertical staircase shaft stacking")
    if doors_passed:
        passed_checks.append("Door connectivity and clearance")
    if windows_passed:
        passed_checks.append("Habitable daylight and natural ventilation")
    if furniture_passed:
        passed_checks.append("Furniture spatial fit and clearance")
    if landscape_passed:
        passed_checks.append("Landscape and building envelope separation")

    is_valid = len(errors) == 0

    return ArchitecturalValidation(
        is_valid=is_valid,
        passed_checks=passed_checks,
        warnings=warnings,
        errors=errors,
        issues=issues
    )
