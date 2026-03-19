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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AlertTriangle, GripVertical, Hexagon, Loader2, MoreHorizontal, Pencil, Save, Trash2, X } from 'lucide-react';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { deleteChapter, updateChapter } from '@services/courses/chapters';
import { useCourse } from '@components/Contexts/CourseContext';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { toast } from 'sonner';

import NewActivityButton from '../Buttons/NewActivityButton';
import ActivityElement from './ActivityElement';

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
  // Backend permission metadata
  can_update?: boolean;
  can_delete?: boolean;
  is_owner?: boolean;
  is_creator?: boolean;
  available_actions?: string[];
  [key: string]: any;
}

interface Chapter {
  id: number;
  chapter_uuid: string;
  name: string;
  activities?: Activity[];
}

interface ChapterElementProps {
  chapter: Chapter;
  chapterIndex: number;
  course_uuid: string;
}

interface PlatformSession {
  data?: {
    tokens?: {
      access_token?: string;
    };
  };
}

const ChapterElement = ({ chapter, chapterIndex, course_uuid }: ChapterElementProps) => {
  // Hooks
  const session = usePlatformSession() as PlatformSession;
  const access_token = session?.data?.tokens?.access_token;
  const course = useCourse();
  const { showConflict } = course;
  const t = useTranslations('CourseEdit');

  // State
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(chapter?.name ?? '');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingChapter, setIsDeletingChapter] = useState(false);

  // Derived values
  const activities = chapter.activities ?? [];

  // Handlers
  const handleStartEdit = () => {
    setIsEditing(true);
    setEditedName(chapter.name);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedName(chapter.name);
  };

  const handleSaveEdit = async () => {
    if (!access_token) {
      toast.error('Authentication required');
      return;
    }

    const trimmedName = editedName.trim();
    if (!trimmedName || trimmedName === chapter.name) {
      handleCancelEdit();
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateChapter(chapter.id, { name: trimmedName }, access_token, {
        courseUuid: course_uuid,
        lastKnownUpdateDate: course.courseStructure.update_date,
      });
      await course.refreshCourseMeta();
      setIsEditing(false);
    } catch (error: any) {
      if (error?.status === 409) {
        showConflict(error?.detail || error?.message);
        return;
      }
      toast.error(error?.message || t('chapterUpdateFailed'));
      setEditedName(chapter.name);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteChapter = async () => {
    if (!access_token) {
      toast.error('Authentication required');
      return;
    }

    setIsDeletingChapter(true);
    try {
      await deleteChapter(chapter.id, access_token, {
        courseUuid: course_uuid,
        lastKnownUpdateDate: course.courseStructure.update_date,
      });
      await course.refreshCourseMeta();
      setIsDeleteDialogOpen(false);
    } catch (error: any) {
      if (error?.status === 409) {
        showConflict(error?.detail || error?.message);
        return;
      }
      toast.error(error?.message || t('chapterDeleteFailed'));
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeletingChapter(false);
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

  // Early validation (moved below all hooks to satisfy Rules of Hooks)
  if (!chapter?.chapter_uuid) {
    return null;
  }

  return (
    <Draggable
      draggableId={chapter.chapter_uuid}
      index={chapterIndex}
    >
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            'mb-4 rounded-xl border bg-card shadow-sm transition-all duration-200',
            snapshot.isDragging ? 'shadow-2xl ring-2 ring-ring/30' : 'hover:shadow-md',
          )}
        >
          {/* Chapter Header */}
          <div className="flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">
            {/* Left Section: Drag Handle + Icon + Name */}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {/* Drag Handle */}
              <div
                {...provided.dragHandleProps}
                className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-5 w-5" />
              </div>

              {/* Chapter Icon */}
              <div className="bg-muted flex-shrink-0 rounded-lg p-2">
                <Hexagon
                  className="text-muted-foreground h-4 w-4"
                  strokeWidth={2.5}
                />
              </div>

              {/* Chapter Name - Editable */}
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t('chapterNamePlaceholder')}
                      className="h-8 text-sm"
                      disabled={isSavingEdit}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleSaveEdit}
                      disabled={isSavingEdit || !editedName.trim()}
                      className="h-8 w-8 p-0"
                    >
                      {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancelEdit}
                      disabled={isSavingEdit}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="group flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-foreground sm:text-base">{chapter.name}</h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleStartEdit}
                      className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Section: Actions */}
            <div className="flex-shrink-0">
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
                  <DropdownMenuItem onSelect={handleStartEdit}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('deleteChapterButton')}
                  </DropdownMenuItem>
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
                    <AlertDialogTitle>{t('deleteChapterTitle', { name: chapter.name })}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {activities.length > 0
                        ? t('deleteChapterConfirmationWithCount', { count: activities.length })
                        : t('deleteChapterConfirmation')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeletingChapter} />
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleDeleteChapter}
                      disabled={isDeletingChapter}
                    >
                      {isDeletingChapter ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('deleting')}
                        </>
                      ) : (
                        t('deleteChapterButton')
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <Droppable
            droppableId={chapter.chapter_uuid}
            type="activity"
          >
            {(provided, droppableSnapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={cn(
                  'min-h-[80px] rounded-lg px-4 py-3 transition-colors',
                  droppableSnapshot.isDraggingOver && 'bg-muted/50',
                )}
              >
                {activities.length > 0 ? (
                  activities.map((activity, index) => (
                    <ActivityElement
                      key={activity.activity_uuid}
                      course_uuid={course_uuid}
                      activityIndex={index}
                      activity={activity}
                    />
                  ))
                ) : (
                  <div className="flex min-h-[60px] items-center justify-center text-sm text-muted-foreground">
                    {t('noActivities')}
                  </div>
                )}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          {/* New Activity Button */}
          <div className="px-4 pb-4">
            <NewActivityButton chapterId={chapter.id} />
          </div>
        </div>
      )}
    </Draggable>
  );
};

export default ChapterElement;
