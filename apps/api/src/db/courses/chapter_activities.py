from sqlalchemy import BigInteger, Column, ForeignKey, Integer
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class ChapterActivity(SQLModelStrictBaseModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    order: int
    chapter_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("chapter.id", ondelete="CASCADE"))
    )
    activity_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("activity.id", ondelete="CASCADE"))
    )
    course_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("course.id", ondelete="CASCADE"))
    )
    creation_date: str
    update_date: str
