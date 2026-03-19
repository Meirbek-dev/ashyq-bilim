'use client';

import { valibotResolver } from '@hookform/resolvers/valibot';
import { Code2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import * as v from 'valibot';

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    name: v.pipe(v.string(), v.minLength(1, t('challengeNameRequired'))),
    description: v.pipe(v.string(), v.minLength(1, t('challengeDescriptionRequired'))),
    difficulty: v.picklist(['easy', 'medium', 'hard']),
    subtype: v.picklist(['general', 'competitive']),
  });

interface FormValues {
  name: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  subtype: 'general' | 'competitive';
}

interface CodeChallengeActivityModalProps {
  submitActivity: (data: any) => Promise<void>;
  chapterId: number;
  course: any;
  closeModal?: () => void;
}

export default function CodeChallengeActivityModal({
  submitActivity,
  chapterId,
  course,
  closeModal,
}: CodeChallengeActivityModalProps) {
  const t = useTranslations('Components.NewActivity.CodeChallenge');

  const validationSchema = createValidationSchema(t);
  type ValidationSchema = v.InferOutput<typeof validationSchema>;

  const form = useForm<ValidationSchema>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      name: '',
      description: '',
      difficulty: 'medium',
      subtype: 'general',
    },
  });

  const handleSubmit = async (values: FormValues) => {
    const activityData = {
      name: values.name,
      activity_type: 'TYPE_CODE_CHALLENGE',
      activity_sub_type: values.subtype === 'competitive' ? 'SUBTYPE_CODE_COMPETITIVE' : 'SUBTYPE_CODE_GENERAL',
      chapter_id: chapterId,
      course_id: course.id,
      published: false,
      content: {
        description: values.description,
        difficulty: values.difficulty,
      },
    };

    await submitActivity(activityData);
    closeModal?.();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
          <Code2 className="text-primary h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">{t('title')}</h3>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('name')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('namePlaceholder')}
                    {...field}
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
                <FormLabel>{t('description')}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t('descriptionPlaceholder')}
                    className="min-h-24"
                    {...field}
                  />
                </FormControl>
                <FormDescription>{t('descriptionHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="difficulty"
              render={({ field }) => {
                const difficultyItems = [
                  { value: 'easy', label: t('difficultyEasy') },
                  { value: 'medium', label: t('difficultyMedium') },
                  { value: 'hard', label: t('difficultyHard') },
                ];

                return (
                  <FormItem>
                    <FormLabel>{t('difficulty')}</FormLabel>
                    <Select
                      items={difficultyItems}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('selectDifficulty')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          {difficultyItems.map((item) => (
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
                );
              }}
            />

            <FormField
              control={form.control}
              name="subtype"
              render={({ field }) => {
                const subtypeItems = [
                  { value: 'general', label: t('typeGeneral') },
                  { value: 'competitive', label: t('typeCompetitive') },
                ];

                return (
                  <FormItem>
                    <FormLabel>{t('type')}</FormLabel>
                    <Select
                      items={subtypeItems}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('selectType')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          {subtypeItems.map((item) => (
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
                    <FormDescription>
                      {field.value === 'competitive' ? t('typeCompetitiveHint') : t('typeGeneralHint')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            {closeModal && (
              <Button
                type="button"
                variant="outline"
                onClick={closeModal}
              >
                {t('cancel')}
              </Button>
            )}
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('create')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
