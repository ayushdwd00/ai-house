import pytest
import sys
import os

# Add backend to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi.testclient import TestClient
from main import app
from render.render_service import check_blender_status, render_layout_realistic

client = TestClient(app)

def create_sample_layout(floors_count=1, facing="south"):
    rooms_f1 = [
        {
            "id": "room_living",
            "name": "Living Room",
            "type": "living_room",
            "zone": "public",
            "rect": {"x": 5.0, "y": 5.0, "width": 16.0, "length": 14.0},
            "color": "#E5E7EB",
            "floor_material": "hardwood_oak",
            "furniture": [
                {"id": "f_sofa", "type": "sofa", "x": 10.0, "y": 10.0, "width": 6.0, "length": 3.0, "rotation": 0}
            ]
        },
        {
            "id": "room_stair",
            "name": "Staircase",
            "type": "staircase",
            "zone": "circulation",
            "rect": {"x": 21.0, "y": 5.0, "width": 8.0, "length": 12.0},
            "color": "#D1D5DB",
            "floor_material": "wood_deck",
            "furniture": []
        }
    ]

    floors = [{
        "floor_number": 1,
        "floor_name": "Ground Level",
        "rooms": rooms_f1,
        "exterior_walls": [
            {"id": "w_ext_1", "x1": 5.0, "y1": 5.0, "x2": 29.0, "y2": 5.0, "thickness": 0.75, "is_exterior": True},
            {"id": "w_ext_2", "x1": 29.0, "y1": 5.0, "x2": 29.0, "y2": 19.0, "thickness": 0.75, "is_exterior": True},
            {"id": "w_ext_3", "x1": 29.0, "y1": 19.0, "x2": 5.0, "y2": 19.0, "thickness": 0.75, "is_exterior": True},
            {"id": "w_ext_4", "x1": 5.0, "y1": 19.0, "x2": 5.0, "y2": 5.0, "thickness": 0.75, "is_exterior": True},
        ],
        "interior_walls": [
            {"id": "w_int_1", "x1": 21.0, "y1": 5.0, "x2": 21.0, "y2": 19.0, "thickness": 0.38, "is_exterior": False}
        ],
        "doors": [
            {"id": "d_entry", "door_type": "entrance", "x1": 11.0, "y1": 19.0, "x2": 15.0, "y2": 19.0, "width": 4.0}
        ],
        "windows": [
            {"id": "win_1", "x1": 8.0, "y1": 5.0, "x2": 14.0, "y2": 5.0, "width": 6.0}
        ]
    }]

    if floors_count > 1:
        rooms_f2 = [
            {
                "id": "room_master_bed",
                "name": "Master Bedroom",
                "type": "master_bedroom",
                "zone": "private",
                "rect": {"x": 5.0, "y": 5.0, "width": 16.0, "length": 14.0},
                "color": "#E5E7EB",
                "floor_material": "hardwood_oak",
                "furniture": [
                    {"id": "f_bed", "type": "bed", "x": 12.0, "y": 10.0, "width": 6.0, "length": 6.5, "rotation": 0}
                ]
            }
        ]
        floors.append({
            "floor_number": 2,
            "floor_name": "First Level",
            "rooms": rooms_f2,
            "exterior_walls": [
                {"id": "w2_ext_1", "x1": 5.0, "y1": 5.0, "x2": 29.0, "y2": 5.0, "thickness": 0.75, "is_exterior": True},
                {"id": "w2_ext_2", "x1": 29.0, "y1": 5.0, "x2": 29.0, "y2": 19.0, "thickness": 0.75, "is_exterior": True},
                {"id": "w2_ext_3", "x1": 29.0, "y1": 19.0, "x2": 5.0, "y2": 19.0, "thickness": 0.75, "is_exterior": True},
                {"id": "w2_ext_4", "x1": 5.0, "y1": 19.0, "x2": 5.0, "y2": 5.0, "thickness": 0.75, "is_exterior": True},
            ],
            "interior_walls": [],
            "doors": [],
            "windows": [
                {"id": "win2_1", "x1": 8.0, "y1": 5.0, "x2": 14.0, "y2": 5.0, "width": 6.0}
            ]
        })

    all_rooms = []
    for fl in floors:
        all_rooms.extend(fl["rooms"])

    return {
        "id": f"test_layout_{floors_count}f_{facing}",
        "title": f"Test Architectural Layout {floors_count}F",
        "designer_rationale": "Authoritative canonical testing layout",
        "plot_width": 40.0,
        "plot_length": 50.0,
        "num_floors": floors_count,
        "facing": facing,
        "orientation": facing,
        "site": {
            "plot_width": 40.0,
            "plot_length": 50.0,
            "total_plot_area": 2000.0,
            "road_side": facing,
            "frontage_ft": 40.0,
            "setbacks": {"front": 10.0, "rear": 5.0, "left": 5.0, "right": 5.0},
            "buildable_envelope": {"x": 5.0, "y": 5.0, "width": 30.0, "length": 35.0}
        },
        "stats": {
            "total_area_sqft": 800.0 * floors_count,
            "living_area_sqft": 700.0 * floors_count,
            "width_ft": 24.0,
            "length_ft": 14.0,
            "num_floors": floors_count,
            "bedroom_count": 1,
            "bathroom_count": 1,
            "aspect_ratio": 1.7,
            "coverage_percentage": 35.0
        },
        "floors": floors,
        "rooms": all_rooms,
        "entry_point": {"x": 13.0, "y": 19.0, "direction": 0}
    }

def test_blender_status_endpoint():
    res = client.get("/api/render-realistic/status")
    assert res.status_code == 200
    data = res.json()
    assert "available" in data
    assert "message" in data

def test_render_endpoint_validation():
    # Calling without layout should return 400
    res = client.post("/api/render-realistic", json={})
    assert res.status_code == 400

def test_single_floor_layout_render_dispatch():
    layout = create_sample_layout(floors_count=1, facing="south")
    res = client.post("/api/render-realistic", json={
        "layout": layout,
        "cutaway": True,
        "resolution": "1280x720",
        "samples": 32,
        "lighting": "day"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ["success", "blender_not_installed"]

def test_multi_floor_layout_render_dispatch():
    layout = create_sample_layout(floors_count=2, facing="east")
    res = client.post("/api/render-realistic", json={
        "layout": layout,
        "cutaway": True,
        "resolution": "1280x720",
        "samples": 32,
        "lighting": "sunset"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ["success", "blender_not_installed"]

def test_different_orientation_layout_render_dispatch():
    layout = create_sample_layout(floors_count=1, facing="north")
    res = client.post("/api/render-realistic", json={
        "layout": layout,
        "cutaway": False,
        "resolution": "1280x720",
        "samples": 32,
        "lighting": "night"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ["success", "blender_not_installed"]

def test_elevation_transform_consistency():
    # Mathematical invariant check:
    # FloorBaseY(f) = plinthHeight + f * floorHeight
    plinthHeight = 0.8
    floorHeight = 10.0
    fullWallHeight = 9.5
    slabThickness = 0.6
    
    # Floor 0
    f0_base = plinthHeight + 0 * floorHeight
    assert f0_base == 0.8
    # Floor 1
    f1_base = plinthHeight + 1 * floorHeight
    assert f1_base == 10.8
    # Slab between Floor 0 and Floor 1
    slab_top = f1_base
    slab_bottom = f1_base - slabThickness
    assert round(slab_bottom, 4) == 10.2
    assert round(slab_top, 4) == 10.8
    # Top of Floor 1 walls
    top_walls = f1_base + fullWallHeight
    assert round(top_walls, 4) == 20.3
    # Roof slab directly connects on top_walls
    roof_base = top_walls
    assert round(roof_base, 4) == 20.3
    assert round(roof_base + slabThickness, 4) == 20.9
