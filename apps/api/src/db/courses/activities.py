from datetime import UTC, datetime, timezone
from enum import Enum, StrEnum

from pydantic import ConfigDict, field_validator
from sqlalchemy import JSON, BigInteger, Column, DateTime, ForeignKey, Integer, func
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class ActivityTypeEnum(StrEnum):
    TYPE_VIDEO = "TYPE_VIDEO"
    TYPE_DOCUMENT = "TYPE_DOCUMENT"
    TYPE_DYNAMIC = "TYPE_DYNAMIC"
    TYPE_ASSIGNMENT = "TYPE_ASSIGNMENT"
    TYPE_EXAM = "TYPE_EXAM"
    TYPE_CODE_CHALLENGE = "TYPE_CODE_CHALLENGE"
    TYPE_CUSTOM = "TYPE_CUSTOM"


class ActivitySubTypeEnum(StrEnum):
    # Dynamic
    SUBTYPE_DYNAMIC_PAGE = "SUBTYPE_DYNAMIC_PAGE"
    # Video
    SUBTYPE_VIDEO_YOUTUBE = "SUBTYPE_VIDEO_YOUTUBE"
    SUBTYPE_VIDEO_HOSTED = "SUBTYPE_VIDEO_HOSTED"
    # Document
    SUBTYPE_DOCUMENT_PDF = "SUBTYPE_DOCUMENT_PDF"
    SUBTYPE_DOCUMENT_DOC = "SUBTYPE_DOCUMENT_DOC"
    # Assignment
    SUBTYPE_ASSIGNMENT_ANY = "SUBTYPE_ASSIGNMENT_ANY"
    # Exam
    SUBTYPE_EXAM_STANDARD = "SUBTYPE_EXAM_STANDARD"
    # Code Challenge
    SUBTYPE_CODE_GENERAL = "SUBTYPE_CODE_GENERAL"
    SUBTYPE_CODE_COMPETITIVE = "SUBTYPE_CODE_COMPETITIVE"
    # Custom
    SUBTYPE_CUSTOM = "SUBTYPE_CUSTOM"


class ActivityBase(SQLModelStrictBaseModel):
    name: str
    activity_type: ActivityTypeEnum
    activity_sub_type: ActivitySubTypeEnum
    content: dict = Field(default_factory=dict, sa_column=Column(JSON))
    details: dict | None = Field(default=None, sa_column=Column(JSON))
    published: bool = False

    @field_validator("activity_type", mode="before")
    @classmethod
    def validate_activity_type(cls, v):
        if isinstance(v, str):
            return ActivityTypeEnum(v)
        return v

    @field_validator("activity_sub_type", mode="before")
    @classmethod
    def validate_activity_sub_type(cls, v):
        if isinstance(v, str):
            return ActivitySubTypeEnum(v)
        return v


class Activity(ActivityBase, table=True):
    model_config = ConfigDict(from_attributes=True)

    id: int | None = Field(default=None, primary_key=True)
    course_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("course.id", ondelete="CASCADE")),
    )
    creator_id: int | None = Field(
        default=None,
        sa_column=Column(BigInteger, ForeignKey("user.id", ondelete="SET NULL")),
    )
    activity_uuid: str = ""
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    update_date: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
        ),
    )


class ActivityCreate(ActivityBase):
    chapter_id: int
    activity_type: ActivityTypeEnum = ActivityTypeEnum.TYPE_CUSTOM
    activity_sub_type: ActivitySubTypeEnum = ActivitySubTypeEnum.SUBTYPE_CUSTOM
    details: dict = Field(default_factory=dict, sa_column=Column(JSON))
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


class ActivityUpdate(ActivityBase):
    name: str | None = None
    activity_type: ActivityTypeEnum | None = None
    activity_sub_type: ActivitySubTypeEnum | None = None
    content: dict | None = None
    details: dict | None = None
    published: bool | None = None
    published_version: int | None = None
    version: int | None = None
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


class ActivityRead(ActivityBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int | None
    activity_uuid: str
    creation_date: datetime
    update_date: datetime

    @field_validator("creation_date", "update_date", mode="before")
    @classmethod
    def validate_datetimes(cls, v):
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            value = v.strip()
            if value.endswith("Z"):
                value = f"{value[:-1]}+00:00"
            return datetime.fromisoformat(value)
        return v


class ActivityReadWithPermissions(ActivityRead):
    """Activity response with permission metadata."""

    can_update: bool
    can_delete: bool
    is_owner: bool
    is_creator: bool
    available_actions: list[str]
