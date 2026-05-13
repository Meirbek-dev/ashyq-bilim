"""Pipeline stage: emit events after successful commit.

This stage runs AFTER the database transaction has committed. Failures here
never roll back the submission — they are handled by the event bus retry logic.
"""

from __future__ import annotations

from datetime import datetime

from src.db.grading.submissions import AssessmentType, Submission
from src.services.events import (
    GradePublishedEvent,
    SubmissionSubmittedEvent,
    get_event_bus,
)


async def emit_submission_events(
    draft: Submission,
    *,
    file_keys: list[str] | None = None,
    violation_count: int = 0,
    grade_published_at: datetime | None = None,
) -> None:
    """Emit post-submission events to the bus."""
    bus = get_event_bus()

    event = SubmissionSubmittedEvent(
        submission_uuid=draft.submission_uuid,
        assessment_type=AssessmentType(draft.assessment_type),
        user_id=draft.user_id,
        activity_id=draft.activity_id,
        attempt_number=draft.attempt_number,
        final_score=draft.final_score,
        is_late=draft.is_late,
        violation_count=violation_count,
        file_keys=file_keys or [],
    )

    await bus.emit(event)

    if grade_published_at is not None and draft.final_score is not None:
        await bus.emit(
            GradePublishedEvent(
                submission_uuid=draft.submission_uuid,
                user_id=draft.user_id,
                final_score=float(draft.final_score),
                published_at=grade_published_at,
                graded_by=None,
            )
        )
