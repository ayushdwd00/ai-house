"""
Terminal verification script for Section 0: Deterministic layout generation.
Runs generate_architectural_house_layout 5 times with identical inputs:
40x50, 3 bedrooms, 2 bathrooms, road_side="south", parking_spaces=1.
Serializes the room geometries and asserts byte-for-byte identity across all 5 runs.
"""
import sys
import json
from architectural_engine import generate_architectural_house_layout

def run_verification():
    print("=" * 60)
    print("VERIFYING DETERMINISTIC ARCHITECTURAL HOUSE LAYOUT GENERATION")
    print("Test input: 40x50 plot, 3 beds, 2 baths, south road, 1 parking")
    print("=" * 60)

    runs = []
    for i in range(1, 6):
        print(f"\n[RUN {i}/5] Generating layout...")
        layout = generate_architectural_house_layout(
            plot_width=40.0,
            plot_length=50.0,
            bedrooms=3,
            bathrooms=2.0,
            road_side="south",
            parking_spaces=1
        )
        serialized_rooms = [
            {
                "id": r.id,
                "type": r.type,
                "name": r.name,
                "x": round(float(r.rect.x), 2),
                "y": round(float(r.rect.y), 2),
                "width": round(float(r.rect.width), 2),
                "length": round(float(r.rect.length), 2)
            }
            for r in sorted(layout.rooms, key=lambda x: x.id)
        ]
        serialized_json = json.dumps(serialized_rooms, indent=2, sort_keys=True)
        runs.append((i, serialized_json, serialized_rooms))
        print(f"  Rooms count: {len(layout.rooms)}")
        master = next((r for r in layout.rooms if r.type == "master_bedroom"), None)
        if master:
            print(f"  Master bedroom rect: x={master.rect.x}, y={master.rect.y}, w={master.rect.width}, l={master.rect.length}")
        kitchen = next((r for r in layout.rooms if r.type == "kitchen"), None)
        if kitchen:
            print(f"  Kitchen rect: x={kitchen.rect.x}, y={kitchen.rect.y}, w={kitchen.rect.width}, l={kitchen.rect.length}")

    print("\n" + "=" * 60)
    print("ASSERTING IDENTICAL SERIALIZED ROOM RECTS ACROSS RUNS")
    print("=" * 60)

    base_run_num, base_json, base_rooms = runs[0]
    all_matched = True

    for run_num, r_json, r_rooms in runs[1:]:
        if r_json == base_json:
            print(f"[PASS] Run {run_num} == Run 1: BYTE-FOR-BYTE IDENTICAL ({len(r_rooms)} rooms match)")
        else:
            print(f"[FAIL] Run {run_num} != Run 1: MISMATCH DETECTED!")
            all_matched = False

    if all_matched:
        print("\nSUCCESS: All 5 runs generated 100% byte-for-byte identical room geometry.")
        return 0
    else:
        print("\nFAILURE: Layout generation is non-deterministic.")
        return 1

if __name__ == "__main__":
    sys.exit(run_verification())
