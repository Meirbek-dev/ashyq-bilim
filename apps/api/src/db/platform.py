from typing import TYPE_CHECKING, Literal

from pydantic import ConfigDict, model_validator
from sqlalchemy import JSON, Column
from sqlmodel import Field

from src.db.permissions import RoleRead
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel

if TYPE_CHECKING:
    from src.db.users import UserRead


class FeatureFlag(PydanticStrictBaseModel):
    enabled: bool = True
    limit: int = 10


class AIFeatureFlag(FeatureFlag):
    model: str = "gpt-5.4-nano"
    streaming_enabled: bool = True
    response_cache_enabled: bool = True
    semantic_cache_enabled: bool = True
    max_tokens_per_request: int = 4000
    max_chat_history: int = 100
    rate_limit_per_user: int = 100


class MembersFeatureFlag(FeatureFlag):
    admin_limit: int = 1


class PaymentsFeatureFlag(PydanticStrictBaseModel):
    enabled: bool = True


class PlatformFeatures(PydanticStrictBaseModel):
    courses: FeatureFlag = Field(default_factory=FeatureFlag)
    members: MembersFeatureFlag = Field(default_factory=MembersFeatureFlag)
    usergroups: FeatureFlag = Field(default_factory=FeatureFlag)
    storage: FeatureFlag = Field(default_factory=FeatureFlag)
    ai: AIFeatureFlag = Field(default_factory=AIFeatureFlag)
    assignments: FeatureFlag = Field(default_factory=lambda: FeatureFlag(enabled=True))
    exams: FeatureFlag = Field(default_factory=lambda: FeatureFlag(enabled=True))
    payments: PaymentsFeatureFlag = Field(default_factory=PaymentsFeatureFlag)
    discussions: FeatureFlag = Field(default_factory=FeatureFlag)
    analytics: FeatureFlag = Field(default_factory=FeatureFlag)
    collaboration: FeatureFlag = Field(default_factory=FeatureFlag)
    api: FeatureFlag = Field(default_factory=FeatureFlag)


class PlatformConfigData(PydanticStrictBaseModel):
    config_version: str = "1.3"
    general: dict[str, str | bool] = Field(
        default_factory=lambda: {"enabled": True, "color": "normal"}
    )
    features: PlatformFeatures = Field(default_factory=PlatformFeatures)
    cloud: dict[str, Literal["free", "standard", "pro"] | bool] = Field(
        default_factory=lambda: {"plan": "free", "custom_domain": False}
    )
    landing: dict = Field(default_factory=dict)


class PlatformConfig(PydanticStrictBaseModel):
    config: PlatformConfigData = Field(default_factory=PlatformConfigData)
    creation_date: str | None = None
    update_date: str | None = None


def build_default_platform_config(
    *,
    landing: dict | None = None,
    creation_date: str | None = None,
    update_date: str | None = None,
) -> PlatformConfig:
    return PlatformConfig(
        config=PlatformConfigData(landing=landing or {}),
        creation_date=creation_date,
        update_date=update_date,
    )


class PlatformBase(SQLModelStrictBaseModel):
    """Base model for the platform with common fields."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str
    description: str | None = None
    about: str | None = None
    socials: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    links: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    logo_image: str | None = None
    thumbnail_image: str | None = None
    previews: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    label: str | None = None
    email: str


class Platform(PlatformBase, table=True):
    """Database table model for the platform."""

    id: int | None = Field(default=None, primary_key=True)
    creation_date: str = ""
    update_date: str = ""
    landing: dict | None = Field(default_factory=dict, sa_column=Column(JSON))


class PlatformUpdate(SQLModelStrictBaseModel):
    """Model for updating the platform."""

    name: str | None = None
    description: str | None = None
    about: str | None = None
    socials: dict | None = None
    links: dict | None = None
    logo_image: str | None = None
    thumbnail_image: str | None = None
    previews: dict | None = None
    label: str | None = None
    email: str | None = None
    update_date: str | None = None


class PlatformCreate(PlatformBase):
    """Model for creating the platform."""


class PlatformRead(PlatformBase):
    """Model for reading the platform with all related data."""

    config: PlatformConfig
    creation_date: str
    update_date: str

    @model_validator(mode="before")
    @classmethod
    def add_default_config(cls, value: object) -> object:
        if isinstance(value, Platform):
            data = value.model_dump()
        elif isinstance(value, dict):
            data = dict(value)
        else:
            return value

        if data.get("config") is None:
            data["config"] = build_default_platform_config(
                landing=data.get("landing"),
                creation_date=data.get("creation_date"),
                update_date=data.get("update_date"),
            )

        return data


class PlatformUser(PydanticStrictBaseModel):
    """Model representing a user's role on the platform."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    user: "UserRead"  # noqa: UP037
    role: RoleRead


class PaginatedPlatformUsers(PydanticStrictBaseModel):
    """Paginated response for platform users."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    users: list[PlatformUser]
    total: int
    page: int
    per_page: int
    total_pages: int


def rebuild_platform_models() -> None:
    """Rebuild platform models to resolve forward references."""
    from src.db.users import UserRead

    PlatformUser.model_rebuild()
