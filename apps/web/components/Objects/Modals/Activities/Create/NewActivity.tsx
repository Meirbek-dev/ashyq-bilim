'use client';

import { ArrowLeft, ClipboardList, Code2, FileText, GraduationCap, Sparkles, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';

import CodeChallenge from './NewActivityModal/CodeChallengeActivityModal';
import DocumentPdfModal from './NewActivityModal/DocumentActivityModal';
import DynamicCanvaModal from './NewActivityModal/DynamicActivityModal';
import Assignment from './NewActivityModal/AssignmentActivityModal';
import VideoModal from './NewActivityModal/VideoActivityModal';
import Exam from './NewActivityModal/ExamActivityModal';

type ViewType = 'home' | 'dynamic' | 'video' | 'documentpdf' | 'assignments' | 'exams' | 'codechallenge';

interface ActivityType {
  id: ViewType;
  labelKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
}

interface NewActivityModalProps {
  closeModal: () => void;
  submitActivity: (data?: any) => Promise<void>;
  submitFileActivity: (file: any, type: any, activity: any, chapterId: number) => Promise<void>;
  submitExternalVideo: (external_video_data: any, activity: any, chapterId: number) => Promise<void>;
  chapterId: number;
  course: unknown;
}

const ACTIVITY_TYPES: ActivityType[] = [
  {
    id: 'dynamic',
    labelKey: 'dynamicPage',
    descriptionKey: 'dynamicPageDesc',
    icon: Sparkles,
    iconColor: 'text-purple-700',
    iconBg: 'bg-purple-50',
  },
  {
    id: 'video',
    labelKey: 'video',
    descriptionKey: 'videoDesc',
    icon: Video,
    iconColor: 'text-red-700',
    iconBg: 'bg-red-50',
  },
  {
    id: 'documentpdf',
    labelKey: 'document',
    descriptionKey: 'documentDesc',
    icon: FileText,
    iconColor: 'text-blue-700',
    iconBg: 'bg-blue-50',
  },
  {
    id: 'assignments',
    labelKey: 'assignments',
    descriptionKey: 'assignmentsDesc',
    icon: ClipboardList,
    iconColor: 'text-amber-700',
    iconBg: 'bg-amber-50',
  },
  {
    id: 'exams',
    labelKey: 'exams',
    descriptionKey: 'examsDesc',
    icon: GraduationCap,
    iconColor: 'text-green-700',
    iconBg: 'bg-green-50',
  },
  {
    id: 'codechallenge',
    labelKey: 'codeChallenge',
    descriptionKey: 'codeChallengeDesc',
    icon: Code2,
    iconColor: 'text-teal-700',
    iconBg: 'bg-teal-50',
  },
];

export default function NewActivityModal({
  closeModal,
  submitActivity,
  submitFileActivity,
  submitExternalVideo,
  chapterId,
  course,
}: NewActivityModalProps) {
  const t = useTranslations('Components.NewActivity');
  const [selectedView, setSelectedView] = useState<ViewType>('home');

  const handleBack = useCallback(() => setSelectedView('home'), []);

  const sharedProps = { chapterId, course, closeModal };

  if (selectedView === 'home') {
    return (
      <div className="w-full space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-gray-400">{t('chooseType')}</p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ACTIVITY_TYPES.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              label={t(activity.labelKey)}
              description={t(activity.descriptionKey)}
              onClick={() => setSelectedView(activity.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-400 transition-colors hover:text-gray-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('backToActivities')}
      </button>

      {selectedView === 'dynamic' && (
        <DynamicCanvaModal
          submitActivity={submitActivity}
          {...sharedProps}
        />
      )}
      {selectedView === 'video' && (
        <VideoModal
          submitFileActivity={submitFileActivity}
          submitExternalVideo={submitExternalVideo}
          chapterId={chapterId}
          course={course}
        />
      )}
      {selectedView === 'documentpdf' && (
        <DocumentPdfModal
          submitFileActivity={submitFileActivity}
          chapterId={chapterId}
          course={course}
        />
      )}
      {selectedView === 'assignments' && (
        <Assignment
          submitActivity={submitActivity}
          {...sharedProps}
        />
      )}
      {selectedView === 'exams' && (
        <Exam
          submitActivity={submitActivity}
          {...sharedProps}
        />
      )}
      {selectedView === 'codechallenge' && (
        <CodeChallenge
          submitActivity={submitActivity}
          {...sharedProps}
        />
      )}
    </div>
  );
}

interface ActivityCardProps {
  activity: ActivityType;
  label: string;
  description: string;
  onClick: () => void;
}

function ActivityCard({ activity, label, description, onClick }: ActivityCardProps) {
  const Icon = activity.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3.5 rounded-lg border border-gray-200 bg-white px-4 py-4 text-left transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 focus:outline-none"
    >
      <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${activity.iconBg}`}>
        <Icon className={`h-[17px] w-[17px] ${activity.iconColor}`} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-800 group-hover:text-gray-900">{label}</span>
        <span className="text-xs leading-relaxed text-gray-400 group-hover:text-gray-500">{description}</span>
      </div>
    </button>
  );
}
