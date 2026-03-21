'use client';

import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field';
import PasswordInput from '@components/ui/custom/password-input';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { SiGoogle } from '@icons-pack/react-simple-icons';
import { getAbsoluteUrl } from '@services/config/config';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Separator } from '@components/ui/separator';
import { useState, useTransition } from 'react';
import { Button } from '@components/ui/button';
import AuthLogo from '@components/auth/logo';
import AuthCard from '@components/auth/card';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { useForm } from 'react-hook-form';
import { signIn } from 'next-auth/react';
import * as v from 'valibot';

const createValidationSchema = (t: (key: string, values?: any) => string) =>
  v.object({
    email: v.pipe(v.string(), v.minLength(1, t('required')), v.email(t('invalidEmail'))),
    password: v.pipe(v.string(), v.minLength(1, t('required')), v.minLength(8, t('passwordMinLength', { length: 8 }))),
  });

type LoginFormData = v.InferOutput<ReturnType<typeof createValidationSchema>>;

const LoginClient = () => {
  const validationT = useTranslations('Validation');
  const t = useTranslations('Auth.Login');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const validationSchema = createValidationSchema(validationT);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: valibotResolver(validationSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (values: LoginFormData) => {
    startTransition(async () => {
      try {
        const res = await signIn('credentials', {
          redirect: false,
          email: values.email,
          password: values.password,
        });

        if (res?.error) {
          setError(t('wrongCredentials'));
          return;
        }

        if (res?.ok) {
          globalThis.location.href = '/redirect_from_auth';
        }
      } catch {
        setError(t('wrongCredentials'));
      }
    });
  };

  const handleGoogleSignIn = () => {
    startTransition(() => {
      signIn('google', {
        callbackUrl: '/redirect_from_auth',
      });
    });
  };

  return (
    <AuthCard>
      <Link
        prefetch={false}
        href={getAbsoluteUrl('/')}
      >
        <AuthLogo />
      </Link>

      <Button
        className="mt-8 w-full gap-3"
        onClick={handleGoogleSignIn}
        disabled={isPending}
      >
        <SiGoogle />
        {t('signInWithGoogle')}
      </Button>

      <div className="my-7 flex w-full items-center justify-center overflow-hidden">
        <Separator />
        <span className="px-2 text-sm">{t('or')}</span>
        <Separator />
      </div>

      {error ? (
        <div className="mb-4 flex w-full items-center gap-2 rounded-md bg-red-200 p-3 text-red-950">
          <AlertTriangle size={18} />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      ) : null}

      <form
        className="w-full space-y-4"
        onSubmit={handleSubmit(onSubmit)}
      >
        <Field>
          <FieldLabel>{t('email')}</FieldLabel>
          <FieldContent>
            <Input
              type="email"
              placeholder={t('emailPlaceholder')}
              autoComplete="email"
              className="w-full"
              {...register('email')}
            />
          </FieldContent>
          <FieldError>{errors.email?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>{t('password')}</FieldLabel>
          <FieldContent>
            <PasswordInput
              placeholder={t('passwordPlaceholder')}
              autoComplete="current-password"
              className="w-full"
              {...register('password')}
            />
          </FieldContent>
          <FieldError>{errors.password?.message}</FieldError>
        </Field>

        <div className="flex justify-end">
          <Link
            prefetch={false}
            href={getAbsoluteUrl('/forgot')}
            className="text-muted-foreground text-xs underline"
          >
            {t('forgotPassword')}
          </Link>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
              {t('loading')}
            </>
          ) : (
            t('login')
          )}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm">
        {t('noAccount')}
        <Link
          prefetch={false}
          href={getAbsoluteUrl('/signup')}
          className="text-muted-foreground ml-1 underline"
        >
          {t('signup')}
        </Link>
      </p>
    </AuthCard>
  );
};

export default LoginClient;
