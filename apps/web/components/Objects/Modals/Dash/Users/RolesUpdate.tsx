'use client';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@components/ui/form';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { assignRoleToUser, removeRoleFromUser } from '@/services/rbac';
import { BarLoader } from '@components/Objects/Loaders/BarLoader';
import { Alert, AlertDescription } from '@components/ui/alert';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { swrFetcher } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { useState, useTransition } from 'react';
import { Button } from '@components/ui/button';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import useSWR, { mutate } from 'swr';
import type { FC } from 'react';
import { toast } from 'sonner';
import * as v from 'valibot';

interface Props {
  user: any;
  setRolesModal: any;
  alreadyAssignedRole: string;
}
const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    role: v.pipe(v.string(), v.minLength(1, t('roleRequired'))),
  });

interface FormData {
  role: string;
}

const RolesUpdate: FC<Props> = (props) => {
  const validationT = useTranslations('Validation');
  const t = useTranslations('Components.RolesUpdate');
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const validationSchema = createValidationSchema(validationT);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<any>(null);

  const form = useForm<FormData>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      role: props.alreadyAssignedRole,
    },
  });

  // Fetch available roles for the organization and sort them by system flag + priority
  const { data: roles, error: rolesError } = useSWR(`${getAPIUrl()}roles`, (url) => swrFetcher(url, access_token));

  const sortedRoles = (roles ?? []).toSorted((a: any, b: any) => {
    // System roles first, then by descending priority, then by name
    const aSystem = a.is_system ? 0 : 1;
    const bSystem = b.is_system ? 0 : 1;
    if (aSystem !== bSystem) return aSystem - bSystem;
    const aPriority = (a.priority ?? 0) * -1;
    const bPriority = (b.priority ?? 0) * -1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (a.name || '').localeCompare(b.name || '');
  });
  const handleSubmit = async (values: FormData) => {
    setError(null);

    startTransition(async () => {
      const toastId = toast.loading(t('toastLoading'));
      try {
        const newRoleId = Number.parseInt(values.role, 10);
        const oldRoleId = Number.parseInt(props.alreadyAssignedRole, 10);
        const userId = props.user.user.id;

        // Revoke old role, then assign new one
        if (!Number.isNaN(oldRoleId)) {
          await removeRoleFromUser(access_token, userId, oldRoleId);
        }
        await assignRoleToUser(access_token, userId, newRoleId);

        await mutate(`${getAPIUrl()}orgs/users`);
        props.setRolesModal(false);
        toast.success(t('toastSuccess'), { id: toastId });
      } catch (error: any) {
        const detail = error?.message ?? 'Unknown error';
        setError(detail);
        toast.error(t('toastError'), { id: toastId });
      }
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            <strong>
              {t('errorPrefix')} {error.split(':')[0]}:{' '}
            </strong>
            {error.split(':').slice(1).join(':')}
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('rolesLabel')}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={!roles || rolesError}
                  items={
                    !roles || rolesError
                      ? undefined
                      : sortedRoles.map((role: any) => ({ value: role.id.toString(), label: role.name }))
                  }
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectRolePlaceholder')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {!roles || rolesError ? (
                      <div className="text-muted-foreground px-3 py-2">{t('loadingRoles')}</div>
                    ) : (
                      <SelectGroup>
                        {sortedRoles.map((role: any) => (
                          <SelectItem
                            key={role.id}
                            value={role.id.toString()}
                          >
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end pt-4">
            <Button
              type="submit"
              disabled={isPending || !roles || rolesError}
              className="min-w-[100px]"
            >
              {isPending ? (
                <BarLoader
                  cssOverride={{ borderRadius: 60 }}
                  width={60}
                  color="#ffffff"
                />
              ) : (
                t('updateButton')
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default RolesUpdate;
