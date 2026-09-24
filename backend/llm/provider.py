"""
AI Provider Layer
Coordinates Gemini and Groq models with clean separation of responsibilities:
- Groq: Fast interaction layer (requirements extraction, normalization, refinement interpretation, explanations)
- Gemini: Architectural reasoning layer (zoning, room relationships, circulation, orientation, daylight, Vastu, layout review)
- Cross-provider failover:
  - If Groq fails -> Gemini acts as fallback
  - If Gemini fails -> Groq acts as fallback
  - If both fail -> Deterministic architectural fallback
"""

import logging
from typing import Dict, Any, Optional, Type, Callable
from pydantic import BaseModel

from .base import LLMClient, LLMResult, TaskType
from .groq_client import GroqClient
from .gemini_client import GeminiClient

logger = logging.getLogger("AIProvider")


class AIProvider:
    """
    Unified AI Provider orchestrating Groq (Fast Interaction) and Gemini (Architectural Reasoning).
    Protects callers from provider-specific implementation details.
    """

    def __init__(
        self,
        groq_client: Optional[GroqClient] = None,
        gemini_client: Optional[GeminiClient] = None
    ):
        self.groq = groq_client or GroqClient()
        self.gemini = gemini_client or GeminiClient()

    def get_status(self) -> Dict[str, Any]:
        """Returns provider availability and configured models without exposing API keys."""
        return {
            "groq": {
                "available": self.groq.is_available(),
                "model": getattr(self.groq, "_verified_task_models", {}).get("requirements", "openai/gpt-oss-120b"),
            },
            "gemini": {
                "available": self.gemini.is_available(),
                "model": getattr(self.gemini, "_model", "gemini-2.0-flash"),
            }
        }

    def execute_interaction(
        self,
        task: TaskType,
        system: str,
        user: str,
        schema: Optional[Type[BaseModel]] = None,
        deterministic_fallback: Optional[Callable[[], Any]] = None,
        temperature: float = 0.15,
        max_tokens: int = 1200
    ) -> LLMResult:
        """
        Interaction Layer: Groq is primary for speed.
        If Groq is unavailable or errors, falls back to Gemini.
        If both fail, executes deterministic fallback.
        """
        # 1. Try Groq as primary
        if self.groq.is_available():
            try:
                res = self.groq.chat_json(
                    task=task,
                    system=system,
                    user=user,
                    schema=schema,
                    fallback_fn=None,  # Do not invoke deterministic fallback yet
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                if res.success and res.source in ["llm", "retry"] and res.data is not None:
                    return res
                logger.info(f"[AI PROVIDER] Groq did not return valid result ({res.error}); falling back to Gemini...")
            except Exception as e:
                logger.warning(f"[AI PROVIDER] Groq interaction error: {e}; falling back to Gemini...")

        # 2. Try Gemini as secondary
        if self.gemini.is_available():
            try:
                res = self.gemini.chat_json(
                    task=task,
                    system=system,
                    user=user,
                    schema=schema,
                    fallback_fn=None,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                if res.success and res.source in ["llm", "retry"] and res.data is not None:
                    return res
                logger.info(f"[AI PROVIDER] Gemini fallback did not return valid result ({res.error}); invoking deterministic fallback...")
            except Exception as e:
                logger.warning(f"[AI PROVIDER] Gemini interaction fallback error: {e}...")

        # 3. Deterministic architectural fallback
        data = deterministic_fallback() if deterministic_fallback else {}
        return LLMResult(
            success=True,
            data=data,
            source="deterministic_fallback",
            task=task,
            model_used="deterministic",
            timing_ms=0.0
        )

    def execute_reasoning(
        self,
        task: TaskType,
        system: str,
        user: str,
        schema: Optional[Type[BaseModel]] = None,
        deterministic_fallback: Optional[Callable[[], Any]] = None,
        temperature: float = 0.1,
        max_tokens: int = 1500
    ) -> LLMResult:
        """
        Reasoning Layer: Gemini is primary for architectural depth.
        If Gemini is unavailable or errors, falls back to Groq.
        If both fail, executes deterministic fallback.
        """
        # 1. Try Gemini as primary
        if self.gemini.is_available():
            try:
                res = self.gemini.chat_json(
                    task=task,
                    system=system,
                    user=user,
                    schema=schema,
                    fallback_fn=None,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                if res.success and res.source in ["llm", "retry"] and res.data is not None:
                    return res
                logger.info(f"[AI PROVIDER] Gemini reasoning did not return valid result ({res.error}); falling back to Groq...")
            except Exception as e:
                logger.warning(f"[AI PROVIDER] Gemini reasoning error: {e}; falling back to Groq...")

        # 2. Try Groq as secondary
        if self.groq.is_available():
            try:
                res = self.groq.chat_json(
                    task=task,
                    system=system,
                    user=user,
                    schema=schema,
                    fallback_fn=None,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                if res.success and res.source in ["llm", "retry"] and res.data is not None:
                    return res
                logger.info(f"[AI PROVIDER] Groq reasoning fallback did not return valid result ({res.error}); invoking deterministic fallback...")
            except Exception as e:
                logger.warning(f"[AI PROVIDER] Groq reasoning fallback error: {e}...")

        # 3. Deterministic architectural fallback
        data = deterministic_fallback() if deterministic_fallback else {}
        return LLMResult(
            success=True,
            data=data,
            source="deterministic_fallback",
            task=task,
            model_used="deterministic",
            timing_ms=0.0
        )
