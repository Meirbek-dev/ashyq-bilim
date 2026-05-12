"""
Typed Pydantic schemas for submission answer payloads and teacher batch grading.

Legacy per-type answer schemas (QuizAnswers, AssignmentAnswers) have been removed.
All submissions now use the canonical AssessmentDraftPatch.answers format with
typed ItemAnswer discriminated union from db/assessments.py.

Teacher grading input (TeacherGradeInput, ItemFeedback) lives in
submissions.py alongside the models it operates on.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from src.db.grading.submissions import ItemFeedback
from src.db.strict_base_model import PydanticStrictBaseModel


# ── Exam (kept for backward compat with existing exam grader) ─────────────────


class ExamQuestionAnswer(PydanticStrictBaseModel):
    """A student's answer to one exam question."""

    question_id: int
    selected_option_ids: list[str] = Field(default_factory=list)
    text_answer: str | None = None


class ExamSubmissionPayload(PydanticStrictBaseModel):
    """Complete exam submission payload.

    submitted_answers is a mapping of question_id → answer dict so the
    exam grader can look up answers by question ID without scanning a list.
    """

    submitted_answers: dict[int, ExamQuestionAnswer] = Field(default_factory=dict)
    started_at: datetime
    submitted_at: datetime


# ── Code challenge ────────────────────────────────────────────────────────────


class TestCaseResult(PydanticStrictBaseModel):
    """Result of a single test case execution."""

    test_id: str
    passed: bool
    weight: float = 1.0
    description: str = ""
    message: str = ""


class CodeChallengeSubmissionPayload(PydanticStrictBaseModel):
    """Complete code-challenge submission payload."""

    test_results: list[TestCaseResult] = Field(default_factory=list)
    code_strategy: Literal[
        "BEST_SUBMISSION",
        "ALL_OR_NOTHING",
        "LATEST_SUBMISSION",
        "PARTIAL_CREDIT",
    ] = "BEST_SUBMISSION"
    source_code: str | None = None  # Stored for teacher review, not graded directly


# ── Teacher batch grading ────────────────────────────────────────────────────


class BatchGradeItem(PydanticStrictBaseModel):
    """Single submission grade payload for batch teacher grading."""

    submission_uuid: str
    final_score: float = Field(..., ge=0, le=100)
    status: Literal["GRADED", "PUBLISHED", "RETURNED"]
    feedback: str | None = None
    item_feedback: list[ItemFeedback] | None = None


class BatchGradeRequest(PydanticStrictBaseModel):
    """Batch teacher grading request."""

    grades: list[BatchGradeItem] = Field(min_length=1, max_length=100)


class BatchGradeResultItem(PydanticStrictBaseModel):
    """Per-submission batch grading result."""

    submission_uuid: str
    success: bool
    error: str | None = None


class BatchGradeResponse(PydanticStrictBaseModel):
    """Batch teacher grading response."""

    results: list[BatchGradeResultItem] = Field(default_factory=list)
    succeeded: int = 0
    failed: int = 0


class BulkPublishGradesResponse(PydanticStrictBaseModel):
    """Response for POST /grading/activities/{activity_id}/publish-grades."""

    activity_id: int
    published_count: int  # submissions that had their grade published now
    already_published_count: int  # submissions already visible to students


class DeadlineExtensionRequest(PydanticStrictBaseModel):
    """Request for extending an activity deadline for selected students."""

    user_uuids: list[str] = Field(min_length=1, max_length=500)
    new_due_at: datetime
    reason: str = ""
