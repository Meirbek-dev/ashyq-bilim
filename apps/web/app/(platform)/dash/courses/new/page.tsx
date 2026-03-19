import CourseCreationWizard from '@components/Dashboard/Courses/CourseCreationWizard';
import { getEditableOrgCourses } from '@services/courses/courses';
import { auth } from '@/auth';

export default async function PlatformNewCoursePage() {
  const session = await auth();
  const accessToken = session?.tokens?.access_token;
  const initialCourses = await getEditableOrgCourses(accessToken || undefined, 1, 1, '', 'updated');
  const totalSourceCourses = Math.max(initialCourses.total, initialCourses.courses.length);
  const sourceCourseResponse =
    totalSourceCourses <= initialCourses.courses.length
      ? initialCourses
      : await getEditableOrgCourses(accessToken || undefined, 1, totalSourceCourses, '', 'updated');

  return (
    <CourseCreationWizard
      sourceCourses={sourceCourseResponse.courses.map((course: any) => ({
        course_uuid: course.course_uuid,
        name: course.name,
        description: course.description,
      }))}
    />
  );
}
