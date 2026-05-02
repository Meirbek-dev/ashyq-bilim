import type { components } from '@/lib/api/generated/schema';

export type AssignmentRead = components['schemas']['AssignmentRead'];
export type AssignmentStatus = components['schemas']['AssignmentStatus'];
export type AssignmentTaskType = components['schemas']['AssignmentTaskTypeEnum'];

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
