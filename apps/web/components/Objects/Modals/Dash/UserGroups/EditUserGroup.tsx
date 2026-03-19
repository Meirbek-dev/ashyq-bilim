'use client';

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@components/ui/form';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { updateUserGroup } from '@services/usergroups/usergroups';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { getAPIUrl } from '@services/config/config';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
import { toast } from 'sonner';
import * as v from 'valibot';
import { mutate } from 'swr';

interface EditUserGroupProps {
  usergroup: {
    id: number;
    name: string;
    description: string;
  };
}

const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    name: v.pipe(v.string(), v.minLength(1, t('nameRequiredError'))),
    description: v.optional(v.string()),
  });

type UserGroupFormValues = v.InferOutput<ReturnType<typeof createValidationSchema>>;

const EditUserGroup = (props: EditUserGroupProps) => {
  const t = useTranslations('Components.EditUserGroup');
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const validationSchema = createValidationSchema(t);

  const form = useForm<UserGroupFormValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      name: props.usergroup.name,
      description: props.usergroup.description,
    },
  });

  const [isPending, startTransition] = useTransition();

  const handleSubmit = (values: UserGroupFormValues) => {
    startTransition(() => {
      void (async () => {
        const res = await updateUserGroup(props.usergroup.id, access_token, values);

        if (res.status === 200) {
          toast.success(t('toastSuccess'));
          mutate(`${getAPIUrl()}usergroups`);
        } else {
          toast.error(t('toastError'));
        }
      })();
    });
  };

  return (
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
              <FormLabel>{t('nameLabel')}</FormLabel>
              <FormControl>
                <Input
                  type="text"
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
              <FormLabel>{t('descriptionLabel')}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex py-4">
          <Button
            type="submit"
            className="w-full rounded-md p-2 text-center font-bold shadow-md hover:cursor-pointer"
            disabled={isPending || form.formState.isSubmitting}
          >
            {isPending || form.formState.isSubmitting ? t('loadingButton') : t('saveButton')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default EditUserGroup;
