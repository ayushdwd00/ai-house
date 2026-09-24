"""
Unit and Integration Tests for Phase 0: Groq LLM Layer
Verifies:
1. LLMClient interface and singleton factory
2. Dynamic startup model verification from Groq endpoint
3. Automatic task failover to verified-only models (no hardcoded models)
4. Schema validation with single-feedback retry
5. Caching by (task, prompt_hash)
6. Source reporting ('llm', 'retry', 'deterministic_fallback')
7. 100% offline capability (system produces valid layout when Groq is unavailable)
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import unittest
from unittest.mock import MagicMock, patch
from pydantic import BaseModel, Field

from llm.base import LLMClient, LLMResult
from llm.groq_client import GroqClient
from llm.factory import get_llm_client, reset_llm_client
from models import ArchitecturalRequirements
from ai.groq_service import (
    interpret_requirements_with_groq,
    generate_architectural_concepts_with_groq,
    critique_architectural_candidates_with_groq,
    interpret_modification_with_groq,
    analyze_floorplan_image,
    generate_construction_advice_with_groq
)


class DummySchema(BaseModel):
    title: str = Field(...)
    count: int = Field(...)


class TestLLMLayer(unittest.TestCase):

    def setUp(self):
        reset_llm_client()

    def tearDown(self):
        reset_llm_client()

    def test_01_client_singleton_and_interface(self):
        client1 = get_llm_client()
        client2 = get_llm_client()
        self.assertIs(client1, client2)
        self.assertIsInstance(client1, LLMClient)

    def test_02_deterministic_fallback_when_offline(self):
        """Verifies zero crashes when client has no API key."""
        offline_client = GroqClient(api_key="")
        self.assertFalse(offline_client.is_available())

        fallback_called = False
        def fallback():
            nonlocal fallback_called
            fallback_called = True
            return {"fallback": True}

        res: LLMResult = offline_client.chat_json(
            task="requirements",
            system="System prompt",
            user="User prompt",
            fallback_fn=fallback
        )
        self.assertTrue(res.success)
        self.assertEqual(res.source, "deterministic_fallback")
        self.assertEqual(res.data, {"fallback": True})
        self.assertTrue(fallback_called)

    def test_03_model_startup_verification_and_failover(self):
        """Verifies configured models not in endpoint failover to verified candidates."""
        mock_raw = MagicMock()
        mock_raw.models.list.return_value = MagicMock(data=[
            MagicMock(id="verified-text-model-1"),
            MagicMock(id="verified-text-model-2"),
        ])

        with patch("groq.Groq", return_value=mock_raw):
            client = GroqClient(api_key="gsk_fake_key")
            report = client.verify_models_startup()
            self.assertEqual(report["status"], "online")
            self.assertIn("verified-text-model-1", report["available_models"])

            # Verify that task model is bound to an available model
            model_for_req = client._get_verified_model_for_task("requirements")
            self.assertIn(model_for_req, ["verified-text-model-1", "verified-text-model-2"])

    def test_04_schema_validation_feedback_retry(self):
        """Tests that a Pydantic validation failure triggers a feedback retry to the LLM."""
        mock_raw = MagicMock()
        mock_raw.models.list.return_value = MagicMock(data=[
            MagicMock(id="verified-model")
        ])

        # First call returns invalid schema (missing 'count')
        # Second call returns valid schema
        bad_response = MagicMock(choices=[MagicMock(message=MagicMock(content='{"title": "Test Title"}'))])
        good_response = MagicMock(choices=[MagicMock(message=MagicMock(content='{"title": "Test Title", "count": 5}'))])
        mock_raw.chat.completions.create.side_effect = [bad_response, good_response]

        with patch("groq.Groq", return_value=mock_raw):
            client = GroqClient(api_key="gsk_fake_key")
            res: LLMResult = client.chat_json(
                task="requirements",
                system="You are an architect.",
                user="Give me a test.",
                schema=DummySchema
            )

            self.assertTrue(res.success)
            self.assertEqual(res.source, "retry")
            self.assertIsInstance(res.data, DummySchema)
            self.assertEqual(res.data.count, 5)

            # Assert that second call sent the feedback error message
            self.assertEqual(mock_raw.chat.completions.create.call_count, 2)
            retry_call_args = mock_raw.chat.completions.create.call_args_list[1][1]
            last_message = retry_call_args["messages"][-1]["content"]
            self.assertIn("failed Pydantic validation", last_message)

    def test_05_caching_by_task_and_prompt(self):
        """Verifies duplicate prompt calls are cached in-memory."""
        mock_raw = MagicMock()
        mock_raw.models.list.return_value = MagicMock(data=[MagicMock(id="verified-model")])
        mock_raw.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content='{"result": "cached"}'))]
        )

        with patch("groq.Groq", return_value=mock_raw):
            client = GroqClient(api_key="gsk_fake_key")
            res1 = client.chat_json(task="critique", system="sys", user="user1")
            res2 = client.chat_json(task="critique", system="sys", user="user1")

            self.assertEqual(res1.data, res2.data)
            # chat.completions.create should only be called once
            self.assertEqual(mock_raw.chat.completions.create.call_count, 1)

    def test_06_groq_service_functions_route_through_llm_client(self):
        """Verifies all architectural reasoning functions execute cleanly and report source."""
        # 1. Requirements
        req = interpret_requirements_with_groq("3 bedroom 2 bath 40x50 south facing with pooja")
        self.assertIsInstance(req, ArchitecturalRequirements)
        self.assertIn(req.metadata.get("_llm_source"), ["llm", "retry", "deterministic_fallback"])

        # 2. Concepts
        concepts = generate_architectural_concepts_with_groq(req)
        self.assertGreaterEqual(len(concepts.concepts), 2)
        self.assertIn(concepts.llm_source, ["llm", "retry", "deterministic_fallback"])

        # 3. Critique
        critique = critique_architectural_candidates_with_groq(
            [{"scheme_id": "s1", "name": "Scheme 1", "overall_score": 85.0}],
            user_prompt="3 bedroom modern home"
        )
        self.assertIsNotNone(critique.selected_candidate)
        self.assertIn(critique.llm_source, ["llm", "retry", "deterministic_fallback"])

        # 4. Modification
        cmd = interpret_modification_with_groq("Make master bedroom 2 feet bigger", {"rooms": ["master_bedroom"]})
        self.assertEqual(cmd.target_room_type, "master_bedroom")
        self.assertIn(cmd.llm_source, ["llm", "retry", "deterministic_fallback"])

        # 5. Vision
        vision_res = analyze_floorplan_image("fake_base64_data")
        self.assertIn("detected_rooms", vision_res)
        self.assertIn(vision_res["llm_source"], ["llm", "retry", "deterministic_fallback"])

        # 6. Advisor
        advice = generate_construction_advice_with_groq(
            layout=None,
            quantities=MagicMock(built_up_area_sqft=1600.0, structural_columns_count=14),
            cost_estimate=MagicMock(total_expected=3800000.0)
        )
        self.assertIn("recommendations", advice)
        self.assertIn(advice["llm_source"], ["llm", "retry", "deterministic_fallback"])


if __name__ == "__main__":
    unittest.main()
