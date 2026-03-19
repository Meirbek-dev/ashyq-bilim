from typing import Annotated

from fastapi import APIRouter, Depends, Request, UploadFile
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.organizations import (
    OrganizationRead,
    OrganizationUpdate,
    PaginatedOrganizationUsers,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.rbac import PermissionCheckerDep
from src.services.orgs.orgs import (
    update_org,
    update_org_landing,
    update_org_logo,
    update_org_preview,
    update_org_thumbnail,
    upload_org_landing_content_service,
)
from src.services.orgs.users import (
    get_organization_users,
    remove_user_from_org,
    update_user_role,
)
from src.services.platform import get_platform_organization

router = APIRouter()


@router.get("/platform")
async def api_get_platform_org(
    db_session: Annotated[Session, Depends(get_db_session)],
) -> OrganizationRead:
    """
    Get the single platform organization.

    This endpoint is intentionally public in single-org mode because the
    frontend bootstraps navigation, auth pages, and public landing content from
    the platform organization before user-specific RBAC is established.
    """
    platform_org = get_platform_organization(db_session)
    return OrganizationRead.model_validate(platform_org)


@router.get("/users")
async def api_get_platform_org_users(
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
    page: int = 1,
    per_page: int = 20,
) -> PaginatedOrganizationUsers:
    """
    Get organization users with pagination
    """
    return await get_organization_users(
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
    Update user role in an organization.

    **Path Parameter**: `role_id` - numeric role ID

    **Required Permission**: `organization:update`
    """
    return await update_user_role(
        request,
        user_id,
        role_id,
        db_session,
        current_user,
        checker,
    )


@router.delete("/users/{user_id}")
async def api_remove_user_from_platform_org(
    request: Request,
    user_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Remove user from org
    """
    return await remove_user_from_org(
        request,
        user_id,
        db_session,
        current_user,
        checker,
    )


@router.put("/logo")
async def api_update_org_logo(
    request: Request,
    logo_file: UploadFile,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Update org logo

    **Required Permission**: `organization:update`
    """
    checker.require(current_user.id, "organization:update")
    return await update_org_logo(
        request=request,
        logo_file=logo_file,
        current_user=current_user,
        db_session=db_session,
    )


@router.put("/thumbnail")
async def api_update_org_thumbnail(
    request: Request,
    thumbnail_file: UploadFile,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Update org thumbnail

    **Required Permission**: `organization:update`
    """
    checker.require(current_user.id, "organization:update")
    return await update_org_thumbnail(
        request=request,
        thumbnail_file=thumbnail_file,
        current_user=current_user,
        db_session=db_session,
    )


@router.put("/preview")
async def api_update_org_preview(
    request: Request,
    preview_file: UploadFile,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Update org preview

    **Required Permission**: `organization:update`
    """
    checker.require(current_user.id, "organization:update")
    return await update_org_preview(
        request=request,
        preview_file=preview_file,
        current_user=current_user,
        db_session=db_session,
    )


@router.put("/platform")
async def api_update_org(
    request: Request,
    org_object: OrganizationUpdate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
) -> OrganizationRead:
    """
    Update Org by ID

    **Required Permission**: `organization:update`
    """
    checker.require(current_user.id, "organization:update")
    return await update_org(request, org_object, current_user, db_session)


@router.put("/landing")
async def api_update_org_landing(
    request: Request,
    landing_object: dict,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Update organization landing object

    **Required Permission**: `organization:update`
    """
    checker.require(current_user.id, "organization:update")
    return await update_org_landing(request, landing_object, current_user, db_session)


@router.post("/landing/content")
async def api_upload_org_landing_content(
    request: Request,
    content_file: UploadFile,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """
    Upload content for organization landing page

    **Required Permission**: `organization:update`
    """
    checker.require(current_user.id, "organization:update")
    return await upload_org_landing_content_service(
        request=request,
        content_file=content_file,
        current_user=current_user,
        db_session=db_session,
    )
