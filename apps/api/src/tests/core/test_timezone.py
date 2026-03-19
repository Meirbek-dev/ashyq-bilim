"""
Tests for timezone utilities
"""

from datetime import UTC, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from zoneinfo import ZoneInfo

from src.core.timezone import (
    get_timezone,
    invalidate_cache,
    now,
    to_timezone,
    utcnow,
)


class TestTimezone:
    """Test cases for timezone utilities"""

    def setup_method(self) -> None:
        """Reset cache before each test"""
        invalidate_cache()

    def test_get_timezone_returns_configured_timezone(self) -> None:
        """Test that get_timezone returns the configured timezone from config"""
        # Mock the config to return a specific timezone
        mock_config = MagicMock()
        mock_config.general_config.timezone = "Asia/Almaty"

        with patch("src.core.timezone.get_settings", return_value=mock_config):
            tz = get_timezone()
            assert isinstance(tz, ZoneInfo)
            assert str(tz) == "Asia/Almaty"

    def test_get_timezone_caches_result(self) -> None:
        """Test that get_timezone caches the result"""
        mock_config = MagicMock()
        mock_config.general_config.timezone = "Asia/Almaty"

        with patch(
            "src.core.timezone.get_settings", return_value=mock_config
        ) as mock_get_config:
            # First call
            tz1 = get_timezone()
            # Second call
            tz2 = get_timezone()

            # Config should only be called once due to caching
            assert mock_get_config.call_count == 1
            assert tz1 is tz2

    def test_get_timezone_fallback_to_utc_on_invalid_timezone(self) -> None:
        """Test that invalid timezone falls back to UTC"""
        mock_config = MagicMock()
        mock_config.general_config.timezone = "Invalid/Timezone"

        with patch("src.core.timezone.get_settings", return_value=mock_config):
            tz = get_timezone()
            assert isinstance(tz, ZoneInfo)
            assert str(tz) == "UTC"

    def test_now_returns_datetime_in_configured_timezone(self) -> None:
        """Test that now() returns datetime in configured timezone"""
        mock_config = MagicMock()
        mock_config.general_config.timezone = "Asia/Almaty"

        with patch("src.core.timezone.get_settings", return_value=mock_config):
            dt = now()
            assert isinstance(dt, datetime)
            assert dt.tzinfo is not None
            assert str(dt.tzinfo) == "Asia/Almaty"

    def test_utcnow_always_returns_utc_time(self) -> None:
        """Test that utcnow() always returns UTC time regardless of config"""
        mock_config = MagicMock()
        mock_config.general_config.timezone = "Asia/Almaty"

        with patch("src.core.timezone.get_settings", return_value=mock_config):
            dt = utcnow()
            assert isinstance(dt, datetime)
            assert dt.tzinfo == UTC

    def test_to_timezone_converts_naive_datetime(self) -> None:
        """Test that to_timezone converts naive datetime (assumes UTC)"""
        mock_config = MagicMock()
        mock_config.general_config.timezone = "Asia/Almaty"

        with patch("src.core.timezone.get_settings", return_value=mock_config):
            naive_dt = datetime(2025, 1, 1, 12, 0, 0)
            converted_dt = to_timezone(naive_dt)

            assert converted_dt.tzinfo is not None
            assert str(converted_dt.tzinfo) == "Asia/Almaty"

    def test_to_timezone_converts_aware_datetime(self) -> None:
        """Test that to_timezone converts timezone-aware datetime"""
        mock_config = MagicMock()
        mock_config.general_config.timezone = "Asia/Almaty"

        with patch("src.core.timezone.get_settings", return_value=mock_config):
            utc_dt = datetime(2025, 1, 1, 12, 0, 0, tzinfo=UTC)
            converted_dt = to_timezone(utc_dt)

            assert converted_dt.tzinfo is not None
            assert str(converted_dt.tzinfo) == "Asia/Almaty"
            # Time should be different due to timezone conversion
            assert converted_dt.hour != utc_dt.hour or converted_dt == utc_dt

    def test_invalidate_cache_clears_cached_timezone(self) -> None:
        """Test that invalidate_cache clears the cached timezone"""
        mock_config = MagicMock()
        mock_config.general_config.timezone = "Asia/Almaty"

        with patch(
            "src.core.timezone.get_settings", return_value=mock_config
        ) as mock_get_config:
            # First call
            get_timezone()
            assert mock_get_config.call_count == 1

            # Invalidate cache
            invalidate_cache()

            # Second call should fetch config again
            get_timezone()
            assert mock_get_config.call_count == 2

    def test_now_returns_current_time(self) -> None:
        """Test that now() returns approximately the current time"""
        mock_config = MagicMock()
        mock_config.general_config.timezone = "Asia/Almaty"

        with patch("src.core.timezone.get_settings", return_value=mock_config):
            before = datetime.now(ZoneInfo("Asia/Almaty"))
            dt = now()
            after = datetime.now(ZoneInfo("Asia/Almaty"))

            # The returned datetime should be between before and after
            assert before <= dt <= after

    def test_utcnow_returns_current_utc_time(self) -> None:
        """Test that utcnow() returns approximately the current UTC time"""
        before = datetime.now(UTC)
        dt = utcnow()
        after = datetime.now(UTC)

        # The returned datetime should be between before and after
        assert before <= dt <= after
