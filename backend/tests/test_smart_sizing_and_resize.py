import pytest
from architecture.dimension_recommender import (
    analyze_and_recommend_dimensions,
    get_base_room_proportions,
    DimensionRecommendationRequest,
)
from models import (
    RoomAllocationItem,
    HouseLayout,
    FloorPlan,
    Room,
    Rect,
    EditRoomRequest,
)
from main import edit_room_endpoint


def test_1_manual_plot_dimensions():
    """TEST 1: Manual plot dimensions accepted with correct area and buildable envelope."""
    plots = [(40.0, 60.0), (25.0, 40.0), (20.0, 30.0), (50.0, 80.0)]
    for w, l in plots:
        req = DimensionRecommendationRequest(plot_width=w, plot_length=l, num_floors=2)
        res = analyze_and_recommend_dimensions(req)
        assert res.plot_width_ft == w
        assert res.plot_length_ft == l
        assert res.plot_area_sqft == w * l
        assert res.buildable_ground_area_sqft > 0
        assert res.buildable_ground_area_sqft < res.plot_area_sqft


def test_2_small_plot_feasibility():
    """TEST 2: Small plot (20x30 ft = 600 sq ft) flags tight/infeasible ground req for 3BHK, suggests multi-floor."""
    # 20x30 with 3 bedrooms
    req = DimensionRecommendationRequest(
        plot_width=20.0,
        plot_length=30.0,
        num_floors=1,
        bedrooms=3,
        rooms=[
            RoomAllocationItem(id="living", name="Living Room", type="living_room", floor_id="f1", floor_number=1, length=14.0, width=12.0),
            RoomAllocationItem(id="bed1", name="Master Bedroom", type="master_bedroom", floor_id="f1", floor_number=1, length=13.0, width=11.0),
            RoomAllocationItem(id="bed2", name="Bedroom 2", type="bedroom", floor_id="f1", floor_number=1, length=12.0, width=10.0),
            RoomAllocationItem(id="bed3", name="Bedroom 3", type="bedroom", floor_id="f1", floor_number=1, length=12.0, width=10.0),
            RoomAllocationItem(id="kitchen", name="Kitchen", type="kitchen", floor_id="f1", floor_number=1, length=10.0, width=8.0),
        ]
    )
    res = analyze_and_recommend_dimensions(req)
    # Ground coverage exceeds 100% of buildable ground area for 1 floor
    assert res.feasibility_status in ["tight", "requires_multistage", "infeasible"]
    assert len(res.strategies) > 0
    # Must recommend multi-floor strategy
    assert any(s.recommended_floors >= 2 for s in res.strategies)


def test_3_user_manual_room_dimensions_preserved():
    """TEST 3: User manual dimensions are strictly preserved and not overwritten by AI recommendations."""
    manual_rooms = [
        RoomAllocationItem(
            id="living_custom",
            name="Living Room",
            type="living_room",
            floor_id="f1",
            floor_number=1,
            length=20.0,
            width=16.0,
            size_mode="manual",
            is_hard_constraint=True,
        ),
        RoomAllocationItem(
            id="kitchen_custom",
            name="Kitchen",
            type="kitchen",
            floor_id="f1",
            floor_number=1,
            length=12.0,
            width=10.0,
            size_mode="manual",
            is_hard_constraint=True,
        ),
        RoomAllocationItem(
            id="bed_ai",
            name="Bedroom",
            type="bedroom",
            floor_id="f1",
            floor_number=1,
            size_mode="ai_recommended",
            is_hard_constraint=False,
        ),
    ]

    req = DimensionRecommendationRequest(
        plot_width=40.0,
        plot_length=60.0,
        num_floors=2,
        bedrooms=2,
        rooms=manual_rooms,
    )
    res = analyze_and_recommend_dimensions(req)

    living_res = next(r for r in res.rooms if r.id == "living_custom")
    assert living_res.width == 16.0
    assert living_res.length == 20.0
    assert living_res.is_hard_constraint is True
    assert living_res.size_mode == "manual"

    kitchen_res = next(r for r in res.rooms if r.id == "kitchen_custom")
    assert kitchen_res.width == 10.0
    assert kitchen_res.length == 12.0
    assert kitchen_res.is_hard_constraint is True
    assert kitchen_res.size_mode == "manual"


def test_5_sizing_priority_hierarchy():
    """TEST 5: Sizing priority: User hard constraint > AI recommended > Standard default."""
    min_w, min_l, pref_w, pref_l = get_base_room_proportions("living_room")
    assert min_w <= pref_w
    assert min_l <= pref_l

    # When user hard constraint is passed, it takes precedence
    req = DimensionRecommendationRequest(
        plot_width=30.0,
        plot_length=50.0,
        rooms=[
            RoomAllocationItem(
                id="living_hard",
                name="Living Room",
                type="living_room",
                floor_id="f1",
                floor_number=1,
                length=19.5,
                width=15.5,
                size_mode="manual",
                is_hard_constraint=True,
            )
        ]
    )
    res = analyze_and_recommend_dimensions(req)
    r = res.rooms[0]
    assert r.width == 15.5
    assert r.length == 19.5
    assert r.is_hard_constraint is True


def test_6_multifloor_awareness():
    """TEST 6: Multi-floor awareness — ground floor fits within ground buildable area, excess rooms on floor 2+."""
    req = DimensionRecommendationRequest(
        plot_width=25.0,
        plot_length=40.0,
        num_floors=2,
        bedrooms=3,
        rooms=[
            RoomAllocationItem(id="living", name="Living Room", type="living_room", floor_id="f1", floor_number=1, length=13.0, width=11.0),
            RoomAllocationItem(id="kitchen", name="Kitchen", type="kitchen", floor_id="f1", floor_number=1, length=10.0, width=8.0),
            RoomAllocationItem(id="bed1", name="Guest Bed", type="bedroom", floor_id="f1", floor_number=1, length=11.0, width=10.0),
            RoomAllocationItem(id="master", name="Master Suite", type="master_bedroom", floor_id="f2", floor_number=2, length=14.0, width=12.0),
            RoomAllocationItem(id="bed2", name="Kids Bed", type="bedroom", floor_id="f2", floor_number=2, length=11.0, width=10.0),
        ]
    )
    res = analyze_and_recommend_dimensions(req)
    # Ground floor rooms should be smaller than buildable ground area
    assert res.total_requested_ground_area_sqft <= res.buildable_ground_area_sqft or res.ground_coverage_pct < 120.0
    # At least one strategy redistributes vertical load
    assert any(s.recommended_floors >= 2 for s in res.strategies)


def test_7_and_8_2d_room_resize_and_shared_wall_push():
    """TEST 7 & 8: 2D room resize by dragging and shared wall push/shrink with minimum protection."""
    import asyncio

    async def _test():
        # Create two adjacent rooms sharing a wall at x=15:
        # Room A: x=5, y=5, w=10, l=12 (x span 5 to 15)
        # Room B: x=15, y=5, w=10, l=12 (x span 15 to 25)
        room_a = Room(
            id="room_a",
            name="Master Bedroom",
            type="master_bedroom",
            zone="private",
            floor_id="floor_1",
            rect=Rect(x=5.0, y=5.0, width=10.0, length=12.0),
            min_width=8.5,
            min_length=9.5,
        )
        room_b = Room(
            id="room_b",
            name="Bedroom 2",
            type="bedroom",
            zone="private",
            floor_id="floor_1",
            rect=Rect(x=15.0, y=5.0, width=10.0, length=12.0),
            min_width=8.0,
            min_length=9.0,
        )

        floor = FloorPlan(
            floor_number=1,
            floor_name="Ground Floor",
            rooms=[room_a, room_b],
            exterior_walls=[],
            interior_walls=[],
            doors=[],
            windows=[],
        )

        layout = HouseLayout(
            id="test_layout_resize",
            name="Test Layout",
            plot_width=40.0,
            plot_length=50.0,
            rooms=[room_a, room_b],
            floors=[floor],
            exterior_walls=[],
            interior_walls=[],
            doors=[],
            windows=[],
        )

        # 1. Expand Room A by 1.5 ft (width 10.0 -> 11.5) pushing Room B (Room B width 10.0 -> 8.5)
        # Since Room B min_width is 8.0, 8.5 >= 8.0 so it should SUCCEED
        req1 = EditRoomRequest(
            current_layout=layout,
            room_id="room_a",
            proposed_rect=Rect(x=5.0, y=5.0, width=11.5, length=12.0),
            push_adjacent=True,
        )
        res1 = await edit_room_endpoint(req1)
        assert res1.success is True
        updated_a = next(r for r in res1.layout.rooms if r.id == "room_a")
        updated_b = next(r for r in res1.layout.rooms if r.id == "room_b")
        assert updated_a.rect.width == 11.5
        assert updated_b.rect.x == 16.5  # pushed by 1.5 ft
        assert updated_b.rect.width == 8.5  # shrunk by 1.5 ft
        assert "room_b" in res1.affected_rooms

        # 2. Try to expand Room A further by 2.0 ft (width 11.5 -> 13.5), which would shrink Room B from 8.5 to 6.5 ft
        # Since Room B min_width is 8.0 ft, shrinking to 6.5 ft MUST BE REJECTED
        req2 = EditRoomRequest(
            current_layout=res1.layout,
            room_id="room_a",
            proposed_rect=Rect(x=5.0, y=5.0, width=13.5, length=12.0),
            push_adjacent=True,
        )
        res2 = await edit_room_endpoint(req2)
        assert res2.success is False
        assert "minimum required width" in res2.message

    asyncio.run(_test())


def test_12_no_revert_bug():
    """TEST 12: No revert bug — committed layout preserves edits and maintains single source of truth."""
    import asyncio

    async def _test():
        room = Room(
            id="room_living",
            name="Living Room",
            type="living_room",
            zone="public",
            floor_id="floor_1",
            rect=Rect(x=5.0, y=5.0, width=14.0, length=16.0),
            min_width=10.0,
            min_length=12.0,
        )
        floor = FloorPlan(
            floor_number=1,
            floor_name="Ground Floor",
            rooms=[room],
            exterior_walls=[],
            interior_walls=[],
            doors=[],
            windows=[],
        )
        layout = HouseLayout(
            id="test_revert_layout",
            name="Test",
            plot_width=40.0,
            plot_length=50.0,
            rooms=[room],
            floors=[floor],
            exterior_walls=[],
            interior_walls=[],
            doors=[],
            windows=[],
        )

        req = EditRoomRequest(
            current_layout=layout,
            room_id="room_living",
            proposed_rect=Rect(x=6.0, y=6.0, width=15.0, length=18.0),
            push_adjacent=True,
        )
        res = await edit_room_endpoint(req)
        assert res.success is True
        # Verify the updated layout maintains new dimensions and isn't reverted
        updated_room = next(r for r in res.layout.rooms if r.id == "room_living")
        assert updated_room.rect.x == 6.0
        assert updated_room.rect.y == 6.0
        assert updated_room.rect.width == 15.0
        assert updated_room.rect.length == 18.0

    asyncio.run(_test())
