import logging
from collections import defaultdict
from datetime import UTC, datetime, timedelta

import orjson
from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.organizations import (
    OrganizationRead,
    OrganizationUser,
    PaginatedOrganizationUsers,
    rebuild_organization_models,
)
from src.db.permission_enums import ADMIN_ROLE_SLUGS
from src.db.permissions import Role, RoleRead, UserRole
from src.db.users import AnonymousUser, PublicUser, User, UserRead
from src.security.rbac import PermissionChecker
from src.services.cache import redis_client
from src.services.cache.redis_client import delete_keys, get_json, set_json
from src.services.platform import get_platform_organization

# Rebuild organization models to resolve forward references
rebuild_organization_models()


async def get_organization_users(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    checker: PermissionChecker,
    page: int = 1,
    per_page: int = 20,
) -> PaginatedOrganizationUsers:
    org = get_platform_organization(db_session)

    # RBAC check
    checker.require(
        current_user.id, "organization:read", resource_owner_id=org.creator_id
    )

    # Build base query joining via UserRole
    # Get distinct users who have any role in this org; use DISTINCT on `User.id`
    # to avoid comparing JSON columns (which don't have equality operators).
    base_statement = (
        select(User).join(UserRole, UserRole.user_id == User.id).distinct(User.id)
    )

    # Get total count by selecting distinct user IDs only (avoids JSON equality issues)
    all_user_ids = db_session.exec(
        select(User.id).join(UserRole, UserRole.user_id == User.id).distinct()
    ).all()
    total = len(all_user_ids)

    # Apply pagination
    offset = (page - 1) * per_page
    paginated_statement = base_statement.offset(offset).limit(per_page)
    users = db_session.exec(paginated_statement).all()

    org_users_list = []

    # Batch-fetch roles for all users on this page in a single query
    user_ids = [u.id for u in users]
    roles_by_user: dict[int, list] = defaultdict(list)
    if user_ids:
        all_role_rows = db_session.exec(
            select(Role, UserRole)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id.in_(user_ids))
        ).all()
        for role, user_role in all_role_rows:
            roles_by_user[user_role.user_id].append(role)

    for user in users:
        user_roles = roles_by_user.get(user.id, [])

        if not user_roles:
            logging.warning(f"No roles found for user {user.id} in platform org")
            continue

        # Use the first role (primary role)
        role = user_roles[0]

        user_read = UserRead.model_validate(user)
        role_read = RoleRead.model_validate(role)

        org_user = OrganizationUser(
            user=user_read,
            role=role_read,
        )

        org_users_list.append(org_user)

    total_pages = (total + per_page - 1) // per_page if total > 0 else 1

    return PaginatedOrganizationUsers(
        users=org_users_list,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


async def remove_user_from_org(
    request: Request,
    user_id: int,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    checker: PermissionChecker,
):
    org = get_platform_organization(db_session)

    # RBAC check
    checker.require(
        current_user.id, "organization:manage", resource_owner_id=org.creator_id
    )

    # Check if user has any roles in this org (i.e., is a member)
    statement = select(UserRole).where(UserRole.user_id == user_id)
    result = db_session.exec(statement)

    user_roles = result.all()

    if not user_roles:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    # Check if user is the last admin (lookup admin role by configured admin slugs)
    admin_role = db_session.exec(
        select(Role).where(Role.slug.in_(list(ADMIN_ROLE_SLUGS)))
    ).first()
    admin_role_id = admin_role.id if admin_role else 1

    # Count admins by checking UserRole with role_id = admin_role_id
    statement = select(UserRole).where(UserRole.role_id == admin_role_id).distinct()
    result = db_session.exec(statement)
    admin_roles = result.all()

    # Get unique admin user IDs
    admin_user_ids = {role.user_id for role in admin_roles}

    if len(admin_user_ids) == 1 and user_id in admin_user_ids:
        raise HTTPException(
            status_code=400,
            detail="You can't remove the last admin of the organization",
        )

    # Delete all user's roles in this org
    for role in user_roles:
        db_session.delete(role)
    db_session.commit()

    return {"detail": "User removed from org"}


async def update_user_role(
    request: Request,
    user_id: int,
    role_id: int,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    checker: PermissionChecker,
):
    """
    Update a user's role in an organization.

    Args:
        role_id: Numeric role ID.
    """
    role = db_session.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    org = get_platform_organization(db_session)

    # RBAC check
    checker.require(
        current_user.id, "organization:update", resource_owner_id=org.creator_id
    )

    # Last-admin protection
    admin_role = db_session.exec(
        select(Role).where(Role.slug.in_(list(ADMIN_ROLE_SLUGS)))
    ).first()
    admin_role_id = admin_role.id if admin_role else 1

    admin_user_ids = {
        ur.user_id
        for ur in db_session.exec(
            select(UserRole).where(UserRole.role_id == admin_role_id)
        ).all()
    }
    if not admin_user_ids:
        raise HTTPException(
            status_code=400, detail="There is no admin in the organization"
        )

    if (
        len(admin_user_ids) == 1
        and user_id in admin_user_ids
        and role.slug not in ADMIN_ROLE_SLUGS
    ):
        raise HTTPException(
            status_code=400, detail="Organization must have at least one admin"
        )

    # Verify user has existing roles in this org
    existing_roles = db_session.exec(
        select(UserRole).where(UserRole.user_id == user_id)
    ).all()
    if not existing_roles:
        raise HTTPException(status_code=404, detail="User not found")

    # Atomic: remove all current roles and assign new one
    for ur in existing_roles:
        db_session.delete(ur)
    db_session.flush()

    checker.assign_role(user_id=user_id, role_id=role.id)
    db_session.commit()

    return {"detail": "User role updated"}
