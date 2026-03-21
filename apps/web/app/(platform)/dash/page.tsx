import touEmblemLight from '@/app/_shared/dash/images/tou_emblem_light.webp';
import { BookCopy, School, Settings, Users } from 'lucide-react';
import ServerLink from '@/components/ui/ServerLink';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import Image from 'next/image';

import platformLogoFull from '../../../public/platform_logo_full.svg';

export default async function PlatformDashHomePage() {
  const t = await getTranslations('DashPage.Card');

  return (
    <div className="mx-auto mb-16 flex min-h-screen flex-col items-center justify-center p-4 sm:mb-0">
      <div className="mx-auto pb-6 sm:pb-10">
        <Image
          alt={t('platformLogo')}
          width={210}
          src={platformLogoFull}
          className="w-48 pt-16 pb-24 sm:w-auto"
          style={{ height: 'auto' }}
          loading="eager"
        />
      </div>
      <div className="flex flex-col gap-4 sm:flex-row lg:gap-10">
        <DashboardCard
          href="/dash/courses"
          icon={
            <BookCopy
              className="mx-auto text-gray-500/100"
              size={50}
            />
          }
          title={t('Courses.title')}
          description={t('Courses.description')}
        />
        <DashboardCard
          href="/dash/platform/settings/general"
          icon={
            <School
              className="mx-auto text-gray-500/100"
              size={50}
            />
          }
          title={t('Platform.title')}
          description={t('Platform.description')}
        />
        <DashboardCard
          href="/dash/users/settings/users"
          icon={
            <Users
              className="mx-auto text-gray-500/100"
              size={50}
            />
          }
          title={t('Users.title')}
          description={t('Users.description')}
        />
      </div>
      <div className="mt-6 flex flex-col gap-6 sm:mt-10 sm:gap-10">
        <div className="mx-auto h-1 w-[100px] rounded-full bg-neutral-200/100" />
        <div className="flex items-center justify-center">
          <ServerLink
            href="https://tou.edu.kz/ru/"
            target="_blank"
            className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg bg-sky-900 px-7 py-3 shadow-lg transition-all ease-linear hover:scale-105 sm:mt-[40px]"
          >
            <Image
              width={26}
              src={touEmblemLight}
              alt={t('touUniversity')}
            />
            <div className="text-sm font-bold text-gray-100/100">{t('touUniversity')}</div>
          </ServerLink>
        </div>
        <div className="mx-auto mt-4 h-1 w-28 rounded-full bg-neutral-200/100 sm:mt-[40px]" />

        <ServerLink
          href="/dash/user-account/settings/general"
          className="bg-background mx-auto flex max-w-md cursor-pointer items-center rounded-lg p-4 shadow-lg transition-all ease-linear hover:scale-105"
        >
          <div className="mx-auto flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 sm:text-left">
            <Settings
              className="text-gray-500/100"
              size={20}
            />
            <div>
              <div className="font-bold text-gray-500/100">{t('AccountSettings.title')}</div>
              <p className="text-sm text-gray-400/100">{t('AccountSettings.description')}</p>
            </div>
          </div>
        </ServerLink>
      </div>
    </div>
  );
}

const DashboardCard = ({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) => {
  return (
    <ServerLink
      href={href}
      className="bg-background mx-auto flex w-full cursor-pointer items-center rounded-lg p-6 shadow-lg transition-all ease-linear hover:scale-105 sm:w-[250px]"
    >
      <div className="mx-auto flex flex-col gap-2">
        {icon}
        <div className="text-center font-bold text-gray-500/100">{title}</div>
        <p className="text-center text-sm text-gray-400/100">{description}</p>
      </div>
    </ServerLink>
  );
};
