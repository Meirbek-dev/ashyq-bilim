from typing import Annotated

from fastapi import APIRouter, Depends, Request, UploadFile
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.platform import (
    PaginatedPlatformUsers,
    PlatformRead,
    PlatformUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.rbac import PermissionCheckerDep
from src.services.platform import get_platform
from src.services.platform_admin import (
    update_platform,
    update_platform_landing,
    update_platform_logo,
    update_platform_preview,
    update_platform_thumbnail,
    upload_platform_landing_content_service,
)
from src.services.platform_users import (
    get_platform_users,
    remove_platform_user,
    update_platform_user_role,
)

router = APIRouter()


@router.get("")
async def api_get_platform(
    db_session: Annotated[Session, Depends(get_db_session)],
) -> PlatformRead:
    """
    Get the single platform.

    This endpoint is intentionally public in single-platform mode because the
    frontend bootstraps navigation, auth pages, and public landing content from
    the platform before user-specific RBAC is established.
    """
    platform_record = get_platform(db_session)
    return PlatformRead.model_validate(platform_record)


@router.get("/users")
async def api_get_platform_users(
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
    page: int = 1,
    per_page: int = 20,
) -> PaginatedPlatformUsers:
    return await get_platform_users(
        request,
        db_session,
        current_user,
        checker,
        page,
        per_page,
    )


@router.put("/users/{user_id}/role/{role_id}")
async def api_update_platform_user_role(
    request: Request,
    user_id: int,
    role_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Update a user's role in the platform.

    **Path Parameter**: `role_id` - numeric role ID

    **Required Permission**: `platform:update`
    """
    return await update_platform_user_role(
        request,
        user_id,
        role_id,
        db_session,
        current_user,
        checker,
    )


@router.delete("/users/{user_id}")
async def api_remove_user_from_platform(
    request: Request,
    user_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Remove a user from the platform.
    """
    return await remove_platform_user(
        request,
        user_id,
        db_session,
        current_user,
        checker,
    )


@router.put("/logo")
async def api_update_platform_logo(
    request: Request,
    logo_file: UploadFile,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Update the platform logo.

    **Required Permission**: `platform:update`
    """
    checker.require(current_user.id, "platform:update")
    return await update_platform_logo(
        request=request,
        logo_file=logo_file,
        current_user=current_user,
        db_session=db_session,
    )


@router.put("/thumbnail")
async def api_update_platform_thumbnail(
    request: Request,
    thumbnail_file: UploadFile,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Update the platform thumbnail.

    **Required Permission**: `platform:update`
    """
    checker.require(current_user.id, "platform:update")
    return await update_platform_thumbnail(
        request=request,
        thumbnail_file=thumbnail_file,
        current_user=current_user,
        db_session=db_session,
    )


@router.put("/preview")
async def api_update_platform_preview(
    request: Request,
    preview_file: UploadFile,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Update the platform preview.

    **Required Permission**: `platform:update`
    """
    checker.require(current_user.id, "platform:update")
    return await update_platform_preview(
        request=request,
        preview_file=preview_file,
        current_user=current_user,
        db_session=db_session,
    )


@router.put("")
async def api_update_platform(
    request: Request,
    platform_object: PlatformUpdate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
) -> PlatformRead:
    """
    Update the platform.

    **Required Permission**: `platform:update`
    """
    checker.require(current_user.id, "platform:update")
    return await update_platform(request, platform_object, current_user, db_session)


@router.put("/landing")
async def api_update_platform_landing(
    request: Request,
    landing_object: dict,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Update the platform landing object.

    **Required Permission**: `platform:update`
    """
    checker.require(current_user.id, "platform:update")
    return await update_platform_landing(
        request, landing_object, current_user, db_session
    )


@router.post("/landing/content")
async def api_upload_platform_landing_content(
    request: Request,
    content_file: UploadFile,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Upload content for the platform landing page.

    **Required Permission**: `platform:update`
    """
    checker.require(current_user.id, "platform:update")
    return await upload_platform_landing_content_service(
        request=request,
        content_file=content_file,
        current_user=current_user,
        db_session=db_session,
    )
