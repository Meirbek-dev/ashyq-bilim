from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException, Request, UploadFile, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.organizations import (
    Organization,
    OrganizationCreate,
    OrganizationRead,
    OrganizationUpdate,
)
from src.db.permission_enums import ADMIN_ROLE_SLUGS, RoleSlug
from src.db.permissions import Role, UserRole
from src.db.users import AnonymousUser, InternalUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.orgs.uploads import (
    upload_org_landing_content,
    upload_org_logo,
    upload_org_preview,
    upload_org_thumbnail,
)
from src.services.platform import get_platform_organization


async def get_organization(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    checker: PermissionChecker | None = None,
) -> OrganizationRead:
    org = get_platform_organization(db_session)

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "organization:read", resource_owner_id=org.creator_id
    )

    return OrganizationRead.model_validate(org)


async def update_org(
    request: Request,
    org_object: OrganizationUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
):
    org = get_platform_organization(db_session)

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "organization:update", resource_owner_id=org.creator_id
    )

    # Update only the fields that were passed in
    update_data = org_object.model_dump(exclude_unset=True)
    update_data.pop("slug", None)
    for field, value in update_data.items():
        if value is not None:
            setattr(org, field, value)

    # Complete the org object
    org.update_date = str(datetime.now())

    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return OrganizationRead.model_validate(org)


async def update_org_logo(
    request: Request,
    logo_file: UploadFile,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
):
    org = get_platform_organization(db_session)

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "organization:update", resource_owner_id=org.creator_id
    )

    # Upload logo
    name_in_disk = await upload_org_logo(logo_file)

    # Update org
    org.logo_image = name_in_disk

    # Complete the org object
    org.update_date = str(datetime.now())

    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return {"detail": "Logo updated"}


async def update_org_thumbnail(
    request: Request,
    thumbnail_file: UploadFile,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
):
    org = get_platform_organization(db_session)

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "organization:update", resource_owner_id=org.creator_id
    )

    # Upload logo
    name_in_disk = await upload_org_thumbnail(thumbnail_file)

    # Update org
    org.thumbnail_image = name_in_disk

    # Complete the org object
    org.update_date = str(datetime.now())

    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return {"detail": "Thumbnail updated"}


async def update_org_preview(
    request: Request,
    preview_file: UploadFile,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
):
    org = get_platform_organization(db_session)

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "organization:update", resource_owner_id=org.creator_id
    )

    # Upload logo
    name_in_disk = await upload_org_preview(preview_file)

    return {"name_in_disk": name_in_disk}


async def delete_org(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
):
    org = get_platform_organization(db_session)

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "organization:delete", resource_owner_id=org.creator_id
    )

    db_session.delete(org)
    db_session.commit()

    # Delete all user roles linked to this org
    statement = select(UserRole)
    result = db_session.exec(statement)

    user_roles = result.all()

    for role in user_roles:
        db_session.delete(role)
    db_session.commit()

    db_session.refresh(org)

    return {"detail": "Organization deleted"}


async def get_orgs_by_user_admin(
    request: Request,
    db_session: Session,
    user_id: int,
    page: int = 1,
    limit: int = 10,
) -> list[OrganizationRead]:
    # Resolve the admin role id by slug (new RBAC system)
    admin_role = db_session.exec(
        select(Role).where(Role.slug.in_(list(ADMIN_ROLE_SLUGS)))
    ).first()
    admin_role_id = admin_role.id if admin_role else 1

    has_admin_role = db_session.exec(
        select(UserRole).where(
            UserRole.user_id == int(user_id),
            UserRole.role_id == admin_role_id,
        )
    ).first()
    if not has_admin_role or page != 1 or limit < 1:
        return []

    return [OrganizationRead.model_validate(get_platform_organization(db_session))]


async def get_orgs_by_user(
    request: Request,
    db_session: Session,
    user_id: int,
    page: int = 1,
    limit: int = 10,
) -> list[OrganizationRead]:
    has_role = db_session.exec(
        select(UserRole).where(UserRole.user_id == int(user_id))
    ).first()
    if not has_role or page != 1 or limit < 1:
        return []

    return [OrganizationRead.model_validate(get_platform_organization(db_session))]


async def upload_org_preview_service(
    preview_file: UploadFile,
) -> dict:
    # No need for request or current_user since we're not doing RBAC checks for previews

    # Upload preview
    name_in_disk = await upload_org_preview(preview_file)

    return {"detail": "Preview uploaded successfully", "filename": name_in_disk}


async def update_org_landing(
    request: Request,
    landing_object: dict,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
):
    org = get_platform_organization(db_session)

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "organization:update", resource_owner_id=org.creator_id
    )

    org.landing = landing_object
    org.update_date = str(datetime.now())

    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return {"detail": "Landing object updated"}


async def upload_org_landing_content_service(
    request: Request,
    content_file: UploadFile,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
) -> dict:
    org = get_platform_organization(db_session)

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "organization:update", resource_owner_id=org.creator_id
    )

    # Upload content
    name_in_disk = await upload_org_landing_content(content_file)

    return {"detail": "Landing content uploaded successfully", "filename": name_in_disk}
