"""Assignment service package.

Re-exports the public API so callers that import from
``src.services.courses.activities.assignments`` continue to work unchanged.
"""

from src.services.courses.activities.assignments.crud import (
    create_assignment_with_activity,
    delete_assignment_from_activity_uuid,
    get_assignments_from_course,
    get_assignments_from_courses,
    get_editable_assignments_from_courses,
    read_assignment,
    read_assignment_from_activity_uuid,
    update_assignment,
)
from src.services.courses.activities.assignments.submissions import (
    _require_assignment_submit_access,
    get_assignment_draft_submission,
    save_assignment_draft_submission,
    submit_assignment_draft_submission,
)
from src.services.courses.activities.assignments.tasks import (
    create_assignment_task,
    delete_assignment_task,
    read_assignment_task,
    read_assignment_tasks,
    update_assignment_task,
)
from src.services.courses.activities.assignments.uploads import (
    put_assignment_task_reference_file,
    put_assignment_task_submission_file,
)

__all__ = [
    # submissions
    "_require_assignment_submit_access",
    # tasks
    "create_assignment_task",
    # crud
    "create_assignment_with_activity",
    "delete_assignment_from_activity_uuid",
    "delete_assignment_task",
    "get_assignment_draft_submission",
    "get_assignments_from_course",
    "get_assignments_from_courses",
    "get_editable_assignments_from_courses",
    # uploads
    "put_assignment_task_reference_file",
    "put_assignment_task_submission_file",
    "read_assignment",
    "read_assignment_from_activity_uuid",
    "read_assignment_task",
    "read_assignment_tasks",
    "save_assignment_draft_submission",
    "submit_assignment_draft_submission",
    "update_assignment",
    "update_assignment_task",
]
