"""Plagiarism integration stub wired to the submission event bus."""

import logging

from src.services.grading.submission import (
    SubmissionSubmittedEvent,
    event_bus,
)

logger = logging.getLogger(__name__)


class PlagiarismCheckSubscriber:
    """Logs submission metadata; ready to replace with a real provider call."""

    async def handle(self, event: SubmissionSubmittedEvent) -> None:
        logger.info(
            "Plagiarism check queued for submission %s (%s files)",
            event.submission_uuid,
            len(event.file_keys),
        )


plagiarism_check_subscriber = PlagiarismCheckSubscriber()
event_bus.subscribe(SubmissionSubmittedEvent, plagiarism_check_subscriber.handle)
