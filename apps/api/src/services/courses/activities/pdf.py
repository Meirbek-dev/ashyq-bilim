from datetime import datetime

from fastapi import HTTPException, Request, UploadFile, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import (
    Activity,
    ActivityRead,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.chapter_activities import ChapterActivity
from src.db.courses.chapters import Chapter
from src.db.courses.course_chapters import CourseChapter
from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses.activities.uploads.pdfs import upload_pdf
from src.services.courses.courses import _ensure_course_is_current


async def create_documentpdf_activity(
    request: Request,
    name: str,
    chapter_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    last_known_update_date: datetime | None = None,
    pdf_file: UploadFile | None = None,
):
    # get chapter_id
    statement = select(Chapter).where(Chapter.id == chapter_id)
    chapter = db_session.exec(statement).first()

    if not chapter:
        raise HTTPException(
            status_code=404,
            detail="Chapter not found",
        )

    statement = select(CourseChapter).where(CourseChapter.chapter_id == chapter_id)
    coursechapter = db_session.exec(statement).first()

    if not coursechapter:
        raise HTTPException(
            status_code=404,
            detail="CourseChapter not found",
        )
    # Get course_uuid for RBAC check
    statement = select(Course).where(Course.id == coursechapter.course_id)
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
        "activity:create",
        resource_owner_id=course.creator_id,
    )

    _ensure_course_is_current(course, last_known_update_date)

    # create activity uuid
    activity_uuid = f"activity_{ULID()}"

    # check if pdf_file is not None
    if not pdf_file:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Pdf : No pdf file provided"
        )

    if pdf_file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Pdf : Wrong pdf format"
        )

    # get pdf format
    if pdf_file.filename:
        pdf_format = pdf_file.filename.split(".")[-1]

    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Pdf : No pdf file provided"
        )

    # Create activity
    activity = Activity(
        name=name,
        activity_type=ActivityTypeEnum.TYPE_DOCUMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_DOCUMENT_PDF,
        content={
            "filename": "documentpdf." + pdf_format,
            "activity_uuid": activity_uuid,
        },
        course_id=coursechapter.course_id,
        activity_uuid=activity_uuid,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    # Insert Activity in DB
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    # Add activity to chapter
    activity_chapter = ChapterActivity(
        chapter_id=(int(chapter_id)),
        activity_id=activity.id,
        course_id=coursechapter.course_id,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
        order=1,
    )

    # upload pdf
    if pdf_file and course:
        # get pdffile format
        await upload_pdf(
            pdf_file,
            activity.activity_uuid,
            course.course_uuid,
        )

    # Insert ChapterActivity link in DB
    db_session.add(activity_chapter)
    db_session.commit()
    db_session.refresh(activity_chapter)

    return ActivityRead.model_validate(activity)
