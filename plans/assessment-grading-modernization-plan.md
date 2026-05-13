## Legacy Assignment Inventory

### Backend — Files Still Present

| #   | File                                                                  | What it is                                                                                  |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | `apps/api/src/tasks/assignment_scheduler.py`                          | Legacy assignment-specific scheduler (should be replaced by assessment lifecycle scheduler) |
| 2   | `apps/api/src/services/courses/activities/uploads/tasks_ref_files.py` | Upload path builder using legacy `/assignments/{uuid}/tasks/{uuid}` URL pattern             |
| 3   | `apps/api/src/services/courses/courses.py`                            | Contains `grade_assignments` permission key (lines 1668, 1840)                              |

### Backend — Migrations Referencing Legacy

| #   | File                                                                             | Purpose                                                                                                                              |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 4   | `migrations/versions/x4y5z6a7b8c9_backfill_assignment_submissions.py`            | Backfill migration reading from legacy `assignment`, `assignmenttask`, `assignmentusersubmission`, `assignmenttasksubmission` tables |
| 5   | `migrations/versions/y5z6a7b8c9d0_drop_legacy_assignment_submissions.py`         | Drops `assignmenttasksubmission` and `assignmentusersubmission`                                                                      |
| 6   | `migrations/versions/e5f6g7h8i9j0_convert_quiz_assignments_to_exams.py`          | Converts legacy quiz `assignmenttask` rows into exam activities                                                                      |
| 7   | `migrations/versions/2026_05_12_c8f2d4a91e6b_assessment_modernization_phase0.py` | Strips `legacy_assignment_type`, `legacy_task_submission_uuid` from metadata; drops legacy tables                                    |
| 8   | `migrations/versions/2026_05_13_d9a1c7e5b402_assessment_grading_finalization.py` | Defines `LEGACY_TABLES` and `LEGACY_METADATA_KEYS` tuples; final destructive drop of all legacy tables                               |

### Backend — Grading Pipeline

| #   | File                                                 | What it is                                                                |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| 9   | `apps/api/src/services/grading/pipeline/validate.py` | Defines `LEGACY_ANSWER_KEYS` frozenset and rejects legacy answer payloads |
| 10  | `apps/api/src/db/grading/entries.py`                 | `breakdown` field marked as "Legacy alias" for `effective_breakdown`      |

### Frontend — Files Still Present

| #   | File                                                                                    | What it is                                                                                                 |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 11  | `apps/web/src/components/Objects/Modals/Activities/Assignments/EditAssignmentModal.tsx` | Legacy assignment edit modal using `queryKeys.assignments.detail()`                                        |
| 12  | `apps/web/src/lib/react-query/queryKeys.ts`                                             | `queryKeys.assignments` namespace with `activity`, `detail`, `submissions`, `taskSubmission`, `tasks` keys |
| 13  | `apps/web/src/features/courses/queries/course.query.ts`                                 | `activityAssignmentUuidQueryOptions()` function using `queryKeys.assignments.activity()`                   |
| 14  | `apps/web/src/types/grading.ts`                                                         | Backward-compatible aliases (`GradebookCell`, `GradebookResponse`) and compatibility re-exports            |
| 15  | `apps/web/coverage/services/courses/assignments.ts.html`                                | Coverage report for the now-deleted `assignments.ts` service                                               |

### Frontend — Already Deleted

| File                                             | Status                                   |
| ------------------------------------------------ | ---------------------------------------- |
| `apps/web/src/services/courses/assignments.ts`   | **Deleted** (only coverage HTML remains) |
| `apps/web/src/schemas/assignmentTaskContents.ts` | **Deleted**                              |

### Tests

| #   | File                                                        | What it is                                                                                    |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 16  | `apps/api/src/tests/test_assessment_phase0_contract_api.py` | Creates an Activity named `"Legacy Assignment"` to verify 404 + `MIGRATION_REQUIRED` response |

### Documentation

| #   | File                                             | What it is                                                                                                                            |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 17  | `plans/assessment-grading-modernization-plan.md` | Master plan with "Legacy Assignment Deletion Plan" section, deprecated inventory, destructive migration spec, and acceptance criteria |

---

### Summary

There are **17 active locations** referencing legacy assignments. The two frontend service/schema files mentioned in the plan have already been deleted. The remaining work falls into:

1. **Runtime code to remove**: `assignment_scheduler.py`, `tasks_ref_files.py`, `EditAssignmentModal.tsx`, `queryKeys.assignments`, `activityAssignmentUuidQueryOptions()`, compatibility exports in `grading.ts`
2. **Code to keep as-is** (guard rails): `validate.py`'s `LEGACY_ANSWER_KEYS` rejection logic, the `breakdown` legacy alias in `entries.py` (until external contracts migrate)
3. **Migrations**: Already written and sequenced — these are historical records, not runtime code to delete
4. **Tests**: The "Legacy Assignment" fixture in `test_assessment_phase0_contract_api.py` is intentional (verifies the system rejects legacy lookups)
