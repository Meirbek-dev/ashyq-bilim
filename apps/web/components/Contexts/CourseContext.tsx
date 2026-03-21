'use client';

import {
  createEmptyCourseEditorBundle,
  getCourseEditorBundle,
  getCourseEditorBundleKey,
  getCourseMetadataKey,
} from '@services/courses/editor';
import { createContext, use, useEffect, useMemo, useReducer } from 'react';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getCourseReadinessSummary } from '@/lib/course-management';
import type { CourseEditorBundle } from '@services/courses/editor';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import ErrorUI from '@/components/Objects/Elements/Error/Error';
import { swrFetcher } from '@services/utils/ts/requests';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import useSWR from 'swr';

export interface Activity {
  id: number;
  activity_uuid: string;
  name?: string;
  activity_type?: string;
  public?: boolean;
  published?: boolean;
  // Backend permission metadata (returned by /courses/{uuid}/meta)
  can_update?: boolean;
  can_delete?: boolean;
  is_owner?: boolean;
  is_creator?: boolean;
  available_actions?: string[];
  [key: string]: any;
}

export interface Chapter {
  id: number;
  chapter_uuid: string;
  name?: string;
  activities?: Activity[];
  [key: string]: any;
}

type Learnings = string | object | null;
export type CourseSectionKey = 'general' | 'access' | 'contributors' | 'certification' | 'content';

// Course structure interface with improved typing
export interface CourseStructure {
  course_uuid: string;
  name?: string;
  description?: string;
  about?: string;
  learnings?: Learnings;
  tags?: string[];
  public?: boolean;
  thumbnail_image?: string;
  thumbnail_type?: 'image' | 'video' | 'both';
  chapters: Chapter[];
  _certificationData?: any;
  [key: string]: any;
}

// Action types for the reducer
type CourseAction =
  | { type: 'setCourseStructure'; payload: CourseStructure }
  | { type: 'setIsLoaded' }
  | { type: 'setEditorData'; payload: CourseEditorBundle }
  | { type: 'setSectionDirty'; payload: { section: CourseSectionKey; dirty: boolean } }
  | { type: 'clearDirtySections' }
  | { type: 'setConflict'; payload: { message: string } }
  | { type: 'clearConflict' };

interface CourseConflictState {
  isOpen: boolean;
  message: string;
}

// Course state interface
interface CourseState {
  courseStructure: CourseStructure;
  isLoading: boolean;
  withUnpublishedActivities: boolean;
  dirtySections: Partial<Record<CourseSectionKey, boolean>>;
  editorData: CourseEditorBundle;
  conflict: CourseConflictState;
}

interface CourseContextValue extends CourseState {
  courseMetaUrl: string;
  isEditorDataLoading: boolean;
  readiness: ReturnType<typeof getCourseReadinessSummary>;
  refreshCourseMeta: () => Promise<CourseStructure | undefined>;
  refreshEditorData: () => Promise<CourseEditorBundle | undefined>;
  refreshCourseEditor: () => Promise<void>;
  showConflict: (message?: string) => void;
  dismissConflict: () => void;
}

// Course provider props interface
interface CourseProviderProps {
  children: ReactNode;
  courseuuid: string;
  withUnpublishedActivities?: boolean;
  initialCourse?: CourseStructure | null;
}

// Dispatch type
type CourseDispatch = React.Dispatch<CourseAction>;

export const CourseContext = createContext<CourseContextValue | null>(null);
export const CourseDispatchContext = createContext<CourseDispatch | null>(null);

export const CourseProvider = ({
  children,
  courseuuid,
  withUnpublishedActivities = false,
  initialCourse,
}: CourseProviderProps) => {
  const session = usePlatformSession();
  const access_token = session?.data?.tokens?.access_token;
  const t = useTranslations('Contexts.Course');
  const courseMetaUrl = getCourseMetadataKey(courseuuid, withUnpublishedActivities);

  const {
    data: courseStructureData,
    error,
    isLoading: isSWRLoading,
    mutate: mutateCourseMeta,
  } = useSWR<CourseStructure>(
    [courseMetaUrl, access_token ?? 'anonymous'],
    ([url, token]: [string, string]) => swrFetcher(url, token === 'anonymous' ? undefined : token),
    {
      fallbackData: initialCourse || undefined,
      revalidateOnMount: !initialCourse,
      revalidateIfStale: !initialCourse,
    },
  );

  const {
    data: editorBundleData,
    isLoading: isEditorDataLoading,
    mutate: mutateEditorBundle,
  } = useSWR<CourseEditorBundle>(getCourseEditorBundleKey(courseuuid, access_token), () =>
    getCourseEditorBundle(courseuuid, access_token!),
  );

  const initialState: CourseState = {
    courseStructure: {
      ...initialCourse,
      course_uuid: initialCourse?.course_uuid || courseuuid,
      chapters: initialCourse?.chapters || [],
    },
    isLoading: !initialCourse,
    withUnpublishedActivities,
    dirtySections: {},
    editorData: createEmptyCourseEditorBundle(),
    conflict: {
      isOpen: false,
      message: '',
    },
  };

  const [state, dispatch] = useReducer(courseReducer, initialState);

  useEffect(() => {
    if (courseStructureData) {
      dispatch({ type: 'setCourseStructure', payload: courseStructureData });
      dispatch({ type: 'setIsLoaded' });
    }
  }, [courseStructureData]);

  useEffect(() => {
    if (editorBundleData) {
      dispatch({ type: 'setEditorData', payload: editorBundleData });
    }
  }, [editorBundleData]);

  const isLoading = isSWRLoading || state.isLoading;

  const refreshCourseMeta = async () => mutateCourseMeta();
  const refreshEditorData = async () => mutateEditorBundle();
  const refreshCourseEditor = async () => {
    await Promise.all([mutateCourseMeta(), mutateEditorBundle()]);
  };
  const showConflict = (message?: string) => {
    dispatch({
      type: 'setConflict',
      payload: { message: message?.trim() || '' },
    });
  };
  const dismissConflict = () => dispatch({ type: 'clearConflict' });

  const readiness = useMemo(
    () => getCourseReadinessSummary(state.courseStructure, state.editorData),
    [state.courseStructure, state.editorData],
  );

  if (error) return <ErrorUI message={t('loadError')} />;
  if (isLoading) return <PageLoading />;

  if (courseStructureData) {
    const value: CourseContextValue = {
      ...state,
      courseMetaUrl,
      isEditorDataLoading,
      readiness,
      refreshCourseMeta,
      refreshEditorData,
      refreshCourseEditor,
      showConflict,
      dismissConflict,
    };

    return (
      <CourseContext.Provider value={value}>
        <CourseDispatchContext.Provider value={dispatch}>{children}</CourseDispatchContext.Provider>
      </CourseContext.Provider>
    );
  }

  return null;
};

export function useCourse(): CourseContextValue {
  const context = use(CourseContext);
  if (!context) {
    throw new Error('useCourse must be used within a CourseProvider');
  }
  return context;
}

export function useCourseDispatch(): CourseDispatch {
  const context = use(CourseDispatchContext);
  if (!context) {
    throw new Error('useCourseDispatch must be used within a CourseProvider');
  }
  return context;
}

function courseReducer(state: CourseState, action: CourseAction): CourseState {
  switch (action.type) {
    case 'setCourseStructure': {
      return { ...state, courseStructure: action.payload };
    }
    case 'setIsLoaded': {
      return { ...state, isLoading: false };
    }
    case 'setEditorData': {
      return { ...state, editorData: action.payload };
    }
    case 'setSectionDirty': {
      return {
        ...state,
        dirtySections: {
          ...state.dirtySections,
          [action.payload.section]: action.payload.dirty,
        },
      };
    }
    case 'clearDirtySections': {
      return { ...state, dirtySections: {} };
    }
    case 'setConflict': {
      return {
        ...state,
        conflict: {
          isOpen: true,
          message: action.payload.message,
        },
      };
    }
    case 'clearConflict': {
      return {
        ...state,
        conflict: {
          isOpen: false,
          message: '',
        },
      };
    }
    default: {
      const _exhaustiveCheck: never = action;
      throw new Error(`Unhandled action type: ${_exhaustiveCheck}`);
    }
  }
}
