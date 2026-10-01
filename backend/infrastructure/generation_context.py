"""Per-request state for generation timings and job progress reporting."""

from contextvars import ContextVar
from dataclasses import dataclass, field
import logging
import time
from typing import Callable, Dict, Optional


logger = logging.getLogger("generation")


@dataclass
class GenerationRunContext:
    request_id: str
    on_stage: Optional[Callable[[str], None]] = None
    started_at: float = field(default_factory=time.perf_counter)
    timings: Dict[str, float] = field(default_factory=dict)
    solver_attempts: int = 0
    solver_seconds: float = 0.0


CURRENT_GENERATION: ContextVar[Optional[GenerationRunContext]] = ContextVar(
    "current_generation", default=None
)


def report_generation_stage(stage: str) -> None:
    context = CURRENT_GENERATION.get()
    if context and context.on_stage:
        context.on_stage(stage)


def record_generation_timing(stage: str, seconds: float) -> None:
    context = CURRENT_GENERATION.get()
    if context:
        context.timings[stage] = context.timings.get(stage, 0.0) + seconds
        logger.info(
            "[GENERATION] %s: %.3fs request_id=%s",
            stage,
            seconds,
            context.request_id,
        )


def record_solver_timing(seconds: float) -> None:
    context = CURRENT_GENERATION.get()
    if context:
        context.solver_attempts += 1
        context.solver_seconds += seconds
