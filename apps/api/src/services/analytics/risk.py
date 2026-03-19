from __future__ import annotations

from collections import defaultdict
from datetime import UTC

from sqlmodel import Session

from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    AnalyticsContext,
    assessment_pass_threshold,
    build_activity_events,
    cohort_names_for_user,
    cohort_user_ids,
    display_name,
    load_analytics_context,
    now_utc,
    progress_snapshots,
    to_iso,
)
from src.services.analytics.schemas import AtRiskLearnerRow, AtRiskLearnersResponse
from src.services.analytics.scope import TeacherAnalyticsScope


def build_risk_rows(
    context: AnalyticsContext, filters: AnalyticsFilters
) -> list[AtRiskLearnerRow]:
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    snapshots = progress_snapshots(context, allowed_user_ids)
    activity_events = build_activity_events(context, allowed_user_ids)
    last_activity_by_pair = {
        (event.course_id, event.user_id): event.ts for event in activity_events
    }
    for event in activity_events:
        key = (event.course_id, event.user_id)
        current = last_activity_by_pair.get(key)
        if current is None or event.ts > current:
            last_activity_by_pair[key] = event.ts

    failed_assessments: dict[tuple[int, int], int] = defaultdict(int)
    missing_assessments: dict[tuple[int, int], int] = defaultdict(int)
    open_grading_blocks: dict[tuple[int, int], int] = defaultdict(int)

    course_assignment_ids: dict[int, set[int]] = defaultdict(set)
    for assignment in context.assignments:
        if assignment.id is not None:
            course_assignment_ids[assignment.course_id].add(assignment.id)

    course_exam_ids: dict[int, set[int]] = defaultdict(set)
    exam_thresholds: dict[int, float] = {}
    for exam in context.exams:
        if exam.id is not None:
            course_exam_ids[exam.course_id].add(exam.id)
            exam_thresholds[exam.id] = assessment_pass_threshold(exam.settings)

    course_code_ids: dict[int, set[int]] = defaultdict(set)
    for activity in context.activities_by_id.values():
        if activity.course_id is None:
            continue
        if activity.activity_type.value == "TYPE_CODE_CHALLENGE":
            course_code_ids[activity.course_id].add(activity.id)

    assignment_seen: dict[tuple[int, int], set[int]] = defaultdict(set)
    for submission, assignment in context.assignment_submissions:
        if allowed_user_ids is not None and submission.user_id not in allowed_user_ids:
            continue
        key = (assignment.course_id, submission.user_id)
        assignment_seen[key].add(assignment.id)
        if submission.submission_status.value in {"SUBMITTED", "LATE"}:
            open_grading_blocks[key] += 1
        if submission.submission_status.value == "GRADED" and submission.grade < 60:
            failed_assessments[key] += 1

    exam_seen: dict[tuple[int, int], set[int]] = defaultdict(set)
    for attempt, exam in context.exam_attempts:
        if allowed_user_ids is not None and attempt.user_id not in allowed_user_ids:
            continue
        if attempt.is_preview:
            continue
        key = (exam.course_id, attempt.user_id)
        exam_seen[key].add(exam.id)
        if attempt.score is None or attempt.max_score in (None, 0):
            continue
        percentage = (float(attempt.score) / float(attempt.max_score)) * 100
        if percentage < exam_thresholds.get(exam.id or 0, 60):
            failed_assessments[key] += 1

    code_success_by_pair: dict[tuple[int, int], set[int]] = defaultdict(set)
    for submission, activity in context.code_submissions:
        if allowed_user_ids is not None and submission.user_id not in allowed_user_ids:
            continue
        if activity.course_id is None:
            continue
        key = (activity.course_id, submission.user_id)
        if submission.score >= 60:
            code_success_by_pair[key].add(activity.id)
        elif submission.status.value == "COMPLETED":
            failed_assessments[key] += 1

    rows: list[AtRiskLearnerRow] = []
    now = now_utc().astimezone(UTC)
    for (course_id, user_id), snapshot in snapshots.items():
        course = context.courses_by_id.get(course_id)
        user = context.users_by_id.get(user_id)
        if course is None:
            continue

        pair = (course_id, user_id)
        last_activity = last_activity_by_pair.get(pair)
        days_since_last_activity = None
        if last_activity is not None:
            days_since_last_activity = max(
                0, (now - last_activity.astimezone(UTC)).days
            )

        missing = 0
        missing += len(
            course_assignment_ids.get(course_id, set())
            - assignment_seen.get(pair, set())
        )
        missing += len(
            course_exam_ids.get(course_id, set()) - exam_seen.get(pair, set())
        )
        missing += len(
            course_code_ids.get(course_id, set())
            - code_success_by_pair.get(pair, set())
        )
        missing_assessments[pair] = missing

        inactivity_component = min(40, (days_since_last_activity or 0) * 2)
        progress_component = max(0, round((100 - snapshot.progress_pct) * 0.3, 1))
        failure_component = min(24, failed_assessments[pair] * 8)
        missing_component = min(24, missing * 6)
        grading_component = min(12, open_grading_blocks[pair] * 4)
        risk_score = round(
            inactivity_component
            + progress_component
            + failure_component
            + missing_component
            + grading_component,
            1,
        )

        if risk_score >= 70:
            risk_level = "high"
        elif risk_score >= 40:
            risk_level = "medium"
        else:
            risk_level = "low"

        reason_codes: list[str] = []
        if (days_since_last_activity or 0) >= 7:
            reason_codes.append("inactive_7d")
        if snapshot.progress_pct < 50:
            reason_codes.append("low_progress")
        if failed_assessments[pair] > 0:
            reason_codes.append("repeated_failures")
        if missing > 0:
            reason_codes.append("missing_required_assessments")
        if open_grading_blocks[pair] > 0:
            reason_codes.append("grading_block")

        if not reason_codes:
            continue

        recommended_action = "Отправьте персональное сообщение учащемуся и проверьте следующее заблокированное задание."
        if "grading_block" in reason_codes:
            recommended_action = "Сначала проверьте отправки этого учащегося, чтобы разблокировать его прогресс."
        elif "inactive_7d" in reason_codes:
            recommended_action = "Свяжитесь с учащимся на этой неделе и согласуйте план возвращения в обучение."
        elif "repeated_failures" in reason_codes:
            recommended_action = "Предложите точечную помощь по самому слабому для учащегося направлению оценивания."
        elif "missing_required_assessments" in reason_codes:
            recommended_action = (
                "Напомните учащемуся о пропущенных обязательных работах и сроках сдачи."
            )
        elif "low_progress" in reason_codes:
            recommended_action = "Назначьте встречу, чтобы обсудить темп прохождения и вовлеченность по главам."

        rows.append(
            AtRiskLearnerRow(
                user_id=user_id,
                course_id=course_id,
                course_uuid=getattr(course, "course_uuid", None),
                course_name=course.name,
                user_display_name=display_name(user),
                cohort_name=", ".join(
                    cohort_names_for_user(context, user_id, filters.cohort_ids)
                )
                or None,
                progress_pct=round(snapshot.progress_pct, 1),
                days_since_last_activity=days_since_last_activity,
                open_grading_blocks=open_grading_blocks[pair],
                failed_assessments=failed_assessments[pair],
                missing_required_assessments=missing,
                risk_score=risk_score,
                risk_level=risk_level,
                risk_components={
                    "inactivity": float(inactivity_component),
                    "progress": float(progress_component),
                    "failures": float(failure_component),
                    "missing": float(missing_component),
                    "grading": float(grading_component),
                },
                reason_codes=reason_codes,
                recommended_action=recommended_action,
            )
        )

    rows.sort(key=lambda row: (-row.risk_score, row.course_name, row.user_display_name))
    return rows


def get_at_risk_learners(
    db_session: Session,
    scope: TeacherAnalyticsScope,
    filters: AnalyticsFilters,
) -> AtRiskLearnersResponse:
    context = load_analytics_context(db_session, scope.course_ids)
    rows = build_risk_rows(context, filters)
    paged_rows = rows[filters.offset : filters.offset + filters.page_size]
    return AtRiskLearnersResponse(
        generated_at=to_iso(context.generated_at) or "",
        total=len(rows),
        page=filters.page,
        page_size=filters.page_size,
        items=paged_rows,
        course_options=[
            {"label": context.courses_by_id[course_id].name, "value": str(course_id)}
            for course_id in sorted(context.courses_by_id)
            if course_id in scope.course_ids
        ],
        cohort_options=[
            {"label": name, "value": str(group_id)}
            for group_id, name in sorted(
                context.usergroup_names_by_id.items(), key=lambda item: item[1].lower()
            )
        ],
    )
