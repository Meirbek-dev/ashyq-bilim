import { Actions, Resources, Scopes } from '@/types/permissions';
import { requireAnyPermission } from '@/lib/server-auth';
import type { ReactNode } from 'react';

export default async function PlatformAssignmentsLayout({ children }: { children: ReactNode }) {
  await requireAnyPermission([
    { action: Actions.CREATE, resource: Resources.COURSE, scope: Scopes.ORG },
    { action: Actions.UPDATE, resource: Resources.COURSE, scope: Scopes.ORG },
    { action: Actions.UPDATE, resource: Resources.COURSE, scope: Scopes.OWN },
    { action: Actions.GRADE, resource: Resources.ASSIGNMENT, scope: Scopes.ORG },
    { action: Actions.CREATE, resource: Resources.ASSIGNMENT, scope: Scopes.ORG },
  ]);

  return <>{children}</>;
}
