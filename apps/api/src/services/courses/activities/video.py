import asyncio
from datetime import datetime
from typing import Literal

import orjson
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
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses.activities.uploads.videos import upload_subtitle, upload_video
from src.services.courses.courses import _ensure_course_is_current


def _get_language_label(language_code: str) -> str:
    """Get human-readable language label from language code"""
    language_map = {
        "en": "English",
        "ru": "Russian",
        "kz": "Kazakh",
        "fr": "French",
        "es": "Spanish",
        "de": "German",
    }
    return language_map.get(language_code, language_code.upper())


def validate_video_file(video_file: UploadFile | None) -> str:
    """Validate video file and return format"""
    if not video_file:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Video : No video file provided",
        )

    if video_file.content_type not in [
        "video/mp4",
        "video/webm",
        "video/x-matroska",
    ]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Video : Wrong video format",
        )

    video_format = (
        video_file.filename.rsplit(".", 1)[-1]
        if video_file.filename and "." in video_file.filename
        else None
    )

    if not video_format:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Video : No video file provided or invalid filename",
        )

    return video_format


async def create_video_activity(
    request: Request,
    name: str,
    chapter_id: int,
    current_user: PublicUser,
    db_session: Session,
    video_file: UploadFile | None = None,
    last_known_update_date: datetime | None = None,
    details: str = "{}",
    subtitle_files: list[UploadFile] | None = None,
    video_uploaded_path: str | None = None,
):
    # get chapter_id
    statement = select(Chapter).where(Chapter.id == chapter_id)
    chapter = db_session.exec(statement).first()

    # convert details to dict
    details = orjson.loads(details)

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

    # generate activity_uuid
    activity_uuid = f"activity_{ULID()}"

    # Validate video file and get format (if direct upload)
    if video_file:
        video_format = validate_video_file(video_file)
    elif video_uploaded_path:
        # Extract format from pre-uploaded path
        video_format = video_uploaded_path.split(".")[-1]
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either video_file or video_uploaded_path must be provided",
        )

    activity_object = Activity(
        name=name,
        activity_type=ActivityTypeEnum.TYPE_VIDEO,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_VIDEO_HOSTED,
        activity_uuid=activity_uuid,
        course_id=coursechapter.course_id,
        content={
            "filename": f"video.{video_format}",
            "activity_uuid": activity_uuid,
        },
        details=details if isinstance(details, dict) else orjson.loads(details),
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    # create activity
    activity = Activity.model_validate(activity_object)
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    # upload video
    if video_file and course:
        # Direct upload: get videofile format and upload
        await upload_video(
            video_file,
            activity.activity_uuid,
            course.course_uuid,
        )
    elif video_uploaded_path and course:
        # Pre-uploaded via chunked upload: move from temp location to final location
        import shutil
        from pathlib import Path

        # Parse the temp path
        temp_path = Path(f"content/platform/{video_uploaded_path}")
        final_path = Path(
            f"content/platform/courses/{course.course_uuid}/activities/{activity.activity_uuid}/video/video.{video_format}"
        )

        # Create target directory
        final_path.parent.mkdir(parents=True, exist_ok=True)

        # Move the file
        if temp_path.exists():
            shutil.move(str(temp_path), str(final_path))
            # Clean up temp directory
            if temp_path.parent.exists():
                shutil.rmtree(temp_path.parent, ignore_errors=True)

    # Process and upload subtitle files
    if subtitle_files:
        subtitle_info = []

        # Pre-process valid subtitle files and extract language
        valid_subtitles: list[tuple] = []
        for subtitle_file in subtitle_files:
            if subtitle_file.filename and subtitle_file.size > 0:
                # Validate subtitle file format
                if not subtitle_file.filename.endswith((".srt", ".vtt")):
                    continue  # Skip invalid subtitle files

                # Extract language from filename or use default
                # Expected format: video.en.srt or similar
                filename_parts = subtitle_file.filename.split(".")
                language = "en"  # default language
                if len(filename_parts) >= 2:
                    potential_lang = filename_parts[-2].lower()
                    # Check if it's a valid language code (2-3 characters)
                    if 2 <= len(potential_lang) <= 3 and potential_lang.isalpha():
                        language = potential_lang

                valid_subtitles.append((subtitle_file, language))

        if valid_subtitles:
            # Upload all subtitle files in parallel
            upload_results = await asyncio.gather(
                *[
                    upload_subtitle(
                        subtitle_file,
                        activity.activity_uuid,
                        course.course_uuid,
                        language,
                        None,  # subtitle_id not needed anymore
                    )
                    for subtitle_file, language in valid_subtitles
                ]
            )

            for (_, language), upload_result in zip(
                valid_subtitles, upload_results, strict=False
            ):
                if upload_result.get("success"):
                    subtitle_info.append(
                        {
                            "language": language,
                            "filename": upload_result.get("filename"),
                            "label": _get_language_label(language),
                            "url": f"/content/platform/courses/{course.course_uuid}/activities/{activity.activity_uuid}/video/{upload_result.get('filename')}",
                        }
                    )

        # Update activity details with subtitle information
        if subtitle_info:
            updated_details = details.copy() if isinstance(details, dict) else {}
            updated_details["subtitles"] = subtitle_info
            activity.details = updated_details
            db_session.add(activity)
            db_session.commit()
            db_session.refresh(activity)

    # update chapter
    chapter_activity_object = ChapterActivity(
        chapter_id=chapter.id,
        activity_id=activity.id,
        course_id=coursechapter.course_id,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
        order=1,
    )

    # Insert ChapterActivity link in DB
    db_session.add(chapter_activity_object)
    db_session.commit()
    db_session.refresh(chapter_activity_object)

    return ActivityRead.model_validate(activity)


class ExternalVideo(PydanticStrictBaseModel):
    name: str
    uri: str
    type: Literal["youtube", "vimeo"]
    chapter_id: int
    details: str = "{}"
    last_known_update_date: datetime | None = None


class ExternalVideoInDB(PydanticStrictBaseModel):
    activity_id: int


async def create_external_video_activity(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    data: ExternalVideo,
    db_session: Session,
):
    # get chapter_id
    statement = select(Chapter).where(Chapter.id == data.chapter_id)
    chapter = db_session.exec(statement).first()

    if not chapter:
        raise HTTPException(
            status_code=404,
            detail="Chapter not found",
        )

    statement = select(CourseChapter).where(CourseChapter.chapter_id == data.chapter_id)
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

    _ensure_course_is_current(course, data.last_known_update_date)

    # generate activity_uuid
    activity_uuid = f"activity_{ULID()}"

    # convert details to dict
    details = orjson.loads(data.details)

    activity_object = Activity(
        name=data.name,
        activity_type=ActivityTypeEnum.TYPE_VIDEO,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_VIDEO_YOUTUBE,
        activity_uuid=activity_uuid,
        course_id=coursechapter.course_id,
        content={
            "uri": data.uri,
            "type": data.type,
            "activity_uuid": activity_uuid,
        },
        details=details,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    # create activity
    activity = Activity.model_validate(activity_object)
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    # update chapter
    chapter_activity_object = ChapterActivity(
        chapter_id=coursechapter.chapter_id,
        activity_id=activity.id,
        course_id=coursechapter.course_id,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
        order=1,
    )

    # Insert ChapterActivity link in DB
    db_session.add(chapter_activity_object)
    db_session.commit()

    return ActivityRead.model_validate(activity)


## 🔒 RBAC Utils ##
