from sqlalchemy import Column, ForeignKey, Integer
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class CourseChapter(SQLModelStrictBaseModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    order: int
    course_id: int = Field(
        sa_column=Column(Integer, ForeignKey("course.id", ondelete="CASCADE"))
    )
    chapter_id: int = Field(
        sa_column=Column(Integer, ForeignKey("chapter.id", ondelete="CASCADE"))
    )
    creation_date: str
    update_date: str
