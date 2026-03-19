"""
Thread-safe cache manager for AI services with proper TTL management.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from functools import cached_property
from threading import Lock
from typing import Any, TypeVar

from cachetools import TTLCache

from config.config import get_settings

logger = logging.getLogger(__name__)

T = TypeVar("T")


class ThreadSafeCache[T]:
    """Thread-safe cache with TTL support using cachetools."""

    def __init__(self, maxsize: int = 100, ttl: int = 3600) -> None:
        """
        Initialize thread-safe cache.

        Args:
            maxsize: Maximum number of items to store
            ttl: Time-to-live in seconds
        """
        self._cache: TTLCache[str, T] = TTLCache(maxsize=maxsize, ttl=ttl)
        self._lock = Lock()
        self._hit_count = 0
        self._miss_count = 0

    @cached_property
    def _async_lock(self) -> asyncio.Lock:
        """Lazily created inside the running event loop so it is never
        bound to the wrong loop when the cache is initialised at import time."""
        return asyncio.Lock()

    def get(self, key: str) -> T | None:
        """
        Get item from cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found/expired
        """
        with self._lock:
            try:
                value = self._cache[key]
                self._hit_count += 1
                logger.debug("Cache hit for key: %s", key)
                return value
            except KeyError:
                self._miss_count += 1
                logger.debug("Cache miss for key: %s", key)
                return None

    async def async_get(self, key: str) -> T | None:
        """Async-safe getter wrapper."""
        # Fast-path using sync get under thread lock to avoid blocking event loop
        return self.get(key)

    def set(self, key: str, value: T) -> None:
        """
        Set item in cache.

        Args:
            key: Cache key
            value: Value to cache
        """
        with self._lock:
            self._cache[key] = value
            logger.debug("Cached item with key: %s", key)

    async def async_set(self, key: str, value: T) -> None:
        """Async-safe setter wrapper."""
        self.set(key, value)

    def delete(self, key: str) -> None:
        """
        Delete item from cache.

        Args:
            key: Cache key
        """
        with self._lock:
            try:
                del self._cache[key]
                logger.debug("Deleted cache entry: %s", key)
            except KeyError:
                pass

    async def async_delete(self, key: str) -> None:
        """Async-safe delete wrapper."""
        self.delete(key)

    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            self._cache.clear()
            self._hit_count = 0
            self._miss_count = 0
            logger.info("Cache cleared")

    def get_stats(self) -> dict[str, Any]:
        """
        Get cache statistics.

        Returns:
            Dictionary with cache stats
        """
        with self._lock:
            total_requests = self._hit_count + self._miss_count
            hit_rate = (
                (self._hit_count / total_requests * 100) if total_requests > 0 else 0
            )

            return {
                "size": len(self._cache),
                "maxsize": self._cache.maxsize,
                "hit_count": self._hit_count,
                "miss_count": self._miss_count,
                "hit_rate": f"{hit_rate:.2f}%",
                "ttl": self._cache.ttl,
            }

    async def get_or_set(
        self,
        key: str,
        factory: Callable[[], T | Awaitable[T]],
    ) -> T | None:
        """
        Get value from cache or compute and cache it.

        Args:
            key: Cache key
            factory: Callable to generate value if not cached

        Returns:
            Cached or newly computed value
        """
        # Fast-path cache check (use async_get for consistency)
        cached_value = await self.async_get(key)
        if cached_value is not None:
            return cached_value

        # Compute value (call factory - it may return an awaitable)
        try:
            value_or_awaitable = factory()

            if isinstance(value_or_awaitable, Awaitable):
                value = await value_or_awaitable
            else:
                value = value_or_awaitable

            # Protect write path with async lock to avoid races
            async with self._async_lock:
                # Double-check cache in case of concurrent writer
                cached_value = await self.async_get(key)
                if cached_value is not None:
                    return cached_value

                if value is not None:
                    self.set(key, value)

                return value

        except Exception as e:
            logger.exception("Failed to compute value for key %s: %s", key, e)
            return None


class AICacheManager:
    """Centralized cache manager for all AI-related caches."""

    def __init__(self) -> None:
        """Initialize cache manager with separate caches for different data types."""

        settings = get_settings()
        vector_config = getattr(settings.ai_config, "vector_store", None)

        vector_ttl = getattr(vector_config, "collection_retention", 86400)
        vector_maxsize = max(100, getattr(vector_config, "chromadb_pool_size", 10) * 10)

        # Vector store cache - large TTL, smaller size
        self.vector_store_cache: ThreadSafeCache = ThreadSafeCache(
            maxsize=vector_maxsize,
            ttl=vector_ttl,
        )

        # Agent cache - medium TTL, medium size
        self.agent_cache: ThreadSafeCache = ThreadSafeCache(
            maxsize=100,
            ttl=1800,  # 30 minutes
        )

        # Database query cache - short TTL, larger size
        self.db_cache: ThreadSafeCache = ThreadSafeCache(
            maxsize=200,
            ttl=300,  # 5 minutes
        )

        # Org config cache — very short TTL so feature flags propagate quickly
        self.org_config_cache: ThreadSafeCache = ThreadSafeCache(
            maxsize=100,
            ttl=10,  # 10 seconds
        )

        # Secondary index: activity_uuid -> set of vector store cache keys
        # Allows deterministic vector cache invalidation when content changes.
        self._vector_key_index: dict[str, set[str]] = {}
        self._agent_key_index: dict[str, set[str]] = {}
        self._index_lock = Lock()

        logger.info("AI Cache Manager initialized")

    def register_vector_cache_key(self, activity_uuid: str, cache_key: str) -> None:
        """Record that *cache_key* belongs to *activity_uuid* for future invalidation."""
        with self._index_lock:
            self._vector_key_index.setdefault(activity_uuid, set()).add(cache_key)

    def register_agent_cache_key(self, activity_uuid: str, cache_key: str) -> None:
        """Record that an agent *cache_key* belongs to *activity_uuid* for future invalidation."""
        with self._index_lock:
            self._agent_key_index.setdefault(activity_uuid, set()).add(cache_key)

    def clear_all(self) -> None:
        """Clear all caches."""
        self.vector_store_cache.clear()
        self.agent_cache.clear()
        self.db_cache.clear()
        self.org_config_cache.clear()
        with self._index_lock:
            self._vector_key_index.clear()
            self._agent_key_index.clear()
        logger.info("All AI caches cleared")

    def get_all_stats(self) -> dict[str, Any]:
        """Get statistics for all caches."""
        with self._index_lock:
            vector_index_size = sum(len(v) for v in self._vector_key_index.values())
            agent_index_size = sum(len(v) for v in self._agent_key_index.values())
        return {
            "vector_store": self.vector_store_cache.get_stats(),
            "agent": self.agent_cache.get_stats(),
            "database": self.db_cache.get_stats(),
            "org_config": self.org_config_cache.get_stats(),
            "vector_key_index_entries": vector_index_size,
            "agent_key_index_entries": agent_index_size,
        }

    def invalidate_activity_cache(self, activity_uuid: str) -> None:
        """Invalidate all caches related to a specific activity.

        Clears:
        - DB query cache for the activity
        - All vector store cache entries registered for the activity
        - All agent cache entries registered for the activity
        """
        # Clear DB cache entries (activity data + pre-serialised context text)
        self.db_cache.delete(f"activity_{activity_uuid}")
        self.db_cache.delete(f"context_text_{activity_uuid}")

        # Clear all vector store and agent entries tracked for this activity
        with self._index_lock:
            vector_keys = self._vector_key_index.pop(activity_uuid, set())
            agent_keys = self._agent_key_index.pop(activity_uuid, set())

        for key in vector_keys:
            self.vector_store_cache.delete(key)
        for key in agent_keys:
            self.agent_cache.delete(key)

        logger.info(
            "Invalidated caches for activity %s: %d vector store, %d agent entries cleared",
            activity_uuid,
            len(vector_keys),
            len(agent_keys),
        )


# Global cache manager instance
_cache_manager: AICacheManager | None = None
_cache_manager_lock = Lock()


def get_ai_cache_manager() -> AICacheManager:
    """
    Get or create global AI cache manager instance.

    Returns:
        Global AICacheManager instance
    """
    global _cache_manager

    if _cache_manager is None:
        with _cache_manager_lock:
            if _cache_manager is None:
                _cache_manager = AICacheManager()

    return _cache_manager
