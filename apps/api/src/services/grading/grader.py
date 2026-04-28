"""Backward-compatible grading dispatcher facade."""

from src.db.grading.submissions import AssessmentType
from src.services.grading.registry import GraderRegistry, GradingResult


def grade_submission(
    assessment_type: AssessmentType,
    **kwargs: object,
) -> GradingResult:
    """Grade a submission by delegating to the registered grader."""
    return GraderRegistry.grade(assessment_type, **kwargs)


__all__ = ["GraderRegistry", "GradingResult", "grade_submission"]
