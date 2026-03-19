from datetime import datetime

from pydantic import ConfigDict, field_validator
from sqlmodel import Column, Field, ForeignKey, Integer

from src.db.courses.activities import ActivityRead, ActivityReadWithPermissions
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel


class ChapterBase(SQLModelStrictBaseModel):
    name: str
    description: str | None = ""
    thumbnail_image: str | None = ""
    course_id: int = Field(
        sa_column=Column(
            "course_id", Integer, ForeignKey("course.id", ondelete="CASCADE")
        )
    )


class Chapter(ChapterBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    chapter_uuid: str = ""
    creation_date: str = ""
    update_date: str = ""
    creator_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL")),
    )


class ChapterCreate(ChapterBase):
    # referenced order here will be ignored and just used for validation
    # used order will be the next available.
    last_known_update_date: datetime | None = None

    @field_validator("last_known_update_date", mode="before")
    @classmethod
    def validate_last_known_update_date(cls, value):
        if isinstance(value, datetime) or value is None:
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if normalized.endswith("Z"):
                normalized = f"{normalized[:-1]}+00:00"
            return datetime.fromisoformat(normalized)
        return value


class ChapterUpdate(SQLModelStrictBaseModel):
    name: str | None = None
    description: str | None = None
    thumbnail_image: str | None = None
    course_id: int | None = None
    last_known_update_date: datetime | None = None

    @field_validator("last_known_update_date", mode="before")
    @classmethod
    def validate_last_known_update_date(cls, value):
        if isinstance(value, datetime) or value is None:
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if normalized.endswith("Z"):
                normalized = f"{normalized[:-1]}+00:00"
            return datetime.fromisoformat(normalized)
        return value


class ChapterRead(ChapterBase):
    id: int
    activities: list[ActivityRead]
    chapter_uuid: str
    creation_date: str
    update_date: str
    model_config = ConfigDict(arbitrary_types_allowed=True)


class ChapterReadWithPermissions(ChapterBase):
    """ChapterRead that includes per-activity permission metadata."""

    id: int
    activities: list[ActivityReadWithPermissions]
    chapter_uuid: str
    creation_date: str
    update_date: str
    model_config = ConfigDict(arbitrary_types_allowed=True)


class ActivityOrder(PydanticStrictBaseModel):
    activity_id: int


class ChapterOrder(PydanticStrictBaseModel):
    chapter_id: int
    activities_order_by_ids: list[ActivityOrder]


class ChapterUpdateOrder(PydanticStrictBaseModel):
    last_known_update_date: datetime | None = None
    chapter_order_by_ids: list[ChapterOrder]

    @field_validator("last_known_update_date", mode="before")
    @classmethod
    def validate_last_known_update_date(cls, value):
        if isinstance(value, datetime) or value is None:
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if normalized.endswith("Z"):
                normalized = f"{normalized[:-1]}+00:00"
            return datetime.fromisoformat(normalized)
        return value
