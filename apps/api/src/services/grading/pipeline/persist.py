"""Pipeline stage: persist submission, grading entry, and progress atomically.

This is the only pipeline stage that performs database I/O. All writes happen
in a single transaction — if any step fails, everything rolls back.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlmodel import Session
from ulid import ULID

from src.db.grading.entries import GradingEntry
from src.db.grading.progress import AssessmentPolicy, GradeReleaseMode
from src.db.grading.submissions import Submission, SubmissionStatus
from src.services.grading.assignment_breakdown import build_effective_grading_breakdown
from src.services.grading.pipeline.context import EffectivePolicy, PenaltyResult
from src.services.grading.registry import GradingResult
from src.services.progress.submissions import (
    _attach_policy,
    recalculate_activity_progress,
)


def persist_submission(
    db_session: Session,
    draft: Submission,
    result: GradingResult,
    penalty: PenaltyResult,
    effective: EffectivePolicy,
    answers_payload: dict,
    now: datetime,
    policy: AssessmentPolicy | None = None,
) -> Submission:
    """Write submission + GradingEntry + progress in one transaction.

    Returns the refreshed submission after commit.
    """
    # Determine post-submission status
    new_status = _resolve_status(result)

    # Write submission fields
    draft.answers_json = answers_payload
    draft.grading_json = result.breakdown.model_dump()
    # Merge with any existing item feedback from prior grading entries
    draft.grading_json = build_effective_grading_breakdown(
        draft, db_session
    ).model_dump()
    draft.auto_score = result.auto_score if not penalty.violation_zeroed else 0.0
    draft.late_penalty_pct = penalty.late_penalty_pct
    draft.final_score = penalty.final_score if not result.needs_manual_review else None
    draft.status = new_status
    draft.is_late = (
        effective.due_at is not None and now > effective.due_at
    )
    draft.submitted_at = now
    draft.graded_at = now if new_status == SubmissionStatus.GRADED else None
    draft.updated_at = now

    # Ensure policy is attached for progress calculation
    _attach_policy(draft, db_session)
    db_session.add(draft)

    # Create immutable grading entry for auto-graded submissions
    if not result.needs_manual_review and draft.id is not None:
        grade_release = (
            policy.grade_release_mode
            if policy is not None
            else GradeReleaseMode.IMMEDIATE
        )
        db_session.add(
            GradingEntry(
                entry_uuid=f"entry_{ULID()}",
                submission_id=draft.id,
                graded_by=draft.user_id,
                raw_score=float(result.auto_score),
                penalty_pct=float(penalty.late_penalty_pct),
                final_score=float(penalty.final_score),
                breakdown=draft.grading_json,
                overall_feedback=(
                    draft.grading_json.get("feedback", "")
                    if isinstance(draft.grading_json, dict)
                    else ""
                ),
                grading_version=draft.grading_version,
                created_at=now,
                published_at=(
                    now if grade_release == GradeReleaseMode.IMMEDIATE else None
                ),
            )
        )

    # Recalculate progress (same transaction)
    recalculate_activity_progress(
        draft.activity_id,
        draft.user_id,
        db_session,
        commit=False,
    )

    db_session.commit()
    db_session.refresh(draft)
    return draft


def _resolve_status(result: GradingResult) -> SubmissionStatus:
    """Determine post-submission status from grading result."""
    if result.needs_manual_review:
        return SubmissionStatus.PENDING
    return SubmissionStatus.GRADED
