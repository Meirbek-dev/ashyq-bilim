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
import { AlertTriangle, Hexagon, Loader2, MoreVertical, Pencil, Save, Sparkles, X } from 'lucide-react';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { useCourse } from '@components/Contexts/CourseContext';
import { revalidateTags } from '@services/utils/ts/requests';
import { updateChapter } from '@services/courses/chapters';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { getAPIUrl } from '@services/config/config';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { mutate } from 'swr';

import Activity from './Activity';

interface ModifiedChapterInterface {
  chapterId: number;
  chapterName: string;
}

const Chapter = (props: any) => {
  const router = useRouter();
  const session = usePlatformSession() as any;
  const t = useTranslations('CourseEdit');
  const [modifiedChapter, setModifiedChapter] = useState<ModifiedChapterInterface | undefined>();
  const [selectedChapter, setSelectedChapter] = useState<string | undefined>();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const course = useCourse();
  const withUnpublishedActivities = course ? course.withUnpublishedActivities : false;

  function handleDeleteChapter() {
    startTransition(async () => {
      await props.deleteChapter(props.info.list.chapter.id);
      setIsDeleteDialogOpen(false);
    });
  }

  async function updateChapterName(chapterId: number) {
    if (modifiedChapter?.chapterId === chapterId) {
      const modifiedChapterCopy = {
        name: modifiedChapter.chapterName,
      };
      await updateChapter(chapterId, modifiedChapterCopy, session.data?.tokens?.access_token);
      await mutate(
        `${getAPIUrl()}chapters/course/${props.course_uuid}/meta?with_unpublished_activities=${withUnpublishedActivities}`,
      );
      await revalidateTags(['courses']);
      router.refresh();
    }
    setSelectedChapter(undefined);
  }

  return (
    <Draggable
      key={props.info.list.chapter.uuid}
      draggableId={String(props.info.list.chapter.uuid)}
      index={props.index}
    >
      {(provided, _snapshot) => (
        <div
          {...provided.dragHandleProps}
          {...provided.draggableProps}
          ref={provided.innerRef}
          className="mx-auto mb-5 block max-w-(--breakpoint-2xl) rounded-lg border border-white/[0.19] bg-white px-5 py-3 text-[15px] shadow-sm transition-all duration-200 ease-in-out [&_h3]:px-5"
          key={props.info.list.chapter.id}
        >
          <div className="flex items-center space-x-2 pt-3 pr-3 text-base font-bold">
            <div className="flex grow items-center space-x-3 rounded-md px-3 py-1 text-lg">
              <div className="rounded-md bg-neutral-100 p-2">
                <Hexagon
                  strokeWidth={3}
                  size={16}
                  className="text-neutral-600"
                />
              </div>

              <div className="flex items-center space-x-2">
                {selectedChapter === props.info.list.chapter.id ? (
                  <div className="chapter-modification-zone space-x-3 rounded-lg bg-neutral-100 px-4 py-1">
                    <input
                      type="text"
                      className="bg-transparent text-sm text-neutral-700 outline-hidden"
                      placeholder={t('chapterNamePlaceholder')}
                      value={modifiedChapter ? modifiedChapter?.chapterName : props.info.list.chapter.name}
                      onChange={(e) => {
                        setModifiedChapter({
                          chapterId: props.info.list.chapter.id,
                          chapterName: e.target.value,
                        });
                      }}
                    />
                    <button
                      onClick={() => updateChapterName(props.info.list.chapter.id)}
                      className="bg-transparent text-neutral-700 hover:cursor-pointer hover:text-neutral-900"
                    >
                      <Save
                        size={15}
                        onClick={() => updateChapterName(props.info.list.chapter.id)}
                      />
                    </button>
                  </div>
                ) : (
                  <p className="text-neutral-700 first-letter:uppercase">{props.info.list.chapter.name}</p>
                )}
                <Pencil
                  size={15}
                  className="text-neutral-600 hover:cursor-pointer"
                  onClick={() => {
                    setSelectedChapter(props.info.list.chapter.id);
                  }}
                />
              </div>
            </div>
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
                  <div className="flex items-center space-x-1 rounded-md bg-red-600 p-1 px-4 text-sm text-rose-100 shadow-sm hover:cursor-pointer">
                    <X
                      size={15}
                      className="font-bold text-rose-200"
                    />
                    <p>{t('deleteChapter')}</p>
                  </div>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400">
                    <AlertTriangle className="size-8" />
                  </AlertDialogMedia>
                  <AlertDialogTitle>{t('deleteChapterTitle', { name: props.info.list.chapter.name })}</AlertDialogTitle>
                  <AlertDialogDescription>{t('deleteChapterConfirmation')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel />
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDeleteChapter}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        {t('deleting')}
                      </div>
                    ) : (
                      t('deleteChapterButton')
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <Droppable
            key={props.info.list.chapter.id}
            droppableId={String(props.info.list.chapter.id)}
            type="activity"
          >
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="p-2.5"
              >
                <div className="flex flex-col">
                  {props.info.list.activities.map((activity: any, index: any) => (
                    <Activity
                      courseid={props.courseid}
                      key={activity.id}
                      activity={activity}
                      index={index}
                    />
                  ))}
                  {provided.placeholder}

                  <div
                    onClick={() => {
                      props.openNewActivityModal(props.info.list.chapter.id);
                    }}
                    className="my-3 flex items-center justify-center space-x-2 rounded-md bg-black py-5 text-white hover:cursor-pointer"
                  >
                    <Sparkles
                      className=""
                      size={17}
                    />
                    <div className="mx-auto my-auto items-center text-sm font-bold">{t('addActivityButton')} + </div>
                  </div>
                </div>
              </div>
            )}
          </Droppable>
        </div>
      )}
    </Draggable>
  );
};

export default Chapter;
