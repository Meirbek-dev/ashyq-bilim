import { getActivityMediaDirectory } from '@services/media/media';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { useTranslations } from 'next-intl';

const DocumentPdfActivity = ({ activity, course }: { activity: any; course: any }) => {
  const t = useTranslations('Activities.DocumentPdf');
  const org = usePlatform() as any;

  return (
    <div className="m-8 mt-14 rounded-md bg-zinc-900">
      <iframe
        className="h-[900px] w-full rounded-lg"
        title={t('viewerTitle')}
        src={getActivityMediaDirectory(
          course?.course_uuid,
          activity.activity_uuid,
          activity.content.filename,
          'documentpdf',
        )}
      />
    </div>
  );
};

export default DocumentPdfActivity;
