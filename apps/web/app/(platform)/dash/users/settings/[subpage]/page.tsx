'use client';

import UserGroups from '@/components/Dashboard/Pages/Users/UserGroups/UserGroups';
import { Actions, Resources, Scopes, usePermissions } from '@/components/Security';
import DesktopOnlyGuard from '@components/Dashboard/Misc/DesktopOnlyGuard';
import Users from '@/components/Dashboard/Pages/Users/Users/Users';
import SettingsHeader from '@components/Dashboard/Misc/SettingsHeader';
import SettingsTabs from '@components/Dashboard/Misc/SettingsTabs';
import { SquareUserRound, UsersIcon } from 'lucide-react';
import { getAbsoluteUrl } from '@services/config/config';
import { use, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export interface SettingsParams {
  subpage: string;
}

type SubpageType = 'users' | 'usergroups';

interface TabConfig {
  id: SubpageType;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  labelKey: string;
  titleKey: string;
  descriptionKey: string;
  component: React.ComponentType;
}

export default function PlatformUsersSettingsPage(props: { params: Promise<{ subpage: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const t = useTranslations('DashPage.UserSettings');
  const { can } = usePermissions();

  const allTabs: TabConfig[] = useMemo(
    () => [
      {
        id: 'users',
        icon: UsersIcon,
        labelKey: 'users',
        titleKey: 'usersTitle',
        descriptionKey: 'usersDescription',
        component: Users,
      },
      {
        id: 'usergroups',
        icon: SquareUserRound,
        labelKey: 'usergroups',
        titleKey: 'usergroupsTitle',
        descriptionKey: 'usergroupsDescription',
        component: UserGroups,
      },
    ],
    [],
  );

  useEffect(() => {
    if (params.subpage !== 'roles') return;
    router.replace(`${getAbsoluteUrl('')}/dash/admin/roles`);
  }, [params.subpage, router]);

  const tabs = useMemo(
    () =>
      allTabs.filter((tab) => {
        switch (tab.id) {
          case 'users': {
            return can(Actions.READ, Resources.USER, Scopes.ORG) || can(Actions.UPDATE, Resources.USER, Scopes.ORG);
          }
          case 'usergroups': {
            return can(Actions.MANAGE, Resources.USERGROUP, Scopes.ORG);
          }
          default: {
            return true;
          }
        }
      }),
    [allTabs, can],
  );

  const currentTab: TabConfig = useMemo(
    () => tabs.find((tab) => tab.id === params.subpage) ?? tabs[0]!,
    [tabs, params.subpage],
  );

  const ActiveComponent = currentTab.component;

  return (
    <DesktopOnlyGuard>
      <div className="bg-background flex h-screen w-full flex-col">
        <SettingsHeader
          breadcrumbType="orgusers"
          title={t(currentTab.titleKey)}
          description={t(currentTab.descriptionKey)}
        >
          <SettingsTabs
            value={params.subpage}
            tabs={tabs}
            getHref={(tab) => `${getAbsoluteUrl('')}/dash/users/settings/${tab.id}`}
            translationNamespace="DashPage.UserSettings"
          />
        </SettingsHeader>

        <ActiveComponent />
      </div>
    </DesktopOnlyGuard>
  );
}
