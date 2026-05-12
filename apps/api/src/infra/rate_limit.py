"""Rate limiting middleware for assessment endpoints.

Uses an in-memory sliding window counter. Can be upgraded to Redis-backed
for multi-instance deployments.

Usage in routers:
    from src.infra.rate_limit import rate_limit

    @router.post("/submit")
    @rate_limit(max_requests=1, window_seconds=5, key_func=lambda r: f"{r.state.user.id}:{r.path_params['assessment_uuid']}")
    async def submit(...): ...
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from collections.abc import Callable
from functools import wraps
from typing import Any

from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)


class SlidingWindowCounter:
    """In-memory sliding window rate limiter."""

    def __init__(self) -> None:
        self._windows: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str, max_requests: int, window_seconds: float) -> bool:
        """Check if a request is allowed under the rate limit."""
        now = time.monotonic()
        window = self._windows[key]

        # Prune expired entries
        cutoff = now - window_seconds
        self._windows[key] = [ts for ts in window if ts > cutoff]
        window = self._windows[key]

        if len(window) >= max_requests:
            return False

        window.append(now)
        return True

    def clear(self) -> None:
        """Clear all rate limit state (for tests)."""
        self._windows.clear()


# Global limiter instance
_limiter = SlidingWindowCounter()


def get_limiter() -> SlidingWindowCounter:
    """Return the application-wide rate limiter."""
    return _limiter


def rate_limit(
    max_requests: int,
    window_seconds: float,
    key_func: Callable[[Request], str],
):
    """Decorator that applies rate limiting to a FastAPI endpoint.

    Args:
        max_requests: Maximum number of requests allowed in the window.
        window_seconds: Duration of the sliding window in seconds.
        key_func: Function that extracts the rate-limit key from the request.
    """

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Find the Request object in args/kwargs
            request: Request | None = kwargs.get("request")
            if request is None:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if request is not None:
                key = key_func(request)
                limiter = get_limiter()
                if not limiter.is_allowed(key, max_requests, window_seconds):
                    logger.warning(
                        "rate_limit_exceeded key=%s limit=%d/%ds",
                        key,
                        max_requests,
                        window_seconds,
                    )
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Rate limit exceeded. Please try again shortly.",
                    )

            return await func(*args, **kwargs)

        return wrapper

    return decorator
