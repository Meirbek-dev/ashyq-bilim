'use client';

import { linkUserToUserGroup, unLinkUserToUserGroup } from '@services/usergroups/usergroups';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { swrFetcher } from '@services/utils/ts/requests';
import type { ColumnDef } from '@tanstack/react-table';
import { getAPIUrl } from '@services/config/config';
import DataTable from '@components/ui/data-table';
import { Check, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import useSWR, { mutate } from 'swr';
import { toast } from 'sonner';

interface ManageUsersProps {
  usergroup_id: number;
}

interface UserRow {
  user: {
    id: number;
    username: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
  };
}

const ManageUsers = (props: ManageUsersProps) => {
  const t = useTranslations('Components.ManageUsers');
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const { data: Users } = useSWR(`${getAPIUrl()}platform/users`, (url) => swrFetcher(url, access_token));
  const { data: UGusers } = useSWR(`${getAPIUrl()}usergroups/${props.usergroup_id}/users`, (url) =>
    swrFetcher(url, access_token),
  );

  // Normalize Users response which may be either an array or a paginated object { users: [], total, ... }
  const platformUsersList = (data: any) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.users)) return data.users;
    return [];
  };

  const isUserPartOfGroup = (user_id: number) => {
    if (UGusers) {
      return UGusers.some((user: any) => user.id === user_id);
    }
    return false;
  };

  const handleLinkUser = async (user_id: number) => {
    const res = await linkUserToUserGroup(props.usergroup_id, user_id, access_token);
    if (res.status === 200) {
      toast.success(t('linkSuccess'));
      mutate(`${getAPIUrl()}usergroups/${props.usergroup_id}/users`);
    } else {
      toast.error(t('linkError', { error: res.data?.detail || t('unknownError') }));
    }
  };

  const handleUnlinkUser = async (user_id: number) => {
    const res = await unLinkUserToUserGroup(props.usergroup_id, user_id, access_token);
    if (res.status === 200) {
      toast.success(t('unlinkSuccess'));
      mutate(`${getAPIUrl()}usergroups/${props.usergroup_id}/users`);
    } else {
      toast.error(t('unlinkError', { error: res.data?.detail || t('unknownError') }));
    }
  };

  const rows = platformUsersList(Users) as UserRow[];
  const columns: ColumnDef<UserRow>[] = [
    {
      accessorFn: (row) =>
        [row.user.first_name, row.user.middle_name, row.user.last_name, row.user.username].filter(Boolean).join(' '),
      id: 'user',
      header: t('userHeader'),
      cell: ({ row }) => (
        <div className="flex items-center space-x-2">
          <span>
            {[row.original.user.first_name, row.original.user.middle_name, row.original.user.last_name]
              .filter(Boolean)
              .join(' ')}
          </span>
          <span className="rounded-full bg-neutral-100 p-1 px-2 text-xs font-semibold text-neutral-400">
            @{row.original.user.username}
          </span>
        </div>
      ),
    },
    {
      accessorFn: (row) => (isUserPartOfGroup(row.user.id) ? t('linkedStatus') : t('notLinkedStatus')),
      id: 'linked',
      header: t('linkedHeader'),
      cell: ({ row }) =>
        isUserPartOfGroup(row.original.user.id) ? (
          <div className="flex w-fit items-center space-x-1 rounded-full bg-cyan-100 px-4 py-1 text-cyan-800">
            <Check size={16} />
            <span>{t('linkedStatus')}</span>
          </div>
        ) : (
          <div className="flex w-fit items-center space-x-1 rounded-full bg-gray-100 px-4 py-1 text-gray-800">
            <X size={16} />
            <span>{t('notLinkedStatus')}</span>
          </div>
        ),
    },
    {
      id: 'actions',
      header: t('actionsHeader'),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-end space-x-2">
          <button
            onClick={() => handleLinkUser(row.original.user.id)}
            className="flex items-center space-x-2 rounded-md bg-cyan-700 p-1 px-3 text-sm font-bold text-cyan-100 hover:cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{t('linkButton')}</span>
          </button>
          <button
            onClick={() => handleUnlinkUser(row.original.user.id)}
            className="flex items-center space-x-2 rounded-md bg-gray-700 p-1 px-3 text-sm font-bold text-gray-100 hover:cursor-pointer"
          >
            <X className="h-4 w-4" />
            <span>{t('unlinkButton')}</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="py-3">
      <DataTable
        columns={columns}
        data={rows}
        pageSize={8}
        storageKey={`usergroup-${props.usergroup_id}-users`}
      />
    </div>
  );
};

export default ManageUsers;
