from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from src.db.courses.activities import (
    Activity,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
from src.db.model_registry import import_orm_models
from src.db.users import PublicUser
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


def _user(user_id: int) -> PublicUser:
    return PublicUser(
        id=user_id,
        user_uuid=f"user_{user_id}",
        username=f"user{user_id}",
        first_name="User",
        middle_name="",
        last_name=str(user_id),
        email=f"user{user_id}@example.com",
        avatar_image="",
        bio="",
        details={},
        profile={},
        theme="default",
        locale="en-US",
    )


def _seed_submission(db_session: Session) -> Submission:
    now = datetime.now(UTC)
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
        course_uuid="course_rbac",
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
        activity_uuid="activity_rbac",
    )
    submission = Submission(
        submission_uuid="submission_rbac",
        assessment_type=AssessmentType.ASSIGNMENT,
        activity_id=activity.id,
        user_id=10,
        status=SubmissionStatus.PENDING,
        attempt_number=1,
        answers_json={},
        grading_json={},
        submitted_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(course)
    db_session.add(chapter)
    db_session.add(activity)
    db_session.add(submission)
    db_session.commit()
    return submission


class DenyChecker:
    def __init__(self, _session: Session) -> None:
        pass

    def require(self, *_args: object, **_kwargs: object) -> None:
        raise HTTPException(status_code=403, detail="Forbidden")


@pytest.mark.asyncio
async def test_student_cannot_access_teacher_submission_view(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submission = _seed_submission(db_session)
    monkeypatch.setattr(teacher_service, "PermissionChecker", DenyChecker)

    with pytest.raises(HTTPException) as exc_info:
        await teacher_service.get_submission_for_teacher(
            submission_uuid=submission.submission_uuid,
            current_user=_user(10),
            db_session=db_session,
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_access_gradebook_submission_list(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _seed_submission(db_session)
    monkeypatch.setattr(teacher_service, "PermissionChecker", DenyChecker)

    with pytest.raises(HTTPException) as exc_info:
        await teacher_service.get_submissions_for_activity(
            activity_id=1,
            current_user=_user(10),
            db_session=db_session,
        )

    assert exc_info.value.status_code == 403
