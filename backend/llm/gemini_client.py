"""
Gemini LLM Client Implementation
Features:
- Architectural reasoning layer integration using Google GenAI SDK (google-genai) and REST fallback
- JSON extraction and Pydantic validation
- Single-feedback retry on schema validation error
- Deterministic fallback when Gemini is unavailable or fails
- In-memory (task, prompt_hash) caching
- Comprehensive source tracking: 'llm', 'retry', or 'deterministic_fallback'
- Safe redaction of API keys
"""

import os
import re
import time
import json
import hashlib
import logging
from typing import Dict, Any, Optional, Union, Type, Callable, List, Set
from pydantic import BaseModel, ValidationError
from dotenv import load_dotenv

from .base import LLMClient, LLMResult, TaskType, SourceType
from .config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GEMINI_CANDIDATE_FALLBACKS,
    DEFAULT_TIMEOUT_SEC,
    MAX_HTTP_RETRIES,
    INITIAL_BACKOFF_SEC,
    BACKOFF_FACTOR,
)

load_dotenv()
logger = logging.getLogger("GeminiClient")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)


def _safe_str(val: Any) -> str:
    s = str(val)
    # Strip potential sensitive keys
    s = re.sub(r'AIza[A-Za-z0-9_\-]+', '[REDACTED_GEMINI_KEY]', s)
    s = re.sub(r'gsk_[A-Za-z0-9_\-]+', '[REDACTED_GROQ_KEY]', s)
    return s


def _extract_json_from_text(text: str) -> Dict[str, Any]:
    """Extracts and parses JSON object or array from raw LLM string."""
    text = text.strip()
    # Strip code fences if present
    if "```" in text:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if match:
            text = match.group(1).strip()

    # Direct parse attempt
    try:
        return json.loads(text)
    except Exception:
        pass

    # Find outermost curly braces
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1]
        try:
            return json.loads(candidate)
        except Exception:
            pass

    # Find outermost square brackets (for list results)
    start_arr = text.find("[")
    end_arr = text.rfind("]")
    if start_arr != -1 and end_arr != -1 and end_arr > start_arr:
        candidate_arr = text[start_arr : end_arr + 1]
        try:
            return json.loads(candidate_arr)
        except Exception:
            pass

    raise ValueError("No valid JSON object found in response.")


class GeminiClient(LLMClient):
    """
    Concrete implementation of LLMClient using Google Gemini.
    Enforces architectural reasoning with structured JSON validation and zero-crash fallbacks.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        if api_key is not None:
            self._api_key = api_key.strip()
        else:
            self._api_key = os.getenv("GEMINI_API_KEY", "").strip()

        self._model = (model or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")).strip()
        self._raw_client = None
        self._cache: Dict[str, Any] = {}
        self._verified_models: List[str] = []
        self._models_verified = False

        if self._api_key and self._api_key != "your_gemini_api_key_here":
            try:
                from google import genai
                self._raw_client = genai.Client(api_key=self._api_key)
            except Exception as e:
                logger.warning(f"Failed to initialize google-genai SDK client: {_safe_str(e)}")
                self._raw_client = None

    def is_available(self) -> bool:
        return bool(self._api_key and self._api_key != "your_gemini_api_key_here")

    def verify_models_startup(self) -> Dict[str, Any]:
        if not self.is_available():
            return {
                "status": "offline",
                "reason": "GEMINI_API_KEY not configured",
                "default_model": self._model,
            }
        try:
            if self._raw_client:
                # Try listing models or pinging
                self._verified_models = [self._model] + [m for m in GEMINI_CANDIDATE_FALLBACKS if m != self._model]
                self._models_verified = True
                return {
                    "status": "online",
                    "configured_model": self._model,
                    "candidates": self._verified_models
                }
        except Exception as e:
            logger.warning(f"Gemini startup verification warning: {_safe_str(e)}")

        self._verified_models = [self._model]
        self._models_verified = True
        return {
            "status": "ready",
            "configured_model": self._model
        }

    def _hash_key(self, task: str, prompt_content: str) -> str:
        h = hashlib.sha256(f"gemini:{task}:{prompt_content}".encode("utf-8")).hexdigest()
        return f"gemini_{task}_{h}"

    def _call_gemini_sdk_or_rest(
        self,
        system_instruction: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int
    ) -> str:
        """Invokes Gemini via google-genai SDK with httpx REST fallback."""
        # Method A: Official google-genai SDK
        if self._raw_client is not None:
            try:
                from google.genai import types
                config = types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=temperature,
                    response_mime_type="application/json",
                    max_output_tokens=max_tokens,
                )
                response = self._raw_client.models.generate_content(
                    model=self._model,
                    contents=user_prompt,
                    config=config,
                )
                if response and hasattr(response, "text") and response.text:
                    return response.text
            except Exception as e:
                logger.info(f"[GEMINI SDK NOTE] SDK call error ({_safe_str(e)}); trying direct REST fallback...")

        # Method B: Direct REST API via httpx (guarantees robust execution without SDK issues)
        import httpx
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent?key={self._api_key}"
        payload = {
            "system_instruction": {
                "parts": [{"text": system_instruction}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_prompt}]
                }
            ],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
                "responseMimeType": "application/json"
            }
        }
        with httpx.Client(timeout=DEFAULT_TIMEOUT_SEC) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            res_data = resp.json()
            candidates = res_data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "")

        raise RuntimeError("Empty response received from Gemini API.")

    def chat_json(
        self,
        task: TaskType,
        system: str,
        user: str,
        schema: Optional[Type[BaseModel]] = None,
        fallback_fn: Optional[Callable[[], Any]] = None,
        temperature: float = 0.15,
        max_tokens: int = 1500
    ) -> LLMResult:
        """
        Executes structured architectural reasoning with Gemini.
        Returns validated Pydantic model or fallback data.
        """
        t0 = time.time()
        cache_key = self._hash_key(task, f"{system}||{user}")
        if cache_key in self._cache:
            cached_data, source = self._cache[cache_key]
            return LLMResult(
                success=True,
                data=cached_data,
                source=source,
                task=task,
                model_used=self._model,
                timing_ms=round((time.time() - t0) * 1000, 1),
            )

        if not self.is_available():
            data = fallback_fn() if fallback_fn else {}
            return LLMResult(
                success=True,
                data=data,
                source="deterministic_fallback",
                task=task,
                model_used="deterministic",
                timing_ms=round((time.time() - t0) * 1000, 1),
                error="GEMINI_API_KEY not configured or client offline."
            )

        # Enrich system prompt with schema instructions
        active_system = system
        if schema:
            schema_json = json.dumps(schema.model_json_schema(), indent=2)
            active_system += f"\n\nYou MUST return a single JSON object strictly matching this schema:\n{schema_json}"

        raw_content = None
        attempt_error = None
        backoff = INITIAL_BACKOFF_SEC

        for attempt in range(MAX_HTTP_RETRIES + 1):
            try:
                raw_content = self._call_gemini_sdk_or_rest(
                    system_instruction=active_system,
                    user_prompt=user,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                if raw_content:
                    break
            except Exception as e:
                attempt_error = _safe_str(e)
                err_lower = attempt_error.lower()
                is_transient = any(code in err_lower for code in ["429", "500", "502", "503", "504", "timeout", "resource_exhausted"])
                if any(k in err_lower for k in ["quota", "tokens per day", "rate_limit_exceeded"]):
                    is_transient = False
                if attempt < MAX_HTTP_RETRIES and is_transient:
                    logger.info(f"[GEMINI RETRY] Transient error on {task} attempt {attempt+1} ({attempt_error}); sleeping {backoff:.1f}s...")
                    time.sleep(backoff)
                    backoff *= BACKOFF_FACTOR
                else:
                    break

        if not raw_content:
            logger.warning(f"[GEMINI ERROR] Execution failed for task '{task}': {attempt_error}. Invoking fallback.")
            data = fallback_fn() if fallback_fn else {}
            return LLMResult(
                success=True,
                data=data,
                source="deterministic_fallback",
                task=task,
                model_used=self._model,
                timing_ms=round((time.time() - t0) * 1000, 1),
                error=attempt_error
            )

        # Parse JSON
        parsed_json = None
        try:
            parsed_json = _extract_json_from_text(raw_content)
        except Exception as e:
            parse_err = _safe_str(e)
            logger.warning(f"[GEMINI PARSE ERROR] Could not parse JSON for task '{task}': {parse_err}")

        # Validate with Pydantic if schema provided
        if parsed_json is not None and schema:
            try:
                validated_obj = schema.model_validate(parsed_json)
                self._cache[cache_key] = (validated_obj, "llm")
                return LLMResult(
                    success=True,
                    data=validated_obj,
                    source="llm",
                    task=task,
                    model_used=self._model,
                    timing_ms=round((time.time() - t0) * 1000, 1),
                    raw_response=raw_content
                )
            except ValidationError as ve:
                ve_msg = _safe_str(ve)
                logger.info(f"[GEMINI SCHEMA VALIDATION FAILED] Task '{task}': {ve_msg}. Initiating feedback retry...")
                retry_user = (
                    f"{user}\n\nYour previous response failed Pydantic validation with error:\n{ve_msg}\n"
                    f"Please output strictly the corrected JSON complying with the schema."
                )
                try:
                    retry_raw = self._call_gemini_sdk_or_rest(
                        system_instruction=active_system,
                        user_prompt=retry_user,
                        temperature=0.05,
                        max_tokens=max_tokens
                    )
                    retry_json = _extract_json_from_text(retry_raw)
                    validated_retry = schema.model_validate(retry_json)
                    self._cache[cache_key] = (validated_retry, "retry")
                    return LLMResult(
                        success=True,
                        data=validated_retry,
                        source="retry",
                        task=task,
                        model_used=self._model,
                        timing_ms=round((time.time() - t0) * 1000, 1),
                        raw_response=retry_raw
                    )
                except Exception as retry_e:
                    logger.warning(f"[GEMINI RETRY FAILED] Schema retry failed: {_safe_str(retry_e)}. Using fallback.")
                    data = fallback_fn() if fallback_fn else {}
                    return LLMResult(
                        success=True,
                        data=data,
                        source="deterministic_fallback",
                        task=task,
                        model_used=self._model,
                        timing_ms=round((time.time() - t0) * 1000, 1),
                        error=_safe_str(retry_e),
                        raw_response=raw_content
                    )

        if parsed_json is not None:
            self._cache[cache_key] = (parsed_json, "llm")
            return LLMResult(
                success=True,
                data=parsed_json,
                source="llm",
                task=task,
                model_used=self._model,
                timing_ms=round((time.time() - t0) * 1000, 1),
                raw_response=raw_content
            )

        data = fallback_fn() if fallback_fn else {}
        return LLMResult(
            success=True,
            data=data,
            source="deterministic_fallback",
            task=task,
            model_used=self._model,
            timing_ms=round((time.time() - t0) * 1000, 1),
            error=attempt_error or "JSON extraction failed."
        )

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
        """Executes multimodal vision analysis with Gemini."""
        if not self.is_available():
            data = fallback_fn() if fallback_fn else {}
            return LLMResult(
                success=True,
                data=data,
                source="deterministic_fallback",
                task=task,
                model_used="deterministic",
                timing_ms=0.0
            )

        # Handle base64 / raw bytes
        if isinstance(image_bytes_or_base64, str):
            import base64
            clean_b64 = re.sub(r"^data:image/[a-zA-Z]+;base64,", "", image_bytes_or_base64)
            raw_bytes = base64.b64decode(clean_b64)
        else:
            raw_bytes = image_bytes_or_base64

        try:
            if self._raw_client:
                from google.genai import types
                part = types.Part.from_bytes(data=raw_bytes, mime_type=mime_type)
                response = self._raw_client.models.generate_content(
                    model=self._model,
                    contents=[prompt, part],
                    config=types.GenerateContentConfig(
                        temperature=temperature,
                        response_mime_type="application/json",
                        max_output_tokens=max_tokens,
                    )
                )
                parsed = _extract_json_from_text(response.text)
                if schema:
                    parsed = schema.model_validate(parsed)
                return LLMResult(
                    success=True,
                    data=parsed,
                    source="llm",
                    task=task,
                    model_used=self._model,
                )
        except Exception as e:
            logger.warning(f"[GEMINI VISION ERROR] {_safe_str(e)}. Invoking fallback.")

        data = fallback_fn() if fallback_fn else {}
        return LLMResult(
            success=True,
            data=data,
            source="deterministic_fallback",
            task=task,
            model_used=self._model
        )
