'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TeacherAssessmentDetailResponse } from '@/types/analytics';
import { useLocale, useTranslations } from 'next-intl';

interface AssessmentOperationsPanelProps {
  detail: TeacherAssessmentDetailResponse;
}

function formatHours(value: number | null | undefined, emptyLabel: string) {
  if (value === null || value === undefined) {
    return emptyLabel;
  }

  return `${value.toFixed(1)}h`;
}

function getSloBadgeVariant(status: TeacherAssessmentDetailResponse['slo']['status']) {
  switch (status) {
    case 'healthy': {
      return 'success';
    }
    case 'warning': {
      return 'warning';
    }
    case 'breached': {
      return 'destructive';
    }
    default: {
      return 'outline';
    }
  }
}

function getMigrationBadgeVariant(mode: TeacherAssessmentDetailResponse['migration']['compatibility_mode']) {
  switch (mode) {
    case 'canonical': {
      return 'success';
    }
    case 'dual_write': {
      return 'warning';
    }
    default: {
      return 'destructive';
    }
  }
}

export default function AssessmentOperationsPanel({ detail }: AssessmentOperationsPanelProps) {
  const t = useTranslations('TeacherAnalytics');
  const locale = useLocale();

  const diagnosticMetrics = [
    { label: t('pages.assessmentOpsAttempts'), value: detail.diagnostics.total_attempt_records },
    { label: t('pages.assessmentOpsDrafts'), value: detail.diagnostics.draft_attempts },
    { label: t('pages.assessmentOpsAwaiting'), value: detail.diagnostics.awaiting_grading },
    { label: t('pages.assessmentOpsHeld'), value: detail.diagnostics.graded_not_released },
    { label: t('pages.assessmentOpsReturned'), value: detail.diagnostics.returned_for_resubmission },
    { label: t('pages.assessmentOpsReleased'), value: detail.diagnostics.released },
    { label: t('pages.assessmentOpsLate'), value: detail.diagnostics.late_submissions },
    { label: t('pages.assessmentOpsBacklog'), value: detail.diagnostics.stale_backlog },
    { label: t('pages.assessmentOpsSuspicious'), value: detail.diagnostics.suspicious_attempts },
    { label: t('pages.assessmentOpsMissingScores'), value: detail.diagnostics.missing_scores },
  ];

  const sloLabels: Record<TeacherAssessmentDetailResponse['slo']['status'], string> = {
    healthy: t('pages.assessmentOpsSloStatusHealthy'),
    warning: t('pages.assessmentOpsSloStatusWarning'),
    breached: t('pages.assessmentOpsSloStatusBreached'),
    not_applicable: t('pages.assessmentOpsSloStatusNotApplicable'),
  };

  const migrationLabels: Record<TeacherAssessmentDetailResponse['migration']['compatibility_mode'], string> = {
    canonical: t('pages.assessmentOpsMigrationModeCanonical'),
    dual_write: t('pages.assessmentOpsMigrationModeDualWrite'),
    legacy_only: t('pages.assessmentOpsMigrationModeLegacyOnly'),
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="border-slate-200 bg-white/90 shadow-sm xl:col-span-2">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={detail.diagnostics.manual_grading_required ? 'warning' : 'outline'}>
              {detail.diagnostics.manual_grading_required
                ? t('pages.assessmentOpsDiagnosticsManual')
                : t('pages.assessmentOpsDiagnosticsAuto')}
            </Badge>
            <Badge variant={getSloBadgeVariant(detail.slo.status)}>{sloLabels[detail.slo.status]}</Badge>
            <Badge variant={getMigrationBadgeVariant(detail.migration.compatibility_mode)}>
              {migrationLabels[detail.migration.compatibility_mode]}
            </Badge>
          </div>
          <CardTitle>{t('pages.assessmentOpsTitle')}</CardTitle>
          <p className="text-sm text-slate-500">{t('pages.assessmentOpsDescription')}</p>
        </CardHeader>
      </Card>

      <Card className="border-slate-200 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle>{t('pages.assessmentOpsDiagnosticsTitle')}</CardTitle>
          {detail.diagnostics.note ? <p className="text-sm text-slate-500">{detail.diagnostics.note}</p> : null}
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {diagnosticMetrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
            >
              <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{metric.label}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{metric.value}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getSloBadgeVariant(detail.slo.status)}>{sloLabels[detail.slo.status]}</Badge>
            </div>
            <CardTitle>{t('pages.assessmentOpsSloTitle')}</CardTitle>
            <p className="text-sm text-slate-500">{detail.slo.note}</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.assessmentOpsSloTarget')}</div>
              <div className="mt-2 text-2xl font-semibold">{formatHours(detail.slo.target_hours, t('atRisk.na'))}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.assessmentOpsSloP50')}</div>
              <div className="mt-2 text-2xl font-semibold">
                {formatHours(detail.slo.observed_p50_hours, t('atRisk.na'))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.assessmentOpsSloP90')}</div>
              <div className="mt-2 text-2xl font-semibold">
                {formatHours(detail.slo.observed_p90_hours, t('atRisk.na'))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs tracking-wide text-slate-500 uppercase">{t('pages.assessmentOpsSloBacklog')}</div>
              <div className="mt-2 text-2xl font-semibold">{detail.slo.backlog_count}</div>
              <div className="mt-1 text-xs text-slate-500">
                {t('pages.assessmentOpsSloOverdue')}: {detail.slo.overdue_backlog_count}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getMigrationBadgeVariant(detail.migration.compatibility_mode)}>
                {migrationLabels[detail.migration.compatibility_mode]}
              </Badge>
              <Badge variant={detail.migration.cutover_ready ? 'success' : 'warning'}>
                {detail.migration.cutover_ready
                  ? t('pages.assessmentOpsMigrationCutoverReady')
                  : t('pages.assessmentOpsMigrationCutoverBlocked')}
              </Badge>
            </div>
            <CardTitle>{t('pages.assessmentOpsMigrationTitle')}</CardTitle>
            <p className="text-sm text-slate-500">{detail.migration.note}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs tracking-wide text-slate-500 uppercase">
                  {t('pages.assessmentOpsMigrationCanonicalRows')}
                </div>
                <div className="mt-2 text-2xl font-semibold">{detail.migration.canonical_row_count}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs tracking-wide text-slate-500 uppercase">
                  {t('pages.assessmentOpsMigrationLegacyRows')}
                </div>
                <div className="mt-2 text-2xl font-semibold">{detail.migration.legacy_row_count}</div>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                {t('pages.assessmentOpsMigrationLegacySources')}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {detail.migration.legacy_sources.length ? (
                  detail.migration.legacy_sources.map((source) => (
                    <Badge
                      key={source}
                      variant="outline"
                    >
                      {source}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">{t('atRisk.na')}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white/90 shadow-sm xl:col-span-2">
        <CardHeader>
          <CardTitle>{t('pages.assessmentOpsAuditTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.audit_history.length ? (
            <div className="space-y-3">
              {detail.audit_history.map((event) => (
                <div
                  key={event.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{event.source}</Badge>
                    {event.status ? <Badge variant="secondary">{event.status}</Badge> : null}
                  </div>
                  <div className="mt-3 text-sm font-medium text-slate-900">{event.summary}</div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span>{event.actor_display_name || t('pages.assessmentOpsAuditSystem')}</span>
                    <span>{new Date(event.occurred_at).toLocaleString(locale)}</span>
                    {event.affected_count !== null && event.affected_count !== undefined ? (
                      <span>
                        {t('pages.assessmentOpsAuditAffected')}: {event.affected_count}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">{t('pages.assessmentOpsAuditEmpty')}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
