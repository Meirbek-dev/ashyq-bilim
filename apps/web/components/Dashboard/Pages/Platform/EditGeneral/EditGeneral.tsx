'use client';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@components/ui/form';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { updatePlatform } from '@/services/settings/platform';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { revalidateTags } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { Textarea } from '@components/ui/textarea';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
import type { FC } from 'react';
import { toast } from 'sonner';
import * as v from 'valibot';
import { mutate } from 'swr';

const createValidationSchema = (t: (key: string, values?: any) => string) =>
  v.object({
    description: v.pipe(
      v.string(),
      v.minLength(1, t('Form.descriptionRequired')),
      v.maxLength(100, t('Form.descriptionMax')),
    ),
    about: v.optional(v.pipe(v.string(), v.maxLength(400, t('Form.aboutMax')))),
  });

type PlatformValues = v.InferOutput<ReturnType<typeof createValidationSchema>>;

const EditGeneral: FC = () => {
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const platform = usePlatform() as any;
  const t = useTranslations('DashPage.PlatformSettings.General');
  const validationSchema = createValidationSchema(t);

  const form = useForm<PlatformValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      description: platform?.description || '',
      about: platform?.about || '',
    },
  });
  const [isPending, startTransition] = useTransition();

  const updatePlatformSettings = async (values: PlatformValues) => {
    const loadingToast = toast.loading(t('updatingPlatform'));
    try {
      startTransition(() => {
        void updatePlatform(values, access_token)
          .then(async () => {
            await revalidateTags(['platform']);
            mutate(`${getAPIUrl()}platform`);
            toast.success(t('platformUpdatedSuccess'), { id: loadingToast });
          })
          .catch(() => {
            toast.error(t('platformUpdateFailed'), { id: loadingToast });
          });
      });
    } catch {
      toast.error(t('platformUpdateFailed'), { id: loadingToast });
    }
  };

  return (
    <div className="soft-shadow m-1 rounded-xl bg-white sm:mx-10">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(updatePlatformSettings)}>
          <div className="flex flex-col gap-0">
            <div className="mx-3 my-3 flex flex-col -space-y-1 rounded-md bg-gray-50 px-5 py-3">
              <h1 className="text-xl font-bold text-gray-800">{t('title')}</h1>
              <h2 className="text-base text-gray-500">{t('description')}</h2>
            </div>

            <div className="mx-5 my-5 mt-0 flex flex-col lg:flex-row lg:space-x-8">
              <div className="w-full space-y-6">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('Form.descriptionLabel')}
                          <span className="text-sm text-gray-500">
                            ({100 - (field.value?.length || 0)} {t('Form.charsLeft')})
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('Form.descriptionPlaceholder')}
                            maxLength={100}
                            {...field}
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
                        <FormLabel>
                          {t('Form.aboutLabel')}
                          <span className="text-sm text-gray-500">
                            ({400 - (field.value?.length || 0)} {t('Form.charsLeft')})
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={t('Form.aboutPlaceholder')}
                            className="min-h-[250px]"
                            maxLength={400}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>
            <div className="mx-5 mt-0 mb-5 flex flex-row-reverse">
              <Button
                type="submit"
                disabled={form.formState.isSubmitting || isPending}
              >
                {form.formState.isSubmitting || isPending ? t('Form.savingButton') : t('Form.saveButton')}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default EditGeneral;
