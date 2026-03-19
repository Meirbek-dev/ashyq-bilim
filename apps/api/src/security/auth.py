import logging
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import AnonymousUser, PublicUser, User, UserRead
from src.security.rbac import AuthenticationRequired
from src.security.security import ALGORITHM, get_secret_key
from src.services.users.users import security_get_user, security_verify_password

logger = logging.getLogger(__name__)

ACCESS_TOKEN_EXPIRE = timedelta(hours=8)
REFRESH_TOKEN_EXPIRE = timedelta(days=30)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(
    tokenUrl="/api/auth/login", auto_error=False
)


class Token(PydanticStrictBaseModel):
    access_token: str
    token_type: str


class TokenData(PydanticStrictBaseModel):
    username: str | None = None


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _decode_token(token: str, expected_type: str) -> TokenData:
    try:
        payload = jwt.decode(token, get_secret_key(), algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise _credentials_exception() from exc

    token_type = payload.get("type")
    username = payload.get("sub")

    if token_type != expected_type or not isinstance(username, str) or not username:
        raise _credentials_exception()

    return TokenData(username=username)


async def authenticate_user(
    request: Request,
    email: str,
    password: str,
    db_session: Session,
) -> User | bool:
    user = await security_get_user(request, db_session, email)
    if not user:
        return False
    if not security_verify_password(password, user.password):
        return False
    return user


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + (expires_delta or ACCESS_TOKEN_EXPIRE)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, get_secret_key(), algorithm=ALGORITHM)


def create_refresh_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + (expires_delta or REFRESH_TOKEN_EXPIRE)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, get_secret_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> TokenData:
    return _decode_token(token, expected_type="access")


def decode_refresh_token(token: str) -> TokenData:
    return _decode_token(token, expected_type="refresh")


def get_access_token_from_request(
    request: Request,
    header_token: str | None = None,
) -> str | None:
    if isinstance(header_token, str) and header_token.strip():
        return header_token

    cookie_token = request.cookies.get("access_token_cookie")
    if isinstance(cookie_token, str) and cookie_token.strip():
        return cookie_token

    return None


async def get_current_user_from_token(
    request: Request,
    token: str,
    db_session: Session,
) -> PublicUser:
    token_data = decode_access_token(token)
    user = await security_get_user(request, db_session, email=token_data.username)
    if user is None:
        raise _credentials_exception()
    return PublicUser(**user.model_dump())


async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme_optional),
    db_session: Session = Depends(get_db_session),
) -> PublicUser:
    resolved_token = get_access_token_from_request(request, token)
    if resolved_token is None:
        raise _credentials_exception()
    return await get_current_user_from_token(request, resolved_token, db_session)


async def get_current_user_bearer(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db_session: Session = Depends(get_db_session),
) -> PublicUser:
    return await get_current_user_from_token(request, token, db_session)


async def get_current_user_optional(
    request: Request,
    token: str | None = Depends(oauth2_scheme_optional),
    db_session: Session = Depends(get_db_session),
) -> PublicUser | AnonymousUser:
    resolved_token = get_access_token_from_request(request, token)
    if resolved_token is None:
        return AnonymousUser()
    return await get_current_user_from_token(request, resolved_token, db_session)


async def non_public_endpoint(current_user: UserRead | AnonymousUser) -> None:
    if isinstance(current_user, AnonymousUser):
        raise AuthenticationRequired
