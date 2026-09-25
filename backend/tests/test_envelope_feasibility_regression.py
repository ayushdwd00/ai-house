"""
Regression Test Suite for Buildable Envelope Feasibility Validation

Guards against false "insufficient buildable envelope" rejections where
available buildable envelope area is reported as insufficient even when
available area exceeds program requirements.

Verifies:
1. User Reported Case 1: 54x185 ft (envelope ~44x170 ft = 7480 sq ft), 4 beds, 3 baths, 3 floors.
2. User Reported Case 2: 55x41 ft (envelope ~49x32 ft = 1568 sq ft), 3 beds, 3 baths, 2 floors.
3. Generous Case: 40x50 ft, 3 beds, 2 baths, 1 floor.
4. Compact Valid Case: 30x40 ft, 2 beds, 2 baths, 1 floor.
5. Genuinely Infeasible Case: 15x15 ft, 5 beds, 3 baths, 1 floor
   - Correctly fails validation.
   - Error clearly states required area > available buildable area (no mathematical contradiction).
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import re
import unittest
from architecture.architectural_engine import generate_architectural_house_layout


class TestEnvelopeFeasibilityRegression(unittest.TestCase):

    def test_generous_plot_single_floor(self):
        """A generous 40x50 ft plot with 3 beds, 2 baths must always pass feasibility validation."""
        layout = generate_architectural_house_layout(
            plot_width=40.0,
            plot_length=50.0,
            num_floors=1,
            bedrooms=3,
            bathrooms=2.0,
            road_side="south"
        )
        self.assertTrue(layout.validation.is_valid, f"Unexpected validation failure: {layout.validation.errors}")
        self.assertGreater(len(layout.rooms), 0, "Layout should have generated rooms")
        for err in layout.validation.errors:
            self.assertNotIn("insufficient", err.lower())

    def test_observed_case_1_multifloor_4bed_3bath_3floors(self):
        """User observed Case 1: 54x185 ft, 4 beds, 3 baths, 3 floors (envelope ~7480 sq ft)."""
        layout = generate_architectural_house_layout(
            plot_width=54.0,
            plot_length=185.0,
            num_floors=3,
            bedrooms=4,
            bathrooms=3.0,
            road_side="south"
        )
        self.assertTrue(layout.validation.is_valid, f"Case 1 falsely rejected: {layout.validation.errors}")
        self.assertEqual(layout.num_floors, 3)
        self.assertGreater(len(layout.rooms), 0)
        for err in layout.validation.errors:
            self.assertNotIn("insufficient", err.lower())

    def test_observed_case_2_multifloor_3bed_3bath_2floors(self):
        """User observed Case 2: 55x41 ft, 3 beds, 3 baths, 2 floors (envelope ~1568 sq ft)."""
        layout = generate_architectural_house_layout(
            plot_width=55.0,
            plot_length=41.0,
            num_floors=2,
            bedrooms=3,
            bathrooms=3.0,
            road_side="south"
        )
        self.assertTrue(layout.validation.is_valid, f"Case 2 falsely rejected: {layout.validation.errors}")
        self.assertEqual(layout.num_floors, 2)
        self.assertGreater(len(layout.rooms), 0)
        for err in layout.validation.errors:
            self.assertNotIn("insufficient", err.lower())

    def test_compact_valid_plot_single_floor(self):
        """A standard compact 30x40 ft plot with 2 beds, 2 baths must pass feasibility validation."""
        layout = generate_architectural_house_layout(
            plot_width=30.0,
            plot_length=40.0,
            num_floors=1,
            bedrooms=2,
            bathrooms=2.0,
            road_side="north"
        )
        self.assertTrue(layout.validation.is_valid, f"Compact plot falsely rejected: {layout.validation.errors}")
        self.assertGreater(len(layout.rooms), 0)

    def test_genuinely_infeasible_plot_correctly_rejects_with_logical_message(self):
        """A genuinely tiny 15x15 ft plot with 5 bedrooms cannot fit and must reject logically (req > avail)."""
        layout = generate_architectural_house_layout(
            plot_width=15.0,
            plot_length=15.0,
            num_floors=1,
            bedrooms=5,
            bathrooms=3.0,
            road_side="south"
        )
        self.assertFalse(layout.validation.is_valid, "15x15 plot with 5 beds should not be valid")
        self.assertGreater(len(layout.validation.errors), 0, "Expected validation error for tiny plot")
        error_text = " ".join(layout.validation.errors)
        self.assertIn("insufficient", error_text.lower())
        
        # Verify no self-contradictory numbers: required area must exceed available area
        match = re.search(
            r"(\d+(?:\.\d+)?)\s*sq\s*ft.*?(?:requires? at least ~?|require at least ~?)(\d+(?:\.\d+)?)\s*sq\s*ft",
            error_text,
            re.IGNORECASE
        )
        self.assertIsNotNone(match, f"Could not find available and required areas in error text: {error_text}")
        avail_sqft = float(match.group(1))
        req_sqft = float(match.group(2))
        self.assertGreater(
            req_sqft, avail_sqft,
            f"Contradictory rejection: reported req ({req_sqft}) <= avail ({avail_sqft}). Full message: {error_text}"
        )


if __name__ == "__main__":
    unittest.main()
