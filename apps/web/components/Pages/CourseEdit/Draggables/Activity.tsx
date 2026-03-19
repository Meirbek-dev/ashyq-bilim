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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Eye, File, Loader2, MoreVertical, Pencil, Save, Sparkles, Video, X } from 'lucide-react';
import { deleteActivity, updateActivity } from '@services/courses/activities';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getAPIUrl, getAbsoluteUrl } from '@services/config/config';
import { useCourse } from '@components/Contexts/CourseContext';
import { revalidateTags } from '@services/utils/ts/requests';
import { useState, useTransition } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { mutate } from 'swr';

interface ModifiedActivityInterface {
  activityId: string;
  activityName: string;
}

const Activity = (props: any) => {
  const router = useRouter();
  const session = usePlatformSession() as any;
  const [modifiedActivity, setModifiedActivity] = useState<ModifiedActivityInterface | undefined>();
  const [selectedActivity, setSelectedActivity] = useState<string | undefined>();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const t = useTranslations('CourseEdit');
  const course = useCourse();
  const withUnpublishedActivities = course ? course.withUnpublishedActivities : false;

  function removeActivity() {
    startTransition(async () => {
      await deleteActivity(props.activity.id, session.data?.tokens?.access_token);
      mutate(
        `${getAPIUrl()}chapters/meta/course_${props.courseid}?with_unpublished_activities=${withUnpublishedActivities}`,
      );
      await revalidateTags(['courses']);
      setIsDeleteDialogOpen(false);
      router.refresh();
    });
  }

  async function updateActivityName(activityId: string) {
    if (modifiedActivity?.activityId === activityId && selectedActivity !== undefined) {
      const modifiedActivityCopy = {
        ...props.activity,
        name: modifiedActivity.activityName,
      };

      await updateActivity(modifiedActivityCopy, activityId, session.data?.tokens?.access_token);
      await mutate(
        `${getAPIUrl()}chapters/meta/course_${props.courseid}?with_unpublished_activities=${withUnpublishedActivities}`,
      );
      await revalidateTags(['courses']);
      router.refresh();
    }
    setSelectedActivity(undefined);
  }

  return (
    <Draggable
      key={props.activity.uuid}
      draggableId={String(props.activity.uuid)}
      index={props.index}
    >
      {(provided) => (
        <div
          className="my-2 flex w-auto flex-row items-center space-x-1 rounded-md bg-gray-50 py-2 text-gray-500 shadow-xs ring-1 ring-gray-400/10 transition-all delay-100 duration-75 ease-linear ring-inset hover:scale-102 hover:bg-gray-100 hover:shadow-sm"
          key={props.activity.id}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          ref={provided.innerRef}
        >
          <div className="w-28 space-x-1 px-3 text-gray-300">
            {props.activity.type === 'video' && (
              <div className="flex items-center space-x-2">
                <Video size={16} />{' '}
                <div className="mx-auto justify-center rounded-full bg-gray-200 px-2 py-1 align-middle text-xs font-bold text-gray-400">
                  {t('activityTypes.video')}
                </div>
              </div>
            )}
            {props.activity.type === 'documentpdf' && (
              <div className="flex items-center space-x-2">
                <div className="w-[30px]">
                  <File size={16} />{' '}
                </div>
                <div className="rounded-full bg-gray-200 px-2 py-1 text-xs font-bold text-gray-400">
                  {t('activityTypes.document')}
                </div>
              </div>
            )}
            {props.activity.type === 'dynamic' && (
              <div className="flex items-center space-x-2">
                <Sparkles size={16} />{' '}
                <div className="rounded-full bg-gray-200 px-2 py-1 text-xs font-bold text-gray-400">
                  {t('activityTypes.dynamic')}
                </div>
              </div>
            )}
          </div>

          <div className="mx-auto flex grow items-center justify-center space-x-2">
            {selectedActivity === props.activity.id ? (
              <div className="chapter-modification-zone space-x-3 rounded-lg bg-gray-200/60 px-4 py-1 text-[7px] text-gray-600 shadow-inner">
                <input
                  type="text"
                  className="bg-transparent text-xs text-gray-500 outline-hidden"
                  placeholder={t('activityNamePlaceholder')}
                  value={modifiedActivity ? modifiedActivity?.activityName : props.activity.name}
                  onChange={(e) => {
                    setModifiedActivity({
                      activityId: props.activity.id,
                      activityName: e.target.value,
                    });
                  }}
                />
                <button
                  onClick={() => updateActivityName(props.activity.id)}
                  className="bg-transparent text-neutral-700 hover:cursor-pointer hover:text-neutral-900"
                >
                  <Save
                    size={11}
                    onClick={() => updateActivityName(props.activity.id)}
                  />
                </button>
              </div>
            ) : (
              <p className="first-letter:uppercase"> {props.activity.name} </p>
            )}
            <Pencil
              onClick={() => {
                setSelectedActivity(props.activity.id);
              }}
              size={12}
              className="text-neutral-400 hover:cursor-pointer"
            />
          </div>

          <div className="flex flex-row space-x-2">
            {props.activity.type === 'TYPE_DYNAMIC' && (
              <Link
                href={`${getAbsoluteUrl('')}/course/${
                  props.courseid
                }/activity/${props.activity.uuid.replace('activity_', '')}/edit`}
                className="items-center rounded-md bg-sky-700 p-1 px-3 hover:cursor-pointer"
                rel="noopener noreferrer"
              >
                <div className="text-xs font-bold text-sky-100">{t('editButton')} </div>
              </Link>
            )}
            <Link
              href={`${getAbsoluteUrl('')}/course/${
                props.courseid
              }/activity/${props.activity.uuid.replace('activity_', '')}`}
              className="rounded-md bg-gray-200 p-1 px-3 hover:cursor-pointer"
              rel="noopener noreferrer"
            >
              <Eye
                strokeWidth={2}
                size={15}
                className="text-gray-600"
              />
            </Link>
          </div>
          <div className="flex flex-row items-center space-x-1 pr-3">
            <MoreVertical
              size={15}
              className="text-gray-300"
            />
            <AlertDialog
              open={isDeleteDialogOpen}
              onOpenChange={setIsDeleteDialogOpen}
            >
              <AlertDialogTrigger
                render={
                  <div className="rounded-md bg-red-600 p-1 px-5 hover:cursor-pointer">
                    <X
                      size={15}
                      className="font-bold text-rose-200"
                    />
                  </div>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400">
                    <AlertTriangle className="size-8" />
                  </AlertDialogMedia>
                  <AlertDialogTitle>{t('deleteActivityTitle', { name: props.activity.name })}</AlertDialogTitle>
                  <AlertDialogDescription>{t('deleteActivityConfirmation')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel />
                  <AlertDialogAction
                    variant="destructive"
                    onClick={removeActivity}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        {t('deleting')}
                      </div>
                    ) : (
                      t('deleteActivityButton')
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

export default Activity;
