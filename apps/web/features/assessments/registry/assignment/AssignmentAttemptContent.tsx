'use client';

import { useMemo } from 'react';

import PageLoading from '@components/Objects/Loaders/PageLoading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import AttemptHistoryList from '@/features/assessments/shared/AttemptHistoryList';
import { useAttemptShellControls } from '@/features/assessments/shell';
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission';
import type { AssessmentItem, ItemAnswer } from '@/features/assessments/domain/items';
import type { AttemptSaveState } from '@/features/assessments/shell';
import { renderCanonicalAttemptItem } from '@/features/assessments/shared/canonical-item-rendering';
import type { KindAttemptProps } from '../index';
export default function AssignmentAttemptContent({ vm }: KindAttemptProps) {
  const assessmentUuid = vm?.assessmentUuid ?? null;
  const submissionState = useAssessmentSubmission(assessmentUuid);
  const { status } = submissionState;
  const saveState = mapSaveState(submissionState.saveState, status);
  const canEdit = status === null || status === 'DRAFT' || status === 'RETURNED';
  const canSave = canEdit && submissionState.saveState === 'dirty';
  const canSubmit = canEdit;

  const shellControls = useMemo(
    () => ({
      saveState,
      status,
      canSave,
      canSubmit,
      isSaving: submissionState.isSaving,
      isSubmitting: submissionState.isSubmitting,
      onSave: canSave ? () => void submissionState.save() : undefined,
      onSubmit: canSubmit ? () => void submissionState.submit() : undefined,
      navigation: null,
    }),
    [canSave, canSubmit, saveState, status, submissionState],
  );
  useAttemptShellControls(shellControls);

  if (!vm || submissionState.isLoading) {
    return <PageLoading />;
  }

  if (!assessmentUuid) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No assessment found.
      </div>
    );
  }

  const attemptHistory = submissionState.submissions.map((submission, index) => ({
    id: submission.submission_uuid,
    label: index === 0 ? 'Latest submission' : `Attempt ${submissionState.submissions.length - index}`,
    submittedAt: submission.submitted_at ?? submission.updated_at,
    status: submission.status,
    scoreLabel:
      submission.final_score !== null && submission.final_score !== undefined
        ? `${Math.round(submission.final_score)}%`
        : null,
  }));

  return (
    <div className="space-y-6">
      {attemptHistory.length ? <AttemptHistoryList items={attemptHistory} /> : null}

      <SubmissionStatePanel submission={submissionState.submission} />

      <div className="space-y-4">
        {vm.items.map((item, index) => (
          <AssessmentItemCard
            key={item.item_uuid}
            index={index}
            item={item}
            answer={submissionState.answers[item.item_uuid]}
            disabled={!canEdit || submissionState.isSaving || submissionState.isSubmitting}
            assessmentUuid={assessmentUuid}
            onChange={(answer) => submissionState.setItemAnswer(item.item_uuid, answer)}
          />
        ))}
      </div>
    </div>
  );
}

function mapSaveState(
  saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error',
  status: string | null,
): AttemptSaveState {
  if (status === 'PENDING') return 'submitted';
  if (status === 'RETURNED') return 'returned';
  switch (saveState) {
    case 'dirty': {
      return 'unsaved';
    }
    case 'saving': {
      return 'saving';
    }
    case 'error':
    case 'conflict': {
      return 'error';
    }
    default: {
      return 'saved';
    }
  }
}

function SubmissionStatePanel({
  submission,
}: {
  submission: {
    status: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED';
    final_score?: number | null;
    grading_json?: { feedback?: string } | null;
    submitted_at?: string | null;
  } | null;
}) {
  if (!submission || submission.status === 'DRAFT') return null;

  if (submission.status === 'PENDING') {
    return (
      <Alert>
        <AlertTitle>Awaiting grade</AlertTitle>
        <AlertDescription>
          Submitted{submission.submitted_at ? ` on ${formatDateTime(submission.submitted_at)}` : ''}. Your teacher will
          release the grade when review is complete.
        </AlertDescription>
      </Alert>
    );
  }

  const scoreVisible = submission.status === 'PUBLISHED' || submission.status === 'RETURNED';
  const scoreLabel =
    scoreVisible && submission.final_score !== null && submission.final_score !== undefined
      ? `${Math.round(submission.final_score)}%`
      : null;

  return (
    <Alert>
      <AlertTitle>{submission.status === 'RETURNED' ? 'Returned for revision' : 'Result available'}</AlertTitle>
      <AlertDescription className="space-y-3">
        {scoreLabel ? (
          <span className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
            <Badge variant="secondary">Score</Badge>
            {scoreLabel}
          </span>
        ) : null}
        {submission.grading_json?.feedback ? (
          <p className="whitespace-pre-wrap">{submission.grading_json.feedback}</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function AssessmentItemCard({
  index,
  item,
  answer,
  disabled,
  assessmentUuid,
  onChange,
}: {
  index: number;
  item: AssessmentItem;
  answer: ItemAnswer | undefined;
  disabled: boolean;
  assessmentUuid: string;
  onChange: (answer: ItemAnswer) => void;
}) {
  return (
    <section
      id={`item-${item.item_uuid}`}
      className="bg-card space-y-4 rounded-lg border p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-muted-foreground text-xs font-medium uppercase">Question {index + 1}</div>
          <h2 className="mt-1 text-base font-semibold">{item.title || `Item ${index + 1}`}</h2>
        </div>
        <Badge variant="outline">{item.max_score} pts</Badge>
      </div>

      <ItemAttemptRenderer
        item={item}
        answer={answer}
        disabled={disabled}
        assessmentUuid={assessmentUuid}
        onChange={onChange}
      />
    </section>
  );
}

function ItemAttemptRenderer({
  item,
  answer,
  disabled,
  assessmentUuid,
  onChange,
}: {
  item: AssessmentItem;
  answer: ItemAnswer | undefined;
  disabled: boolean;
  assessmentUuid: string;
  onChange: (answer: ItemAnswer) => void;
}) {
  return renderCanonicalAttemptItem({ item, answer, disabled, assessmentUuid, onChange });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
