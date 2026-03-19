'use client';

import { Field, FieldContent, FieldError, FieldLabel } from '@components/ui/field';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getAbsoluteUrl } from '@services/config/config';
import PasswordInput from '@components/ui/custom/password-input';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { useEffect, useState, useTransition } from 'react';
import { SiGoogle } from '@icons-pack/react-simple-icons';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Separator } from '@components/ui/separator';
import { passwordSchema } from '@/lib/schemas/auth';
import { Button } from '@components/ui/button';
import AuthLogo from '@components/auth/logo';
import AuthCard from '@components/auth/card';
import { Input } from '@components/ui/input';
import { signup } from '@services/auth/auth';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { useForm } from 'react-hook-form';
import { signIn } from 'next-auth/react';
import * as v from 'valibot';

const buildFormSchema = (t: (key: string) => string) =>
  v.pipe(
    v.object({
      firstName: v.pipe(v.string(), v.minLength(1, t('required'))),
      lastName: v.pipe(v.string(), v.minLength(1, t('required'))),
      email: v.pipe(v.string(), v.email(t('invalidEmail'))),
      password: passwordSchema(t),
      confirmPassword: v.string(),
    }),
    v.forward(
      v.partialCheck(
        [['password'], ['confirmPassword']],
        (data) => data.password === data.confirmPassword,
        t('passwordsDontMatch'),
      ),
      ['confirmPassword'],
    ),
  );

type SignUpFormData = v.InferOutput<ReturnType<typeof buildFormSchema>>;

const SignUpClient = () => {
  const session = usePlatformSession();
  const router = useRouter();
  const t = useTranslations('Auth.Signup');
  const validationT = useTranslations('Validation');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const formSchema = buildFormSchema(validationT);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({
    defaultValues: { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' },
    resolver: valibotResolver(formSchema),
  });

  useEffect(() => {
    if (session?.status === 'authenticated') {
      router.push(getAbsoluteUrl('/'));
    }
  }, [session?.status, router]);

  const onSubmit = (data: SignUpFormData) => {
    setError('');
    startTransition(async () => {
      try {
        const username = `${data.firstName.toLowerCase()}.${data.lastName.toLowerCase()}`;
        const res = await signup({
          username,
          email: data.email,
          password: data.password,
          first_name: data.firstName,
          last_name: data.lastName,
        });

        if (res.ok) {
          const signInRes = await signIn('credentials', {
            redirect: false,
            email: data.email,
            password: data.password,
          });
          if (signInRes?.ok) {
            globalThis.location.href = '/redirect_from_auth';
          } else {
            router.push(getAbsoluteUrl('/login'));
          }
        } else {
          const body = await res.json().catch(() => ({}));
          const detail = body?.detail;
          const msg =
            typeof detail === 'string' ? detail : detail?.message || body?.message || t('errorSomethingWentWrong');
          setError(msg);
        }
      } catch (error: any) {
        setError(error.message || t('errorSomethingWentWrong'));
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

  if (session?.status === 'authenticated') {
    return (
      <AuthCard>
        <AuthLogo />
        <p className="text-muted-foreground mt-4 text-sm">{t('redirecting')}</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard className="max-w-md">
      <Link
        prefetch={false}
        href={getAbsoluteUrl('/')}
      >
        <AuthLogo />
      </Link>
      <p className="mt-4 text-xl font-semibold tracking-tight">{t('title')}</p>

      <Button
        className="mt-8 w-full gap-3"
        onClick={handleGoogleSignIn}
        disabled={isPending}
      >
        <SiGoogle />
        {t('continueWithGoogle')}
      </Button>

      <div className="my-7 flex w-full items-center justify-center overflow-hidden">
        <Separator />
        <span className="px-2 text-sm">{t('or')}</span>
        <Separator />
      </div>

      <form
        className="w-full space-y-4"
        onSubmit={handleSubmit(onSubmit)}
      >
        {error ? (
          <div className="flex items-center gap-2 rounded-md bg-red-200 p-3 text-red-950">
            <AlertTriangle size={18} />
            <span className="text-sm font-semibold">{error}</span>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>{t('firstName')}</FieldLabel>
            <FieldContent>
              <Input
                type="text"
                placeholder={t('firstNamePlaceholder')}
                autoComplete="given-name"
                className="w-full"
                {...register('firstName')}
              />
            </FieldContent>
            <FieldError>{errors.firstName?.message}</FieldError>
          </Field>

          <Field>
            <FieldLabel>{t('lastName')}</FieldLabel>
            <FieldContent>
              <Input
                type="text"
                placeholder={t('lastNamePlaceholder')}
                autoComplete="family-name"
                className="w-full"
                {...register('lastName')}
              />
            </FieldContent>
            <FieldError>{errors.lastName?.message}</FieldError>
          </Field>
        </div>

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
              autoComplete="new-password"
              className="w-full"
              {...register('password')}
            />
          </FieldContent>
          <FieldError>{errors.password?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>{t('confirmPassword')}</FieldLabel>
          <FieldContent>
            <PasswordInput
              placeholder={t('confirmPasswordPlaceholder')}
              autoComplete="new-password"
              className="w-full"
              {...register('confirmPassword')}
            />
          </FieldContent>
          <FieldError>{errors.confirmPassword?.message}</FieldError>
        </Field>

        <Button
          type="submit"
          className="mt-2 w-full"
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
            t('createAccount')
          )}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm">
        {t('alreadyHaveAccount')}
        <Link
          prefetch={false}
          href={getAbsoluteUrl('/login')}
          className="text-muted-foreground ml-1 underline"
        >
          {t('signIn')}
        </Link>
      </p>
    </AuthCard>
  );
};

export default SignUpClient;
