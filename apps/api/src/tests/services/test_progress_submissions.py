from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.courses.activities import (
    Activity,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.blocks import Block, BlockTypeEnum
from src.db.courses.chapters import Chapter
from src.db.courses.code_challenges import (
    CodeSubmission,
)
from src.db.courses.code_challenges import (
    SubmissionStatus as CodeSubmissionStatus,
)
from src.db.courses.courses import Course
from src.db.courses.exams import AttemptStatusEnum, Exam, ExamAttempt
from src.db.courses.quiz import QuizAttempt
from src.db.grading.progress import (
    ActivityProgress,
    ActivityProgressState,
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
    CourseProgress,
)
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
from src.db.model_registry import import_orm_models
from src.services.progress import submissions as progress_submissions


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


def seed_activity(db_session: Session) -> Activity:
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
        course_uuid="course_progress",
        creator_id=99,
    )
    chapter = Chapter(
        id=1,
        name="Chapter",
        chapter_uuid="chapter_progress",
        course_id=course.id,
        creator_id=99,
    )
    activity = Activity(
        id=1,
        name="Assignment",
        activity_type=ActivityTypeEnum.TYPE_ASSIGNMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_ASSIGNMENT_ANY,
        content={},
        details={},
        published=True,
        chapter_id=chapter.id,
        course_id=course.id,
        creator_id=99,
        activity_uuid="activity_progress",
        creation_date=now,
        update_date=now,
    )
    db_session.add(course)
    db_session.add(chapter)
    db_session.add(activity)
    db_session.commit()
    return activity


def add_second_published_activity(db_session: Session) -> Activity:
    now = datetime.now(UTC)
    activity = Activity(
        id=2,
        name="Document",
        activity_type=ActivityTypeEnum.TYPE_DOCUMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_DOCUMENT_PDF,
        content={},
        details={},
        published=True,
        chapter_id=1,
        course_id=1,
        creator_id=99,
        activity_uuid="activity_progress_document",
        creation_date=now,
        update_date=now,
    )
    db_session.add(activity)
    db_session.commit()
    return activity


def add_gradeable_activity(
    db_session: Session,
    *,
    activity_id: int,
    name: str,
    activity_type: ActivityTypeEnum,
    activity_sub_type: ActivitySubTypeEnum,
) -> Activity:
    now = datetime.now(UTC)
    activity = Activity(
        id=activity_id,
        name=name,
        activity_type=activity_type,
        activity_sub_type=activity_sub_type,
        content={},
        details={},
        published=True,
        chapter_id=1,
        course_id=1,
        creator_id=99,
        activity_uuid=f"activity_{activity_id}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(activity)
    db_session.commit()
    return activity


def make_submission(
    activity: Activity,
    *,
    status: SubmissionStatus,
    score: float | None = None,
    user_id: int = 10,
    attempt_number: int = 1,
    submitted_at: datetime | None = None,
    is_late: bool = False,
) -> Submission:
    now = submitted_at or datetime.now(UTC)
    return Submission(
        submission_uuid=f"submission_{activity.id}_{user_id}_{attempt_number}_{status.value.lower()}",
        assessment_type=AssessmentType.ASSIGNMENT,
        activity_id=activity.id,
        user_id=user_id,
        status=status,
        attempt_number=attempt_number,
        is_late=is_late,
        answers_json={},
        grading_json={},
        final_score=score,
        started_at=now,
        submitted_at=now if status != SubmissionStatus.DRAFT else None,
        graded_at=now
        if status in {SubmissionStatus.GRADED, SubmissionStatus.PUBLISHED}
        else None,
        created_at=now,
        updated_at=now,
    )


def test_submission_write_projects_activity_and_course_progress(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    submission = make_submission(activity, status=SubmissionStatus.PENDING)

    progress_submissions.submit_activity(submission, db_session)

    policy = db_session.exec(select(AssessmentPolicy)).one()
    progress = db_session.exec(select(ActivityProgress)).one()
    course_progress = db_session.exec(select(CourseProgress)).one()

    assert submission.assessment_policy_id == policy.id
    assert progress.state == ActivityProgressState.NEEDS_GRADING
    assert progress.teacher_action_required is True
    assert progress.attempt_count == 1
    assert progress.latest_submission_id == submission.id
    assert course_progress.total_required_count == 1
    assert course_progress.needs_grading_count == 1


def test_publish_grade_recalculates_completion(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    submission = make_submission(
        activity,
        status=SubmissionStatus.PUBLISHED,
        score=85,
    )

    progress_submissions.publish_grade(submission, db_session)

    progress = db_session.exec(select(ActivityProgress)).one()
    course_progress = db_session.exec(select(CourseProgress)).one()

    assert progress.state == ActivityProgressState.PASSED
    assert progress.completed_at is not None
    assert progress.score == 85
    assert course_progress.completed_required_count == 1
    assert course_progress.progress_pct == 100


def test_course_progress_counts_unstarted_published_activities(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    add_second_published_activity(db_session)
    submission = make_submission(activity, status=SubmissionStatus.PENDING)

    progress_submissions.submit_activity(submission, db_session)

    progress_rows = db_session.exec(
        select(ActivityProgress).order_by(ActivityProgress.activity_id)
    ).all()
    course_progress = db_session.exec(select(CourseProgress)).one()

    assert [row.state for row in progress_rows] == [
        ActivityProgressState.NEEDS_GRADING,
        ActivityProgressState.NOT_STARTED,
    ]
    assert course_progress.total_required_count == 2
    assert course_progress.missing_required_count == 2
    assert course_progress.progress_pct == 0


def test_backfill_activity_progress_is_rerunnable(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    db_session.add(make_submission(activity, status=SubmissionStatus.PENDING))
    db_session.commit()

    first = progress_submissions.backfill_activity_progress(db_session)
    second = progress_submissions.backfill_activity_progress(db_session)

    progress_rows = db_session.exec(select(ActivityProgress)).all()
    policy_rows = db_session.exec(select(AssessmentPolicy)).all()

    assert first == {"activities": 1, "progress_rows_repaired": 1}
    assert second == {"activities": 1, "progress_rows_repaired": 1}
    assert len(progress_rows) == 1
    assert len(policy_rows) == 1
    assert progress_rows[0].state == ActivityProgressState.NEEDS_GRADING


def test_policy_resolution_per_activity_type(db_session: Session) -> None:
    seed_activity(db_session)
    add_gradeable_activity(
        db_session,
        activity_id=2,
        name="Exam",
        activity_type=ActivityTypeEnum.TYPE_EXAM,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_EXAM_STANDARD,
    )
    add_gradeable_activity(
        db_session,
        activity_id=3,
        name="Code",
        activity_type=ActivityTypeEnum.TYPE_CODE_CHALLENGE,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_CODE_GENERAL,
    )
    quiz = add_gradeable_activity(
        db_session,
        activity_id=4,
        name="Quiz Page",
        activity_type=ActivityTypeEnum.TYPE_DYNAMIC,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_DYNAMIC_PAGE,
    )
    now = datetime.now(UTC).isoformat()
    db_session.add(
        Block(
            id=1,
            course_id=1,
            chapter_id=1,
            activity_id=quiz.id,
            block_uuid="block_quiz",
            block_type=BlockTypeEnum.BLOCK_QUIZ,
            content={},
            creation_date=now,
            update_date=now,
        )
    )
    db_session.commit()

    progress_submissions.backfill_activity_progress(db_session)

    policies = {
        policy.activity_id: policy
        for policy in db_session.exec(select(AssessmentPolicy)).all()
    }

    assert policies[1].assessment_type == AssessmentType.ASSIGNMENT
    assert policies[1].grading_mode == AssessmentGradingMode.MANUAL
    assert policies[1].completion_rule == AssessmentCompletionRule.GRADED
    assert policies[2].assessment_type == AssessmentType.EXAM
    assert policies[2].grading_mode == AssessmentGradingMode.AUTO_THEN_MANUAL
    assert policies[2].completion_rule == AssessmentCompletionRule.PASSED
    assert policies[3].assessment_type == AssessmentType.CODE_CHALLENGE
    assert policies[3].grading_mode == AssessmentGradingMode.AUTO
    assert policies[4].assessment_type == AssessmentType.QUIZ


@pytest.mark.parametrize(
    ("status", "score", "expected_state", "teacher_action"),
    [
        (SubmissionStatus.DRAFT, None, ActivityProgressState.IN_PROGRESS, False),
        (SubmissionStatus.PENDING, None, ActivityProgressState.NEEDS_GRADING, True),
        (SubmissionStatus.RETURNED, None, ActivityProgressState.RETURNED, False),
        (SubmissionStatus.GRADED, None, ActivityProgressState.GRADED, False),
        (SubmissionStatus.PUBLISHED, 85, ActivityProgressState.PASSED, False),
        (SubmissionStatus.PUBLISHED, 40, ActivityProgressState.FAILED, False),
    ],
)
def test_submission_state_transitions_project_to_activity_progress(
    db_session: Session,
    status: SubmissionStatus,
    score: float | None,
    expected_state: ActivityProgressState,
    teacher_action: bool,
) -> None:
    activity = seed_activity(db_session)

    progress_submissions.submit_activity(
        make_submission(activity, status=status, score=score),
        db_session,
    )

    progress = db_session.exec(select(ActivityProgress)).one()

    assert progress.state == expected_state
    assert progress.teacher_action_required is teacher_action


def test_returned_assignment_can_be_resubmitted_for_teacher_action(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    first = make_submission(
        activity,
        status=SubmissionStatus.RETURNED,
        attempt_number=1,
        submitted_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    second = make_submission(
        activity,
        status=SubmissionStatus.PENDING,
        attempt_number=2,
        submitted_at=datetime(2026, 1, 2, tzinfo=UTC),
    )

    progress_submissions.return_submission(first, db_session)
    progress_submissions.submit_activity(second, db_session)

    progress = db_session.exec(select(ActivityProgress)).one()

    assert progress.state == ActivityProgressState.NEEDS_GRADING
    assert progress.status_reason is None
    assert progress.teacher_action_required is True
    assert progress.attempt_count == 2
    assert progress.latest_submission_id == second.id


def test_late_submission_flag_and_due_date_project_to_progress(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    due_at = datetime(2026, 1, 1, tzinfo=UTC)
    db_session.add(
        AssessmentPolicy(
            policy_uuid="policy_late",
            activity_id=activity.id,
            assessment_type=AssessmentType.ASSIGNMENT,
            grading_mode=AssessmentGradingMode.MANUAL,
            completion_rule=AssessmentCompletionRule.GRADED,
            passing_score=60,
            due_at=due_at,
            settings_json={},
        )
    )
    db_session.commit()

    progress_submissions.submit_activity(
        make_submission(
            activity,
            status=SubmissionStatus.PENDING,
            submitted_at=datetime(2026, 1, 2, tzinfo=UTC),
            is_late=True,
        ),
        db_session,
    )

    progress = db_session.exec(select(ActivityProgress)).one()

    assert progress.is_late is True
    assert progress.due_at is not None
    assert progress.due_at.replace(tzinfo=UTC) == due_at


def test_attempt_count_ignores_drafts_and_counts_submitted_attempts(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    db_session.add(
        AssessmentPolicy(
            policy_uuid="policy_attempts",
            activity_id=activity.id,
            assessment_type=AssessmentType.ASSIGNMENT,
            grading_mode=AssessmentGradingMode.MANUAL,
            completion_rule=AssessmentCompletionRule.GRADED,
            passing_score=60,
            max_attempts=2,
            settings_json={},
        )
    )
    db_session.commit()
    db_session.add(
        make_submission(activity, status=SubmissionStatus.DRAFT, attempt_number=1)
    )
    db_session.add(
        make_submission(activity, status=SubmissionStatus.PENDING, attempt_number=2)
    )
    db_session.add(
        make_submission(activity, status=SubmissionStatus.PENDING, attempt_number=3)
    )
    db_session.commit()

    progress = progress_submissions.recalculate_activity_progress(
        activity.id,
        10,
        db_session,
    )

    assert progress is not None
    assert progress.attempt_count == 2


def test_pass_fail_completion_rule_sets_course_certificate_eligibility(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    db_session.add(
        AssessmentPolicy(
            policy_uuid="policy_passed",
            activity_id=activity.id,
            assessment_type=AssessmentType.ASSIGNMENT,
            grading_mode=AssessmentGradingMode.MANUAL,
            completion_rule=AssessmentCompletionRule.PASSED,
            passing_score=70,
            settings_json={},
        )
    )
    db_session.commit()

    progress_submissions.publish_grade(
        make_submission(activity, status=SubmissionStatus.PUBLISHED, score=69),
        db_session,
    )
    failed_progress = db_session.exec(select(ActivityProgress)).one()
    failed_course_progress = db_session.exec(select(CourseProgress)).one()

    assert failed_progress.state == ActivityProgressState.FAILED
    assert failed_progress.completed_at is None
    assert failed_course_progress.certificate_eligible is False

    progress_submissions.publish_grade(
        make_submission(
            activity,
            status=SubmissionStatus.PUBLISHED,
            score=95,
            attempt_number=2,
            submitted_at=datetime.now(UTC),
        ),
        db_session,
    )
    passed_progress = db_session.exec(select(ActivityProgress)).one()
    passed_course_progress = db_session.exec(select(CourseProgress)).one()

    assert passed_progress.state == ActivityProgressState.PASSED
    assert passed_progress.completed_at is not None
    assert passed_course_progress.completed_required_count == 1
    assert passed_course_progress.certificate_eligible is True
    assert passed_course_progress.grade_average == 95


def test_quiz_attempt_sync_creates_canonical_submission_and_progress(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    now = datetime.now(UTC)
    attempt = QuizAttempt(
        user_id=10,
        activity_id=activity.id,
        attempt_uuid="quiz_attempt_one",
        attempt_number=1,
        start_ts=now,
        end_ts=now,
        score=82,
        max_score=100,
        answers={"q1": "a"},
        grading_result={"per_question": []},
        creation_date=now.isoformat(),
        update_date=now.isoformat(),
    )

    submission = progress_submissions.sync_quiz_attempt(attempt, db_session)

    progress = db_session.exec(select(ActivityProgress)).one()

    assert submission.assessment_type == AssessmentType.QUIZ
    assert submission.status == SubmissionStatus.GRADED
    assert submission.final_score == 82
    assert progress.state == ActivityProgressState.PASSED


def test_code_submission_sync_creates_canonical_submission_and_progress(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    now = datetime.now(UTC).isoformat()
    code_submission = CodeSubmission(
        submission_uuid="code_submission_one",
        activity_id=activity.id,
        user_id=10,
        language_id=71,
        language_name="Python",
        source_code="print('ok')",
        status=CodeSubmissionStatus.COMPLETED,
        score=100,
        passed_tests=2,
        total_tests=2,
        test_results={"tests": []},
        created_at=now,
        updated_at=now,
    )

    submission = progress_submissions.sync_code_challenge_submission(
        code_submission,
        db_session,
    )

    progress = db_session.exec(select(ActivityProgress)).one()

    assert submission.assessment_type == AssessmentType.CODE_CHALLENGE
    assert submission.final_score == 100
    assert progress.state == ActivityProgressState.PASSED


def test_backfill_preserves_existing_assignment_submission(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    submission = make_submission(activity, status=SubmissionStatus.PENDING)
    db_session.add(submission)
    db_session.commit()
    original_id = submission.id

    progress_submissions.backfill_activity_progress(db_session)

    submissions = db_session.exec(select(Submission)).all()
    progress = db_session.exec(select(ActivityProgress)).one()

    assert len(submissions) == 1
    assert submissions[0].id == original_id
    assert progress.latest_submission_id == original_id


def test_backfill_projects_legacy_exam_attempt_into_submission(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    activity.activity_type = ActivityTypeEnum.TYPE_EXAM
    activity.activity_sub_type = ActivitySubTypeEnum.SUBTYPE_EXAM_STANDARD
    exam = Exam(
        id=1,
        exam_uuid="exam_progress",
        title="Exam",
        description="",
        published=True,
        course_id=activity.course_id,
        chapter_id=activity.chapter_id,
        activity_id=activity.id,
        settings={
            "copy_paste_protection": True,
            "tab_switch_detection": True,
            "devtools_detection": False,
            "right_click_disable": True,
            "fullscreen_enforcement": False,
            "violation_threshold": 4,
        },
    )
    now = datetime.now(UTC).isoformat()
    attempt = ExamAttempt(
        id=1,
        attempt_uuid="attempt_progress",
        exam_id=exam.id,
        user_id=10,
        status=AttemptStatusEnum.SUBMITTED,
        score=8,
        max_score=10,
        answers={"1": 0},
        question_order=[1],
        violations=[{"type": "TAB_SWITCH", "timestamp": now}],
        started_at=now,
        submitted_at=now,
        creation_date=now,
        update_date=now,
    )
    db_session.add(activity)
    db_session.add(exam)
    db_session.add(attempt)
    db_session.commit()

    progress_submissions.backfill_activity_progress(db_session)

    submission = db_session.exec(select(Submission)).one()
    policy = db_session.exec(select(AssessmentPolicy)).one()
    progress = db_session.exec(select(ActivityProgress)).one()

    assert submission.submission_uuid == "submission_attempt_progress"
    assert submission.assessment_type == AssessmentType.EXAM
    assert submission.assessment_policy_id == policy.id
    assert submission.status == SubmissionStatus.GRADED
    assert submission.final_score == 80
    assert submission.answers_json["answers"] == {"1": 0}
    assert submission.answers_json["violations"][0]["type"] == "TAB_SWITCH"
    assert policy.anti_cheat_json == {
        "copy_paste_protection": True,
        "tab_switch_detection": True,
        "devtools_detection": False,
        "right_click_disable": True,
        "fullscreen_enforcement": False,
        "violation_threshold": 4,
    }
    assert progress.latest_submission_id == submission.id
    assert progress.state == ActivityProgressState.PASSED
