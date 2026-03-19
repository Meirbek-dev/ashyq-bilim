import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getCourseContributors } from '@services/courses/courses';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useEffectEvent } from 'react';
import { toast } from 'sonner';

export type ContributorStatus = 'NONE' | 'PENDING' | 'ACTIVE' | 'INACTIVE';

interface Contributor {
  user_id: number;
  authorship_status: ContributorStatus;
}

export function useContributorStatus(courseUuid: string) {
  const session = usePlatformSession();
  const [contributorStatus, setContributorStatus] = useState<ContributorStatus>('NONE');
  const [isLoading, setIsLoading] = useState(true);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const t = useTranslations('Hooks.useContributorStatus');
  const accessToken = session?.data?.tokens?.access_token;
  const userId = session?.data?.user?.id;

  // Use Effect Event for the fetch logic that should read latest values
  // without causing the effect to re-run when accessToken or t changes
  const onCheckStatus = useEffectEvent(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await getCourseContributors(
        courseUuid.startsWith('course_') ? courseUuid : `course_${courseUuid}`,
        accessToken,
      );

      if (response?.data && Array.isArray(response.data)) {
        const currentUser = response.data.find((contributor: Contributor) => contributor.user_id === userId);

        if (currentUser) {
          setContributorStatus(currentUser.authorship_status as ContributorStatus);
        } else {
          setContributorStatus('NONE');
        }
      } else {
        setContributorStatus('NONE');
      }
    } catch (error) {
      console.error(`${t('checkStatusError')}: ${error}`);
      toast.error(t('checkStatusError'));
      setContributorStatus('NONE');
    } finally {
      setIsLoading(false);
    }
  });

  // Effect runs only when userId, courseUuid, or manual refetch trigger changes
  useEffect(() => {
    if (userId) {
      onCheckStatus();
    }
  }, [userId, courseUuid, refetchTrigger]);

  // Stable refetch function that triggers the effect
  function refetch() {
    setRefetchTrigger((prev) => prev + 1);
  }

  return { contributorStatus, isLoading, refetch };
}
