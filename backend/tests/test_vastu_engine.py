"""
Unit & Integration Tests for Vastu Shastra Architectural Intelligence Engine
Validates orientation transformations, 9-zone classification, rule evaluations,
and end-to-end integration into the architectural layout pipeline.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import unittest
from vastu.vastu_engine import (
    compute_north_angle,
    get_vastu_zone_for_point,
    evaluate_room_vastu,
    evaluate_vastu_layout,
    get_vastu_topological_scheme_placements,
    VastuResult
)
from models import Room, Rect, Point2D
from architecture.architectural_engine import generate_architectural_house_layout


class TestVastuEngine(unittest.TestCase):

    def test_01_north_angle_computation(self):
        """Validates orientation calculations for all four road sides."""
        self.assertEqual(compute_north_angle("south"), 0.0)    # North is Top
        self.assertEqual(compute_north_angle("north"), 180.0)  # North is Bottom
        self.assertEqual(compute_north_angle("east"), 270.0)   # North is Left
        self.assertEqual(compute_north_angle("west"), 90.0)    # North is Right
        self.assertEqual(compute_north_angle("south", explicit_north_deg=45.0), 45.0)

    def test_02_point_to_zone_mapping_south_facing(self):
        """For south road (North at top): checks corner zones."""
        w, l = 40.0, 50.0
        # Center should be 'center'
        self.assertEqual(get_vastu_zone_for_point(20.0, 25.0, w, l, "south"), "center")

        # Top-Right is North-East (Ishanya)
        self.assertEqual(get_vastu_zone_for_point(35.0, 5.0, w, l, "south"), "northeast")

        # Bottom-Right is South-East (Agneya)
        self.assertEqual(get_vastu_zone_for_point(35.0, 45.0, w, l, "south"), "southeast")

        # Bottom-Left is South-West (Nairrutya)
        self.assertEqual(get_vastu_zone_for_point(5.0, 45.0, w, l, "south"), "southwest")

        # Top-Left is North-West (Vayavya)
        self.assertEqual(get_vastu_zone_for_point(5.0, 5.0, w, l, "south"), "northwest")

    def test_03_point_to_zone_mapping_north_facing(self):
        """For north road (North at bottom, South at top): zones rotate 180 degrees."""
        w, l = 40.0, 50.0
        # Bottom-Left is North-East when facing North road
        self.assertEqual(get_vastu_zone_for_point(5.0, 45.0, w, l, "north"), "northeast")

        # Top-Right is South-West when facing North road
        self.assertEqual(get_vastu_zone_for_point(35.0, 5.0, w, l, "north"), "southwest")

    def test_04_individual_room_rule_evaluations(self):
        """Verifies rule evaluations for key residential rooms."""
        # Master bedroom in southwest -> satisfied
        mb_sw = evaluate_room_vastu("master_bedroom", "Master Suite", "mb_1", "southwest")
        self.assertEqual(mb_sw.status, "satisfied")
        self.assertEqual(mb_sw.score_contribution, 100.0)

        # Master bedroom in northeast -> violated
        mb_ne = evaluate_room_vastu("master_bedroom", "Master Suite", "mb_1", "northeast")
        self.assertEqual(mb_ne.status, "violated")

        # Kitchen in southeast -> satisfied
        k_se = evaluate_room_vastu("kitchen", "Chef Kitchen", "k_1", "southeast")
        self.assertEqual(k_se.status, "satisfied")

        # Kitchen in northwest -> partially satisfied (acceptable alternative)
        k_nw = evaluate_room_vastu("kitchen", "Chef Kitchen", "k_1", "northwest")
        self.assertEqual(k_nw.status, "partially_satisfied")

        # Puja in northeast -> satisfied
        p_ne = evaluate_room_vastu("pooja", "Pooja Sanctum", "p_1", "northeast")
        self.assertEqual(p_ne.status, "satisfied")

    def test_05_full_layout_vastu_audit(self):
        """Evaluates a synthetic layout against full Vastu audit."""
        rooms = [
            Room(id="r1", name="Master Bedroom", type="master_bedroom", zone="private", rect=Rect(x=2, y=35, width=14, length=12)),
            Room(id="r2", name="Kitchen", type="kitchen", zone="service", rect=Rect(x=24, y=35, width=12, length=12)),
            Room(id="r3", name="Pooja Room", type="pooja", zone="special", rect=Rect(x=26, y=4, width=8, length=8)),
            Room(id="r4", name="Living Room", type="living_room", zone="public", rect=Rect(x=10, y=8, width=16, length=14)),
        ]
        result = evaluate_vastu_layout(rooms, 40.0, 50.0, road_side="south")
        self.assertIsInstance(result, VastuResult)
        self.assertGreaterEqual(result.overall_score, 80.0)
        self.assertTrue(any("Master Bedroom" in s for s in result.satisfied_rules))
        self.assertTrue(any("Kitchen" in s for s in result.satisfied_rules))
        self.assertTrue(any("Pooja" in s for s in result.satisfied_rules))

    def test_06_topological_scheme_placements(self):
        """Verifies solver placement hints are generated for Vastu scheme."""
        rooms = [
            Room(id="mb", name="Master Bedroom", type="master_bedroom", zone="private"),
            Room(id="kt", name="Kitchen", type="kitchen", zone="service"),
            Room(id="pj", name="Pooja", type="pooja", zone="special"),
        ]
        placements = get_vastu_topological_scheme_placements("south", rooms, 40.0, 50.0)
        self.assertIn("mb", placements)
        self.assertIn("kt", placements)
        self.assertIn("pj", placements)
        # Master Bed in SW -> front, left for road='south'
        self.assertEqual(placements["mb"]["rel_x"], "left")
        # Kitchen in SE -> front, right for road='south'
        self.assertEqual(placements["kt"]["rel_x"], "right")
        # Pooja in NE -> rear, right for road='south'
        self.assertEqual(placements["pj"]["rel_x"], "right")

    def test_07_end_to_end_pipeline_vastu_enabled(self):
        """Generates a complete house layout with Vastu enabled and checks outputs."""
        layout = generate_architectural_house_layout(
            plot_width=40.0,
            plot_length=50.0,
            num_floors=1,
            bedrooms=3,
            bathrooms=2.0,
            style="Modern Contemporary",
            road_side="south",
            parking_spaces=1,
            special_rooms=["Pooja"],
            vastu_compliant=True
        )

        self.assertTrue(layout.validation.is_valid)
        self.assertIsNotNone(layout.scores.vastu_score)
        self.assertGreaterEqual(layout.scores.vastu_score, 70.0)
        self.assertIsNotNone(layout.vastu_result)
        self.assertIn("overall_score", layout.vastu_result)
        self.assertIn("rule_results", layout.vastu_result)
        self.assertTrue(len(layout.vastu_result["rule_results"]) > 0)


if __name__ == "__main__":
    unittest.main()
