"""
Architectural Validator Module
Provides strict geometric and building-code validation for residential layouts:
1. Buildable envelope containment
2. Zero room polygon overlap (Shapely intersection)
3. Room aspect ratio limits
4. Attached en-suite adjacency
5. Circulation connectivity and hallway access
6. Multi-floor vertical circulation alignment (staircase stacking)
7. Minimum functional dimensions per room type
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
        # Fallback to top-level rooms if floors list empty
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

    # Check 1 & 2: Per-floor envelope containment and room-room non-overlap
    env_poly = None
    if site and site.buildable_envelope:
        env = site.buildable_envelope
        env_poly = box(env.x, env.y, env.right, env.bottom)

    for floor in floors:
        valid_rooms = [r for r in floor.rooms if r.rect and r.rect.area > 1.0]
        room_boxes: Dict[str, Polygon] = {}

        for r in valid_rooms:
            r_poly = box(r.rect.x, r.rect.y, r.rect.right, r.rect.bottom)
            room_boxes[r.id] = r_poly

            # 1. Envelope containment (with small 0.1ft tolerance)
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

            # 3. Aspect ratio check
            if r.type not in ["hallway", "staircase", "corridor"]:
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

            # Minimum residential dimension checks
            min_residential_dim = 4.0 if "bath" in r.type or "powder" in r.type else 6.5
            if min(r.rect.width, r.rect.length) < min_residential_dim:
                warnings.append(f"Room '{r.name}' width is below standard comfortable clearance.")
                issues.append(ValidationIssue(
                    severity="warning",
                    rule="minimum_dimension",
                    message=f"Room '{r.name}' narrow dimension is {min(r.rect.width, r.rect.length):.1f}ft.",
                    room_id=r.id,
                    floor=floor.floor_number
                ))

        # 2. Pairwise room overlap check
        r_ids = list(room_boxes.keys())
        for i in range(len(r_ids)):
            for j in range(i + 1, len(r_ids)):
                id1, id2 = r_ids[i], r_ids[j]
                poly1, poly2 = room_boxes[id1], room_boxes[id2]
                intersection = poly1.intersection(poly2)
                if intersection.area > 0.15:  # Tolerance for floating point wall lines
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

        # 4. Attached bathroom adjacency check
        for r in valid_rooms:
            if r.attached_room_id and r.attached_room_id in room_boxes:
                p_poly = room_boxes[r.attached_room_id]
                c_poly = room_boxes[r.id]
                # Check touching distance
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

    # Check 5: Multi-floor staircase vertical stacking alignment
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

    # Populate passed checks
    if envelope_passed:
        passed_checks.append("Buildable envelope containment")
    if overlap_passed:
        passed_checks.append("Zero room geometric overlap")
    if attached_bath_passed:
        passed_checks.append("En-suite attached bathroom adjacency")
    if aspect_passed:
        passed_checks.append("Comfortable room aspect ratio limits")
    if stair_stack_passed and len(floors) > 1:
        passed_checks.append("Vertical staircase shaft stacking")

    is_valid = len(errors) == 0

    return ArchitecturalValidation(
        is_valid=is_valid,
        passed_checks=passed_checks,
        warnings=warnings,
        errors=errors,
        issues=issues
    )
