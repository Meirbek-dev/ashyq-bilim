import type { Submission } from '@/features/grading/domain';

export type AssignmentStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
export type AssignmentTaskType = 'FILE_SUBMISSION' | 'QUIZ' | 'FORM' | 'OTHER';

export interface AssignmentRead {
  assignment_uuid: string;
  title: string;
  description: string;
  due_at?: string | null;
  published: boolean;
  status: AssignmentStatus;
  scheduled_publish_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
  weight?: number;
  grading_type?: 'NUMERIC' | 'PERCENTAGE';
  course_uuid?: string | null;
  activity_uuid?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AssignmentTaskAnswer {
  task_uuid: string;
  content_type: 'file' | 'text' | 'form' | 'quiz' | 'other';
  file_key?: string | null;
  uploads?: { upload_uuid: string; filename?: string }[];
  text_content?: string | null;
  text?: string | null;
  form_data?: { answers?: Record<string, string> } | null;
  quiz_answers?: { answers?: Record<string, string[]> } | null;
  answer_metadata?: Record<string, unknown>;
}

export interface AssignmentDraftPatch {
  tasks: AssignmentTaskAnswer[];
}

export interface AssignmentDraftRead {
  assignment_uuid: string;
  submission: Submission | null;
}

export interface AssignmentCreateWithActivity {
  title: string;
  description?: string;
  due_at?: string | null;
  grading_type: 'NUMERIC' | 'PERCENTAGE';
  course_id: number;
  chapter_id: number;
}

export interface AssignmentUpdate {
  title?: string;
  description?: string;
  due_at?: string | null;
  grading_type?: 'NUMERIC' | 'PERCENTAGE';
}

export type AssignmentSurface = 'ASSIGNMENT_STUDIO' | 'SUBMISSION_REVIEW' | 'STUDENT_ATTEMPT';

export interface AssignmentTaskRead {
  id: number;
  assignment_task_uuid: string;
  assignment_type: AssignmentTaskType;
  title: string;
  description: string;
  hint?: string | null;
  reference_file?: string | null;
  max_grade_value: number;
  contents?: Record<string, unknown> | null;
  order?: number | null;
}

export interface AssignmentStudioViewModel {
  surface: 'ASSIGNMENT_STUDIO';
  assignment: AssignmentRead;
  tasks: AssignmentTaskRead[];
  lifecycle: AssignmentStatus;
  totalPoints: number;
  isEditable: boolean;
  canPublish: boolean;
  canSchedule: boolean;
  canArchive: boolean;
  validationIssues: AssignmentValidationIssue[];
}

export interface StudentAttemptViewModel {
  surface: 'STUDENT_ATTEMPT';
  assignment: AssignmentRead;
  tasks: AssignmentTaskRead[];
  submission: Submission | null;
  totalPoints: number;
  canSaveDraft: boolean;
  canSubmit: boolean;
  canResubmit: boolean;
  resultVisible: boolean;
}

export interface AssignmentValidationIssue {
  code: 'MISSING_TITLE' | 'NO_TASKS' | 'TASK_MISSING_TITLE' | 'TASK_ZERO_POINTS' | 'TASK_MISSING_CONTENT';
  message: string;
  taskUuid?: string;
}
