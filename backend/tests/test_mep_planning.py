from models import Door, FloorPlan, HouseLayout, MEPPlan, Room, Wall
from mep_planning import generate_mep_plan, reconcile_mep_plan


def _room(room_id, room_type="bedroom", x=0.0, y=0.0, width=12.0, length=10.0):
    return Room(
        id=room_id,
        name=room_id.replace("_", " ").title(),
        type=room_type,
        rect={"x": x, "y": y, "width": width, "length": length},
    )


def _layout(rooms, walls=None):
    floor = FloorPlan(
        floor_id="ground",
        floor_number=1,
        rooms=rooms,
        walls=walls or [],
    )
    return HouseLayout(
        id="test-house",
        title="Test",
        designer_rationale="Test fixture",
        plot_width=40,
        plot_length=40,
        floors=[floor],
    )


def test_house_layout_mep_is_optional_for_legacy_payloads():
    layout = HouseLayout(
        id="legacy",
        title="Legacy",
        designer_rationale="Legacy layout",
        plot_width=30,
        plot_length=30,
    )

    assert layout.mep_plan is None
    updated_layout = generate_mep_plan(layout)
    assert updated_layout is not layout
    assert isinstance(updated_layout.mep_plan, MEPPlan)
    plan = updated_layout.mep_plan
    assert plan.certified is False
    assert plan.planning_stage == "preliminary"


def test_generation_is_deterministic_and_retains_existing_valid_ids():
    layout = _layout([_room("bed_a"), _room("bath_a", "bathroom", x=12)])
    first_layout = generate_mep_plan(layout)
    first = first_layout.mep_plan
    assert first is not None
    second_layout = generate_mep_plan(first_layout)
    second = second_layout.mep_plan
    assert second is not None

    assert [point.model_dump() for point in first.points] == [point.model_dump() for point in second.points]
    assert [route.model_dump() for route in first.routes] == [route.model_dump() for route in second.routes]
    assert len({point.id for point in first.points}) == len(first.points)
    assert len({route.id for route in first.routes}) == len(first.routes)
    assert all(point.metadata["certified"] is False for point in first.points)
    assert all(route.metadata["planning_stage"] == "preliminary" for route in first.routes)

    old_point = first.points[0].model_copy(update={"id": "preserved-point-id"})
    previous = first.model_copy(update={"points": [old_point] + first.points[1:]})
    regenerated = reconcile_mep_plan(layout, previous)
    assert regenerated.points[0].id == "preserved-point-id"


def test_reconciliation_removes_room_dependent_stale_points_and_routes():
    layout = _layout([_room("bed_a"), _room("kitchen_a", "kitchen", x=12)])
    original = generate_mep_plan(layout).mep_plan
    assert original is not None
    updated_layout = _layout([_room("bed_a")]).model_copy(update={"mep_plan": original})

    result = reconcile_mep_plan(updated_layout)

    assert {point.room_id for point in result.points} == {"bed_a"}
    assert {route.room_id for route in result.routes} == {"bed_a"}
    assert all(set(route.point_ids) <= {point.id for point in result.points} for route in result.routes)


def test_points_and_routes_stay_in_room_and_routes_avoid_internal_walls():
    room = _room("kitchen_a", "kitchen", width=12, length=10)
    wall = Wall(
        id="partition",
        x1=6,
        y1=2,
        x2=6,
        y2=8,
        room_ids=["kitchen_a"],
    )
    layout = _layout([room], [wall])
    plan = generate_mep_plan(layout).mep_plan
    assert plan is not None
    points = [point for point in plan.points if point.room_id == room.id]
    routes = [route for route in plan.routes if route.room_id == room.id]

    assert points and routes
    for point in points:
        assert room.rect.x <= point.position.x <= room.rect.right
        assert room.rect.y <= point.position.y <= room.rect.bottom
    for route in routes:
        for point in route.points:
            assert room.rect.x <= point.x <= room.rect.right
            assert room.rect.y <= point.y <= room.rect.bottom
        for start, end in zip(route.points, route.points[1:]):
            assert not (
                abs(start.x - end.x) < 0.05
                and abs(start.x - 6) < 0.05
                and max(min(start.y, end.y), 2) < min(max(start.y, end.y), 8)
            )


def test_generation_supports_flat_legacy_single_floor_layout():
    layout = HouseLayout(
        id="flat",
        title="Flat",
        designer_rationale="Flat layout",
        plot_width=20,
        plot_length=20,
        rooms=[_room("bath", "bathroom")],
    )

    plan = generate_mep_plan(layout).mep_plan
    assert plan is not None

    assert plan.points
    assert {point.floor_id for point in plan.points} == {"floor_1"}
    assert {point.category for point in plan.points} == {"electrical", "plumbing", "hvac"}


def test_routes_avoid_hosted_door_opening_when_an_alternative_path_exists():
    room = _room("kitchen_a", "kitchen", width=12, length=10)
    top_wall = Wall(
        id="north-wall",
        x1=0,
        y1=0,
        x2=12,
        y2=0,
        wall_type="exterior",
    )
    door = Door(
        id="entry",
        wall_id="north-wall",
        position_along_wall=0.5,
        width=3,
    )
    floor = FloorPlan(
        floor_id="ground",
        floor_number=1,
        rooms=[room],
        walls=[top_wall],
        doors=[door],
    )
    layout = HouseLayout(
        id="opening-test",
        title="Test",
        designer_rationale="Test fixture",
        plot_width=20,
        plot_length=20,
        floors=[floor],
    )

    plan = generate_mep_plan(layout).mep_plan
    assert plan is not None

    for route in plan.routes:
        for start, end in zip(route.points, route.points[1:]):
            crosses_door = (
                abs(start.y - end.y) < 0.001
                and -0.5 <= start.y <= 0.5
                and max(min(start.x, end.x), 4.5) <= min(max(start.x, end.x), 7.5)
            )
            assert not crosses_door


def test_preliminary_point_kinds_cover_named_room_services():
    layout = _layout([
        _room("living", "living_room"),
        _room("bath", "bathroom", x=12),
        _room("kitchen", "kitchen", x=24),
    ])

    plan = generate_mep_plan(layout).mep_plan
    assert plan is not None
    kinds = {(point.category, point.kind) for point in plan.points}

    assert {
        ("electrical", "light"),
        ("electrical", "switch"),
        ("electrical", "outlet"),
        ("electrical", "fan"),
        ("electrical", "ac_point"),
        ("electrical", "distribution_board"),
        ("plumbing", "wc"),
        ("plumbing", "basin"),
        ("plumbing", "shower"),
        ("plumbing", "sink"),
        ("plumbing", "floor_drain"),
        ("plumbing", "supply"),
        ("plumbing", "waste"),
        ("plumbing", "stack"),
        ("hvac", "indoor_ac"),
        ("hvac", "outdoor_ac"),
        ("hvac", "exhaust"),
        ("hvac", "ventilation"),
    } <= kinds
    assert plan.certified is False
    assert all(point.metadata["planning_stage"] == "preliminary" for point in plan.points)


def test_aligned_wet_rooms_get_stable_typed_vertical_stacks():
    ground_bath = _room("ground_bath", "bathroom", x=0, y=0)
    upper_bath = _room("upper_bath", "bathroom", x=1, y=0)
    ground_kitchen = _room("ground_kitchen", "kitchen", x=20, y=0)
    upper_kitchen = _room("upper_kitchen", "kitchen", x=21, y=0)
    layout = HouseLayout(
        id="multi-floor-mep",
        title="Multi floor",
        designer_rationale="Test",
        plot_width=50,
        plot_length=40,
        floors=[
            FloorPlan(floor_id="ground", floor_number=1, rooms=[ground_bath, ground_kitchen]),
            FloorPlan(floor_id="upper", floor_number=2, rooms=[upper_bath, upper_kitchen]),
        ],
    )

    generated = generate_mep_plan(layout)
    plan = generated.mep_plan
    assert plan is not None
    assert len(plan.vertical_stacks) == 4
    assert {stack.kind for stack in plan.vertical_stacks} == {"soil_waste_stack", "water_supply_stack"}
    associations = [
        {(member.floor_id, member.room_id) for member in stack.room_associations}
        for stack in plan.vertical_stacks
    ]
    assert associations.count({("ground", "ground_bath"), ("upper", "upper_bath")}) == 2
    assert associations.count({("ground", "ground_kitchen"), ("upper", "upper_kitchen")}) == 2
    for stack in plan.vertical_stacks:
        member_points = {
            point.id: point for point in plan.points
        }
        assert all(
            member_points[member.point_id].position == stack.alignment
            for member in stack.room_associations
        )
        assert all(
            member_points[member.point_id].metadata["certified"] is False
            for member in stack.room_associations
        )

    regenerated = generate_mep_plan(generated).mep_plan
    assert regenerated is not None
    assert [stack.id for stack in plan.vertical_stacks] == [stack.id for stack in regenerated.vertical_stacks]
    assert [stack.model_dump() for stack in plan.vertical_stacks] == [
        stack.model_dump() for stack in regenerated.vertical_stacks
    ]
    one_floor = generated.model_copy(update={"floors": [generated.floors[0]], "num_floors": 1})
    reconciled = generate_mep_plan(one_floor).mep_plan
    assert reconciled is not None
    assert reconciled.vertical_stacks == []
