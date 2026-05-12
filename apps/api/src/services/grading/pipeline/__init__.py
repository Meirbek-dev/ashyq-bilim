"""Grading pipeline — explicit staged submission processing.

Stages:
  validate  → Parse and normalize answers
  enforce   → Check policy constraints (attempts, time, violations)
  grade     → Dispatch to GraderRegistry
  penalize  → Apply late + attempt penalties
  persist   → Write Submission + GradingEntry + Progress atomically
  emit      → Publish events to the bus (post-commit)
"""

from src.services.grading.pipeline.context import (
    EffectivePolicy,
    GradingContext,
    ParsedAnswers,
    PenaltyResult,
)

__all__ = [
    "EffectivePolicy",
    "GradingContext",
    "ParsedAnswers",
    "PenaltyResult",
]
