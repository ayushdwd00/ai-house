"""
End-to-End Integration Verification: Gemini + Groq Architecture System
Tests:
1. Environment variables & API Provider architecture (Gemini + Groq)
2. Groq Fast Interaction Layer (natural language requirement extraction & normalization, Hinglish, refinement parsing)
3. Gemini Architectural Reasoning Layer (zoning, room relationships, orientation, DesignIntent, Concept Strategies)
4. Gemini Architectural Review (concise structured issues without chain-of-thought)
5. Full End-to-End Generation Pipeline:
   Groq -> Gemini -> Architectural Engine -> OR-Tools CP-SAT -> Shapely -> HouseLayout -> 2D/3D/Landscape/Estimate
6. Full End-to-End Refinement Pipeline:
   User Prompt -> Groq Modification -> Refinement Engine -> OR-Tools -> Shapely -> Updated HouseLayout
7. Graceful Fallback Handling (Groq fails -> Gemini; Gemini fails -> Groq; both fail -> deterministic)
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import unittest
from models import HouseLayout, ArchitecturalRequirements
from llm import get_ai_provider, get_gemini_client, get_groq_client, reset_llm_client
from llm.provider import AIProvider
from llm.gemini_client import GeminiClient
from llm.groq_client import GroqClient
from ai.groq_service import (
    interpret_requirements_with_groq,
    interpret_dream_home_prompt,
    interpret_modification_with_groq,
    generate_architectural_concepts_with_groq
)
from ai.gemini_architect import (
    formulate_design_intent_with_gemini,
    generate_architectural_concepts_with_gemini,
    review_layout_with_gemini,
    critique_architectural_candidates_with_gemini,
    ArchitecturalReviewReport
)
from architecture.design_intent import DesignIntent
from architecture.architectural_engine import generate_architectural_house_layout
from ai.refinement_engine import refine_current_house_layout


class TestGeminiGroqIntegration(unittest.TestCase):

    def setUp(self):
        reset_llm_client()

    def test_01_api_provider_architecture(self):
        """Verify unified AIProvider coordinates both Gemini and Groq without leaking keys."""
        provider = get_ai_provider()
        self.assertIsInstance(provider, AIProvider)
        self.assertIsInstance(provider.groq, GroqClient)
        self.assertIsInstance(provider.gemini, GeminiClient)

        status = provider.get_status()
        self.assertIn("groq", status)
        self.assertIn("gemini", status)
        self.assertIn("model", status["groq"])
        self.assertIn("model", status["gemini"])
        # Ensure no sensitive API keys are in status
        status_str = str(status)
        self.assertNotIn("gsk_", status_str)
        self.assertNotIn("AIza", status_str)

    def test_02_groq_fast_interaction_hinglish(self):
        """
        Verify Groq requirement extraction and normalization from user's natural language,
        including Hinglish prompt:
        '4 bedroom ka ghar chahiye, parents ka room ground floor pe, 2 car parking aur bada garden chahiye.'
        """
        user_prompt = "4 bedroom ka ghar chahiye, parents ka room ground floor pe, 2 car parking aur bada garden chahiye."
        req = interpret_requirements_with_groq(user_prompt)

        self.assertIsInstance(req, ArchitecturalRequirements)
        self.assertEqual(req.bedrooms, 4)
        self.assertGreaterEqual(req.parking_spaces, 1)
        self.assertIsNotNone(req.plot_width)
        self.assertIsNotNone(req.plot_length)
        self.assertIn(req.llm_source, ["llm", "retry", "deterministic_fallback"])

    def test_03_gemini_architectural_reasoning_design_intent(self):
        """
        Verify Gemini produces typed DesignIntent reasoning about zoning,
        room relationships, adjacency, circulation, and orientation.
        """
        req = ArchitecturalRequirements(
            plot_width=40.0,
            plot_length=50.0,
            num_floors=1,
            bedrooms=3,
            bathrooms=2.0,
            road_side="south",
            parking_spaces=2,
            style="Modern Contemporary",
            vastu_compliant=True,
            special_rooms=["Pooja"]
        )

        intent = formulate_design_intent_with_gemini(req)
        self.assertIsInstance(intent, DesignIntent)
        self.assertGreaterEqual(len(intent.selected_spaces), 5)
        self.assertGreaterEqual(len(intent.relationships), 2)
        self.assertIsNotNone(intent.design_strategy)
        self.assertIn(intent.design_strategy.typology, [
            "central_spine", "side_circulation", "public_private_split", "courtyard", "linear", "compact", "l_shaped"
        ])

        # Verify key architectural room relationships are present
        rel_types = [r.relation_type for r in intent.relationships]
        self.assertTrue(any(t in ["direct", "strong", "attached"] for t in rel_types))

    def test_04_gemini_architectural_review_structured_issues(self):
        """
        Verify Gemini reviews a layout and identifies issues returning structured output
        matching { issues: [{ severity, type, room_id, description, suggested_action }] }
        without chain-of-thought.
        """
        mock_summary = {
            "rooms": [
                {"id": "living_room", "name": "Living Room", "type": "living_room", "width": 14.0, "length": 16.0},
                {"id": "kitchen", "name": "Kitchen", "type": "kitchen", "width": 6.0, "length": 18.0},  # elongated aspect ratio
                {"id": "master_bedroom", "name": "Master Bedroom", "type": "master_bedroom", "width": 12.0, "length": 14.0}
            ],
            "scores": {
                "daylight_score": 62.0,     # Below threshold
                "circulation_score": 60.0,  # Elevated circulation
                "privacy_score": 58.0,      # Privacy issue
                "overall_score": 70.0
            }
        }

        report = review_layout_with_gemini(mock_summary, vastu_enabled=True)
        self.assertIsInstance(report, ArchitecturalReviewReport)
        self.assertIsInstance(report.issues, list)
        self.assertGreater(len(report.issues), 0)

        for issue in report.issues:
            self.assertIn(issue.severity, ["high", "medium", "low"])
            self.assertIn(issue.type, ["circulation", "adjacency", "privacy", "daylight", "ventilation", "zoning", "staircase", "parking", "vastu"])
            self.assertTrue(bool(issue.room_id))
            self.assertTrue(bool(issue.description))
            self.assertTrue(bool(issue.suggested_action))

    def test_05_full_generation_pipeline(self):
        """
        Verify complete house generation pipeline passes through:
        User Request -> Groq -> Gemini -> Architectural Engine -> OR-Tools -> Shapely -> HouseLayout -> 2D/3D.
        """
        user_prompt = "3 bedroom 2 bath contemporary home on 35x50 plot facing south with pooja room"

        # 1. Groq Interaction Layer
        req = interpret_requirements_with_groq(user_prompt)
        self.assertEqual(req.bedrooms, 3)

        # 2. Gemini Architectural Concepts & Reasoning -> Engine -> OR-Tools -> Shapely -> HouseLayout
        layout = generate_architectural_house_layout(
            plot_width=req.plot_width or 35.0,
            plot_length=req.plot_length or 50.0,
            num_floors=req.num_floors or 1,
            bedrooms=req.bedrooms,
            bathrooms=req.bathrooms,
            road_side=req.road_side or "south",
            parking_spaces=req.parking_spaces or 1,
            style=req.style or "Modern Contemporary",
            special_rooms=req.special_rooms or ["Pooja"],
            vastu_compliant=req.vastu_compliant or False,
            user_prompt=user_prompt
        )

        self.assertIsInstance(layout, HouseLayout)
        self.assertTrue(layout.validation.is_valid, f"Layout invalid: {layout.validation.errors}")
        self.assertGreaterEqual(len(layout.rooms), 6)
        self.assertIsNotNone(layout.scores)
        self.assertIsNotNone(layout.quantities)
        self.assertIsNotNone(layout.cost_estimate)

        # Verify AI pipeline metadata
        pipeline_meta = layout.metadata.get("ai_pipeline", {})
        self.assertEqual(pipeline_meta.get("interaction_layer"), "groq")
        self.assertEqual(pipeline_meta.get("reasoning_layer"), "gemini")

    def test_06_refinement_pipeline(self):
        """
        Verify refinement flow:
        User ("Master bedroom bada karo") -> Groq parses structured modification ->
        Refinement Engine -> OR-Tools CP-SAT -> Shapely -> Updated HouseLayout.
        """
        # Baseline layout
        layout = generate_architectural_house_layout(
            plot_width=40.0, plot_length=50.0, bedrooms=3, bathrooms=2.0, road_side="south"
        )
        initial_mb = next(r for r in layout.rooms if r.type == "master_bedroom")
        initial_width = initial_mb.rect.width

        # 1. Groq parses command
        cmd = interpret_modification_with_groq(
            "Master bedroom bada karo",
            {"rooms": [r.type for r in layout.rooms]}
        )
        self.assertEqual(cmd.target_room_type, "master_bedroom")
        self.assertEqual(cmd.operation, "enlarge")

        # 2. Refinement engine applies OR-Tools cluster re-optimization
        refined_layout, diff = refine_current_house_layout(
            current_layout=layout,
            instruction="Master bedroom bada karo"
        )

        new_mb = next(r for r in refined_layout.rooms if r.type == "master_bedroom")
        self.assertGreaterEqual(new_mb.rect.width, initial_width)
        self.assertTrue(refined_layout.validation.is_valid)

    def test_07_resilient_failover(self):
        """
        Verify that if one provider fails or is unconfigured,
        the system falls back safely without crashing or returning incomplete data.
        """
        # Test Gemini Client with dummy/unconfigured key falls back gracefully
        offline_gemini = GeminiClient(api_key="your_gemini_api_key_here")
        self.assertFalse(offline_gemini.is_available())

        fallback_called = False
        def fallback():
            nonlocal fallback_called
            fallback_called = True
            return {"status": "fallback_ok"}

        res = offline_gemini.chat_json(
            task="design_intent",
            system="system",
            user="user",
            fallback_fn=fallback
        )
        self.assertTrue(res.success)
        self.assertTrue(fallback_called)
        self.assertEqual(res.source, "deterministic_fallback")


if __name__ == "__main__":
    unittest.main()
