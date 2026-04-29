import asyncio

import pytest

from src.db.grading.submissions import AssessmentType
from src.services.grading.submission import EventBus, SubmissionSubmittedEvent


@pytest.mark.asyncio
async def test_200_concurrent_submission_events_do_not_deadlock() -> None:
    seen: list[str] = []
    lock = asyncio.Lock()
    bus = EventBus()

    async def subscriber(event: SubmissionSubmittedEvent) -> None:
        async with lock:
            seen.append(event.submission_uuid)

    bus.subscribe(SubmissionSubmittedEvent, subscriber)

    await asyncio.wait_for(
        asyncio.gather(*[
            bus.emit(
                SubmissionSubmittedEvent(
                    submission_uuid=f"submission_{index}",
                    assessment_type=AssessmentType.ASSIGNMENT,
                    user_id=index,
                    activity_id=1,
                    attempt_number=1,
                )
            )
            for index in range(200)
        ]),
        timeout=5,
    )

    assert len(seen) == 200
    assert len(set(seen)) == 200
