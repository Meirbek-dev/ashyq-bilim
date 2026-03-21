'use client';

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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@components/ui/form';
import { createCourseUpdate, deleteCourseUpdate } from '@services/courses/updates';
import { AlertTriangle, Loader2, PencilLine, Rss, TentTree } from 'lucide-react';
import { useEffectEvent, useLayoutEffect, useState, useTransition } from 'react';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { Actions, Resources, Scopes } from '@/types/permissions';
import { getCourseUpdatesSwrKey } from '@services/courses/keys';
import { useCourse } from '@components/Contexts/CourseContext';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { useDateFnsLocale } from '@/hooks/useDateFnsLocale';
import { swrFetcher } from '@services/utils/ts/requests';
import { usePermissions } from '@/components/Security';
import { format, formatDistanceToNow } from 'date-fns';
import { Textarea } from '@components/ui/textarea';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { motion } from 'motion/react';
import useSWR, { mutate } from 'swr';
import { toast } from 'sonner';
import * as v from 'valibot';

const CourseUpdates = () => {
  const course = useCourse();
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const UPDATES_KEY = course?.courseStructure?.course_uuid
    ? getCourseUpdatesSwrKey(course?.courseStructure?.course_uuid)
    : null;
  const { data: updates } = useSWR(UPDATES_KEY && access_token ? [UPDATES_KEY, access_token] : null, ([url, token]) =>
    swrFetcher(url, token),
  );
  const [isModelOpen, setIsModelOpen] = useState(false);
  const t = useTranslations('Courses.CourseUpdates');

  function handleModelOpen() {
    setIsModelOpen(!isModelOpen);
  }

  // if user clicks outside the model, close the model
  const handleClickOutside = useEffectEvent((event: any) => {
    if (event.target.closest('.bg-white') || event.target.id === 'delete-update-button') return;
    setIsModelOpen(false);
  });

  useLayoutEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="soft-shadow relative z-20 rounded-full bg-white px-5 py-1 transition-all ease-linear hover:bg-neutral-50">
      <div
        onClick={handleModelOpen}
        className="flex items-center space-x-2 font-normal text-gray-600 hover:cursor-pointer"
      >
        <div>
          <Rss size={16} />
        </div>
        <div className="flex items-center space-x-2">
          <span>{t('updates')}</span>
          {updates ? (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-900">
              {updates.length}
            </span>
          ) : null}
        </div>
      </div>
      {isModelOpen ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: 'spring',
            stiffness: 1300,
            damping: 70,
          }}
          style={{ position: 'absolute', top: '130%', right: 0 }}
        >
          <UpdatesSection />
        </motion.div>
      ) : null}
    </div>
  );
};

const UpdatesSection = () => {
  const [selectedView, setSelectedView] = useState('list');
  const { can } = usePermissions();
  const canUpdateCourse =
    can(Actions.UPDATE, Resources.COURSE, Scopes.OWN) || can(Actions.UPDATE, Resources.COURSE, Scopes.PLATFORM);
  const t = useTranslations('Courses.CourseUpdates');
  return (
    <div className="soft-shadow w-[700px] overflow-hidden rounded-lg bg-white/95 backdrop-blur-md">
      <div className="flex justify-between rounded-lg bg-gray-50/70 outline-1 outline-neutral-200/40">
        <div className="flex items-center space-x-2 px-4 py-2 font-bold text-gray-500">
          <Rss size={16} />
          <span>{t('updates')}</span>
        </div>
        {canUpdateCourse ? (
          <div
            onClick={() => {
              setSelectedView('new');
            }}
            className="flex cursor-pointer items-center space-x-2 bg-gray-100 px-4 py-2 text-xs font-medium outline-1 outline-neutral-200/40 hover:bg-gray-200"
          >
            <PencilLine size={14} />
            <span>{t('newUpdate')}</span>
          </div>
        ) : null}
      </div>
      <div className="">
        {selectedView === 'list' && <UpdatesListView />}
        {selectedView === 'new' && <NewUpdateForm setSelectedView={setSelectedView} />}
      </div>
    </div>
  );
};

const createUpdateFormSchema = (t: (key: string) => string) =>
  v.object({
    title: v.pipe(v.string(), v.minLength(1, t('titleRequired'))),
    content: v.pipe(v.string(), v.minLength(1, t('contentRequired'))),
  });

type UpdateFormValues = v.InferOutput<ReturnType<typeof createUpdateFormSchema>>;

const NewUpdateForm = ({ setSelectedView }: any) => {
  const course = useCourse();
  const session = usePlatformSession() as any;
  const t = useTranslations('Courses.CourseUpdates');
  const validationSchema = createUpdateFormSchema(t);

  const form = useForm<UpdateFormValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      title: '',
      content: '',
    },
  });

  const onSubmit = async (values: UpdateFormValues) => {
    const body = {
      title: values.title,
      content: values.content,
      course_uuid: course.courseStructure.course_uuid,
    };
    const UPDATES_KEY = getCourseUpdatesSwrKey(course.courseStructure.course_uuid);

    const optimistic = {
      id: `temp-${Date.now()}`,
      title: values.title,
      content: values.content,
      creation_date: new Date().toISOString(),
    };

    // Optimistically add the update to the list
    await mutate(
      [UPDATES_KEY, session.data?.tokens?.access_token] as any,
      (prev: any) => [optimistic, ...(prev || [])],
      false,
    );

    const res = await createCourseUpdate(body, session.data?.tokens?.access_token);
    if (res.status === 200) {
      toast.success(t('updateAddedSuccess'));
      setSelectedView('list');
      form.reset();
      // Revalidate to get the actual server-side object and remove optimistic placeholder
      mutate([UPDATES_KEY, session.data?.tokens?.access_token] as any);
    } else {
      // Rollback by revalidating
      mutate([UPDATES_KEY, session.data?.tokens?.access_token] as any);
      toast.error(t('updateAddFailed'));
    }
  };

  return (
    <div className="soft-shadow flex w-[700px] flex-col -space-y-2 overflow-hidden rounded-lg bg-white/95 backdrop-blur-md">
      <div className="flex flex-col -space-y-2 px-4 pt-4">
        <div className="rounded-full px-3 py-0.5 text-xs font-semibold text-gray-500">{t('testCourse')}</div>
        <div className="rounded-full px-3 py-0.5 text-lg font-bold text-black">{t('addNewCourseUpdate')}</div>
      </div>
      <div className="-py-2 px-5">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">{t('title')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      style={{ backgroundColor: 'white' }}
                      type="text"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">{t('content')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      style={{ backgroundColor: 'white', height: '100px' }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end py-2">
              <button
                type="button"
                onClick={() => setSelectedView('list')}
                className="rounded-md px-4 py-2 text-sm font-semibold text-gray-500 antialiased"
              >
                {t('cancel')}
              </button>
              <Button
                type="submit"
                className="rounded-md px-4 py-2 text-sm font-semibold antialiased"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? t('adding') : t('addUpdate')}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
};

const UpdatesListView = () => {
  const course = useCourse();
  const session = usePlatformSession() as any;
  const { can } = usePermissions();
  const canUpdateCourse =
    can(Actions.UPDATE, Resources.COURSE, Scopes.OWN) || can(Actions.UPDATE, Resources.COURSE, Scopes.PLATFORM);
  const access_token = session?.data?.tokens?.access_token;
  const UPDATES_KEY = course?.courseStructure?.course_uuid
    ? getCourseUpdatesSwrKey(course?.courseStructure?.course_uuid)
    : null;
  const { data: updates } = useSWR(UPDATES_KEY && access_token ? [UPDATES_KEY, access_token] : null, ([url, token]) =>
    swrFetcher(url, token),
  );
  const t = useTranslations('Courses.CourseUpdates');
  const locale = useDateFnsLocale();

  return (
    <div className="max-h-[400px] overflow-y-auto bg-white px-5">
      {updates
        ? updates.map((update: any) => (
            <div
              key={update.id}
              className="border-b border-neutral-200 py-2 antialiased"
            >
              <div className="flex items-center justify-between space-x-2 font-semibold text-gray-500">
                <div className="flex items-center space-x-2">
                  <span> {update.title}</span>{' '}
                  <span
                    title={
                      t('createdAtTooltipPrefix') + format(new Date(update.creation_date), 'MMMM d, yyyy', { locale })
                    }
                    className="text-xs font-semibold text-gray-300"
                  >
                    {formatDistanceToNow(new Date(update.creation_date), { addSuffix: true, locale })}
                  </span>
                </div>
                {canUpdateCourse ? <DeleteUpdateButton update={update} /> : null}
              </div>
              <div className="text-gray-600">{update.content}</div>
            </div>
          ))
        : null}
      {(!updates || updates.length === 0) && (
        <div className="my-10 flex flex-col space-y-2 py-2 text-center text-gray-500">
          <TentTree
            className="mx-auto"
            size={40}
          />
          <p>{t('noUpdatesYet')}</p>
        </div>
      )}
    </div>
  );
};

const DeleteUpdateButton = ({ update }: any) => {
  const session = usePlatformSession() as any;
  const course = useCourse();
  const t = useTranslations('Courses.CourseUpdates');
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteCourseUpdate(
        course.courseStructure.course_uuid,
        update.courseupdate_uuid,
        session.data?.tokens?.access_token,
      );
      const toast_loading = toast.loading(t('deletingUpdate'));
      if (res.status === 200) {
        toast.dismiss(toast_loading);
        toast.success(t('successfullDelete'));
        mutate([getCourseUpdatesSwrKey(course?.courseStructure.course_uuid), session.data?.tokens?.access_token]);
        setIsOpen(false);
      } else {
        toast.dismiss(toast_loading);
        toast.error(t('failedDelete'));
      }
    });
  }

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <AlertDialogTrigger
        render={
          <div
            id="delete-update-button"
            className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-600 hover:cursor-pointer"
          >
            {t('delete')}
          </div>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400">
            <AlertTriangle className="size-8" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('deleteUpdate')}</AlertDialogTitle>
          <AlertDialogDescription>{t('areYouSureYouWantToDeleteThisUpdate')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? (
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {t('deleting')}
              </div>
            ) : (
              t('deleteUpdate')
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CourseUpdates;
