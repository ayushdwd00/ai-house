"""
LLM Client Factory
Maintains a singleton GroqClient instance.
"""

from typing import Optional
from .base import LLMClient
from .groq_client import GroqClient

_CLIENT_INSTANCE: Optional[LLMClient] = None


def get_llm_client() -> LLMClient:
    """Returns the singleton LLMClient instance."""
    global _CLIENT_INSTANCE
    if _CLIENT_INSTANCE is None:
        _CLIENT_INSTANCE = GroqClient()
    return _CLIENT_INSTANCE


def reset_llm_client():
    """Resets the singleton client (useful for unit testing)."""
    global _CLIENT_INSTANCE
    _CLIENT_INSTANCE = None
