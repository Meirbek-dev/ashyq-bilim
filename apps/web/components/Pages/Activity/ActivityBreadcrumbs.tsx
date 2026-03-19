'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { getAbsoluteUrl } from '@services/config/config';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import { Book } from 'lucide-react';

interface ActivityBreadcrumbsProps {
  course: any;
  activity: any;
}

export default function ActivityBreadcrumbs({ course, activity }: ActivityBreadcrumbsProps) {
  const cleanCourseUuid = course.course_uuid?.replace('course_', '');
  const t = useTranslations('General');

  return (
    <div className="mb-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link href={`${getAbsoluteUrl('')}/courses`} />}
              className="flex items-center space-x-2"
            >
              <Book
                className="text-gray"
                size={14}
              />
              <span>{t('courses')}</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`${getAbsoluteUrl('')}/course/${cleanCourseUuid}`} />}>
              {course.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="first-letter:uppercase">{activity.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
