'use client';
import {
  CourseChoiceCard,
  courseWorkflowMutedPanelClass,
  getCourseWorkflowToneClass,
} from '@components/Dashboard/Courses/courseWorkflowUi';
import {
  bulkAddContributors,
  bulkRemoveContributors,
  editContributor,
  updateCourseAccess,
} from '@services/courses/courses';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionHeader } from '@components/Dashboard/Courses/SectionHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { Check, ChevronDown, Search, UserPen, Users } from 'lucide-react';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import { useCourse } from '@components/Contexts/CourseContext';
import { useDirtySection } from '@/hooks/useDirtySection';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup } from '@/components/ui/radio-group';
import UserAvatar from '@components/Objects/UserAvatar';
import { searchContent } from '@services/search/search';
import { useSaveSection } from '@/hooks/useSaveSection';
import { useDebouncedValue } from '@/hooks/useDebounce';
import { useLocale, useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Locale } from '@/i18n/config';
import { toast } from 'sonner';

type ContributorRole = 'CREATOR' | 'CONTRIBUTOR' | 'MAINTAINER' | 'REPORTER';
type ContributorStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

interface SearchUser {
  username: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  avatar_image: string;
  avatar_url?: string;
  id: number;
  user_uuid: string;
}

interface Contributor {
  id: number;
  user_id: number;
  authorship: ContributorRole;
  authorship_status: ContributorStatus;
  creation_date: string;
  user: {
    username: string;
    first_name: string;
    middle_name?: string;
    last_name: string;
    email: string;
    avatar_image: string;
    user_uuid: string;
  };
}

interface BulkAddResponse {
  successful: string[];
  failed: { username: string; reason: string }[];
}

const formatDate = (dateString: string, locale: Locale) => {
  return new Date(dateString).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const RoleDropdown = ({
  contributor,
  updateContributor,
  t,
}: {
  contributor: Contributor;
  updateContributor: any;
  t: any;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          variant="outline"
          className="w-[200px] justify-between"
          disabled={contributor.authorship === 'CREATOR' || contributor.authorship_status !== 'ACTIVE'}
        />
      }
    >
      {t(contributor.authorship.toLowerCase()) || contributor.authorship}
      <ChevronDown className="text-muted-foreground ml-2 h-4 w-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      className="w-[200px]"
    >
      {(['CONTRIBUTOR', 'MAINTAINER', 'REPORTER'] as ContributorRole[]).map((role) => (
        <DropdownMenuItem
          key={role}
          onClick={() => updateContributor(contributor.user_id, { authorship: role })}
          className="justify-between"
        >
          {t(role.toLowerCase())}
          {contributor.authorship === role && <Check className="ml-2 h-4 w-4" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const StatusDropdown = ({
  contributor,
  updateContributor,
  t,
  getStatusStyle,
}: {
  contributor: Contributor;
  updateContributor: any;
  t: any;
  getStatusStyle: (s: ContributorStatus) => string;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          variant="outline"
          className={`w-[200px] justify-between ${getStatusStyle(contributor.authorship_status)}`}
          disabled={contributor.authorship === 'CREATOR'}
        />
      }
    >
      {t(contributor.authorship_status.toLowerCase()) || contributor.authorship_status}
      <ChevronDown className="ml-2 h-4 w-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      className="w-[200px]"
    >
      {(['ACTIVE', 'INACTIVE', 'PENDING'] as ContributorStatus[]).map((status) => (
        <DropdownMenuItem
          key={status}
          onClick={() => updateContributor(contributor.user_id, { authorship_status: status })}
          className="justify-between"
        >
          {t(status.toLowerCase())}
          {contributor.authorship_status === status && <Check className="ml-2 h-4 w-4" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const EditCourseContributors = () => {
  const t = useTranslations('DashPage.EditCourseContributors');
  const locale = useLocale() as Locale;
  const session = usePlatformSession();
  const access_token = session?.data?.tokens?.access_token;
  const course = useCourse();
  const { courseStructure, editorData, refreshCourseEditor, showConflict } = course;
  const contributors = (editorData.contributors.data ?? []) as Contributor[];
  const isContributorsLoading = course.isEditorDataLoading && editorData.contributors.data === null;

  const [isOpenToContributors, setIsOpenToContributors] = useState<boolean | undefined>(
    () => courseStructure?.open_to_contributors,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [selectedContributors, setSelectedContributors] = useState<number[]>([]);
  const initialRef = useRef<boolean | undefined>(courseStructure?.open_to_contributors);

  const { isDirty, isDirtyRef, markDirty, markClean } = useDirtySection('contributors');
  const { isSaving, save } = useSaveSection({ onSuccess: markClean });

  // Sync external updates when not dirty
  useEffect(() => {
    if (isDirtyRef.current) return;
    setIsOpenToContributors(courseStructure?.open_to_contributors);
    initialRef.current = courseStructure?.open_to_contributors;
    markClean();
  }, [courseStructure?.open_to_contributors, isDirtyRef, markClean]);

  // Track dirty state on toggle change
  useEffect(() => {
    const dirty = isOpenToContributors !== undefined && isOpenToContributors !== initialRef.current;
    if (dirty) markDirty();
    else markClean();
  }, [isOpenToContributors, markDirty, markClean]);

  // Debounced user search
  useEffect(() => {
    const searchUsers = async () => {
      if (debouncedSearch.trim().length === 0) {
        setSearchResults([]);
        setIsSearching(false);
        setSearchOpen(false);
        return;
      }
      setIsSearching(true);
      setSearchOpen(true);
      try {
        const response = await searchContent(debouncedSearch, 1, 5, null, access_token);
        if (response.success && response.data?.users) {
          const users = response.data.users.map((user: SearchUser) =>
            Object.assign(user, {
              avatar_url: user.avatar_image ? getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image) : '',
            }),
          );
          setSearchResults(users);
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error(t('errorSearchingUsers'), error);
        setSearchResults([]);
      }
      setIsSearching(false);
    };

    if (access_token) {
      searchUsers();
    }
  }, [debouncedSearch, access_token, t]);

  const masterCheckboxChecked = (() => {
    const nonCreatorContributors = contributors.filter((c) => c.authorship !== 'CREATOR');
    return nonCreatorContributors.length > 0 && selectedContributors.length === nonCreatorContributors.length;
  })();

  const handleUserSelect = (username: string) => {
    setSelectedUsers((prev) => (prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]));
  };

  const handleAddContributors = async () => {
    if (selectedUsers.length === 0 || isAdding) return;
    setIsAdding(true);
    try {
      const response = await bulkAddContributors(courseStructure.course_uuid, selectedUsers, access_token);
      if (response.status === 409) {
        showConflict(response.data?.detail);
        return;
      }
      if (response.status === 200) {
        const result = response.data as BulkAddResponse;
        if (result.successful.length > 0) {
          toast.success(t('successfullyAddedContributors', { count: result.successful.length }));
        }
        result.failed.forEach((failure) => {
          toast.error(t('failedToAddContributor', { username: failure.username, reason: failure.reason }));
        });
        await refreshCourseEditor();
        setSelectedUsers([]);
        setSearchQuery('');
        setSearchOpen(false);
      }
    } catch (error) {
      console.error(t('errorAddingContributors'), error);
      toast.error(t('failedToAddContributorsGeneral'));
    } finally {
      setIsAdding(false);
    }
  };

  const updateContributor = async (
    contributorId: number,
    data: { authorship?: ContributorRole; authorship_status?: ContributorStatus },
  ) => {
    try {
      const currentContributor = contributors.find((c) => c.user_id === contributorId);
      if (!currentContributor) return;
      if (currentContributor.authorship === 'CREATOR') {
        toast.error(t('cannotModifyCreator'));
        return;
      }
      const updatedData = {
        authorship: data.authorship || currentContributor.authorship,
        authorship_status: data.authorship_status || currentContributor.authorship_status,
      };
      const res = await editContributor(
        courseStructure.course_uuid,
        contributorId,
        updatedData.authorship,
        updatedData.authorship_status,
        access_token,
      );
      if (res.status === 409) {
        showConflict(res.data?.detail);
        return;
      }
      if (res.status === 200 && res.data?.status === 'success') {
        toast.success(res.data.detail || t('successfullyUpdatedContributor'));
        await refreshCourseEditor();
      } else {
        toast.error(res.data?.detail || t('failedToUpdateContributor'));
      }
    } catch {
      toast.error(t('errorUpdatingContributor'));
    }
  };

  const getStatusStyle = (status: ContributorStatus): string => {
    switch (status) {
      case 'ACTIVE': {
        return `${getCourseWorkflowToneClass('success')} hover:bg-muted`;
      }
      case 'INACTIVE': {
        return `${getCourseWorkflowToneClass('info')} hover:bg-muted`;
      }
      case 'PENDING': {
        return `${getCourseWorkflowToneClass('warning')} hover:bg-accent`;
      }
      default: {
        return `${getCourseWorkflowToneClass('info')} hover:bg-muted`;
      }
    }
  };

  const sortContributors = (list: Contributor[]) => {
    const creator = list.find((c) => c.authorship === 'CREATOR');
    const others = list.filter((c) => c.authorship !== 'CREATOR');
    return creator ? [creator, ...others] : others;
  };

  const handleContributorSelect = (userId: number) => {
    setSelectedContributors((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const handleBulkRemove = async () => {
    if (selectedContributors.length === 0) return;
    try {
      const selectedUsernames = contributors
        .filter((c) => selectedContributors.includes(c.user_id))
        .map((c) => c.user.username);
      const response = await bulkRemoveContributors(courseStructure.course_uuid, selectedUsernames, access_token);
      if (response.status === 409) {
        showConflict(response.data?.detail);
        return;
      }
      if (response.status === 200) {
        toast.success(t('successfullyRemovedContributors', { count: selectedContributors.length }));
        await refreshCourseEditor();
        setSelectedContributors([]);
      }
    } catch (error) {
      console.error(t('errorRemovingContributors'), error);
      toast.error(t('failedToRemoveContributorsGeneral'));
    }
  };

  const handleDiscard = () => {
    setIsOpenToContributors(initialRef.current);
    markClean();
  };

  const handleContributorAccessSave = async () => {
    if (!(access_token && isOpenToContributors !== undefined) || !isDirty) return;
    await save(async () => {
      const response = await updateCourseAccess(
        courseStructure.course_uuid,
        { open_to_contributors: isOpenToContributors },
        access_token,
        { lastKnownUpdateDate: courseStructure.update_date },
      );
      if (response.success) {
        initialRef.current = isOpenToContributors;
      }
      return response;
    });
  };

  if (!courseStructure) return null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t('courseContributorsTitle')}
        description={t('courseContributorsSubtitle')}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleContributorAccessSave}
        onDiscard={handleDiscard}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('courseContributorsTitle')}</CardTitle>
          <Alert className="border-border bg-muted/40">
            <UserPen className="size-4" />
            <AlertTitle>{t('contributorPolicyStagedTitle')}</AlertTitle>
            <AlertDescription>{t('contributorPolicyStagedDescription')}</AlertDescription>
          </Alert>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={isOpenToContributors === true ? 'open' : isOpenToContributors === false ? 'closed' : undefined}
            onValueChange={(val) => setIsOpenToContributors(val === 'open')}
            disabled={isSaving}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <CourseChoiceCard
              id="contrib-open"
              value="open"
              checked={isOpenToContributors === true}
              title={t('openToContributorsTitle')}
              description={t('openToContributorsDescription')}
              icon={UserPen}
              disabled={isSaving}
              onSelect={(value) => setIsOpenToContributors(value === 'open')}
            />

            <CourseChoiceCard
              id="contrib-closed"
              value="closed"
              checked={isOpenToContributors === false}
              title={t('closeToContributorsTitle')}
              description={t('closeToContributorsDescription')}
              icon={Users}
              disabled={isSaving}
              onSelect={(value) => setIsOpenToContributors(value === 'open')}
            />
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('manageContributorsTitle')}</CardTitle>
          <Alert className="border-border bg-muted/40">
            <Users className="size-4" />
            <AlertTitle>{t('rosterActionsImmediateTitle')}</AlertTitle>
            <AlertDescription>{t('rosterActionsImmediateDescription')}</AlertDescription>
          </Alert>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Popover
              open={searchOpen}
              onOpenChange={setSearchOpen}
            >
              <PopoverTrigger
                render={<div className="relative w-full" />}
                nativeButton={false}
              >
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                <Input
                  className="pl-8"
                  placeholder={t('searchUsersPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.trim()) setSearchOpen(true);
                    else setSearchOpen(false);
                  }}
                />
              </PopoverTrigger>
              <PopoverContent
                className="w-(--anchor-width) p-0"
                align="start"
              >
                <Command>
                  <CommandList>
                    {isSearching ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">{t('searchingMessage')}</div>
                    ) : (
                      <>
                        <CommandEmpty>{t('noUsersFoundMessage')}</CommandEmpty>
                        <CommandGroup>
                          {searchResults.map((user) => {
                            const isSelected = selectedUsers.includes(user.username);
                            const isExisting = contributors.some((c) => c.user.username === user.username);
                            return (
                              <CommandItem
                                key={user.username}
                                value={user.username}
                                disabled={isExisting}
                                onSelect={() => !isExisting && handleUserSelect(user.username)}
                                className="flex items-center gap-3 py-3"
                              >
                                <Checkbox
                                  checked={isSelected}
                                  disabled={isExisting}
                                  className="shrink-0"
                                />
                                <UserAvatar
                                  size="sm"
                                  avatar_url={user.avatar_url}
                                  predefined_avatar={user.avatar_image ? undefined : 'empty'}
                                  userId={user.id}
                                  showProfilePopup
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium text-foreground">
                                    {[user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ')}
                                  </div>
                                  <div className="text-xs text-muted-foreground">@{user.username}</div>
                                </div>
                                {isExisting && (
                                  <span className="shrink-0 rounded border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                    {t('alreadyContributorMessage')}
                                  </span>
                                )}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedUsers.length > 0 && (
              <div className={courseWorkflowMutedPanelClass + ' flex items-center justify-between'}>
                <span className="text-sm text-foreground">
                  {t('usersSelectedMessage', { count: selectedUsers.length })}
                </span>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setSelectedUsers([])}
                    variant="outline"
                    size="sm"
                  >
                    {t('clearButton')}
                  </Button>
                  <Button
                    onClick={handleAddContributors}
                    size="sm"
                    disabled={isAdding}
                  >
                    {t('addSelectedButton')}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card">
            {selectedContributors.length > 0 && (
              <div className="flex items-center justify-between rounded-t-xl border-b bg-muted/60 px-4 py-3">
                <span className="text-sm text-foreground">
                  {t('contributorsSelectedMessage', { count: selectedContributors.length })}
                </span>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setSelectedContributors([])}
                    variant="outline"
                    size="sm"
                  >
                    {t('clearButton')}
                  </Button>
                  <Button
                    onClick={handleBulkRemove}
                    variant="destructive"
                    size="sm"
                  >
                    {t('removeSelectedButton')}
                  </Button>
                </div>
              </div>
            )}

            {isContributorsLoading ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">{t('loadingContributors')}</div>
            ) : (
              <ScrollArea className="max-h-[520px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30px]">
                        <Checkbox
                          checked={masterCheckboxChecked}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedContributors(
                                contributors.filter((c) => c.authorship !== 'CREATOR').map((c) => c.user_id),
                              );
                            } else {
                              setSelectedContributors([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead className="w-[50px]" />
                      <TableHead>{t('nameColumn')}</TableHead>
                      <TableHead>{t('usernameColumn')}</TableHead>
                      <TableHead>{t('emailColumn')}</TableHead>
                      <TableHead>{t('roleColumn')}</TableHead>
                      <TableHead>{t('statusColumn')}</TableHead>
                      <TableHead>{t('addedOnColumn')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortContributors(contributors).map((contributor) => (
                      <TableRow
                        key={`${contributor.user_id}-${contributor.id}`}
                        className={`${selectedContributors.includes(contributor.user_id) ? 'bg-muted/60' : ''} ${
                          contributor.authorship !== 'CREATOR' ? 'cursor-pointer hover:bg-muted/50' : ''
                        }`}
                        onClick={(e) => {
                          if (
                            e.target instanceof HTMLElement &&
                            (e.target.closest('button') || e.target.closest('input[type="checkbox"]'))
                          ) {
                            return;
                          }
                          if (contributor.authorship !== 'CREATOR') {
                            handleContributorSelect(contributor.user_id);
                          }
                        }}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedContributors.includes(contributor.user_id)}
                            onCheckedChange={() => handleContributorSelect(contributor.user_id)}
                            disabled={contributor.authorship === 'CREATOR'}
                          />
                        </TableCell>
                        <TableCell>
                          <UserAvatar
                            size="sm"
                            variant="outline"
                            avatar_url={
                              contributor.user.avatar_image
                                ? getUserAvatarMediaDirectory(contributor.user.user_uuid, contributor.user.avatar_image)
                                : ''
                            }
                            predefined_avatar={contributor.user.avatar_image === '' ? 'empty' : undefined}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {[contributor.user.first_name, contributor.user.middle_name, contributor.user.last_name]
                            .filter(Boolean)
                            .join(' ')}
                        </TableCell>
                        <TableCell className="text-muted-foreground">@{contributor.user.username}</TableCell>
                        <TableCell className="text-muted-foreground">{contributor.user.email}</TableCell>
                        <TableCell>
                          <RoleDropdown
                            contributor={contributor}
                            updateContributor={updateContributor}
                            t={t}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusDropdown
                            contributor={contributor}
                            updateContributor={updateContributor}
                            t={t}
                            getStatusStyle={getStatusStyle}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(contributor.creation_date, locale)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EditCourseContributors;
