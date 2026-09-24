"""
Phase 3 Focused Tests: Indian Norms, Feasibility Pre-check, and NBC 2016 Integration
"""
import pytest
from models import Rect, Room
from architecture.indian_norms import (
    get_city_norms, check_program_feasibility, validate_nbc_openings_and_circulation
)


def test_1_nbc_norms_loading_and_city_override():
    """Verify loading of NBC 2016 base norms and city overrides."""
    norms = get_city_norms("bengaluru")
    assert norms["baseline"] == "NBC_2016"
    assert norms["habitable_rooms"]["first_habitable_min_area_sqm"] == 9.5
    assert norms["kitchen"]["min_width_m"] == 1.8
    assert "active_city_overrides" in norms
    assert norms["active_city_overrides"]["front_setback_min_m"] == 1.5


def test_2_feasibility_check_success():
    """Verify feasible program passes pre-check with diagnostics."""
    envelope = Rect(x=3.0, y=3.0, width=34.0, length=44.0)  # ~1496 sq ft
    rooms = [
        Room(id="r1", name="Living", type="living_room", min_width=12.0, min_length=14.0),
        Room(id="r2", name="Kitchen", type="kitchen", min_width=8.0, min_length=10.0),
        Room(id="r3", name="Master", type="master_bedroom", min_width=11.5, min_length=13.0),
        Room(id="r4", name="Bath", type="bathroom", min_width=5.0, min_length=7.0),
    ]
    is_feasible, failure, diagnostics = check_program_feasibility(rooms, envelope, num_floors=1)
    assert is_feasible is True
    assert failure is None
    assert diagnostics["ground_deficit_sqft"] == 0.0


def test_3_feasibility_check_failure_and_actionable_alternatives():
    """Verify over-constrained room program on small envelope returns structured failure."""
    tiny_envelope = Rect(x=3.0, y=3.0, width=15.0, length=20.0)  # 300 sq ft envelope
    large_rooms = [
        Room(id="r1", name="Living", type="living_room", min_width=15.0, min_length=18.0),
        Room(id="r2", name="Master", type="master_bedroom", min_width=14.0, min_length=16.0),
        Room(id="r3", name="Bed 2", type="bedroom", min_width=12.0, min_length=14.0),
        Room(id="r4", name="Bed 3", type="bedroom", min_width=12.0, min_length=14.0),
    ]
    is_feasible, failure, diagnostics = check_program_feasibility(large_rooms, tiny_envelope, num_floors=1)
    assert is_feasible is False
    assert failure is not None
    assert failure.status == "failed"
    assert failure.stage == "feasibility_check"
    assert "suggested_actions" in failure.diagnostics
    assert any("floors" in action for action in failure.diagnostics["suggested_actions"])


def test_4_window_daylight_ratio_validation():
    """Verify NBC 10% natural daylight aperture check."""
    from models import Window
    room = Room(id="r_bed", name="Bedroom", type="bedroom", min_width=10.0, min_length=12.0, preferred_width=10.0, preferred_length=12.0)
    # 120 sq ft room requires >= 12 sq ft window area
    small_win = Window(id="w1", room_id="r_bed", width=2.0, height=3.0)  # 6 sq ft (< 12 sq ft)
    warnings = validate_nbc_openings_and_circulation([room], [small_win], [])
    assert len(warnings) >= 1
    assert "below NBC 10% ratio" in warnings[0]
