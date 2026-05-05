"""
Quiz-related database models for attempts, statistics, and settings.
"""

from datetime import datetime

from pydantic import Field as PydanticField
from sqlalchemy import Column, ForeignKey, Index, UniqueConstraint
from sqlmodel import Field

from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel


class QuizQuestionStat(SQLModelStrictBaseModel, table=True):
    """
    QuizQuestionStat model for per-question analytics.

    Tracks how many times a question was attempted and answered correctly.
    """

    __tablename__ = "quiz_question_stat"
    __table_args__ = (
        Index("idx_quiz_question_stat_activity", "activity_id"),
        UniqueConstraint(
            "activity_id", "question_id", name="uq_quiz_question_activity_question"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    activity_id: int = Field(
        sa_column=Column(ForeignKey("activity.id", ondelete="CASCADE"))
    )
    question_id: str = Field()

    # Analytics
    total_attempts: int = Field(default=0)
    correct_count: int = Field(default=0)
    avg_time_seconds: float | None = Field(default=None)

    # Audit
    creation_date: str = Field()
    update_date: str = Field()


class QuizQuestionStatRead(PydanticStrictBaseModel):
    """Schema for reading quiz question statistics."""

    id: int
    activity_id: int
    question_id: str
    total_attempts: int
    correct_count: int
    avg_time_seconds: float | None
    creation_date: str
    update_date: str


class QuizSettings(PydanticStrictBaseModel):
    """
    Quiz settings that can be configured by instructors.

    Stored in the Block.content JSON field.
    """

    max_attempts: int | None = PydanticField(default=None, ge=1, le=5)
    time_limit_seconds: int | None = PydanticField(default=None, ge=50)
    max_score_penalty_per_attempt: float | None = PydanticField(
        default=None, ge=0.0, le=100.0
    )

    # Anti-cheat settings
    prevent_copy: bool = PydanticField(default=True)
    track_violations: bool = PydanticField(default=True)
    max_violations: int = PydanticField(default=3, ge=1, le=10)
    block_on_violations: bool = PydanticField(default=True)


class QuizSubmissionRequest(PydanticStrictBaseModel):
    """Request payload for quiz submission."""

    answers: list[dict[str, object]] = PydanticField(default_factory=list)
    start_ts: datetime | None = PydanticField(default=None)
    end_ts: datetime | None = PydanticField(default=None)
    idempotency_key: str | None = PydanticField(default=None)
    violation_count: int = PydanticField(default=0, ge=0)
    violations: dict[str, object] = PydanticField(default_factory=dict)


class QuizGradingResult(PydanticStrictBaseModel):
    """Grading result for a quiz submission."""

    total_score: float
    max_score: float
    percentage: float
    passed: bool
    per_question: list[dict[str, object]]
    triggered_level_up: bool = False
    xp_awarded: int = 0


class QuizSubmissionResponse(PydanticStrictBaseModel):
    """Response for quiz submission."""

    attempt_uuid: str
    attempt_number: int
    grading_result: QuizGradingResult
    max_attempts_reached: bool = False
    violations_exceeded: bool = False
