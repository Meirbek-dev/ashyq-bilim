import {
  canAccessDashboard,
  canSeeAdmin,
  canSeeAnalytics,
  canSeeAssignments,
  canSeeCourses,
  canSeeOrg,
  canSeePayments,
  canSeeUsers,
} from '@/lib/rbac/navigation-policy';
import { usePaymentsEnabled } from '@components/Hooks/usePaymentsEnabled';
import { usePermissions } from '@/components/Security';

export function useNavigationPermissions() {
  const { can } = usePermissions();
  const { isEnabled: arePaymentsEnabled } = usePaymentsEnabled();

  const hasOrgAccess = canSeeOrg(can);
  const hasCoursesAccess = canSeeCourses(can);
  const hasAssignmentsAccess = canSeeAssignments(can);
  const hasAnalyticsAccess = canSeeAnalytics(can);
  const hasUsersAccess = canSeeUsers(can);
  const hasAdminAccess = canSeeAdmin(can);
  const hasPaymentsAccess = arePaymentsEnabled && canSeePayments(can);
  const hasDashboardAccess = canAccessDashboard(can);

  return {
    canSeeOrg: hasOrgAccess,
    canSeeCourses: hasCoursesAccess,
    canSeeAssignments: hasAssignmentsAccess,
    canSeeAnalytics: hasAnalyticsAccess,
    canSeeUsers: hasUsersAccess,
    canSeeAdmin: hasAdminAccess,
    canSeePayments: hasPaymentsAccess,
    canAccessDashboard: hasDashboardAccess,
  };
}
