import asyncio

from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.payments.payments_users import PaymentsUser
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.payments.payments_products import get_payments_product
from src.services.users.users import read_user_by_id


async def get_customers(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(current_user.id, "platform:read")

    # Get all payment users for the platform
    statement = select(PaymentsUser)
    payment_users = db_session.exec(statement).all()

    if not payment_users:
        return []

    # Gather all user and product lookups in parallel
    all_users = await asyncio.gather(
        *[
            read_user_by_id(request, db_session, current_user, pu.user_id)
            for pu in payment_users
        ]
    )
    all_products = await asyncio.gather(
        *[
            get_payments_product(
                request, pu.payment_product_id, current_user, db_session
            )
            for pu in payment_users
        ]
    )

    return [
        {
            "payment_user_id": pu.id,
            "user": user or None,
            "product": product or None,
            "status": pu.status,
            "creation_date": pu.creation_date,
            "update_date": pu.update_date,
        }
        for pu, user, product in zip(
            payment_users, all_users, all_products, strict=False
        )
    ]
