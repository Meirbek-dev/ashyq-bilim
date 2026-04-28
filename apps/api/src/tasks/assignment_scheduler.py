"""Background task: auto-publish SCHEDULED assignments.

Runs every ``POLL_INTERVAL_SECONDS`` (default 60).  On each tick it queries for
assignments whose ``scheduled_publish_at`` is in the past and whose ``status``
is still ``SCHEDULED``, then transitions them to ``PUBLISHED``.

Wire into app startup via ``lifespan.py``:

    from src.tasks.assignment_scheduler import assignment_scheduler_loop
    asyncio.create_task(assignment_scheduler_loop(settings), name="assignment_scheduler")
"""

import asyncio
import logging
from datetime import UTC, datetime

from src.db.courses.activities import Activity
from src.db.courses.assignments import Assignment, AssignmentStatus
from src.infra.db.engine import get_bg_engine
from src.infra.settings import AppSettings

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS: int = 60


async def assignment_scheduler_loop(settings: AppSettings) -> None:
    """Periodic loop that auto-publishes SCHEDULED assignments."""
    logger.info(
        "Assignment scheduler started (poll interval: %ds)", POLL_INTERVAL_SECONDS
    )
    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        try:
            await asyncio.to_thread(_publish_due_assignments)
        except Exception:
            logger.exception("Assignment scheduler tick failed — will retry next cycle")


def _publish_due_assignments() -> int:
    """Synchronous DB work executed in a thread-pool to avoid blocking the loop.

    Returns the number of assignments published in this tick.
    """
    from sqlmodel import Session, select

    try:
        engine = get_bg_engine()
    except RuntimeError:
        return 0  # engine not yet registered (e.g. during test setup)

    now = datetime.now(UTC)
    published = 0

    with Session(engine) as db:
        due_assignments = db.exec(
            select(Assignment).where(
                Assignment.status == AssignmentStatus.SCHEDULED,
                Assignment.scheduled_publish_at <= now,
            )
        ).all()

        for assignment in due_assignments:
            try:
                activity = db.get(Activity, assignment.activity_id)
                assignment.status = AssignmentStatus.PUBLISHED
                assignment.published = True
                assignment.published_at = now
                assignment.scheduled_publish_at = None
                assignment.updated_at = now
                db.add(assignment)

                if activity is not None:
                    activity.published = True
                    db.add(activity)

                db.commit()
                published += 1
                logger.info(
                    "Auto-published assignment %s (was scheduled for %s)",
                    assignment.assignment_uuid,
                    assignment.published_at,
                )
            except Exception:
                db.rollback()
                logger.exception(
                    "Failed to auto-publish assignment %s",
                    assignment.assignment_uuid,
                )

    return published
