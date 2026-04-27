/**
 * Grading system type definitions — v4.
 *
 * Interface definitions are re-exported from the auto-generated OpenAPI schema
 * (`lib/api/generated/schema.ts`). Only utility constants and helpers live here.
 *
 * Status model (5 states):
 *   DRAFT      — student is working, not yet submitted
 *   PENDING    — submitted, awaiting teacher grading
 *   GRADED     — teacher has set a final score (not yet visible to student)
 *   PUBLISHED  — grade is visible to the student
 *   RETURNED   — teacher sent it back for revision
 *
 * Late submissions use is_late: boolean on the Submission object itself.
 */

import type { components } from '@/lib/api/generated/schema';

// ── Re-exported generated types ───────────────────────────────────────────────

export type SubmissionStatus = components['schemas']['src__db__grading__submissions__SubmissionStatus'];
export type AssessmentType = components['schemas']['AssessmentType'];

export type GradedItem = components['schemas']['GradedItem'];
export type GradingBreakdown = components['schemas']['GradingBreakdown'];
export type Submission = components['schemas']['SubmissionRead'];
export type SubmissionUser = components['schemas']['SubmissionUser'];

/** Typed paginated response for the teacher submissions list. */
export type SubmissionsPage = components['schemas']['SubmissionListResponse'];
export type SubmissionStats = components['schemas']['SubmissionStats'];

export type ItemFeedback = components['schemas']['ItemFeedback'];
export type TeacherGradeInput = components['schemas']['TeacherGradeInput'];
export type BatchGradeItem = components['schemas']['BatchGradeItem'];
export type BatchGradeRequest = components['schemas']['BatchGradeRequest'];
export type BatchGradeResultItem = components['schemas']['BatchGradeResultItem'];
export type BatchGradeResponse = components['schemas']['BatchGradeResponse'];

// ── Answer payload shapes (frontend-only, not in OpenAPI schema) ──────────────

export interface QuizAnswer {
  question_id: string;
  selected_option_ids: string[];
  text_answer?: string | null;
}

export interface QuizAnswers {
  answers: QuizAnswer[];
  started_at: string;
  submitted_at: string;
}

export interface AssignmentTaskAnswer {
  task_uuid: string;
  content_type: 'file' | 'text' | 'form' | 'quiz' | 'other';
  file_key?: string | null;
  text_content?: string | null;
  form_data?: Record<string, unknown> | null;
  quiz_answers?: Record<string, unknown> | null;
  answer_metadata?: Record<string, unknown>;
}

export interface AssignmentAnswers {
  tasks: AssignmentTaskAnswer[];
}

export interface ExamQuestionAnswer {
  question_id: number;
  selected_option_ids: string[];
  text_answer?: string | null;
}

export interface ExamAnswers {
  submitted_answers: Record<number, ExamQuestionAnswer>;
  started_at: string;
  submitted_at: string;
}

export interface TestCaseResult {
  test_id: string;
  passed: boolean;
  weight?: number;
  description?: string;
  message?: string;
}

export interface CodeChallengeAnswers {
  test_results: TestCaseResult[];
  code_strategy?: string;
  source_code?: string;
}

// ── Status display helpers ────────────────────────────────────────────────────

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  GRADED: 'Graded',
  PUBLISHED: 'Published',
  RETURNED: 'Returned',
};

export const STATUS_COLORS: Record<SubmissionStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-800',
  GRADED: 'bg-emerald-100 text-emerald-800',
  PUBLISHED: 'bg-teal-100 text-teal-800',
  RETURNED: 'bg-violet-100 text-violet-800',
};

/** True when the submission needs teacher action */
export function needsTeacherAction(status: SubmissionStatus): boolean {
  return status === 'PENDING';
}

/** True when a teacher can still edit and resubmit a grade. */
export function canTeacherEditGrade(status: SubmissionStatus): boolean {
  return status === 'PENDING' || status === 'GRADED' || status === 'RETURNED';
}

/** True when the submission can be selected for batch grading. */
export function canSelectForBatchGrading(status: SubmissionStatus): boolean {
  return canTeacherEditGrade(status);
}

/** True when the grade is visible to the student */
export function isPublishedToStudent(status: SubmissionStatus): boolean {
  return status === 'PUBLISHED' || status === 'RETURNED';
}
