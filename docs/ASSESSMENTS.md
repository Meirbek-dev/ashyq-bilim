# Assessments

The assessment system is centered on two authoring tables and one submission
table:

- `assessment`: one row per gradeable activity. It owns kind, title,
  description, lifecycle, schedule timestamps, weight, grading type, and the
  linked `assessment_policy`.
- `assessment_item`: ordered items inside an assessment. Each item has a
  stable `item_uuid`, an `ItemKind`, `body_json`, and `max_score`.
- `submission`: one row per student attempt. Drafts, submitted work, grading
  state, answers, feedback, and optimistic locking all live here.

Kinds such as Assignment, Exam, Code Challenge, and Quiz are presets over the
same primitives. A kind controls default policy and allowed item kinds; it does
not get a separate submission path.

## Lifecycle

Assessments use the same four lifecycle states everywhere:

- `DRAFT`: editable and hidden from students.
- `SCHEDULED`: hidden until `scheduled_at`.
- `PUBLISHED`: visible to students.
- `ARCHIVED`: read-only and closed to new submissions.

`POST /api/v1/assessments/{assessment_uuid}/lifecycle` is the canonical state
transition endpoint. Publishing and scheduling run the readiness gate first. If
the assessment has no items, invalid item bodies, or missing policy, the API
returns `422` with `issues: [{ code, message, item_uuid? }]`.

## Items

The supported `ItemKind` values are:

- `CHOICE`
- `OPEN_TEXT`
- `FILE_UPLOAD`
- `FORM`
- `CODE`
- `MATCHING`

Each item body and answer is a discriminated union with `kind` as the
discriminator. The backend validates the union before writing JSON, and the
frontend mirrors it in `features/assessments/domain/items.ts`.

To add a new item kind:

1. Add the Pydantic body and answer models in `src/db/assessments.py`.
2. Add the enum value to `ItemKind`.
3. Register readiness validation in `services/assessments/core.py`.
4. Add the TypeScript body and answer types in `features/assessments/domain/items.ts`.
5. Add an item module under `features/assessments/items/{kind}` with Author,
   Attempt, and Review components, then register it in `items/registry.ts`.
6. Update graders only if the item is auto-gradeable.

## Submissions

Students use:

- `POST /api/v1/assessments/{assessment_uuid}/start`
- `GET /api/v1/assessments/{assessment_uuid}/draft`
- `PATCH /api/v1/assessments/{assessment_uuid}/draft`
- `POST /api/v1/assessments/{assessment_uuid}/submit`
- `GET /api/v1/assessments/{assessment_uuid}/me`

Draft saves and submits accept `If-Match: <version>`. A stale version returns
`409` with the latest submission payload so the client can merge or prompt.

Teachers use:

- `GET /api/v1/assessments/{assessment_uuid}/submissions`
- `PATCH /api/v1/grading/submissions/{submission_uuid}`

`GradingEntry` is the append-only grade ledger. `Submission.final_score` and
`Submission.grading_json` are the current read cache.
