from __future__ import annotations

from pathlib import Path

import pytest
from shapely.geometry import box

from architecture.architectural_engine import generate_architectural_house_layout
from architecture.scheme_generation import generate_house_schemes
from infrastructure.project_repository import JsonFileProjectRepository
from models import HouseLayout


CASES = [
    pytest.param(30, 40, 2, 2, 1, 0, False, [], id="30x40-2bed-2bath"),
    pytest.param(40, 50, 3, 2, 1, 1, False, [], id="40x50-3bed-2bath"),
    pytest.param(40, 60, 4, 3, 2, 1, False, [], id="40x60-4bed-2floor"),
    pytest.param(30, 40, 2, 2, 1, 1, False, [], id="parking-enabled"),
    pytest.param(40, 50, 3, 2, 1, 1, False, [], id="vastu-disabled"),
    pytest.param(40, 50, 3, 2, 1, 1, True, [], id="vastu-enabled"),
    pytest.param(40, 50, 3, 2, 1, 1, False, ["office", "pooja"], id="office-and-pooja"),
    pytest.param(30, 40, 2, 1, 1, 0, False, [], id="constrained-small-plot"),
]


@pytest.mark.parametrize(
    "plot_width,plot_length,bedrooms,bathrooms,floors,parking,vastu,special_rooms",
    CASES,
)
def test_generation_returns_renderable_persistable_valid_scheme(
    tmp_path: Path,
    plot_width: float,
    plot_length: float,
    bedrooms: int,
    bathrooms: float,
    floors: int,
    parking: int,
    vastu: bool,
    special_rooms: list[str],
):
    source = generate_architectural_house_layout(
        plot_width=plot_width,
        plot_length=plot_length,
        num_floors=floors,
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        parking_spaces=parking,
        vastu_compliant=vastu,
        special_rooms=special_rooms,
        variant_seed=42,
    )
    result = generate_house_schemes(
        source,
        count=1,
        variant_seed=42,
        preferences={"solver_time_limit_sec": 2.0},
    )

    assert result.variants, result.warnings
    scheme = result.variants[0]
    canonical = HouseLayout.model_validate(scheme.layout.model_dump(mode="json"))
    assert canonical.validation and canonical.validation.is_valid
    assert not any(
        "lacks a mapped door access path" in warning.lower()
        for warning in canonical.validation.warnings
    )
    assert len(canonical.floors) == floors
    assert sum("bedroom" in room.type for floor in canonical.floors for room in floor.rooms) == bedrooms
    assert canonical.stats.bathroom_count >= bathrooms
    source_rooms = [room for floor in source.floors for room in floor.rooms]
    candidate_rooms = [room for floor in canonical.floors for room in floor.rooms]
    assert sum("bath" in room.type or "powder" in room.type for room in candidate_rooms) == sum(
        "bath" in room.type or "powder" in room.type for room in source_rooms
    )
    assert all(room.rect is not None and room.rect.width > 0 and room.rect.length > 0
               for floor in canonical.floors for room in floor.rooms)

    envelope = canonical.site.buildable_envelope
    env_poly = box(envelope.x, envelope.y, envelope.right, envelope.bottom)
    for floor in canonical.floors:
        room_polygons = [
            box(room.rect.x, room.rect.y, room.rect.right, room.rect.bottom)
            for room in floor.rooms
        ]
        assert all(env_poly.buffer(0.15).contains(polygon) for polygon in room_polygons)
        for first_index, first in enumerate(room_polygons):
            assert all(
                first.intersection(second).area <= 0.15
                for second in room_polygons[first_index + 1 :]
            )
        floor_room_map = {room.id: room for room in floor.rooms}
        for room in floor.rooms:
            if room.attached_room_id and room.attached_room_id in floor_room_map:
                attached = floor_room_map[room.attached_room_id]
                room_poly = box(room.rect.x, room.rect.y, room.rect.right, room.rect.bottom)
                attached_poly = box(
                    attached.rect.x,
                    attached.rect.y,
                    attached.rect.right,
                    attached.rect.bottom,
                )
                assert room_poly.distance(attached_poly) <= 0.15

    if special_rooms:
        room_names = " ".join(room.name.lower() for room in candidate_rooms)
        assert all(special.lower() in room_names for special in special_rooms)
    if vastu:
        assert canonical.metadata.get("vastu_compliant") is True

    if parking:
        assert canonical.site.parking and canonical.site.parking.rect
        parking_rect = canonical.site.parking.rect
        assert parking_rect.x >= 0 and parking_rect.y >= 0
        assert parking_rect.right <= canonical.plot_width + 0.1
        assert parking_rect.bottom <= canonical.plot_length + 0.1

    # The canonical floor/room/rect/wall structure is the input contract used
    # by both PLAN rendering and the MODEL workspace.
    assert all(floor.rooms and floor.walls for floor in canonical.floors)
    repository = JsonFileProjectRepository(tmp_path / "projects")
    project_id, _ = repository.save(canonical)
    restored = repository.get(project_id)
    assert restored is not None
    assert HouseLayout.model_validate(restored.model_dump(mode="json")).id == canonical.id
