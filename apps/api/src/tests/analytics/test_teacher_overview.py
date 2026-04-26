from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.overview import _metric
from src.services.analytics.risk import _confidence_level, _top_factor, _why_now
from src.services.analytics.rollups import supports_teacher_rollup_reads


def test_metric_computes_delta_and_direction() -> None:
    metric = _metric("Active learners", 120, 100)

    assert metric.value == 120
    assert metric.delta_value == 20
    assert metric.delta_pct == 20
    assert metric.direction == "up"


def test_metric_handles_missing_previous_value() -> None:
    metric = _metric("Completion rate", 67.5, None)

    assert metric.delta_value is None
    assert metric.delta_pct is None
    assert metric.direction == "flat"


def test_teacher_rollup_reads_are_disabled_for_course_filtered_scope() -> None:
    filters = AnalyticsFilters(course_ids=[10])

    assert supports_teacher_rollup_reads(filters) is False


def test_explainable_risk_helpers_identify_dominant_signal() -> None:
    components = {"inactivity": 14.0, "progress": 28.0, "failures": 8.0}

    assert _top_factor(components) == "progress"
    assert _confidence_level(
        risk_score=74,
        reason_codes=["inactive_7d", "low_progress"],
        days_since_last_activity=9,
    ) == "high"
    assert "seven-day" in _why_now(["inactive_7d"], "inactivity")
