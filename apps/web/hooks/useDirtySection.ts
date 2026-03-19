'use client';

import type { CourseSectionKey } from '@components/Contexts/CourseContext';
import { useCourseDispatch } from '@components/Contexts/CourseContext';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared dirty-state tracking hook for course workspace edit sections.
 *
 * Centralises the isDirty / isDirtyRef / initialRef / context-sync boilerplate
 * that was previously copy-pasted across EditCourseGeneral, EditCourseAccess,
 * EditCourseContributors, and EditCourseCertification.
 */
export function useDirtySection(sectionKey: CourseSectionKey) {
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const dispatchCourse = useCourseDispatch();

  // Sync dirty state to the global CourseContext so the shell can show the
  // "Unsaved changes" badge and guard intercept navigation.
  useEffect(() => {
    dispatchCourse({ type: 'setSectionDirty', payload: { section: sectionKey, dirty: isDirty } });
  }, [isDirty, sectionKey, dispatchCourse]);

  // Cleanup: clear dirty flag from context when the component unmounts.
  useEffect(() => {
    return () => {
      dispatchCourse({ type: 'setSectionDirty', payload: { section: sectionKey, dirty: false } });
    };
  }, [sectionKey, dispatchCourse]);

  const markDirty = useCallback(() => {
    isDirtyRef.current = true;
    setIsDirty(true);
  }, []);

  const markClean = useCallback(() => {
    isDirtyRef.current = false;
    setIsDirty(false);
  }, []);

  return { isDirty, isDirtyRef, markDirty, markClean };
}
