import { Actions, Resources, Scopes } from '@/types/permissions';
import { requireAnyPermission } from '@/lib/server-auth';
import type { ReactNode } from 'react';

export default async function PlatformOrgLayout({ children }: { children: ReactNode }) {
  await requireAnyPermission(
    [
      { action: Actions.READ, resource: Resources.ORGANIZATION, scope: Scopes.OWN },
      { action: Actions.UPDATE, resource: Resources.ORGANIZATION, scope: Scopes.OWN },
      { action: Actions.READ, resource: Resources.ORGANIZATION, scope: Scopes.ORG },
      { action: Actions.UPDATE, resource: Resources.ORGANIZATION, scope: Scopes.ORG },
      { action: Actions.MANAGE, resource: Resources.ORGANIZATION, scope: Scopes.ORG },
    ],
    '/dash',
  );

  return <>{children}</>;
}
