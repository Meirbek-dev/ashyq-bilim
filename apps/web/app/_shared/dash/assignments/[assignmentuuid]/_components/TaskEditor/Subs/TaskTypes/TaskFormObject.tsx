'use client';

import { Check, ChevronDown, GripVertical, Info, Lightbulb, Loader2, Plus, Trash2, Type, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  getAssignmentTask,
  getAssignmentTaskSubmissionsMe,
  getAssignmentTaskSubmissionsUser,
  handleAssignmentTaskSubmission,
  updateAssignmentTask,
} from '@services/courses/assignments';
import {
  useAssignmentsTask,
  useAssignmentsTaskDispatch,
} from '@components/Contexts/Assignments/AssignmentsTaskContext';
import AssignmentBoxUI from '@components/Objects/Activities/Assignment/AssignmentBoxUI';
import { useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { generateUUID } from '@/lib/utils';
import { cn } from '@/lib/utils';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// Types
// ============================================================================

interface BlankSchema {
  blankUUID?: string;
  placeholder: string;
  correctAnswer: string;
  hint?: string;
}

interface FormSchema {
  questionText: string;
  questionUUID?: string;
  blanks: BlankSchema[];
}

interface SubmissionItem {
  questionUUID: string;
  blankUUID: string;
  answer: string;
}

interface FormSubmitSchema {
  questions: FormSchema[];
  submissions: SubmissionItem[];
  assignment_task_submission_uuid?: string;
}

interface TaskFormObjectProps {
  view: 'teacher' | 'student' | 'grading';
  assignmentTaskUUID: string;
  user_id?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

const normalizeQuestion = (question: Partial<FormSchema>): FormSchema => ({
  questionText: question.questionText || '',
  questionUUID: question.questionUUID || `question_${generateUUID()}`,
  blanks: Array.isArray(question.blanks)
    ? (question.blanks as Partial<BlankSchema>[]).map((b) => ({
        placeholder: b?.placeholder ?? '',
        correctAnswer: b?.correctAnswer ?? '',
        hint: b?.hint ?? '',
        blankUUID: b?.blankUUID ?? `blank_${generateUUID()}`,
      }))
    : [],
});

const normalizeQuestions = (questions: unknown): FormSchema[] => {
  if (!Array.isArray(questions)) return [];
  return (questions as unknown[]).map((q) => normalizeQuestion(q as Partial<FormSchema>));
};

const normalizeSubmissions = (data: {
  questions?: unknown[];
  submissions?: SubmissionItem[];
  assignment_task_submission_uuid?: string;
}): FormSubmitSchema => ({
  questions: normalizeQuestions(data?.questions ?? []),
  submissions: Array.isArray(data?.submissions) ? data.submissions : [],
  assignment_task_submission_uuid: data?.assignment_task_submission_uuid,
});

const createDefaultBlank = (placeholder?: string): BlankSchema => ({
  placeholder: placeholder ?? '',
  correctAnswer: '',
  hint: '',
  blankUUID: `blank_${generateUUID()}`,
});

const createDefaultQuestion = (placeholder?: string): FormSchema => ({
  questionText: '',
  questionUUID: `question_${generateUUID()}`,
  blanks: [createDefaultBlank(placeholder)],
});

// ============================================================================
// Sub-Components
// ============================================================================

interface GradingSummaryProps {
  totalBlanks: number;
  correctCount: number;
}

function GradingSummary({ totalBlanks, correctCount }: GradingSummaryProps) {
  const t = useTranslations('Components.TaskFormObject');
  const incorrectCount = totalBlanks - correctCount;
  const percentage = totalBlanks > 0 ? (correctCount / totalBlanks) * 100 : 0;

  return (
    <Card className="mb-6 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{t('submissionSummary')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress
          value={percentage}
          className="h-2"
        />
        <div className="grid grid-cols-3 gap-4 text-center text-sm">
          <div>
            <p className="text-2xl font-bold text-blue-600">{totalBlanks}</p>
            <p className="text-muted-foreground text-xs">{t('totalBlanks')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{correctCount}</p>
            <p className="text-muted-foreground text-xs">{t('correct')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600">{incorrectCount}</p>
            <p className="text-muted-foreground text-xs">{t('incorrect')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface AnswerStatusBadgeProps {
  isCorrect: boolean;
  view: 'student' | 'grading';
  hasAnswer: boolean;
}

function AnswerStatusBadge({ isCorrect, view, hasAnswer }: AnswerStatusBadgeProps) {
  const t = useTranslations('Components.TaskFormObject');

  if (view === 'grading') {
    return (
      <Badge
        variant={isCorrect ? 'default' : 'destructive'}
        className="gap-1"
      >
        {isCorrect ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        {isCorrect ? t('correct') : t('incorrect')}
      </Badge>
    );
  }

  return (
    <div
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
        hasAnswer ? 'bg-green-100 text-green-600' : 'bg-muted text-muted-foreground',
      )}
    >
      {hasAnswer ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
    </div>
  );
}

interface HintDisplayProps {
  hint: string;
}

function HintDisplay({ hint }: HintDisplayProps) {
  if (!hint) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-blue-600">
      <Lightbulb className="h-3 w-3" />
      <span className="italic">{hint}</span>
    </div>
  );
}

interface BlankInputTeacherProps {
  blank: BlankSchema;
  qIndex: number;
  bIndex: number;
  isLast: boolean;
  canAddMore: boolean;
  canRemove: boolean;
  onBlankChange: (
    qIndex: number,
    bIndex: number,
    field: 'placeholder' | 'correctAnswer' | 'hint',
    value: string,
  ) => void;
  onAddBlank: (qIndex: number) => void;
  onRemoveBlank: (qIndex: number, bIndex: number) => void;
}

function BlankInputTeacher({
  blank,
  qIndex,
  bIndex,
  isLast,
  canAddMore,
  canRemove,
  onBlankChange,
  onAddBlank,
  onRemoveBlank,
}: BlankInputTeacherProps) {
  const t = useTranslations('Components.TaskFormObject');

  return (
    <div className="flex items-start gap-2">
      <Card className="flex-1 transition-shadow hover:shadow-md">
        <CardContent className="flex items-start gap-3 p-3">
          <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
            <Type className="text-muted-foreground h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">{t('placeholderText')}</Label>
              <Input
                value={blank.placeholder}
                onChange={(e) => onBlankChange(qIndex, bIndex, 'placeholder', e.target.value)}
                placeholder={t('placeholderText')}
                className="placeholder:text-muted-foreground h-8 rounded-md border bg-white px-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-green-600">{t('correctAnswerPlaceholder')}</Label>
              <Input
                value={blank.correctAnswer}
                onChange={(e) => onBlankChange(qIndex, bIndex, 'correctAnswer', e.target.value)}
                placeholder={t('correctAnswerPlaceholder')}
                className="h-8 border-green-200 bg-green-50 focus-visible:ring-green-500"
              />
            </div>
            <Collapsible>
              <CollapsibleTrigger
                nativeButton={false}
                render={
                  <div
                    role="button"
                    tabIndex={0}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'sm' }),
                      'h-6 gap-1 px-2 text-xs flex items-center',
                    )}
                  >
                    <Lightbulb className="h-3 w-3" />
                    {t('hintOptional')}
                    <ChevronDown className="h-3 w-3" />
                  </div>
                }
              />
              <CollapsibleContent className="pt-2">
                <Input
                  value={blank.hint || ''}
                  onChange={(e) => onBlankChange(qIndex, bIndex, 'hint', e.target.value)}
                  placeholder={t('hintOptional')}
                  className="h-8 border-blue-200 bg-blue-50 text-sm focus-visible:ring-blue-500"
                />
              </CollapsibleContent>
            </Collapsible>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                    onClick={() => onRemoveBlank(qIndex, bIndex)}
                    disabled={!canRemove}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
              <TooltipContent>{t('removeBlank')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>
      {isLast && canAddMore && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="mt-3 h-10 w-10 shrink-0"
                  onClick={() => onAddBlank(qIndex)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              }
            />
            <TooltipContent>{t('addBlank')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

interface BlankInputStudentProps {
  blank: BlankSchema;
  questionUUID: string;
  userAnswer: string;
  onAnswerChange: (questionUUID: string, blankUUID: string, answer: string) => void;
  onAnswerBlur: (questionUUID: string, blankUUID: string, answer: string) => void;
}

function BlankInputStudent({ blank, questionUUID, userAnswer, onAnswerChange, onAnswerBlur }: BlankInputStudentProps) {
  return (
    <Card className="transition-all focus-within:ring-2 focus-within:ring-blue-200 hover:shadow-md">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
          <Type className="text-muted-foreground h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <Input
            value={userAnswer}
            onChange={(e) => onAnswerChange(questionUUID, blank.blankUUID!, e.target.value)}
            onBlur={(e) => onAnswerBlur(questionUUID, blank.blankUUID!, e.target.value)}
            placeholder={blank.placeholder}
            data-blank-id={blank.blankUUID}
            className="placeholder:text-muted-foreground h-10 rounded-md border bg-white px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          <HintDisplay hint={blank.hint || ''} />
        </div>
        <AnswerStatusBadge
          isCorrect={false}
          view="student"
          hasAnswer={Boolean(userAnswer?.trim())}
        />
      </CardContent>
    </Card>
  );
}

interface BlankInputGradingProps {
  blank: BlankSchema;
  questionUUID: string;
  userAnswer: string;
}

function BlankInputGrading({ blank, questionUUID, userAnswer }: BlankInputGradingProps) {
  const t = useTranslations('Components.TaskFormObject');
  const isCorrect = (userAnswer ?? '').toLowerCase().trim() === (blank.correctAnswer ?? '').toLowerCase().trim();

  return (
    <Card
      className={cn('transition-all', isCorrect ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50')}
    >
      <CardContent className="flex items-center gap-3 p-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
            isCorrect ? 'bg-green-100' : 'bg-red-100',
          )}
        >
          <Type className={cn('h-4 w-4', isCorrect ? 'text-green-600' : 'text-red-600')} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate font-medium">{userAnswer || '-'}</p>
          <p className="text-muted-foreground text-xs">
            <span className="font-semibold">{t('expected')}</span> {blank.correctAnswer}
          </p>
          <HintDisplay hint={blank.hint || ''} />
        </div>
        <AnswerStatusBadge
          isCorrect={isCorrect}
          view="grading"
          hasAnswer
        />
      </CardContent>
    </Card>
  );
}

interface QuestionCardProps {
  question: FormSchema;
  qIndex: number;
  view: 'teacher' | 'student' | 'grading';
  userSubmissions: FormSubmitSchema;
  onQuestionChange?: (index: number, value: string) => void;
  onBlankChange?: (
    qIndex: number,
    bIndex: number,
    field: 'placeholder' | 'correctAnswer' | 'hint',
    value: string,
  ) => void;
  onAddBlank?: (qIndex: number) => void;
  onRemoveBlank?: (qIndex: number, bIndex: number) => void;
  onRemoveQuestion?: (qIndex: number) => void;
  onUserAnswerChange?: (questionUUID: string, blankUUID: string, answer: string) => void;
  onUserAnswerBlur?: (questionUUID: string, blankUUID: string, answer: string) => void;
}

function QuestionCard({
  question,
  qIndex,
  view,
  userSubmissions,
  onQuestionChange,
  onBlankChange,
  onAddBlank,
  onRemoveBlank,
  onRemoveQuestion,
  onUserAnswerChange,
  onUserAnswerBlur,
}: QuestionCardProps) {
  const t = useTranslations('Components.TaskFormObject');

  const getUserAnswer = (blankUUID: string) =>
    userSubmissions.submissions.find((s) => s.questionUUID === question.questionUUID && s.blankUUID === blankUUID)
      ?.answer || '';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-2">
          {view === 'teacher' && <GripVertical className="text-muted-foreground mt-2 h-5 w-5 shrink-0 cursor-grab" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="shrink-0"
              >
                Q{qIndex + 1}
              </Badge>
              {view === 'teacher' ? (
                <Input
                  value={question.questionText}
                  onChange={(e) => onQuestionChange?.(qIndex, e.target.value)}
                  placeholder={t('questionPlaceholder')}
                  className="placeholder:text-muted-foreground h-9 rounded-md border bg-white px-3 font-medium focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              ) : (
                <CardTitle className="text-base">{question.questionText || t('noQuestionText')}</CardTitle>
              )}
            </div>
            {view === 'teacher' && (
              <CardDescription className="mt-1">{t('blanksCount', { count: question.blanks.length })}</CardDescription>
            )}
          </div>
          {view === 'teacher' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                      onClick={() => onRemoveQuestion?.(qIndex)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  }
                />
                <TooltipContent>{t('removeQuestion')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-4">
        {question.blanks.map((blank, bIndex) => {
          if (view === 'teacher') {
            return (
              <BlankInputTeacher
                key={blank.blankUUID || bIndex}
                blank={blank}
                qIndex={qIndex}
                bIndex={bIndex}
                isLast={bIndex === question.blanks.length - 1}
                canAddMore={question.blanks.length < 5}
                canRemove={question.blanks.length > 1}
                onBlankChange={onBlankChange!}
                onAddBlank={onAddBlank!}
                onRemoveBlank={onRemoveBlank!}
              />
            );
          }

          if (view === 'grading') {
            return (
              <BlankInputGrading
                key={blank.blankUUID || bIndex}
                blank={blank}
                questionUUID={question.questionUUID!}
                userAnswer={getUserAnswer(blank.blankUUID!)}
              />
            );
          }

          return (
            <BlankInputStudent
              key={blank.blankUUID || bIndex}
              blank={blank}
              questionUUID={question.questionUUID!}
              userAnswer={getUserAnswer(blank.blankUUID!)}
              onAnswerChange={onUserAnswerChange!}
              onAnswerBlur={onUserAnswerBlur!}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function TaskFormObject({ view, assignmentTaskUUID, user_id }: TaskFormObjectProps) {
  const t = useTranslations('Components.TaskFormObject');
  const session = usePlatformSession() as {
    data?: { tokens?: { access_token?: string } };
  };
  const access_token = session?.data?.tokens?.access_token;
  const assignmentTaskState = useAssignmentsTask();
  const assignmentTaskStateHook = useAssignmentsTaskDispatch();
  const assignment = useAssignments();

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [questions, setQuestions] = useState<FormSchema[]>(() => {
    if (view === 'teacher') {
      const savedQuestions = assignmentTaskState.assignmentTask.contents?.questions;
      if (savedQuestions) {
        return normalizeQuestions(savedQuestions);
      }
      return [createDefaultQuestion(t('blankPlaceholder'))];
    }
    return [];
  });

  const [userSubmissions, setUserSubmissions] = useState<FormSubmitSchema>(normalizeSubmissions({}));
  const [initialUserSubmissions, setInitialUserSubmissions] = useState<FormSubmitSchema>(normalizeSubmissions({}));
  const [assignmentTaskOutsideProvider, setAssignmentTaskOutsideProvider] = useState<{
    max_grade_value?: number;
  } | null>(null);
  const [userSubmissionObject, setUserSubmissionObject] = useState<{
    grade?: number;
  } | null>(null);

  // Computed values
  const showSavingDisclaimer = JSON.stringify(userSubmissions) !== JSON.stringify(initialUserSubmissions);

  const gradingStats = (() => {
    const allBlanks = questions.flatMap((q) => q.blanks.map((blank) => ({ ...blank, questionUUID: q.questionUUID })));
    const correctCount = allBlanks.filter((blank) => {
      const userAnswer = userSubmissions.submissions.find(
        (s) => s.questionUUID === blank.questionUUID && s.blankUUID === blank.blankUUID,
      );
      return (userAnswer?.answer ?? '').toLowerCase().trim() === (blank.correctAnswer ?? '').toLowerCase().trim();
    }).length;
    return { totalBlanks: allBlanks.length, correctCount };
  })();

  // Teacher handlers
  const handleQuestionChange = (index: number, value: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], questionText: value };
      }
      return updated;
    });
  };

  const handleBlankChange = (
    qIndex: number,
    bIndex: number,
    field: 'placeholder' | 'correctAnswer' | 'hint',
    value: string,
  ) => {
    setQuestions((prev) => {
      const updated = [...prev];
      if (updated[qIndex]?.blanks[bIndex]) {
        updated[qIndex] = {
          ...updated[qIndex],
          blanks: updated[qIndex].blanks.map((b, i) => (i === bIndex ? { ...b, [field]: value } : b)),
        };
      }
      return updated;
    });
  };

  const addBlank = (qIndex: number) => {
    setQuestions((prev) => {
      if (!prev[qIndex]) return prev;
      return prev.map((q, i) =>
        i === qIndex ? { ...q, blanks: [...q.blanks, createDefaultBlank(t('blankPlaceholder'))] } : q,
      );
    });
  };

  const removeBlank = (qIndex: number, bIndex: number) => {
    setQuestions((prev) => {
      const q = prev[qIndex];
      if (!q) return prev;
      if (q.blanks.length === 1) {
        toast.error(t('removeBlankError'));
        return prev;
      }
      return prev.map((item, i) =>
        i === qIndex ? { ...item, blanks: item.blanks.filter((_, j) => j !== bIndex) } : item,
      );
    });
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, createDefaultQuestion(t('blankPlaceholder'))]);
  };

  const removeQuestion = (qIndex: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== qIndex));
  };

  // Student handlers
  const handleUserAnswerChange = (questionUUID: string, blankUUID: string, answer: string) => {
    setUserSubmissions((prev) => {
      const existingIndex = prev.submissions.findIndex(
        (s) => s.questionUUID === questionUUID && s.blankUUID === blankUUID,
      );
      const updatedSubmissions =
        existingIndex !== -1
          ? prev.submissions.map((s, i) => (i === existingIndex ? { ...s, answer } : s))
          : [...prev.submissions, { questionUUID, blankUUID, answer }];
      return { ...prev, submissions: updatedSubmissions };
    });
  };

  const handleUserAnswerBlur = (questionUUID: string, blankUUID: string, answer: string) => {
    if (!answer.trim() || view !== 'student') return;

    const allBlanks = questions.flatMap((q) =>
      q.blanks.map((b) => ({
        questionUUID: q.questionUUID,
        blankUUID: b.blankUUID,
      })),
    );
    const currentIndex = allBlanks.findIndex((b) => b.questionUUID === questionUUID && b.blankUUID === blankUUID);
    const nextBlank = allBlanks[currentIndex + 1];

    if (nextBlank?.blankUUID) {
      setTimeout(() => {
        const nextInput = document.querySelector<HTMLElement>(`[data-blank-id="${nextBlank.blankUUID}"]`);
        nextInput?.focus();
      }, 100);
    }
  };

  // API handlers
  const saveFC = async () => {
    if (!access_token) {
      toast.error(t('authRequired') || 'Authentication required');
      return;
    }
    if (!assignmentTaskState.assignmentTask.assignment_task_uuid || !assignment.assignment_object.assignment_uuid) {
      console.error('Missing assignment task or assignment UUID for save');
      toast.error(t('saveError'));
      return;
    }
    setIsSaving(true);
    try {
      const res = await updateAssignmentTask(
        { contents: { questions } },
        assignmentTaskState.assignmentTask.assignment_task_uuid,
        assignment.assignment_object.assignment_uuid,
        access_token,
      );
      if (res) {
        assignmentTaskStateHook({ type: 'reload' });
        toast.success(t('savedSuccessfully'));
      } else {
        toast.error(t('saveError'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const submitFC = async () => {
    if (userSubmissions.submissions.length === 0) {
      toast.error(t('fillBlanksError'));
      return;
    }
    if (!access_token) {
      toast.error(t('authRequired') || 'Authentication required');
      return;
    }
    if (!assignmentTaskUUID || !assignment.assignment_object.assignment_uuid) {
      console.error('Missing assignmentTaskUUID or assignment UUID for submit');
      toast.error(t('submitError'));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await handleAssignmentTaskSubmission(
        {
          assignment_task_submission_uuid: userSubmissions.assignment_task_submission_uuid || null,
          task_submission: userSubmissions,
          grade: 0,
          task_submission_grade_feedback: '',
        },
        assignmentTaskUUID,
        assignment.assignment_object.assignment_uuid,
        access_token,
      );

      if (res) {
        const updatedSubmissions = {
          ...userSubmissions,
          assignment_task_submission_uuid:
            res.data?.assignment_task_submission_uuid || userSubmissions.assignment_task_submission_uuid,
        };
        setUserSubmissions(updatedSubmissions);
        setInitialUserSubmissions(updatedSubmissions);
        toast.success(t('submittedSuccessfully'));
      } else {
        toast.error(t('submitError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const gradeFC = async () => {
    if (!user_id) {
      toast.error(t('userIdRequired'));
      return;
    }

    if (!access_token) {
      toast.error(t('authRequired') || 'Authentication required');
      return;
    }
    if (!assignmentTaskUUID || !assignment.assignment_object.assignment_uuid) {
      console.error('Missing assignmentTaskUUID or assignment UUID for grade');
      toast.error(t('gradeError'));
      return;
    }

    setIsSubmitting(true);
    try {
      const finalGrade =
        gradingStats.totalBlanks > 0 ? Math.round((gradingStats.correctCount / gradingStats.totalBlanks) * 100) : 0;

      const res = await handleAssignmentTaskSubmission(
        {
          assignment_task_submission_uuid: userSubmissions.assignment_task_submission_uuid,
          task_submission: userSubmissions,
          grade: finalGrade,
          task_submission_grade_feedback: t('autoGradedBySystem'),
        },
        assignmentTaskUUID,
        assignment.assignment_object.assignment_uuid,
        access_token,
      );

      if (res) {
        toast.success(
          t('gradedSuccessfully', {
            finalGrade,
            correctAnswers: gradingStats.correctCount,
            totalBlanks: gradingStats.totalBlanks,
          }),
        );
      } else {
        toast.error(t('gradeError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Effects
  useEffect(() => {
    if (view === 'teacher' && assignmentTaskUUID) {
      assignmentTaskStateHook({
        type: 'setSelectedAssignmentTaskUUID',
        payload: assignmentTaskUUID,
      });
    }
  }, [view, assignmentTaskUUID, assignmentTaskStateHook]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Helper to load assignment task
        const fetchAssignmentTask = async () => {
          if (!assignmentTaskUUID) return;
          if (!access_token) {
            console.warn('Missing access token for loadAssignmentTask');
            return;
          }
          const res = await getAssignmentTask(assignmentTaskUUID, access_token);
          if (res.success) {
            setAssignmentTaskOutsideProvider(res.data);
            const normalizedQuestions = normalizeQuestions(res.data.contents?.questions);
            if (view !== 'teacher' || normalizedQuestions.length > 0) {
              setQuestions(normalizedQuestions);
            }
          }
        };

        // Helper to load current user's submissions
        const fetchUserSubmissions = async () => {
          if (view !== 'student' || !assignmentTaskUUID) return;
          if (!access_token) {
            console.warn('Missing access token for loadUserSubmissions');
            return;
          }
          const res = await getAssignmentTaskSubmissionsMe(
            assignmentTaskUUID,
            assignment.assignment_object.assignment_uuid,
            access_token,
          );
          if (res.success) {
            const normalized = normalizeSubmissions({
              ...res.data.task_submission,
              assignment_task_submission_uuid: res.data.assignment_task_submission_uuid,
            });
            setUserSubmissions(normalized);
            setInitialUserSubmissions(normalized);
          }
        };

        // Helper to load submissions for grading
        const fetchUserSubmissionsForGrading = async () => {
          if (!access_token || !user_id || !assignmentTaskUUID) return;
          const res = await getAssignmentTaskSubmissionsUser(
            assignmentTaskUUID,
            user_id,
            assignment.assignment_object.assignment_uuid,
            access_token,
          );
          if (res.success) {
            const normalized = normalizeSubmissions({
              ...res.data.task_submission,
              assignment_task_submission_uuid: res.data.assignment_task_submission_uuid,
            });
            setUserSubmissions(normalized);
            setInitialUserSubmissions(normalized);
            setUserSubmissionObject(res.data);
          }
        };

        if (view === 'teacher') {
          if (!assignmentTaskState.assignmentTask.contents?.questions) {
            await fetchAssignmentTask();
          }
        } else if (view === 'student') {
          await Promise.all([fetchAssignmentTask(), fetchUserSubmissions()]);
        } else if (view === 'grading') {
          await Promise.all([fetchAssignmentTask(), fetchUserSubmissionsForGrading()]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, [
    view,
    assignmentTaskState.assignmentTask.contents?.questions,
    assignmentTaskUUID,
    access_token,
    assignment.assignment_object.assignment_uuid,
    user_id,
  ]);

  // Render
  if (isLoading) {
    return (
      <AssignmentBoxUI
        submitFC={submitFC}
        saveFC={saveFC}
        gradeFC={gradeFC}
        view={view}
        type="form"
      >
        <LoadingSkeleton />
      </AssignmentBoxUI>
    );
  }

  if (view !== 'teacher' && (!questions || questions.length === 0)) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>{t('noQuestionsFound')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <AssignmentBoxUI
      submitFC={submitFC}
      saveFC={saveFC}
      gradeFC={gradeFC}
      view={view}
      currentPoints={userSubmissionObject?.grade}
      maxPoints={assignmentTaskOutsideProvider?.max_grade_value}
      showSavingDisclaimer={showSavingDisclaimer}
      type="form"
    >
      {view === 'grading' && (
        <GradingSummary
          totalBlanks={gradingStats.totalBlanks}
          correctCount={gradingStats.correctCount}
        />
      )}

      <div className="space-y-4">
        {questions.map((question, qIndex) => (
          <QuestionCard
            key={question.questionUUID || qIndex}
            question={question}
            qIndex={qIndex}
            view={view}
            userSubmissions={userSubmissions}
            onQuestionChange={handleQuestionChange}
            onBlankChange={handleBlankChange}
            onAddBlank={addBlank}
            onRemoveBlank={removeBlank}
            onRemoveQuestion={removeQuestion}
            onUserAnswerChange={handleUserAnswerChange}
            onUserAnswerBlur={handleUserAnswerBlur}
          />
        ))}
      </div>

      {view === 'teacher' && questions.length < 6 && (
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={addQuestion}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {t('addQuestion')}
        </Button>
      )}
    </AssignmentBoxUI>
  );
}

export default TaskFormObject;
