'use client';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { createAssignmentWithActivity } from '@services/courses/assignments';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { BarLoader } from '@components/Objects/Loaders/BarLoader';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { revalidateTags } from '@services/utils/ts/requests';
import { de, enUS, es, fr, ru } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { getAPIUrl } from '@services/config/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRef, useTransition } from 'react';
import { CalendarIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import * as v from 'valibot';
import { mutate } from 'swr';

const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    name: v.pipe(v.string(), v.minLength(1, t('assignmentTitleRequired'))),
    description: v.pipe(v.string(), v.minLength(1, t('assignmentDescriptionRequired'))),
    dueDate: v.optional(v.string()),
    gradingType: v.picklist(['NUMERIC', 'PERCENTAGE']),
  });

interface FormValues {
  name: string;
  description: string;
  dueDate?: string;
  gradingType: 'NUMERIC' | 'PERCENTAGE';
}

const NewAssignment = ({ submitActivity, chapterId, course, closeModal }: any) => {
  const validationT = useTranslations('Validation');
  const t = useTranslations('Components.NewAssignmentModal');
  const fullLocale = useLocale();
  const locale = fullLocale.split('-')[0] ?? 'ru';
  const session = usePlatformSession() as any;
  const validationSchema = createValidationSchema(validationT);
  const withUnpublishedActivities = course ? course.withUnpublishedActivities : false;

  const gradingTypeItems = [
    { value: 'NUMERIC', label: t('numeric') },
    { value: 'PERCENTAGE', label: t('percentage') },
  ];

  // Get the appropriate date-fns locale
  const getDateFnsLocale = (locale: string) => {
    const localeMap: Record<string, any> = {
      en: enUS,
      es,
      fr,
      de,
      ru,
    };
    return localeMap[locale] || enUS;
  };

  const dateFnsLocale = getDateFnsLocale(locale);
  const todayRef = useRef<Date>(
    (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    })(),
  );
  const today = todayRef.current;

  const form = useForm<FormValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      name: '',
      description: '',
      dueDate: '',
      gradingType: 'NUMERIC',
    },
  });

  const [isPending, startTransition] = useTransition();

  const onSubmit = (values: FormValues) => {
    const toastLoading = toast.loading(t('creatingAssignment'));
    startTransition(() => {
      void (async () => {
        try {
          // Use combined endpoint for better performance
          const res = await createAssignmentWithActivity(
            {
              title: values.name,
              description: values.description,
              due_date: values.dueDate,
              grading_type: values.gradingType,
              course_id: course?.courseStructure.id,
              chapter_id: chapterId,
            },
            chapterId,
            values.name,
            session.data?.tokens?.access_token,
          );

          if (res.success) {
            toast.success(t('createSuccess'));

            // Only revalidate if we have valid course data
            if (course?.courseStructure?.course_uuid) {
              // Revalidate cache with proper parameters
              mutate(
                `${getAPIUrl()}courses/${course.courseStructure.course_uuid}/meta?with_unpublished_activities=${withUnpublishedActivities}`,
              );
            }

            await revalidateTags(['courses']);

            closeModal();
          } else {
            toast.error(t('createError', { error: res.data?.detail || t('unknownError') }));
          }
        } catch (error: any) {
          console.error('Assignment creation failed:', error);
          toast.error(
            t('createError', {
              error: error?.message || t('unexpectedError'),
            }),
          );
        } finally {
          toast.dismiss(toastLoading);
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('assignmentTitle')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('assignmentDescription')}</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('dueDate')}</FormLabel>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !field.value && 'text-muted-foreground',
                      )}
                    />
                  }
                >
                  {field.value ? (
                    format(new Date(field.value), 'PPP', { locale: dateFnsLocale })
                  ) : (
                    <span>{t('selectDeadline')}</span>
                  )}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0"
                  align="start"
                >
                  <Calendar
                    mode="single"
                    captionLayout="dropdown"
                    selected={field.value ? new Date(field.value) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const isoDate = `${year}-${month}-${day}`;
                        field.onChange(isoDate);
                      } else {
                        field.onChange('');
                      }
                    }}
                    disabled={{ before: today }}
                    locale={dateFnsLocale}
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="gradingType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('gradingType')}</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                items={gradingTypeItems}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={validationT('selectGradingType')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectGroup>
                    {gradingTypeItems.map((item) => (
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
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="mt-6 flex justify-end">
          <Button
            type="submit"
            className="mt-2.5"
            disabled={isPending || form.formState.isSubmitting}
          >
            {isPending || form.formState.isSubmitting ? (
              <BarLoader
                cssOverride={{ borderRadius: 60 }}
                width={60}
                color="#ffffff"
              />
            ) : (
              t('createActivity')
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default NewAssignment;
