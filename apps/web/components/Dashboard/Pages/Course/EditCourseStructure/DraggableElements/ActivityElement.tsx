import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertTriangle,
  Backpack,
  ClipboardList,
  Code2,
  Eye,
  File,
  FilePenLine,
  Globe,
  GripVertical,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Save,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { deleteAssignmentUsingActivityUUID, getAssignmentFromActivityUUID } from '@services/courses/assignments';
import { CourseWorkflowBadge } from '@components/Dashboard/Courses/courseWorkflowUi';
import { deleteActivity, updateActivity } from '@services/courses/activities';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip';
import { getAPIUrl, getAbsoluteUrl } from '@services/config/config';
import { useCourse } from '@components/Contexts/CourseContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Draggable } from '@hello-pangea/dnd';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { toast } from 'sonner';
import { mutate } from 'swr';
import useSWR from 'swr';

// Types
type ActivityType =
  | 'TYPE_VIDEO'
  | 'TYPE_DOCUMENT'
  | 'TYPE_ASSIGNMENT'
  | 'TYPE_DYNAMIC'
  | 'TYPE_EXAM'
  | 'TYPE_CODE_CHALLENGE';

interface Activity {
  id: string;
  activity_uuid: string;
  activity_type: ActivityType;
  name: string;
  published: boolean;
  can_update?: boolean;
  can_delete?: boolean;
  is_owner?: boolean;
  is_creator?: boolean;
  available_actions?: string[];
}

interface ActivityElementProps {
  activity: Activity;
  activityIndex: number;
  course_uuid: string;
}

interface PlatformSession {
  data?: {
    tokens?: {
      access_token?: string;
    };
  };
}

interface Course {
  courseStructure?: {
    course_uuid: string;
  };
  withUnpublishedActivities?: boolean;
}

// Activity type configuration
const ACTIVITY_CONFIG = {
  TYPE_VIDEO: {
    Icon: Video,
    translationKey: 'video',
    colorClass: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300',
  },
  TYPE_DOCUMENT: {
    Icon: File,
    translationKey: 'document',
    colorClass:
      'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300',
  },
  TYPE_ASSIGNMENT: {
    Icon: Backpack,
    translationKey: 'assignment',
    colorClass:
      'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300',
  },
  TYPE_DYNAMIC: {
    Icon: Sparkles,
    translationKey: 'dynamic',
    colorClass:
      'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300',
  },
  TYPE_EXAM: {
    Icon: ClipboardList,
    translationKey: 'exam',
    colorClass: 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300',
  },
  TYPE_CODE_CHALLENGE: {
    Icon: Code2,
    translationKey: 'codeChallenge',
    colorClass: 'border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-300',
  },
} as const;

const ActivityElement = ({ activity, activityIndex, course_uuid }: ActivityElementProps) => {
  // Hooks
  const session = usePlatformSession() as PlatformSession;
  const access_token = session?.data?.tokens?.access_token;
  const courseContext = useCourse();
  const course = courseContext as Course;
  const isMobile = useIsMobile();
  const t = useTranslations('CourseEdit.ActivityElement');

  // State
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(activity?.name ?? '');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isUpdatingPublish, setIsUpdatingPublish] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingActivity, setIsDeletingActivity] = useState(false);
  // Lazy: only fetch assignment UUID when the user first interacts with the edit button
  const [fetchAssignment, setFetchAssignment] = useState(false);

  // Fetch assignment UUID lazily — only after the user explicitly requests it
  // (hover / click on the edit button), instead of eagerly on every mount.
  const { data: assignmentUUID, isLoading: isAssignmentLoading } = useSWR(
    activity.activity_type === 'TYPE_ASSIGNMENT' && access_token && fetchAssignment
      ? [`assignment-${activity.activity_uuid}`, access_token]
      : null,
    async () => {
      const result = await getAssignmentFromActivityUUID(activity.activity_uuid, access_token!);
      return result?.data?.assignment_uuid?.replace('assignment_', '') ?? null;
    },
  );

  // Permission checks from backend metadata
  const canUpdate = activity.can_update ?? false;
  const canDelete = activity.can_delete ?? false;
  const isOwner = activity.is_owner ?? false;
  const availableActions = activity.available_actions ?? [];

  // Derived values
  const withUnpublishedActivities = course?.withUnpublishedActivities ?? false;
  const courseMetaUrl = `${getAPIUrl()}courses/${course_uuid}/meta?with_unpublished_activities=${withUnpublishedActivities}`;

  // Handlers
  const handleStartEdit = () => {
    setIsEditing(true);
    setEditedName(activity.name);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedName(activity.name);
  };

  const handleSaveEdit = async () => {
    if (!access_token) {
      toast.error('Authentication required');
      return;
    }

    const trimmedName = editedName.trim();
    if (!trimmedName || trimmedName === activity.name) {
      handleCancelEdit();
      return;
    }

    setIsSavingEdit(true);
    try {
      const response = await updateActivity({ ...activity, name: trimmedName }, activity.activity_uuid, access_token, {
        courseUuid: course_uuid,
        lastKnownUpdateDate: courseContext.courseStructure.update_date,
      });
      if (!response.success) {
        throw Object.assign(new Error(response.data?.detail || t('failedToUpdateActivityName')), {
          status: response.status,
          detail: response.data?.detail,
        });
      }
      await mutate(courseMetaUrl);
      toast.success(t('activityNameUpdatedSuccess'));
      setIsEditing(false);
    } catch (error: any) {
      if (error?.status === 409) {
        courseContext.showConflict(error?.detail || error?.message);
        return;
      }
      console.error('Failed to update activity name:', error);
      toast.error(error?.message || t('failedToUpdateActivityName'));
      setEditedName(activity.name);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!access_token) {
      toast.error('Authentication required');
      return;
    }

    setIsUpdatingPublish(true);
    const toastId = toast.loading(t('updating'));

    try {
      const response = await updateActivity(
        { ...activity, published: !activity.published },
        activity.activity_uuid,
        access_token,
        {
          courseUuid: course_uuid,
          lastKnownUpdateDate: courseContext.courseStructure.update_date,
        },
      );
      if (!response.success) {
        throw Object.assign(new Error(response.data?.detail || t('updateFailed')), {
          status: response.status,
          detail: response.data?.detail,
        });
      }
      await mutate(courseMetaUrl);
      toast.success(t('activityUpdateSuccess'));
    } catch (error: any) {
      toast.dismiss(toastId);
      if (error?.status === 409) {
        courseContext.showConflict(error?.detail || error?.message);
        setIsUpdatingPublish(false);
        return;
      }
      console.error('Failed to toggle publish status:', error);
      toast.error(error?.message || t('updateFailed'));
    } finally {
      toast.dismiss(toastId);
      setIsUpdatingPublish(false);
    }
  };

  const handleDeleteActivity = async () => {
    if (!access_token) {
      toast.error('Authentication required');
      return;
    }

    setIsDeletingActivity(true);
    const toastId = toast.loading(t('deletingActivity'));

    try {
      // Delete assignment if it's an assignment activity
      if (activity.activity_type === 'TYPE_ASSIGNMENT') {
        await deleteAssignmentUsingActivityUUID(activity.activity_uuid, access_token);
      }

      const response = await deleteActivity(activity.activity_uuid, access_token, {
        courseUuid: course_uuid,
        lastKnownUpdateDate: courseContext.courseStructure.update_date,
      });
      if (!response.success) {
        throw Object.assign(new Error(response.data?.detail || 'Failed to delete activity'), {
          status: response.status,
          detail: response.data?.detail,
        });
      }
      await mutate(courseMetaUrl);
      toast.success(t('activityDeletedSuccess'));
      setIsDeleteDialogOpen(false);
    } catch (error: any) {
      if (error?.status === 409) {
        courseContext.showConflict(error?.detail || error?.message);
        return;
      }
      console.error('Failed to delete activity:', error);
      toast.error(error?.message || t('deleteFailed'));
    } finally {
      toast.dismiss(toastId);
      setIsDeletingActivity(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // Early validation (moved below hooks to satisfy Rules of Hooks)
  if (!activity?.activity_uuid) {
    console.error('ActivityElement: Invalid activity data', activity);
    return null;
  }

  return (
    <Draggable
      draggableId={activity.activity_uuid}
      index={activityIndex}
    >
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            'mb-2 flex items-center gap-3 rounded-lg border bg-card p-3 transition-all duration-200',
            snapshot.isDragging ? 'shadow-xl ring-2 ring-ring/30' : 'shadow-sm hover:shadow-md',
          )}
        >
          {/* Drag Handle */}
          <div
            {...provided.dragHandleProps}
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-5 w-5" />
          </div>

          {/* Activity Type Badge */}
          <ActivityTypeBadge activityType={activity.activity_type} />

          {/* Activity Name (Editable) */}
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('activityNamePlaceholder')}
                  className="h-8 text-sm"
                  disabled={isSavingEdit}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit || !editedName.trim()}
                  className="h-8 w-8 p-0 hover:bg-muted"
                >
                  {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  disabled={isSavingEdit}
                  className="h-8 w-8 p-0 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="group flex items-center gap-2">
                <p className="truncate text-sm font-medium text-foreground">{activity.name}</p>
                {canUpdate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleStartEdit}
                    className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
                {isOwner && (
                  <ToolTip content="You created this activity">
                    <CourseWorkflowBadge tone="info">{t('ownerLabel')}</CourseWorkflowBadge>
                  </ToolTip>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <ActivityEditButton
              activity={activity}
              course_uuid={course_uuid}
              assignmentUUID={assignmentUUID ?? null}
              isAssignmentLoading={isAssignmentLoading}
              onRequestAssignment={() => setFetchAssignment(true)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                  />
                }
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canUpdate ? (
                  <DropdownMenuItem onSelect={handleStartEdit}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('editButton')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onSelect={() => {
                    window.open(
                      `${getAbsoluteUrl('')}/course/${course_uuid.replace('course_', '')}/activity/${activity.activity_uuid.replace('activity_', '')}`,
                      '_blank',
                      'noopener,noreferrer',
                    );
                  }}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  {t('previewTooltip')}
                </DropdownMenuItem>
                {canUpdate ? (
                  <DropdownMenuItem
                    onSelect={handleTogglePublish}
                    disabled={isUpdatingPublish}
                  >
                    {activity.published ? <Lock className="mr-2 h-4 w-4" /> : <Globe className="mr-2 h-4 w-4" />}
                    {activity.published ? t('unpublish') : t('publish')}
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('deleteButton')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog
              open={isDeleteDialogOpen}
              onOpenChange={setIsDeleteDialogOpen}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-muted text-foreground">
                    <AlertTriangle className="size-8" />
                  </AlertDialogMedia>
                  <AlertDialogTitle>{t('deleteTitle', { name: activity.name })}</AlertDialogTitle>
                  <AlertDialogDescription>{t('deleteConfirmation')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeletingActivity} />
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDeleteActivity}
                    disabled={isDeletingActivity}
                  >
                    {isDeletingActivity ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('deleting')}
                      </>
                    ) : (
                      t('deleteButton')
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </Draggable>
  );
};

// Sub-components
const ActivityTypeBadge = ({ activityType }: { activityType: ActivityType }) => {
  const t = useTranslations('CourseEdit.ActivityElement');
  const config = ACTIVITY_CONFIG[activityType];

  if (!config) {
    return null;
  }

  const { Icon, translationKey, colorClass } = config;
  const label = t(`ActivityTypes.${translationKey}`);

  return (
    <div className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1', colorClass)}>
      <Icon className="h-3.5 w-3.5" />
      <span className="pl-1 text-xs font-medium">{label}</span>
    </div>
  );
};

const ActivityEditButton = ({
  activity,
  course_uuid,
  assignmentUUID,
  isAssignmentLoading,
  onRequestAssignment,
}: {
  activity: Activity;
  course_uuid: string;
  assignmentUUID: string | null;
  isAssignmentLoading: boolean;
  onRequestAssignment: () => void;
}) => {
  const t = useTranslations('CourseEdit.ActivityElement');
  const course = useCourse() as Course;
  const isMobile = useIsMobile();

  // Dynamic page edit button
  if (activity.activity_type === 'TYPE_DYNAMIC') {
    const editUrl = `${getAbsoluteUrl('')}/course/${course?.courseStructure?.course_uuid?.replace(
      'course_',
      '',
    )}/activity/${activity.activity_uuid.replace('activity_', '')}/edit`;

    return (
      <Button
        size="sm"
        variant="outline"
        nativeButton={false}
        render={
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
          />
        }
      >
        <FilePenLine className="h-3.5 w-3.5" />
        {!isMobile && <span className="ml-1.5 text-xs">{t('editPageButton')}</span>}
      </Button>
    );
  }

  // Assignment edit button
  if (activity.activity_type === 'TYPE_ASSIGNMENT') {
    if (isAssignmentLoading) {
      return (
        <Button
          size="sm"
          variant="outline"
          disabled
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </Button>
      );
    }

    if (!assignmentUUID) {
      return (
        <Button
          size="sm"
          variant="outline"
          onMouseEnter={onRequestAssignment}
          onClick={onRequestAssignment}
        >
          <FilePenLine className="h-3.5 w-3.5" />
          {!isMobile && <span className="ml-1.5 text-xs">{t('editAssignmentButton')}</span>}
        </Button>
      );
    }

    const editUrl = `${getAbsoluteUrl('')}/dash/assignments/${assignmentUUID}`;

    return (
      <Button
        size="sm"
        variant="outline"
        nativeButton={false}
        render={
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
          />
        }
      >
        <FilePenLine className="h-3.5 w-3.5" />
        {!isMobile && <span className="ml-1.5 text-xs">{t('editAssignmentButton')}</span>}
      </Button>
    );
  }

  // Code challenge edit button
  if (activity.activity_type === 'TYPE_CODE_CHALLENGE') {
    const editUrl = `${getAbsoluteUrl('')}/course/${course?.courseStructure?.course_uuid?.replace(
      'course_',
      '',
    )}/activity/${activity.activity_uuid.replace('activity_', '')}/editor`;

    return (
      <Button
        size="sm"
        variant="outline"
        nativeButton={false}
        render={
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
          />
        }
      >
        <FilePenLine className="h-3.5 w-3.5" />
        {!isMobile && <span className="ml-1.5 text-xs">{t('configureButton')}</span>}
      </Button>
    );
  }

  return null;
};

export default ActivityElement;
