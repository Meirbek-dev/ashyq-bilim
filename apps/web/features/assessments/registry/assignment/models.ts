import type { AssessmentItem } from '@/features/assessments/domain/items';

export type AssignmentStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
export type AssignmentTaskType = 'FILE_SUBMISSION' | 'QUIZ' | 'FORM' | 'OTHER';

export interface AssignmentRead {
  assignment_uuid: string;
  title: string;
  description: string;
  due_at?: string | null;
  status: AssignmentStatus;
  scheduled_publish_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
  weight: number;
  grading_type: 'NUMERIC' | 'PERCENTAGE';
  course_uuid?: string | null;
  activity_uuid?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

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

interface AssessmentPolicyLike {
  due_at?: string | null;
}

interface AssessmentReadLike {
  assessment_uuid: string;
  activity_uuid?: string | null;
  course_uuid?: string | null;
  title: string;
  description?: string | null;
  lifecycle: AssignmentStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
  weight?: number;
  grading_type?: 'NUMERIC' | 'PERCENTAGE';
  created_at?: string | null;
  updated_at?: string | null;
  assessment_policy?: AssessmentPolicyLike | null;
}

export function assessmentToAssignmentRead(assessment: AssessmentReadLike): AssignmentRead {
  return {
    assignment_uuid: assessment.assessment_uuid,
    title: assessment.title,
    description: assessment.description ?? '',
    due_at: assessment.assessment_policy?.due_at ?? null,
    status: assessment.lifecycle,
    scheduled_publish_at: assessment.scheduled_at ?? null,
    published_at: assessment.published_at ?? null,
    archived_at: assessment.archived_at ?? null,
    weight: assessment.weight ?? 1,
    grading_type: assessment.grading_type ?? 'PERCENTAGE',
    course_uuid: assessment.course_uuid ?? null,
    activity_uuid: assessment.activity_uuid ?? null,
    created_at: assessment.created_at ?? null,
    updated_at: assessment.updated_at ?? null,
  };
}

export function assessmentItemToAssignmentTask(item: AssessmentItem): AssignmentTaskRead | null {
  if (item.body.kind === 'FILE_UPLOAD') {
    return {
      id: item.id,
      assignment_task_uuid: item.item_uuid,
      assignment_type: 'FILE_SUBMISSION',
      title: item.title,
      description: item.body.prompt,
      hint: null,
      reference_file: null,
      max_grade_value: item.max_score,
      contents: {
        kind: 'FILE_SUBMISSION',
        allowed_mime_types: item.body.mimes,
        max_file_size_mb: item.body.max_mb,
        max_files: item.body.max_files,
      },
      order: item.order,
    };
  }

  if (item.body.kind === 'CHOICE' || item.body.kind === 'MATCHING') {
    return {
      id: item.id,
      assignment_task_uuid: item.item_uuid,
      assignment_type: 'QUIZ',
      title: item.title,
      description: item.body.prompt,
      hint: null,
      max_grade_value: item.max_score,
      contents: {
        kind: 'QUIZ',
        questions:
          item.body.kind === 'CHOICE'
            ? [
                {
                  questionUUID: item.item_uuid,
                  questionText: item.body.prompt,
                  options: item.body.options.map((option) => ({
                    optionUUID: option.id,
                    text: option.text,
                    fileID: '',
                    type: 'text' as const,
                    assigned_right_answer: option.is_correct,
                  })),
                },
              ]
            : [
                {
                  questionUUID: item.item_uuid,
                  questionText: item.body.prompt,
                  options: item.body.pairs.map((pair, index) => ({
                    optionUUID: `${item.item_uuid}_${index}`,
                    text: `${pair.left} -> ${pair.right}`,
                    fileID: '',
                    type: 'text' as const,
                    assigned_right_answer: true,
                  })),
                },
              ],
        settings: {},
      },
      order: item.order,
    };
  }

  if (item.body.kind === 'FORM') {
    return {
      id: item.id,
      assignment_task_uuid: item.item_uuid,
      assignment_type: 'FORM',
      title: item.title,
      description: item.body.prompt,
      hint: null,
      max_grade_value: item.max_score,
      contents: {
        kind: 'FORM',
        questions: [
          {
            questionUUID: item.item_uuid,
            questionText: item.body.prompt,
            blanks: item.body.fields.map((field) => ({
              blankUUID: field.id,
              placeholder: field.label,
              hint: undefined,
            })),
          },
        ],
      },
      order: item.order,
    };
  }

  if (item.body.kind === 'OPEN_TEXT' || item.body.kind === 'CODE') {
    return {
      id: item.id,
      assignment_task_uuid: item.item_uuid,
      assignment_type: 'OTHER',
      title: item.title,
      description: item.body.prompt,
      hint: null,
      max_grade_value: item.max_score,
      contents: {
        kind: 'OTHER',
        body:
          item.body.kind === 'OPEN_TEXT'
            ? { prompt: item.body.prompt }
            : { prompt: item.body.prompt, languages: item.body.languages },
      },
      order: item.order,
    };
  }

  return null;
}
