from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session

from src.app.factory import create_app
from src.auth.users import get_public_user
from src.db.grading.gradebook import (
    ActivityProgressCell,
    CourseGradebookResponse,
    GradebookActivity,
    GradebookStudent,
    GradebookSummary,
    TeacherAction,
)
from src.db.grading.progress import ActivityProgressState
from src.db.users import PublicUser
from src.infra.db.session import get_db_session


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


@pytest.fixture
def app(teacher: PublicUser):
    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: MagicMock(spec=Session)
    app.dependency_overrides[get_public_user] = lambda: teacher
    yield app
    app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_gradebook_endpoint_returns_course_gradebook_contract(
    app,
    monkeypatch: pytest.MonkeyPatch,
    teacher: PublicUser,
) -> None:
    async def fake_gradebook(**kwargs) -> CourseGradebookResponse:
        assert kwargs["course_uuid"] == "course_gradebook"
        assert kwargs["current_user"] == teacher
        return CourseGradebookResponse(
            course_uuid="course_gradebook",
            course_id=1,
            course_name="Course",
            students=[
                GradebookStudent(
                    id=10,
                    user_uuid="user_student",
                    username="student",
                    first_name="Student",
                    last_name="One",
                    email="student@example.com",
                )
            ],
            activities=[
                GradebookActivity(
                    id=1,
                    activity_uuid="activity_assignment",
                    name="Assignment",
                    activity_type="TYPE_ASSIGNMENT",
                    assessment_type="ASSIGNMENT",
                    order=1,
                )
            ],
            cells=[
                ActivityProgressCell(
                    user_id=10,
                    activity_id=1,
                    state=ActivityProgressState.NEEDS_GRADING,
                    teacher_action_required=True,
                    attempt_count=1,
                    latest_submission_uuid="submission_one",
                )
            ],
            teacher_actions=[
                TeacherAction(
                    action_type="GRADE_SUBMISSION",
                    user_id=10,
                    activity_id=1,
                    submission_uuid="submission_one",
                    student_name="Student One",
                    activity_name="Assignment",
                )
            ],
            summary=GradebookSummary(
                student_count=1,
                activity_count=1,
                needs_grading_count=1,
                overdue_count=0,
                not_started_count=0,
                completed_count=0,
            ),
        )

    monkeypatch.setattr(
        "src.routers.grading.teacher.get_course_gradebook",
        fake_gradebook,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            "/api/v1/grading/courses/course_gradebook/gradebook"
        )

    assert response.status_code == 200
    body = response.json()
    assert body["course_uuid"] == "course_gradebook"
    assert body["cells"][0]["state"] == "NEEDS_GRADING"
    assert body["teacher_actions"][0]["submission_uuid"] == "submission_one"
    assert body["summary"]["needs_grading_count"] == 1


@pytest.mark.asyncio
async def test_gradebook_endpoint_requires_authenticated_teacher() -> None:
    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: MagicMock(spec=Session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get(
                "/api/v1/grading/courses/course_gradebook/gradebook"
            )
    finally:
        app.dependency_overrides = {}

    assert response.status_code == 401
