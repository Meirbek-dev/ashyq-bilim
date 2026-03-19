import contextlib
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlmodel import Session, select
from ulid import ULID

from src.db.organizations import Organization, OrganizationCreate
from src.db.permission_enums import RoleSlug
from src.db.users import User, UserCreate, UserRead
from src.security.rbac import PermissionChecker
from src.security.security import security_hash_password
from src.services.platform import get_platform_organization


# Install Default roles
def install_default_elements(db_session: Session) -> bool:
    """
    Install default elements including system roles and permissions.
    """
    checker = PermissionChecker(db_session)
    created_roles = checker.seed_default_roles()

    return len(created_roles) > 0


# Organization creation
def install_create_organization(org_object: OrganizationCreate, db_session: Session):
    org = Organization.model_validate(org_object)

    # Complete the org object
    org.creation_date = str(datetime.now())
    org.update_date = str(datetime.now())

    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return org


async def install_create_organization_user(
    user_object: UserCreate, db_session: Session
):
    user = User.model_validate(user_object)

    # Complete the user object
    user.user_uuid = f"user_{ULID()}"
    user.password = security_hash_password(user_object.password)
    user.email_verified = False
    user.creation_date = str(datetime.now())
    user.update_date = str(datetime.now())

    # Check if Organization exists
    org = get_platform_organization(db_session)

    if not org:
        raise HTTPException(
            status_code=409,
            detail="Organization does not exist",
        )

    # Username
    statement = select(User).where(User.username == user.username)
    result = db_session.exec(statement)

    if result.first():
        raise HTTPException(
            status_code=409,
            detail="Имя пользователя уже существует",
        )

    # Email
    statement = select(User).where(User.email == user.email)
    result = db_session.exec(statement)

    if result.first():
        raise HTTPException(
            status_code=409,
            detail="Пользователь с данной электронной почтой уже существует",
        )

    # Exclude unset values
    user_data = user.model_dump(exclude_unset=True)
    for key, value in user_data.items():
        setattr(user, key, value)

    # Add user to database
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    from src.db.permissions import Role

    admin_role = db_session.exec(
        select(Role).where(Role.slug == RoleSlug.ADMIN)
    ).first()
    if not admin_role:
        raise HTTPException(500, detail="Admin role not found")

    # Link user and organization by assigning admin role
    checker = PermissionChecker(db_session)
    checker.assign_role(
        user_id=user.id or 0,
        role_id=admin_role.id,
    )

    return UserRead.model_validate(user)
