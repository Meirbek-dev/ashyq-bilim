import logging
from datetime import datetime

from fastapi import HTTPException, Request
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import (
    Activity,
    ActivityCreate,
    ActivityRead,
    ActivityReadWithPermissions,
    ActivityUpdate,
)
from src.db.courses.chapter_activities import ChapterActivity
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses.courses import _ensure_course_is_current
from src.services.payments.payments_access import check_activity_paid_access

logger = logging.getLogger(__name__)

####################################################
# CRUD
####################################################


async def create_activity(
    request: Request,
    activity_object: ActivityCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    # Check if platform exists
    statement = select(Chapter).where(Chapter.id == activity_object.chapter_id)
    chapter = db_session.exec(statement).first()

    if not chapter:
        raise HTTPException(
            status_code=404,
            detail="Chapter not found",
        )

    # RBAC check
    statement = select(Course).where(Course.id == chapter.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "activity:create",
        resource_owner_id=course.creator_id,
    )

    _ensure_course_is_current(course, activity_object.last_known_update_date)

    # Create Activity
    activity = Activity(**activity_object.model_dump())

    activity.activity_uuid = f"activity_{ULID()}"
    activity.creation_date = datetime.now()
    activity.update_date = datetime.now()
    activity.course_id = chapter.course_id
    activity.creator_id = current_user.id  # Track creator

    # Insert Activity in DB
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    # Find the last activity in the Chapter and add it to the list
    statement = (
        select(ChapterActivity)
        .where(ChapterActivity.chapter_id == activity_object.chapter_id)
        .order_by(ChapterActivity.order)
    )
    chapter_activities = db_session.exec(statement).all()

    last_order = chapter_activities[-1].order if chapter_activities else 0
    to_be_used_order = last_order + 1

    # Add activity to chapter
    activity_chapter = ChapterActivity(
        chapter_id=activity_object.chapter_id,
        activity_id=activity.id or 0,
        course_id=chapter.course_id,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
        order=to_be_used_order,
    )

    # Insert ChapterActivity link in DB
    db_session.add(activity_chapter)
    db_session.commit()
    db_session.refresh(activity_chapter)

    return ActivityRead.model_validate(activity)


async def get_activity(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser,
    db_session: Session,
):
    # Optimize by joining Activity with Course in a single query
    statement = (
        select(Activity, Course)
        .join(Course)
        .where(Activity.activity_uuid == activity_uuid)
    )
    result = db_session.exec(statement).first()

    if not result:
        raise HTTPException(
            status_code=404,
            detail="Activity not found",
        )

    activity, _course = result

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "activity:read",
        resource_owner_id=activity.creator_id,
    )

    # Paid access check
    has_paid_access = await check_activity_paid_access(
        request=request,
        activity_id=activity.id or 0,
        user=current_user,
        db_session=db_session,
    )

    activity_read = ActivityRead.model_validate(activity)
    activity_read.content = (
        activity_read.content if has_paid_access else {"paid_access": False}
    )

    # Enrich with permission metadata
    can_update = checker.check(
        current_user.id,
        "activity:update",
        resource_owner_id=activity.creator_id,
    )
    can_delete = checker.check(
        current_user.id,
        "activity:delete",
        resource_owner_id=activity.creator_id,
    )
    is_owner = (
        hasattr(activity, "created_by") and activity.created_by == current_user.id
    )

    return ActivityReadWithPermissions(
        **activity_read.model_dump(),
        can_update=can_update,
        can_delete=can_delete,
        is_owner=is_owner,
        is_creator=is_owner,
        available_actions=[
            a for a, ok in {"update": can_update, "delete": can_delete}.items() if ok
        ],
    )


async def get_activityby_id(
    request: Request,
    activity_id: int,
    current_user: PublicUser,
    db_session: Session,
):
    # Optimize by joining Activity with Course in a single query
    statement = select(Activity, Course).join(Course).where(Activity.id == activity_id)
    result = db_session.exec(statement).first()

    if not result:
        raise HTTPException(
            status_code=404,
            detail="Activity not found",
        )

    activity, _course = result

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "activity:read",
        resource_owner_id=activity.creator_id,
    )

    return ActivityRead.model_validate(activity)


async def update_activity(
    request: Request,
    activity_object: ActivityUpdate,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    statement = select(Activity).where(Activity.activity_uuid == activity_uuid)
    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(
            status_code=404,
            detail="Activity not found",
        )

    # RBAC check
    statement = select(Course).where(Course.id == activity.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "activity:update",
        resource_owner_id=activity.creator_id,
    )

    _ensure_course_is_current(course, activity_object.last_known_update_date)

    # Update only the fields that were passed in
    update_data = activity_object.model_dump(exclude_unset=True)
    update_data.pop("last_known_update_date", None)
    for field, value in update_data.items():
        if value is not None:
            setattr(activity, field, value)

    activity.update_date = datetime.now()

    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    # Invalidate AI caches so the next chat request uses fresh content
    try:
        from src.services.ai.cache_manager import get_ai_cache_manager

        get_ai_cache_manager().invalidate_activity_cache(activity_uuid)
    except Exception as _inv_err:
        logger.warning(
            "AI cache invalidation failed for %s: %s", activity_uuid, _inv_err
        )

    return ActivityRead.model_validate(activity)


async def delete_activity(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    last_known_update_date: datetime | None = None,
):
    statement = select(Activity).where(Activity.activity_uuid == activity_uuid)
    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(
            status_code=404,
            detail="Activity not found",
        )

    # RBAC check
    statement = select(Course).where(Course.id == activity.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "activity:delete",
        resource_owner_id=activity.creator_id,
    )

    _ensure_course_is_current(course, last_known_update_date)

    # Delete activity from chapter
    statement = select(ChapterActivity).where(
        ChapterActivity.activity_id == activity.id
    )
    activity_chapter = db_session.exec(statement).first()

    if not activity_chapter:
        raise HTTPException(
            status_code=404,
            detail="Activity not found in chapter",
        )

    db_session.delete(activity_chapter)
    db_session.delete(activity)
    db_session.commit()

    # Invalidate AI caches; the activity no longer exists
    try:
        from src.services.ai.cache_manager import get_ai_cache_manager

        get_ai_cache_manager().invalidate_activity_cache(activity_uuid)
    except Exception as _inv_err:
        logger.warning(
            "AI cache invalidation failed for %s: %s", activity_uuid, _inv_err
        )

    return {"detail": "Activity deleted"}


####################################################
# Misc
####################################################


async def get_activities(
    request: Request,
    coursechapter_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[ActivityRead]:
    # Get activities that are published and belong to the chapter
    statement = (
        select(Activity)
        .join(ChapterActivity)
        .where(ChapterActivity.chapter_id == coursechapter_id, Activity.published)
    )
    activities = db_session.exec(statement).all()

    if not activities:
        raise HTTPException(
            status_code=404,
            detail="No published activities found",
        )

    # RBAC check
    statement = select(Chapter).where(Chapter.id == coursechapter_id)
    chapter = db_session.exec(statement).first()

    if not chapter:
        raise HTTPException(
            status_code=404,
            detail="Chapter not found",
        )

    statement = select(Course).where(Course.id == chapter.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    checker = PermissionChecker(db_session)
    checker.require(current_user.id, "activity:read")

    return [ActivityRead.model_validate(activity) for activity in activities]
