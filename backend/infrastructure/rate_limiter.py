"""
FastAPI In-Memory Rate Limiter Module
Implements process-local sliding-window rate limiting to prevent denial-of-service
and abuse of computationally intensive CP-SAT solving and LLM inference endpoints.

Note:
For multi-instance horizontal scaling (e.g. multiple Render workers), rate counters
should be backed by a centralized Redis instance. In single-worker / low-cost production
deployments, this process-local implementation reliably prevents burst exhaustion without
additional infrastructure costs.
"""

import time
import threading
from typing import Dict, Tuple, List, Optional
from fastapi import Request, HTTPException, status


class SlidingWindowRateLimiter:
    """Thread-safe sliding window rate limiter."""

    def __init__(self):
        # Maps key -> list of timestamp floats
        self._requests: Dict[str, List[float]] = {}
        self._lock = threading.Lock()

        # Endpoint-specific limits: (max_requests, window_seconds)
        self.rules: Dict[str, Tuple[int, int]] = {
            "/api/generate": (10, 60),
            "/api/dream-home/generate": (10, 60),
            "/api/refine": (15, 60),
            "/api/projects/edit": (15, 60),
            "/api/floorplan/upload": (10, 60),
            "/api/floorplan/reconstruct": (10, 60),
            "/api/upload-floorplan": (10, 60),
            "/api/architectural-review": (15, 60),
            "DEFAULT": (120, 60),
        }

    def _resolve_rule(self, path: str) -> Tuple[int, int]:
        for pattern, rule in self.rules.items():
            if pattern != "DEFAULT" and path.startswith(pattern):
                return rule
        return self.rules["DEFAULT"]

    def is_allowed(self, client_id: str, path: str) -> Tuple[bool, int, int, int]:
        """
        Evaluates whether a request from client_id to path is permitted.
        Returns: (allowed, remaining, limit, reset_seconds)
        """
        max_requests, window_seconds = self._resolve_rule(path)
        key = f"{client_id}:{path.split('?')[0]}"
        now = time.time()
        window_start = now - window_seconds

        with self._lock:
            history = self._requests.get(key, [])
            # Filter timestamps outside the active sliding window
            active_history = [ts for ts in history if ts > window_start]

            if len(active_history) >= max_requests:
                oldest_in_window = active_history[0]
                reset_seconds = max(1, int(oldest_in_window + window_seconds - now))
                self._requests[key] = active_history
                return False, 0, max_requests, reset_seconds

            active_history.append(now)
            self._requests[key] = active_history
            remaining = max_requests - len(active_history)
            reset_seconds = window_seconds
            return True, remaining, max_requests, reset_seconds

    def clean_expired(self, max_age_seconds: int = 300) -> None:
        """Periodically removes stale tracking entries."""
        cutoff = time.time() - max_age_seconds
        with self._lock:
            keys_to_delete = [
                k for k, timestamps in self._requests.items()
                if not timestamps or timestamps[-1] < cutoff
            ]
            for k in keys_to_delete:
                del self._requests[k]


# Global singleton instance
rate_limiter = SlidingWindowRateLimiter()


def get_client_ip(request: Request) -> str:
    """Resolves client IP from standard proxy headers (Cloudflare, Render, X-Forwarded-For)."""
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    x_real_ip = request.headers.get("x-real-ip")
    if x_real_ip:
        return x_real_ip.strip()
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(request: Request) -> None:
    """Raises HTTPException 429 if the client exceeds the endpoint rate limit."""
    path = request.url.path
    # Bypass health checks and docs from rate limiting
    if path in ("/api/health", "/docs", "/redoc", "/openapi.json"):
        return

    client_id = get_client_ip(request)
    allowed, remaining, limit, reset_sec = rate_limiter.is_allowed(client_id, path)

    # Attach rate limit info to request state for response headers
    request.state.rate_limit_limit = limit
    request.state.rate_limit_remaining = remaining
    request.state.rate_limit_reset = reset_sec

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "status": "error",
                "code": "RATE_LIMIT_EXCEEDED",
                "message": f"Rate limit exceeded. Try again in {reset_sec} seconds.",
                "retry_after_seconds": reset_sec,
            },
            headers={"Retry-After": str(reset_sec)},
        )
