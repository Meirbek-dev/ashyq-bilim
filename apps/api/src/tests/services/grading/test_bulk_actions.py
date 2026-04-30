from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.courses.activities import (
    Activity,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.bulk_actions import BulkActionStatus, BulkActionType
from src.db.grading.overrides import StudentPolicyOverride
from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
)
from src.db.grading.schemas import BatchGradeItem, BatchGradeRequest
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
from src.db.model_registry import import_orm_models
from src.db.users import PublicUser, User
from src.services.grading import bulk as bulk_service
from src.services.grading import teacher as teacher_service


@pytest.fixture
def db_session() -> Session:
    import_orm_models()
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture
def teacher() -> PublicUser:
    return PublicUser(
        id=99,
        user_uuid="user_teacher",
        username="teacher",
        first_name="Teacher",
        middle_name="",
        last_name="One",
        email="teacher@example.com",
        avatar_image="",
        bio="",
        details={},
        profile={},
        theme="default",
        locale="en-US",
    )


def _seed_gradeable_activity(db_session: Session) -> tuple[Activity, User]:
    teacher_user = User(
        id=99,
        user_uuid="user_teacher",
        username="teacher",
        first_name="Teacher",
        middle_name="",
        last_name="One",
        email="teacher@example.com",
        hashed_password="",
    )
    student = User(
        id=10,
        user_uuid="user_student",
        username="student",
        first_name="Student",
        middle_name="",
        last_name="One",
        email="student@example.com",
        hashed_password="",
    )
    course = Course(
        id=1,
        name="Course",
        description="",
        about="",
        learnings="",
        tags="",
        thumbnail_image="",
        public=True,
        open_to_contributors=False,
        course_uuid="course_bulk",
        creator_id=99,
    )
    chapter = Chapter(id=1, name="Chapter", course_id=course.id, creator_id=99)
    activity = Activity(
        id=1,
        name="Assignment",
        activity_type=ActivityTypeEnum.TYPE_ASSIGNMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_ASSIGNMENT_ANY,
        course_id=course.id,
        chapter_id=chapter.id,
        order=1,
        published=True,
        creator_id=99,
        activity_uuid="activity_bulk",
    )
    db_session.add(teacher_user)
    db_session.add(student)
    db_session.add(course)
    db_session.add(chapter)
    db_session.add(activity)
    db_session.flush()
    db_session.add(
        AssessmentPolicy(
            policy_uuid="policy_bulk",
            activity_id=activity.id,
            assessment_type=AssessmentType.ASSIGNMENT,
            grading_mode=AssessmentGradingMode.MANUAL,
            completion_rule=AssessmentCompletionRule.GRADED,
            due_at=datetime.now(UTC) - timedelta(days=1),
            settings_json={},
        )
    )
    db_session.commit()
    return activity, student


def test_deadline_extension_creates_override_and_recalculates_late(
    db_session: Session,
    teacher: PublicUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    activity, student = _seed_gradeable_activity(db_session)
    submitted_at = datetime.now(UTC)
    db_session.add(
        Submission(
            submission_uuid="submission_late",
            assessment_type=AssessmentType.ASSIGNMENT,
            activity_id=activity.id,
            user_id=student.id,
            status=SubmissionStatus.PENDING,
            attempt_number=1,
            answers_json={},
            grading_json={},
            is_late=True,
            submitted_at=submitted_at,
            created_at=submitted_at,
            updated_at=submitted_at,
        )
    )
    db_session.commit()
    monkeypatch.setattr(
        bulk_service,
        "PermissionChecker",
        lambda _session: Mock(require=Mock(return_value=None)),
    )
    monkeypatch.setattr(bulk_service, "publish_grading_event", Mock())

    action = bulk_service.create_deadline_extension_action(
        activity_id=activity.id,
        user_uuids=[student.user_uuid],
        new_due_at=submitted_at + timedelta(days=2),
        reason="Accommodation",
        current_user=teacher,
        db_session=db_session,
    )

    assert action.action_type == BulkActionType.EXTEND_DEADLINE
    assert action.status == BulkActionStatus.COMPLETED
    assert action.affected_count == 1
    override = db_session.exec(select(StudentPolicyOverride)).one()
    assert override.due_at_override is not None
    submission = db_session.exec(select(Submission)).one()
    assert submission.is_late is False


@pytest.mark.asyncio
async def test_batch_grade_reports_failures_per_item(
    db_session: Session,
    teacher: PublicUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    activity, student = _seed_gradeable_activity(db_session)
    now = datetime.now(UTC)
    db_session.add(
        Submission(
            submission_uuid="submission_valid",
            assessment_type=AssessmentType.ASSIGNMENT,
            activity_id=activity.id,
            user_id=student.id,
            status=SubmissionStatus.PENDING,
            attempt_number=1,
            answers_json={},
            grading_json={},
            submitted_at=now,
            created_at=now,
            updated_at=now,
        )
    )
    db_session.commit()
    monkeypatch.setattr(
        teacher_service,
        "PermissionChecker",
        lambda _session: Mock(
            check=Mock(return_value=True),
            require=Mock(return_value=None),
        ),
    )
    monkeypatch.setattr(teacher_service, "publish_grading_event", Mock())

    response = await teacher_service.batch_grade_submissions(
        BatchGradeRequest(
            grades=[
                BatchGradeItem(
                    submission_uuid="submission_valid",
                    final_score=87,
                    status="GRADED",
                ),
                BatchGradeItem(
                    submission_uuid="submission_missing",
                    final_score=92,
                    status="GRADED",
                ),
            ]
        ),
        current_user=teacher,
        db_session=db_session,
    )

    assert response.succeeded == 1
    assert response.failed == 1
    assert response.results[0].success is True
    assert response.results[1].success is False
    assert (
        db_session.exec(
            select(Submission.status).where(
                Submission.submission_uuid == "submission_valid"
            )
        ).one()
        == SubmissionStatus.GRADED
    )
