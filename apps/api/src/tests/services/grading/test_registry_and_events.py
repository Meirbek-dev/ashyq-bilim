import pytest

from src.db.grading.submissions import AssessmentType, GradingBreakdown
from src.services.grading.registry import BaseGrader, GraderRegistry, GradingResult
from src.services.grading.submission import (
    EventBus,
    SubmissionSubmittedEvent,
)


def test_grader_registry_allows_runtime_registration() -> None:
    class FakeGrader(BaseGrader):
        def grade(self, **_kwargs: object) -> GradingResult:
            return GradingResult(
                auto_score=42.0,
                breakdown=GradingBreakdown(
                    items=[],
                    needs_manual_review=False,
                    auto_graded=True,
                ),
                needs_manual_review=False,
            )

    original = GraderRegistry._graders.get(AssessmentType.QUIZ)
    try:
        GraderRegistry.register(AssessmentType.QUIZ)(FakeGrader)
        result = GraderRegistry.grade(AssessmentType.QUIZ)
    finally:
        if original is not None:
            GraderRegistry._graders[AssessmentType.QUIZ] = original

    assert result.auto_score == 42.0
    assert result.needs_manual_review is False


async def _collect_event(event: SubmissionSubmittedEvent, seen: list[str]) -> None:
    seen.append(event.submission_uuid)


@pytest.mark.asyncio
async def test_event_bus_emits_submission_submitted_event() -> None:
    seen: list[str] = []
    bus = EventBus()
    bus.subscribe(
        SubmissionSubmittedEvent,
        lambda event: _collect_event(event, seen),
    )

    await bus.emit(
        SubmissionSubmittedEvent(
            submission_uuid="submission_event",
            assessment_type=AssessmentType.ASSIGNMENT,
            user_id=10,
            activity_id=1,
            attempt_number=1,
            file_keys=["uploads/a.pdf"],
        )
    )

    assert seen == ["submission_event"]
