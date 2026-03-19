import UserRolesClient from '@/app/_shared/dash/admin/users/client';
import { Actions, Resources, Scopes } from '@/types/permissions';
import { requirePermission } from '@/lib/server-auth';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Components.Roles');

  return {
    title: t('userRolesTitle'),
    description: t('userRolesDescription')
  };
}

export default async function PlatformAdminUsersPage() {
  await requirePermission(Actions.UPDATE, Resources.ROLE, Scopes.ORG);
  return <UserRolesClient />;
}
