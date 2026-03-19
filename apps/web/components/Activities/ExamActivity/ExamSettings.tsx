'use client';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { swrFetcher } from '@services/utils/ts/requests';
import WhitelistManagement from './WhitelistManagement';
import { Separator } from '@/components/ui/separator';
import { getAPIUrl } from '@services/config/config';
import { useEffect, useTransition } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as v from 'valibot';
import useSWR from 'swr';

const createValidationSchema = (
  limits = {
    time_limit: { min: 1, max: 180 },
    attempt_limit: { min: 1, max: 5 },
    question_limit: { min: 1 },
    violation_threshold: { min: 1, max: 10 },
  },
) =>
  v.object({
    time_limit: v.nullable(
      v.optional(v.pipe(v.number(), v.minValue(limits.time_limit.min), v.maxValue(limits.time_limit.max))),
    ),
    attempt_limit: v.nullable(
      v.optional(v.pipe(v.number(), v.minValue(limits.attempt_limit.min), v.maxValue(limits.attempt_limit.max))),
    ),
    shuffle_questions: v.boolean(),
    // shuffle_answers is always true (enforced server-side)
    question_limit: v.nullable(v.optional(v.pipe(v.number(), v.minValue(limits.question_limit.min)))),
    access_mode: v.picklist(['NO_ACCESS', 'WHITELIST', 'ALL_ENROLLED']),
    allow_result_review: v.boolean(),
    show_correct_answers: v.boolean(),
    copy_paste_protection: v.boolean(),
    tab_switch_detection: v.boolean(),
    devtools_detection: v.boolean(),
    right_click_disable: v.boolean(),
    fullscreen_enforcement: v.boolean(),
    violation_threshold: v.nullable(
      v.optional(
        v.pipe(v.number(), v.minValue(limits.violation_threshold.min), v.maxValue(limits.violation_threshold.max)),
      ),
    ),
  });

interface ExamSettingsProps {
  exam: any;
  courseId: number;
  accessToken: string;
  onSettingsUpdated: () => void;
}

export default function ExamSettings({ exam, courseId, accessToken, onSettingsUpdated }: ExamSettingsProps) {
  const t = useTranslations('Components.ExamSettings');
  const [isPending, startTransition] = useTransition();

  const settings = exam.settings || {};

  const { data: limits, error: limitsError } = useSWR(`${getAPIUrl()}exams/config`, swrFetcher);

  // show a soft error; allow editing with default bounds
  if (limitsError) {
    console.error('Failed to load exam config limits', limitsError);
  }

  const validationSchema = createValidationSchema(limits);

  const form = useForm({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      time_limit: settings.time_limit || null,
      attempt_limit: settings.attempt_limit || null,
      shuffle_questions: settings.shuffle_questions ?? true,
      question_limit: settings.question_limit || null,
      access_mode: settings.access_mode || 'NO_ACCESS',
      allow_result_review: settings.allow_result_review ?? true,
      show_correct_answers: settings.show_correct_answers ?? true,
      copy_paste_protection: settings.copy_paste_protection ?? true,
      tab_switch_detection: settings.tab_switch_detection ?? true,
      devtools_detection: settings.devtools_detection ?? true,
      right_click_disable: settings.right_click_disable ?? true,
      fullscreen_enforcement: settings.fullscreen_enforcement ?? true,
      violation_threshold: settings.violation_threshold || null,
    },
  });

  // If limits arrive after initial render, we could reset the form to clamp values to new defaults
  useEffect(() => {
    if (!limits) return;
    // clamp currently set values to the allowed ranges
    const clamp = (v: number | null | undefined, min?: number, max?: number) => {
      if (v === null || v === undefined) return null;
      if (min !== undefined && v < min) return min;
      if (max !== undefined && v > max) return max;
      return v;
    };

    const current = form.getValues();
    const newValues = {
      ...current,
      time_limit: clamp(current.time_limit, limits?.time_limit?.min, limits?.time_limit?.max),
      attempt_limit: clamp(current.attempt_limit, limits?.attempt_limit?.min, limits?.attempt_limit?.max),
      question_limit: clamp(current.question_limit, limits?.question_limit?.min),
      violation_threshold: clamp(
        current.violation_threshold,
        limits?.violation_threshold?.min,
        limits?.violation_threshold?.max,
      ),
    };

    form.reset(newValues);
  }, [limits, form]);

  const onSubmit = (values: any) => {
    const toastLoading = toast.loading(t('savingSettings'));
    startTransition(() => {
      void (async () => {
        try {
          // Always enforce shuffle_answers=true
          const payload = { ...values, shuffle_answers: true };
          const response = await fetch(`${getAPIUrl()}exams/${exam.exam_uuid}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              settings: payload,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to update settings');
          }

          toast.success(t('settingsUpdated'), { id: toastLoading });
          onSettingsUpdated();
        } catch (error: any) {
          console.error('Error updating settings:', error);
          toast.error(error.message || t('errorUpdatingSettings'), { id: toastLoading });
        }
      })();
    });
  };

  // Reset to sane defaults (uses server-provided limits when available)
  const resetToDefaults = () => {
    const defaults = {
      time_limit: limits?.time_limit?.min ?? 60,
      attempt_limit: null,
      shuffle_questions: true,
      question_limit: null,
      access_mode: 'NO_ACCESS',
      allow_result_review: true,
      show_correct_answers: true,
      copy_paste_protection: true,
      tab_switch_detection: true,
      devtools_detection: true,
      right_click_disable: true,
      fullscreen_enforcement: true,
      violation_threshold: null,
    } as const;

    form.reset(defaults);
    toast.success(t('settingsReset'));
  };

  const hasTimeLimit = form.watch('time_limit') !== null;
  const hasAttemptLimit = form.watch('attempt_limit') !== null;
  const hasQuestionLimit = form.watch('question_limit') !== null;
  const hasViolationThreshold = form.watch('violation_threshold') !== null;
  const anyAntiCheatEnabled =
    form.watch('copy_paste_protection') ||
    form.watch('tab_switch_detection') ||
    form.watch('devtools_detection') ||
    form.watch('right_click_disable') ||
    form.watch('fullscreen_enforcement');

  const initialAccessMode = settings.access_mode || 'NO_ACCESS';

  const accessModes = [
    { value: 'NO_ACCESS', label: t('accessModeNoAccess') },
    { value: 'WHITELIST', label: t('accessModeWhitelist') },
    { value: 'ALL_ENROLLED', label: t('accessModeAllEnrolled') },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('examSettings')}</CardTitle>
        <CardDescription>{t('configureExamBehavior')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-8"
          >
            {/* Time & Attempts */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{t('timeAndAttempts')}</h3>
                <p className="text-muted-foreground text-sm">{t('timeAndAttemptsDescription')}</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>{t('enableTimeLimit')}</Label>
                    <p className="text-muted-foreground text-sm">{t('timeLimitDescription')}</p>
                  </div>
                  <Switch
                    checked={hasTimeLimit}
                    onCheckedChange={(checked) => {
                      form.setValue('time_limit', checked ? 60 : null);
                    }}
                  />
                </div>

                {hasTimeLimit && (
                  <FormField
                    control={form.control}
                    name="time_limit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('timeLimitMinutes')}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={limits?.time_limit?.min ?? 1}
                            max={limits?.time_limit?.max ?? 180}
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value ? Number.parseInt(e.target.value) : null)}
                          />
                        </FormControl>
                        <FormDescription>{t('timeLimitMinutesDescription')}</FormDescription>
                      </FormItem>
                    )}
                  />
                )}

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>{t('enableAttemptLimit')}</Label>
                    <p className="text-muted-foreground text-sm">{t('attemptLimitDescription')}</p>
                  </div>
                  <Switch
                    checked={hasAttemptLimit}
                    onCheckedChange={(checked) => {
                      form.setValue('attempt_limit', checked ? 1 : null);
                    }}
                  />
                </div>

                {hasAttemptLimit && (
                  <FormField
                    control={form.control}
                    name="attempt_limit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('attemptLimit')}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={limits?.attempt_limit?.min ?? 1}
                            max={limits?.attempt_limit?.max ?? 5}
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value ? Number.parseInt(e.target.value) : null)}
                          />
                        </FormControl>
                        <FormDescription>{t('attemptLimitInputDescription')}</FormDescription>
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            <Separator />

            {/* Question Behavior */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{t('questionBehavior')}</h3>
                <p className="text-muted-foreground text-sm">{t('questionBehaviorDescription')}</p>
              </div>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="shuffle_questions"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>{t('shuffleQuestions')}</FormLabel>
                        <FormDescription>{t('shuffleQuestionsDescription')}</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-between rounded-lg border p-4 opacity-50">
                  <div className="space-y-0.5">
                    <Label>{t('shuffleAnswers')}</Label>
                    <p className="text-muted-foreground text-sm">{t('shuffleAnswersDescription')}</p>
                  </div>
                  <Switch
                    checked
                    disabled
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>{t('enableQuestionLimit')}</Label>
                    <p className="text-muted-foreground text-sm">{t('questionLimitDescription')}</p>
                  </div>
                  <Switch
                    checked={hasQuestionLimit}
                    onCheckedChange={(checked) => {
                      form.setValue('question_limit', checked ? 10 : null);
                    }}
                  />
                </div>

                {hasQuestionLimit && (
                  <FormField
                    control={form.control}
                    name="question_limit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('questionLimit')}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={limits?.question_limit?.min ?? 1}
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value ? Number.parseInt(e.target.value) : null)}
                          />
                        </FormControl>
                        <FormDescription>{t('questionLimitInputDescription')}</FormDescription>
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            <Separator />

            {/* Access Control */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{t('accessControl')}</h3>
                <p className="text-muted-foreground text-sm">{t('accessControlDescription')}</p>
              </div>

              <FormField
                control={form.control}
                name="access_mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('accessMode')}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? 'NO_ACCESS'}
                      items={accessModes}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('selectAccessMode')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          {accessModes.map((item) => (
                            <SelectItem
                              key={item.value}
                              value={item.value}
                            >
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormDescription>{t('accessModeDescription')}</FormDescription>
                  </FormItem>
                )}
              />

              {/* Warning if switching away from whitelist - stored list will remain but be ignored */}
              {initialAccessMode === 'WHITELIST' && form.watch('access_mode') !== 'WHITELIST' && (
                <Alert>
                  <AlertTitle>{t('whitelistWillBeIgnored')}</AlertTitle>
                  <AlertDescription>{t('whitelistWillBeIgnoredDescription')}</AlertDescription>
                </Alert>
              )}

              {/* Whitelist Management - Only show when access mode is WHITELIST */}
              {form.watch('access_mode') === 'WHITELIST' && (
                <WhitelistManagement
                  examUuid={exam.exam_uuid}
                  courseId={courseId}
                  accessToken={accessToken}
                  currentWhitelist={settings.whitelist_user_ids || []}
                  onWhitelistUpdated={onSettingsUpdated}
                />
              )}
            </div>

            <Separator />

            {/* Result Visibility */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{t('resultVisibility')}</h3>
                <p className="text-muted-foreground text-sm">{t('resultVisibilityDescription')}</p>
              </div>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="allow_result_review"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>{t('allowResultReview')}</FormLabel>
                        <FormDescription>{t('allowResultReviewDescription')}</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {form.watch('allow_result_review') && (
                  <FormField
                    control={form.control}
                    name="show_correct_answers"
                    render={({ field }) => (
                      <FormItem className="ml-6 flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t('showCorrectAnswers')}</FormLabel>
                          <FormDescription>{t('showCorrectAnswersDescription')}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            <Separator />

            {/* Anti-Cheating */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{t('antiCheating')}</h3>
                <p className="text-muted-foreground text-sm">{t('antiCheatingDescription')}</p>
              </div>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="copy_paste_protection"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>{t('copyPasteProtection')}</FormLabel>
                        <FormDescription>{t('copyPasteProtectionDescription')}</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tab_switch_detection"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>{t('tabSwitchDetection')}</FormLabel>
                        <FormDescription>{t('tabSwitchDetectionDescription')}</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="devtools_detection"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>{t('devtoolsDetection')}</FormLabel>
                        <FormDescription>{t('devtoolsDetectionDescription')}</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="right_click_disable"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>{t('rightClickDisable')}</FormLabel>
                        <FormDescription>{t('rightClickDisableDescription')}</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="fullscreen_enforcement"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>{t('fullscreenEnforcement')}</FormLabel>
                        <FormDescription>{t('fullscreenEnforcementDescription')}</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {anyAntiCheatEnabled && (
                  <>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label>{t('enableViolationThreshold')}</Label>
                        <p className="text-muted-foreground text-sm">{t('violationThresholdDescription')}</p>
                      </div>
                      <Switch
                        checked={hasViolationThreshold}
                        onCheckedChange={(checked) => {
                          form.setValue('violation_threshold', checked ? 3 : null);
                        }}
                      />
                    </div>

                    {hasViolationThreshold && (
                      <FormField
                        control={form.control}
                        name="violation_threshold"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('violationThreshold')}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={limits?.violation_threshold?.min ?? 1}
                                max={limits?.violation_threshold?.max ?? 10}
                                {...field}
                                value={field.value || ''}
                                onChange={(e) =>
                                  field.onChange(e.target.value ? Number.parseInt(e.target.value) : null)
                                }
                              />
                            </FormControl>
                            <FormDescription>{t('violationThresholdInputDescription')}</FormDescription>
                          </FormItem>
                        )}
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={resetToDefaults}
              >
                {t('resetDefaults')}
              </Button>
              <Button
                type="submit"
                disabled={isPending}
              >
                {isPending ? t('saving') : t('saveSettings')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
