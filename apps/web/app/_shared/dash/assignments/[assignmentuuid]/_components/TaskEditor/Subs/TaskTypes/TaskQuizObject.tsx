'use client';

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Info,
  Loader2,
  Minus,
  PlayCircle,
  Plus,
  PlusCircle,
  RefreshCcw,
  Settings,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAssignmentSubmission } from '@components/Contexts/Assignments/AssignmentSubmissionContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn, generateUUID } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

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
import QuizSkeleton from '@components/Objects/Quiz/QuizSkeleton';
import { useTestGuard } from '@/hooks/useTestGuard';

// ============================================================================
// Types
// ============================================================================

interface QuizOption {
  optionUUID?: string;
  text: string;
  fileID: string;
  type: 'text' | 'image' | 'audio' | 'video';
  assigned_right_answer: boolean;
}

interface QuizQuestion {
  questionText: string;
  questionUUID?: string;
  options: QuizOption[];
}

interface QuizSubmission {
  questionUUID: string;
  optionUUID: string;
  answer: boolean;
}

interface QuizSubmitSchema {
  questions: QuizQuestion[];
  submissions: QuizSubmission[];
  assignment_task_submission_uuid?: string;
}

interface QuizSettings {
  max_attempts?: number | null;
  time_limit_seconds?: number | null;
  max_score_penalty_per_attempt?: number | null;
  prevent_copy?: boolean;
  track_violations?: boolean;
  max_violations?: number;
  block_on_violations?: boolean;
}

interface TaskQuizObjectProps {
  view: 'teacher' | 'student' | 'grading';
  user_id?: number;
  assignmentTaskUUID?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_QUESTIONS = 10;
const MAX_OPTIONS = 6;
const DEFAULT_MAX_VIOLATIONS = 2;

const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  max_attempts: null,
  time_limit_seconds: null,
  max_score_penalty_per_attempt: null,
  prevent_copy: true,
  track_violations: true,
  max_violations: DEFAULT_MAX_VIOLATIONS,
  block_on_violations: true,
};

// ============================================================================
// Helpers
// ============================================================================

const createQuestion = (): QuizQuestion => ({
  questionText: '',
  questionUUID: `question_${generateUUID()}`,
  options: [createOption()],
});

const createOption = (): QuizOption => ({
  text: '',
  fileID: '',
  type: 'text',
  assigned_right_answer: false,
  optionUUID: `option_${generateUUID()}`,
});

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

// ============================================================================
// Sub-components
// ============================================================================

interface OptionLetterBadgeProps {
  index: number;
}

const OptionLetterBadge = ({ index }: OptionLetterBadgeProps) => (
  <div className="bg-muted text-muted-foreground flex h-full w-10 shrink-0 items-center justify-center rounded-l-lg font-semibold">
    {String.fromCodePoint(65 + index)}
  </div>
);

interface CorrectAnswerToggleProps {
  isCorrect: boolean;
  onClick?: () => void;
  readOnly?: boolean;
  t: (key: string) => string;
}

const CorrectAnswerToggle = ({ isCorrect, onClick, readOnly, t }: CorrectAnswerToggleProps) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant={isCorrect ? 'default' : 'secondary'}
            className={cn(
              'gap-1 transition-colors',
              isCorrect
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-rose-100 text-rose-600 hover:bg-rose-200',
              !readOnly && 'cursor-pointer',
              readOnly && 'cursor-default',
            )}
            onClick={readOnly ? undefined : onClick}
          >
            {isCorrect ? <Check className="size-3" /> : <X className="size-3" />}
            <span className="text-xs font-medium">{isCorrect ? t('true') : t('false')}</span>
          </Badge>
        }
      />
      <TooltipContent>
        <p>{isCorrect ? t('markedAsTrue') : t('markedAsFalse')}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

interface SelectionIndicatorProps {
  isSelected: boolean;
  onClick?: () => void;
  interactive?: boolean;
}

const SelectionIndicator = ({ isSelected, onClick, interactive = false }: SelectionIndicatorProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!interactive}
    className={cn(
      'flex size-6 shrink-0 items-center justify-center rounded-md transition-all',
      isSelected ? 'bg-emerald-100 text-emerald-600' : 'bg-muted text-muted-foreground',
      interactive && 'hover:scale-105 active:scale-95',
      !interactive && 'cursor-default',
    )}
  >
    {isSelected ? <Check className="size-3.5" /> : <X className="size-3.5 opacity-50" />}
  </button>
);

interface SubmissionReviewCardProps {
  assignmentUUID?: string | null;
  t: ReturnType<typeof useTranslations>;
}

const SubmissionReviewCard = ({ t }: SubmissionReviewCardProps) => (
  <Card className="border-amber-200 bg-amber-50">
    <CardHeader>
      <CardTitle>{t('startTest.review.title')}</CardTitle>
      <CardDescription>{t('startTest.review.subtitle')}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <p className="text-muted-foreground text-sm">{t('startTest.review.description')}</p>
      <Button
        variant="outline"
        onClick={() => globalThis.location.reload()}
      >
        {t('startTest.review.refresh')}
      </Button>
    </CardContent>
  </Card>
);

interface SubmissionGradedCardProps {
  assignmentUUID?: string | null;
  grade?: number | null;
  t: ReturnType<typeof useTranslations>;
}

const SubmissionGradedCard = ({ grade, t }: SubmissionGradedCardProps) => {
  const isGraded = typeof grade === 'number';
  return (
    <Card className="relative overflow-hidden border-emerald-200 bg-emerald-50/60">
      {/* subtle accent */}
      <div className="absolute inset-x-0 top-0 h-1 bg-emerald-400" />

      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{t('startTest.graded.title')}</CardTitle>

          <Badge
            variant="secondary"
            className="bg-emerald-100 text-emerald-700"
          >
            {t('startTest.graded.status')}
          </Badge>
        </div>

        <CardDescription>{t('startTest.graded.subtitle')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Score block */}
        <div className="bg-background rounded-lg border p-4">
          <div className="flex items-end justify-between">
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm font-medium">{t('startTest.graded.scoreLabel')}</p>
              <p className="text-muted-foreground text-xs">{t('startTest.graded.points')}</p>
            </div>

            <div className="text-right">
              <p className="text-3xl font-bold tracking-tight text-emerald-600">{isGraded ? grade : '-'}</p>
            </div>
          </div>
        </div>

        {/* Action */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => globalThis.location.reload()}
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          {t('startTest.graded.refresh')}
        </Button>
      </CardContent>
    </Card>
  );
};

interface TimerDisplayProps {
  timeRemaining: number;
  violations: any[];
  trackViolations: boolean;
  t: ReturnType<typeof useTranslations>;
}

const TimerDisplay = ({ timeRemaining, violations, trackViolations, t }: TimerDisplayProps) => {
  const isLowTime = timeRemaining <= 60;
  const isMediumTime = timeRemaining <= 300 && timeRemaining > 60;

  return (
    <Card
      className={cn(
        'border-2 transition-colors',
        isLowTime && 'animate-pulse border-red-500',
        isMediumTime && 'border-amber-500',
        !isLowTime && !isMediumTime && 'border-blue-500',
      )}
    >
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <Clock
            className={cn(
              'size-5',
              isLowTime && 'text-red-600',
              isMediumTime && 'text-amber-600',
              !isLowTime && !isMediumTime && 'text-blue-600',
            )}
          />
          <span className="font-semibold">{t('timer.remaining')}</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'text-2xl font-bold tabular-nums',
              isLowTime && 'text-red-600',
              isMediumTime && 'text-amber-600',
              !isLowTime && !isMediumTime && 'text-blue-600',
            )}
          >
            {formatTime(timeRemaining)}
          </span>
          {violations.length > 0 && trackViolations && (
            <Badge
              variant="destructive"
              className="gap-1"
            >
              <Shield className="size-3" />
              {violations.length} {t('timer.violations')}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

interface QuizSettingsPanelProps {
  settings: QuizSettings;
  onSettingsChange: (settings: QuizSettings) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}

const QuizSettingsPanel = ({ settings, onSettingsChange, isOpen, onOpenChange, t }: QuizSettingsPanelProps) => {
  const updateSetting = <K extends keyof QuizSettings>(key: K, value: QuizSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <CardTitle>{t('settings.title')}</CardTitle>
            </div>
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                >
                  <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                </Button>
              }
            />
          </div>
          <CardDescription>{t('settings.description')}</CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Attempt Limits */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <Label
                  htmlFor="max-attempts"
                  className="text-sm font-semibold"
                >
                  {t('settings.maxAttempts')}
                </Label>
              </div>
              <Input
                id="max-attempts"
                type="number"
                min="1"
                max="5"
                placeholder={t('settings.unlimited')}
                value={settings.max_attempts ?? ''}
                onChange={(e) => updateSetting('max_attempts', e.target.value ? Number.parseInt(e.target.value) : null)}
              />
            </div>

            {/* Time Limit */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <Label
                  htmlFor="time-limit"
                  className="text-sm font-semibold"
                >
                  {t('settings.timeLimit')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="time-limit"
                  type="number"
                  min="1"
                  placeholder={t('settings.noLimit')}
                  value={settings.time_limit_seconds ? settings.time_limit_seconds / 60 : ''}
                  onChange={(e) =>
                    updateSetting('time_limit_seconds', e.target.value ? Number.parseInt(e.target.value) * 60 : null)
                  }
                />
                <span className="text-muted-foreground text-sm">{t('settings.minutes')}</span>
              </div>
            </div>

            {/* Attempt Penalty */}
            <div className="space-y-3">
              <Label
                htmlFor="penalty"
                className="text-sm font-semibold"
              >
                {t('settings.attemptPenalty')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="penalty"
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  placeholder="0"
                  value={settings.max_score_penalty_per_attempt ?? ''}
                  onChange={(e) =>
                    updateSetting(
                      'max_score_penalty_per_attempt',
                      e.target.value ? Number.parseFloat(e.target.value) : null,
                    )
                  }
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
              <p className="text-muted-foreground text-xs">{t('settings.attemptPenaltyHint')}</p>
            </div>

            <Separator />

            {/* Anti-Cheat Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-600" />
                <Label className="text-sm font-semibold">{t('settings.antiCheat')}</Label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="prevent-copy"
                    className="text-sm"
                  >
                    {t('settings.preventCopy')}
                  </Label>
                  <Switch
                    id="prevent-copy"
                    checked={settings.prevent_copy}
                    onCheckedChange={(checked) => updateSetting('prevent_copy', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="track-violations"
                    className="text-sm"
                  >
                    {t('settings.trackViolations')}
                  </Label>
                  <Switch
                    id="track-violations"
                    checked={settings.track_violations}
                    onCheckedChange={(checked) => updateSetting('track_violations', checked)}
                  />
                </div>

                {settings.track_violations && (
                  <>
                    <div className="space-y-2">
                      <Label
                        htmlFor="max-violations"
                        className="text-sm"
                      >
                        {t('settings.maxViolations')}
                      </Label>
                      <Input
                        id="max-violations"
                        type="number"
                        min="1"
                        max="10"
                        value={settings.max_violations ?? DEFAULT_MAX_VIOLATIONS}
                        onChange={(e) => updateSetting('max_violations', Number.parseInt(e.target.value))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="block-violations"
                        className="text-sm"
                      >
                        {t('settings.blockOnViolations')}
                      </Label>
                      <Switch
                        id="block-violations"
                        checked={settings.block_on_violations}
                        onCheckedChange={(checked) => updateSetting('block_on_violations', checked)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

// ============================================================================
// Main Component
// ============================================================================

const TaskQuizObject = ({ view, assignmentTaskUUID, user_id }: TaskQuizObjectProps) => {
  const t = useTranslations('DashPage.Assignments.TaskQuizObject');
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const assignmentTaskState = useAssignmentsTask();
  const assignmentTaskStateHook = useAssignmentsTaskDispatch();
  const assignment = useAssignments();
  const submissionContext = useAssignmentSubmission();

  // Initialize questions based on view
  const initialQuestions = useMemo(() => {
    if (view === 'teacher' && assignmentTaskState.assignmentTask.contents?.questions) {
      return assignmentTaskState.assignmentTask.contents.questions;
    }
    return view === 'teacher' ? [createQuestion()] : [];
  }, [view, assignmentTaskState.assignmentTask.contents?.questions]);

  // Initialize settings
  const initialSettings = useMemo(() => {
    if (view === 'teacher' && assignmentTaskState.assignmentTask.contents?.settings) {
      return { ...DEFAULT_QUIZ_SETTINGS, ...assignmentTaskState.assignmentTask.contents.settings };
    }
    return DEFAULT_QUIZ_SETTINGS;
  }, [view, assignmentTaskState.assignmentTask.contents?.settings]);

  // State
  const [isLoading, setIsLoading] = useState(view !== 'teacher');
  const [isSaving, setIsSaving] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  const [quizSettings, setQuizSettings] = useState<QuizSettings>(initialSettings);
  const [showSettings, setShowSettings] = useState(false);

  const [userSubmissions, setUserSubmissions] = useState<QuizSubmitSchema>({
    questions: [],
    submissions: [],
  });
  const [initialUserSubmissions, setInitialUserSubmissions] = useState<QuizSubmitSchema>({
    questions: [],
    submissions: [],
  });
  const [assignmentTaskOutsideProvider, setAssignmentTaskOutsideProvider] = useState<any>(null);
  const [userSubmissionObject, setUserSubmissionObject] = useState<any>(null);

  // Quiz test state
  const [testStarted, setTestStarted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(0);
  const [violations, setViolations] = useState<any[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // Keep track of previous focus mode so we can restore it after the quiz
  const prevFocusModeRef = useRef<string | null>(null);

  // Computed values
  const showSavingDisclaimer = useMemo(
    () => JSON.stringify(initialUserSubmissions.submissions) !== JSON.stringify(userSubmissions.submissions),
    [initialUserSubmissions.submissions, userSubmissions.submissions],
  );

  const canAddQuestion = questions.length < MAX_QUESTIONS;

  const isOptionSelected = useCallback(
    (questionUUID?: string, optionUUID?: string) => {
      return userSubmissions.submissions.some(
        (s) => s.questionUUID === questionUUID && s.optionUUID === optionUUID && s.answer,
      );
    },
    [userSubmissions.submissions],
  );

  // Test guard
  const handleViolation = useCallback(
    (type: string, count: number) => {
      const newViolation = { type, timestamp: Date.now() };
      setViolations((prev) => [...prev, newViolation]);

      toast.warning(t('violation.detected', { type, count }), {
        description: t('violation.warning', { count }),
      });

      if (quizSettings.block_on_violations && count >= (quizSettings.max_violations || DEFAULT_MAX_VIOLATIONS)) {
        toast.error(t('violation.blocked'));
      }
    },
    [quizSettings.block_on_violations, quizSettings.max_violations, t],
  );

  const { isLocked } = useTestGuard({
    onViolation: handleViolation,
    maxViolations: quizSettings.max_violations || DEFAULT_MAX_VIOLATIONS,
    enabled: testStarted && view === 'student' && quizSettings.track_violations === true,
    preventCopy: quizSettings.prevent_copy,
    trackBlur: quizSettings.track_violations,
    trackDevTools: quizSettings.track_violations,
  });

  // Question handlers
  const handleQuestionChange = useCallback((index: number, value: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], questionText: value };
      }
      return updated;
    });
  }, []);

  const handleOptionChange = useCallback((qIndex: number, oIndex: number, value: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      if (updated[qIndex]?.options[oIndex]) {
        updated[qIndex] = {
          ...updated[qIndex],
          options: updated[qIndex].options.map((opt, i) => (i === oIndex ? { ...opt, text: value } : opt)),
        };
      }
      return updated;
    });
  }, []);

  const addOption = useCallback((qIndex: number) => {
    setQuestions((prev) => {
      const updated = [...prev];
      if (updated[qIndex] && updated[qIndex].options.length < MAX_OPTIONS) {
        updated[qIndex] = {
          ...updated[qIndex],
          options: [...updated[qIndex].options, createOption()],
        };
      }
      return updated;
    });
  }, []);

  const removeOption = useCallback(
    (qIndex: number, oIndex: number) => {
      setQuestions((prev) => {
        const updated = [...prev];
        if (updated[qIndex] && updated[qIndex].options.length > 1) {
          updated[qIndex] = {
            ...updated[qIndex],
            options: updated[qIndex].options.filter((_, i) => i !== oIndex),
          };
          return updated;
        }
        toast.error(t('optionDeleteError'));
        return prev;
      });
    },
    [t],
  );

  const addQuestion = useCallback(() => {
    if (canAddQuestion) {
      setQuestions((prev) => [...prev, createQuestion()]);
    }
  }, [canAddQuestion]);

  const removeQuestion = useCallback((qIndex: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== qIndex));
  }, []);

  const toggleOption = useCallback((qIndex: number, oIndex: number) => {
    setQuestions((prev) => {
      const updated = [...prev];
      if (updated[qIndex]?.options[oIndex]) {
        updated[qIndex] = {
          ...updated[qIndex],
          options: updated[qIndex].options.map((opt, i) =>
            i === oIndex ? { ...opt, assigned_right_answer: !opt.assigned_right_answer } : opt,
          ),
        };
      }
      return updated;
    });
  }, []);

  const chooseOption = useCallback(
    (qIndex: number, oIndex: number) => {
      const question = questions[qIndex];
      const option = question?.options[oIndex];

      if (!question?.questionUUID || !option?.optionUUID) return;

      const { questionUUID } = question;
      const { optionUUID } = option;

      setUserSubmissions((prev) => {
        const existing = prev.submissions.find((s) => s.questionUUID === questionUUID && s.optionUUID === optionUUID);

        if (!existing) {
          return {
            ...prev,
            submissions: [...prev.submissions, { questionUUID, optionUUID, answer: true }],
          };
        }

        return {
          ...prev,
          submissions: prev.submissions.map((s) =>
            s.questionUUID === questionUUID && s.optionUUID === optionUUID ? { ...s, answer: !s.answer } : s,
          ),
        };
      });
    },
    [questions],
  );

  const startTest = useCallback(() => {
    setTestStarted(true);
    setAttemptNumber((prev) => prev + 1);

    if (quizSettings.time_limit_seconds) {
      setTimeRemaining(quizSettings.time_limit_seconds);
    }

    toast.success(t('testStarted'), {
      description: quizSettings.time_limit_seconds
        ? t('timerStarted', { minutes: Math.floor(quizSettings.time_limit_seconds / 60) })
        : t('noTimeLimit'),
    });
  }, [quizSettings.time_limit_seconds, t]);

  // API Functions
  const saveFC = useCallback(async () => {
    setIsSaving(true);
    try {
      const res = await updateAssignmentTask(
        { contents: { questions, settings: quizSettings } },
        assignmentTaskState.assignmentTask.assignment_task_uuid,
        assignment.assignment_object.assignment_uuid,
        access_token,
      );

      if (res) {
        assignmentTaskStateHook({ type: 'reload' });
        toast.success(t('saveSuccess'));
      } else {
        toast.error(t('saveError'));
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    questions,
    quizSettings,
    assignmentTaskState.assignmentTask.assignment_task_uuid,
    assignment.assignment_object.assignment_uuid,
    access_token,
    assignmentTaskStateHook,
    t,
  ]);

  const submitFC = useCallback(async () => {
    if (questions.length === 0) {
      toast.error(t('noQuestionsFound'));
      return;
    }

    setIsSaving(true);
    try {
      const updatedSubmissions: QuizSubmission[] = questions.flatMap((question) =>
        question.options.map((option) => {
          const existing = userSubmissions.submissions.find(
            (s) => s.questionUUID === question.questionUUID && s.optionUUID === option.optionUUID,
          );
          return (
            existing || {
              questionUUID: question.questionUUID || '',
              optionUUID: option.optionUUID || '',
              answer: false,
            }
          );
        }),
      );

      const updatedUserSubmissions = {
        ...userSubmissions,
        submissions: updatedSubmissions,
      };

      const values = {
        assignment_task_submission_uuid: userSubmissions.assignment_task_submission_uuid || null,
        task_submission: updatedUserSubmissions,
        grade: 0,
        task_submission_grade_feedback: '',
      };

      if (assignmentTaskUUID) {
        const res = await handleAssignmentTaskSubmission(
          values,
          assignmentTaskUUID,
          assignment.assignment_object.assignment_uuid,
          access_token,
        );

        if (res) {
          assignmentTaskStateHook({ type: 'reload' });
          toast.success(t('saveSuccess'));

          const finalSubmissions = {
            ...updatedUserSubmissions,
            assignment_task_submission_uuid:
              res.data?.assignment_task_submission_uuid || userSubmissions.assignment_task_submission_uuid,
          };
          setUserSubmissions(finalSubmissions);
          setInitialUserSubmissions(finalSubmissions);
        } else {
          toast.error(t('saveError'));
        }
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    questions,
    userSubmissions,
    assignmentTaskUUID,
    assignment.assignment_object.assignment_uuid,
    access_token,
    assignmentTaskStateHook,
    t,
  ]);

  const gradeFC = useCallback(async () => {
    if (!assignmentTaskUUID) return;

    const totalCorrectOptions = questions.reduce(
      (total, q) => total + q.options.filter((o) => o.assigned_right_answer).length,
      0,
    );

    if (totalCorrectOptions === 0) {
      toast.error(t('noQuestionsFound'));
      return;
    }

    setIsSaving(true);
    try {
      let selectedCorrect = 0;

      questions.forEach((question) => {
        question.options.forEach((option) => {
          const submission = userSubmissions.submissions.find(
            (s) => s.questionUUID === question.questionUUID && s.optionUUID === option.optionUUID,
          );
          const answered = submission?.answer === true;
          if (answered && option.assigned_right_answer) selectedCorrect += 1;
        });
      });

      const finalGrade = Math.round((selectedCorrect / totalCorrectOptions) * 100);

      const values = {
        assignment_task_submission_uuid: userSubmissions.assignment_task_submission_uuid,
        task_submission: userSubmissions,
        grade: finalGrade,
        task_submission_grade_feedback: t('autoGraded'),
      };

      const res = await handleAssignmentTaskSubmission(
        values,
        assignmentTaskUUID,
        assignment.assignment_object.assignment_uuid,
        access_token,
      );

      if (res && view === 'grading' && user_id) {
        const sres = await getAssignmentTaskSubmissionsUser(
          assignmentTaskUUID,
          user_id,
          assignment.assignment_object.assignment_uuid,
          access_token,
        );
        if (sres.success && sres.data?.task_submission) {
          const submission = {
            ...sres.data.task_submission,
            assignment_task_submission_uuid: sres.data.assignment_task_submission_uuid,
          };
          setUserSubmissions(submission);
          setInitialUserSubmissions(submission);
          setUserSubmissionObject(sres.data);
        }
        toast.success(t('gradeSuccess', { finalGrade }));
      } else {
        toast.error(t('gradeError'));
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    assignmentTaskUUID,
    questions,
    userSubmissions,
    assignment.assignment_object.assignment_uuid,
    access_token,
    t,
    view,
    user_id,
  ]);

  // Timer effect
  useEffect(() => {
    if (!testStarted || timeRemaining === null || timeRemaining <= 0 || view !== 'student') {
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!);
          toast.error(t('timeExpired'));
          void submitFC();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [testStarted, timeRemaining, view, t, submitFC]);

  // Manage global focus mode while the test is running (student view)
  useEffect(() => {
    if (view !== 'student') return;
    try {
      if (testStarted) {
        // Save previous state and enable focus mode
        prevFocusModeRef.current = localStorage.getItem('globalFocusMode');
        localStorage.setItem('globalFocusMode', 'true');
        // Mark that focus mode was auto-initiated by a quiz so UI can hide toggles immediately
        localStorage.setItem('globalFocusModeInitiated', 'true');
        globalThis.dispatchEvent(new CustomEvent('focusModeChange'));
      } else if (prevFocusModeRef.current !== null) {
        // Restore previous state
        localStorage.setItem('globalFocusMode', prevFocusModeRef.current ?? 'false');
        // Clear the auto-initiated flag
        localStorage.removeItem('globalFocusModeInitiated');
        globalThis.dispatchEvent(new CustomEvent('focusModeChange'));
        prevFocusModeRef.current = null;
      }
    } catch (error) {
      // ignore storage errors
      console.warn('Focus mode toggle failed', error);
    }

    // Cleanup: restore on unmount if test was still active
    return () => {
      try {
        if (prevFocusModeRef.current !== null) {
          localStorage.setItem('globalFocusMode', prevFocusModeRef.current ?? 'false');
          localStorage.removeItem('globalFocusModeInitiated');
          globalThis.dispatchEvent(new CustomEvent('focusModeChange'));
          prevFocusModeRef.current = null;
        }
      } catch {
        /* ignore restore errors */
      }
    };
  }, [testStarted, view]);

  // Initial data loading
  useEffect(() => {
    if (view === 'teacher') return;

    const loadData = async () => {
      setIsLoading(true);
      try {
        if (assignmentTaskUUID) {
          const res = await getAssignmentTask(assignmentTaskUUID, access_token);
          if (res.success) {
            setAssignmentTaskOutsideProvider(res.data);
            setQuestions(res.data.contents?.questions ?? []);
          }
        }

        if (view === 'student' && assignmentTaskUUID && assignment.assignment_object?.assignment_uuid) {
          const sres = await getAssignmentTaskSubmissionsMe(
            assignmentTaskUUID,
            assignment.assignment_object.assignment_uuid,
            access_token,
          );
          if (sres.success && sres.data?.task_submission) {
            const submission = {
              ...sres.data.task_submission,
              assignment_task_submission_uuid: sres.data.assignment_task_submission_uuid,
            };
            setUserSubmissions(submission);
            setInitialUserSubmissions(submission);
          }
        } else if (
          view === 'grading' &&
          assignmentTaskUUID &&
          user_id &&
          assignment.assignment_object?.assignment_uuid
        ) {
          const sres = await getAssignmentTaskSubmissionsUser(
            assignmentTaskUUID,
            user_id,
            assignment.assignment_object.assignment_uuid,
            access_token,
          );
          if (sres.success && sres.data?.task_submission) {
            const submission = {
              ...sres.data.task_submission,
              assignment_task_submission_uuid: sres.data.assignment_task_submission_uuid,
            };
            setUserSubmissions(submission);
            setInitialUserSubmissions(submission);
            setUserSubmissionObject(sres.data);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, [view, assignmentTaskUUID, access_token, assignment.assignment_object?.assignment_uuid, user_id]);

  // Set selected task UUID
  useEffect(() => {
    if (view === 'teacher' && assignmentTaskUUID) {
      assignmentTaskStateHook({
        type: 'setSelectedAssignmentTaskUUID',
        payload: assignmentTaskUUID,
      });
    }
  }, [view, assignmentTaskUUID, assignmentTaskStateHook]);

  // Render loading state
  if (isLoading) {
    return (
      <AssignmentBoxUI
        view={view}
        type="quiz"
        submitFC={submitFC}
        saveFC={saveFC}
        gradeFC={gradeFC}
      >
        <QuizSkeleton />
      </AssignmentBoxUI>
    );
  }

  // Render empty state
  if (!questions || questions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="text-muted-foreground flex items-center justify-center gap-2 py-8">
          <Info className="size-4" />
          <p className="text-sm">{t('noQuestionsFound')}</p>
        </CardContent>
      </Card>
    );
  }

  // Pre-test start screen for students
  if (view === 'student' && !testStarted) {
    const assignmentSubmission =
      submissionContext.submissions && submissionContext.submissions.length > 0
        ? submissionContext.submissions[0]
        : null;
    const isAssignmentSubmitted = assignmentSubmission?.submission_status === 'SUBMITTED';
    const isAssignmentGraded = assignmentSubmission?.submission_status === 'GRADED';
    const cannotStartDueToSubmission = isAssignmentSubmitted || isAssignmentGraded;

    const hasAttempts = !quizSettings.max_attempts || attemptNumber < quizSettings.max_attempts;
    const remainingAttempts = quizSettings.max_attempts ? quizSettings.max_attempts - attemptNumber : null;

    return (
      <AssignmentBoxUI
        view={view}
        type="quiz"
        submitFC={submitFC}
        saveFC={saveFC}
        gradeFC={gradeFC}
      >
        {cannotStartDueToSubmission ? (
          <>
            {isAssignmentGraded ? (
              <SubmissionGradedCard
                assignmentUUID={assignment.assignment_object?.assignment_uuid}
                grade={(assignmentSubmission as any)?.grade}
                t={t}
              />
            ) : (
              <SubmissionReviewCard
                assignmentUUID={assignment.assignment_object?.assignment_uuid}
                t={t}
              />
            )}
          </>
        ) : (
          <Card className="border-primary/20">
            <CardHeader className="text-center">
              <div className="bg-primary/10 mx-auto mb-4 flex size-16 items-center justify-center rounded-full">
                <PlayCircle className="text-primary size-8" />
              </div>
              <CardTitle className="text-2xl">{t('startTest.title')}</CardTitle>
              <CardDescription className="text-base">{t('startTest.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="bg-muted/50 flex items-center justify-between rounded-lg p-3">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Info className="size-4" />
                    {t('startTest.questions')}
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-md"
                  >
                    {questions.length}
                  </Badge>
                </div>

                {quizSettings.time_limit_seconds && (
                  <div className="bg-muted/50 flex items-center justify-between rounded-lg p-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Clock className="size-4" />
                      {t('startTest.timeLimit')}
                    </span>
                    <Badge variant="secondary">
                      {Math.floor(quizSettings.time_limit_seconds / 60)} {t('settings.minutes')}
                    </Badge>
                  </div>
                )}

                {quizSettings.max_attempts && (
                  <div className="bg-muted/50 flex items-center justify-between rounded-lg p-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="size-4" />
                      {t('startTest.attemptsRemaining')}
                    </span>
                    <Badge variant={hasAttempts ? 'secondary' : 'destructive'}>
                      {hasAttempts ? remainingAttempts : 0} / {quizSettings.max_attempts}
                    </Badge>
                  </div>
                )}

                {quizSettings.max_score_penalty_per_attempt && (
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-amber-900">
                      <Shield className="size-4" />
                      {t('startTest.penalty')}
                    </span>
                    <Badge
                      variant="outline"
                      className="border-amber-600 text-amber-900"
                    >
                      -{quizSettings.max_score_penalty_per_attempt}% {t('startTest.perAttempt')}
                    </Badge>
                  </div>
                )}
              </div>

              {quizSettings.prevent_copy && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <div className="flex items-start gap-2 text-sm text-yellow-900">
                    <Shield className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-medium">{t('startTest.antiCheat')}</p>
                      <p className="mt-1 text-xs text-yellow-800">{t('startTest.antiCheatDescription')}</p>
                    </div>
                  </div>
                </div>
              )}

              <Button
                onClick={startTest}
                disabled={!hasAttempts}
                className="w-full gap-2 py-6 text-base"
                size="lg"
              >
                <PlayCircle className="size-5" />
                {hasAttempts ? t('startTest.button') : t('startTest.noAttemptsLeft')}
              </Button>

              {!hasAttempts && (
                <p className="text-muted-foreground text-center text-sm">{t('startTest.contactInstructor')}</p>
              )}
            </CardContent>
          </Card>
        )}
      </AssignmentBoxUI>
    );
  }

  // Main quiz interface
  return (
    <AssignmentBoxUI
      submitFC={submitFC}
      saveFC={saveFC}
      gradeFC={gradeFC}
      view={view}
      currentPoints={userSubmissionObject?.grade}
      maxPoints={assignmentTaskOutsideProvider?.max_grade_value}
      showSavingDisclaimer={showSavingDisclaimer}
      type="quiz"
    >
      <div className={cn('space-y-6', view === 'student' && quizSettings.prevent_copy && 'select-none')}>
        {/* Timer Display */}
        {view === 'student' && testStarted && timeRemaining !== null && (
          <TimerDisplay
            timeRemaining={timeRemaining}
            violations={violations}
            trackViolations={quizSettings.track_violations === true}
            t={t}
          />
        )}

        {/* Attempt Info */}
        {view === 'student' && testStarted && quizSettings.max_attempts && (
          <div className="text-muted-foreground flex items-center justify-between text-sm">
            <span>{t('timer.attempt', { current: attemptNumber, total: quizSettings.max_attempts })}</span>
            {quizSettings.max_score_penalty_per_attempt && attemptNumber > 1 && (
              <Badge
                variant="outline"
                className="gap-1"
              >
                <AlertTriangle className="size-3" />
                {t('timer.penaltyApplied', {
                  penalty: (attemptNumber - 1) * quizSettings.max_score_penalty_per_attempt,
                })}
              </Badge>
            )}
          </div>
        )}

        {/* Quiz Settings */}
        {view === 'teacher' && (
          <QuizSettingsPanel
            settings={quizSettings}
            onSettingsChange={setQuizSettings}
            isOpen={showSettings}
            onOpenChange={setShowSettings}
            t={t}
          />
        )}

        {/* Questions */}
        {questions.map((question, qIndex) => (
          <Card
            key={question.questionUUID || qIndex}
            className="border-border/50 overflow-hidden pt-0 shadow-sm transition-shadow hover:shadow-md"
          >
            <CardContent className="space-y-4 p-4">
              {/* Question Header */}
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                  {qIndex + 1}
                </div>

                {view === 'teacher' ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={question.questionText}
                      onChange={(e) => handleQuestionChange(qIndex, e.target.value)}
                      placeholder={t('questionPlaceholder')}
                      className="flex-1 border-dashed font-medium"
                    />
                    <AlertDialog>
                      <AlertDialogTrigger
                        nativeButton
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive size-8 shrink-0"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('deleteQuestionTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>{t('deleteQuestionDescription')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => removeQuestion(qIndex)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t('delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : (
                  <p className="text-foreground flex-1 pt-1.5 font-medium">{question.questionText}</p>
                )}
              </div>

              {/* Options */}
              <div className="space-y-2 pl-11">
                {question.options.map((option, oIndex) => {
                  const isSelected = isOptionSelected(question.questionUUID, option.optionUUID);

                  return (
                    <div
                      key={option.optionUUID || oIndex}
                      className="flex gap-2"
                    >
                      <div
                        onClick={() => view === 'student' && chooseOption(qIndex, oIndex)}
                        className={cn(
                          'group flex flex-1 items-center overflow-hidden rounded-lg border bg-card transition-all',
                          view === 'student' &&
                            'cursor-pointer hover:border-primary/50 hover:shadow-sm active:scale-[0.99]',
                          view === 'student' && isSelected && 'border-emerald-400 ring-1 ring-emerald-400/20',
                        )}
                      >
                        <OptionLetterBadge index={oIndex} />

                        {view === 'teacher' ? (
                          <div className="flex flex-1 items-center gap-2 px-3 py-2">
                            <Input
                              value={option.text}
                              onChange={(e) => handleOptionChange(qIndex, oIndex, e.target.value)}
                              placeholder={t('optionPlaceholder')}
                              className="flex-1 border-dashed text-sm"
                            />
                            <CorrectAnswerToggle
                              isCorrect={option.assigned_right_answer}
                              onClick={() => toggleOption(qIndex, oIndex)}
                              t={t}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive size-7 shrink-0"
                              onClick={() => removeOption(qIndex, oIndex)}
                            >
                              <Minus className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-1 items-center justify-between gap-2 px-3 py-2.5">
                            <span className="text-foreground text-sm">{option.text}</span>

                            <div className="flex items-center gap-2">
                              {view === 'grading' && (
                                <CorrectAnswerToggle
                                  isCorrect={option.assigned_right_answer}
                                  readOnly
                                  t={t}
                                />
                              )}
                              <SelectionIndicator
                                isSelected={isSelected}
                                onClick={view === 'student' ? () => chooseOption(qIndex, oIndex) : undefined}
                                interactive={view === 'student'}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Add Option Button */}
                      {view === 'teacher' &&
                        oIndex === question.options.length - 1 &&
                        question.options.length < MAX_OPTIONS && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="size-[42px] shrink-0"
                                    onClick={() => addOption(qIndex)}
                                  >
                                    <Plus className="size-4" />
                                  </Button>
                                }
                              />
                              <TooltipContent>
                                <p>{t('addOption')}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add Question Button */}
        {view === 'teacher' && canAddQuestion && (
          <Button
            variant="outline"
            className="text-muted-foreground hover:border-primary hover:text-primary w-full gap-2 border-dashed py-6"
            onClick={addQuestion}
          >
            <PlusCircle className="size-4" />
            {t('addQuestion')}
          </Button>
        )}
      </div>

      {/* Saving indicator overlay */}
      {isSaving && (
        <div className="bg-background/50 absolute inset-0 z-10 flex items-center justify-center rounded-lg backdrop-blur-sm">
          <div className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-5 animate-spin" />
            <span>{t('saving')}</span>
          </div>
        </div>
      )}
    </AssignmentBoxUI>
  );
};

export default TaskQuizObject;
