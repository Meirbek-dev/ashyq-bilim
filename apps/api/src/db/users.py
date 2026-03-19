from typing import TYPE_CHECKING

from pydantic import ConfigDict, EmailStr
from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field

from src.db.permissions import RoleRead
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel


class UserBase(SQLModelStrictBaseModel):
    username: str
    first_name: str
    middle_name: str | None = ""
    last_name: str
    email: EmailStr
    avatar_image: str | None = ""
    bio: str | None = ""
    details: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    profile: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    theme: str | None = "default"
    locale: str | None = "ru-RU"


class UserCreate(UserBase):
    first_name: str = ""
    middle_name: str | None = ""
    last_name: str = ""
    password: str


class UserUpdate(SQLModelStrictBaseModel):
    username: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    avatar_image: str | None = None
    bio: str | None = None
    details: dict | None = None
    profile: dict | None = None
    theme: str | None = None
    locale: str | None = None


class UserUpdatePassword(SQLModelStrictBaseModel):
    old_password: str
    new_password: str


class UserRead(UserBase):
    id: int
    user_uuid: str


class PublicUser(UserRead):
    pass


class UserSessionRole(PydanticStrictBaseModel):
    role: RoleRead
    model_config = ConfigDict(arbitrary_types_allowed=True)


class UserSession(PydanticStrictBaseModel):
    user: UserRead
    roles: list[UserSessionRole]
    permissions: list[
        str
    ] = []  # Effective permissions: list of permission strings, e.g. "course:create:org"
    permissions_timestamp: int | None = (
        None  # Unix timestamp when permissions were loaded
    )
    model_config = ConfigDict(arbitrary_types_allowed=True)


class AnonymousUser(SQLModelStrictBaseModel):
    id: int = 0
    user_uuid: str = "user_anonymous"
    username: str = "anonymous"
    email: str | None = "anonymous@example.com"


class InternalUser(SQLModelStrictBaseModel):
    id: int = 0
    user_uuid: str = "user_internal"
    username: str = "internal"


class User(UserBase, table=True):
    __table_args__ = (
        UniqueConstraint("username", name="uq_user_username"),
        UniqueConstraint("email", name="uq_user_email"),
        UniqueConstraint("user_uuid", name="uq_user_user_uuid"),
    )

    id: int | None = Field(default=None, primary_key=True)
    password: str = ""
    user_uuid: str = ""
    email_verified: bool = False
    creation_date: str = ""
    update_date: str = ""


def rebuild_user_models() -> None:
    """Rebuild user models to resolve forward references"""
    UserSessionRole.model_rebuild()
    UserSession.model_rebuild()
