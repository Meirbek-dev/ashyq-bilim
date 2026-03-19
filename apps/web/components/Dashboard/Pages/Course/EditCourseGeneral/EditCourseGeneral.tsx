'use client';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@components/ui/form';
import { AlertTriangle, Image as ImageIcon, Loader2, Tag, Video } from 'lucide-react';
import { SectionHeader } from '@components/Dashboard/Courses/SectionHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { Card, CardContent, CardHeader } from '@components/ui/card';
import { updateCourseMetadata } from '@services/courses/courses';
import { useCourse } from '@components/Contexts/CourseContext';
import { TagsInput } from '@components/ui/custom/tags-input';
import { useEffect, useId, useRef, useState } from 'react';
import { useDirtySection } from '@/hooks/useDirtySection';
import { useSaveSection } from '@/hooks/useSaveSection';
import { Separator } from '@components/ui/separator';
import LearningItemsList from './LearningItemsList';
import { Textarea } from '@components/ui/textarea';
import ThumbnailUpdate from './ThumbnailUpdate';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { generateUUID } from '@/lib/utils';
import { useForm } from 'react-hook-form';

const generateId = () => generateUUID();

function initializeLearnings(learnings: any): string {
  if (!learnings) return JSON.stringify([{ id: generateId(), text: '', emoji: '📝' }]);
  try {
    const parsed = JSON.parse(learnings);
    if (Array.isArray(parsed)) return learnings;
  } catch {
    if (typeof learnings === 'string') {
      return JSON.stringify([{ id: generateId(), text: learnings, emoji: '📝' }]);
    }
  }
  return JSON.stringify([{ id: generateId(), text: '', emoji: '📝' }]);
}

function parseTags(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((tag) => String(tag).trim()).filter(Boolean);
    } catch {
      // Fallback to legacy comma-separated data
    }
    return raw
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function buildFormValues(courseStructure: any): FormValues {
  return {
    name: courseStructure?.name || '',
    description: courseStructure?.description || '',
    about: courseStructure?.about || '',
    learnings: initializeLearnings(courseStructure?.learnings || ''),
    tags: parseTags(courseStructure?.tags),
    public: courseStructure?.public ?? false,
    thumbnail_type: courseStructure?.thumbnail_type || 'image',
  };
}

interface FormValues {
  name: string;
  description: string;
  about: string;
  learnings: string;
  tags: string[];
  public: boolean;
  thumbnail_type: 'image' | 'video' | 'both';
}

const validateValues = (values: FormValues, t: any) => {
  const errors: Partial<Record<keyof FormValues, string>> = {};
  const errT = (key: string, params?: any) => t(`errors.${key}`, params);

  if (!values.name?.trim()) {
    errors.name = errT('required', { fieldName: t('name.label') });
  } else if (values.name.length > 100) {
    errors.name = errT('maxLength', { count: 100 });
  }

  if (!values.description?.trim()) {
    errors.description = errT('required', { fieldName: t('description.label') });
  } else if (values.description.length > 1000) {
    errors.description = errT('maxLength', { count: 1000 });
  }

  if (!values.learnings) {
    errors.learnings = errT('required', { fieldName: t('learnings.label') });
  } else {
    try {
      const arr = JSON.parse(values.learnings);
      if (!Array.isArray(arr)) {
        errors.learnings = errT('invalidFormat');
      } else if (arr.length === 0) {
        errors.learnings = errT('atLeastOneLearningItem');
      } else if (arr.some((i: any) => !i.text?.trim())) {
        errors.learnings = errT('allLearningItemsMustHaveText');
      }
    } catch {
      errors.learnings = errT('invalidJsonFormat');
    }
  }

  return errors;
};

function EditCourseGeneral() {
  const t = useTranslations('CourseEdit.General');
  const tCommon = useTranslations('Common');
  const [error, setError] = useState('');

  const thumbnailTypeItems = [
    {
      value: 'image',
      label: (
        <div className="flex items-center gap-2">
          <ImageIcon
            className="h-4 w-4"
            aria-hidden="true"
          />
          {t('image')}
        </div>
      ),
    },
    {
      value: 'video',
      label: (
        <div className="flex items-center gap-2">
          <Video
            className="h-4 w-4"
            aria-hidden="true"
          />
          {t('video')}
        </div>
      ),
    },
    {
      value: 'both',
      label: (
        <div className="flex items-center gap-2">
          <ImageIcon
            className="h-4 w-4"
            aria-hidden="true"
          />
          <Video
            className="h-4 w-4"
            aria-hidden="true"
          />
          {t('both')}
        </div>
      ),
    },
  ];
  const course = useCourse();
  const { isLoading, courseStructure } = course;
  const formId = useId();
  const session = usePlatformSession();
  const accessToken = session?.data?.tokens?.access_token;

  const { isDirty, isDirtyRef, markDirty, markClean } = useDirtySection('general');
  const { isSaving, save } = useSaveSection({
    errorMessage: t('errors.saveFailed'),
    successMessage: tCommon('saved'),
    onError: setError,
  });

  const form = useForm<FormValues>({
    defaultValues: buildFormValues(courseStructure),
    mode: 'onChange',
  });

  const initialRef = useRef<FormValues>(form.getValues());

  // Reset when backend data changes (skipped when user has unsaved edits)
  useEffect(() => {
    if (!isLoading && courseStructure) {
      if (isDirtyRef.current) return;
      const vals = buildFormValues(courseStructure);
      form.reset(vals);
      initialRef.current = vals;
      markClean();
      setError('');
    }
  }, [isLoading, courseStructure, form, isDirtyRef, markClean]);

  // Watch for unsaved changes
  useEffect(() => {
    const sub = form.watch((values) => {
      if (isLoading) return;
      const errors = validateValues(values as FormValues, t);
      (Object.keys(values) as (keyof FormValues)[]).forEach((k) => {
        if (errors[k]) form.setError(k, { message: errors[k] });
        else form.clearErrors(k);
      });
      const changed = JSON.stringify(values) !== JSON.stringify(initialRef.current);
      if (changed) markDirty();
      else markClean();
    });
    return () => sub.unsubscribe();
  }, [form, isLoading, markDirty, markClean, t]);

  const handleSubmit = async (values: FormValues) => {
    const errors = validateValues(values, t);
    if (Object.keys(errors).length > 0) {
      setError(t('errors.saveFailed'));
      const firstErrorField = Object.keys(errors)[0] as keyof FormValues;
      form.setFocus(firstErrorField);
      return;
    }

    if (!accessToken) {
      setError(t('errors.saveFailed'));
      return;
    }

    setError('');

    await save(
      async () =>
        updateCourseMetadata(course.courseStructure.course_uuid, values, accessToken, {
          lastKnownUpdateDate: course.courseStructure.update_date,
        }),
      {
        onSuccess: () => {
          initialRef.current = values;
          markClean();
          setError('');
        },
      },
    );
  };

  const handleDiscard = () => {
    form.reset(initialRef.current);
    markClean();
    setError('');
  };

  if (isLoading || !courseStructure) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground flex animate-pulse items-center rounded-md border bg-muted px-4 py-2 text-sm font-medium">
          <Loader2
            size={16}
            className="text-primary mr-2 animate-spin"
          />
          <span>{t('loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-6"
      role="main"
      aria-labelledby="course-edit-title"
    >
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-6"
          noValidate
        >
          {error && (
            <Card
              className="border-destructive/50 bg-destructive/5"
              role="alert"
            >
              <CardContent className="p-4">
                <div
                  id={`${formId}-error`}
                  className="text-destructive flex items-center space-x-2"
                >
                  <AlertTriangle
                    className="h-5 w-5"
                    aria-hidden="true"
                  />
                  <span className="font-medium">{error}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <SectionHeader
                title={t('title', { courseName: courseStructure.name || '' })}
                description={t('subtitle')}
                isDirty={isDirty}
                isSaving={isSaving}
                onSave={() => form.handleSubmit(handleSubmit)()}
                onDiscard={handleDiscard}
              />
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">{t('name.label')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t('name.placeholder')}
                          className="text-lg"
                          maxLength={100}
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
                      <FormLabel className="text-base font-semibold">{t('description.label')}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={t('description.placeholder')}
                          className="min-h-[100px] resize-y"
                          maxLength={1000}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="about"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">{t('about.label')}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={t('about.placeholder')}
                          className="min-h-[120px]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={form.control}
                  name="learnings"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">{t('learnings.label')}</FormLabel>
                      <FormControl>
                        <div
                          role="group"
                          aria-labelledby="learnings-label"
                        >
                          <LearningItemsList
                            value={field.value}
                            onChange={field.onChange}
                            error={form.formState.errors.learnings?.message}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2 text-base font-semibold">
                        <Tag
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        {t('tags.label')}
                      </FormLabel>
                      <FormControl>
                        <TagsInput
                          placeholder={t('tags.placeholder')}
                          value={field.value || []}
                          onValueChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('thumbnail.label')}</h2>
                <p className="text-sm text-muted-foreground">{t('thumbnail.mediaUpdatesIsolated')}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert className="border-border bg-muted/40">
                <ImageIcon className="size-4" />
                <AlertTitle>{t('thumbnail.mediaActionsTitle')}</AlertTitle>
                <AlertDescription>{t('thumbnail.mediaActionsDescription')}</AlertDescription>
              </Alert>

              <FormField
                control={form.control}
                name="thumbnail_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">{t('thumbnailType')}</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        items={thumbnailTypeItems}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {thumbnailTypeItems.map((item) => (
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
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <ThumbnailUpdate thumbnailType={form.watch('thumbnail_type')} />
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}

export default EditCourseGeneral;
