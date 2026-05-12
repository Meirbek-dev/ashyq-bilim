"""Pipeline stage: apply late and attempt penalties.

Pure functions — no I/O. Takes the auto_score from the grading stage and
applies policy-driven penalties to produce the final score.
"""

from __future__ import annotations

from datetime import UTC, datetime

from src.db.grading.overrides import StudentPolicyOverride
from src.services.grading.pipeline.context import EffectivePolicy, PenaltyResult
from src.services.grading.settings_loader import AssessmentSettings


def apply_penalties(
    auto_score: float,
    effective: EffectivePolicy,
    override: StudentPolicyOverride | None,
    submitted_at: datetime,
    attempt_number: int,
    settings: AssessmentSettings,
    violation_exceeded: bool,
    needs_manual_review: bool,
) -> PenaltyResult:
    """Compute the final score after all penalties.

    If `needs_manual_review` is True, final_score is left at 0 (teacher sets it).
    If `violation_exceeded` is True, final_score is zeroed.
    """
    if violation_exceeded:
        return PenaltyResult(
            late_penalty_pct=0.0,
            attempt_penalty_applied=False,
            final_score=0.0,
            violation_zeroed=True,
        )

    if needs_manual_review:
        # Teacher will set the final score; we don't apply penalties yet
        return PenaltyResult(
            late_penalty_pct=0.0,
            attempt_penalty_applied=False,
            final_score=0.0,
            violation_zeroed=False,
        )

    # 1. Attempt penalty (caps the max achievable score)
    penalized_score = _apply_attempt_penalty(
        auto_score,
        attempt_number,
        settings.max_score_penalty_per_attempt,
    )
    attempt_penalty_applied = penalized_score < auto_score

    # 2. Late penalty
    waive_late = override is not None and override.waive_late_penalty
    if waive_late:
        late_penalty_pct = 0.0
    else:
        late_penalty_pct = _calculate_late_penalty(
            submitted_at, effective.due_at, effective
        )

    # Apply late penalty to the (possibly attempt-penalized) score
    final_score = _apply_late_penalty(penalized_score, late_penalty_pct)

    return PenaltyResult(
        late_penalty_pct=late_penalty_pct,
        attempt_penalty_applied=attempt_penalty_applied,
        final_score=final_score,
        violation_zeroed=False,
    )


def _apply_attempt_penalty(
    base_score: float,
    attempt_number: int,
    max_score_penalty_per_attempt: float | None,
) -> float:
    """Cap the score based on attempt-number penalty."""
    if not max_score_penalty_per_attempt or attempt_number <= 1:
        return base_score
    penalty_multiplier = attempt_number - 1
    max_score_reduction = max_score_penalty_per_attempt * penalty_multiplier
    penalized_max = max(0.0, 100.0 - max_score_reduction)
    return min(base_score, penalized_max)


def _calculate_late_penalty(
    submitted_at: datetime,
    due_at: datetime | None,
    effective: EffectivePolicy,
) -> float:
    """Delegate to the LatePolicy's apply method."""
    if due_at is None or submitted_at <= due_at:
        return 0.0
    if not effective.allow_late:
        return 0.0
    return effective.late_policy.apply(submitted_at, due_at)


def _apply_late_penalty(score: float, penalty_pct: float) -> float:
    """Reduce score by the late penalty percentage."""
    clamped = max(0.0, min(100.0, penalty_pct))
    return round(score * (1 - clamped / 100), 2)
