import json
import urllib.request
import sys

BASE_URL = "http://localhost:8000"

def run_case(name, payload, expect_success=True):
    print(f"\n{'='*70}")
    print(f"TEST CASE: {name}")
    print(f"Payload: plot={payload.get('plot_width')}x{payload.get('plot_length')}, floors={payload.get('num_floors')}, beds={payload.get('bedrooms')}, baths={payload.get('bathrooms')}")
    
    req = urllib.request.Request(
        f"{BASE_URL}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            validation = data.get("validation", {})
            is_valid = validation.get("is_valid", False)
            errors = validation.get("errors", [])
            rooms = data.get("rooms", [])
            floors = data.get("floors", [])
            
            print(f"Response: is_valid={is_valid}, total_rooms={len(rooms)}, num_floors={len(floors)}")
            if errors:
                print(f"Validation Notice/Errors: {errors}")
                
            if expect_success:
                assert is_valid, f"Expected success but got is_valid=False: {errors}"
                assert len(rooms) > 0, "Expected generated rooms"
                print(f">>> RESULT: PASSED (SUCCESSFUL GENERATION)")
                return True, data
            else:
                assert not is_valid or len(rooms) == 0, f"Expected rejection but got is_valid=True"
                print(f">>> RESULT: PASSED (EXPECTED REJECTION WITH LOGICAL ERRORS)")
                return True, data
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"HTTPError {e.code}: {body}")
        if not expect_success:
            print(f">>> RESULT: PASSED (EXPECTED REJECTION: {body})")
            return True, body
        else:
            print(f">>> RESULT: FAILED ({e.code})")
            return False, body
    except Exception as e:
        print(f"Exception: {e}")
        return False, str(e)

test_cases = [
    # 1. Case 1 (User observed 1)
    ("Case 1 (User Observed 1): 54x185 ft, 4 Bed, 3 Bath, 3 Floors", {
        "plot_width": 54.0, "plot_length": 185.0, "num_floors": 3, "bedrooms": 4, "bathrooms": 3.0, "road_side": "south"
    }, True),
    # 2. Case 2 (User observed 2)
    ("Case 2 (User Observed 2): 55x41 ft, 3 Bed, 3 Bath, 2 Floors", {
        "plot_width": 55.0, "plot_length": 41.0, "num_floors": 2, "bedrooms": 3, "bathrooms": 3.0, "road_side": "south"
    }, True),
    # 3. Case 3
    ("Case 3 (Generous Single Floor): 40x50 ft, 3 Bed, 2 Bath, 1 Floor", {
        "plot_width": 40.0, "plot_length": 50.0, "num_floors": 1, "bedrooms": 3, "bathrooms": 2.0, "road_side": "south"
    }, True),
    # 4. Case 4
    ("Case 4 (Compact 2BHK Single Floor): 30x40 ft, 2 Bed, 2 Bath, 1 Floor", {
        "plot_width": 30.0, "plot_length": 40.0, "num_floors": 1, "bedrooms": 2, "bathrooms": 2.0, "road_side": "north"
    }, True),
    # 5. Case 5
    ("Case 5 (Suburban G+1 4BHK): 45x60 ft, 4 Bed, 3 Bath, 2 Floors", {
        "plot_width": 45.0, "plot_length": 60.0, "num_floors": 2, "bedrooms": 4, "bathrooms": 3.0, "road_side": "east"
    }, True),
    # 6. Case 6
    ("Case 6 (Luxury 3-Floor 5BHK): 60x90 ft, 5 Bed, 4 Bath, 3 Floors", {
        "plot_width": 60.0, "plot_length": 90.0, "num_floors": 3, "bedrooms": 5, "bathrooms": 4.0, "road_side": "west"
    }, True),
    # 7. Case 7
    ("Case 7 (Medium G+1 3BHK): 35x50 ft, 3 Bed, 3 Bath, 2 Floors", {
        "plot_width": 35.0, "plot_length": 50.0, "num_floors": 2, "bedrooms": 3, "bathrooms": 3.0, "road_side": "south"
    }, True),
    # 8. Case 8 (Negative test)
    ("Case 8 (Negative Test - Genuinely Infeasible): 15x15 ft, 5 Bed, 3 Bath, 1 Floor", {
        "plot_width": 15.0, "plot_length": 15.0, "num_floors": 1, "bedrooms": 5, "bathrooms": 3.0, "road_side": "south"
    }, False),
]

all_passed = True
for name, payload, expect_success in test_cases:
    ok, _ = run_case(name, payload, expect_success)
    if not ok:
        all_passed = False

print("\n" + "="*70)
if all_passed:
    print("ALL 8 CASES VERIFIED SUCCESSFULLY!")
else:
    print("SOME CASES FAILED!")
