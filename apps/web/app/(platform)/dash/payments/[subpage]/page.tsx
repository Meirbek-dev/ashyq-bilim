'use client';

import PaymentsConfigurationPage from '@components/Dashboard/Pages/Payments/PaymentsConfigurationPage';
import PaymentsCustomersPage from '@components/Dashboard/Pages/Payments/PaymentsCustomersPage';
import PaymentsProductPage from '@components/Dashboard/Pages/Payments/PaymentsProductPage';
import BreadCrumbs from '@components/Dashboard/Misc/BreadCrumbs';
import { getAbsoluteUrl } from '@services/config/config';
import { Gem, Settings, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { use } from 'react';

export interface PaymentsParams {
  subpage: string;
}

export default function PlatformPaymentsPage(props: { params: Promise<{ subpage: string }> }) {
  const params = use(props.params);
  const t = useTranslations('DashPage.Payments');
  const subpage = params.subpage || 'customers';

  const getPageTitle = () => {
    switch (subpage) {
      case 'customers': {
        return { h1: t('customers'), h2: t('customerInfo') };
      }
      case 'paid-products': {
        return { h1: t('paidProducts'), h2: t('paidProductsInfo') };
      }
      case 'configuration': {
        return { h1: t('configuration'), h2: t('configurationInfo') };
      }
      default: {
        return { h1: t('title'), h2: t('overview') };
      }
    }
  };

  const { h1, h2 } = getPageTitle();

  return (
    <div className="flex h-screen w-full flex-col bg-[#f8f8f8]">
      <div className="soft-shadow z-10 shrink-0 bg-[#fcfbfc] pr-10 pl-10 tracking-tight">
        <BreadCrumbs type="payments" />
        <div className="my-2 py-2">
          <div className="flex w-100 flex-col space-y-1">
            <div className="flex pt-3 text-4xl font-bold tracking-tighter">{h1}</div>
            <div className="flex text-base font-medium text-gray-400">{h2}</div>
          </div>
        </div>
        <div className="flex space-x-0.5 text-sm font-bold">
          <TabLink
            href={getAbsoluteUrl('/dash/payments/customers')}
            icon={<Users size={16} />}
            label={t('customers')}
            isActive={subpage === 'customers'}
          />
          <TabLink
            href={getAbsoluteUrl('/dash/payments/paid-products')}
            icon={<Gem size={16} />}
            label={t('productsSubscriptions')}
            isActive={subpage === 'paid-products'}
          />
          <TabLink
            href={getAbsoluteUrl('/dash/payments/configuration')}
            icon={<Settings size={16} />}
            label={t('configuration')}
            isActive={subpage === 'configuration'}
          />
        </div>
      </div>
      <div className="h-6 shrink-0" />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1, type: 'spring', stiffness: 80 }}
        className="flex-1 overflow-y-auto"
      >
        {subpage === 'configuration' && <PaymentsConfigurationPage />}
        {subpage === 'paid-products' && <PaymentsProductPage />}
        {subpage === 'customers' && <PaymentsCustomersPage />}
      </motion.div>
    </div>
  );
}

const TabLink = ({
  href,
  icon,
  label,
  isActive,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  isActive: boolean;
}) => (
  <Link href={href}>
    <div
      className={`border-primary w-fit py-2 text-center transition-all ease-linear ${isActive ? 'border-b-4' : 'opacity-50'} cursor-pointer`}
    >
      <div className="mx-2 flex items-center space-x-2.5">
        {icon}
        <div>{label}</div>
      </div>
    </div>
  </Link>
);
