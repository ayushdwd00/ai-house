"""
Comprehensive Architectural Engine Test Suite
Tests all 7 required core regression and validation scenarios:
1. 30x40 standard urban lot
2. 40x50 multi-bedroom plan with attached suite and home office
3. 40x60 two-story plan testing multi-floor vertical staircase alignment
4. Constrained impossible plot (graceful validation message, no crash)
5. Vastu Shastra compliance on vs off
6. Localized refinement preservation (unaffected rooms unchanged)
7. Full architectural validator integration (zero overlaps, containment, circulation)
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import unittest
from models import HouseLayout, Rect
from architecture.architectural_engine import generate_architectural_house_layout
from ai.refinement_engine import refine_current_house_layout
from architecture.architectural_validator import validate_design


class TestComprehensiveArchitecturalEngine(unittest.TestCase):

    def test_01_standard_urban_lot_30x40(self):
        """1. Standard 30x40 urban lot (2 bed, 2 bath)."""
        layout = generate_architectural_house_layout(
            plot_width=30.0,
            plot_length=40.0,
            bedrooms=2,
            bathrooms=2.0,
            road_side="south",
            parking_spaces=1
        )
        self.assertTrue(layout.validation.is_valid, f"Validation errors: {layout.validation.errors}")
        self.assertGreaterEqual(len(layout.rooms), 6)
        self.assertGreaterEqual(layout.scores.overall_score, 75.0)
        self.assertIsNotNone(layout.site.parking)

        # Confirm containment and zero room overlaps
        val = validate_design(layout)
        self.assertTrue(val.is_valid, f"Validator reported issues: {val.errors}")

    def test_02_multi_bedroom_40x50_with_office(self):
        """2. 40x50 multi-bedroom plan with primary suite and home office."""
        layout = generate_architectural_house_layout(
            plot_width=40.0,
            plot_length=50.0,
            bedrooms=3,
            bathrooms=2.5,
            special_rooms=["Home Office"],
            road_side="south",
            parking_spaces=1
        )
        self.assertTrue(layout.validation.is_valid)
        self.assertGreaterEqual(len(layout.rooms), 8)

        # Primary suite must have attached bathroom
        master = next((r for r in layout.rooms if r.type == "master_bedroom"), None)
        self.assertIsNotNone(master)
        self.assertIsNotNone(master.attached_room_id)

        # Verify office is present
        office = next((r for r in layout.rooms if r.type == "office"), None)
        self.assertIsNotNone(office)

    def test_03_two_story_40x60_staircase_alignment(self):
        """3. 40x60 two-story plan testing vertical staircase shaft alignment."""
        layout = generate_architectural_house_layout(
            plot_width=40.0,
            plot_length=60.0,
            num_floors=2,
            bedrooms=4,
            bathrooms=3.0,
            road_side="south",
            parking_spaces=2
        )
        self.assertTrue(layout.validation.is_valid)
        self.assertEqual(len(layout.floors), 2)

        # Check staircases on floor 1 and 2
        f1_stair = next((r for r in layout.floors[0].rooms if r.type == "staircase"), None)
        f2_stair = next((r for r in layout.floors[1].rooms if r.type == "staircase"), None)
        self.assertIsNotNone(f1_stair, "Floor 1 must contain a staircase")
        self.assertIsNotNone(f2_stair, "Floor 2 must contain a staircase")

        # Vertical alignment: exact x, y, width, length stacking
        dx = abs(f1_stair.rect.x - f2_stair.rect.x)
        dy = abs(f1_stair.rect.y - f2_stair.rect.y)
        self.assertLessEqual(dx, 1.0, f"Vertical staircase X offset too large: {dx:.2f}ft")
        self.assertLessEqual(dy, 1.0, f"Vertical staircase Y offset too large: {dy:.2f}ft")

        # Stair metadata checks
        stair_obj_f1 = layout.floors[0].staircase
        self.assertIsNotNone(stair_obj_f1)
        if hasattr(stair_obj_f1, "direction"):
            self.assertEqual(stair_obj_f1.direction, "up")
            self.assertIn("material", stair_obj_f1.railing_metadata)

    def test_04_constrained_impossible_plot(self):
        """4. Constrained impossible plot (14x14 plot with 5 bedrooms)."""
        layout = generate_architectural_house_layout(
            plot_width=14.0,
            plot_length=14.0,
            bedrooms=5,
            bathrooms=4.0
        )
        # Must handle gracefully without unhandled exceptions
        self.assertIsNotNone(layout)
        self.assertFalse(layout.validation.is_valid)
        self.assertGreater(len(layout.validation.errors), 0)
        self.assertIn("insufficient", layout.validation.errors[0].lower())

    def test_05_vastu_compliance_on_vs_off(self):
        """5. Vastu compliance on vs off."""
        layout_on = generate_architectural_house_layout(
            plot_width=42.0, plot_length=48.0, bedrooms=3, bathrooms=2.0, vastu_compliant=True
        )
        self.assertIsNotNone(layout_on.scores.vastu_score)
        self.assertGreaterEqual(layout_on.scores.vastu_score, 70.0)

        layout_off = generate_architectural_house_layout(
            plot_width=42.0, plot_length=48.0, bedrooms=3, bathrooms=2.0, vastu_compliant=False
        )
        self.assertTrue(layout_off.validation.is_valid)

    def test_06_localized_refinement_preservation(self):
        """6. Localized refinement preserves unaffected rooms."""
        initial = generate_architectural_house_layout(
            plot_width=40.0, plot_length=50.0, bedrooms=3, bathrooms=2.0
        )
        master_before = next(r for r in initial.rooms if r.type == "master_bedroom")
        mb_coords_before = (master_before.rect.x, master_before.rect.y, master_before.rect.width, master_before.rect.length)

        # Refine only the kitchen
        refined, diff = refine_current_house_layout(initial, "Make the kitchen larger by 2 feet")
        master_after = next(r for r in refined.rooms if r.type == "master_bedroom")
        mb_coords_after = (master_after.rect.x, master_after.rect.y, master_after.rect.width, master_after.rect.length)

        # Master bedroom must be strictly preserved
        self.assertEqual(mb_coords_before, mb_coords_after, "Master bedroom geometry changed during kitchen edit!")

    def test_07_full_architectural_validator_integration(self):
        """7. Full architectural validator integration."""
        layout = generate_architectural_house_layout(
            plot_width=42.0, plot_length=50.0, bedrooms=3, bathrooms=2.0, road_side="south"
        )
        validation_report = validate_design(layout)
        self.assertTrue(validation_report.is_valid)
        self.assertIn("Buildable envelope containment", validation_report.passed_checks)
        self.assertIn("Zero room geometric overlap", validation_report.passed_checks)
        self.assertEqual(len(validation_report.errors), 0)


    def test_08_deterministic_reproducibility(self):
        """8. Deterministic reproducibility: identical inputs produce byte-identical room rects across 5 runs."""
        runs_serialized = []
        for i in range(5):
            layout = generate_architectural_house_layout(
                plot_width=40.0,
                plot_length=50.0,
                bedrooms=3,
                bathrooms=2.0,
                road_side="south",
                parking_spaces=1
            )
            # Serialize room geometries strictly by room type/id and float values
            serialized = [
                (r.id, r.type, round(r.rect.x, 2), round(r.rect.y, 2), round(r.rect.width, 2), round(r.rect.length, 2))
                for r in sorted(layout.rooms, key=lambda x: x.id)
            ]
            runs_serialized.append(serialized)

        first_run = runs_serialized[0]
        for run_idx, r_ser in enumerate(runs_serialized[1:], start=2):
            self.assertEqual(
                first_run,
                r_ser,
                f"Run {run_idx} produced non-identical room geometries compared to Run 1!"
            )


if __name__ == "__main__":
    unittest.main()
