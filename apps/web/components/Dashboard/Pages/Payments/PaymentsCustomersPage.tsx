'use client';

import UnconfiguredPaymentsDisclaimer from '@components/Pages/Payments/UnconfiguredPaymentsDisclaimer';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import { usePaymentsEnabled } from '@hooks/usePaymentsEnabled';
import { getOrgCustomers } from '@services/payments/payments';
import UserAvatar from '@components/Objects/UserAvatar';
import type { ColumnDef } from '@tanstack/react-table';
import { RefreshCcw, SquareCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import DataTable from '@components/ui/data-table';
import { Badge } from '@components/ui/badge';
import useSWR from 'swr';

interface PaymentUserData {
  payment_user_id: number;
  user: {
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_image: string;
    user_uuid: string;
  };
  product: {
    name: string;
    description: string;
    product_type: string;
    amount: number;
    currency: string;
  };
  status: string;
  creation_date: string;
}

const PaymentsUsersTable = ({ data }: { data: PaymentUserData[] }) => {
  const t = useTranslations('Payments.CustomersPage');
  const locale = useLocale();
  const columns: ColumnDef<PaymentUserData>[] = [
    {
      accessorFn: (item) => [item.user.first_name, item.user.last_name, item.user.username, item.user.email].join(' '),
      id: 'user',
      header: t('userHeader'),
      cell: ({ row }) => (
        <div className="flex items-center space-x-3">
          <UserAvatar
            size="sm"
            variant="outline"
            avatar_url={getUserAvatarMediaDirectory(row.original.user.user_uuid, row.original.user.avatar_image)}
          />
          <div className="flex flex-col">
            <span className="font-medium">{row.original.user.first_name || row.original.user.username}</span>
            <span className="text-sm text-muted-foreground">{row.original.user.email}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'product.name',
      id: 'product',
      header: t('productHeader'),
      accessorFn: (item) => `${item.product.name} ${item.product.description || ''}`,
      cell: ({ row }) => row.original.product.name,
    },
    {
      accessorFn: (item) => item.product.product_type,
      id: 'type',
      header: t('typeHeader'),
      cell: ({ row }) => (
        <div className="flex items-center space-x-2">
          {row.original.product.product_type === 'subscription' ? (
            <Badge
              variant="outline"
              className="flex items-center gap-1"
            >
              <RefreshCcw size={12} />
              <span>{t('subscriptionType')}</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="flex items-center gap-1"
            >
              <SquareCheck size={12} />
              <span>{t('oneTimeType')}</span>
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorFn: (item) => item.product.amount,
      id: 'amount',
      header: t('amountHeader'),
      cell: ({ row }) =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: row.original.product.currency,
        }).format(row.original.product.amount),
    },
    {
      accessorKey: 'status',
      header: t('statusHeader'),
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === 'active' ? 'default' : row.original.status === 'completed' ? 'default' : 'secondary'
          }
        >
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'creation_date',
      header: t('purchaseDateHeader'),
      cell: ({ row }) => new Date(row.original.creation_date).toLocaleDateString(locale),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      pageSize={10}
      storageKey="payments-customers"
      labels={{ emptyMessage: t('noCustomers') }}
    />
  );
};

const PaymentsCustomersPage = () => {
  const session = usePlatformSession();
  const access_token = session?.data?.tokens?.access_token;
  const { isEnabled, isLoading } = usePaymentsEnabled();
  const t = useTranslations('Payments.CustomersPage');

  const {
    data: customers,
    error,
    isLoading: customersLoading,
  } = useSWR(access_token ? ['/payments/customers', access_token] : null, ([_url, token]) => getOrgCustomers(token));

  if (!(isEnabled || isLoading)) {
    return <UnconfiguredPaymentsDisclaimer />;
  }

  if (isLoading || customersLoading) return <PageLoading />;
  if (error) return <div>{t('errors.loadCustomersFailed')}</div>;
  if (!customers) return <div>{t('noCustomerData')}</div>;

  return (
    <div className="soft-shadow mx-auto mr-10 ml-10 rounded-xl bg-white px-4 py-4">
      <div className="mb-3 flex flex-col -space-y-1 rounded-md bg-muted px-5 py-3">
        <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
        <h2 className="text-base text-muted-foreground">{t('description')}</h2>
      </div>

      <PaymentsUsersTable data={customers} />
    </div>
  );
};

export default PaymentsCustomersPage;
