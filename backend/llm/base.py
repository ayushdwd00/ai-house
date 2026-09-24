"""
Base LLM Client Interface and Result Types
Provides unified interface for Groq structured JSON reasoning.
"""

from typing import Dict, Any, Optional, Union, Literal, Type, Callable
from abc import ABC, abstractmethod
from pydantic import BaseModel, Field

TaskType = Literal[
    "requirements",
    "design_intent",
    "concepts",
    "critique",
    "edit_parsing",
    "vision",
    "advisor"
]

SourceType = Literal["llm", "retry", "deterministic_fallback"]


class LLMResult(BaseModel):
    success: bool
    data: Any
    source: SourceType
    task: str
    model_used: Optional[str] = None
    timing_ms: float = 0.0
    error: Optional[str] = None
    raw_response: Optional[str] = None


class LLMClient(ABC):
    """
    Abstract interface for LLM operations.
    Supports structured JSON chat and vision analysis with automatic
    model verification, exponential backoff, schema validation retry,
    and deterministic fallbacks.
    """

    @abstractmethod
    def chat_json(
        self,
        task: TaskType,
        system: str,
        user: str,
        schema: Optional[Type[BaseModel]] = None,
        fallback_fn: Optional[Callable[[], Any]] = None,
        temperature: float = 0.15,
        max_tokens: int = 1200
    ) -> LLMResult:
        """Executes a structured JSON prompt with validation and fallback."""
        pass

    @abstractmethod
    def vision_json(
        self,
        task: TaskType,
        prompt: str,
        image_bytes_or_base64: Union[bytes, str],
        mime_type: str = "image/jpeg",
        schema: Optional[Type[BaseModel]] = None,
        fallback_fn: Optional[Callable[[], Any]] = None,
        temperature: float = 0.1,
        max_tokens: int = 1200
    ) -> LLMResult:
        """Executes a multimodal vision request with validation and fallback."""
        pass

    @abstractmethod
    def verify_models_startup(self) -> Dict[str, Any]:
        """Queries model endpoint and binds task models to verified IDs."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Returns True if a valid key is configured and client is ready."""
        pass
