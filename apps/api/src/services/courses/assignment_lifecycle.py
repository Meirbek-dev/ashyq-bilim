"""Assignment lifecycle state machine.

Valid transitions:
  DRAFT      → SCHEDULED (set future publish date)
  DRAFT      → PUBLISHED (publish immediately)
  DRAFT      → ARCHIVED  (discard)
  SCHEDULED  → PUBLISHED (scheduled_publish_at reached OR teacher forces now)
  SCHEDULED  → DRAFT     (teacher cancels schedule)
  SCHEDULED  → ARCHIVED
  PUBLISHED  → ARCHIVED  (terminal for courses with submissions — cannot revert)
  ARCHIVED   → (terminal — no outbound transitions)

Invariant: a PUBLISHED assignment that already has non-draft submissions cannot
revert to DRAFT.  Use ARCHIVED to retire it instead.
"""

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlmodel import Session, func, select

from src.db.courses.activities import Activity
from src.db.courses.assignments import (
    Assignment,
    AssignmentPublishInput,
    AssignmentRead,
    AssignmentStatus,
)
from src.db.courses.courses import Course
from src.db.grading.submissions import Submission, SubmissionStatus
from src.db.users import PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses.activities.assignments.crud import _build_assignment_read

# ── Allowed transitions ───────────────────────────────────────────────────────

_ALLOWED_TRANSITIONS: dict[AssignmentStatus, frozenset[AssignmentStatus]] = {
    AssignmentStatus.DRAFT: frozenset({
        AssignmentStatus.SCHEDULED,
        AssignmentStatus.PUBLISHED,
        AssignmentStatus.ARCHIVED,
    }),
    AssignmentStatus.SCHEDULED: frozenset({
        AssignmentStatus.PUBLISHED,
        AssignmentStatus.DRAFT,
        AssignmentStatus.ARCHIVED,
    }),
    AssignmentStatus.PUBLISHED: frozenset({
        AssignmentStatus.ARCHIVED,
    }),
    AssignmentStatus.ARCHIVED: frozenset(),  # terminal
}


def _current_status(assignment: Assignment) -> AssignmentStatus:
    raw = getattr(assignment.status, "value", assignment.status)
    return AssignmentStatus(str(raw))


def _guard_transition(
    assignment: Assignment,
    target: AssignmentStatus,
) -> None:
    """Raise 409 if the requested transition is not allowed."""
    current = _current_status(assignment)
    allowed = _ALLOWED_TRANSITIONS.get(current, frozenset())
    if target not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot transition assignment from {current} to {target}. "
                f"Allowed: {[s.value for s in allowed] or 'none (terminal state)'}."
            ),
        )


def _has_non_draft_submissions(assignment: Assignment, db_session: Session) -> bool:
    """Return True if any student has already submitted (non-draft) to this assignment."""
    count: int = db_session.exec(
        select(func.count()).where(
            Submission.activity_id == assignment.activity_id,
            Submission.status != SubmissionStatus.DRAFT,
        )
    ).one()
    return count > 0


def _get_assignment_with_course(
    assignment_uuid: str,
    db_session: Session,
) -> tuple[Assignment, Course, Activity]:
    assignment = db_session.exec(
        select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    ).first()
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )
    course = db_session.exec(
        select(Course).where(Course.id == assignment.course_id)
    ).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        )
    activity = db_session.exec(
        select(Activity).where(Activity.id == assignment.activity_id)
    ).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )
    return assignment, course, activity


# ── Public service functions ──────────────────────────────────────────────────


async def publish_assignment(
    assignment_uuid: str,
    publish_input: AssignmentPublishInput,
    current_user: PublicUser,
    db_session: Session,
) -> AssignmentRead:
    """Publish an assignment immediately or schedule it for a future date.

    - ``publish_input.scheduled_at = None``  → publish now (PUBLISHED)
    - ``publish_input.scheduled_at = <future datetime>`` → SCHEDULED
    """
    assignment, course, activity = _get_assignment_with_course(
        assignment_uuid, db_session
    )

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    target = (
        AssignmentStatus.SCHEDULED
        if publish_input.scheduled_at is not None
        else AssignmentStatus.PUBLISHED
    )
    _guard_transition(assignment, target)

    now = datetime.now(UTC)

    if target == AssignmentStatus.SCHEDULED:
        scheduled_at = publish_input.scheduled_at
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=UTC)
        if scheduled_at <= now:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="scheduled_at must be in the future",
            )
        assignment.status = AssignmentStatus.SCHEDULED
        assignment.scheduled_publish_at = scheduled_at
        activity.published = False

    else:  # PUBLISHED immediately
        assignment.status = AssignmentStatus.PUBLISHED
        assignment.published = True
        assignment.published_at = now
        assignment.scheduled_publish_at = None
        activity.published = True

    assignment.updated_at = now
    db_session.add(assignment)
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(assignment)

    return _build_assignment_read(
        assignment,
        course_uuid=course.course_uuid,
        activity_uuid=activity.activity_uuid,
        activity_published=activity.published,
    )


async def archive_assignment(
    assignment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> AssignmentRead:
    """Archive an assignment.  Read-only for everyone afterwards."""
    assignment, course, activity = _get_assignment_with_course(
        assignment_uuid, db_session
    )

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    _guard_transition(assignment, AssignmentStatus.ARCHIVED)

    now = datetime.now(UTC)
    assignment.status = AssignmentStatus.ARCHIVED
    assignment.published = False
    assignment.archived_at = now
    assignment.updated_at = now
    activity.published = False

    db_session.add(assignment)
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(assignment)

    return _build_assignment_read(
        assignment,
        course_uuid=course.course_uuid,
        activity_uuid=activity.activity_uuid,
        activity_published=activity.published,
    )


async def cancel_schedule(
    assignment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> AssignmentRead:
    """Return a SCHEDULED assignment back to DRAFT."""
    assignment, course, activity = _get_assignment_with_course(
        assignment_uuid, db_session
    )

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    _guard_transition(assignment, AssignmentStatus.DRAFT)

    now = datetime.now(UTC)
    assignment.status = AssignmentStatus.DRAFT
    assignment.scheduled_publish_at = None
    assignment.updated_at = now
    activity.published = False

    db_session.add(assignment)
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(assignment)

    return _build_assignment_read(
        assignment,
        course_uuid=course.course_uuid,
        activity_uuid=activity.activity_uuid,
        activity_published=activity.published,
    )
