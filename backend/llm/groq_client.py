"""
Groq LLM Client Implementation
Features:
- Dynamic model verification at startup via Groq models endpoint
- Task-specific model routing with verified-only failovers
- Exponential backoff on 429/5xx and connection timeouts
- JSON extraction and Pydantic validation
- Single-feedback retry on schema validation error
- Deterministic fallback when LLM is unavailable or fails
- In-memory (task, prompt_hash) caching
- Comprehensive source tracking: 'llm', 'retry', or 'deterministic_fallback'
"""

import os
import re
import time
import json
import base64
import hashlib
import logging
from typing import Dict, Any, Optional, Union, Type, Callable, List, Set
from pydantic import BaseModel, ValidationError
from dotenv import load_dotenv

from .base import LLMClient, LLMResult, TaskType, SourceType
from .config import (
    DEFAULT_TASK_MODELS,
    TEXT_CANDIDATE_FALLBACKS,
    VISION_CANDIDATE_FALLBACKS,
    DEFAULT_TIMEOUT_SEC,
    VISION_TIMEOUT_SEC,
    MAX_HTTP_RETRIES,
    INITIAL_BACKOFF_SEC,
    BACKOFF_FACTOR,
)

load_dotenv()
logger = logging.getLogger("GroqClient")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)


def _safe_str(val: Any) -> str:
    s = str(val)
    # Strip potential sensitive keys if any
    return re.sub(r'gsk_[A-Za-z0-9_\-]+', '[REDACTED_API_KEY]', s)


def _extract_json_from_text(text: str) -> Dict[str, Any]:
    """Extracts and parses JSON object from raw LLM string."""
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
        return json.loads(candidate)

    raise ValueError("No valid JSON object found in response.")


class GroqClient(LLMClient):
    """
    Concrete implementation of LLMClient using Groq SDK.
    Never exposes raw API keys, enforces verified model binding,
    and guarantees zero-crash fallback behavior.
    """

    def __init__(self, api_key: Optional[str] = None):
        if api_key is not None:
            self._api_key = api_key.strip()
        else:
            self._api_key = os.getenv("GROQ_API_KEY", "").strip()
        self._raw_client = None
        self._available_models: Set[str] = set()
        self._verified_task_models: Dict[str, str] = {}
        self._cache: Dict[str, Any] = {}
        self._models_verified = False

        if self._api_key and self._api_key != "your_groq_api_key_here":
            try:
                from groq import Groq
                self._raw_client = Groq(api_key=self._api_key, max_retries=0)
            except Exception as e:
                logger.warning(f"Failed to initialize Groq SDK client: {_safe_str(e)}")
                self._raw_client = None

        # Verify models at startup
        self.verify_models_startup()

    def is_available(self) -> bool:
        return self._raw_client is not None and len(self._available_models) > 0

    def verify_models_startup(self) -> Dict[str, Any]:
        """
        Queries Groq models endpoint to discover verified active models.
        Binds task models only to verified IDs; fails over if configured model is absent.
        """
        if not self._raw_client:
            logger.info("[GROQ STARTUP] No valid GROQ_API_KEY found; operating in deterministic fallback mode.")
            self._models_verified = True
            return {"status": "offline", "verified_models": []}

        try:
            model_list = self._raw_client.models.list()
            self._available_models = {m.id for m in model_list.data}
            logger.info(f"[GROQ STARTUP] Verified {len(self._available_models)} models from Groq endpoint.")
        except Exception as e:
            logger.warning(f"[GROQ STARTUP] Failed to query Groq models endpoint: {_safe_str(e)}. Operating in fallback mode.")
            self._available_models = set()
            self._models_verified = True
            return {"status": "error", "error": _safe_str(e)}

        # Bind each task to a verified model
        for task, preferred_model in DEFAULT_TASK_MODELS.items():
            if preferred_model in self._available_models:
                self._verified_task_models[task] = preferred_model
            else:
                # Find first verified candidate from appropriate fallback list
                candidate_pool = VISION_CANDIDATE_FALLBACKS if task == "vision" else TEXT_CANDIDATE_FALLBACKS
                verified_candidate = next((m for m in candidate_pool if m in self._available_models), None)
                if verified_candidate:
                    logger.warning(
                        f"[GROQ ROUTING] Configured model '{preferred_model}' for task '{task}' not found in Groq models endpoint. "
                        f"Failing over to verified model: '{verified_candidate}'."
                    )
                    self._verified_task_models[task] = verified_candidate
                else:
                    # Pick any verified general model if available
                    fallback_any = next(iter(self._available_models), None)
                    if fallback_any and task != "vision":
                        logger.warning(
                            f"[GROQ ROUTING] No prioritized fallback found for task '{task}'. Using verified: '{fallback_any}'."
                        )
                        self._verified_task_models[task] = fallback_any
                    else:
                        logger.warning(f"[GROQ ROUTING] No verified model available for task '{task}'. Task will use deterministic fallback.")
                        self._verified_task_models[task] = ""

        self._models_verified = True
        return {
            "status": "online",
            "available_models": sorted(list(self._available_models)),
            "task_routing": self._verified_task_models,
        }

    def _get_verified_model_for_task(self, task: str) -> Optional[str]:
        if not self._models_verified:
            self.verify_models_startup()
        model = self._verified_task_models.get(task)
        if model and model in self._available_models:
            return model
        return None

    def _hash_key(self, task: str, prompt_content: str) -> str:
        h = hashlib.sha256(f"{task}:{prompt_content}".encode("utf-8")).hexdigest()
        return f"{task}_{h}"

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
        """
        Executes chat completion returning structured JSON.
        Handles timeout, backoff, schema validation, feedback retry, and caching.
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
                model_used=self._get_verified_model_for_task(task),
                timing_ms=round((time.time() - t0) * 1000, 1),
            )

        model = self._get_verified_model_for_task(task)
        if not self._raw_client or not model:
            # Deterministic fallback path
            data = fallback_fn() if fallback_fn else {}
            return LLMResult(
                success=True,
                data=data,
                source="deterministic_fallback",
                task=task,
                timing_ms=round((time.time() - t0) * 1000, 1),
                error="Groq client unavailable or no verified model found for task."
            )

        # Append schema requirements to system prompt if provided
        active_system = system
        if schema:
            schema_json = json.dumps(schema.model_json_schema(), indent=2)
            active_system += f"\n\nYou MUST return a single JSON object strictly matching this schema:\n{schema_json}"

        messages = [
            {"role": "system", "content": active_system},
            {"role": "user", "content": user}
        ]

        # Call with bounded retries and exponential backoff
        raw_content = None
        attempt_error = None
        backoff = INITIAL_BACKOFF_SEC

        for attempt in range(MAX_HTTP_RETRIES + 1):
            try:
                response = self._raw_client.chat.completions.create(
                    model=model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=temperature,
                    max_tokens=max_tokens,
                    timeout=DEFAULT_TIMEOUT_SEC,
                )
                raw_content = response.choices[0].message.content
                break
            except Exception as e:
                attempt_error = _safe_str(e)
                err_lower = attempt_error.lower()
                is_transient = any(code in err_lower for code in ["429", "500", "502", "503", "504", "timeout", "rate limit"])
                if any(k in err_lower for k in ["tokens per day", "tpd", "quota", "rate_limit_exceeded"]):
                    is_transient = False
                if attempt < MAX_HTTP_RETRIES and is_transient:
                    logger.info(f"[GROQ RETRY] Transient error on {task} attempt {attempt+1} ({attempt_error}); sleeping {backoff:.1f}s...")
                    time.sleep(backoff)
                    backoff *= BACKOFF_FACTOR
                else:
                    break

        if not raw_content:
            logger.warning(f"[GROQ ERROR] LLM execution failed for task '{task}': {attempt_error}. Using deterministic fallback.")
            data = fallback_fn() if fallback_fn else {}
            return LLMResult(
                success=True,
                data=data,
                source="deterministic_fallback",
                task=task,
                model_used=model,
                timing_ms=round((time.time() - t0) * 1000, 1),
                error=attempt_error
            )

        # Parse JSON
        parsed_json = None
        try:
            parsed_json = _extract_json_from_text(raw_content)
        except Exception as e:
            parse_err = _safe_str(e)
            logger.warning(f"[GROQ PARSE ERROR] Could not parse JSON for task '{task}': {parse_err}")

        # Validate with Pydantic if schema provided
        if parsed_json and schema:
            try:
                validated_obj = schema.model_validate(parsed_json)
                self._cache[cache_key] = (validated_obj, "llm")
                return LLMResult(
                    success=True,
                    data=validated_obj,
                    source="llm",
                    task=task,
                    model_used=model,
                    timing_ms=round((time.time() - t0) * 1000, 1),
                    raw_response=raw_content
                )
            except ValidationError as ve:
                ve_msg = _safe_str(ve)
                logger.info(f"[GROQ SCHEMA VALIDATION FAILED] Task '{task}': {ve_msg}. Initiating single feedback retry...")
                # Feedback Retry: Feed the validation error back to Groq
                retry_messages = list(messages)
                retry_messages.append({"role": "assistant", "content": raw_content})
                retry_messages.append({
                    "role": "user",
                    "content": f"Your previous response failed Pydantic validation with error:\n{ve_msg}\nPlease fix all errors and output the valid JSON object strictly complying with the schema."
                })
                try:
                    retry_resp = self._raw_client.chat.completions.create(
                        model=model,
                        messages=retry_messages,
                        response_format={"type": "json_object"},
                        temperature=0.05,
                        max_tokens=max_tokens,
                        timeout=DEFAULT_TIMEOUT_SEC,
                    )
                    retry_raw = retry_resp.choices[0].message.content
                    retry_json = _extract_json_from_text(retry_raw)
                    validated_retry = schema.model_validate(retry_json)
                    logger.info(f"[GROQ RETRY SUCCESS] Schema corrected on retry for task '{task}'.")
                    self._cache[cache_key] = (validated_retry, "retry")
                    return LLMResult(
                        success=True,
                        data=validated_retry,
                        source="retry",
                        task=task,
                        model_used=model,
                        timing_ms=round((time.time() - t0) * 1000, 1),
                        raw_response=retry_raw
                    )
                except Exception as retry_e:
                    logger.warning(f"[GROQ RETRY FAILED] Feedback retry failed for task '{task}': {_safe_str(retry_e)}. Falling back.")

        elif parsed_json and not schema:
            self._cache[cache_key] = (parsed_json, "llm")
            return LLMResult(
                success=True,
                data=parsed_json,
                source="llm",
                task=task,
                model_used=model,
                timing_ms=round((time.time() - t0) * 1000, 1),
                raw_response=raw_content
            )

        # Fallback if parsing or validation failed completely
        data = fallback_fn() if fallback_fn else {}
        return LLMResult(
            success=True,
            data=data,
            source="deterministic_fallback",
            task=task,
            model_used=model,
            timing_ms=round((time.time() - t0) * 1000, 1),
            error="Failed schema validation and fallback retry."
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
        """
        Executes vision query using verified vision models.
        Falls back seamlessly if vision model is unavailable.
        """
        t0 = time.time()
        if isinstance(image_bytes_or_base64, bytes):
            b64 = base64.b64encode(image_bytes_or_base64).decode("utf-8")
        else:
            b64 = image_bytes_or_base64

        model = self._get_verified_model_for_task(task)
        if not self._raw_client or not model:
            logger.info("[GROQ VISION] No verified vision model available in Groq models endpoint; using assisted deterministic fallback.")
            data = fallback_fn() if fallback_fn else {}
            return LLMResult(
                success=True,
                data=data,
                source="deterministic_fallback",
                task=task,
                timing_ms=round((time.time() - t0) * 1000, 1),
                error="No verified Groq vision model available on current account/endpoint."
            )

        # Clean mime
        clean_mime = mime_type if mime_type in ["image/jpeg", "image/png", "image/webp"] else "image/jpeg"
        data_url = f"data:{clean_mime};base64,{b64}"

        system_instruction = prompt
        if schema:
            schema_json = json.dumps(schema.model_json_schema(), indent=2)
            system_instruction += f"\nReturn a valid JSON object strictly complying with this schema:\n{schema_json}"

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": system_instruction},
                    {"type": "image_url", "image_url": {"url": data_url}}
                ]
            }
        ]

        try:
            response = self._raw_client.chat.completions.create(
                model=model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=VISION_TIMEOUT_SEC,
            )
            raw = response.choices[0].message.content
            parsed = _extract_json_from_text(raw)
            if schema:
                validated = schema.model_validate(parsed)
                return LLMResult(
                    success=True,
                    data=validated,
                    source="llm",
                    task=task,
                    model_used=model,
                    timing_ms=round((time.time() - t0) * 1000, 1),
                    raw_response=raw
                )
            return LLMResult(
                success=True,
                data=parsed,
                source="llm",
                task=task,
                model_used=model,
                timing_ms=round((time.time() - t0) * 1000, 1),
                raw_response=raw
            )
        except Exception as e:
            err_msg = _safe_str(e)
            logger.warning(f"[GROQ VISION ERROR] Vision analysis failed ({err_msg}). Using deterministic fallback.")
            data = fallback_fn() if fallback_fn else {}
            return LLMResult(
                success=True,
                data=data,
                source="deterministic_fallback",
                task=task,
                model_used=model,
                timing_ms=round((time.time() - t0) * 1000, 1),
                error=err_msg
            )
