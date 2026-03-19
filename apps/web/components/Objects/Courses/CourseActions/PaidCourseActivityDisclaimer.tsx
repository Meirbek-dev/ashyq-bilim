import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';

import CoursePaidOptions from './CoursePaidOptions';

interface PaidCourseActivityProps {
  course: any;
}

const PaidCourseActivityDisclaimer = ({ course }: PaidCourseActivityProps) => {
  const t = useTranslations('Components.CourseParidActivityDisclaimer');
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-800" />
          <h3 className="font-semibold text-amber-800">{t('paidContent')}</h3>
        </div>
        <p className="mt-1 text-sm text-amber-700">{t('purchaseToAccess')}</p>
      </div>
      <CoursePaidOptions course={course} />
    </div>
  );
};

export default PaidCourseActivityDisclaimer;
