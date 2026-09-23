import json
import urllib.request
import sys

BASE_URL = "http://localhost:8000"

def post_json(endpoint: str, data: dict):
    req = urllib.request.Request(
        f"{BASE_URL}{endpoint}",
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def test_1_large_plot():
    print("\n--- TEST 1: 40 x 60 ft, 4 bedrooms, normal room sizes ---")
    payload = {
        "plot": {"length": 60, "width": 40, "unit": "ft"},
        "num_floors": 2,
        "bedrooms": 4,
        "bathrooms": 3,
        "special_rooms": ["pooja", "study"]
    }
    rec = post_json("/api/recommend-dimensions", payload)
    print("Feasibility:", rec["feasibility_status"], "-", rec["feasibility_message"])
    print(f"Buildable envelope: {rec['buildable_width_ft']} x {rec['buildable_length_ft']} ft (Plot: {rec['plot_width_ft']} x {rec['plot_length_ft']})")
    
    # Check recommended rooms
    rooms = {r["type"]: r for r in rec["rooms"]}
    master = rooms.get("master_bedroom")
    living = rooms.get("living")
    print(f"Master Bedroom rec: {master['width']} x {master['length']} ft ({master['area_sqft']} sqft)")
    print(f"Living Room rec: {living['width']} x {living['length']} ft ({living['area_sqft']} sqft)")
    
    assert rec["feasibility_status"] == "comfortable", f"Expected comfortable, got {rec['feasibility_status']}"
    assert master["width"] >= 13.0 and master["length"] >= 14.0, f"Spacious/normal master expected, got {master}"
    print("TEST 1 PASSED!")

def test_2_standard_plot():
    print("\n--- TEST 2: 30 x 40 ft, 3 bedrooms, AI recommended sizes ---")
    payload = {
        "plot": {"length": 40, "width": 30, "unit": "ft"},
        "num_floors": 2,
        "bedrooms": 3,
        "bathrooms": 2,
        "special_rooms": ["pooja"]
    }
    rec = post_json("/api/recommend-dimensions", payload)
    print("Feasibility:", rec["feasibility_status"], "-", rec["feasibility_message"])
    rooms = {r["type"]: r for r in rec["rooms"]}
    master = rooms.get("master_bedroom")
    bed2 = rooms.get("bedroom_2")
    living = rooms.get("living")
    print(f"Master: {master['width']} x {master['length']} ft")
    print(f"Bed 2: {bed2['width']} x {bed2['length']} ft")
    print(f"Living: {living['width']} x {living['length']} ft")
    
    assert rec["feasibility_status"] in ["comfortable", "tight"], f"Unexpected status {rec['feasibility_status']}"
    assert master["width"] >= 11.0, f"Expected standard width, got {master['width']}"
    print("TEST 2 PASSED!")

def test_3_small_plot_optimization():
    print("\n--- TEST 3: 20 x 30 ft, 3-4 bedrooms, small-plot optimization ---")
    # Single floor test -> should detect tight / infeasible on 1 floor
    payload_1f = {
        "plot": {"length": 30, "width": 20, "unit": "ft"},
        "num_floors": 1,
        "bedrooms": 3,
        "bathrooms": 2,
        "special_rooms": []
    }
    rec_1f = post_json("/api/recommend-dimensions", payload_1f)
    print("1-Floor 20x30 Feasibility:", rec_1f["feasibility_status"], "-", rec_1f["feasibility_message"])
    assert rec_1f["feasibility_status"] in ["tight", "infeasible"], "Expected tight/infeasible for 3 beds on 1 floor 20x30"
    
    # 2-Floor test -> should adapt to compact sizes and recommend multi-floor allocation
    payload_2f = {
        "plot": {"length": 30, "width": 20, "unit": "ft"},
        "num_floors": 2,
        "bedrooms": 3,
        "bathrooms": 2,
        "special_rooms": []
    }
    rec_2f = post_json("/api/recommend-dimensions", payload_2f)
    print("2-Floor 20x30 Feasibility:", rec_2f["feasibility_status"], "-", rec_2f["feasibility_message"])
    print("Coverage:", rec_2f["ground_coverage_pct"], "%")
    rooms = {r["type"]: r for r in rec_2f["rooms"]}
    master = rooms.get("master_bedroom")
    print(f"Compact Master: {master['width']} x {master['length']} ft ({master['area_sqft']} sqft)")
    # Compact rooms should not exceed 12x13 ft
    assert master["width"] <= 12.0 and master["length"] <= 13.0, f"Master was not scaled down for small plot: {master}"
    assert len(rec_2f.get("strategies", [])) > 0, "Expected viable alternative strategies for small plot"
    print("TEST 3 PASSED!")

def test_4_custom_manual_dimensions():
    print("\n--- TEST 4: Custom manual room dimensions & solver respect ---")
    custom_rooms = [
        {
            "id": "living_1",
            "name": "Grand Living Room",
            "type": "living",
            "floor_id": "floor_1",
            "floor_number": 1,
            "size_mode": "manual",
            "length": 18.0,
            "width": 15.0,
            "is_hard_constraint": True
        },
        {
            "id": "master_1",
            "name": "Custom Master Bed",
            "type": "master_bedroom",
            "floor_id": "floor_2",
            "floor_number": 2,
            "size_mode": "manual",
            "length": 16.0,
            "width": 14.0,
            "is_hard_constraint": True
        },
        {
            "id": "kitchen_1",
            "name": "Compact Kitchen",
            "type": "kitchen",
            "floor_id": "floor_1",
            "floor_number": 1,
            "size_mode": "ai_recommended",
            "preferred_length": 10.0,
            "preferred_width": 9.0,
            "is_hard_constraint": False
        }
    ]
    intake = {
        "plot": {"length": 50, "width": 35, "unit": "ft"},
        "floors": 2,
        "family_size": 4,
        "lifestyle": "modern",
        "budget": "standard",
        "parking": "1_car",
        "room_allocations": custom_rooms,
        "room_requirements": custom_rooms
    }
    layout = post_json("/api/generate", intake)
    print("Generated layout ID:", layout.get("id"))
    print("Plot Width:", layout["plot"]["width"], "Length:", layout["plot"]["length"])
    assert layout["plot"]["width"] == 35.0
    assert layout["plot"]["length"] == 50.0
    
    # Check floor rooms
    floor_1 = next((f for f in layout["floors"] if f["floor_number"] == 1), None)
    floor_2 = next((f for f in layout["floors"] if f["floor_number"] == 2), None)
    assert floor_1 is not None and floor_2 is not None
    
    # Check living room dimensions on floor 1
    living_rm = next((r for r in floor_1["rooms"] if "living" in r["name"].lower() or r["room_type"] == "living"), None)
    assert living_rm is not None, "Living room missing on floor 1"
    lw = round(living_rm["rect"]["width"], 1)
    ll = round(living_rm["rect"]["length"], 1)
    print(f"Manual Living Room: requested 15.0 x 18.0 ft, solver produced {lw} x {ll} ft")
    # Should respect manual constraint within reasonable tolerance
    assert abs(lw - 15.0) <= 2.5 or abs(ll - 15.0) <= 2.5, f"Manual dimension deviated too far: {lw} x {ll}"
    print("TEST 4 PASSED!")

def test_5_multi_floor_allocation():
    print("\n--- TEST 5: Multi-floor allocation respect ---")
    custom_rooms = [
        {"name": "Living", "type": "living", "floor_id": "floor_1", "floor_number": 1},
        {"name": "Kitchen", "type": "kitchen", "floor_id": "floor_1", "floor_number": 1},
        {"name": "Dining", "type": "dining", "floor_id": "floor_1", "floor_number": 1},
        {"name": "Bed 1", "type": "bedroom", "floor_id": "floor_1", "floor_number": 1},
        {"name": "Master Bed", "type": "master_bedroom", "floor_id": "floor_2", "floor_number": 2},
        {"name": "Bed 2", "type": "bedroom_2", "floor_id": "floor_2", "floor_number": 2},
        {"name": "Bed 3", "type": "bedroom_3", "floor_id": "floor_2", "floor_number": 2},
    ]
    intake = {
        "plot": {"length": 45, "width": 30, "unit": "ft"},
        "floors": 2,
        "family_size": 5,
        "lifestyle": "modern",
        "budget": "standard",
        "parking": "1_car",
        "room_allocations": custom_rooms,
        "room_requirements": custom_rooms
    }
    layout = post_json("/api/generate", intake)
    assert len(layout["floors"]) >= 2, "Expected at least 2 floors"
    f1 = layout["floors"][0]
    f2 = layout["floors"][1]
    f1_types = [r["room_type"] for r in f1["rooms"]]
    f2_types = [r["room_type"] for r in f2["rooms"]]
    print("Floor 1 room types:", f1_types)
    print("Floor 2 room types:", f2_types)
    assert "master_bedroom" in f2_types, "Master bedroom should be on Floor 2 as assigned"
    assert "living" in f1_types, "Living room should be on Floor 1 as assigned"
    print("TEST 5 PASSED!")

if __name__ == "__main__":
    try:
        test_1_large_plot()
        test_2_standard_plot()
        test_3_small_plot_optimization()
        test_4_custom_manual_dimensions()
        test_5_multi_floor_allocation()
        print("\n==========================================")
        print("ALL 5 VERIFICATION SCENARIOS PASSED 100%!")
        print("==========================================")
    except Exception as e:
        print(f"\nTEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
