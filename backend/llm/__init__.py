"""
LLM Module Initialization
Exposes the LLMClient interface, GroqClient, factory accessor, and core types.
"""

from .base import LLMClient, LLMResult, TaskType, SourceType
from .groq_client import GroqClient
from .gemini_client import GeminiClient
from .provider import AIProvider
from .factory import (
    get_llm_client,
    get_groq_client,
    get_gemini_client,
    get_ai_provider,
    reset_llm_client
)

__all__ = [
    "LLMClient",
    "LLMResult",
    "TaskType",
    "SourceType",
    "GroqClient",
    "GeminiClient",
    "AIProvider",
    "get_llm_client",
    "get_groq_client",
    "get_gemini_client",
    "get_ai_provider",
    "reset_llm_client",
]
