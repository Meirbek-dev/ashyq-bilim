import logging
from datetime import datetime

from fastapi import HTTPException, Request, UploadFile
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import (
    Activity,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.assignments import (
    Assignment,
    AssignmentCreate,
    AssignmentCreateWithActivity,
    AssignmentRead,
    AssignmentTask,
    AssignmentTaskCreate,
    AssignmentTaskRead,
    AssignmentTaskSubmission,
    AssignmentTaskSubmissionCreate,
    AssignmentTaskSubmissionRead,
    AssignmentTaskSubmissionUpdate,
    AssignmentTaskUpdate,
    AssignmentUpdate,
    AssignmentUserSubmission,
    AssignmentUserSubmissionCreate,
    AssignmentUserSubmissionRead,
    AssignmentUserSubmissionStatus,
)
from src.db.courses.chapter_activities import ChapterActivity
from src.db.courses.courses import Course
from src.db.trail_runs import TrailRun
from src.db.trail_steps import TrailStep
from src.db.users import AnonymousUser, PublicUser, User
from src.security.rbac import PermissionChecker
from src.services.courses.activities.uploads.sub_file import upload_submission_file
from src.services.courses.activities.uploads.tasks_ref_files import (
    upload_reference_file,
)
from src.services.courses.certifications import (
    check_course_completion_and_create_certificate,
)
from src.services.trail.trail import check_trail_presence

logger = logging.getLogger(__name__)

## > Assignments CRUD


async def create_assignment(
    request: Request,
    assignment_object: AssignmentCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentRead:
    # Check if platform exists
    statement = select(Course).where(Course.id == assignment_object.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:create",
        resource_owner_id=course.creator_id,
    )

    # Create Assignment
    assignment_data = assignment_object.model_dump(exclude_unset=True)
    assignment = Assignment(**assignment_data)

    assignment.assignment_uuid = f"assignment_{ULID()}"
    assignment.creation_date = datetime.now().isoformat()
    assignment.update_date = datetime.now().isoformat()

    # Insert Assignment in DB
    db_session.add(assignment)
    db_session.commit()
    db_session.refresh(assignment)

    # return assignment read
    return AssignmentRead.model_validate(assignment)


async def read_assignment(
    request: Request,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentRead:
    # Check if assignment exists
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # return assignment read
    return AssignmentRead.model_validate(assignment)


async def read_assignment_from_activity_uuid(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentRead:
    # Check if activity exists
    statement = select(Activity).where(Activity.activity_uuid == activity_uuid)
    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(
            status_code=404,
            detail="Activity not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == activity.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.activity_id == activity.id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # return assignment read
    return AssignmentRead.model_validate(assignment)


async def update_assignment(
    request: Request,
    assignment_uuid: str,
    assignment_object: AssignmentUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentRead:
    # Check if assignment exists
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    # Update only the fields that were passed in using model_dump with exclude_unset
    update_data = assignment_object.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(assignment, field, value)

    assignment.update_date = datetime.now().isoformat()

    # Insert Assignment in DB
    db_session.add(assignment)
    db_session.commit()
    db_session.refresh(assignment)

    # return assignment read
    return AssignmentRead.model_validate(assignment)


async def delete_assignment(
    request: Request,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    # Check if assignment exists
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:delete",
        resource_owner_id=course.creator_id,
    )

    # Delete Assignment
    db_session.delete(assignment)
    db_session.commit()

    return {"message": "Assignment deleted"}


async def delete_assignment_from_activity_uuid(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    # Check if activity exists
    statement = select(Activity).where(Activity.activity_uuid == activity_uuid)

    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(
            status_code=404,
            detail="Activity not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == activity.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.activity_id == activity.id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:delete",
        resource_owner_id=course.creator_id,
    )

    # Delete Assignment
    db_session.delete(assignment)

    db_session.commit()

    return {"message": "Assignment deleted"}


## > Assignments Tasks CRUD


async def create_assignment_task(
    request: Request,
    assignment_uuid: str,
    assignment_task_object: AssignmentTaskCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentTaskRead:
    # Check if assignment exists
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:create",
        resource_owner_id=course.creator_id,
    )

    # Create Assignment Task
    task_data = assignment_task_object.model_dump(exclude_unset=True)
    assignment_task = AssignmentTask(**task_data)

    assignment_task.assignment_task_uuid = f"assignmenttask_{ULID()}"
    assignment_task.creation_date = datetime.now().isoformat()
    assignment_task.update_date = datetime.now().isoformat()
    assignment_task.chapter_id = assignment.chapter_id
    assignment_task.activity_id = assignment.activity_id
    assignment_task.assignment_id = assignment.id
    assignment_task.course_id = assignment.course_id

    # Insert Assignment Task in DB
    db_session.add(assignment_task)
    db_session.commit()
    db_session.refresh(assignment_task)

    # return assignment task read
    return AssignmentTaskRead.model_validate(assignment_task)


async def read_assignment_tasks(
    request: Request,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[AssignmentTaskRead]:
    # Find assignment
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Find assignments tasks for an assignment
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_id == assignment.id
    )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # return assignment tasks read
    return [
        AssignmentTaskRead.model_validate(assignment_task)
        for assignment_task in db_session.exec(statement).all()
    ]


async def read_assignment_task(
    request: Request,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentTaskRead:
    # Find assignment
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_task_uuid == assignment_task_uuid
    )
    assignmenttask = db_session.exec(statement).first()

    if not assignmenttask:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.id == assignmenttask.assignment_id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # return assignment task read
    return AssignmentTaskRead.model_validate(assignmenttask)


async def put_assignment_task_reference_file(
    request: Request,
    db_session: Session,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    reference_file: UploadFile | None = None,
) -> AssignmentTaskRead:
    # Check if assignment task exists
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_task_uuid == assignment_task_uuid
    )
    assignment_task = db_session.exec(statement).first()

    if not assignment_task:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.id == assignment_task.assignment_id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check for activity
    statement = select(Activity).where(Activity.id == assignment.activity_id)
    activity = db_session.exec(statement).first()

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    # Upload reference file
    if reference_file and reference_file.filename and activity:
        name_in_disk = (
            f"{assignment_task_uuid}{ULID()}.{reference_file.filename.split('.')[-1]}"
        )
        await upload_reference_file(
            reference_file,
            name_in_disk,
            activity.activity_uuid,
            course.course_uuid,
            assignment.assignment_uuid,
            assignment_task_uuid,
        )
        # Update reference file
        assignment_task.reference_file = name_in_disk

    assignment_task.update_date = datetime.now().isoformat()

    # Insert Assignment Task in DB
    db_session.add(assignment_task)
    db_session.commit()
    db_session.refresh(assignment_task)

    # return assignment task read
    return AssignmentTaskRead.model_validate(assignment_task)


async def put_assignment_task_submission_file(
    request: Request,
    db_session: Session,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    sub_file: UploadFile | None = None,
) -> dict[str, str]:
    # Check if assignment task exists
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_task_uuid == assignment_task_uuid
    )
    assignment_task = db_session.exec(statement).first()

    if not assignment_task:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.id == assignment_task.assignment_id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check for activity
    statement = select(Activity).where(Activity.id == assignment.activity_id)
    activity = db_session.exec(statement).first()

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check - only need read permission to submit files
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # Check if user is enrolled in the course
    can_view = checker.check(current_user.id, "course:read")
    if not can_view:
        raise HTTPException(
            status_code=403,
            detail="You must be enrolled in this course to submit files",
        )

    # Upload submission file
    if sub_file and sub_file.filename and activity:
        name_in_disk = f"{assignment_task_uuid}_sub_{current_user.email}_{ULID()}.{sub_file.filename.split('.')[-1]}"
        await upload_submission_file(
            sub_file,
            name_in_disk,
            activity.activity_uuid,
            course.course_uuid,
            assignment.assignment_uuid,
            assignment_task_uuid,
        )

        return {"file_uuid": name_in_disk}

    return {"file_uuid": ""}


async def update_assignment_task(
    request: Request,
    assignment_task_uuid: str,
    assignment_task_object: AssignmentTaskUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentTaskRead:
    # Check if assignment task exists
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_task_uuid == assignment_task_uuid
    )
    assignment_task = db_session.exec(statement).first()

    if not assignment_task:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.id == assignment_task.assignment_id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    # Update only the fields that were passed in using model_dump with exclude_unset
    update_data = assignment_task_object.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(assignment_task, field, value)

    assignment_task.update_date = datetime.now().isoformat()

    # Insert Assignment Task in DB
    db_session.add(assignment_task)
    db_session.commit()
    db_session.refresh(assignment_task)

    # return assignment task read
    return AssignmentTaskRead.model_validate(assignment_task)


async def delete_assignment_task(
    request: Request,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    # Check if assignment task exists
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_task_uuid == assignment_task_uuid
    )
    assignment_task = db_session.exec(statement).first()

    if not assignment_task:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.id == assignment_task.assignment_id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:delete",
        resource_owner_id=course.creator_id,
    )

    # Delete Assignment Task
    db_session.delete(assignment_task)
    db_session.commit()

    return {"message": "Assignment Task deleted"}


## > Assignments Tasks Submissions CRUD


async def handle_assignment_task_submission(
    request: Request,
    assignment_task_uuid: str,
    assignment_task_submission_object: AssignmentTaskSubmissionUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentTaskSubmissionRead:
    assignment_task_submission_uuid = (
        assignment_task_submission_object.assignment_task_submission_uuid
    )
    # Check if assignment task exists
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_task_uuid == assignment_task_uuid
    )
    assignment_task = db_session.exec(statement).first()

    if not assignment_task:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.id == assignment_task.assignment_id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # SECURITY: Check if user has instructor/admin permissions for grading
    checker = PermissionChecker(db_session)
    is_instructor = checker.check(
        current_user.id,
        "course:update",
        resource_owner_id=course.creator_id,
    )

    # For regular users, ensure they can only submit their own work
    if not is_instructor:
        # Check if user is enrolled in the course
        can_view = checker.check(current_user.id, "course:read")
        if not can_view:
            raise HTTPException(
                status_code=403,
                detail="You must be enrolled in this course to submit assignments",
            )

        # SECURITY: Regular users cannot update grades - only check if actual values are being set
        if (
            assignment_task_submission_object.grade is not None
            and assignment_task_submission_object.grade != 0
        ) or (
            assignment_task_submission_object.task_submission_grade_feedback is not None
            and assignment_task_submission_object.task_submission_grade_feedback != ""
        ):
            raise HTTPException(
                status_code=403, detail="You do not have permission to update grades"
            )

        # Only need read permission for submissions
        checker.require(
            current_user.id,
            "assignment:read",
            is_assigned=True,
        )
    else:
        # SECURITY: Instructors/admins need update permission to grade
        checker.require(
            current_user.id,
            "assignment:update",
            resource_owner_id=course.creator_id,
        )

    # Try to find existing submission by user_id and assignment_task_id first (for save progress functionality)
    statement = select(AssignmentTaskSubmission).where(
        AssignmentTaskSubmission.assignment_task_id == assignment_task.id,
        AssignmentTaskSubmission.user_id == current_user.id,
    )
    assignment_task_submission = db_session.exec(statement).first()

    # If no submission found by user+task, try to find by UUID if provided (for specific submission updates)
    if not assignment_task_submission and assignment_task_submission_uuid:
        statement = select(AssignmentTaskSubmission).where(
            AssignmentTaskSubmission.assignment_task_submission_uuid
            == assignment_task_submission_uuid
        )
        assignment_task_submission = db_session.exec(statement).first()

    # If submission exists, update it
    if assignment_task_submission:
        # SECURITY: For regular users, ensure they can only update their own submissions
        if not is_instructor and assignment_task_submission.user_id != current_user.id:
            raise HTTPException(
                status_code=403, detail="You can only update your own submissions"
            )

        # Update only the fields that were passed in using model_dump with exclude_unset
        update_data = assignment_task_submission_object.model_dump(exclude_unset=True)

        # Exclude immutable fields that shouldn't be updated
        immutable_fields = {"assignment_task_submission_uuid"}

        for field, value in update_data.items():
            if field not in immutable_fields and value is not None:
                setattr(assignment_task_submission, field, value)

        assignment_task_submission.update_date = datetime.now().isoformat()

        # Insert Assignment Task Submission in DB
        db_session.add(assignment_task_submission)
        db_session.commit()
        db_session.refresh(assignment_task_submission)

    else:
        # Create new Task submission
        current_time = datetime.now().isoformat()

        model_data = assignment_task_submission_object.model_dump(exclude_unset=True)

        assignment_task_submission = AssignmentTaskSubmission(
            assignment_task_submission_uuid=assignment_task_submission_uuid
            or f"assignmenttasksubmission_{ULID()}",
            task_submission=model_data.get("task_submission", ""),
            grade=0,  # Always start with 0 for new submissions
            task_submission_grade_feedback="",  # Start with empty feedback
            assignment_task_id=int(assignment_task.id),
            assignment_type=assignment_task.assignment_type,
            activity_id=assignment.activity_id,
            course_id=assignment.course_id,
            chapter_id=assignment.chapter_id,
            user_id=current_user.id,
            creation_date=current_time,
            update_date=current_time,
        )

        # Insert Assignment Task Submission in DB
        db_session.add(assignment_task_submission)
        db_session.commit()
        db_session.refresh(assignment_task_submission)

    # return assignment task submission read
    return AssignmentTaskSubmissionRead.model_validate(assignment_task_submission)


async def read_user_assignment_task_submissions(
    request: Request,
    assignment_task_uuid: str,
    user_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentTaskSubmissionRead | None:
    # Check if assignment task exists
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_task_uuid == assignment_task_uuid
    )
    assignment_task = db_session.exec(statement).first()

    if not assignment_task:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.id == assignment_task.assignment_id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # Check if assignment task submission exists
    statement = select(AssignmentTaskSubmission).where(
        AssignmentTaskSubmission.assignment_task_id == assignment_task.id,
        AssignmentTaskSubmission.user_id == user_id,
    )
    assignment_task_submission = db_session.exec(statement).first()

    if not assignment_task_submission:
        return None

    # return assignment task submission read
    return AssignmentTaskSubmissionRead.model_validate(assignment_task_submission)


async def read_user_assignment_task_submissions_me(
    request: Request,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    # Check if assignment task exists
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_task_uuid == assignment_task_uuid
    )
    assignment_task = db_session.exec(statement).first()

    if not assignment_task:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.id == assignment_task.assignment_id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # Check if assignment task submission exists
    statement = select(AssignmentTaskSubmission).where(
        AssignmentTaskSubmission.assignment_task_id == assignment_task.id,
        AssignmentTaskSubmission.user_id == current_user.id,
    )
    assignment_task_submission = db_session.exec(statement).first()

    if not assignment_task_submission:
        # Return None instead of raising an error for cases where no submission exists yet
        return None

    # return assignment task submission read
    return AssignmentTaskSubmissionRead.model_validate(assignment_task_submission)


async def read_assignment_task_submissions(
    request: Request,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[AssignmentTaskSubmissionRead]:
    # Check if assignment task exists
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_task_uuid == assignment_task_uuid
    )
    assignment_task = db_session.exec(statement).first()

    if not assignment_task:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.id == assignment_task.assignment_id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        resource_owner_id=course.creator_id,
    )

    # return assignment task submissions list
    statement = select(AssignmentTaskSubmission).where(
        AssignmentTaskSubmission.assignment_task_id == assignment_task.id
    )
    submissions = db_session.exec(statement).all()

    return [AssignmentTaskSubmissionRead.model_validate(item) for item in submissions]


async def update_assignment_task_submission(
    request: Request,
    assignment_task_submission_uuid: str,
    assignment_task_submission_object: AssignmentTaskSubmissionCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentTaskSubmissionRead:
    # Check if assignment task submission exists
    statement = select(AssignmentTaskSubmission).where(
        AssignmentTaskSubmission.assignment_task_submission_uuid
        == assignment_task_submission_uuid
    )
    assignment_task_submission = db_session.exec(statement).first()

    if not assignment_task_submission:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task Submission not found",
        )

    # Check if assignment task exists
    statement = select(AssignmentTask).where(
        AssignmentTask.id == assignment_task_submission.assignment_task_id
    )
    assignment_task = db_session.exec(statement).first()

    if not assignment_task:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.id == assignment_task.assignment_id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # Update only the fields that were passed in using model_dump with exclude_unset
    update_data = assignment_task_submission_object.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        # Validate grade range strictly (0-100)
        if field == "grade" and value is not None:
            try:
                val = int(value)
            except Exception:
                raise HTTPException(
                    status_code=400, detail="Grade must be an integer between 0 and 100"
                )
            if val < 0 or val > 100:
                raise HTTPException(
                    status_code=400, detail=f"Grade {val} is out of range (0-100)"
                )
            setattr(assignment_task_submission, field, val)
            continue

        # Validate grade range strictly (0-100)
        if field == "grade" and value is not None:
            try:
                val = int(value)
            except Exception:
                raise HTTPException(
                    status_code=400, detail="Grade must be an integer between 0 and 100"
                )
            if val < 0 or val > 100:
                raise HTTPException(
                    status_code=400, detail=f"Grade {val} is out of range (0-100)"
                )
            setattr(assignment_task_submission, field, val)
            continue

        setattr(assignment_task_submission, field, value)

    assignment_task_submission.update_date = datetime.now().isoformat()

    # Insert Assignment Task Submission in DB
    db_session.add(assignment_task_submission)
    db_session.commit()
    db_session.refresh(assignment_task_submission)

    # return assignment task submission read
    return AssignmentTaskSubmissionRead.model_validate(assignment_task_submission)


async def delete_assignment_task_submission(
    request: Request,
    assignment_task_submission_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    # Check if assignment task submission exists
    statement = select(AssignmentTaskSubmission).where(
        AssignmentTaskSubmission.assignment_task_submission_uuid
        == assignment_task_submission_uuid
    )
    assignment_task_submission = db_session.exec(statement).first()

    if not assignment_task_submission:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task Submission not found",
        )

    # Check if assignment task exists
    statement = select(AssignmentTask).where(
        AssignmentTask.id == assignment_task_submission.assignment_task_id
    )
    assignment_task = db_session.exec(statement).first()

    if not assignment_task:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.id == assignment_task.assignment_id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:delete",
        resource_owner_id=course.creator_id,
    )

    # Delete Assignment Task Submission
    db_session.delete(assignment_task_submission)
    db_session.commit()

    return {"message": "Assignment Task Submission deleted"}


## > Assignments Submissions CRUD


async def create_assignment_submission(
    request: Request,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentUserSubmissionRead:
    # Check if assignment exists
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if the submission has already been made
    statement = select(AssignmentUserSubmission).where(
        AssignmentUserSubmission.assignment_id == assignment.id,
        AssignmentUserSubmission.user_id == current_user.id,
    )

    assignment_user_submission = db_session.exec(statement).first()

    if assignment_user_submission:
        raise HTTPException(
            status_code=400,
            detail="Assignment User Submission already exists",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # Create Assignment User Submission
    assignment_user_submission = AssignmentUserSubmission(
        user_id=current_user.id,
        assignment_id=assignment.id,
        grade=0,
        assignmentusersubmission_uuid=f"assignmentusersubmission_{ULID()}",
        submission_status=AssignmentUserSubmissionStatus.SUBMITTED,
        creation_date=datetime.now().isoformat(),
        update_date=datetime.now().isoformat(),
        submitted_at=datetime.now().isoformat(),
    )

    # Insert Assignment User Submission in DB
    db_session.add(assignment_user_submission)
    db_session.commit()

    # User
    statement = select(User).where(User.id == current_user.id)
    user = db_session.exec(statement).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    # Activity
    statement = select(Activity).where(Activity.id == assignment.activity_id)
    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(
            status_code=404,
            detail="Activity not found",
        )

    # Add TrailStep
    trail = await check_trail_presence(
        user_id=user.id,
        request=request,
        user=user,
        db_session=db_session,
    )

    statement = select(TrailRun).where(
        TrailRun.trail_id == trail.id,
        TrailRun.course_id == course.id,
        TrailRun.user_id == user.id,
    )
    trailrun = db_session.exec(statement).first()

    if not trailrun:
        trailrun = TrailRun(
            trail_id=trail.id if trail.id is not None else 0,
            course_id=course.id if course.id is not None else 0,
            user_id=user.id,
            creation_date=datetime.now().isoformat(),
            update_date=datetime.now().isoformat(),
        )
        db_session.add(trailrun)
        db_session.commit()
        db_session.refresh(trailrun)

    statement = select(TrailStep).where(
        TrailStep.trailrun_id == trailrun.id,
        TrailStep.activity_id == activity.id,
        TrailStep.user_id == user.id,
    )
    trailstep = db_session.exec(statement).first()

    if not trailstep:
        trailstep = TrailStep(
            trailrun_id=trailrun.id if trailrun.id is not None else 0,
            activity_id=activity.id if activity.id is not None else 0,
            course_id=course.id if course.id is not None else 0,
            trail_id=trail.id if trail.id is not None else 0,
            complete=True,
            teacher_verified=False,
            grade=0,
            user_id=user.id,
            creation_date=datetime.now().isoformat(),
            update_date=datetime.now().isoformat(),
        )
        db_session.add(trailstep)
        db_session.commit()
        db_session.refresh(trailstep)

    # Check if all activities in the course are completed and create certificate if so
    if course and course.id and user and user.id:
        await check_course_completion_and_create_certificate(
            request, user.id, course.id, db_session
        )

    # return assignment user submission read
    return AssignmentUserSubmissionRead.model_validate(assignment_user_submission)


async def read_assignment_submissions(
    request: Request,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[AssignmentUserSubmissionRead]:
    # Find assignment
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Find assignments tasks for an assignment
    statement = select(AssignmentUserSubmission).where(
        AssignmentUserSubmission.assignment_id == assignment.id
    )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        resource_owner_id=course.creator_id,
    )

    # return assignment tasks read
    return [
        AssignmentUserSubmissionRead.model_validate(assignment_user_submission)
        for assignment_user_submission in db_session.exec(statement).all()
    ]


async def read_user_assignment_submissions(
    request: Request,
    assignment_uuid: str,
    user_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[AssignmentUserSubmissionRead]:
    # Find assignment
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()
    logger.debug(f"Fetching submissions for assignment UUID: {assignment_uuid}")
    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Find assignments tasks for an assignment
    statement = select(AssignmentUserSubmission).where(
        AssignmentUserSubmission.assignment_id == assignment.id,
        AssignmentUserSubmission.user_id == user_id,
    )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # return assignment tasks read
    return [
        AssignmentUserSubmissionRead.model_validate(assignment_user_submission)
        for assignment_user_submission in db_session.exec(statement).all()
    ]


async def read_user_assignment_submissions_me(
    request: Request,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[AssignmentUserSubmissionRead]:
    return await read_user_assignment_submissions(
        request,
        assignment_uuid,
        current_user.id,
        current_user,
        db_session,
    )


async def update_assignment_submission(
    request: Request,
    user_id: int,
    assignment_user_submission_object: AssignmentUserSubmissionCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentUserSubmissionRead:
    # Check if assignment user submission exists
    statement = select(AssignmentUserSubmission).where(
        AssignmentUserSubmission.user_id == user_id
    )
    assignment_user_submission = db_session.exec(statement).first()

    if not assignment_user_submission:
        raise HTTPException(
            status_code=404,
            detail="Assignment User Submission not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(
        Assignment.id == assignment_user_submission.assignment_id
    )
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # Update only the fields that were passed in using model_dump with exclude_unset
    update_data = assignment_user_submission_object.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        # Validate grade range strictly (0-100)
        if field == "grade" and value is not None:
            try:
                val = int(value)
            except Exception:
                raise HTTPException(
                    status_code=400, detail="Grade must be an integer between 0 and 100"
                )
            if val < 0 or val > 100:
                raise HTTPException(
                    status_code=400, detail=f"Grade {val} is out of range (0-100)"
                )
            setattr(assignment_user_submission, field, val)
            continue

        setattr(assignment_user_submission, field, value)

    assignment_user_submission.update_date = datetime.now().isoformat()

    # Insert Assignment User Submission in DB
    db_session.add(assignment_user_submission)
    db_session.commit()
    db_session.refresh(assignment_user_submission)

    # return assignment user submission read
    return AssignmentUserSubmissionRead.model_validate(assignment_user_submission)


async def delete_assignment_submission(
    request: Request,
    user_id: int,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    # Check if assignment exists
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if assignment user submission exists
    statement = select(AssignmentUserSubmission).where(
        AssignmentUserSubmission.user_id == user_id,
        AssignmentUserSubmission.assignment_id == assignment.id,
    )
    assignment_user_submission = db_session.exec(statement).first()

    if not assignment_user_submission:
        raise HTTPException(
            status_code=404,
            detail="Assignment User Submission not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:delete",
        resource_owner_id=course.creator_id,
    )

    # Delete Assignment User Submission
    db_session.delete(assignment_user_submission)
    db_session.commit()

    return {"message": "Assignment User Submission deleted"}


## > Assignments Submissions Grading
async def grade_assignment_submission(
    request: Request,
    user_id: int,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    # SECURITY: This function should only be accessible by course owners or instructors
    # Check if assignment exists
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # SECURITY: Require course ownership or instructor role for grading
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:grade",
        resource_owner_id=course.creator_id,
    )

    # Check if assignment user submission exists
    statement = select(AssignmentUserSubmission).where(
        AssignmentUserSubmission.user_id == user_id,
        AssignmentUserSubmission.assignment_id == assignment.id,
    )
    assignment_user_submission = db_session.exec(statement).first()

    if not assignment_user_submission:
        raise HTTPException(
            status_code=404,
            detail="Assignment User Submission not found",
        )

    # Calculate final grade as the rounded average of all assignment tasks (scores must be 0-100)
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_id == assignment.id
    )
    assignment_tasks = db_session.exec(statement).all()

    if not assignment_tasks:
        raise HTTPException(status_code=400, detail="Assignment has no tasks to grade")

    # Batch-fetch all task submissions for this user in one query
    task_ids = [task.id for task in assignment_tasks]
    submissions_map: dict[int, AssignmentTaskSubmission] = {}
    if task_ids:
        all_subs = db_session.exec(
            select(AssignmentTaskSubmission).where(
                AssignmentTaskSubmission.assignment_task_id.in_(task_ids),
                AssignmentTaskSubmission.user_id == user_id,
            )
        ).all()
        submissions_map = {s.assignment_task_id: s for s in all_subs}

    total = 0
    for task in assignment_tasks:
        submission = submissions_map.get(task.id)
        task_grade = 0
        if submission:
            # Validate range
            try:
                task_grade = int(submission.grade)
            except Exception:
                raise HTTPException(
                    status_code=400, detail=f"Invalid grade value for task {task.id}"
                )
            if task_grade < 0 or task_grade > 100:
                raise HTTPException(
                    status_code=400,
                    detail=f"Task {task.id} grade {task_grade} is out of range (0-100)",
                )
        total += task_grade

    average = total / len(assignment_tasks)
    rounded = round(average)

    # Update the assignment user submission with the final rounded average
    assignment_user_submission.grade = rounded

    # Insert Assignment User Submission in DB
    db_session.add(assignment_user_submission)
    db_session.commit()
    db_session.refresh(assignment_user_submission)

    # Change the status of the submission
    assignment_user_submission.submission_status = AssignmentUserSubmissionStatus.GRADED
    assignment_user_submission.graded_at = datetime.now().isoformat()
    assignment_user_submission.update_date = datetime.now().isoformat()

    # Insert Assignment User Submission in DB
    db_session.add(assignment_user_submission)
    db_session.commit()
    db_session.refresh(assignment_user_submission)

    # return OK
    return {"message": "Задание оценено на " + str(rounded) + " баллов"}


async def get_grade_assignment_submission(
    request: Request,
    user_id: int,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, int | str]:
    # Check if assignment exists
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if assignment user submission exists
    statement = select(AssignmentUserSubmission).where(
        AssignmentUserSubmission.user_id == user_id,
        AssignmentUserSubmission.assignment_id == assignment.id,
    )
    assignment_user_submission = db_session.exec(statement).first()

    if not assignment_user_submission:
        raise HTTPException(
            status_code=404,
            detail="Assignment User Submission not found",
        )

    # Determine number of tasks and normalize max grade to 100 (final grade is 0-100)
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_id == assignment.id
    )
    assignment_tasks = db_session.exec(statement).all()

    max_grade = 100 if assignment_tasks else 0

    # return the grade
    return {
        "grade": int(assignment_user_submission.grade),
        "max_grade": max_grade,
        "grading_type": assignment.grading_type,
    }


async def mark_activity_as_done_for_user(
    request: Request,
    user_id: int,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    # SECURITY: This function should only be accessible by course owners or instructors
    # Get Assignment
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if activity exists
    statement = select(Activity).where(Activity.id == assignment.activity_id)
    activity = db_session.exec(statement).first()

    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # SECURITY: Require course ownership or instructor role for marking activities as done
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    if not activity:
        raise HTTPException(
            status_code=404,
            detail="Activity not found",
        )

    # Check if user exists
    statement = select(User).where(User.id == user_id)
    user = db_session.exec(statement).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    # Check if user is enrolled in the course
    trailsteps = select(TrailStep).where(
        TrailStep.activity_id == activity.id,
        TrailStep.user_id == user_id,
    )
    trailstep = db_session.exec(trailsteps).first()

    if not trailstep:
        raise HTTPException(
            status_code=404,
            detail="User not enrolled in the course",
        )

    # Mark activity as done
    trailstep.complete = True
    trailstep.update_date = datetime.now().isoformat()

    # Insert TrailStep in DB
    db_session.add(trailstep)
    db_session.commit()
    db_session.refresh(trailstep)

    # Check if all activities in the course are completed and create certificate if so
    if course and course.id:
        await check_course_completion_and_create_certificate(
            request, int(user_id), course.id, db_session
        )

    # return OK
    return {"message": "Активность отмечена как выполненная"}


async def create_assignment_with_activity(
    request: Request,
    assignment_object: AssignmentCreateWithActivity,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    chapter_id: int,
    activity_name: str,
) -> AssignmentRead:
    """
    Create assignment with activity in a single transaction for better performance.
    """
    # Check if course exists
    statement = select(Course).where(Course.id == assignment_object.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:create",
        resource_owner_id=course.creator_id,
    )

    # Create Activity first
    activity = Activity(
        name=activity_name,
        activity_type=ActivityTypeEnum.TYPE_ASSIGNMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_ASSIGNMENT_ANY,
        published=assignment_object.published,
        course_id=assignment_object.course_id,
        activity_uuid=f"activity_{ULID()}",
        creation_date=datetime.now().isoformat(),
        update_date=datetime.now().isoformat(),
    )

    # Insert Activity in DB
    db_session.add(activity)
    db_session.flush()  # Flush to get the ID without committing

    # Create ChapterActivity relationship
    chapter_activity = ChapterActivity(
        chapter_id=chapter_id,
        activity_id=activity.id,
        course_id=assignment_object.course_id,
        order=1,  # Default order, can be adjusted later
        creation_date=datetime.now().isoformat(),
        update_date=datetime.now().isoformat(),
    )

    # Insert ChapterActivity in DB
    db_session.add(chapter_activity)
    db_session.flush()  # Flush to ensure proper ordering

    assignment_data = assignment_object.model_dump(exclude_unset=True)
    assignment = Assignment(**assignment_data)

    assignment.assignment_uuid = f"assignment_{ULID()}"
    assignment.creation_date = datetime.now().isoformat()
    assignment.update_date = datetime.now().isoformat()
    assignment.activity_id = activity.id
    assignment.chapter_id = chapter_id

    # Insert Assignment in DB
    db_session.add(assignment)
    db_session.commit()
    db_session.refresh(assignment)

    # return assignment read
    return AssignmentRead.model_validate(assignment)


async def get_assignments_from_course(
    request: Request,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[AssignmentRead]:
    # Find course
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Get Activities
    statement = select(Activity).where(Activity.course_id == course.id)
    activities = db_session.exec(statement).all()

    # Get Assignments in a single batch query
    activity_ids = [a.id for a in activities]
    assignments = []
    if activity_ids:
        assignments = db_session.exec(
            select(Assignment).where(Assignment.activity_id.in_(activity_ids))
        ).all()

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # return assignments read
    return [AssignmentRead.model_validate(assignment) for assignment in assignments]


async def get_assignments_from_courses(
    request: Request,
    course_uuids: list[str],
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, list[AssignmentRead]]:
    """
    Get assignments for multiple courses in a single request. Returns a mapping
    of course_uuid -> list[AssignmentRead]. An entry is present for each input
    course_uuid (empty list if no assignments or course not found).
    """
    # Fetch courses that exist
    statement = select(Course).where(Course.course_uuid.in_(course_uuids))
    courses = db_session.exec(statement).all()

    # Build helper maps
    course_id_to_uuid = {c.id: c.course_uuid for c in courses}

    # Check RBAC for each found course
    checker = PermissionChecker(db_session)
    for c in courses:
        checker.require(
            current_user.id,
            "assignment:read",
            is_assigned=True,
            resource_owner_id=c.creator_id,
        )

    course_ids = list(course_id_to_uuid.keys())

    # Load activities for those courses
    activities = []
    if course_ids:
        statement = select(Activity).where(Activity.course_id.in_(course_ids))
        activities = db_session.exec(statement).all()

    activity_id_to_course_uuid = {
        a.id: course_id_to_uuid.get(a.course_id) for a in activities
    }
    activity_ids = list(activity_id_to_course_uuid.keys())

    # Load assignments for those activities
    assignments = []
    if activity_ids:
        statement = select(Assignment).where(Assignment.activity_id.in_(activity_ids))
        assignments = db_session.exec(statement).all()

    # Build result mapping (preserve input course order/keys)
    result: dict[str, list[AssignmentRead]] = {uuid: [] for uuid in course_uuids}
    for assignment in assignments:
        course_uuid = activity_id_to_course_uuid.get(assignment.activity_id)
        if course_uuid:
            result.setdefault(course_uuid, []).append(
                AssignmentRead.model_validate(assignment)
            )

    return result


async def get_editable_assignments_from_courses(
    request: Request,
    course_uuids: list[str],
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, list[AssignmentRead]]:
    """
    Get assignments the current user can edit for multiple courses.

    Only includes assignments from courses where the user has
    assignment:update permission. Returns a mapping of
    course_uuid -> list[AssignmentRead]; every input uuid is present
    (empty list when the user lacks edit access or there are no assignments).
    """
    result: dict[str, list[AssignmentRead]] = {uuid: [] for uuid in course_uuids}

    if isinstance(current_user, AnonymousUser) or not course_uuids:
        return result

    statement = select(Course).where(Course.course_uuid.in_(course_uuids))
    courses = db_session.exec(statement).all()

    checker = PermissionChecker(db_session)

    # Filter to courses where the user has assignment:update permission
    editable_course_ids: set[int] = set()
    course_id_to_uuid: dict[int, str] = {}
    for c in courses:
        if checker.check(
            current_user.id,
            "assignment:update",
            resource_owner_id=c.creator_id,
        ):
            editable_course_ids.add(c.id)
            course_id_to_uuid[c.id] = c.course_uuid

    if not editable_course_ids:
        return result

    # Load activities for editable courses
    activities_statement = select(Activity).where(
        Activity.course_id.in_(list(editable_course_ids))
    )
    activities = db_session.exec(activities_statement).all()

    activity_id_to_course_uuid = {
        a.id: course_id_to_uuid.get(a.course_id) for a in activities
    }
    activity_ids = list(activity_id_to_course_uuid.keys())

    if not activity_ids:
        return result

    # Load assignments for those activities
    assignments_statement = select(Assignment).where(
        Assignment.activity_id.in_(activity_ids)
    )
    assignments = db_session.exec(assignments_statement).all()

    for assignment in assignments:
        course_uuid = activity_id_to_course_uuid.get(assignment.activity_id)
        if course_uuid:
            result.setdefault(course_uuid, []).append(
                AssignmentRead.model_validate(assignment)
            )

    return result
