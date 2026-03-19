import type { AttemptData, ErrorInfo, ExamData, ExamFlowAction, QuestionData } from './examFlowReducer';

export const examActions = {
  setLoading: (): ExamFlowAction => ({
    type: 'SET_LOADING',
  }),

  setPreExam: (exam: ExamData, questions: QuestionData[], userAttempts: AttemptData[]): ExamFlowAction => ({
    type: 'SET_PRE_EXAM',
    payload: { exam, questions, userAttempts },
  }),

  startExam: (attempt: AttemptData): ExamFlowAction => ({
    type: 'START_EXAM',
    payload: { attempt },
  }),

  submitExam: (attempt: AttemptData): ExamFlowAction => ({
    type: 'SUBMIT_EXAM',
    payload: { attempt },
  }),

  viewResults: (attempt: AttemptData): ExamFlowAction => ({
    type: 'VIEW_RESULTS',
    payload: { attempt },
  }),

  reviewAttempt: (attempt: AttemptData, returnPhase: 'pre-exam' | 'manage'): ExamFlowAction => ({
    type: 'REVIEW_ATTEMPT',
    payload: { attempt, returnPhase },
  }),

  exitReview: (): ExamFlowAction => ({
    type: 'EXIT_REVIEW',
  }),

  backToPreExam: (userAttempts: AttemptData[]): ExamFlowAction => ({
    type: 'BACK_TO_PRE_EXAM',
    payload: { userAttempts },
  }),

  enterManagementMode: (): ExamFlowAction => ({
    type: 'ENTER_MANAGEMENT_MODE',
  }),

  exitManagementMode: (userAttempts: AttemptData[]): ExamFlowAction => ({
    type: 'EXIT_MANAGEMENT_MODE',
    payload: { userAttempts },
  }),

  setError: (error: ErrorInfo): ExamFlowAction => ({
    type: 'SET_ERROR',
    payload: { error },
  }),

  retry: (): ExamFlowAction => ({
    type: 'RETRY',
  }),
};
