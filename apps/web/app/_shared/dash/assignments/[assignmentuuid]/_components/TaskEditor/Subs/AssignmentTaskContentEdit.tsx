import { useAssignmentsTask } from '@components/Contexts/Assignments/AssignmentsTaskContext';
import TaskQuizObject from './TaskTypes/TaskQuizObject';
import TaskFormObject from './TaskTypes/TaskFormObject';
import TaskFileObject from './TaskTypes/TaskFileObject';

const AssignmentTaskContentEdit = () => {
  const assignment_task = useAssignmentsTask();

  return (
    <div>
      {assignment_task?.assignmentTask.assignment_type === 'QUIZ' && (
        <TaskQuizObject
          view="teacher"
          assignmentTaskUUID={assignment_task?.assignmentTask.assignment_task_uuid}
        />
      )}
      {assignment_task?.assignmentTask.assignment_type === 'FILE_SUBMISSION' && (
        <TaskFileObject
          view="teacher"
          assignmentTaskUUID={assignment_task?.assignmentTask.assignment_task_uuid}
        />
      )}
      {assignment_task?.assignmentTask.assignment_type === 'FORM' && (
        <TaskFormObject
          view="teacher"
          assignmentTaskUUID={assignment_task?.assignmentTask.assignment_task_uuid}
        />
      )}
    </div>
  );
};

export default AssignmentTaskContentEdit;
