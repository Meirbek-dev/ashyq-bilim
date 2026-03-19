from datetime import datetime

import orjson
from fastapi import HTTPException, Request
from pydantic import EmailStr
from sqlmodel import Session, select
from ulid import ULID

from config.config import get_settings
from src.db.organizations import Organization, OrganizationRead
from src.db.users import AnonymousUser, PublicUser, User, UserRead
from src.security.security import generate_secure_code, security_hash_password
from src.services.cache.redis_client import delete_keys, get_json, get_redis_client
from src.services.platform import get_platform_organization
from src.services.users.emails import send_password_reset_email


async def send_reset_password_code(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    email: EmailStr,
) -> str:
    # Get user
    statement = select(User).where(User.email == email)
    user = db_session.exec(statement).first()

    if not user:
        raise HTTPException(
            status_code=400,
            detail="User does not exist",
        )

    org = get_platform_organization(db_session)

    # Redis init
    settings = get_settings()
    redis_conn_string = settings.redis_config.redis_connection_string

    if not redis_conn_string:
        raise HTTPException(
            status_code=500,
            detail="Redis connection string not found",
        )

    # Connect to Redis (use cached client)
    r = get_redis_client()

    if not r:
        raise HTTPException(
            status_code=500,
            detail="Could not connect to Redis",
        )
    # Generate reset code
    generated_reset_code = generate_secure_code()
    reset_email_invite_uuid = f"reset_email_invite_code_{ULID()}"

    ttl = int(datetime.now().timestamp()) + 60 * 60 * 1  # 1 hour

    resetCodeObject = {
        "reset_code": generated_reset_code,
        "reset_email_invite_uuid": reset_email_invite_uuid,
        "reset_code_expires": ttl,
        "reset_code_type": "signup",
        "created_at": datetime.now().isoformat(),
        "created_by": user.user_uuid,
    }

    r.set(
        f"{reset_email_invite_uuid}:user:{user.user_uuid}:platform:code:{generated_reset_code}",
        orjson.dumps(resetCodeObject),
        ex=ttl,
    )

    user = UserRead.model_validate(user)

    org = OrganizationRead.model_validate(org)

    # Send reset code via email
    isEmailSent = send_password_reset_email(
        generated_reset_code=generated_reset_code,
        user=user,
        email=user.email,
    )

    if not isEmailSent:
        raise HTTPException(
            status_code=500,
            detail="Ошибка при отправлении кода сброса пароля",
        )

    return "Reset code sent"


async def change_password_with_reset_code(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    new_password: str,
    email: EmailStr,
    reset_code: str,
) -> str:
    # Get user
    statement = select(User).where(User.email == email)
    user = db_session.exec(statement).first()

    if not user:
        raise HTTPException(
            status_code=400,
            detail="User does not exist",
        )

    org = get_platform_organization(db_session)

    # Redis init
    settings = get_settings()
    redis_conn_string = settings.redis_config.redis_connection_string

    if not redis_conn_string:
        raise HTTPException(
            status_code=500,
            detail="Redis connection string not found",
        )

    # Connect to Redis (use cached client)
    r = get_redis_client()

    if not r:
        raise HTTPException(
            status_code=500,
            detail="Could not connect to Redis",
        )

    # Get reset code
    reset_code_key = f"*:user:{user.user_uuid}:platform:code:{reset_code}"
    keys = r.keys(reset_code_key)

    if not keys:
        raise HTTPException(
            status_code=400,
            detail="Reset code not found",
        )

    # Get reset code object
    key = (
        keys[0].decode("utf-8") if isinstance(keys[0], (bytes, bytearray)) else keys[0]
    )
    reset_code_object = get_json(key)

    if reset_code_object is None:
        raise HTTPException(
            status_code=400,
            detail="Reset code value not found",
        )

    # Check if reset code is expired
    if reset_code_object["reset_code_expires"] < int(datetime.now().timestamp()):
        raise HTTPException(
            status_code=400,
            detail="Reset code expired",
        )

    # Change password
    user.password = security_hash_password(new_password)
    db_session.add(user)

    db_session.commit()
    db_session.refresh(user)

    # Delete reset code
    key = (
        keys[0].decode("utf-8") if isinstance(keys[0], (bytes, bytearray)) else keys[0]
    )
    delete_keys(key)

    return "Password changed"
