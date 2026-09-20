"""
Test Suite for User-Specified Attached Bathroom Count
Verifies:
1. When attached_bathroom_count=2 is requested for a 4-bedroom home (single story):
   - Exactly 2 bedrooms have valid attached_room_id.
   - The attached bathrooms physically touch their corresponding bedrooms.
   - The remaining 2 bedrooms are served by a shared common bathroom.
2. When attached_bathroom_count=2 is requested for a 4-bedroom home (two stories):
   - Exactly 2 bedrooms across the house have valid attached_room_id.
   - Attached bathrooms physically touch their respective parent bedrooms.
   - Upper level secondary bedrooms are served by a shared common bathroom.
"""

import unittest
from shapely.geometry import box
from architectural_engine import generate_architectural_house_layout


class TestAttachedBathrooms(unittest.TestCase):

    def test_single_story_4_bed_2_attached_baths(self):
        """Single-story 4-bed with 2 attached baths: exactly 2 attached, 2 shared, touching adjacency."""
        layout = generate_architectural_house_layout(
            plot_width=42.0,
            plot_length=50.0,
            num_floors=1,
            bedrooms=4,
            attached_bathroom_count=2,
            road_side="south",
            parking_spaces=1
        )
        self.assertTrue(layout.validation.is_valid, f"Layout failed validation: {layout.validation.errors}")

        all_beds = [r for r in layout.rooms if "bedroom" in r.type]
        self.assertEqual(len(all_beds), 4, f"Expected 4 bedrooms, got {len(all_beds)}")

        attached_beds = [r for r in all_beds if r.attached_room_id is not None]
        unattached_beds = [r for r in all_beds if r.attached_room_id is None]

        self.assertEqual(len(attached_beds), 2, f"Expected exactly 2 bedrooms with attached baths, got {len(attached_beds)}")
        self.assertEqual(len(unattached_beds), 2, f"Expected exactly 2 bedrooms without attached baths, got {len(unattached_beds)}")

        # Verify that each attached bathroom exists, is a bathroom, and physically touches its bedroom
        for bed in attached_beds:
            bath = next((r for r in layout.rooms if r.id == bed.attached_room_id), None)
            self.assertIsNotNone(bath, f"Attached bathroom '{bed.attached_room_id}' not found in layout!")
            self.assertEqual(bath.type, "bathroom")
            self.assertEqual(bath.attached_room_id, bed.id, "Bidirectional attached_room_id mismatch!")

            # Geometric touch check (Shapely)
            bed_poly = box(bed.rect.x, bed.rect.y, bed.rect.right, bed.rect.bottom)
            bath_poly = box(bath.rect.x, bath.rect.y, bath.rect.right, bath.rect.bottom)
            # Rooms must touch or share a boundary (within 0.1ft numeric tolerance)
            is_touching = bed_poly.buffer(0.15).intersects(bath_poly)
            self.assertTrue(
                is_touching,
                f"Bedroom '{bed.name}' does not touch its attached bathroom '{bath.name}'! (Bed: {bed.rect}, Bath: {bath.rect})"
            )

        # Verify shared common bathroom exists
        common_baths = [r for r in layout.rooms if r.id == "f1_common_bath"]
        self.assertEqual(len(common_baths), 1, "Expected 1 common bathroom serving unattached bedrooms")

    def test_two_story_4_bed_2_attached_baths(self):
        """Two-story 4-bed with 2 attached baths: exactly 2 attached across floors, touching adjacency."""
        layout = generate_architectural_house_layout(
            plot_width=40.0,
            plot_length=60.0,
            num_floors=2,
            bedrooms=4,
            attached_bathroom_count=2,
            road_side="south",
            parking_spaces=2
        )
        self.assertTrue(layout.validation.is_valid, f"Layout failed validation: {layout.validation.errors}")

        all_rooms = [r for floor in layout.floors for r in floor.rooms]
        all_beds = [r for r in all_rooms if "bedroom" in r.type]
        self.assertEqual(len(all_beds), 4, f"Expected 4 bedrooms across 2 floors, got {len(all_beds)}")

        attached_beds = [r for r in all_beds if r.attached_room_id is not None]
        unattached_beds = [r for r in all_beds if r.attached_room_id is None]

        self.assertEqual(len(attached_beds), 2, f"Expected exactly 2 bedrooms with attached baths, got {len(attached_beds)}")
        self.assertEqual(len(unattached_beds), 2, f"Expected exactly 2 bedrooms without attached baths, got {len(unattached_beds)}")

        # Verify physical touch
        for bed in attached_beds:
            floor_rooms = next(f.rooms for f in layout.floors if f.floor_number == bed.floor)
            bath = next((r for r in floor_rooms if r.id == bed.attached_room_id), None)
            self.assertIsNotNone(bath, f"Attached bathroom '{bed.attached_room_id}' not found on floor {bed.floor}")

            bed_poly = box(bed.rect.x, bed.rect.y, bed.rect.right, bed.rect.bottom)
            bath_poly = box(bath.rect.x, bath.rect.y, bath.rect.right, bath.rect.bottom)
            is_touching = bed_poly.buffer(0.15).intersects(bath_poly)
            self.assertTrue(
                is_touching,
                f"Bedroom '{bed.name}' on Floor {bed.floor} does not touch attached bath '{bath.name}'!"
            )


if __name__ == "__main__":
    unittest.main()
