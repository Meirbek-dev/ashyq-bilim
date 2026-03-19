'use client';

import { getCoursesLinkedToProduct, unlinkCourseFromProduct } from '@services/payments/products';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import Modal from '@/components/Objects/Elements/Modal/Modal';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { Button } from '@components/ui/button';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { toast } from 'sonner';

import { getPaymentsProductsSwrKey, getProductLinkedCoursesSwrKey } from '@services/payments/keys';
import LinkCourseModal from './LinkCourseModal';

interface ProductLinkedCoursesProps {
  productId: string;
}

export default function ProductLinkedCourses({ productId }: ProductLinkedCoursesProps) {
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const session = usePlatformSession() as any;
  const accessToken = session?.data?.tokens?.access_token;
  const tNotify = useTranslations('DashPage.Notifications');
  const t = useTranslations('DashPage.Payments.LinkedCourses');

  // Use SWR to fetch linked courses
  const LINKED_COURSES_KEY = productId ? getProductLinkedCoursesSwrKey(productId) : null;
  const PRODUCTS_KEY = getPaymentsProductsSwrKey();

  const {
    data: linkedCourses,
    mutate: mutateLinkedCourses,
    error,
  } = useSWR(LINKED_COURSES_KEY && accessToken ? [LINKED_COURSES_KEY, accessToken] : null, async ([, token]) => {
    const response = await getCoursesLinkedToProduct(productId, token);
    return response.data || [];
  });

  // Show error toast if fetch fails
  useEffect(() => {
    if (error) {
      toast.error(tNotify('errors.fetchLinkedCoursesFailed'));
    }
  }, [error, tNotify]);

  const handleUnlinkCourse = async (courseId: string) => {
    if (!linkedCourses) return;

    const prev = linkedCourses;
    // Optimistically remove from local list
    await mutateLinkedCourses(
      prev.filter((c: any) => c.id !== courseId),
      false,
    );

    try {
      const response = await unlinkCourseFromProduct(productId, courseId, accessToken);
      if (response.success) {
        // Revalidate products list and linked courses list from server
        mutate([PRODUCTS_KEY, accessToken]);
        mutateLinkedCourses();
        toast.success(tNotify('courseUnlinkedSuccess'));
      } else {
        // rollback
        mutateLinkedCourses(prev, false);
        toast.error(
          tNotify('errors.unlinkCourseFailed', {
            error: response.data?.detail || '',
          }),
        );
      }
    } catch {
      // rollback
      mutateLinkedCourses(prev, false);
      toast.error(tNotify('errors.unlinkCourseFailed', { error: '' }));
    }
  };

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
        <Modal
          isDialogOpen={isLinkModalOpen}
          onOpenChange={setIsLinkModalOpen}
          dialogTitle={t('linkModalTitle')}
          dialogDescription={t('linkModalDescription')}
          dialogContent={
            <LinkCourseModal
              productId={productId}
              onSuccess={() => {
                setIsLinkModalOpen(false);
                mutateLinkedCourses();
              }}
            />
          }
          dialogTrigger={
            <span>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Plus size={16} />
                <span>{t('linkCourseButton')}</span>
              </Button>
            </span>
          }
        />
      </div>

      <div className="space-y-2">
        {!linkedCourses || linkedCourses.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen size={16} />
            <span>{t('noCoursesLinked')}</span>
          </div>
        ) : (
          linkedCourses.map((course: { id: string; name: string }) => (
            <div
              key={course.id}
              className="flex items-center justify-between rounded-md bg-muted p-2"
            >
              <span className="text-sm font-medium">{course.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleUnlinkCourse(course.id)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
