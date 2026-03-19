import logging
from datetime import datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import ConfigDict, EmailStr
from sqlmodel import Session

from config.config import get_settings
from src.core.events.database import get_db_session
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import AnonymousUser, PublicUser, UserRead
from src.security.auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    get_access_token_from_request,
    get_current_user_optional,
    oauth2_scheme_optional,
)
from src.services.auth.utils import signWithGoogle

router = APIRouter()
logger = logging.getLogger(__name__)


class TokensResponse(PydanticStrictBaseModel):
    access_token: str
    refresh_token: str
    expiry: int


class LoginResponse(PydanticStrictBaseModel):
    user: UserRead
    tokens: TokensResponse


COOKIE_TTL_SECONDS = int(timedelta(hours=8).total_seconds())
REFRESH_COOKIE_TTL_SECONDS = int(timedelta(days=30).total_seconds())
ACCESS_COOKIE_KEY = "access_token_cookie"
REFRESH_COOKIE_KEY = "refresh_token_cookie"


def _set_access_cookie(response: Response, value: str) -> None:
    """
    Set access token cookie with secure configuration.

    Security features:
    - httponly=True: Prevents JavaScript access (XSS protection)
    - secure=True: HTTPS only (when SSL is enabled)
    - samesite='lax': CSRF protection while allowing normal navigation
    """
    settings = get_settings()
    cookie_domain = settings.hosting_config.cookie_config.domain
    is_ssl_enabled = settings.hosting_config.ssl

    cookie_kwargs: dict[str, object] = {
        "httponly": True,  # ✅ Prevent XSS attacks
        "secure": bool(is_ssl_enabled),  # ✅ HTTPS only in production
        "samesite": "lax",  # ✅ CSRF protection
        "expires": COOKIE_TTL_SECONDS,
    }

    if cookie_domain:
        cookie_kwargs["domain"] = cookie_domain

    response.set_cookie(
        key=ACCESS_COOKIE_KEY,
        value=value,
        **cookie_kwargs,
    )


def _set_refresh_cookie(response: Response, value: str) -> None:
    settings = get_settings()
    cookie_domain = settings.hosting_config.cookie_config.domain
    is_ssl_enabled = settings.hosting_config.ssl

    cookie_kwargs: dict[str, object] = {
        "httponly": True,
        "secure": is_ssl_enabled,
        "samesite": "lax",
        "max_age": REFRESH_COOKIE_TTL_SECONDS,
    }

    if cookie_domain:
        cookie_kwargs["domain"] = cookie_domain

    response.set_cookie(
        key=REFRESH_COOKIE_KEY,
        value=value,
        **cookie_kwargs,
    )


def _clear_auth_cookies(response: Response) -> None:
    settings = get_settings()
    cookie_domain = settings.hosting_config.cookie_config.domain

    delete_kwargs: dict[str, object] = {}
    if cookie_domain:
        delete_kwargs["domain"] = cookie_domain

    response.delete_cookie(ACCESS_COOKIE_KEY, **delete_kwargs)
    response.delete_cookie(REFRESH_COOKIE_KEY, **delete_kwargs)


@router.get("/refresh")
def refresh(
    request: Request,
    response: Response,
) -> dict[str, str | int]:
    """
    Token refresh with rotation.

    Security features:
    - Issues new refresh token on each use (token rotation)
    - Invalidates old refresh token
    - Logs refresh events for monitoring
    - Returns both new access and refresh tokens

    This prevents stolen refresh tokens from being used indefinitely.
    """
    refresh_token = request.cookies.get(REFRESH_COOKIE_KEY)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_data = decode_refresh_token(refresh_token)
    current_user = token_data.username

    # Create NEW tokens (both access and refresh)
    new_access_token = create_access_token({"sub": current_user})
    new_refresh_token = create_refresh_token({"sub": current_user})

    # Set the new refresh token in cookies (this invalidates the old one)
    _set_refresh_cookie(response, new_refresh_token)

    # Calculate token expiry timestamp (8 hours from now in milliseconds)
    expiry_timestamp = int(
        (datetime.now().timestamp() + timedelta(hours=8).total_seconds()) * 1000
    )

    # Log token refresh with rotation
    client_ip = request.client.host if request.client else "unknown"
    logger.info(
        "Token refresh with rotation",
        extra={
            "email": current_user,
            "ip_address": client_ip,
            "rotation": True,
        },
    )

    _set_access_cookie(response, new_access_token)

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,  # Return new refresh token
        "expiry": expiry_timestamp,
    }


@router.post("/login", response_model=LoginResponse)
async def login(
    request: Request,
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    # Extract client info for security logging
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")

    user = await authenticate_user(
        request, form_data.username, form_data.password, db_session
    )

    if not user:
        # Log failed authentication attempt
        logger.warning(
            "Failed login attempt",
            extra={
                "email": form_data.username,
                "ip_address": client_ip,
                "user_agent": user_agent,
                "reason": "invalid_credentials",
            },
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token({"sub": form_data.username})
    refresh_token = create_refresh_token({"sub": form_data.username})
    _set_refresh_cookie(response, refresh_token)

    # set cookies using fastapi
    _set_access_cookie(response, access_token)

    user_read = UserRead.model_validate(user)

    # Calculate token expiry timestamp (8 hours from now in milliseconds)
    expiry_timestamp = int(
        (datetime.now().timestamp() + timedelta(hours=8).total_seconds()) * 1000
    )

    # Log successful authentication
    logger.info(
        "Successful login",
        extra={
            "user_id": user.id,
            "email": user.email,
            "ip_address": client_ip,
            "user_agent": user_agent,
        },
    )

    return {
        "user": user_read,
        "tokens": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expiry": expiry_timestamp,
        },
    }


class ThirdPartyLogin(PydanticStrictBaseModel):
    email: EmailStr
    provider: Literal["google"]
    access_token: str
    model_config = ConfigDict(arbitrary_types_allowed=True)


@router.post("/oauth", response_model=LoginResponse)
async def third_party_login(
    request: Request,
    response: Response,
    body: ThirdPartyLogin,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_current_user_optional)
    ] = None,
    db_session=Depends(get_db_session),
):
    # Extract client info for security logging
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")

    # Google
    if body.provider == "google":
        user = await signWithGoogle(
            request, body.access_token, body.email, current_user, db_session
        )

    if not user:
        # Log failed OAuth attempt
        logger.warning(
            "Failed OAuth login",
            extra={
                "provider": body.provider,
                "email": body.email,
                "ip_address": client_ip,
                "user_agent": user_agent,
                "reason": "oauth_authentication_failed",
            },
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token({"sub": user.email})
    refresh_token = create_refresh_token({"sub": user.email})
    _set_refresh_cookie(response, refresh_token)

    # set cookies using fastapi
    _set_access_cookie(response, access_token)

    user_read = UserRead.model_validate(user)

    # Calculate token expiry timestamp (8 hours from now in milliseconds)
    expiry_timestamp = int(
        (datetime.now().timestamp() + timedelta(hours=8).total_seconds()) * 1000
    )

    # Log successful OAuth authentication
    logger.info(
        "Successful OAuth login",
        extra={
            "user_id": user.id,
            "email": user.email,
            "provider": body.provider,
            "ip_address": client_ip,
            "user_agent": user_agent,
        },
    )

    return {
        "user": user_read,
        "tokens": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expiry": expiry_timestamp,
        },
    }


@router.delete("/logout")
def logout(
    request: Request,
    response: Response,
    token: Annotated[str | None, Depends(oauth2_scheme_optional)],
) -> dict[str, str]:
    """
    Because the JWT are stored in an httponly cookie now, we cannot
    log the user out by simply deleting the cookies in the frontend.
    We need the backend to send us a response to delete the cookies.
    """
    resolved_token = get_access_token_from_request(request, token)
    if not resolved_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user info before logout for logging
    token_data = decode_access_token(resolved_token)
    current_user = token_data.username
    client_ip = request.client.host if request.client else "unknown"

    # Log logout event
    logger.info(
        "User logout",
        extra={
            "email": current_user,
            "ip_address": client_ip,
        },
    )

    _clear_auth_cookies(response)
    return {"msg": "Successfully logout"}
