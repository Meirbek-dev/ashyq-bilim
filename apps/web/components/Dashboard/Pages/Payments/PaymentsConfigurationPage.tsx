'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  deletePaymentConfig,
  getPaymentConfigs,
  getStripeOnboardingLink,
  initializePaymentConfig,
  updateStripeAccountID,
} from '@services/payments/payments';
import {
  AlertTriangle,
  BarChart2,
  Coins,
  CreditCard,
  ExternalLink,
  Info,
  Loader2,
  RefreshCcw,
  Trash2,
  UnplugIcon,
} from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@components/ui/form';
import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@components/ui/alert';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { SiStripe } from '@icons-pack/react-simple-icons';
import { getAbsoluteUrl } from '@services/config/config';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import useSWR, { mutate } from 'swr';
import type { FC } from 'react';
import { toast } from 'sonner';
import * as v from 'valibot';

interface ConfirmDeleteStripeConfigProps {
  onDelete: () => Promise<void>;
  t: (key: string) => string;
}

function ConfirmDeleteStripeConfig({ onDelete, t }: ConfirmDeleteStripeConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      await onDelete();
      setIsOpen(false);
    });
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <AlertDialogTrigger
        nativeButton
        render={
          <Button className="flex items-center space-x-2 rounded-full bg-red-500 text-sm text-white transition duration-300 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50">
            <Trash2 size={16} />
            <span>{t('removeConnectionButton')}</span>
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangle className="text-destructive size-6" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('removeConnectionTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('removeConnectionConfirmation')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} />
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('removeConnectionButton')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const PaymentsConfigurationPage: FC = () => {
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const {
    data: paymentConfigs,
    error,
    isLoading,
  } = useSWR(
    () => (access_token ? ['/payments/config', access_token] : null),
    ([_url, token]) => getPaymentConfigs(token),
  );

  const stripeConfig = paymentConfigs?.find((config: any) => config.provider === 'stripe');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(false);
  const [_isPending, startTransition] = useTransition();
  const t = useTranslations('Payments.Configuration');

  const enableStripe = async () => {
    const loadingToast = toast.loading(t('enablingStripe'));
    try {
      setIsOnboarding(true);
      const newConfig = { provider: 'stripe', enabled: true };
      const _config = await initializePaymentConfig(newConfig, 'stripe', access_token);
      toast.success(t('stripeEnabledSuccess'), { id: loadingToast });
      mutate(['/payments/config', access_token]);
    } catch (error) {
      console.error('Error enabling Stripe:', error);
      toast.error(t('errors.enableStripeFailed'), { id: loadingToast });
    } finally {
      setIsOnboarding(false);
    }
  };

  const _editConfig = async () => {
    setIsModalOpen(true);
  };

  const deleteConfig = async () => {
    const loadingToast = toast.loading(t('deletingStripeConfig'));
    try {
      await deletePaymentConfig(stripeConfig.id, access_token);
      toast.success(t('stripeConfigDeletedSuccess'), { id: loadingToast });
      mutate(['/payments/config', access_token]);
    } catch (error) {
      console.error('Error deleting Stripe configuration:', error);
      toast.error(t('errors.deleteStripeConfigFailed'), {
        id: loadingToast,
      });
    }
  };

  const handleStripeOnboarding = async () => {
    const loadingToast = toast.loading(t('startingStripeOnboarding'));
    try {
      startTransition(() => setIsOnboardingLoading(true));
      const { connect_url } = await getStripeOnboardingLink(
        access_token,
        getAbsoluteUrl('/payments/stripe/connect/oauth'),
      );
      window.open(connect_url, '_blank');
      toast.dismiss(loadingToast);
    } catch (error) {
      console.error('Error getting onboarding link:', error);
      toast.error(t('errors.startStripeOnboardingFailed'), {
        id: loadingToast,
      });
    } finally {
      startTransition(() => setIsOnboardingLoading(false));
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex animate-pulse items-center rounded-md bg-muted px-4 py-2 text-sm font-medium text-muted-foreground">
          <Loader2
            size={16}
            className="mr-2 animate-spin"
          />
          <span>{t('loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return <div>{t('errorLoading')}</div>;
  }

  return (
    <div>
      <div className="soft-shadow mx-auto mr-10 ml-10 rounded-xl bg-white px-4 py-4">
        <div className="mb-3 flex flex-col -space-y-1 rounded-md bg-muted px-5 py-3">
          <h1 className="text-xl font-bold text-foreground">{t('pageTitle')}</h1>
          <h2 className="text-base text-muted-foreground">{t('pageDescription')}</h2>
        </div>

        <Alert className="mb-3 border-2 border-blue-100 bg-blue-50/50 p-6">
          <AlertTitle className="mb-2 flex items-center space-x-2 text-lg font-semibold">
            <Info className="h-5 w-5" />
            <span>{t('aboutStripe.title')}</span>
          </AlertTitle>
          <AlertDescription className="space-y-5">
            <div className="pl-2">
              <ul className="list-inside list-disc space-y-1 pl-2 text-muted-foreground">
                <li className="flex items-center space-x-2">
                  <CreditCard className="h-4 w-4" />
                  <span>{t('aboutStripe.acceptPayments')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <RefreshCcw className="h-4 w-4" />
                  <span>{t('aboutStripe.manageSubscriptions')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Coins className="h-4 w-4" />
                  <span>{t('aboutStripe.handleCurrencies')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <BarChart2 className="h-4 w-4" />
                  <span>{t('aboutStripe.accessAnalytics')}</span>
                </li>
              </ul>
            </div>
            <a
              href="https://stripe.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center pl-2 font-medium text-blue-600 transition-colors duration-200 hover:text-blue-800"
            >
              {t('aboutStripe.learnMore')}
              <ExternalLink className="ml-1.5 h-4 w-4" />
            </a>
          </AlertDescription>
        </Alert>

        <div className="subtle-shadow flex flex-col rounded-lg">
          {stripeConfig ? (
            <div className="flex items-center justify-between rounded-lg border bg-card p-6 shadow-sm">
              <div className="flex items-center space-x-3">
                <SiStripe
                  className="text-foreground"
                  size={32}
                />
                <div className="flex flex-col">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl font-semibold text-foreground">Stripe</span>
                    {stripeConfig.provider_specific_id && stripeConfig.active ? (
                      <div className="flex items-center space-x-1 rounded-full bg-emerald-500/20 px-2 py-0.5">
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="text-xs text-emerald-700 dark:text-emerald-300">{t('connectedStatus')}</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1 rounded-full bg-red-500/20 px-2 py-0.5">
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        <span className="text-xs text-red-700 dark:text-red-300">{t('notConnectedStatus')}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {stripeConfig.provider_specific_id
                      ? `${t('linkedAccountLabel')}: ${stripeConfig.provider_specific_id}`
                      : t('accountNotConfigured')}
                  </span>
                </div>
              </div>
              <div className="flex space-x-2">
                {!(stripeConfig.provider_specific_id && stripeConfig.active) && (
                  <Button
                    onClick={handleStripeOnboarding}
                    className="flex items-center space-x-2 rounded-full border-2 border-green-400 bg-green-500 px-4 py-2 text-sm text-white shadow-md transition duration-300 hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isOnboardingLoading}
                  >
                    {isOnboardingLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UnplugIcon className="h-3 w-3" />
                    )}
                    <span className="font-semibold">{t('connectButton')}</span>
                  </Button>
                )}
                <ConfirmDeleteStripeConfig
                  onDelete={deleteConfig}
                  t={t}
                />
              </div>
            </div>
          ) : (
            <Button
              onClick={enableStripe}
              className="flex items-center justify-center space-x-2 rounded-lg bg-primary p-3 px-6 text-primary-foreground shadow-sm transition duration-300 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isOnboarding}
            >
              {isOnboarding ? (
                <>
                  <Loader2
                    className="animate-spin"
                    size={24}
                  />
                  <span className="text-lg font-semibold">{t('connectingButton')}</span>
                </>
              ) : (
                <>
                  <SiStripe size={24} />
                  <span className="text-lg font-semibold">{t('enableButton')}</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      {stripeConfig ? (
        <EditStripeConfigModal
          configId={stripeConfig.id}
          accessToken={access_token}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
};

interface EditStripeConfigModalProps {
  configId: string;
  accessToken: string;
  isOpen: boolean;
  onClose: () => void;
}

const createStripeConfigSchema = (t: (key: string) => string) =>
  v.object({
    stripeAccountId: v.pipe(v.string(), v.minLength(1, t('stripeAccountIdRequired'))),
  });

type StripeConfigFormValues = v.InferOutput<ReturnType<typeof createStripeConfigSchema>>;

const EditStripeConfigModal: FC<EditStripeConfigModalProps> = ({ configId, accessToken, isOpen, onClose }) => {
  const t = useTranslations('Payments.Configuration');
  const validationSchema = createStripeConfigSchema(t);

  const form = useForm<StripeConfigFormValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      stripeAccountId: '',
    },
  });

  const fetchedConfigRef = useRef<Record<string, boolean>>({});

  const fetchConfigEvent = useEffectEvent(async (signal?: AbortSignal) => {
    try {
      const config = await getPaymentConfigs(accessToken);
      if (signal?.aborted) return;
      const stripeConfig = config.find((c: any) => c.id === configId);
      if (stripeConfig?.provider_specific_id) {
        form.setValue('stripeAccountId', stripeConfig.provider_specific_id || '');
      }
    } catch (error) {
      if (signal?.aborted) return;
      console.error('Error fetching Stripe configuration:', error);
      toast.error(t('errors.loadStripeConfigFailed'));
    }
  });

  useEffect(() => {
    const key = `${isOpen ? 'open' : 'closed'}:${configId}:${accessToken || 'no-token'}`;

    if (isOpen && !fetchedConfigRef.current[key]) {
      fetchedConfigRef.current[key] = true;
      const controller = new AbortController();
      fetchConfigEvent(controller.signal);
      return () => controller.abort();
    }

    return;
  }, [isOpen, configId, accessToken, t, form]);

  const handleSubmit = async (values: StripeConfigFormValues) => {
    const loadingToast = toast.loading(t('updatingConfig'));
    try {
      const stripe_config = {
        stripe_account_id: values.stripeAccountId,
      };
      await updateStripeAccountID(stripe_config, accessToken);
      toast.success(t('configUpdatedSuccess'), { id: loadingToast });
      mutate(['/payments/config', accessToken]);
      onClose();
    } catch (error) {
      console.error('Error updating config:', error);
      toast.error(t('errors.updateConfigFailed'), { id: loadingToast });
    }
  };

  return (
    <Modal
      isDialogOpen={isOpen}
      dialogTitle={t('editModalTitle')}
      dialogDescription={t('editModalDescription')}
      onOpenChange={onClose}
      dialogContent={
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="stripeAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stripeAccountIdLabel')}</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="acct_..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                className="rounded-lg bg-blue-500 px-4 py-2 text-white transition duration-300 hover:bg-blue-600"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? t('saving') : t('saveButton')}
              </Button>
            </div>
          </form>
        </Form>
      }
    />
  );
};

export default PaymentsConfigurationPage;
