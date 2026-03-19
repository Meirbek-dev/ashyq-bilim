"""
Roles Router - CRUD for roles + permission assignment.

Role assignment/revocation to *users* is in rbac.py.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, or_, select

from src.core.events.database import get_db_session
from src.db.permissions import (
    Permission,
    PermissionRead,
    Role,
    RoleCreate,
    RolePermission,
    RoleRead,
    RoleUpdate,
    UserRole,
)
from src.db.users import PublicUser
from src.routers.role_audit_store import (
    RoleAuditListResponse,
    append_role_audit_event,
    list_role_audit_events,
)
from src.security.auth import get_current_user
from src.security.rbac import PermissionCheckerDep

audit_log = logging.getLogger("rbac.audit")

router = APIRouter()


class AddPermissionBody(BaseModel):
    permission_id: int


def _is_admin(checker: PermissionCheckerDep, user_id: int) -> bool:
    """Check if user is an admin using the permission system itself."""
    return checker.check(user_id, "role:manage")


# ── List / Read ───────────────────────────────────────────────────────────


@router.get("/permissions/all", response_model=list[PermissionRead])
async def list_all_permissions(
    db: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    """List all permission definitions. Used by the RBAC admin panel."""
    checker.require(current_user.id, "role:read")
    perms = db.exec(
        select(Permission).order_by(Permission.resource_type, Permission.action)
    ).all()
    return [PermissionRead.model_validate(p) for p in perms]


@router.get("", response_model=list[RoleRead])
async def list_roles(
    db: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    """List all roles available in the platform."""
    checker.require(current_user.id, "role:read")
    roles = db.exec(select(Role).order_by(Role.priority.desc())).all()

    role_ids = [role.id for role in roles if role.id is not None]
    permission_count_map: dict[int, int] = {}
    user_count_map: dict[int, int] = {}

    if role_ids:
        permission_counts = db.exec(
            select(RolePermission.role_id, func.count(RolePermission.permission_id))
            .where(RolePermission.role_id.in_(role_ids))
            .group_by(RolePermission.role_id)
        ).all()
        permission_count_map = dict(permission_counts)

        user_counts = db.exec(
            select(UserRole.role_id, func.count(UserRole.user_id))
            .where(UserRole.role_id.in_(role_ids))
            .group_by(UserRole.role_id)
        ).all()
        user_count_map = dict(user_counts)

    return [
        RoleRead.model_validate(r).model_copy(
            update={
                "permissions_count": permission_count_map.get(r.id or 0, 0),
                "users_count": user_count_map.get(r.id or 0, 0),
            }
        )
        for r in roles
    ]


@router.get("/audit-log", response_model=RoleAuditListResponse)
async def get_role_audit_log(
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    db: Annotated[Session, Depends(get_db_session)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    checker.require(current_user.id, "role:read")
    events = list_role_audit_events()
    total = len(events)
    start = (page - 1) * page_size
    end = start + page_size
    return RoleAuditListResponse(
        items=events[start:end],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{role_id}", response_model=RoleRead)
async def get_role(
    role_id: int,
    db: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    """Get a single role by ID (includes its permissions via separate endpoint)."""
    checker.require(current_user.id, "role:read")
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, detail="Role not found")

    permissions_count = db.exec(
        select(func.count(RolePermission.permission_id)).where(
            RolePermission.role_id == role_id
        )
    ).one()
    users_count = db.exec(
        select(func.count(UserRole.user_id)).where(UserRole.role_id == role_id)
    ).one()

    return RoleRead.model_validate(role).model_copy(
        update={
            "permissions_count": permissions_count or 0,
            "users_count": users_count or 0,
        }
    )


# ── Create / Update / Delete ──────────────────────────────────────────────


@router.post("", response_model=RoleRead)
async def create_role(
    body: RoleCreate,
    db: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    """Create a new custom role."""
    checker.require(current_user.id, "role:create")

    # Escalation prevention: new role priority must not exceed caller's highest
    caller_roles = checker.get_user_roles(current_user.id)
    caller_max_priority = max((r["priority"] for r in caller_roles), default=0)
    new_priority = body.priority
    if new_priority > caller_max_priority:
        raise HTTPException(
            403,
            detail="Cannot create a role with higher priority than your own",
        )

    role = Role(
        slug=body.slug,
        name=body.name,
        description=body.description,
        priority=new_priority,
        is_system=False,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    audit_log.info(
        "role_created",
        extra={
            "actor_id": current_user.id,
            "role_id": role.id,
            "role_slug": role.slug,
        },
    )
    append_role_audit_event(
        actor_id=current_user.id,
        action="role_created",
        target_role_id=role.id,
        target_role_slug=role.slug,
    )
    return RoleRead.model_validate(role)


@router.put(
    "/{role_id}",
    response_model=RoleRead,
)
async def update_role(
    role_id: int,
    body: RoleUpdate,
    db: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    """Update a role's name, description, or priority."""
    checker.require(current_user.id, "role:update")
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, detail="Role not found")
    actor_is_admin = _is_admin(checker, current_user.id)
    if role.is_system and not actor_is_admin:
        raise HTTPException(403, detail="System roles cannot be modified")

    requested_priority = body.priority if body.priority is not None else role.priority
    if not actor_is_admin:
        caller_roles = checker.get_user_roles(current_user.id)
        caller_max_priority = max((r["priority"] for r in caller_roles), default=0)
        if requested_priority > caller_max_priority:
            raise HTTPException(
                403,
                detail="Cannot set a role priority higher than your own",
            )

    changed_fields = body.model_dump(exclude_unset=True)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(role, field, value)
    db.commit()
    db.refresh(role)
    audit_log.info(
        "role_updated",
        extra={
            "actor_id": current_user.id,
            "role_id": role_id,
            "fields": list(changed_fields.keys()),
        },
    )
    append_role_audit_event(
        actor_id=current_user.id,
        action="role_updated",
        target_role_id=role_id,
        target_role_slug=role.slug,
        diff_summary=", ".join(changed_fields.keys()) if changed_fields else None,
    )
    return RoleRead.model_validate(role)


@router.delete(
    "/{role_id}",
)
async def delete_role(
    role_id: int,
    db: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    """Delete a custom role."""
    checker.require(current_user.id, "role:delete")
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, detail="Role not found")
    actor_is_admin = _is_admin(checker, current_user.id)
    if role.is_system and not actor_is_admin:
        raise HTTPException(403, detail="System roles cannot be deleted")
    db.delete(role)
    db.commit()
    audit_log.info(
        "role_deleted",
        extra={
            "actor_id": current_user.id,
            "role_id": role_id,
            "role_slug": role.slug,
        },
    )
    append_role_audit_event(
        actor_id=current_user.id,
        action="role_deleted",
        target_role_id=role_id,
        target_role_slug=role.slug,
    )
    return {"ok": True}


@router.get("/{role_id}/users/count")
async def get_role_users_count(
    role_id: int,
    db: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    checker.require(current_user.id, "role:read")
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, detail="Role not found")

    count = db.exec(
        select(func.count(UserRole.user_id)).where(UserRole.role_id == role_id)
    ).one()
    return {"count": count or 0}


# ── Permissions on Roles ──────────────────────────────────────────────────


@router.get("/{role_id}/permissions", response_model=list[PermissionRead])
async def get_role_permissions(
    role_id: int,
    db: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    """Get all permissions assigned to a role."""
    checker.require(current_user.id, "role:read")
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, detail="Role not found")
    perms = db.exec(
        select(Permission)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == role_id)
    ).all()
    return [PermissionRead.model_validate(p) for p in perms]


@router.post(
    "/{role_id}/permissions",
)
async def add_permission_to_role(
    role_id: int,
    body: AddPermissionBody,
    db: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    """Add a permission to a role."""
    checker.require(current_user.id, "role:update")
    permission_id = body.permission_id
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, detail="Role not found")
    actor_is_admin = _is_admin(checker, current_user.id)
    if role.is_system and not actor_is_admin:
        raise HTTPException(403, detail="System roles cannot be modified")
    perm = db.get(Permission, permission_id)
    if not perm:
        raise HTTPException(404, detail="Permission not found")

    # Escalation prevention: caller must themselves have the permission being added.
    # Use expanded permissions so wildcards (e.g. course:*:org) resolve to concrete
    # permission strings (e.g. course:create:org) before comparison.
    if not actor_is_admin:
        caller_perms = checker.get_expanded_permissions(current_user.id)
        if perm.name not in caller_perms:
            raise HTTPException(
                403,
                detail=f"Cannot grant permission '{perm.name}' that you do not have",
            )

    # Check if already exists
    existing = db.exec(
        select(RolePermission).where(
            RolePermission.role_id == role_id,
            RolePermission.permission_id == permission_id,
        )
    ).first()
    if existing:
        raise HTTPException(409, detail="Permission already assigned to role")
    rp = RolePermission(role_id=role_id, permission_id=permission_id)
    db.add(rp)
    db.commit()
    audit_log.info(
        "permission_added_to_role",
        extra={
            "actor_id": current_user.id,
            "role_id": role_id,
            "permission_id": permission_id,
            "permission_name": perm.name,
        },
    )
    append_role_audit_event(
        actor_id=current_user.id,
        action="permission_added_to_role",
        target_role_id=role_id,
        target_role_slug=role.slug,
        diff_summary=perm.name,
    )
    return {"ok": True}


@router.delete(
    "/{role_id}/permissions/{permission_id}",
)
async def remove_permission_from_role(
    role_id: int,
    permission_id: int,
    db: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    """Remove a permission from a role."""
    checker.require(current_user.id, "role:update")
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, detail="Role not found")
    actor_is_admin = _is_admin(checker, current_user.id)
    if role.is_system and not actor_is_admin:
        raise HTTPException(403, detail="System roles cannot be modified")
    rp = db.exec(
        select(RolePermission).where(
            RolePermission.role_id == role_id,
            RolePermission.permission_id == permission_id,
        )
    ).first()
    if not rp:
        raise HTTPException(404, detail="Permission not assigned to this role")
    db.delete(rp)
    db.commit()
    perm = db.get(Permission, permission_id)
    audit_log.info(
        "permission_removed_from_role",
        extra={
            "actor_id": current_user.id,
            "role_id": role_id,
            "permission_id": permission_id,
        },
    )
    append_role_audit_event(
        actor_id=current_user.id,
        action="permission_removed_from_role",
        target_role_id=role_id,
        target_role_slug=role.slug,
        diff_summary=perm.name if perm else None,
    )
    return {"ok": True}
