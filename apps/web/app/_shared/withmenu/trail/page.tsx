import { getServerGamificationDashboard, getServerLeaderboard } from '@/services/gamification/server';
import { GamificationProvider } from '@/components/Contexts/GamificationContext';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import Trail from './trail';

interface MetadataProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const t = await getTranslations('TrailPage');

  return {
    title: `${t('title')} - Ashyq Bilim`,
    description: t('metaDescription'),
  };
}

const TrailPage = async () => {
  const content = (
    <div>
      <Trail />
    </div>
  );

  const [dashboardData, leaderboardData] = await Promise.all([
    getServerGamificationDashboard(),
    getServerLeaderboard(10),
  ]);

  if (!dashboardData) {
    return content;
  }

  return (
    <GamificationProvider
      initialData={{
        profile: dashboardData.profile,
        dashboard: dashboardData,
        leaderboard: leaderboardData ?? null,
      }}
    >
      {content}
    </GamificationProvider>
  );
};

export default TrailPage;
