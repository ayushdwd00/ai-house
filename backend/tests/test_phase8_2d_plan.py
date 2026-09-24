import pytest
from models import IntakeRequest
from architecture.architectural_engine import generate_architectural_house_layout
from export.cad_export_engine import (
    format_feet_inch,
    get_door_window_schedules,
    export_layout_to_dxf,
    export_layout_to_indian_drawing_svg
)

def test_feet_inch_formatting():
    assert format_feet_inch(12.0) == "12'-0\""
    assert format_feet_inch(12.5) == "12'-6\""
    assert format_feet_inch(10.25) == "10'-3\""
    assert format_feet_inch(0.75) == "0'-9\""

def test_door_window_schedules():
    layout = generate_architectural_house_layout(plot_width=30, plot_length=40, road_side="north", bedrooms=2)
    door_sched, win_sched = get_door_window_schedules(layout)
    
    assert len(door_sched) > 0
    assert len(win_sched) > 0
    
    # Check schema
    first_door = door_sched[0]
    assert "tag" in first_door
    assert "width" in first_door
    assert "height" in first_door
    assert "lintel" in first_door
    
    first_win = win_sched[0]
    assert "tag" in first_win
    assert "sill" in first_win

def test_dxf_export_validity():
    layout = generate_architectural_house_layout(plot_width=30, plot_length=40, road_side="north", bedrooms=2)
    dxf = export_layout_to_dxf(layout)
    
    assert "SECTION" in dxf
    assert "ENTITIES" in dxf
    assert "EOF" in dxf
    assert "LAYER" in dxf
    # Check that standard layers exist
    assert "WALLS" in dxf
    assert "ROOMS" in dxf
    assert "COLUMNS" in dxf

def test_svg_drawing_features():
    layout = generate_architectural_house_layout(plot_width=30, plot_length=40, road_side="north", bedrooms=2)
    svg = export_layout_to_indian_drawing_svg(layout)
    
    assert "<svg" in svg
    assert "</svg>" in svg
    # Hatched poche pattern
    assert "hatched-poche" in svg
    # Door and window schedule table
    assert "DOOR &amp; WINDOW SCHEDULE" in svg or "DOOR & WINDOW SCHEDULE" in svg
    # North arrow
    assert "NORTH" in svg or "N" in svg
    # Graphical scale bar
    assert "GRAPHICAL SCALE" in svg
    # Plinth / General architectural notes
    assert "GENERAL NOTES" in svg
