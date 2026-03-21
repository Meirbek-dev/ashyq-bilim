'use client';

import { getCoursesLinkedToProduct, linkCourseToProduct } from '@services/payments/products';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { getPaymentsProductsSwrKey } from '@services/payments/keys';
import { getCourses } from '@services/courses/courses';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { useState } from 'react';
import { toast } from 'sonner';

interface LinkCourseModalProps {
  productId: string;
  onSuccess: () => void;
}

interface CoursePreviewProps {
  course: {
    id: number;
    name: string;
    description: string;
    thumbnail_image: string;
    course_uuid: string;
  };
  onLink: (courseId: number) => void;
  isLinked: boolean;
}

const CoursePreview = ({ course, onLink, isLinked }: CoursePreviewProps) => {
  const platform = usePlatform() as any;
  const t = useTranslations('Payments.LinkCourseModal');

  const thumbnailImage = course.thumbnail_image
    ? getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)
    : '../empty_thumbnail.webp';

  return (
    <div className="flex gap-4 rounded-lg border border-gray-100 bg-white p-4 transition-colors hover:border-gray-200">
      {/* Thumbnail */}
      <div
        className="h-[68px] w-[120px] shrink-0 rounded-md bg-cover bg-center ring-1 ring-black/10 ring-inset"
        style={{ backgroundImage: `url(${thumbnailImage})` }}
      />

      {/* Content */}
      <div className="grow space-y-1">
        <h3 className="line-clamp-1 font-medium text-foreground">{course.name}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{course.description}</p>
      </div>

      {/* Action Button */}
      <div className="flex shrink-0 items-center">
        {isLinked ? (
          <Button
            variant="outline"
            size="sm"
            disabled
            className="text-muted-foreground"
          >
            {t('alreadyLinked')}
          </Button>
        ) : (
          <Button
            onClick={() => {
              onLink(course.id);
            }}
            size="sm"
          >
            {t('linkCourseButton')}
          </Button>
        )}
      </div>
    </div>
  );
};

export default function LinkCourseModal({ productId, onSuccess }: LinkCourseModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const session = usePlatformSession() as any;
  const accessToken = session?.data?.tokens?.access_token;
  const tNotify = useTranslations('DashPage.Notifications');
  const t = useTranslations('DashPage.Payments.LinkCourseModal');

  const PRODUCTS_KEY = getPaymentsProductsSwrKey();

  const { data: coursesData, error: coursesError } = useSWR(
    () => (accessToken ? ['platform-courses', accessToken] : null),
    ([, token]) => getCourses(null, token),
  );

  const courses = coursesData?.courses;

  const { data: linkedCoursesData, error: linkedCoursesError } = useSWR(
    () => (accessToken ? [`/payments/products/${productId}/courses`, accessToken] : null),
    ([_, token]) => getCoursesLinkedToProduct(productId, token),
  );

  const handleLinkCourse = async (courseId: number) => {
    try {
      const response = await linkCourseToProduct(productId, courseId, accessToken);
      if (response.success) {
        mutate([getPaymentsProductsSwrKey(), accessToken]);
        toast.success(tNotify('courseLinkedSuccess'));
        onSuccess();
      } else {
        toast.error(
          tNotify('errors.linkCourseFailed', {
            error: response.data?.detail || '',
          }),
        );
      }
    } catch {
      toast.error(tNotify('errors.linkCourseFailed', { error: '' }));
    }
  };

  const isLinked = (courseId: number): boolean => {
    return Boolean(linkedCoursesData?.data?.some((course: any) => course.id === courseId));
  };

  const filteredCourses =
    courses?.filter(
      (course: any) =>
        course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.description.toLowerCase().includes(searchTerm.toLowerCase()),
    ) || [];

  return (
    <div className="space-y-4">
      <div className="relative px-3">
        <Input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
          }}
          className="w-full pl-10"
        />
        <Search
          className="absolute top-1/2 left-6 -translate-y-1/2 text-muted-foreground"
          size={20}
        />
      </div>

      <div className="max-h-[400px] space-y-2 overflow-y-auto px-3">
        {filteredCourses.map((course: any) => (
          <CoursePreview
            key={course.course_uuid}
            course={course}
            onLink={handleLinkCourse}
            isLinked={isLinked(course.id)}
          />
        ))}

        {filteredCourses.length === 0 && (
          <div className="py-6 text-center text-muted-foreground">{t('noCoursesFound')}</div>
        )}
      </div>
    </div>
  );
}
