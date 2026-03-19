"""Simple Redis helper utilities (sync) with safe fallback and JSON (or orjson) serialization.

API:
- get_redis_client() -> Optional[redis.Redis]
- get_json(key) -> Optional[dict]
- set_json(key, dict, ttl_seconds)
- delete_keys(*keys)

Design:
- Lazy, cached client instance
- Uses orjson if available for speed, falls back to json
- Swallows exceptions and logs, so callers can be simple and robust
- Easy to patch in tests (patch get_redis_client or this module functions)
"""

from __future__ import annotations

import logging
from typing import Optional

try:
    import redis
except Exception:  # pragma: no cover - environment without redis installed
    redis = None

try:
    import orjson as _orjson  # type: ignore

    def _dumps(o: object) -> bytes:  # type: ignore
        return _orjson.dumps(o)

    def _loads(b: bytes) -> object:  # type: ignore
        return _orjson.loads(b)

except Exception:  # pragma: no cover - orjson optional
    import json as _json

    def _dumps(o: object) -> bytes:  # type: ignore
        return _json.dumps(o, default=str).encode()

    def _loads(b: bytes) -> object:  # type: ignore
        return _json.loads(b.decode())


_logger = logging.getLogger(__name__)
_client: redis.Redis | None = None


def get_redis_client() -> redis.Redis | None:
    """Return a cached redis client or None if not configured/available."""
    global _client
    if _client is not None:
        return _client

    if redis is None:
        _logger.debug("redis package not available")
        return None

    # Delay importing platform config so tests can import this module without
    # triggering heavier application imports (which may require optional deps).
    try:
        from config.config import get_settings

        cfg = get_settings()
        url = getattr(cfg.redis_config, "redis_connection_string", None)
        if not url:
            _logger.debug("no redis connection string configured")
            return None
    except Exception:
        _logger.debug("no platform config available for redis client")
        return None

    try:
        _client = redis.Redis.from_url(url)
        # Optionally test connection (PING) lazily when first used; defer to callers
        return _client
    except Exception as exc:
        _logger.exception("Failed to initialize redis client: %s", exc)
        _client = None
        return None


def get_json(key: str) -> dict | None:
    r = get_redis_client()
    if not r:
        return None
    try:
        raw = r.get(key)
        if not raw:
            return None
        return _loads(raw)
    except Exception:
        _logger.exception("redis get_json failed for key=%s", key)
        return None


def set_json(key: str, value: object, ttl: int | None = None) -> None:
    r = get_redis_client()
    if not r:
        return
    try:
        payload = _dumps(value)
        if ttl:
            r.setex(key, ttl, payload)
        else:
            r.set(key, payload)
    except Exception:
        _logger.exception("redis set_json failed for key=%s", key)


def delete_keys(*keys: str) -> None:
    r = get_redis_client()
    if not r:
        return
    try:
        if keys:
            r.delete(*keys)
    except Exception:
        _logger.exception("redis delete_keys failed: %s", keys)
