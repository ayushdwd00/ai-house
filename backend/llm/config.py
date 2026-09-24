"""
Configuration for LLM Tasks and Model Routing
Configures model per task via env variables with verified fallback candidates.
No hardcoded model IDs at call sites.
"""

import os
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

# Default API Keys and Models
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL: str = os.getenv("GROQ_MODEL", os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")).strip()

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip()

# Task-to-Environment variable mapping
TASK_ENV_VARS: Dict[str, str] = {
    "requirements": "GROQ_MODEL_REQUIREMENTS",
    "design_intent": "GEMINI_MODEL_DESIGN_INTENT",
    "concepts": "GEMINI_MODEL_CONCEPTS",
    "critique": "GEMINI_MODEL_CRITIQUE",
    "review": "GEMINI_MODEL_REVIEW",
    "edit_parsing": "GROQ_MODEL_EDIT_PARSING",
    "vision": "GROQ_MODEL_VISION",
    "advisor": "GROQ_MODEL_ADVISOR",
}

# Default Groq models requested per task (can be overridden via env)
DEFAULT_TASK_MODELS: Dict[str, str] = {
    "requirements": os.getenv("GROQ_MODEL_REQUIREMENTS", GROQ_MODEL),
    "design_intent": os.getenv("GROQ_MODEL_DESIGN_INTENT", GROQ_MODEL),
    "concepts": os.getenv("GROQ_MODEL_CONCEPTS", GROQ_MODEL),
    "critique": os.getenv("GROQ_MODEL_CRITIQUE", GROQ_MODEL),
    "review": os.getenv("GROQ_MODEL_REVIEW", GROQ_MODEL),
    "edit_parsing": os.getenv("GROQ_MODEL_EDIT_PARSING", GROQ_MODEL),
    "vision": os.getenv("GROQ_MODEL_VISION", os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-3.2-11b-vision-instruct")),
    "advisor": os.getenv("GROQ_MODEL_ADVISOR", GROQ_MODEL),
}

# Default Gemini models requested per task (can be overridden via env)
DEFAULT_GEMINI_TASK_MODELS: Dict[str, str] = {
    "requirements": os.getenv("GEMINI_MODEL_REQUIREMENTS", GEMINI_MODEL),
    "design_intent": os.getenv("GEMINI_MODEL_DESIGN_INTENT", GEMINI_MODEL),
    "concepts": os.getenv("GEMINI_MODEL_CONCEPTS", GEMINI_MODEL),
    "critique": os.getenv("GEMINI_MODEL_CRITIQUE", GEMINI_MODEL),
    "review": os.getenv("GEMINI_MODEL_REVIEW", GEMINI_MODEL),
    "edit_parsing": os.getenv("GEMINI_MODEL_EDIT_PARSING", GEMINI_MODEL),
    "vision": os.getenv("GEMINI_MODEL_VISION", GEMINI_MODEL),
    "advisor": os.getenv("GEMINI_MODEL_ADVISOR", GEMINI_MODEL),
}

# Priority fallback sequence for Gemini models
GEMINI_CANDIDATE_FALLBACKS: List[str] = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.5-flash",
]


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
