'use client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { ChevronDown, Crown, LogOut, Shield, User, User as UserIcon, Users } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { useNavigationPermissions } from '@/hooks/useNavigationPermissions';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getAbsoluteUrl } from '@services/config/config';
import UserAvatar from '@components/Objects/UserAvatar';
import { RoleSlugs } from '@/types/permissions';
import { Button } from '@components/ui/button';
import { Badge } from '@components/ui/badge';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { signOut } from 'next-auth/react';
import type { ReactNode } from 'react';

interface RoleInfo {
  name: string;
  icon: ReactNode;
  bgColor: string;
  textColor: string;
  description: string;
}

interface CustomRoleInfo {
  name: string;
  description?: string;
}

export const HeaderProfileBox = () => {
  const session = usePlatformSession() as any;
  const { canAccessDashboard } = useNavigationPermissions();
  const t = useTranslations('Header');

  const userRoles = session?.data?.roles ?? [];

  let userRoleInfo: RoleInfo | null = null;
  if (userRoles && userRoles.length > 0) {
    const sortedRoles = userRoles.toSorted((a: any, b: any) => {
      return (b.role?.priority ?? 0) - (a.role?.priority ?? 0);
    });

    const highestRole = sortedRoles[0];

    if (highestRole) {
      const roleSlug = highestRole.role?.slug || '';
      const roleConfigs: Record<string, RoleInfo> = {
        [RoleSlugs.ADMIN]: {
          name: t('profile.roles.admin.name'),
          icon: <Crown size={12} />,
          bgColor: 'bg-purple-600',
          textColor: 'text-white',
          description: t('profile.roles.admin.description'),
        },
        [RoleSlugs.MAINTAINER]: {
          name: t('profile.roles.maintainer.name'),
          icon: <Shield size={12} />,
          bgColor: 'bg-blue-600',
          textColor: 'text-white',
          description: t('profile.roles.maintainer.description'),
        },
        [RoleSlugs.INSTRUCTOR]: {
          name: t('profile.roles.instructor.name'),
          icon: <Users size={12} />,
          bgColor: 'bg-green-600',
          textColor: 'text-white',
          description: t('profile.roles.instructor.description'),
        },
        [RoleSlugs.USER]: {
          name: t('profile.roles.user.name'),
          icon: <User size={12} />,
          bgColor: 'bg-gray-500',
          textColor: 'text-white',
          description: t('profile.roles.user.description'),
        },
      };

      userRoleInfo = roleConfigs[roleSlug] || roleConfigs[RoleSlugs.USER] || null;
    }
  }

  const customRoles: CustomRoleInfo[] =
    userRoles && userRoles.length > 0
      ? userRoles
          .filter((role: any) => {
            return !role.role?.is_system;
          })
          .map((role: any) => ({
            name: (role.role.name as string) || t('profile.customRole'),
            description: role.role.description,
          }))
      : [];

  return (
    <div className="flex items-center">
      {session.status === 'unauthenticated' && (
        <div className="flex grow rounded-lg p-1.5 px-2 text-sm font-bold text-gray-700">
          <ul className="flex items-center space-x-3">
            <li>
              <Link
                prefetch={false}
                href={getAbsoluteUrl('/login')}
              >
                <Button
                  variant="ghost"
                  size="sm"
                >
                  {t('login')}
                </Button>
              </Link>
            </li>
            <li>
              <Link
                prefetch={false}
                href={getAbsoluteUrl('/signup')}
              >
                <Button size="sm">{t('signUp')}</Button>
              </Link>
            </li>
          </ul>
        </div>
      )}
      {session.status === 'authenticated' && (
        <div className="flex items-center">
          <div className="flex items-center space-x-3">
            <DropdownMenu>
              <DropdownMenuTrigger
                nativeButton
                render={
                  <Button
                    variant="ghost"
                    className="flex h-auto items-center space-x-1 p-2"
                  />
                }
              >
                <UserAvatar size="sm" />
                <div className="flex flex-col space-y-0">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-semibold text-gray-900 capitalize">{session.data.user.username}</p>
                    {userRoleInfo && userRoleInfo.name !== 'USER' && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Badge
                              variant="secondary"
                              className={`text-[8px] ${userRoleInfo.bgColor} ${userRoleInfo.textColor} flex w-fit items-center gap-0.5 px-1 py-0.5 font-medium`}
                            >
                              {userRoleInfo.icon}
                              {userRoleInfo.name}
                            </Badge>
                          }
                        />
                        <TooltipContent
                          side="bottom"
                          sideOffset={15}
                          className="max-w-56 text-wrap"
                        >
                          {userRoleInfo.description}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {/* Custom roles */}
                    {customRoles.map((customRole, index) => (
                      <Tooltip key={index}>
                        <TooltipTrigger
                          render={
                            <Badge
                              variant="secondary"
                              className="flex w-fit items-center gap-0.5 bg-gray-500 px-1 py-0.5 text-[8px] font-medium text-white"
                            >
                              <Shield size={12} />
                              {customRole.name}
                            </Badge>
                          }
                        />
                        <TooltipContent
                          side="bottom"
                          sideOffset={15}
                          className="max-w-56 text-wrap"
                        >
                          {customRole.description || `Custom role: ${customRole.name}`}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                  <p className="text-muted-foreground text-start text-xs">{session.data.user.email}</p>
                </div>
                <ChevronDown
                  size={16}
                  className="text-muted-foreground"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                align="end"
              >
                <div className="px-2 py-1.5">
                  <div className="flex items-center space-x-2">
                    <UserAvatar size="sm" />
                    <div>
                      <p className="text-sm font-medium capitalize">{session.data.user.username}</p>
                      <p className="text-muted-foreground text-xs">{session.data.user.email}</p>
                    </div>
                  </div>
                </div>
                <DropdownMenuSeparator />
                {canAccessDashboard && (
                  <DropdownMenuItem
                    nativeButton={false}
                    render={
                      <Link
                        prefetch={false}
                        href="/dash"
                      />
                    }
                    className="flex items-center space-x-2"
                  >
                    <Shield size={16} />
                    <span>{t('profile.dashboard')}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  nativeButton={false}
                  render={
                    <Link
                      prefetch={false}
                      href="/dash/user-account/settings/general"
                    />
                  }
                  className="flex items-center space-x-2"
                >
                  <UserIcon size={16} />
                  <span>{t('profile.userSettings')}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="flex space-x-2"
                >
                  <LogOut size={16} />
                  <span>{t('profile.signOut')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );
};
