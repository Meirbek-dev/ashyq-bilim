'use client';

import { usePlatformSession } from '@/components/Contexts/SessionContext';
import PasswordInput from '@components/ui/custom/password-input';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { updatePassword } from '@services/settings/password';
import { getAbsoluteUrl } from '@services/config/config';
import { useState, useTransition } from 'react';
import { Button } from '@components/ui/button';
import { Label } from '@components/ui/label';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import * as v from 'valibot';

const createValidationSchema = (t: (key: string, values?: any) => string) =>
  v.object({
    old_password: v.pipe(
      v.string(),
      v.minLength(
        1,
        t('Form.requiredField', {
          fieldName: t('currentPasswordLabel'),
        }),
      ),
    ),
    new_password: v.pipe(
      v.string(),
      v.minLength(
        1,
        t('Form.requiredField', {
          fieldName: t('newPasswordLabel'),
        }),
      ),
      v.minLength(8, t('Form.minChars', { count: 8 })),
    ),
  });

type PasswordFormData = v.InferOutput<ReturnType<typeof createValidationSchema>>;

const UserEditPassword = () => {
  const session = usePlatformSession();
  const access_token = session?.data?.tokens?.access_token;
  const t = useTranslations('DashPage.Notifications');
  const tPassword = useTranslations('DashPage.UserAccountSettings.UserAccount.EditPassword');
  const validationSchema = createValidationSchema(t);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormData>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      old_password: '',
      new_password: '',
    },
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSubmit = async (values: PasswordFormData) => {
    const loadingToast = toast.loading(t('updating'));
    startTransition(() => setIsProcessing(true));
    try {
      const user_id = session?.data?.user?.id;
      if (!(user_id && access_token)) {
        toast.error(t('passwordUpdateError'), { id: loadingToast });
        return;
      }

      const response = await updatePassword(user_id, values, access_token);

      if (response.success) {
        toast.dismiss(loadingToast);

        // Show success message and notify about logout
        toast.success(t('passwordUpdateSuccess'), {
          duration: 4000,
        });
        toast(t('promptLogoutOnPasswordChange'), {
          duration: 4000,
          icon: '🔑',
        });

        // Wait for 4 seconds before signing out
        await new Promise((resolve) => setTimeout(resolve, 4000));
        signOut({ redirect: true, callbackUrl: getAbsoluteUrl('/') });
      } else {
        toast.error(t('passwordUpdateError'), {
          id: loadingToast,
        });
      }
    } catch (error: any) {
      toast.error(t('passwordUpdateError'), { id: loadingToast });
      console.error('Password update error:', error);
    } finally {
      startTransition(() => setIsProcessing(false));
    }
  };

  return (
    <div className="soft-shadow mx-0 rounded-xl bg-white sm:mx-10">
      <div className="flex flex-col">
        <div className="mx-3 my-3 flex flex-col -space-y-1 rounded-md bg-muted px-5 py-3">
          <h1 className="text-xl font-bold text-foreground">{tPassword('title')}</h1>
          <h2 className="text-base text-muted-foreground">{tPassword('description')}</h2>
        </div>

        <div className="px-8 py-6">
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mx-auto w-full max-w-2xl space-y-6"
          >
            <div>
              <Label htmlFor="old_password">{tPassword('currentPasswordLabel')}</Label>
              <PasswordInput
                id="old_password"
                {...register('old_password')}
                className="mt-1"
              />
              {errors.old_password ? <p className="mt-1 text-sm text-red-500">{errors.old_password.message}</p> : null}
            </div>

            <div>
              <Label htmlFor="new_password">{tPassword('newPasswordLabel')}</Label>
              <PasswordInput
                id="new_password"
                {...register('new_password')}
                className="mt-1"
              />
              {errors.new_password ? <p className="mt-1 text-sm text-red-500">{errors.new_password.message}</p> : null}
            </div>

            <div className="flex items-center space-x-2 rounded-md bg-amber-50 p-3 text-amber-600">
              <AlertTriangle size={16} />
              <span className="text-sm">{tPassword('logoutWarning')}</span>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={isSubmitting || isProcessing || isPending}
              >
                {isSubmitting ? tPassword('updatingButton') : tPassword('updateButton')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserEditPassword;
