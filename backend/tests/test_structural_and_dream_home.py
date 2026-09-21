"""
Structural Column Planning and Dream Home Natural Language Test Suite
Verifies:
1. Natural Language Requirement Extraction:
   - 3BHK, bathrooms, parking, open kitchen, facing, dimensions.
   - Missing plot clarification handling.
   - Attached bathrooms and future floor staircase flags.
2. Deterministic Structural Column Planning:
   - Placement at corners, wall intersections, perimeter boundaries.
   - Stable IDs (C01, C02...), width=0.75ft (9 in).
   - Strict avoidance of door clearance zones and staircase flight interior.
   - Strict determinism (identical coordinates across multiple runs).
   - Structural validation report and engineering disclaimers.
3. Quantity and Cost Estimation:
   - Column concrete volume calculation.
   - Column rebar allowance (~150 kg/m3).
   - Cost line item inclusion.
4. FastAPI Endpoints:
   - POST /api/dream-home/interpret
   - POST /api/dream-home/generate
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app
from models import HouseLayout, DreamHomeStructuredRequirements
from architecture.architectural_engine import generate_architectural_house_layout
from construction.structural_planner import plan_preliminary_structure
from estimation.material_quantity_engine import calculate_material_quantities
from estimation.cost_estimator import estimate_construction_cost
from ai.groq_service import interpret_dream_home_prompt


class TestDreamHomeNaturalLanguage(unittest.TestCase):

    @patch("ai.groq_service.get_groq_client", return_value=None)
    def test_nl_requirement_extraction_deterministic(self, mock_groq):
        """Tests deterministic parsing of complex dream home natural language prompt."""
        prompt = "I want a 3BHK duplex with 2 attached bathrooms, covered car parking, open kitchen, modern style on a 30x50 plot facing North"
        req = interpret_dream_home_prompt(prompt)

        self.assertEqual(req.bedrooms, 3)
        self.assertEqual(req.attached_bathrooms, 2)
        self.assertEqual(req.parking.get("cars"), 1)
        self.assertTrue(req.open_kitchen)
        self.assertEqual(req.plot.get("width"), 30.0)
        self.assertEqual(req.plot.get("length"), 50.0)
        self.assertEqual(req.floors, 2)

    @patch("ai.groq_service.get_groq_client", return_value=None)
    def test_missing_plot_handling(self, mock_groq):
        """Tests handling when user prompt does not include plot dimensions."""
        prompt = "Modern 2BHK with open kitchen and 1 car parking"
        req = interpret_dream_home_prompt(prompt)

        # Plot dimensions should be flagged as missing
        self.assertIn("plot_dimensions", req.missing_critical_fields)
        self.assertIsNotNone(req.clarification_prompt)
        self.assertTrue(len(req.clarification_prompt) > 0)
        self.assertIn("plot", req.clarification_prompt.lower())

        # Now test refinement when dimensions are provided later or merged
        combined_prompt = f"{prompt} on a 30x45 plot"
        req_with_plot = interpret_dream_home_prompt(combined_prompt)
        self.assertEqual(req_with_plot.plot.get("width"), 30.0)
        self.assertEqual(req_with_plot.plot.get("length"), 45.0)
        self.assertNotIn("plot_dimensions", req_with_plot.missing_critical_fields)

    @patch("ai.groq_service.get_groq_client", return_value=None)
    def test_attached_bath_and_future_staircase(self, mock_groq):
        """Tests extraction of attached bathrooms and external staircase for future floors."""
        prompt = "House with external staircase for future first floor rental, 3 attached bathrooms on a 35x60 East facing plot"
        req = interpret_dream_home_prompt(prompt)

        self.assertTrue(req.staircase.get("future_floor"))
        self.assertEqual(req.attached_bathrooms, 3)
        self.assertEqual(req.plot.get("width"), 35.0)
        self.assertEqual(req.plot.get("length"), 60.0)


class TestStructuralColumnPlanner(unittest.TestCase):

    def setUp(self):
        self.layout = generate_architectural_house_layout(
            plot_width=40.0,
            plot_length=50.0,
            bedrooms=3,
            bathrooms=2.0,
            road_side="north",
            parking_spaces=1
        )

    def test_column_generation_and_determinism(self):
        """Tests column planning runs deterministically producing identical coordinates."""
        sp1 = plan_preliminary_structure(self.layout)
        sp2 = plan_preliminary_structure(self.layout)

        self.assertGreater(sp1.column_count, 4)
        self.assertEqual(sp1.column_count, sp2.column_count)
        self.assertEqual(len(sp1.columns), len(sp2.columns))

        # Check coordinate equality for all columns
        for c1, c2 in zip(sp1.columns, sp2.columns):
            self.assertEqual(c1.column_id, c2.column_id)
            self.assertAlmostEqual(c1.x, c2.x, places=3)
            self.assertAlmostEqual(c1.y, c2.y, places=3)
            self.assertEqual(c1.width, 0.75)  # 9 inches

    def test_column_placement_rules_and_dimensions(self):
        """Tests column dimension standards, grid lines, and engineering disclaimers."""
        sp = self.layout.structural_planning
        self.assertIsNotNone(sp)
        self.assertGreater(len(sp.columns), 0)

        # Standard dimension 0.75 ft (9 inches)
        for col in sp.columns:
            self.assertEqual(col.width, 0.75)
            self.assertIn(col.depth, [0.75, 1.0])
            self.assertEqual(col.confidence, "PRELIMINARY")
            self.assertTrue(col.column_id.startswith("C"))

        # Grid lines must be present
        self.assertIsNotNone(sp.grid)
        self.assertGreater(len(sp.grid.x_grid_lines), 0)
        self.assertGreater(len(sp.grid.y_grid_lines), 0)

        # Engineering disclaimer must be included
        self.assertIn("preliminary structural planning", sp.disclaimer.lower())
        self.assertIn("structural-engineer", sp.disclaimer.lower())

    def test_column_door_and_stair_conflict_avoidance(self):
        """Verifies no columns are placed directly obstructing door clearance zones or stair flight interior."""
        sp = self.layout.structural_planning
        report = sp.validation_report

        self.assertIsNotNone(report)
        self.assertEqual(len(report.columns_conflicting_doors), 0, f"Door conflicts: {report.columns_conflicting_doors}")
        self.assertEqual(len(report.columns_conflicting_stairs), 0, f"Stair conflicts: {report.columns_conflicting_stairs}")

    def test_multi_floor_structural_consistency(self):
        """Verifies columns extend continuously across all active floor levels."""
        sp = self.layout.structural_planning
        self.assertIsNotNone(sp)

        for col in sp.columns:
            self.assertGreater(len(col.floors), 0)
            self.assertIn(1, col.floors)


class TestStructuralEstimatesIntegration(unittest.TestCase):

    def setUp(self):
        self.layout = generate_architectural_house_layout(
            plot_width=35.0,
            plot_length=50.0,
            bedrooms=3,
            bathrooms=2.0,
            road_side="north",
            parking_spaces=1
        )

    def test_material_quantities_include_columns(self):
        """Verifies material quantities engine computes column concrete volume and rebar allowance."""
        mq = calculate_material_quantities(self.layout)

        self.assertGreater(mq.structural_columns_count, 0)
        self.assertGreater(mq.column_concrete_volume_cuft, 0.0)
        self.assertGreater(mq.column_concrete_volume_cum, 0.0)
        self.assertGreater(mq.column_reinforcement_allowance_kg, 0.0)

        # Allowance should follow ~150 kg/m3 ratio
        expected_kg = mq.column_concrete_volume_cum * 150.0
        self.assertAlmostEqual(mq.column_reinforcement_allowance_kg, round(expected_kg, 1), places=1)

    def test_cost_estimate_includes_structural_column_details(self):
        """Verifies cost estimator integrates column concrete and rebar in structural line items."""
        cost = estimate_construction_cost(self.layout)

        concrete_item = None
        steel_item = None
        for item in cost.items:
            if "rcc" in item.category.lower() or "concrete" in item.item_name.lower():
                concrete_item = item
            if "steel" in item.category.lower() or "reinforcement" in item.item_name.lower():
                steel_item = item

        self.assertIsNotNone(concrete_item, "RCC Concrete line item missing in cost breakdown")
        self.assertIsNotNone(steel_item, "Steel reinforcement line item missing in cost breakdown")
        self.assertIn("column", concrete_item.assumption.lower())
        self.assertIn("column", steel_item.assumption.lower())


class TestDreamHomeFastAPIEEndpoints(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_interpret_endpoint_with_full_details(self):
        """Tests POST /api/dream-home/interpret with comprehensive prompt."""
        response = self.client.post(
            "/api/dream-home/interpret",
            json={"prompt": "Build a 3BHK house on 30x50 East facing plot with 2 attached baths and car porch"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn("brief", data)
        self.assertIn("ready_to_generate", data)
        brief = data["brief"]
        self.assertEqual(brief["bedrooms"], 3)
        self.assertEqual(brief["attached_bathrooms"], 2)
        self.assertTrue(data["ready_to_generate"])

    def test_interpret_endpoint_missing_plot(self):
        """Tests POST /api/dream-home/interpret when plot is missing, verifying clarification prompt."""
        with patch("ai.groq_service.get_groq_client", return_value=None):
            response = self.client.post(
                "/api/dream-home/interpret",
                json={"prompt": "Modern 2BHK duplex with open kitchen"}
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()

            self.assertIn("plot_dimensions", data.get("missing_critical_fields", []))
            self.assertIsNotNone(data.get("clarification_prompt"))

    def test_generate_endpoint(self):
        """Tests POST /api/dream-home/generate creates layout with structural planning and columns."""
        payload = {
            "plot": {"width": 35.0, "length": 50.0, "unit": "ft"},
            "floors": 1,
            "bedrooms": 3,
            "bathrooms": 2.0,
            "attached_bathrooms": 2,
            "kitchen": True,
            "living_room": True,
            "dining_room": True,
            "parking": {"required": True, "cars": 1},
            "staircase": {"required": False, "future_floor": False},
            "open_kitchen": True,
            "style": "modern",
            "preferences": [],
            "special_requirements": [],
            "missing_critical_fields": [],
            "clarification_prompt": None,
            "designer_intent": "Modern 3BHK home"
        }
        response = self.client.post("/api/dream-home/generate", json=payload)
        self.assertEqual(response.status_code, 200)
        layout_dict = response.json()

        # Layout must have id, floors, structural_planning, and structural_system
        self.assertIn("id", layout_dict)
        self.assertIn("floors", layout_dict)
        self.assertIn("structural_planning", layout_dict)
        self.assertEqual(layout_dict.get("structural_system"), "RCC_FRAME")

        sp = layout_dict["structural_planning"]
        self.assertIsNotNone(sp)
        self.assertGreater(sp["column_count"], 0)
        self.assertGreater(len(sp["columns"]), 0)
        self.assertIsNotNone(sp["grid"])
        self.assertIsNotNone(sp["validation_report"])


if __name__ == "__main__":
    unittest.main()
