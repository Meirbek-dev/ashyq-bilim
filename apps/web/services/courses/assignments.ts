'use server';

import {
  RequestBodyFormWithAuthHeader,
  RequestBodyWithAuthHeader,
  getResponseMetadata,
} from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { tags } from '@/lib/cacheTags';

export async function createAssignment(body: any, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/`,
    RequestBodyWithAuthHeader('POST', body, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after creating assignment
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function updateAssignment(body: any, assignmentUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}`,
    RequestBodyWithAuthHeader('PUT', body, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after updating assignment
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function getAssignmentFromActivityUUID(activityUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/activity/${activityUUID}`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await getResponseMetadata(result);
}

// Delete an assignment
export async function deleteAssignment(assignmentUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after deleting assignment
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function deleteAssignmentUsingActivityUUID(activityUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/activity/${activityUUID}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after deleting assignment
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

// tasks

export async function createAssignmentTask(body: any, assignmentUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/tasks`,
    RequestBodyWithAuthHeader('POST', body, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after creating task
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function getAssignmentTask(assignmentTaskUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/task/${assignmentTaskUUID}`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function getAssignmentTaskSubmissionsMe(
  assignmentTaskUUID: string,
  assignmentUUID: string,
  access_token: string,
) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}/submissions/me`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function getAssignmentTaskSubmissionsUser(
  assignmentTaskUUID: string,
  user_id: number,
  assignmentUUID: string,
  access_token: string,
) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}/submissions/user/${user_id}`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function handleAssignmentTaskSubmission(
  body: any,
  assignmentTaskUUID: string,
  assignmentUUID: string,
  access_token: string,
) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}/submissions`,
    RequestBodyWithAuthHeader('PUT', body, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after handling submission
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function updateAssignmentTask(
  body: any,
  assignmentTaskUUID: string,
  assignmentUUID: string,
  access_token: string,
) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}`,
    RequestBodyWithAuthHeader('PUT', body, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after updating task
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function deleteAssignmentTask(assignmentTaskUUID: string, assignmentUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after deleting task
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function updateReferenceFile(
  file: any,
  assignmentTaskUUID: string,
  assignmentUUID: string,
  access_token: string,
) {
  // Send file thumbnail as form data
  const formData = new FormData();

  if (file) {
    formData.append('reference_file', file);
  }
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}/ref_file`,
    RequestBodyFormWithAuthHeader('POST', formData, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after updating reference file
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function updateSubFile(
  file: any,
  assignmentTaskUUID: string,
  assignmentUUID: string,
  access_token: string,
) {
  // Send file thumbnail as form data
  const formData = new FormData();

  if (file) {
    formData.append('sub_file', file);
  }
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}/sub_file`,
    RequestBodyFormWithAuthHeader('POST', formData, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after updating submission file
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

// submissions

export async function submitAssignmentForGrading(assignmentUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/submissions`,
    RequestBodyWithAuthHeader('POST', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after submitting for grading
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function deleteUserSubmission(user_id: number, assignmentUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/submissions/${user_id}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after deleting submission
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function putUserSubmission(body: any, user_id: number, assignmentUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/submissions/${user_id}`,
    RequestBodyWithAuthHeader('PUT', body, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities cache after updating submission
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
  }

  return metadata;
}

export async function putFinalGrade(user_id: number, assignmentUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/submissions/${user_id}/grade`,
    RequestBodyWithAuthHeader('POST', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities and courses cache after grading
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function getFinalGrade(user_id: number, assignmentUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/submissions/${user_id}/grade`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function markActivityAsDoneForUser(user_id: number, assignmentUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/${assignmentUUID}/submissions/${user_id}/done`,
    RequestBodyWithAuthHeader('POST', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities and courses cache after marking done
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function getAssignmentsFromACourse(courseUUID: string, access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/course/${courseUUID}`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function getAssignmentsFromCourses(courseUUIDs: string[], access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/courses`,
    RequestBodyWithAuthHeader('POST', { course_uuids: courseUUIDs }, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function createAssignmentWithActivity(
  body: any,
  chapterId: number,
  activityName: string,
  access_token: string,
) {
  const result: any = await fetch(
    `${getAPIUrl()}assignments/with-activity?chapter_id=${chapterId}&activity_name=${encodeURIComponent(activityName)}`,
    RequestBodyWithAuthHeader('POST', body, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate activities and courses cache after creating assignment with activity
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.activities, 'max');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}
