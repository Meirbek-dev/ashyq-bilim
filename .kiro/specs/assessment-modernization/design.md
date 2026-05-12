# Assessment & Grading System Modernization — Technical Design

## 1. Design Principles

1. **Zero Debt** — no wrapping, no compatibility shims. Legacy code is deleted; callers migrate to the canonical API in the same commit.
2. **Explicit Over Implicit** — all grading inputs are typed (`GradingContext` dataclass), no `**kwargs`. All pipeline stages are named functions with explicit contracts.
3. **Server Authoritative** — every policy (attempts, time, late, anti-cheat, language allowlist) is enforced server-side. Client-side logic is UX sugar only.
4. **Event-Driven Side Effects** — the submit transaction does grading + persistence only. XP, plagiarism, notifications, analytics run asynchronously through the event bus.
5. **Append-Only Audit** — `GradingEntry` remains the immutable truth for grades. New `AuditEvent` table covers non-grade actions (overrides, lifecycle, bulk ops).
6. **Single Pipeline** — one submission pipeline for every assessment type (quiz, exam, assignment, code challenge, inline quiz). No per-type forks in the router layer.

---

## 2. Architecture Overview

### 2.1 Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Router Layer  (apps/api/src/routers/assessments/unified.py)    │
│  - HTTP I/O, DTO validation, header parsing                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Service Layer  (apps/api/src/services/assessments/)            │
│  ├─ assessment_crud.py       (create/read/update/delete)        │
│  ├─ assessment_lifecycle.py  (DRAFT→SCHEDULED→PUBLISHED)        │
│  ├─ attempt_service.py       (start/draft/submit/history)       │
│  ├─ review_service.py        (teacher review queue, stats)      │
│  └─ policy_service.py        (policy read/write/overrides)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Grading Pipeline  (apps/api/src/services/grading/pipeline/)    │
│  ├─ context.py       (GradingContext dataclass)                 │
│  ├─ validate.py      (structural validation)                    │
│  ├─ enforce.py       (policy enforcement: attempts/time/late)   │
│  ├─ grade.py         (dispatch to GraderRegistry)               │
│  ├─ penalize.py      (attempt penalty + late penalty)           │
│  ├─ persist.py       (submission + GradingEntry + progress)     │
│  └─ emit.py          (publish events to the bus)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Domain  (apps/api/src/db/grading/, apps/api/src/db/assessments)│
│  ├─ Assessment, AssessmentItem, AssessmentPolicy                │
│  ├─ Submission, GradingEntry, ItemFeedbackEntry                 │
│  ├─ StudentPolicyOverride, AuditEvent                           │
│  └─ CodeRun, CodeRunCase                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Event Bus  (apps/api/src/services/events/)                     │
│  Subscribers: XPAward, Plagiarism, Notify, Analytics, SSE       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Module Responsibility Rules

- A router function **must not** import anything from `db/*` directly — only DTOs from `schemas` and service functions.
- A service function **must not** construct raw SQL — only SQLModel statements or repository methods.
- Grading pipeline stages **must not** perform I/O beyond what the stage name implies (e.g. `validate.py` has no DB calls).
- Any side-effect that isn't scoring-critical **must** be emitted as an event, not executed inline.

---

## 3. Data Model Changes

### 3.1 New Columns on Existing Tables

| Table | Column | Type | Purpose |
|-------|--------|------|---------|
| `assessment` | `inline_parent_activity_id` | `int NULL, FK→activity.id` | Links an inline quiz assessment to the lesson activity that embeds it. NULL for standalone assessments. |
| `assessment` | `is_inline` | `bool NOT NULL DEFAULT false` | Fast filter for inline-quiz assessments in the gradebook weighting logic. |
| `submission` | `draft_version` | `int NOT NULL DEFAULT 1` | Optimistic concurrency on student draft saves (separate from teacher `version`). |

### 3.2 New Tables

#### `audit_event`

Records non-grade actions for compliance and debugging.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `int PK` | |
| `event_uuid` | `str, unique` | Public identifier. |
| `actor_id` | `int FK→user.id, ON DELETE SET NULL` | Who triggered the action. |
| `event_type` | `str` | `POLICY_OVERRIDE_CREATED`, `LIFECYCLE_TRANSITION`, `BULK_PUBLISH`, `BULK_RETURN`, `DEADLINE_EXTEND`. |
| `target_kind` | `str` | `assessment`, `submission`, `policy`, `override`. |
| `target_uuid` | `str, indexed` | UUID of the affected entity. |
| `payload_json` | `json` | Before/after snapshot or extra context. |
| `created_at` | `timestamptz` | |

Indexes: `(target_kind, target_uuid, created_at DESC)`, `(actor_id, created_at DESC)`.

### 3.3 Columns & Tables Removed

- `submission.metadata_json` keys `legacy_code_submission_id`, `legacy_plagiarism_score`, `legacy_assignment_type`, `legacy_task_submission_uuid` — migrated out.
- Confirmation pass: drop `exam_attempt`, `quiz_attempt`, `code_submission`, `assignmenttask`, `assignmenttasksubmission` if they still exist (earlier migrations should have already dropped them; the new migration is a no-op `DROP TABLE IF EXISTS`).
- `Block.content.questions` and `Block.content.settings` for legacy quiz blocks — data migrated into `Assessment`/`AssessmentItem`.

---

## 4. Grading Pipeline

### 4.1 `GradingContext` — the typed input

```python
@dataclass(frozen=True, slots=True)
class GradingContext:
    assessment_type: AssessmentType
    items: list[CanonicalAssessmentItem]
    answers_by_item_uuid: dict[str, ItemAnswer]
    attempt_number: int
    max_score: float = 100.0
    code_strategy: str = "BEST_SUBMISSION"
    max_score_penalty_per_attempt: float | None = None
```

No more `**kwargs` on graders. Every grader signature becomes `grade(ctx: GradingContext) -> GradingResult`.

### 4.2 Pipeline Stages

Each stage is a pure function (except `persist` and `emit`) returning the next state.

```python
# pipeline/validate.py
def validate_structure(payload: dict, settings: AssessmentSettings) -> ParsedAnswers: ...

# pipeline/enforce.py
@dataclass(frozen=True)
class EffectivePolicy:
    max_attempts: int | None
    time_limit_seconds: int | None
    due_at: datetime | None
    late_policy: LatePolicy
    allow_late: bool

def resolve_effective_policy(
    policy: AssessmentPolicy | None,
    override: StudentPolicyOverride | None,
    settings: AssessmentSettings,
) -> EffectivePolicy: ...

def enforce_attempt_limit(effective: EffectivePolicy, attempt_count: int) -> None: ...
def enforce_time_limit(draft: Submission, effective: EffectivePolicy, now: datetime) -> None: ...
def enforce_violations(settings: AssessmentSettings, violation_count: int) -> bool: ...

# pipeline/grade.py
def grade_attempt(ctx: GradingContext) -> GradingResult: ...   # dispatches via GraderRegistry

# pipeline/penalize.py
@dataclass(frozen=True)
class PenaltyResult:
    late_penalty_pct: float
    attempt_penalty_applied: bool
    final_score: float

def apply_penalties(
    auto_score: float,
    effective: EffectivePolicy,
    override: StudentPolicyOverride | None,
    submitted_at: datetime,
    attempt_number: int,
    settings: AssessmentSettings,
    violation_exceeded: bool,
) -> PenaltyResult: ...

# pipeline/persist.py  (only stage with DB I/O)
def persist_submission(
    db: Session,
    draft: Submission,
    result: GradingResult,
    penalty: PenaltyResult,
    effective: EffectivePolicy,
    answers_payload: dict,
    now: datetime,
) -> Submission: ...

# pipeline/emit.py
async def emit_submission_events(bus: EventBus, draft: Submission) -> None: ...
```

### 4.3 Orchestrator

`attempt_service.submit()` composes the stages:

```python
async def submit(...):
    draft = _get_or_create_draft(...)
    parsed = validate_structure(payload, settings)
    effective = resolve_effective_policy(policy, override, settings)
    enforce_attempt_limit(effective, attempt_count)
    enforce_time_limit(draft, effective, now)
    violation_exceeded = enforce_violations(settings, violation_count)

    # CODE_CHALLENGE: run Judge0 to populate latest_run before grading
    if ctx.assessment_type == AssessmentType.CODE_CHALLENGE:
        parsed = await _run_final_code(db, parsed, draft, ...)

    ctx = GradingContext(...parsed...)
    result = grade_attempt(ctx)
    penalty = apply_penalties(result.auto_score, effective, override, now,
                              draft.attempt_number, settings, violation_exceeded)
    draft = persist_submission(db, draft, result, penalty, effective, parsed.payload, now)
    await emit_submission_events(bus, draft)
    return SubmissionRead.model_validate(draft)
```

### 4.4 `LatePolicy.apply` method

Moved from `submit.py._calculate_late_penalty` onto the discriminated union classes:

```python
class LatePolicyNone(...):
    def apply(self, submitted_at, due_at) -> float: return 0.0

class LatePolicyPenalty(...):
    def apply(self, submitted_at, due_at) -> float:
        if submitted_at <= due_at: return 0.0
        days_late = min(self.max_days, max(1, ceil((submitted_at - due_at).total_seconds() / 86400)))
        return min(100.0, days_late * self.percent_per_day)

class LatePolicyCutoff(...):
    def apply(self, submitted_at, due_at) -> float:
        return 100.0 if submitted_at > self.cutoff_at else 0.0
```

---

## 5. Event Bus

### 5.1 Event Types

```python
# services/events/types.py
@dataclass(frozen=True)
class SubmissionSubmittedEvent:
    submission_uuid: str
    assessment_type: AssessmentType
    user_id: int
    activity_id: int
    attempt_number: int
    final_score: float | None
    is_late: bool
    violation_count: int
    file_keys: list[str]

@dataclass(frozen=True)
class GradePublishedEvent:
    submission_uuid: str
    user_id: int
    final_score: float
    published_at: datetime

@dataclass(frozen=True)
class SubmissionReturnedEvent: ...
@dataclass(frozen=True)
class AssessmentPublishedEvent: ...
@dataclass(frozen=True)
class PolicyOverrideCreatedEvent: ...
```

### 5.2 Subscribers

| Subscriber | Events | Responsibility |
|------------|--------|----------------|
| `XPAwardSubscriber` | `GradePublishedEvent` | Award XP via gamification service, idempotent by submission_uuid |
| `PlagiarismSubscriber` | `SubmissionSubmittedEvent` (file_keys not empty) | Delegate to pluggable plagiarism provider |
| `NotificationSubscriber` | `GradePublishedEvent`, `SubmissionReturnedEvent` | Push notification to student |
| `AnalyticsSubscriber` | all | Structured log with event payload |
| `SSESubscriber` | `SubmissionSubmittedEvent`, `GradePublishedEvent` | Fan-out to connected teacher review clients |

### 5.3 Dead Letter Handling

A simple in-process retry with bounded backoff:

```python
async def _dispatch(handler, event):
    for attempt in range(3):
        try:
            await handler(event)
            return
        except Exception as exc:
            await asyncio.sleep(2 ** attempt)
    logger.error("event_dead_letter", extra={"event": event, "handler": handler.__name__})
    _dead_letter_log.append((event, handler.__name__))  # observable via /internal/dead-letters
```

### 5.4 Plagiarism Provider Interface

```python
# services/integrations/plagiarism/provider.py
class PlagiarismProvider(Protocol):
    async def check(self, submission_uuid: str, file_keys: list[str]) -> PlagiarismScore: ...

class NoopPlagiarismProvider:
    async def check(self, submission_uuid, file_keys) -> PlagiarismScore:
        return PlagiarismScore(score=0.0, checked_at=datetime.now(UTC), flagged=False)

# config picks one
def get_plagiarism_provider() -> PlagiarismProvider: ...
```

---

## 6. API Surface

### 6.1 Canonical Routes (unchanged)

All canonical routes in `routers/assessments/unified.py` remain. This is the only surface for assessment operations.

### 6.2 New Routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/assessments/inline-quiz` | Create a new inline quiz scoped to a parent activity (returns `assessment_uuid`) |
| `GET` | `/assessments/{uuid}/audit` | List `AuditEvent` entries for an assessment (teacher-only) |
| `GET` | `/courses/{course_uuid}/gradebook/cursor` | Cursor-paginated gradebook for large classes |

### 6.3 Deleted Routes

- `POST /blocks/quiz/{activity_id}` — deleted; inline quizzes use the canonical submit endpoint.

### 6.4 Rate Limiting

Implemented via `slowapi` middleware:

| Endpoint | Limit |
|----------|-------|
| `POST /assessments/{uuid}/submit` | 1 request / 5s per (user, activity) |
| `POST /assessments/{uuid}/items/{item_uuid}/runs` | 10 requests / minute per user |
| `PATCH /assessments/{uuid}/draft` | 10 requests / 30s per (user, assessment) |

---

## 7. Frontend Architecture

### 7.1 Inline Quiz (TipTap Node)

```
apps/web/src/components/Objects/Editor/Extensions/InlineQuiz/
  ├─ InlineQuiz.ts                   # TipTap node definition
  ├─ InlineQuizComponent.tsx         # NodeView — renders author/attempt based on editable flag
  ├─ InlineQuizAuthor.tsx            # Calls standard assessment item editor
  ├─ InlineQuizAttempt.tsx           # Uses canonical useAssessment + useAssessmentSubmission hooks
  └─ types.ts                        # InlineQuizAttrs { assessment_uuid: string | null }
```

Key decisions:
- The node stores **only** `assessment_uuid` in its attrs. All content lives in the canonical `Assessment` row.
- On first insert, the editor calls `POST /assessments/inline-quiz` with the parent `activity_id` to create a stub assessment, stores the returned `assessment_uuid` in the node attrs.
- Authoring opens a modal/drawer containing the standard `NativeItemStudio` scoped to that assessment.
- Student rendering uses the same `AttemptEntryPanel` and item renderers as standalone quizzes.

### 7.2 Teacher Studio — Unified Shell

```
apps/web/src/features/assessments/studio/
  ├─ AssessmentStudioWorkspace.tsx   # 3-column shell (Outline | Author | Inspector)
  ├─ OutlineRail.tsx                 # item list + reorder DnD
  ├─ PolicyInspector.tsx             # unified policy editor (all kinds)
  ├─ StudentOverridesPanel.tsx       # per-student exceptions
  ├─ ReadinessPanel.tsx              # surfaces /readiness issues
  └─ PreviewModeButton.tsx           # toggles student preview
```

Each kind's `KindModule` contributes:
- `Author` component (the center pane)
- Optional `Inspector` extension (e.g. code challenge adds language allowlist widget)

### 7.3 Teacher Review Workspace — Rewritten GradeForm

```
apps/web/src/features/grading/review/components/
  ├─ GradeForm.tsx                   # rewritten — no saveLegacy path
  ├─ ItemRubricEditor.tsx            # per-item rubric score inputs
  ├─ InlineAnnotationEditor.tsx      # highlight + comment for OPEN_TEXT
  ├─ AttemptHistoryPanel.tsx         # collapsible list of prior attempts
  ├─ ConflictResolver.tsx            # shown on 412 response
  └─ ReviewBulkActionBar.tsx         # select-many → batch grade/publish/return
```

All grading goes through `PATCH /assessments/{uuid}/submissions/{submission_uuid}/grade` (the `GradingDraftSave` endpoint).

### 7.4 Student Attempt UX

```
apps/web/src/features/assessments/shared/
  ├─ AttemptEntryPanel.tsx           # existing — ensure single primary action
  ├─ AttemptTimer.tsx                # new — countdown with warning states
  ├─ AntiCheatOverlay.tsx            # new — proctored mode indicator + violation counter
  ├─ AutoSaveIndicator.tsx           # new — "Saved", "Saving…", "Offline"
  └─ PostSubmissionFeedback.tsx      # new — respects review_visibility policy
```

The attempt components are composed inside each kind's `Attempt` module.

### 7.5 Accessibility

- All interactive elements reachable by keyboard; visible focus rings.
- Timer exposes `aria-live="polite"` with debounced announcements (every minute, then every 10s under 1min).
- Answer selections use `role="radio"`/`role="checkbox"` with proper grouping.
- Post-submission feedback announces result via `role="status"`.

---

## 8. Security Model

### 8.1 RBAC

New permission: `assessment:override` — required for creating/modifying `StudentPolicyOverride`. Defaults to teacher role.

### 8.2 Rate Limiting Implementation

Use `slowapi` with Redis backend (falls back to in-memory if Redis unavailable — documented as degraded mode).

Key format: `f"ratelimit:{endpoint}:{user_id}:{resource_id}"`.

### 8.3 Server-Side Enforcement Checklist

Every policy check happens in the `enforce` pipeline stage:

- [x] Attempt limit (counting non-DRAFT submissions, respecting override)
- [x] Time limit (using server `started_at`, grace period 30s)
- [x] Late window (`allow_late=false` → reject after `due_at`)
- [x] Violation threshold (zero score if exceeded)
- [x] Language allowlist (reject disallowed code language with 400 `LANGUAGE_NOT_ALLOWED`)
- [x] Anti-cheat (client reports violations; server scores them)

### 8.4 Audit Events

`services/audit.py`:

```python
def record_audit_event(
    db: Session,
    actor_id: int,
    event_type: AuditEventType,
    target_kind: str,
    target_uuid: str,
    payload: dict,
) -> AuditEvent: ...
```

Called from:
- `policy_service.create_override` / `update_override` / `delete_override`
- `assessment_lifecycle.transition`
- `teacher_service.bulk_publish_grades` / `batch_grade_submissions`
- `policy_service.extend_deadline`

---

## 9. Performance & Observability

### 9.1 Indexes (added where missing)

```sql
-- For teacher submission queue filters
CREATE INDEX IF NOT EXISTS idx_submission_search
  ON submission (activity_id, status, is_late, submitted_at DESC);

-- For audit event lookups
CREATE INDEX idx_audit_event_target ON audit_event (target_kind, target_uuid, created_at DESC);
CREATE INDEX idx_audit_event_actor ON audit_event (actor_id, created_at DESC);

-- For inline quiz gradebook aggregation
CREATE INDEX idx_assessment_inline_parent ON assessment (inline_parent_activity_id)
  WHERE inline_parent_activity_id IS NOT NULL;
```

### 9.2 Structured Logging

One log record per grading operation with consistent field names:

```json
{
  "event": "grading.submit",
  "assessment_uuid": "...",
  "submission_uuid": "...",
  "user_id": 123,
  "assessment_type": "QUIZ",
  "auto_score": 87.5,
  "final_score": 83.1,
  "is_late": true,
  "late_penalty_pct": 5.0,
  "attempt_number": 2,
  "duration_ms": 142,
  "status": "GRADED"
}
```

### 9.3 Metrics (Prometheus-compatible)

Exposed via a new `/internal/metrics` endpoint:

- `grading_submission_total{assessment_type, status}` (counter)
- `grading_latency_seconds{assessment_type, stage}` (histogram)
- `grading_auto_score{assessment_type}` (histogram)
- `code_execution_duration_seconds{language_id, status}` (histogram)
- `code_execution_degraded_total` (counter)
- `assessment_lifecycle_transition_total{from, to}` (counter)
- `event_bus_dispatch_total{event_type, handler, outcome}` (counter)

### 9.4 Cursor Pagination (Gradebook)

```python
@router.get("/courses/{course_uuid}/gradebook/cursor")
async def gradebook_cursor(
    course_uuid: str,
    cursor: str | None = None,      # base64-encoded (student_id, activity_id)
    limit: int = Query(500, le=2000),
    ...
) -> CourseGradebookPage: ...
```

---

## 10. Migration Strategy (Phased Execution)

### Phase 0 — Data Migration (single Alembic revision)

`alembic/versions/XXXXXXXX_assessment_modernization_phase0.py`:

1. Add new columns (`assessment.inline_parent_activity_id`, `assessment.is_inline`, `submission.draft_version`).
2. Create `audit_event` table.
3. Add new indexes.
4. For each legacy `Block` of type `BLOCK_QUIZ`:
   - Create a new `Assessment` row with `kind=QUIZ`, `is_inline=true`, `inline_parent_activity_id=block.activity_id`.
   - Convert each entry in `block.content["questions"]` into an `AssessmentItem` row (CHOICE/MATCHING mapping).
   - Set an `AssessmentPolicy` row from `block.content["settings"]`.
   - Store the new `assessment_uuid` back into the block's content under `inline_assessment_uuid` for the frontend to pick up.
5. Strip `legacy_*` keys from every `submission.metadata_json`.
6. `DROP TABLE IF EXISTS exam_attempt, quiz_attempt, code_submission, assignmenttask, assignmenttasksubmission`.

### Phase 1 — Code Cut-Over (single PR series)

Dependencies enforced in the task list:

1. Introduce new pipeline modules alongside existing code (feature-flagged at first if needed).
2. Port `attempt_service.submit` to the new pipeline.
3. Swap router wiring to call new service functions.
4. Delete legacy services and routes.
5. Regenerate OpenAPI schema; update frontend types.

### Phase 2 — Frontend Rewrite

1. Ship new `InlineQuiz` TipTap extension behind a feature flag reading from the editor config.
2. Rewrite `GradeForm` with rubric + annotation support.
3. Introduce `AttemptTimer` / `AntiCheatOverlay` / `AutoSaveIndicator`.
4. Delete `QuizBlock*`, `saveLegacy`, LEGACY-marked files.
5. Remove `routeMode: 'legacy'` paths and legacy query-key fallbacks.

### Phase 3 — Verification

1. Integration tests covering every acceptance criterion.
2. Property-based tests for late-penalty math and attempt-limit enforcement.
3. Load test: 200 concurrent submissions against the grading pipeline — p99 latency under 2s.
4. Visual regression tests on Studio / Review / Attempt surfaces.

---

## 11. Testing Strategy

- **Unit**: every pipeline stage (`validate`, `enforce`, `grade`, `penalize`) with property-based tests (Hypothesis for Python, fast-check for TS).
- **Integration**: end-to-end submission flow per assessment type via FastAPI test client.
- **Contract**: OpenAPI schema diff check in CI (fail the build on breaking change without explicit approval).
- **Frontend**: Playwright E2E for student attempt + teacher review journeys; unit tests for view-model logic.
- **Performance**: k6 script for `POST /assessments/{uuid}/submit` concurrency.
- **Accessibility**: axe-core automated scan + manual screen-reader pass on the three main surfaces.

---

## 12. Open Questions Parked for Implementation

1. Plagiarism provider choice — interface is pluggable; concrete provider is out of scope for this spec.
2. Rate-limit storage — Redis preferred; in-memory fallback behavior confirmed as "degraded mode" (log a warning, continue).
3. Inline-quiz editing UX — modal drawer vs. inline expand. Default: **modal drawer** for consistency with the full studio; revisit after user testing.
