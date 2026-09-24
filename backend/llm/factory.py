"""
LLM Client Factory
Maintains a singleton GroqClient instance.
"""

from typing import Optional
from .base import LLMClient
from .groq_client import GroqClient
from .gemini_client import GeminiClient
from .provider import AIProvider

_GROQ_INSTANCE: Optional[GroqClient] = None
_GEMINI_INSTANCE: Optional[GeminiClient] = None
_PROVIDER_INSTANCE: Optional[AIProvider] = None


def get_groq_client() -> GroqClient:
    """Returns the singleton GroqClient instance."""
    global _GROQ_INSTANCE
    if _GROQ_INSTANCE is None:
        _GROQ_INSTANCE = GroqClient()
    return _GROQ_INSTANCE


def get_gemini_client() -> GeminiClient:
    """Returns the singleton GeminiClient instance."""
    global _GEMINI_INSTANCE
    if _GEMINI_INSTANCE is None:
        _GEMINI_INSTANCE = GeminiClient()
    return _GEMINI_INSTANCE


def get_ai_provider() -> AIProvider:
    """Returns the unified AIProvider managing Gemini and Groq with fallbacks."""
    global _PROVIDER_INSTANCE
    if _PROVIDER_INSTANCE is None:
        _PROVIDER_INSTANCE = AIProvider(
            groq_client=get_groq_client(),
            gemini_client=get_gemini_client()
        )
    return _PROVIDER_INSTANCE


def get_llm_client() -> LLMClient:
    """Backwards-compatible accessor for primary LLMClient (Groq)."""
    return get_groq_client()


def reset_llm_client():
    """Resets the singleton clients (useful for unit testing)."""
    global _GROQ_INSTANCE, _GEMINI_INSTANCE, _PROVIDER_INSTANCE
    _GROQ_INSTANCE = None
    _GEMINI_INSTANCE = None
    _PROVIDER_INSTANCE = None

