"""
Configuration for LLM Tasks and Model Routing
Configures model per task via env variables with verified fallback candidates.
No hardcoded model IDs at call sites.
"""

import os
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

# Task-to-Environment variable mapping
TASK_ENV_VARS: Dict[str, str] = {
    "requirements": "GROQ_MODEL_REQUIREMENTS",
    "design_intent": "GROQ_MODEL_DESIGN_INTENT",
    "concepts": "GROQ_MODEL_CONCEPTS",
    "critique": "GROQ_MODEL_CRITIQUE",
    "edit_parsing": "GROQ_MODEL_EDIT_PARSING",
    "vision": "GROQ_MODEL_VISION",
    "advisor": "GROQ_MODEL_ADVISOR",
}

# Default models requested per task (can be overridden via env)
DEFAULT_TASK_MODELS: Dict[str, str] = {
    "requirements": os.getenv("GROQ_MODEL_REQUIREMENTS", os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")),
    "design_intent": os.getenv("GROQ_MODEL_DESIGN_INTENT", os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")),
    "concepts": os.getenv("GROQ_MODEL_CONCEPTS", os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")),
    "critique": os.getenv("GROQ_MODEL_CRITIQUE", os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")),
    "edit_parsing": os.getenv("GROQ_MODEL_EDIT_PARSING", os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")),
    "vision": os.getenv("GROQ_MODEL_VISION", os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-3.2-11b-vision-instruct")),
    "advisor": os.getenv("GROQ_MODEL_ADVISOR", os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")),
}

# Priority fallback sequence for general text reasoning
TEXT_CANDIDATE_FALLBACKS: List[str] = [
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-20b",
    "allam-2-7b",
    "llama-3.3-70b-versatile",
    "llama3-70b-8192",
    "mixtral-8x7b-32768",
]

# Priority fallback sequence for multimodal vision
VISION_CANDIDATE_FALLBACKS: List[str] = [
    "meta-llama/llama-3.2-11b-vision-instruct",
    "llama-3.2-11b-vision-preview",
    "meta-llama/llama-3.2-90b-vision-instruct",
]

# Request execution limits
DEFAULT_TIMEOUT_SEC: float = 18.0
VISION_TIMEOUT_SEC: float = 28.0
MAX_HTTP_RETRIES: int = 2
INITIAL_BACKOFF_SEC: float = 1.0
BACKOFF_FACTOR: float = 2.0
