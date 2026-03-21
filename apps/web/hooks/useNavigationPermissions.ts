import {
  canAccessDashboard,
  canSeeAdmin,
  canSeeAnalytics,
  canSeeAssignments,
  canSeeCourses,
  canSeePlatform,
  canSeePayments,
  canSeeUsers,
} from '@/lib/rbac/navigation-policy';
import { usePaymentsEnabled } from '@components/Hooks/usePaymentsEnabled';
import { usePermissions } from '@/components/Security';

export function useNavigationPermissions() {
  const { can } = usePermissions();
  const { isEnabled: arePaymentsEnabled } = usePaymentsEnabled();

  const hasPlatformAccess = canSeePlatform(can);
  const hasCoursesAccess = canSeeCourses(can);
  const hasAssignmentsAccess = canSeeAssignments(can);
  const hasAnalyticsAccess = canSeeAnalytics(can);
  const hasUsersAccess = canSeeUsers(can);
  const hasAdminAccess = canSeeAdmin(can);
  const hasPaymentsAccess = arePaymentsEnabled && canSeePayments(can);
  const hasDashboardAccess = canAccessDashboard(can);

  return {
    canSeeCourses: hasCoursesAccess,
    canSeeAssignments: hasAssignmentsAccess,
    canSeeAnalytics: hasAnalyticsAccess,
    canSeeUsers: hasUsersAccess,
    canSeeAdmin: hasAdminAccess,
    canSeePayments: hasPaymentsAccess,
    canSeePlatform: hasPlatformAccess,
    canAccessDashboard: hasDashboardAccess,
  };
}
