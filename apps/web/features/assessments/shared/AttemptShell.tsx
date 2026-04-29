'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Focus,
  LoaderCircle,
  Maximize2,
  RotateCcw,
  Save,
  SendHorizonal,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DEFAULT_POLICY_VIEW, isAntiCheatEnabled, type PolicyView } from '@/features/assessments/domain/policy';
import type { SubmissionStatus } from '@/features/assessments/domain/submission-status';
import type { AttemptViewModel } from '@/features/assessments/domain/view-models';
import { useAssessmentAttempt } from '@/features/assessments/hooks/useAssessment';
import { loadKindModule, type KindModule } from '@/features/assessments/registry';
import { useAttemptGuard, type AttemptTimerConfig } from './hooks/useAttemptGuard';

export type AttemptSaveState = 'saved' | 'unsaved' | 'saving' | 'submitted' | 'returned' | 'error';

export interface AttemptNavigationState {
  current: number;
  total: number;
  answered?: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export interface AttemptRecoveryState {
  open: boolean;
  lastSavedAt?: number | string | null;
  onAccept: () => void;
  onReject: () => void;
}

export interface AttemptShellRegistration {
  saveState?: AttemptSaveState;
  status?: SubmissionStatus | null;
  canSave?: boolean;
  canSubmit?: boolean;
  isSaving?: boolean;
  isSubmitting?: boolean;
  onSave?: () => void;
  onSubmit?: () => void;
  navigation?: AttemptNavigationState | null;
  timer?: AttemptTimerConfig | null;
  policy?: PolicyView | null;
  initialViolationCount?: number;
  onViolation?: (type: string, count: number) => void | Promise<void>;
  onGuardAutoSubmit?: (type: string, count: number) => void;
  recovery?: AttemptRecoveryState | null;
}

interface AttemptShellContextValue {
  registerControls: (controls: AttemptShellRegistration) => () => void;
}

const AttemptShellContext = createContext<AttemptShellContextValue | null>(null);

const DEFAULT_CONTROLS: Required<
  Pick<AttemptShellRegistration, 'saveState' | 'status' | 'canSave' | 'canSubmit' | 'isSaving' | 'isSubmitting'>
> = {
  saveState: 'saved',
  status: null,
  canSave: false,
  canSubmit: false,
  isSaving: false,
  isSubmitting: false,
};

export function useAttemptShellControls(controls: AttemptShellRegistration) {
  const context = useContext(AttemptShellContext);

  useEffect(() => {
    if (!context) return;
    return context.registerControls(controls);
  }, [context, controls]);
}

interface AttemptShellProps {
  activityUuid: string;
  courseUuid: string;
  vm?: AttemptViewModel;
}

export default function AttemptShell({ activityUuid, courseUuid, vm: suppliedVm }: AttemptShellProps) {
  const assessment = useAssessmentAttempt(suppliedVm ? null : activityUuid);
  const resolved = suppliedVm
    ? ({ surface: 'ATTEMPT', vm: suppliedVm, kind: suppliedVm.kind } as const)
    : assessment.vm?.surface === 'ATTEMPT'
      ? assessment.vm
      : null;
  const vm = resolved?.vm ?? null;
  const [kindModule, setKindModule] = useState<KindModule | null>(null);
  const [controls, setControls] = useState<AttemptShellRegistration>(DEFAULT_CONTROLS);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    if (!vm?.kind) return;
    let cancelled = false;
    void loadKindModule(vm.kind).then((module) => {
      if (!cancelled) setKindModule(module);
    });
    return () => {
      cancelled = true;
    };
  }, [vm?.kind]);

  useEffect(() => {
    const stored = globalThis.localStorage?.getItem('activity-focus-mode');
    setFocusMode(stored === 'true');
  }, []);

  const toggleFocusMode = () => {
    setFocusMode((current) => {
      const next = !current;
      globalThis.localStorage?.setItem('activity-focus-mode', String(next));
      globalThis.dispatchEvent?.(new CustomEvent('focusModeChange', { detail: { enabled: next } }));
      return next;
    });
  };

  const registerControls = useCallback((nextControls: AttemptShellRegistration) => {
    setControls((current) => ({ ...current, ...nextControls }));
    return () => {
      setControls(DEFAULT_CONTROLS);
    };
  }, []);

  const contextValue = useMemo(() => ({ registerControls }), [registerControls]);
  const policy = controls.policy ?? vm?.policy ?? null;
  const antiCheatEnabled = Boolean(policy && isAntiCheatEnabled(policy.antiCheat));
  const guard = useAttemptGuard(
    policy ?? DEFAULT_POLICY_VIEW,
    {
      enabled: antiCheatEnabled,
      timer: controls.timer,
      initialViolationCount: controls.initialViolationCount,
      onViolation: controls.onViolation,
      onThresholdReached: controls.onGuardAutoSubmit,
    },
  );

  const AttemptContent = kindModule
    ? (kindModule.Attempt as ComponentType<{
        activityUuid: string;
        courseUuid: string;
        vm?: AttemptViewModel;
      }>)
    : null;

  if (assessment.isLoading || !vm || !AttemptContent) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <LoaderCircle className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  const returned = vm.isReturnedForRevision || controls.status === 'RETURNED';

  return (
    <AttemptShellContext.Provider value={contextValue}>
      {guard.fullscreenGateOpen ? (
        <div className="bg-background/95 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-lg border p-6 shadow-lg">
            <div className="flex items-center gap-3 text-lg font-semibold">
              <Maximize2 className="size-5" />
              Fullscreen required
            </div>
            <p className="text-muted-foreground mt-2 text-sm">
              This attempt requires fullscreen mode. Enter fullscreen to continue.
            </p>
            {guard.fullscreenError ? <p className="text-muted-foreground mt-3 text-sm">{guard.fullscreenError}</p> : null}
            <Button
              type="button"
              className="mt-5 w-full"
              onClick={guard.requestFullscreen}
            >
              <Maximize2 className="size-4" />
              Enter fullscreen
            </Button>
          </div>
        </div>
      ) : null}

      <div className={cn('min-h-screen bg-background pb-28', focusMode && 'fixed inset-0 z-40 overflow-auto')}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5">
          <header className="rounded-lg border bg-card p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="text-muted-foreground text-xs font-medium uppercase">{kindModule?.label ?? 'Assessment'}</div>
                <h1 className="mt-1 text-2xl font-semibold">{vm.title}</h1>
                {vm.description ? <p className="text-muted-foreground mt-2 max-w-3xl text-sm">{vm.description}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SaveStateBadge
                  state={returned ? 'returned' : (controls.saveState ?? 'saved')}
                  status={controls.status ?? vm.submissionStatus}
                />
                <TimerBadge remainingSeconds={guard.remainingSeconds} />
                {vm.dueAt ? (
                  <Badge variant="outline">
                    <Clock className="size-3" />
                    Due {formatDate(vm.dueAt)}
                  </Badge>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleFocusMode}
                >
                  <Focus className="size-4" />
                  {focusMode ? 'Exit focus' : 'Focus'}
                </Button>
              </div>
            </div>
          </header>

          {returned ? (
            <Alert>
              <RotateCcw className="size-4" />
              <AlertTitle>Returned for revision</AlertTitle>
              <AlertDescription>Review the feedback, update your work, and submit again.</AlertDescription>
            </Alert>
          ) : null}

          {antiCheatEnabled ? (
            <Alert variant={guard.violationCount > 0 ? 'destructive' : 'default'}>
              <AlertTriangle className="size-4" />
              <AlertTitle>Attempt integrity checks are active</AlertTitle>
              <AlertDescription>
                {describeAntiCheat(policy)}
                {guard.violationCount > 0 ? ` Violations recorded: ${guard.violationCount}.` : ''}
              </AlertDescription>
            </Alert>
          ) : null}

          <main className="min-h-[420px]">
            <AttemptContent
              activityUuid={vm.activityUuid}
              courseUuid={courseUuid}
              vm={vm}
            />
          </main>
        </div>

        <AttemptFooter
          controls={controls}
          returned={returned}
        />
      </div>

      <RecoveryDialog recovery={controls.recovery ?? null} />
    </AttemptShellContext.Provider>
  );
}

function AttemptFooter({ controls, returned }: { controls: AttemptShellRegistration; returned: boolean }) {
  const navigation = controls.navigation;

  return (
    <div className="bg-background/95 fixed right-0 bottom-0 left-0 z-40 border-t backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <SaveStateBadge
            state={returned ? 'returned' : (controls.saveState ?? 'saved')}
            status={controls.status ?? null}
          />
          {navigation ? (
            <span className="text-muted-foreground text-sm">
              {navigation.answered !== undefined ? `${navigation.answered} answered · ` : ''}
              {navigation.current} / {navigation.total}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {navigation ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={!navigation.canPrevious}
                onClick={navigation.onPrevious}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!navigation.canNext}
                onClick={navigation.onNext}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </>
          ) : null}
          {controls.onSave ? (
            <Button
              type="button"
              variant="outline"
              disabled={!controls.canSave || controls.isSaving || controls.isSubmitting}
              onClick={controls.onSave}
            >
              {controls.isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save draft
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={!controls.canSubmit || controls.isSaving || controls.isSubmitting || !controls.onSubmit}
            onClick={controls.onSubmit}
          >
            {controls.isSubmitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <SendHorizonal className="size-4" />
            )}
            {returned ? 'Re-submit' : 'Submit'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SaveStateBadge({ state, status }: { state: AttemptSaveState; status: SubmissionStatus | null }) {
  if (state === 'saving')
    return (
      <Badge variant="secondary">
        <LoaderCircle className="size-3 animate-spin" />
        Saving
      </Badge>
    );
  if (state === 'unsaved') return <Badge variant="warning">Unsaved</Badge>;
  if (state === 'error') return <Badge variant="destructive">Save failed</Badge>;
  if (state === 'returned')
    return (
      <Badge variant="warning">
        <RotateCcw className="size-3" />
        Returned
      </Badge>
    );
  if (state === 'submitted' || status === 'PENDING')
    return (
      <Badge variant="secondary">
        <CheckCircle2 className="size-3" />
        Submitted
      </Badge>
    );
  if (status === 'GRADED') return <Badge variant="secondary">Awaiting release</Badge>;
  if (status === 'PUBLISHED') return <Badge variant="success">Published</Badge>;
  return (
    <Badge variant="success">
      <CheckCircle2 className="size-3" />
      Saved
    </Badge>
  );
}

function TimerBadge({ remainingSeconds }: { remainingSeconds: number | null }) {
  if (remainingSeconds === null) return null;
  const urgent = remainingSeconds <= 60;
  const warning = remainingSeconds <= 300;
  return (
    <Badge
      variant={urgent ? 'destructive' : 'outline'}
      className={cn(warning && !urgent && 'border-orange-300 text-orange-700')}
    >
      <Clock className="size-3" />
      {formatDuration(remainingSeconds)}
    </Badge>
  );
}

function RecoveryDialog({ recovery }: { recovery: AttemptRecoveryState | null }) {
  return (
    <AlertDialog open={Boolean(recovery?.open)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangle className="size-6 text-orange-500" />
          </AlertDialogMedia>
          <AlertDialogTitle>Recover previous answers?</AlertDialogTitle>
          <AlertDialogDescription>
            {recovery?.lastSavedAt
              ? `A local draft from ${formatDate(recovery.lastSavedAt)} is available.`
              : 'A local draft is available for this attempt.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={recovery?.onReject}>Start fresh</AlertDialogCancel>
          <AlertDialogAction onClick={recovery?.onAccept}>Recover answers</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function describeAntiCheat(policy: PolicyView | null) {
  if (!policy) return 'Copy, navigation, and fullscreen protections may be enforced.';
  const enabled = [
    policy.antiCheat.copyPasteProtection ? 'copy and paste blocking' : null,
    policy.antiCheat.tabSwitchDetection ? 'tab switch detection' : null,
    policy.antiCheat.devtoolsDetection ? 'developer tools detection' : null,
    policy.antiCheat.rightClickDisabled ? 'right-click blocking' : null,
    policy.antiCheat.fullscreenEnforced ? 'fullscreen enforcement' : null,
  ].filter(Boolean);
  return enabled.length ? `Active checks: ${enabled.join(', ')}.` : 'Attempt checks are active.';
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
