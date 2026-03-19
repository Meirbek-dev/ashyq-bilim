from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.courses.activities import Activity
from src.db.courses.courses import Course
from src.db.payments.payments_courses import PaymentsCourse
from src.db.payments.payments_users import PaymentStatusEnum, PaymentsUser
from src.db.resource_authors import (
    ResourceAuthor,
    ResourceAuthorshipEnum,
    ResourceAuthorshipStatusEnum,
)
from src.db.users import AnonymousUser, PublicUser

# Inline helper to check resource authorship for payments access


def is_resource_author(db_session: Session, user_id: int, resource_uuid: str) -> bool:
    statement = select(ResourceAuthor).where(
        ResourceAuthor.resource_uuid == resource_uuid,
        ResourceAuthor.user_id == user_id,
    )
    resource_author = db_session.exec(statement).first()

    if not resource_author:
        return False

    return (
        resource_author.authorship
        in (
            ResourceAuthorshipEnum.CREATOR,
            ResourceAuthorshipEnum.MAINTAINER,
            ResourceAuthorshipEnum.CONTRIBUTOR,
        )
        and resource_author.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE
    )


async def check_activity_paid_access(
    request: Request,
    activity_id: int,
    user: PublicUser | AnonymousUser,
    db_session: Session,
) -> bool:
    """
    Check if a user has access to a specific activity
    Returns True if:
    - User is an author of the course
    - Activity is in a free course
    - User has a valid subscription for the course
    """
    # Get activity and associated course
    statement = select(Activity).where(Activity.id == activity_id)
    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Check if course exists
    statement = select(Course).where(Course.id == activity.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Check if user is author of the course
    is_course_author = is_resource_author(db_session, user.id, course.course_uuid)

    if is_course_author:
        return True

    # Check if course is linked to a product
    statement = select(PaymentsCourse).where(PaymentsCourse.course_id == course.id)
    course_payment = db_session.exec(statement).first()

    # If course is not linked to any product, it's free
    if not course_payment:
        return True

    # Anonymous users have no access to paid activities
    if isinstance(user, AnonymousUser):
        return False

    # Check if user has a valid subscription or payment
    statement = select(PaymentsUser).where(
        PaymentsUser.user_id == user.id,
        PaymentsUser.payment_product_id == course_payment.payment_product_id,
        PaymentsUser.status.in_(
            [PaymentStatusEnum.ACTIVE, PaymentStatusEnum.COMPLETED]
        ),
    )
    access = db_session.exec(statement).first()

    return bool(access)


async def check_course_paid_access(
    course_id: int,
    user: PublicUser | AnonymousUser,
    db_session: Session,
) -> bool:
    """
    Check if a user has paid access to a specific course
    Returns True if:
    - User is an author of the course
    - Course is free (not linked to any product)
    - User has a valid subscription for the course
    """
    # Check if course exists
    statement = select(Course).where(Course.id == course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Check if course is linked to a product
    statement = select(PaymentsCourse).where(PaymentsCourse.course_id == course.id)
    course_payment = db_session.exec(statement).first()

    # If course is not linked to any product, it's free
    if not course_payment:
        return True

    # Check if user has a valid subscription
    statement = select(PaymentsUser).where(
        PaymentsUser.user_id == user.id,
        PaymentsUser.payment_product_id == course_payment.payment_product_id,
        PaymentsUser.status.in_(
            [PaymentStatusEnum.ACTIVE, PaymentStatusEnum.COMPLETED]
        ),
    )
    subscription = db_session.exec(statement).first()

    return bool(subscription)
