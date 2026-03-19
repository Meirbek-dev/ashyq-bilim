import { getAtRiskLearners, normalizeAnalyticsQuery } from '@services/analytics/teacher';
import AtRiskLearnersTable from '@components/Dashboard/Analytics/AtRiskLearnersTable';
import AnalyticsEmptyState from '@components/Dashboard/Analytics/AnalyticsEmptyState';
import TeacherFilterBar from '@components/Dashboard/Analytics/TeacherFilterBar';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { auth } from '@/auth';
import Link from 'next/link';

export default function PlatformAnalyticsAtRiskPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PlatformAnalyticsAtRiskPageInner searchParams={props.searchParams} />;
}

async function PlatformAnalyticsAtRiskPageInner(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const accessToken = session?.tokens?.access_token;
  const query = normalizeAnalyticsQuery(await props.searchParams);
  const t = await getTranslations('TeacherAnalytics');

  if (!accessToken) {
    return (
      <AnalyticsEmptyState
        title={t('pages.atRiskUnavailableTitle')}
        description={t('pages.atRiskUnavailableDesc')}
      />
    );
  }

  try {
    const risk = await getAtRiskLearners(accessToken, query);
    const totalPages = Math.max(1, Math.ceil(risk.total / risk.page_size));
    const params = new URLSearchParams();
    if (query.window) params.set('window', query.window);
    if (query.compare) params.set('compare', query.compare);
    if (query.bucket) params.set('bucket', query.bucket);
    if (query.course_ids) params.set('course_ids', query.course_ids);
    if (query.cohort_ids) params.set('cohort_ids', query.cohort_ids);
    if (query.timezone) params.set('timezone', query.timezone);
    if (query.sort_by) params.set('sort_by', query.sort_by);
    if (query.sort_order) params.set('sort_order', query.sort_order);

    return (
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-6 xl:px-8">
        <TeacherFilterBar
          path="/dash/analytics/learners/at-risk"
          query={query}
          courseCount={risk.course_options.length}
          courseOptions={risk.course_options}
          cohortOptions={risk.cohort_options}
        />
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {t('table.showingRows', {
              from: (risk.page - 1) * risk.page_size + 1,
              to: Math.min(risk.page * risk.page_size, risk.total),
              total: risk.total,
            })}
          </span>
        </div>
        <AtRiskLearnersTable
          rows={risk.items}
          title={t('pages.atRiskPageTitle')}
          description={t('pages.atRiskPageDescription', { total: risk.total })}
          storageKey="at-risk-page"
          serverPaginated
        />
        {totalPages > 1 ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={risk.page <= 1}
              render={
                <Link
                  href={`/dash/analytics/learners/at-risk?${new URLSearchParams({ ...Object.fromEntries(params.entries()), page: String(Math.max(1, risk.page - 1)), page_size: String(risk.page_size) }).toString()}`}
                />
              }
            >
              {t('table.prev')}
            </Button>
            <span className="text-sm text-slate-600">{t('table.page', { current: risk.page, total: totalPages })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={risk.page >= totalPages}
              render={
                <Link
                  href={`/dash/analytics/learners/at-risk?${new URLSearchParams({ ...Object.fromEntries(params.entries()), page: String(Math.min(totalPages, risk.page + 1)), page_size: String(risk.page_size) }).toString()}`}
                />
              }
            >
              {t('table.next')}
            </Button>
          </div>
        ) : null}
      </div>
    );
  } catch (error) {
    return (
      <AnalyticsEmptyState
        title={t('pages.atRiskUnavailableTitle')}
        description={error instanceof Error ? error.message : t('pages.atRiskLoadError')}
      />
    );
  }
}
