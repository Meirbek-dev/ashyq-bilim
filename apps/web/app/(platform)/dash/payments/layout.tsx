import { Actions, Resources, Scopes } from '@/types/permissions';
import { requireAnyPermission } from '@/lib/server-auth';
import type { ReactNode } from 'react';

export default async function PlatformPaymentsLayout({ children }: { children: ReactNode }) {
  await requireAnyPermission([
    { action: Actions.MANAGE, resource: Resources.PAYMENT, scope: Scopes.ORG },
    { action: Actions.MANAGE, resource: Resources.ORGANIZATION, scope: Scopes.OWN },
  ]);

  return <>{children}</>;
}
