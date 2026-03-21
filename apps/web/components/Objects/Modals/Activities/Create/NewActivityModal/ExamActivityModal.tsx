'use client';

import { valibotResolver } from '@hookform/resolvers/valibot';
import { swrFetcher } from '@services/utils/ts/requests';
import type { SubmitHandler } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
import { toast } from 'sonner';
import * as v from 'valibot';
import useSWR from 'swr';

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@components/ui/form';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getAPIUrl } from '@/services/config/config';
import { Textarea } from '@components/ui/textarea';
import { Switch } from '@components/ui/switch';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';

const createValidationSchema = (t: (key: string) => string, limits?: any) =>
  v.object({
    exam_title: v.pipe(v.string(), v.minLength(1, t('examTitleRequired'))),
    activity_name: v.pipe(v.string(), v.minLength(1, t('activityNameRequired'))),
    exam_description: v.pipe(v.string(), v.minLength(1, t('examDescriptionRequired'))),
    time_limit: v.optional(
      v.pipe(v.number(), v.minValue(limits?.time_limit?.min ?? 1), v.maxValue(limits?.time_limit?.max ?? 180)),
    ),
    has_time_limit: v.boolean(),
    shuffle_questions: v.boolean(),
    allow_result_review: v.boolean(),
  });

interface FormValues {
  exam_title: string;
  activity_name: string;
  exam_description: string;
  time_limit?: number;
  has_time_limit: boolean;
  shuffle_questions: boolean;
  allow_result_review: boolean;
}

const NewExam = ({ submitActivity, chapterId, course, closeModal }: any) => {
  const validationT = useTranslations('Validation');
  const t = useTranslations('Components.NewExamModal');
  const session = usePlatformSession();

  const { data: limits } = useSWR(`${getAPIUrl()}exams/config`, swrFetcher);
  const validationSchema = createValidationSchema(validationT, limits);
  type ZFormValues = v.InferOutput<typeof validationSchema>;
  const withUnpublishedActivities = course ? course.withUnpublishedActivities : false;

  const form = useForm<ZFormValues, any, ZFormValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      exam_title: '',
      activity_name: '',
      exam_description: '',
      has_time_limit: true,
      time_limit: Math.min(Math.max(50, limits?.time_limit?.min ?? 1), limits?.time_limit?.max ?? 180),
      shuffle_questions: true,
      allow_result_review: true,
    },
  });

  const [isPending, startTransition] = useTransition();

  const onSubmit: SubmitHandler<ZFormValues> = (values) => {
    const toastLoading = toast.loading(t('creatingExam'));
    startTransition(() => {
      void (async () => {
        try {
          const settings = {
            time_limit: values.has_time_limit ? values.time_limit : null,
            attempt_limit: 1,
            shuffle_questions: values.shuffle_questions,
            shuffle_answers: true,
            question_limit: null,
            access_mode: 'NO_ACCESS',
            whitelist_user_ids: [],
            allow_result_review: values.allow_result_review,
            show_correct_answers: values.allow_result_review,
            copy_paste_protection: true,
            tab_switch_detection: true,
            devtools_detection: true,
            right_click_disable: true,
            fullscreen_enforcement: true,
            violation_threshold: 3,
          };

          const response = await fetch(`${getAPIUrl()}exams/with-activity`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.data?.tokens?.access_token}`,
            },
            body: JSON.stringify({
              activity_name: values.activity_name,
              chapter_id: chapterId,
              exam_title: values.exam_title,
              exam_description: values.exam_description,
              settings,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to create exam');
          }

          const data = await response.json();

          toast.dismiss(toastLoading);
          toast.success(t('examCreatedSuccessfully'));

          // Reload course data
          if (submitActivity) {
            submitActivity();
          }

          // Navigate to the new activity
          if (data.activity_uuid) {
            const activity_uuid_clean = data.activity_uuid.replace('activity_', '');

            // Prefer the provided course prop, but fall back to parsing the current pathname
            let courseUuidClean: string | null = null;
            if (course?.course_uuid) {
              courseUuidClean = course.course_uuid.replace('course_', '');
            } else {
              const parts = globalThis.location.pathname.split('/').filter(Boolean);
              const courseIndex = parts.indexOf('course');
              if (courseIndex !== -1 && parts.length > courseIndex + 1) {
                courseUuidClean = String(parts[courseIndex + 1]);
              }
            }

            if (courseUuidClean) {
              // Use canonical path without platform prefix
              globalThis.location.href = `/course/${courseUuidClean}/activity/${activity_uuid_clean}${withUnpublishedActivities ? '?withUnpublishedActivities=true' : ''}`;
            } else {
              // Last-resort fallback: navigate to global courses listing
              globalThis.location.href = `/courses`;
            }
          }

          closeModal();
        } catch (error: any) {
          toast.dismiss(toastLoading);
          toast.error(t('errorCreatingExam'));
          console.error('Error creating exam:', error);
        }
      })();
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="activity_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('activityName')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('activityNamePlaceholder')}
                  {...field}
                />
              </FormControl>
              <FormDescription>{t('activityNameDescription')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="exam_title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('examTitle')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('examTitlePlaceholder')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="exam_description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('examDescription')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t('examDescriptionPlaceholder')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="has_time_limit"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>{t('enableTimeLimit')}</FormLabel>
                <FormDescription>{t('timeLimitDescription')}</FormDescription>
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

        {form.watch('has_time_limit') && (
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
                    placeholder="60"
                    {...field}
                    onChange={(e) => {
                      field.onChange(
                        Number.parseInt(e.target.value) ||
                          Math.min(Math.max(50, limits?.time_limit?.min ?? 1), limits?.time_limit?.max ?? 180),
                      );
                    }}
                  />
                </FormControl>
                <FormDescription>{t('timeLimitMinutesDescription')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="shuffle_questions"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
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

        <FormField
          control={form.control}
          name="allow_result_review"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
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

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={closeModal}
            disabled={isPending}
          >
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            disabled={isPending}
          >
            {isPending ? t('creating') : t('createExam')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default NewExam;
