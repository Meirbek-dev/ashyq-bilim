'use client';

import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getAssignmentTask } from '@services/courses/assignments';
import { createContext, use, useEffect, useReducer } from 'react';
import { getAPIUrl } from '@services/config/config';
import type { ReactNode } from 'react';
import { mutate } from 'swr';

import { useAssignments } from './AssignmentContext';

interface State {
  selectedAssignmentTaskUUID: string | null;
  assignmentTask: Record<string, any>;
  reloadTrigger: number;
}

interface Action {
  type: 'setSelectedAssignmentTaskUUID' | 'setAssignmentTask' | 'reload' | 'SET_MULTIPLE_STATES';
  payload?: any;
}

const initialState: State = {
  selectedAssignmentTaskUUID: null,
  assignmentTask: {},
  reloadTrigger: 0,
};

export const AssignmentsTaskContext = createContext<State | undefined>(undefined);
export const AssignmentsTaskDispatchContext = createContext<React.Dispatch<Action> | undefined>(undefined);

export const AssignmentsTaskProvider = ({ children }: { children: ReactNode }) => {
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const assignment = useAssignments();

  const [state, dispatch] = useReducer(assignmentsTaskReducer, initialState);

  async function fetchAssignmentTask(assignmentTaskUUID: string) {
    const res = await getAssignmentTask(assignmentTaskUUID, access_token);

    if (res.success) {
      dispatch({ type: 'setAssignmentTask', payload: res.data });
    }
  }

  useEffect(() => {
    const loadIfNeeded = async () => {
      if (state.selectedAssignmentTaskUUID) {
        const res = await getAssignmentTask(state.selectedAssignmentTaskUUID, access_token);
        if (res.success) dispatch({ type: 'setAssignmentTask', payload: res.data });
        mutate(`${getAPIUrl()}assignments/${assignment.assignment_object?.assignment_uuid}/tasks`);
      }
    };

    void loadIfNeeded();
  }, [
    state.selectedAssignmentTaskUUID,
    state.reloadTrigger,
    assignment.assignment_object?.assignment_uuid,
    access_token,
  ]);

  return (
    <AssignmentsTaskContext.Provider value={state}>
      <AssignmentsTaskDispatchContext.Provider value={dispatch}>{children}</AssignmentsTaskDispatchContext.Provider>
    </AssignmentsTaskContext.Provider>
  );
};

export function useAssignmentsTask() {
  const context = use(AssignmentsTaskContext);
  if (context === undefined) {
    throw new Error('useAssignmentsTask must be used within an AssignmentsTaskProvider');
  }
  return context;
}

export function useAssignmentsTaskDispatch() {
  const context = use(AssignmentsTaskDispatchContext);
  if (context === undefined) {
    throw new Error('useAssignmentsTaskDispatch must be used within an AssignmentsTaskProvider');
  }
  return context;
}

function assignmentsTaskReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'setSelectedAssignmentTaskUUID': {
      return { ...state, selectedAssignmentTaskUUID: action.payload };
    }
    case 'setAssignmentTask': {
      return { ...state, assignmentTask: action.payload };
    }
    case 'reload': {
      return { ...state, reloadTrigger: state.reloadTrigger + 1 };
    }
    case 'SET_MULTIPLE_STATES': {
      return {
        ...state,
        ...action.payload,
      };
    }
    default: {
      return state;
    }
  }
}
