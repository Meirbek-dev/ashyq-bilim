"""
Grading utilities for code challenges
"""

from src.db.courses.code_challenges import (
    GradingStrategy,
    TestCase,
    TestCaseResult,
)


def calculate_score(
    results: list[TestCaseResult],
    test_cases: list[TestCase],
) -> float:
    """
    Calculate score from test case results using weighted scoring.

    Args:
        results: List of test case results
        test_cases: List of test cases with weights

    Returns:
        Score as percentage (0-100)
    """
    if not results or not test_cases:
        return 0.0

    # Build weight map
    weight_map = {tc.id: tc.weight for tc in test_cases}
    total_weight = sum(tc.weight for tc in test_cases)

    if total_weight == 0:
        return 0.0

    # Calculate weighted score
    earned_weight = sum(weight_map.get(r.test_case_id, 1) for r in results if r.passed)

    return (earned_weight / total_weight) * 100


def apply_grading_strategy(
    submissions: list[dict],
    strategy: GradingStrategy,
) -> float:
    """
    Apply grading strategy to determine final score.

    Args:
        submissions: List of submission dicts with 'score' and 'created_at'
        strategy: Grading strategy to apply

    Returns:
        Final score based on strategy
    """
    if not submissions:
        return 0.0

    if strategy == GradingStrategy.ALL_OR_NOTHING:
        # Score is 100 if any submission has all tests passed, else 0
        for sub in submissions:
            if (
                sub.get("passed_tests", 0) == sub.get("total_tests", 0)
                and sub.get("total_tests", 0) > 0
            ):
                return 100.0
        return 0.0

    if strategy == GradingStrategy.BEST_SUBMISSION:
        # Return highest score
        return max(sub.get("score", 0.0) for sub in submissions)

    if strategy == GradingStrategy.LATEST_SUBMISSION:
        # Return score of most recent submission
        sorted_subs = sorted(
            submissions, key=lambda x: x.get("created_at", ""), reverse=True
        )
        return sorted_subs[0].get("score", 0.0) if sorted_subs else 0.0

    if strategy == GradingStrategy.PARTIAL_CREDIT:
        # Return highest score (same as BEST_SUBMISSION for partial credit)
        return max(sub.get("score", 0.0) for sub in submissions)

    return 0.0


def calculate_composite_score(
    test_score: float,
    time_to_first_ac_ms: float | None,
    max_time_ms: float,
    attempts: int,
) -> float:
    """
    Calculate composite leaderboard score.

    Weighting:
    - Test score: 60%
    - Speed (time to first AC): 30%
    - Attempt efficiency: 10%

    Args:
        test_score: Score from tests (0-100)
        time_to_first_ac_ms: Time to first accepted submission in ms
        max_time_ms: Maximum time for normalization
        attempts: Number of attempts

    Returns:
        Composite score (0-100)
    """
    # Test score component (60%)
    score_component = test_score * 0.6

    # Speed component (30%) - faster = higher score
    if time_to_first_ac_ms is not None and max_time_ms > 0:
        speed_ratio = 1 - (time_to_first_ac_ms / max_time_ms)
        speed_component = max(0, speed_ratio) * 100 * 0.3
    else:
        speed_component = 0

    # Efficiency component (10%) - fewer attempts = higher score
    if attempts > 0:
        efficiency = min(1.0, 1.0 / attempts)
        efficiency_component = efficiency * 100 * 0.1
    else:
        efficiency_component = 0

    return score_component + speed_component + efficiency_component
