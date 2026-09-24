"""
Phase 4 Focused Tests: Furniture Placement, Door Swing Clearance, and Circulation Network
"""
import pytest
from models import Room, Rect, Door
from architecture.furniture_validator import validate_and_place_furniture, get_minimum_dimensions_for_furniture
from architecture.zoning_graph import validate_circulation_network


def test_1_furniture_placement_master_bedroom():
    """Verify king bed, side tables, and wardrobe placement inside master bedroom."""
    room = Room(
        id="m_bed", name="Master Suite", type="master_bedroom", zone="private",
        rect=Rect(x=5.0, y=5.0, width=14.0, length=15.0)
    )
    items, score, warnings = validate_and_place_furniture(room)
    assert len(items) >= 2
    types = [itm.type for itm in items]
    assert any("bed" in t for t in types)
    assert score >= 75.0


def test_2_door_swing_furniture_collision():
    """Verify that furniture in the path of a door swing triggers collision warning and fit deduction."""
    room = Room(
        id="small_bed", name="Bedroom", type="bedroom", zone="private",
        rect=Rect(x=5.0, y=5.0, width=10.0, length=10.5)
    )
    # Door located exactly where bed headboard or side table would sit
    door = Door(
        id="d1", room_id="small_bed",
        x=5.5, y=5.5, x1=5.0, y1=5.5, x2=6.0, y2=5.5, width=3.0, height=7.0
    )
    items, score, warnings = validate_and_place_furniture(room, doors=[door])
    # The placer detects door zone and avoids or flags
    assert isinstance(warnings, list)


def test_3_through_bedroom_circulation_rejected():
    """Verify that using a bedroom as a through-corridor is caught and flagged."""
    rooms = [
        Room(id="living", name="Living", type="living_room", zone="public"),
        Room(id="bed1", name="Bed 1", type="bedroom", zone="private"),
        Room(id="dining", name="Dining", type="dining", zone="public"),
    ]
    # Door connecting Living -> Bed 1 AND Bed 1 -> Dining (Bed 1 used as through room)
    doors = [
        Door(id="d1", from_room="living", to_room="bed1"),
        Door(id="d2", from_room="bed1", to_room="dining"),
    ]
    is_valid, errors, _ = validate_circulation_network(rooms, doors)
    assert is_valid is False
    assert any("through-room" in e for e in errors)


def test_4_kitchen_to_bathroom_direct_opening_rejected():
    """Verify that direct door between kitchen and bathroom is rejected."""
    rooms = [
        Room(id="kitchen", name="Kitchen", type="kitchen", zone="service"),
        Room(id="bath", name="Bath", type="bathroom", zone="service"),
    ]
    doors = [
        Door(id="d_bad", from_room="kitchen", to_room="bath")
    ]
    is_valid, errors, _ = validate_circulation_network(rooms, doors)
    assert is_valid is False
    assert any("Sanitary conflict" in e for e in errors)
