'use client';

import { swrFetcher } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { createContext, use } from 'react';
import type { ReactNode } from 'react';
import useSWR from 'swr';

import { usePlatformSession } from '../SessionContext';

// Types for assignment submission
export type AssignmentSubmissionStatus = 'PENDING' | 'SUBMITTED' | 'GRADED' | 'LATE' | 'NOT_SUBMITTED';

export interface AssignmentSubmission {
  id: number;
  submission_status: AssignmentSubmissionStatus;
  grade: number;
  user_id: number;
  assignment_id: number;
  creation_date: string;
  update_date: string;
}

export interface AssignmentSubmissionContextType {
  submissions: AssignmentSubmission[] | null;
  isLoading: boolean;
  error: Error | null;
}

export const AssignmentSubmissionContext = createContext<AssignmentSubmissionContextType>({
  submissions: null,
  isLoading: false,
  error: null,
});

interface AssignmentSubmissionProviderProps {
  children: ReactNode;
  assignment_uuid: string | undefined;
}

const AssignmentSubmissionProvider = ({ children, assignment_uuid }: AssignmentSubmissionProviderProps) => {
  const session = usePlatformSession();
  const accessToken = session?.data?.tokens?.access_token;

  const {
    data: assignmentSubmission,
    error: assignmentError,
    isLoading,
  } = useSWR<AssignmentSubmission[]>(
    assignment_uuid && assignment_uuid !== 'undefined'
      ? `${getAPIUrl()}assignments/${assignment_uuid}/submissions/me`
      : null,
    (url: string) => swrFetcher(url, accessToken),
  );

  const contextValue: AssignmentSubmissionContextType = {
    submissions: assignmentSubmission || null,
    isLoading,
    error: assignmentError || null,
  };

  return <AssignmentSubmissionContext.Provider value={contextValue}>{children}</AssignmentSubmissionContext.Provider>;
};

export function useAssignmentSubmission(): AssignmentSubmissionContextType {
  return use(AssignmentSubmissionContext);
}

export default AssignmentSubmissionProvider;
