"""Generate validated, topologically distinct variants from a canonical layout."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

from pydantic import BaseModel, Field

from models import (
    ArchitecturalValidation,
    ArchitecturalRequirements,
    FloorPlan,
    HouseLayout,
    HouseStats,
    Rect,
    Room,
)
from architecture.architectural_scorer import calculate_architectural_scores
from architecture.architectural_validator import validate_design
from architecture.furniture_validator import validate_and_place_furniture
from architecture.spatial_solver import solve_spatial_layout
from architecture.topology_engine import ArchitecturalScheme, generate_architectural_schemes
from architecture.wall_network import generate_wall_network_and_openings


class SchemeVariant(BaseModel):
    scheme_id: str
    topology_id: str
    solver_seed: int
    name: str
    tags: List[str] = Field(default_factory=list)
    feature_summary: List[str] = Field(default_factory=list)
    validation: ArchitecturalValidation
    layout: HouseLayout


class SchemeGenerationResult(BaseModel):
    variants: List[SchemeVariant]
    requested_count: int
    deterministic_fallback_used: bool = True
    warnings: List[str] = Field(default_factory=list)


class SchemeGenerationError(ValueError):
    """Raised when the canonical program cannot produce the requested variants."""


def generate_house_schemes(
    layout: HouseLayout,
    requirements: Optional[ArchitecturalRequirements] = None,
    preferences: Optional[Dict[str, Any]] = None,
    count: int = 3,
    variant_seed: Optional[int] = None,
) -> SchemeGenerationResult:
    """Return 3–5 valid variants while retaining the source layout's room program.

    Requirements can select directional preferences (notably Vastu), but the
    canonical layout remains authoritative for room identities, quantities,
    dimensions and attached-room constraints. Preferences may contain
    ``preferred_scheme_ids`` and ``solver_time_limit_sec``.

    No LLM is used. If a preferred strategy cannot solve, deterministic
    topologies from the existing topology engine are attempted in stable order;
    solver seeds only break ties within those topological constraints.
    """
    if count < 3 or count > 5:
        raise ValueError("count must be between 3 and 5")
    if layout.site is None:
        raise SchemeGenerationError("A canonical layout with a planned site is required.")

    source_validation = validate_design(layout)
    if not source_validation.is_valid:
        raise SchemeGenerationError(
            "The supplied canonical layout does not pass architectural validation: "
            + "; ".join(source_validation.errors[:5])
        )

    preferences = preferences or {}
    time_limit = float(preferences.get("solver_time_limit_sec", 3.0))
    if time_limit <= 0:
        raise ValueError("solver_time_limit_sec must be positive")
    preferred_ids = list(preferences.get("preferred_scheme_ids", []))
    if isinstance(requirements, dict):
        requirements = ArchitecturalRequirements(**requirements)
    vastu = (
        bool(requirements.vastu_compliant)
        if requirements is not None
        else bool(layout.metadata.get("vastu_compliant", False))
    )
    source_floors = _get_floors(layout)
    if not source_floors or any(not floor.rooms for floor in source_floors):
        raise SchemeGenerationError("The canonical layout must contain rooms on every floor.")

    schemes_by_floor: List[Dict[str, ArchitecturalScheme]] = []
    for floor in source_floors:
        schemes = generate_architectural_schemes(
            rooms=floor.rooms,
            site=layout.site,
            vastu_compliant=vastu,
            ai_concepts=None,
        )
        schemes_by_floor.append({scheme.scheme_id: scheme for scheme in schemes})

    common_ids = set(schemes_by_floor[0])
    for floor_schemes in schemes_by_floor[1:]:
        common_ids.intersection_update(floor_schemes)
    scheme_ids = sorted(common_ids)
    scheme_ids.sort(key=lambda scheme_id: (scheme_id not in preferred_ids, preferred_ids.index(scheme_id) if scheme_id in preferred_ids else scheme_id))
    if vastu and "scheme_vastu_optimized" in scheme_ids:
        scheme_ids.remove("scheme_vastu_optimized")
        scheme_ids.insert(0, "scheme_vastu_optimized")
    if not scheme_ids:
        raise SchemeGenerationError("No deterministic topologies are available for this room program.")

    seed_base = int(variant_seed if variant_seed is not None else 42)
    variants: List[SchemeVariant] = []
    signatures = set()
    failed_validation: List[str] = []

    # First pass covers each distinct built-in topology. Additional stable
    # solver seeds are fallback candidates only; no geometry is nudged manually.
    max_rounds = max(2, count)
    for seed_offset in range(max_rounds):
        for scheme_id in scheme_ids:
            if len(variants) >= count:
                break
            solved_floors = _solve_all_floors(
                source_floors,
                schemes_by_floor,
                scheme_id,
                layout,
                seed_base + seed_offset,
                time_limit,
            )
            if solved_floors is None:
                continue
            signature = _topology_signature(solved_floors, layout.site)
            if signature in signatures:
                continue

            candidate_layout = _rebuild_layout(layout, solved_floors, vastu_enabled=vastu)
            validation = validate_design(candidate_layout)
            if not validation.is_valid:
                failed_validation.extend(validation.errors[:3])
                continue

            scheme = schemes_by_floor[0][scheme_id]
            prior_family_variants = sum(variant.topology_id == scheme_id for variant in variants)
            variant_number = prior_family_variants + 1
            variant_id = scheme_id if variant_number == 1 else f"{scheme_id}_alternative_{variant_number}"
            base_name = "Vastu-Oriented Directional Scheme" if scheme_id == "scheme_vastu_optimized" else scheme.name
            variant_name = base_name if variant_number == 1 else f"{base_name} — Alternative {variant_number}"
            tags = _scheme_tags(scheme, solved_floors, layout.site)
            if variant_number > 1:
                tags.append("solver-generated alternative")
            summary = _feature_summary(scheme, solved_floors, layout.site)
            if scheme_id == "scheme_vastu_optimized":
                tags.append("Vastu directional preferences")
                summary.extend(_vastu_evidence(candidate_layout))
            if variant_number > 1:
                summary.append("A distinct room arrangement produced by the same topology family.")
            candidate_layout.metadata["scheme"] = {
                "id": variant_id,
                "topology_id": scheme_id,
                "solver_seed": seed_base + seed_offset,
                "name": variant_name,
                "concept": scheme.description,
                "tags": tags,
                "feature_summary": summary,
            }
            candidate_layout = candidate_layout.model_copy(
                deep=True,
                update={
                    "id": f"{layout.id}_{variant_id}",
                    "project_id": layout.project_id or layout.id,
                    "revision_id": None,
                    "parent_revision_id": layout.revision_id,
                    "title": f"{layout.title} — {variant_name}",
                },
            )
            signatures.add(signature)
            variants.append(
                SchemeVariant(
                    scheme_id=variant_id,
                    topology_id=scheme_id,
                    solver_seed=seed_base + seed_offset,
                    name=variant_name,
                    tags=tags,
                    feature_summary=summary,
                    validation=validation,
                    layout=candidate_layout,
                )
            )
        if len(variants) >= count:
            break

    if len(variants) < 3:
        detail = "; ".join(dict.fromkeys(failed_validation[:5]))
        reason = f"Only {len(variants)} meaningfully distinct valid variant(s) could be generated."
        if detail:
            reason += f" Candidate validation failures: {detail}"
        raise SchemeGenerationError(reason)

    warnings = []
    if len(variants) < count:
        warnings.append(
            f"Requested {count} variants; returned {len(variants)} after deterministic topology and seed retries."
        )
    return SchemeGenerationResult(
        variants=variants,
        requested_count=count,
        deterministic_fallback_used=True,
        warnings=warnings,
    )


def generate_design_schemes(
    base_layout: HouseLayout,
    count: int = 4,
    vastu_enabled: bool = False,
) -> list[dict]:
    """Public, JSON-ready API returning named canonical design scheme entries.

    Each entry has exactly these keys:
    ``id``, ``name``, ``concept``, ``characteristics``, ``validation_status``,
    and ``layout``. ``layout`` is the canonical HouseLayout serialized in JSON
    mode; validation status contains the actual validator result, not a score.
    """
    result = generate_house_schemes(
        layout=base_layout,
        requirements=ArchitecturalRequirements(vastu_compliant=vastu_enabled),
        count=count,
    )
    return [
        {
            "id": variant.scheme_id,
            "name": variant.name,
            "concept": variant.layout.metadata["scheme"]["concept"],
            "characteristics": {
                "tags": list(variant.tags),
                "feature_summary": list(variant.feature_summary),
            },
            "validation_status": _validation_status(variant),
            "layout": variant.layout.model_dump(mode="json"),
        }
        for variant in result.variants
    ]


def _validation_status(variant: SchemeVariant) -> Dict[str, Any]:
    status = variant.validation.model_dump(mode="json")
    if variant.topology_id == "scheme_vastu_optimized":
        status["vastu_audit"] = (
            variant.layout.scores.vastu_result
            if variant.layout.scores is not None
            else None
        )
    return status


def _get_floors(layout: HouseLayout) -> List[FloorPlan]:
    if layout.floors:
        return list(layout.floors)
    if layout.rooms:
        return [
            FloorPlan(
                floor_number=1,
                floor_name="Ground Floor",
                rooms=layout.rooms,
                walls=layout.walls,
                doors=layout.doors,
                windows=layout.windows,
            )
        ]
    return []


def _solve_all_floors(
    floors: Sequence[FloorPlan],
    schemes_by_floor: Sequence[Dict[str, ArchitecturalScheme]],
    scheme_id: str,
    layout: HouseLayout,
    seed: int,
    time_limit: float,
) -> Optional[List[FloorPlan]]:
    solved: List[FloorPlan] = []
    for floor, floor_schemes in zip(floors, schemes_by_floor):
        scheme = floor_schemes.get(scheme_id)
        if scheme is None:
            return None
        pinned: Dict[str, Rect] = {
            room.id: room.rect
            for room in floor.rooms
            if room.type == "staircase" and room.rect is not None
        }
        candidate = solve_spatial_layout(
            rooms=floor.rooms,
            site=layout.site,
            scheme=scheme,
            time_limit_sec=time_limit,
            pinned_rooms=pinned or None,
            variant_seed=seed,
        )
        if candidate is None or not candidate.is_valid:
            return None

        # Reconstruct Room models through their canonical initializer so their
        # redundant coordinate and dimension fields remain synchronized.
        rooms = []
        for room in candidate.rooms:
            data = room.model_dump()
            rect = candidate.solved_rects[room.id]
            data.update(
                rect=rect.model_dump(),
                x=rect.x,
                y=rect.y,
                width=rect.width,
                depth=rect.length,
                actual_width=rect.width,
                actual_length=rect.length,
                area=rect.area,
                area_sqft=rect.area,
                dimensions_label=f"{rect.width:.1f}' × {rect.length:.1f}'",
                furniture=[],
                furniture_ids=[],
                door_ids=[],
                window_ids=[],
            )
            rooms.append(Room(**data))
        solved.append(floor.model_copy(deep=True, update={"rooms": rooms}))
    return solved


def _rebuild_layout(
    source: HouseLayout,
    floors: List[FloorPlan],
    vastu_enabled: bool = False,
) -> HouseLayout:
    layout = source.model_copy(deep=True)
    all_rooms: List[Room] = []
    all_walls = []
    all_doors = []
    all_windows = []
    furniture_scores: List[float] = []
    rebuilt_floors: List[FloorPlan] = []
    wall_height = source.construction_spec.wall_height_ft if source.construction_spec else 10.0

    for floor in floors:
        rooms = floor.rooms
        walls, doors, windows = generate_wall_network_and_openings(
            rooms,
            source.site,
            wall_height=wall_height,
            construction_spec=source.construction_spec,
        )
        for room in rooms:
            items, score, _ = validate_and_place_furniture(room, doors=doors, windows=windows)
            room.furniture = items
            room.furniture_ids = [item.id for item in items]
            furniture_scores.append(score)
        updated_floor = floor.model_copy(
            deep=True,
            update={
                "rooms": rooms,
                "walls": walls,
                "exterior_walls": [wall for wall in walls if wall.wall_type == "exterior"],
                "interior_walls": [wall for wall in walls if wall.wall_type == "interior"],
                "doors": doors,
                "windows": windows,
            },
        )
        rebuilt_floors.append(updated_floor)
        all_rooms.extend(rooms)
        all_walls.extend(walls)
        all_doors.extend(doors)
        all_windows.extend(windows)

    ground = rebuilt_floors[0]
    scores, _ = calculate_architectural_scores(
        rooms=all_rooms,
        site=source.site,
        walls=all_walls,
        doors=all_doors,
        windows=all_windows,
        furniture_scores=furniture_scores,
        vastu_enabled=vastu_enabled,
    )
    total_area = sum(room.rect.area for room in all_rooms if room.rect)
    living_area = sum(
        room.rect.area
        for room in all_rooms
        if room.rect and room.type not in ["patio", "parking"]
    )
    built_area = sum(room.rect.area for room in ground.rooms if room.rect and room.type != "parking")
    bedroom_count = sum("bedroom" in room.type for room in all_rooms)
    bathroom_count = round(
        sum(1.0 if room.type == "bathroom" else 0.5 for room in all_rooms if "bath" in room.type or "powder" in room.type),
        1,
    )
    stats = HouseStats(
        total_area_sqft=round(total_area, 1),
        living_area_sqft=round(living_area, 1),
        width_ft=source.plot_width,
        length_ft=source.plot_length,
        num_floors=len(rebuilt_floors),
        bedroom_count=bedroom_count,
        bathroom_count=bathroom_count,
        aspect_ratio=round(source.plot_width / max(1.0, source.plot_length), 2),
        coverage_percentage=round(
            built_area / max(1.0, source.site.total_plot_area) * 100.0, 1
        ),
    )

    metadata = dict(layout.metadata)
    metadata["scheme_generation"] = {
        "source": "deterministic_topology_engine",
        "spatial_solver": "or-tools_cp-sat",
    }
    metadata["vastu_compliant"] = vastu_enabled
    layout = layout.model_copy(
        deep=True,
        update={
            "floors": rebuilt_floors,
            "rooms": ground.rooms,
            "walls": ground.walls,
            "exterior_walls": ground.exterior_walls,
            "interior_walls": ground.interior_walls,
            "doors": ground.doors,
            "windows": ground.windows,
            "entry_point": _entry_point(ground, source),
            "stats": stats,
            "scores": scores,
            "vastu_result": scores.vastu_result,
            "validation": None,
            "metadata": metadata,
            # Recompute or clear geometry-dependent products below rather than
            # returning stale quantities and site/structure overlays.
            "building_services": None,
            "mep_plan": None,
            "structural_planning": None,
            "quantities": None,
            "cost_estimate": None,
            "landscape": None,
        },
    )
    layout.validation = validate_design(layout)
    return layout


def _vastu_evidence(layout: HouseLayout) -> List[str]:
    audit = layout.scores.vastu_result if layout.scores else None
    if not audit:
        return ["Vastu audit unavailable; no Vastu-compliance claim is made."]
    score = audit.get("overall_score")
    features = [f"Actual Vastu layout audit score: {score}/100."]
    satisfied = audit.get("satisfied_rules") or []
    violated = audit.get("violated_rules") or []
    if satisfied:
        features.append("Vastu rules satisfied: " + "; ".join(satisfied[:3]) + ".")
    if violated:
        features.append("Vastu rule violations: " + "; ".join(violated[:3]) + ".")
    elif not satisfied:
        features.append("The audit reported no satisfied or violated rules.")
    return features


def _entry_point(ground: FloorPlan, source: HouseLayout) -> Dict[str, float]:
    entry = next(
        (
            door
            for door in ground.doors
            if getattr(door, "door_type", "") in ["entry", "entrance"]
        ),
        None,
    )
    if entry is not None:
        return {
            "x": round((entry.x1 + entry.x2) / 2.0, 1),
            "y": round((entry.y1 + entry.y2) / 2.0, 1),
            "direction": 0.0,
        }
    site = source.site
    side = site.road_side
    setback = site.setbacks.front
    if side == "north":
        x, y = source.plot_width / 2.0, setback
    elif side == "east":
        x, y = source.plot_width - setback, source.plot_length / 2.0
    elif side == "west":
        x, y = setback, source.plot_length / 2.0
    else:
        x, y = source.plot_width / 2.0, source.plot_length - setback
    return {"x": round(x, 1), "y": round(y, 1), "direction": 0.0}


def _topology_signature(floors: Sequence[FloorPlan], site: Any) -> Tuple[Any, ...]:
    envelope = site.buildable_envelope
    spatial: List[Tuple[Any, ...]] = []
    adjacency: List[Tuple[int, str, str]] = []
    for floor in floors:
        rooms = floor.rooms
        positions = []
        for room in rooms:
            if not room.rect:
                continue
            lateral, front = _relative_position(room.rect, envelope, site.road_side)
            positions.append((room.type, room.name, _third(lateral), _third(front)))
        spatial.extend((floor.floor_number, *position) for position in sorted(positions))
        for i, first in enumerate(rooms):
            for second in rooms[i + 1 :]:
                if first.rect and second.rect and _share_wall(first.rect, second.rect):
                    adjacency.append((floor.floor_number, *sorted((first.type, second.type))))
    return tuple(sorted(spatial)), tuple(sorted(adjacency))


def _relative_position(rect: Rect, envelope: Rect, road_side: str) -> Tuple[float, float]:
    if road_side == "south":
        lateral = (rect.x + rect.width / 2 - envelope.x) / envelope.width
        front = (envelope.bottom - rect.bottom) / envelope.length
    elif road_side == "north":
        lateral = 1.0 - (rect.x + rect.width / 2 - envelope.x) / envelope.width
        front = (rect.y - envelope.y) / envelope.length
    elif road_side == "west":
        lateral = 1.0 - (rect.y + rect.length / 2 - envelope.y) / envelope.length
        front = (rect.x - envelope.x) / envelope.width
    else:
        lateral = (rect.y + rect.length / 2 - envelope.y) / envelope.length
        front = (envelope.right - rect.right) / envelope.width
    return max(0.0, min(1.0, lateral)), max(0.0, min(1.0, front))


def _third(value: float) -> str:
    return "first" if value < 1 / 3 else "middle" if value < 2 / 3 else "last"


def _share_wall(first: Rect, second: Rect) -> bool:
    vertical_touch = abs(first.right - second.x) < 0.15 or abs(second.right - first.x) < 0.15
    horizontal_overlap = min(first.bottom, second.bottom) - max(first.y, second.y) > 0.25
    horizontal_touch = abs(first.bottom - second.y) < 0.15 or abs(second.bottom - first.y) < 0.15
    vertical_overlap = min(first.right, second.right) - max(first.x, second.x) > 0.25
    return (vertical_touch and horizontal_overlap) or (horizontal_touch and vertical_overlap)


def _scheme_tags(scheme: ArchitecturalScheme, floors: Sequence[FloorPlan], site: Any) -> List[str]:
    strategy = {
        "central": "central spine strategy",
        "side": "side circulation strategy",
        "linear": "linear circulation strategy",
    }.get(scheme.circulation_type, scheme.circulation_type.replace("_", " "))
    tags = [strategy, "deterministic"]
    rooms = [room for floor in floors for room in floor.rooms]
    hallways = [room for room in rooms if room.type == "hallway" and room.rect]
    if hallways:
        lateral, _ = _relative_position(hallways[0].rect, site.buildable_envelope, site.road_side)
        tags.append("side circulation" if lateral < 0.35 or lateral > 0.65 else "central circulation")
    return list(dict.fromkeys(tags))


def _feature_summary(scheme: ArchitecturalScheme, floors: Sequence[FloorPlan], site: Any) -> List[str]:
    summary = [f"Topology concept: {scheme.description}"]
    rooms = [room for floor in floors for room in floor.rooms if room.rect]
    front_private = [
        room for room in rooms
        if room.zone == "private" and _relative_position(room.rect, site.buildable_envelope, site.road_side)[1] < 0.34
    ]
    rear_private = [
        room for room in rooms
        if room.zone == "private" and _relative_position(room.rect, site.buildable_envelope, site.road_side)[1] > 0.66
    ]
    if rear_private and not front_private:
        summary.append("Private rooms are concentrated in the rear zone.")
    elif front_private and rear_private:
        summary.append("Private rooms are distributed across front and rear zones.")
    elif front_private:
        summary.append("Private rooms are concentrated toward the road frontage.")
    hallways = [room for room in rooms if room.type == "hallway"]
    if hallways:
        lateral, _ = _relative_position(hallways[0].rect, site.buildable_envelope, site.road_side)
        summary.append("The circulation hall is positioned along a side." if lateral < 0.35 or lateral > 0.65 else "The circulation hall is positioned near the center.")
    adjacencies = []
    for index, first in enumerate(rooms):
        for second in rooms[index + 1 :]:
            if _share_wall(first.rect, second.rect):
                pair = "–".join(sorted((first.type.replace("_", " "), second.type.replace("_", " "))))
                if pair not in adjacencies:
                    adjacencies.append(pair)
    if adjacencies:
        summary.append("Solver-produced shared-wall relationships: " + ", ".join(adjacencies[:6]) + ".")
    return summary
