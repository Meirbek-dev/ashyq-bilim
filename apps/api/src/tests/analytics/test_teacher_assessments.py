from datetime import UTC, datetime
from types import SimpleNamespace

from src.db.courses.activities import ActivityTypeEnum
from src.services.analytics.assessments import (
    _attempt_distribution,
    _discrimination_index,
    _reliability_score,
    _score_bucket,
    _score_variance,
    build_assessment_rows,
)
from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import AnalyticsContext


def test_score_bucket_groups_scores_into_ranges() -> None:
    assert _score_bucket(12) == "0-19"
    assert _score_bucket(67) == "60-79"
    assert _score_bucket(95) == "80-100"


def test_score_bucket_handles_unknown_values() -> None:
    assert _score_bucket(None) == "Неизвестно"


def test_attempt_distribution_rolls_up_high_attempt_counts() -> None:
    buckets = _attempt_distribution({1: 1, 2: 2, 3: 5, 4: 7})
    lookup = {bucket.label: bucket.count for bucket in buckets}

    assert lookup["1"] == 1
    assert lookup["2"] == 1
    assert lookup["5+"] == 2


def test_assessment_quality_helpers_expose_variance_reliability_and_discrimination() -> None:
    scores = [25, 40, 60, 85, 95]
    scores_by_user = {idx: score for idx, score in enumerate(scores, start=1)}

    assert _score_variance(scores) > 0
    assert _reliability_score(scores) is not None
    assert _discrimination_index(scores_by_user) is not None


def test_assessment_rows_include_code_challenge_without_attempts() -> None:
    now = datetime(2026, 4, 26, tzinfo=UTC)
    context = AnalyticsContext(
        generated_at=now,
        courses_by_id={1: SimpleNamespace(id=1, name="Course")},
        activities_by_id={
            11: SimpleNamespace(
                id=11,
                course_id=1,
                name="Code",
                activity_type=ActivityTypeEnum.TYPE_CODE_CHALLENGE,
            ),
        },
        chapters_by_id={},
        course_chapters=[],
        chapter_activities=[],
        trail_runs=[
            SimpleNamespace(id=100, course_id=1, user_id=5),
            SimpleNamespace(id=101, course_id=1, user_id=6),
        ],
        trail_steps=[],
        certificates=[],
        assignments=[],
        assignment_submissions=[],
        exams=[],
        exam_attempts=[],
        quiz_attempts=[],
        quiz_question_stats=[],
        code_submissions=[],
        users_by_id={},
        usergroup_names_by_id={},
        cohort_ids_by_user={},
    )

    rows = build_assessment_rows(
        context,
        AnalyticsFilters(window="28d", compare="previous_period", bucket="day"),
    )

    rows_by_type = {row.assessment_type: row for row in rows}
    assert rows_by_type["code_challenge"].submission_rate == 0
    assert rows_by_type["code_challenge"].outlier_reason_codes == [
        "low_submission_rate"
    ]
