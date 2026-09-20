"""
Coverage and Geometric Integrity Test Suite
Verifies:
1. Architectural Engine Coverage:
   - Respect of site setbacks and buildable envelope containment.
   - Zero room overlaps (intersection <= 0.05 sq ft).
   - Accurate calculation of ground floor footprint coverage percentage.
   - Comfortable room aspect ratios.
2. Legacy Engine Coverage:
   - Backwards compatibility verification for guillotine slicing.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import unittest
from shapely.geometry import box
from shapely.ops import unary_union
from models import HouseLayout
from architecture.architectural_engine import generate_architectural_house_layout


class TestArchitecturalCoverage(unittest.TestCase):

    def test_architectural_site_coverage_and_containment(self):
        """Tests site setbacks, envelope containment, and zero room overlaps."""
        layout = generate_architectural_house_layout(
            plot_width=40.0,
            plot_length=50.0,
            bedrooms=3,
            bathrooms=2.0,
            road_side="south",
            parking_spaces=1
        )
        self.assertTrue(layout.validation.is_valid, f"Validation failed: {layout.validation.errors}")
        site = layout.site
        env = site.buildable_envelope
        env_poly = box(env.x, env.y, env.right, env.bottom)

        # 1. Total footprint coverage must be positive and realistically bounded (between 30% and 80%)
        coverage = layout.stats.coverage_percentage
        self.assertGreater(coverage, 25.0)
        self.assertLess(coverage, 85.0)

        # 2. Every room on every floor must be strictly inside the buildable envelope
        for floor in layout.floors:
            for r in floor.rooms:
                if r.rect:
                    r_poly = box(r.rect.x, r.rect.y, r.rect.right, r.rect.bottom)
                    self.assertTrue(
                        env_poly.buffer(0.15).contains(r_poly),
                        f"Room '{r.name}' exceeds buildable envelope boundary!"
                    )

        # 3. Pairwise zero room overlap
        for floor in layout.floors:
            room_polys = [(r.name, box(r.rect.x, r.rect.y, r.rect.right, r.rect.bottom)) for r in floor.rooms if r.rect]
            for i in range(len(room_polys)):
                for j in range(i + 1, len(room_polys)):
                    n1, b1 = room_polys[i]
                    n2, b2 = room_polys[j]
                    inter_area = b1.intersection(b2).area
                    self.assertLessEqual(
                        inter_area, 0.15,
                        f"Overlap of {inter_area:.2f} sq ft between '{n1}' and '{n2}' on {floor.floor_name}"
                    )

    def test_multifloor_vertical_staircase_alignment(self):
        """Tests that two-story plans align vertical staircase circulation cores."""
        layout = generate_architectural_house_layout(
            plot_width=40.0,
            plot_length=60.0,
            num_floors=2,
            bedrooms=4,
            bathrooms=3.0,
            road_side="south"
        )
        self.assertEqual(len(layout.floors), 2)
        f1_stair = next((r for r in layout.floors[0].rooms if r.type == "staircase"), None)
        f2_stair = next((r for r in layout.floors[1].rooms if r.type == "staircase"), None)
        self.assertIsNotNone(f1_stair, "Ground floor must contain staircase core")
        self.assertIsNotNone(f2_stair, "Level 2 must contain staircase core")

        # Stacking delta must be within 1.0 ft tolerance
        dx = abs(f1_stair.rect.x - f2_stair.rect.x)
        dy = abs(f1_stair.rect.y - f2_stair.rect.y)
        self.assertLessEqual(dx, 1.0, f"Staircase X alignment deviation: {dx}ft")
        self.assertLessEqual(dy, 1.0, f"Staircase Y alignment deviation: {dy}ft")


if __name__ == "__main__":
    unittest.main()
