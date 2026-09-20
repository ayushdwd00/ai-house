"""
Test LLM Architectural Reasoning Layer Pipeline
Verifies:
1. Structured requirement interpretation (Pydantic ArchitecturalRequirements)
2. Architectural concept generation (2-3 strategies with zoning, circulation, and adjacencies)
3. OR-Tools + Shapely solving the generated architectural concept schemes
4. Design critique after layout generation (Pydantic ArchitecturalCritique)
5. Natural-language modification commands (Pydantic NaturalLanguageModificationCommand)
"""

import sys
import unittest
from groq_service import (
    interpret_requirements_with_groq,
    generate_architectural_concepts_with_groq,
    critique_architectural_candidates_with_groq,
    interpret_modification_with_groq,
    ArchitecturalRequirements,
    ArchitecturalConceptsResult,
    ArchitecturalConceptStrategy,
    ArchitecturalCritique,
    NaturalLanguageModificationCommand
)
from architectural_engine import generate_architectural_house_layout
from refinement_engine import refine_current_house_layout
from models import HouseLayout

class TestLLMArchitecturalPipeline(unittest.TestCase):

    def test_full_llm_pipeline(self):
        print("=================================================================")
        print("STEP 1: Testing Structured Requirement Interpretation with Pydantic")
        print("=================================================================")
        user_prompt = "Design a 3 bedroom 2 bath Modern Scandinavian home on a 40x50 plot facing south with a home office and vastu alignment"
        req = interpret_requirements_with_groq(user_prompt)
        self.assertIsInstance(req, ArchitecturalRequirements)
        self.assertEqual(req.bedrooms, 3)
        self.assertEqual(req.bathrooms, 2.0)
        self.assertEqual(req.road_side, "south")
        self.assertTrue(req.vastu_compliant)
        self.assertIn("Home Office", req.special_rooms)
        print(f"[OK] Structured Requirements: {req.model_dump_json(indent=2)}\n")

        print("=================================================================")
        print("STEP 2: Testing Architectural Concept Generation (2-3 Strategies)")
        print("=================================================================")
        concepts_res = generate_architectural_concepts_with_groq(req)
        self.assertIsInstance(concepts_res, ArchitecturalConceptsResult)
        self.assertGreaterEqual(len(concepts_res.concepts), 2)
        for idx, c in enumerate(concepts_res.concepts):
            self.assertIsInstance(c, ArchitecturalConceptStrategy)
            print(f"  Strategy {idx+1}: '{c.name}' ({c.strategy_id})")
            print(f"    - Thesis: {c.architectural_thesis}")
            print(f"    - Circulation: {c.circulation_type} ({c.circulation_philosophy})")
            print(f"    - Priority adjacencies: {c.priority_adjacencies}")
            print(f"    - Priority separations: {c.priority_separations}")
        print("[OK] Architectural Concepts generated successfully.\n")

        print("=================================================================")
        print("STEP 3: Testing Generation Flow (Concepts -> CP-SAT + Shapely -> Critique)")
        print("=================================================================")
        layout = generate_architectural_house_layout(
            plot_width=req.plot_width,
            plot_length=req.plot_length,
            num_floors=req.num_floors,
            bedrooms=req.bedrooms,
            bathrooms=req.bathrooms,
            road_side=req.road_side,
            parking_spaces=req.parking_spaces,
            style=req.style,
            special_rooms=req.special_rooms,
            open_concept=req.open_concept,
            vastu_compliant=req.vastu_compliant,
            user_prompt=user_prompt
        )
        self.assertIsInstance(layout, HouseLayout)
        self.assertTrue(layout.validation.is_valid, f"Validation failed: {layout.validation.errors}")
        self.assertGreaterEqual(len(layout.rooms), 8)
        self.assertIsNotNone(layout.scores)
        self.assertIn("groq_critique", layout.metadata)
        critique_meta = layout.metadata["groq_critique"]
        print(f"[OK] Valid 2D Layout generated with {len(layout.rooms)} rooms. Overall Score: {layout.scores.overall_score}%")
        print(f"  Champion Scheme Selected by Critic: {critique_meta.get('selected_candidate')}")
        print(f"  Architectural Reasoning: {critique_meta.get('reasoning')}\n")

        print("=================================================================")
        print("STEP 4: Testing Natural Language Modification Commands")
        print("=================================================================")
        edit_instructions = [
            "Make the master bedroom bigger by 3 feet",
            "Move the kitchen closer to the dining room",
            "Add an attached bathroom to bedroom 2"
        ]
        for edit_prompt in edit_instructions:
            cmd = interpret_modification_with_groq(
                edit_prompt,
                {"rooms": [r.type for r in layout.rooms]}
            )
            self.assertIsInstance(cmd, NaturalLanguageModificationCommand)
            print(f"  Prompt: '{edit_prompt}'")
            print(f"    -> Parsed Target: {cmd.target_room_type}")
            print(f"    -> Operation: {cmd.operation}")

            # Execute localized cluster re-optimization
            refined_layout, diff = refine_current_house_layout(layout, edit_prompt)
            self.assertIsInstance(refined_layout, HouseLayout)
            self.assertTrue(refined_layout.validation.is_valid)
            print(f"    [Re-optimization Diff] {diff.get('modified_room')}: {diff.get('previous_dimensions')} -> {diff.get('new_dimensions')}")
            print(f"    Unaffected rooms preserved: {diff.get('unaffected_rooms_count')}\n")

        print("=================================================================")
        print("ALL LLM ARCHITECTURAL REASONING TESTS PASSED SUCCESSFULLY!")
        print("=================================================================")

if __name__ == "__main__":
    unittest.main()
