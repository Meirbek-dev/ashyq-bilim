'use client';

import { useMemo, useState } from 'react';

import PageLoading from '@components/Objects/Loaders/PageLoading';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ExamSettings from '@/components/Activities/ExamActivity/ExamSettings';
import QuestionManagement from '@/components/Activities/ExamActivity/QuestionManagement';
import { useExamActivity, useExamQuestions } from '@/features/exams/hooks/useExam';
import type { KindAuthorProps } from './index';

export default function ExamAuthor({ activityUuid, courseUuid }: KindAuthorProps) {
  const [activeTab, setActiveTab] = useState('questions');
  const { data: exam, isLoading: isExamLoading, refetch: refetchExam } = useExamActivity(activityUuid);
  const examUuid = (exam as { exam_uuid?: string } | null | undefined)?.exam_uuid ?? null;
  const { data: questions, isLoading: isQuestionsLoading, refetch: refetchQuestions } = useExamQuestions(examUuid);
  const questionList = useMemo(() => (Array.isArray(questions) ? questions : []), [questions]);

  if (isExamLoading || isQuestionsLoading) return <PageLoading />;

  if (!exam || !examUuid) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        Exam data is unavailable for this activity.
      </div>
    );
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => value && setActiveTab(value)}
      className="space-y-5 p-4 lg:p-6"
    >
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="questions">Questions</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="questions">
        <QuestionManagement
          examUuid={examUuid}
          questions={questionList}
          onQuestionsChange={() => {
            void refetchQuestions();
          }}
        />
      </TabsContent>

      <TabsContent value="settings">
        <ExamSettings
          exam={exam}
          courseUuid={courseUuid}
          onSettingsUpdated={() => {
            void refetchExam();
          }}
        />
      </TabsContent>
    </Tabs>
  );
}
