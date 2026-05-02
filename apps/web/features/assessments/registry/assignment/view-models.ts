import type { AssignmentTaskRead } from './models';

export function normalizeAssignmentTasks(tasks: unknown): AssignmentTaskRead[] {
  if (!Array.isArray(tasks)) return [];

  return tasks
    .filter((task): task is Record<string, unknown> => Boolean(task) && typeof task === 'object')
    .map((task, index) => ({
      id: typeof task.id === 'number' ? task.id : index,
      assignment_task_uuid:
        typeof task.assignment_task_uuid === 'string' ? task.assignment_task_uuid : `assignment_task_${index}`,
      assignment_type: isAssignmentTaskType(task.assignment_type) ? task.assignment_type : 'OTHER',
      title: typeof task.title === 'string' ? task.title : '',
      description: typeof task.description === 'string' ? task.description : '',
      hint: typeof task.hint === 'string' ? task.hint : null,
      reference_file: typeof task.reference_file === 'string' ? task.reference_file : null,
      max_grade_value: typeof task.max_grade_value === 'number' ? task.max_grade_value : 0,
      contents: task.contents && typeof task.contents === 'object' ? (task.contents as Record<string, unknown>) : null,
      order: typeof task.order === 'number' ? task.order : null,
    }))
    .toSorted((a, b) => (a.order ?? a.id) - (b.order ?? b.id));
}

function isAssignmentTaskType(value: unknown): value is AssignmentTaskRead['assignment_type'] {
  return value === 'FILE_SUBMISSION' || value === 'QUIZ' || value === 'FORM' || value === 'OTHER';
}
