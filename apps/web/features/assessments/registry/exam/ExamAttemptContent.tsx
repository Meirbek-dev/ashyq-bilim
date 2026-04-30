'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api-client';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { courseKeys } from '@/hooks/courses/courseKeys';
import { useContributorStatus } from '@/hooks/useContributorStatus';
import { useExamActivity, useExamMyAttempts, useExamQuestions } from '@/features/exams/hooks/useExam';
import { examMyAttemptsQueryOptions } from '@/features/exams/queries/exams.query';
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy';
import { useAttemptShellControls, type AttemptSaveState } from '@/features/assessments/shared/AttemptShell';
import { useExamPersistence } from '@/hooks/useExamPersistence';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import ExamQuestionNavigation, {
  ExamQuestionNavigationMobile,
} from '@/components/Activities/ExamActivity/ExamQuestionNavigation';
import {
  createInitialTakingState,
  examTakingReducer,
} from '@/components/Activities/ExamActivity/state/examTakingReducer';
import type {
  AttemptData,
  ExamData,
  QuestionData,
} from '@/components/Activities/ExamActivity/state/examTypes';
import { getOrderedExamQuestions } from '@/components/Activities/ExamActivity/utils/questionOrder';
import ExamQuestionCard from './ExamQuestionCard';
import { Progress } from '@components/ui/progress';
import type { KindAttemptProps } from '../index';
import ExamStartPanel from './ExamStartPanel';
import ExamSubmitDialog from './ExamSubmitDialog';

type TakingState = ReturnType<typeof createInitialTakingState>;

function getStateAnswers(state: TakingState): Record<number, any> {
  return state.mode === 'recovery-prompt' ? state.recoveredAnswers : 'answers' in state ? state.answers : {};
}

export default function ExamAttemptContent({ activityUuid, courseUuid, vm }: KindAttemptProps) {
  const t = useTranslations('Activities.ExamActivity');
  const queryClient = useQueryClient();
  const { contributorStatus } = useContributorStatus(courseUuid);
  const { data: exam, error: examError } = useExamActivity(activityUuid);
  const examUuid = exam?.exam_uuid ?? null;
  const { data: questions, error: questionsError, refetch: refetchQuestions } = useExamQuestions(examUuid);
  const { data: attempts, error: attemptsError, refetch: refetchAttempts } = useExamMyAttempts(examUuid);
  const [activeAttempt, setActiveAttempt] = useState<AttemptData | null>(null);
  const policy = vm?.policy ?? DEFAULT_POLICY_VIEW;

  useEffect(() => {
    if (activeAttempt || !attempts?.length) return;
    const inProgress = attempts.find((attempt: AttemptData) => attempt.status === 'IN_PROGRESS') ?? null;
    if (inProgress) setActiveAttempt(inProgress);
  }, [activeAttempt, attempts]);

  const handleComplete = useCallback(async () => {
    await refetchAttempts();
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() }),
      queryClient.invalidateQueries({ queryKey: courseKeys.structure(courseUuid, false) }),
    ]);
    if (examUuid) await queryClient.fetchQuery(examMyAttemptsQueryOptions(examUuid));
    setActiveAttempt(null);
  }, [courseUuid, examUuid, queryClient, refetchAttempts]);

  if (examError || questionsError || attemptsError) {
    return <div className="text-destructive rounded-lg border p-6 text-sm">{t('errorLoadingExam')}</div>;
  }

  if (!exam || !questions || !attempts) {
    return <PageLoading />;
  }

  if (!activeAttempt) {
    return (
      <ExamStartPanel
        exam={exam}
        questionCount={questions.length}
        userAttempts={attempts}
        onStartExam={(attempt) => {
          setActiveAttempt(attempt);
          void refetchQuestions();
        }}
        isTeacher={contributorStatus === 'ACTIVE'}
        policy={policy}
      />
    );
  }

  return (
    <ExamTakingContent
      exam={exam}
      questions={questions}
      attempt={activeAttempt}
      policy={policy}
      onComplete={handleComplete}
    />
  );
}

function ExamTakingContent({
  exam,
  questions,
  attempt,
  policy,
  onComplete,
}: {
  exam: ExamData;
  questions: QuestionData[];
  attempt: AttemptData;
  policy: typeof DEFAULT_POLICY_VIEW;
  onComplete: () => void | Promise<void>;
}) {
  const t = useTranslations('Activities.ExamActivity');
  const [state, dispatch] = useReducer(
    examTakingReducer,
    createInitialTakingState(0, attempt.answers ?? {}, attempt.violations?.length || 0),
  );
  const [saveState, setSaveState] = useState<AttemptSaveState>('saved');
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const persistence = useExamPersistence({
    attemptUuid: attempt.attempt_uuid,
    autoSaveInterval: 5000,
    expirationHours: 24,
    onRestore: (recoveredAnswers) => {
      const currentAnswers = getStateAnswers(stateRef.current);
      if (Object.keys(currentAnswers).length === 0 && Object.keys(recoveredAnswers).length > 0) {
        dispatch({ type: 'SHOW_RECOVERY_PROMPT', recoveredAnswers });
      }
    },
  });
  const saveAnswers = persistence.saveAnswers;
  const clearSavedAnswers = persistence.clearSavedAnswers;
  const getRecoverableData = persistence.getRecoverableData;

  const orderedQuestions = useMemo(
    () => getOrderedExamQuestions(questions, attempt.question_order),
    [attempt.question_order, questions],
  );
  const settings = useMemo(() => exam.settings || {}, [exam.settings]);
  const currentIndex = state.currentIndex;
  const answers = getStateAnswers(state);
  const currentQuestion = orderedQuestions[currentIndex];
  const isSubmitting = state.mode === 'submitting';
  const showConfirmation = state.mode === 'confirming-submit';
  const showRecoveryDialog = state.mode === 'recovery-prompt';
  const progress = orderedQuestions.length > 0 ? ((currentIndex + 1) / orderedQuestions.length) * 100 : 0;

  const isAnswered = useCallback(
    (questionId: number) => {
      const answer = answers[questionId];
      if (answer === undefined || answer === null) return false;
      if (Array.isArray(answer)) return answer.length > 0;
      if (typeof answer === 'object') return Object.keys(answer).length > 0;
      return true;
    },
    [answers],
  );

  const answeredCount = orderedQuestions.filter((q) => isAnswered(q.id)).length;
  const answeredQuestionIndexes = orderedQuestions.reduce<Set<number>>((set, question, index) => {
    if (isAnswered(question.id)) set.add(index);
    return set;
  }, new Set<number>());

  const handleSubmit = useCallback(
    async (isAutoSubmit = false) => {
      if (stateRef.current.mode === 'submitting') return;
      const submitAnswers = getStateAnswers(stateRef.current);
      dispatch({ type: 'START_SUBMIT' });

      try {
        const response = await apiFetch(`exams/${exam.exam_uuid}/attempts/${attempt.attempt_uuid}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submitAnswers),
        });

        if (!response.ok) throw new Error('Failed to submit exam');

        clearSavedAnswers();
        toast.success(t('examSubmittedSuccessfully'));
        await onComplete();
      } catch (error) {
        console.error('Error submitting exam:', error);
        toast.error(isAutoSubmit ? t('errorSubmittingExam') : t('errorSubmittingExam'));
        dispatch({ type: 'RESET_TO_ANSWERING' });
      }
    },
    [attempt.attempt_uuid, clearSavedAnswers, exam.exam_uuid, onComplete, t],
  );

  const handleViolation = useCallback(
    async (type: string, count: number) => {
      const currentAnswers = getStateAnswers(stateRef.current);
      dispatch({ type: 'RECORD_VIOLATION', violation: { type, count } });

      try {
        const response = await apiFetch(`exams/${exam.exam_uuid}/attempts/${attempt.attempt_uuid}/violations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, answers: currentAnswers }),
        });
        const updatedAttempt = response.ok ? await response.json().catch(() => null) : null;

        if (updatedAttempt?.status === 'AUTO_SUBMITTED') {
          clearSavedAnswers();
          toast.error(t('autoSubmitting', { reason: t('autoSubmittingReason.violationThresholdExceeded') }));
          await onComplete();
        }
      } catch (error) {
        console.error('Failed to record violation:', error);
      }
    },
    [attempt.attempt_uuid, clearSavedAnswers, exam.exam_uuid, onComplete, t],
  );

  const openSubmitConfirmation = useCallback(() => {
    const unansweredQuestions = orderedQuestions
      .map((q, idx) => (!isAnswered(q.id) ? idx + 1 : null))
      .filter((n): n is number => n !== null);
    dispatch({ type: 'SHOW_SUBMIT_CONFIRMATION', unansweredQuestions });
  }, [isAnswered, orderedQuestions]);

  const handleAnswerChange = (questionId: number, answer: any) => {
    dispatch({ type: 'ANSWER_QUESTION', questionId, answer });
    const currentAnswers =
      state.mode === 'answering' || state.mode === 'violation-warning' || state.mode === 'fullscreen-warning'
        ? state.answers
        : {};
    const updated = { ...currentAnswers, [questionId]: answer };
    saveAnswers(updated);
    setSaveState('unsaved');
    window.setTimeout(() => setSaveState('saved'), 600);
  };

  const shellControls = useMemo(
    () => ({
      saveState: isSubmitting ? ('saving' as const) : saveState,
      canSave: false,
      canSubmit: true,
      isSaving: false,
      isSubmitting,
      onSubmit: openSubmitConfirmation,
      navigation: {
        current: currentIndex + 1,
        total: orderedQuestions.length,
        answered: answeredCount,
        canPrevious: currentIndex > 0,
        canNext: currentIndex < orderedQuestions.length - 1,
        onPrevious: () => dispatch({ type: 'NAVIGATE_TO_QUESTION', index: Math.max(0, currentIndex - 1) }),
        onNext: () => dispatch({ type: 'NAVIGATE_TO_QUESTION', index: currentIndex + 1 }),
      },
      timer: settings.time_limit
        ? {
            startedAt: attempt.started_at,
            timeLimitMinutes: settings.time_limit,
            onExpire: () => {
              toast.error(t('autoSubmitting', { reason: t('autoSubmittingReason.timeExpired') }));
              void handleSubmit(true);
            },
          }
        : null,
      policy,
      initialViolationCount: state.violationCount,
      onViolation: handleViolation,
      onGuardAutoSubmit: () => {
        toast.error(t('autoSubmitting', { reason: t('autoSubmittingReason.violationThresholdExceeded') }));
        void handleSubmit(true);
      },
      recovery: showRecoveryDialog
        ? {
            open: true,
            lastSavedAt: getRecoverableData()?.lastSaved ?? null,
            onAccept: () => {
              dispatch({ type: 'ACCEPT_RECOVERY' });
              toast.success(t('answersRecovered'));
            },
            onReject: () => {
              clearSavedAnswers();
              dispatch({ type: 'REJECT_RECOVERY' });
            },
          }
        : null,
    }),
    [
      answeredCount,
      attempt.started_at,
      currentIndex,
      handleSubmit,
      handleViolation,
      isSubmitting,
      openSubmitConfirmation,
      orderedQuestions.length,
      policy,
      clearSavedAnswers,
      getRecoverableData,
      saveState,
      settings,
      showRecoveryDialog,
      state.violationCount,
      t,
    ],
  );
  useAttemptShellControls(shellControls);

  if (!currentQuestion) {
    return <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">No questions.</div>;
  }

  return (
    <div className="space-y-6">
      <Progress
        value={progress}
        className="h-2 transition-all duration-500 ease-out"
        aria-label={t('questionProgress', { current: currentIndex + 1, total: orderedQuestions.length })}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <ExamQuestionCard
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            answer={answers}
            onAnswerChange={handleAnswerChange}
          />
        </div>

        <div className="order-first hidden lg:order-last lg:block">
          <ExamQuestionNavigation
            totalQuestions={orderedQuestions.length}
            currentQuestionIndex={currentIndex}
            answeredQuestions={answeredQuestionIndexes}
            onQuestionSelect={(index) => dispatch({ type: 'NAVIGATE_TO_QUESTION', index })}
          />
        </div>
      </div>

      <ExamQuestionNavigationMobile
        totalQuestions={orderedQuestions.length}
        currentQuestionIndex={currentIndex}
        answeredQuestions={answeredQuestionIndexes}
        onQuestionSelect={(index) => dispatch({ type: 'NAVIGATE_TO_QUESTION', index })}
        onPrevious={() => dispatch({ type: 'NAVIGATE_TO_QUESTION', index: Math.max(0, currentIndex - 1) })}
        onNext={() => dispatch({ type: 'NAVIGATE_TO_QUESTION', index: currentIndex + 1 })}
        onSubmit={openSubmitConfirmation}
        canGoNext={currentIndex < orderedQuestions.length - 1}
        canGoPrevious={currentIndex > 0}
      />

      <ExamSubmitDialog
        open={showConfirmation}
        totalQuestions={orderedQuestions.length}
        answeredCount={answeredCount}
        isSubmitting={isSubmitting}
        labels={{
          confirmSubmission: t('confirmSubmission'),
          confirmSubmissionMessage: t('confirmSubmissionMessage'),
          totalQuestions: t('totalQuestions'),
          answered: t('answered'),
          unanswered: t('unanswered'),
          reviewQuestions: t('reviewQuestions'),
          submitting: t('submitting'),
          confirmAndSubmit: t('confirmAndSubmit'),
        }}
        onCancel={() => dispatch({ type: 'CANCEL_SUBMIT' })}
        onSubmit={() => void handleSubmit(false)}
      />
    </div>
  );
}
