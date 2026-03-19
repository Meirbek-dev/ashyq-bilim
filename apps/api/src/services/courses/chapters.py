from collections import defaultdict
from datetime import datetime

from fastapi import HTTPException, Request, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import (
    Activity,
    ActivityRead,
    ActivityReadWithPermissions,
)
from src.db.courses.chapter_activities import ChapterActivity
from src.db.courses.chapters import (
    Chapter,
    ChapterCreate,
    ChapterRead,
    ChapterReadWithPermissions,
    ChapterUpdate,
    ChapterUpdateOrder,
)
from src.db.courses.course_chapters import CourseChapter
from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses.courses import _ensure_course_is_current

####################################################
# CRUD
####################################################


async def create_chapter(
    request: Request,
    chapter_object: ChapterCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ChapterRead:
    chapter = Chapter.model_validate(chapter_object)

    # Get Course
    statement = select(Course).where(Course.id == chapter_object.course_id)
    course = db_session.exec(statement).one()

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "chapter:create",
        resource_owner_id=course.creator_id,
    )

    _ensure_course_is_current(course, chapter_object.last_known_update_date)

    # Complete chapter object
    chapter.course_id = chapter_object.course_id
    chapter.chapter_uuid = f"chapter_{ULID()}"
    chapter.creation_date = str(datetime.now())
    chapter.update_date = str(datetime.now())
    chapter.creator_id = current_user.id

    # Find the last chapter in the course and add it to the list
    statement = (
        select(CourseChapter)
        .where(CourseChapter.course_id == chapter.course_id)
        .order_by(CourseChapter.order)
    )
    course_chapters = db_session.exec(statement).all()

    # Get last chapter order
    last_order = course_chapters[-1].order if course_chapters else 0
    to_be_used_order = last_order + 1

    # Add chapter to database
    db_session.add(chapter)
    db_session.commit()
    db_session.refresh(chapter)

    chapter_read = ChapterRead.model_validate(chapter, update={"activities": []})

    # Check if CourseChapter link exists
    statement = (
        select(CourseChapter)
        .where(CourseChapter.chapter_id == chapter.id)
        .where(CourseChapter.course_id == chapter.course_id)
        .where(CourseChapter.order == to_be_used_order)
    )
    course_chapter = db_session.exec(statement).first()

    if not course_chapter:
        # Add CourseChapter link
        course_chapter = CourseChapter(
            course_id=chapter.course_id,
            chapter_id=chapter.id,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
            order=to_be_used_order,
        )

        # Insert CourseChapter link in DB
        db_session.add(course_chapter)
        db_session.commit()

    return chapter_read


async def get_chapter(
    request: Request,
    chapter_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ChapterRead:
    statement = select(Chapter).where(Chapter.id == chapter_id)
    chapter = db_session.exec(statement).first()

    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chapter does not exist"
        )

    # Get Course
    statement = select(Course).where(Course.id == chapter.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course does not exist"
        )

    # RBAC check (use parent Course for read access so public courses allow anonymous reads)
    checker = PermissionChecker(db_session)
    checker.require(current_user.id, "course:read")

    # Get activities for this chapter
    statement = (
        select(Activity)
        .join(ChapterActivity, Activity.id == ChapterActivity.activity_id)
        .where(ChapterActivity.chapter_id == chapter_id)
        .distinct(Activity.id)
    )

    activities = db_session.exec(statement).all()

    return ChapterRead.model_validate(
        chapter,
        update={
            "activities": [
                ActivityRead.model_validate(activity) for activity in activities
            ]
        },
    )


async def update_chapter(
    request: Request,
    chapter_object: ChapterUpdate,
    chapter_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ChapterRead:
    statement = select(Chapter).where(Chapter.id == chapter_id)
    chapter = db_session.exec(statement).first()

    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chapter does not exist"
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "chapter:update",
        resource_owner_id=chapter.creator_id,
    )

    statement = select(Course).where(Course.id == chapter.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course does not exist"
        )

    _ensure_course_is_current(course, chapter_object.last_known_update_date)

    # Update only the fields that were passed in
    update_data = chapter_object.model_dump(exclude_unset=True)
    update_data.pop("last_known_update_date", None)
    for field, value in update_data.items():
        setattr(chapter, field, value)

    chapter.update_date = str(datetime.now())

    db_session.commit()
    db_session.refresh(chapter)

    return await get_chapter(request, chapter.id, current_user, db_session)


async def delete_chapter(
    request: Request,
    chapter_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    last_known_update_date: datetime | None = None,
):
    statement = select(Chapter).where(Chapter.id == chapter_id)
    chapter = db_session.exec(statement).first()

    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chapter does not exist"
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "chapter:delete",
        resource_owner_id=chapter.creator_id,
    )

    statement = select(Course).where(Course.id == chapter.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course does not exist"
        )

    _ensure_course_is_current(course, last_known_update_date)

    # Remove all linked chapter activities
    statement = select(ChapterActivity).where(ChapterActivity.chapter_id == chapter.id)
    chapter_activities = db_session.exec(statement).all()

    for chapter_activity in chapter_activities:
        db_session.delete(chapter_activity)

    # Delete the chapter
    db_session.delete(chapter)
    db_session.commit()

    return {"detail": "chapter deleted"}


async def get_course_chapters(
    request: Request,
    course_id: int,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    with_unpublished_activities: bool,
    page: int = 1,
    limit: int = 10,
) -> list[ChapterReadWithPermissions]:
    statement = select(Course).where(Course.id == course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course does not exist"
        )

    # RBAC check (rights are determined by parent Course for read access)
    checker = PermissionChecker(db_session)
    if not course.public:
        checker.require(current_user.id, "course:read")

    statement = (
        select(Chapter)
        .join(CourseChapter, Chapter.id == CourseChapter.chapter_id)
        .where(CourseChapter.course_id == course_id)
        .where(Chapter.course_id == course_id)
        .order_by(CourseChapter.order)
        .group_by(Chapter.id, CourseChapter.order)
    )
    chapters = db_session.exec(statement).all()

    chapter_reads = [
        ChapterReadWithPermissions.model_validate(chapter, update={"activities": []})
        for chapter in chapters
    ]

    # Batch-fetch all ChapterActivities and Activities for all chapters in 2 queries
    chapter_ids = [c.id for c in chapter_reads]
    all_chapter_activities: list[ChapterActivity] = []
    activities_by_id: dict[int, Activity] = {}
    if chapter_ids:
        all_chapter_activities = db_session.exec(
            select(ChapterActivity)
            .where(ChapterActivity.chapter_id.in_(chapter_ids))
            .order_by(ChapterActivity.order)
            .distinct(ChapterActivity.id, ChapterActivity.order)
        ).all()
        activity_ids = list({ca.activity_id for ca in all_chapter_activities})
        if activity_ids:
            activities = db_session.exec(
                select(Activity).where(Activity.id.in_(activity_ids))
            ).all()
            activities_by_id = {a.id: a for a in activities}

    chapter_activities_map: dict[int, list[ChapterActivity]] = defaultdict(list)
    for ca in all_chapter_activities:
        chapter_activities_map[ca.chapter_id].append(ca)

    # Get activities for each chapter, enriched with permission metadata
    for chapter in chapter_reads:
        for chapter_activity in chapter_activities_map.get(chapter.id, []):
            activity = activities_by_id.get(chapter_activity.activity_id)
            if activity and (with_unpublished_activities or activity.published):
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
                is_owner = activity.creator_id == current_user.id

                activity_with_perms = ActivityReadWithPermissions(
                    **ActivityRead.model_validate(activity).model_dump(),
                    can_update=can_update,
                    can_delete=can_delete,
                    is_owner=is_owner,
                    is_creator=is_owner,
                    available_actions=[
                        a
                        for a, ok in {
                            "update": can_update,
                            "delete": can_delete,
                        }.items()
                        if ok
                    ],
                )
                chapter.activities.append(activity_with_perms)

    return chapter_reads


async def reorder_chapters_and_activities(
    request: Request,
    course_uuid: str,
    chapters_order: ChapterUpdateOrder,
    current_user: PublicUser,
    db_session: Session,
):
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course does not exist"
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "chapter:update",
        resource_owner_id=course.creator_id,
    )

    _ensure_course_is_current(course, chapters_order.last_known_update_date)

    ###########
    # Chapters
    ###########

    # Get all existing course chapters
    statement = select(CourseChapter).where(CourseChapter.course_id == course.id)
    existing_course_chapters = db_session.exec(statement).all()

    # Create a map of existing chapters for faster lookup
    existing_chapter_map = {cc.chapter_id: cc for cc in existing_course_chapters}

    # Update or create course chapters based on new order
    for index, chapter_order in enumerate(chapters_order.chapter_order_by_ids):
        new_order = index + 1

        if chapter_order.chapter_id in existing_chapter_map:
            # Update existing chapter order
            existing_cc = existing_chapter_map[chapter_order.chapter_id]
            existing_cc.order = new_order
            existing_cc.update_date = str(datetime.now())
        else:
            # Create new course chapter
            new_chapter = CourseChapter(
                course_id=course.id,
                chapter_id=chapter_order.chapter_id,
                order=new_order,
                creation_date=str(datetime.now()),
                update_date=str(datetime.now()),
            )
            db_session.add(new_chapter)

    # Remove chapters that are no longer in the order
    chapter_ids_to_keep = {co.chapter_id for co in chapters_order.chapter_order_by_ids}
    chapters_to_remove = [
        cc
        for cc in existing_course_chapters
        if cc.chapter_id not in chapter_ids_to_keep
    ]
    for cc in chapters_to_remove:
        db_session.delete(cc)

    db_session.commit()

    ###########
    # Activities
    ###########

    # Get all existing chapter activities
    statement = select(ChapterActivity).where(ChapterActivity.course_id == course.id)
    existing_chapter_activities = db_session.exec(statement).all()

    # Create a map for faster lookup
    existing_activity_map = {
        (ca.chapter_id, ca.activity_id): ca for ca in existing_chapter_activities
    }

    # Track which activities we want to keep
    activities_to_keep = set()

    # Update or create chapter activities based on new order
    for chapter_order in chapters_order.chapter_order_by_ids:
        for index, activity_order in enumerate(chapter_order.activities_order_by_ids):
            activity_key = (chapter_order.chapter_id, activity_order.activity_id)
            activities_to_keep.add(activity_key)
            new_order = index + 1

            if activity_key in existing_activity_map:
                # Update existing activity order
                existing_ca = existing_activity_map[activity_key]
                existing_ca.order = new_order
                existing_ca.update_date = str(datetime.now())
            else:
                # Create new chapter activity
                new_activity = ChapterActivity(
                    chapter_id=chapter_order.chapter_id,
                    activity_id=activity_order.activity_id,
                    course_id=course.id,
                    order=new_order,
                    creation_date=str(datetime.now()),
                    update_date=str(datetime.now()),
                )
                db_session.add(new_activity)

    # Remove activities that are no longer in any chapter
    activities_to_remove = [
        ca
        for ca in existing_chapter_activities
        if (ca.chapter_id, ca.activity_id) not in activities_to_keep
    ]
    for ca in activities_to_remove:
        db_session.delete(ca)

    db_session.commit()

    return {"detail": "Chapters and activities reordered successfully"}
