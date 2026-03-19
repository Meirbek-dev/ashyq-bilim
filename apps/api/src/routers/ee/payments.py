from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.payments.payments import (
    PaymentsConfig,
    PaymentsConfigRead,
    PaymentsConfigUpdate,
)
from src.db.payments.payments_products import (
    PaymentsProductCreate,
    PaymentsProductRead,
    PaymentsProductUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.rbac import PermissionCheckerDep
from src.services.payments.payments_access import check_course_paid_access
from src.services.payments.payments_config import (
    delete_payments_config,
    get_payments_config,
    init_payments_config,
    update_payments_config,
)
from src.services.payments.payments_courses import (
    get_courses_by_product,
    link_course_to_product,
    unlink_course_from_product,
)
from src.services.payments.payments_customers import get_customers
from src.services.payments.payments_products import (
    create_payments_product,
    delete_payments_product,
    get_payments_product,
    get_products_by_course,
    list_payments_products,
    update_payments_product,
)
from src.services.payments.payments_stripe import (
    create_checkout_session,
    generate_stripe_connect_link,
    handle_stripe_oauth_callback,
    update_stripe_account_id,
)
from src.services.payments.payments_users import get_owned_courses
from src.services.payments.webhooks.payments_webhooks import handle_stripe_webhook

router = APIRouter()


@router.post("/config")
async def api_create_payments_config(
    request: Request,
    provider: Literal["stripe"],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> PaymentsConfig:
    """
    Create payments configuration

    **Required Permission**: `organization:manage:org` (admin only)
    """
    checker.require(current_user.id, "organization:manage")

    return await init_payments_config(request, provider, current_user, db_session)


@router.get("/config")
async def api_get_payments_config(
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[PaymentsConfigRead]:
    return await get_payments_config(request, current_user, db_session)


@router.put("/config")
async def api_update_payments_config(
    request: Request,
    payments_config: PaymentsConfigUpdate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    db_session: Annotated[Session, Depends(get_db_session)],
    id: Annotated[int | None, Query()] = None,
) -> PaymentsConfig:
    """
    Update payments configuration

    **Required Permission**: `organization:manage:org` (admin only)
    """
    checker.require(current_user.id, "organization:manage")

    if id is not None:
        configs = await get_payments_config(request, current_user, db_session)
        if not any(config.id == id for config in configs):
            raise ValueError("Payments config not found")

    return await update_payments_config(
        request, payments_config, current_user, db_session
    )


@router.delete("/config")
async def api_delete_payments_config(
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    db_session: Annotated[Session, Depends(get_db_session)],
    id: Annotated[int | None, Query()] = None,
):
    """
    Delete payments configuration

    **Required Permission**: `organization:manage:org` (admin only)
    """
    checker.require(current_user.id, "organization:manage")

    if id is not None:
        configs = await get_payments_config(request, current_user, db_session)
        if not any(config.id == id for config in configs):
            raise ValueError("Payments config not found")

    await delete_payments_config(request, current_user, db_session)
    return {"message": "Payments config deleted successfully"}


@router.post("/products")
async def api_create_payments_product(
    request: Request,
    payments_product: PaymentsProductCreate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> PaymentsProductRead:
    """
    Create payment product

    **Required Permission**: `organization:manage:org`
    """
    checker.require(current_user.id, "organization:manage")

    return await create_payments_product(
        request, payments_product, current_user, db_session
    )


@router.get("/products")
async def api_get_payments_products(
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[PaymentsProductRead]:
    return await list_payments_products(request, current_user, db_session)


@router.get("/products/{product_id}")
async def api_get_payments_product(
    request: Request,
    product_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> PaymentsProductRead:
    return await get_payments_product(request, product_id, current_user, db_session)


@router.put("/products/{product_id}")
async def api_update_payments_product(
    request: Request,
    product_id: int,
    payments_product: PaymentsProductUpdate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> PaymentsProductRead:
    """
    Update payment product

    **Required Permission**: `organization:manage:org`
    """
    checker.require(current_user.id, "organization:manage")

    return await update_payments_product(
        request, product_id, payments_product, current_user, db_session
    )


@router.delete("/products/{product_id}")
async def api_delete_payments_product(
    request: Request,
    product_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """
    Delete payment product

    **Required Permission**: `organization:manage:org`
    """
    checker.require(current_user.id, "organization:manage")

    await delete_payments_product(request, product_id, current_user, db_session)
    return {"message": "Payments product deleted successfully"}


@router.post("/products/{product_id}/courses/{course_id}")
async def api_link_course_to_product(
    request: Request,
    product_id: int,
    course_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    return await link_course_to_product(
        request, course_id, product_id, current_user, db_session
    )


@router.delete("/products/{product_id}/courses/{course_id}")
async def api_unlink_course_from_product(
    request: Request,
    product_id: int,
    course_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    return await unlink_course_from_product(
        request, course_id, current_user, db_session
    )


@router.get("/products/{product_id}/courses")
async def api_get_courses_by_product(
    request: Request,
    product_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    return await get_courses_by_product(request, product_id, current_user, db_session)


@router.get("/courses/{course_id}/products")
async def api_get_products_by_course(
    request: Request,
    course_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    return await get_products_by_course(request, course_id, current_user, db_session)


# Payments webhooks


@router.post("/stripe/webhook")
async def api_handle_connected_accounts_stripe_webhook(
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
):
    return await handle_stripe_webhook(request, "standard", db_session)


@router.post("/stripe/webhook/connect")
async def api_handle_connected_accounts_stripe_webhook_connect(
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
):
    return await handle_stripe_webhook(request, "connect", db_session)


# Payments checkout


@router.post("/stripe/checkout/product/{product_id}")
async def api_create_checkout_session(
    request: Request,
    product_id: int,
    redirect_uri: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    return await create_checkout_session(
        request, product_id, redirect_uri, current_user, db_session
    )


@router.get("/courses/{course_id}/access")
async def api_check_course_paid_access(
    request: Request,
    course_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """
    Check if current user has paid access to a specific course
    """
    return {
        "has_access": await check_course_paid_access(
            course_id=course_id, user=current_user, db_session=db_session
        )
    }


@router.get("/customers")
async def api_get_customers(
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """
    Get list of customers and their subscriptions for an organization
    """
    return await get_customers(request, current_user, db_session)


@router.get("/courses/owned")
async def api_get_owned_courses(
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    return await get_owned_courses(request, current_user, db_session)


@router.put("/stripe/account")
async def api_update_stripe_account_id(
    request: Request,
    stripe_account_id: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    return await update_stripe_account_id(
        request, stripe_account_id, current_user, db_session
    )


@router.post("/stripe/connect/link")
async def api_generate_stripe_connect_link(
    request: Request,
    redirect_uri: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """
    Generate a Stripe OAuth link for connecting a Stripe account
    """
    return await generate_stripe_connect_link(
        request, redirect_uri, current_user, db_session
    )


@router.get("/stripe/oauth/callback")
async def stripe_oauth_callback(
    request: Request,
    code: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    return await handle_stripe_oauth_callback(request, code, current_user, db_session)
