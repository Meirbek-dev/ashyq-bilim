"""Shared constants for the assessment service layer."""

from src.db.assessments import AssessmentLifecycle
from src.db.courses.activities import ActivitySubTypeEnum, ActivityTypeEnum
from src.db.grading.submissions import AssessmentType, Submission

ASSESSABLE_ACTIVITY_TYPES = {
    ActivityTypeEnum.TYPE_ASSIGNMENT,
    ActivityTypeEnum.TYPE_EXAM,
    ActivityTypeEnum.TYPE_QUIZ,
    ActivityTypeEnum.TYPE_CODE_CHALLENGE,
}

_KIND_TO_ACTIVITY: dict[
    AssessmentType, tuple[ActivityTypeEnum, ActivitySubTypeEnum]
] = {
    AssessmentType.ASSIGNMENT: (
        ActivityTypeEnum.TYPE_ASSIGNMENT,
        ActivitySubTypeEnum.SUBTYPE_ASSIGNMENT_ANY,
    ),
    AssessmentType.EXAM: (
        ActivityTypeEnum.TYPE_EXAM,
        ActivitySubTypeEnum.SUBTYPE_EXAM_STANDARD,
    ),
    AssessmentType.CODE_CHALLENGE: (
        ActivityTypeEnum.TYPE_CODE_CHALLENGE,
        ActivitySubTypeEnum.SUBTYPE_CODE_GENERAL,
    ),
    AssessmentType.QUIZ: (
        ActivityTypeEnum.TYPE_QUIZ,
        ActivitySubTypeEnum.SUBTYPE_QUIZ_STANDARD,
    ),
}

_ACTIVITY_TO_KIND: dict[ActivityTypeEnum, AssessmentType] = {
    ActivityTypeEnum.TYPE_ASSIGNMENT: AssessmentType.ASSIGNMENT,
    ActivityTypeEnum.TYPE_EXAM: AssessmentType.EXAM,
    ActivityTypeEnum.TYPE_QUIZ: AssessmentType.QUIZ,
    ActivityTypeEnum.TYPE_CODE_CHALLENGE: AssessmentType.CODE_CHALLENGE,
}

_ALLOWED_LIFECYCLE_TRANSITIONS: dict[
    AssessmentLifecycle, frozenset[AssessmentLifecycle]
] = {
    AssessmentLifecycle.DRAFT: frozenset({
        AssessmentLifecycle.SCHEDULED,
        AssessmentLifecycle.PUBLISHED,
        AssessmentLifecycle.ARCHIVED,
    }),
    AssessmentLifecycle.SCHEDULED: frozenset({
        AssessmentLifecycle.DRAFT,
        AssessmentLifecycle.PUBLISHED,
        AssessmentLifecycle.ARCHIVED,
    }),
    AssessmentLifecycle.PUBLISHED: frozenset({
        AssessmentLifecycle.DRAFT,
        AssessmentLifecycle.ARCHIVED,
    }),
    AssessmentLifecycle.ARCHIVED: frozenset({
        AssessmentLifecycle.DRAFT,
    }),
}

_REVIEW_SORT_MAP = {
    "submitted_at": Submission.submitted_at,
    "final_score": Submission.final_score,
    "created_at": Submission.created_at,
    "attempt_number": Submission.attempt_number,
}
