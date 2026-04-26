'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AnalyticsQuery, AssessmentOutlierRow, DrillThroughResponse } from '@/types/analytics';
import { getTeacherDrillThrough } from '@services/analytics/teacher';
import { ListFilter, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface DrillThroughAuditPanelProps {
  query: AnalyticsQuery;
  assessmentPreview: AssessmentOutlierRow[];
}

const displayValue = (value: unknown) => {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (value === null || value === undefined || value === '') return 'n/a';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
};

export default function DrillThroughAuditPanel({ query, assessmentPreview }: DrillThroughAuditPanelProps) {
  const [result, setResult] = useState<DrillThroughResponse | null>(null);
  const [loadingMetric, setLoadingMetric] = useState<DrillThroughResponse['metric'] | null>(null);
  const assessment = assessmentPreview.find((item) => item.pass_rate !== null) ?? assessmentPreview[0];

  const loadMetric = async (metric: DrillThroughResponse['metric']) => {
    setLoadingMetric(metric);
    try {
      const response = await getTeacherDrillThrough(
        metric,
        metric === 'pass_rate' && assessment
          ? {
              ...query,
              assessment_type: assessment.assessment_type,
              assessment_id: assessment.assessment_id,
            }
          : query,
      );
      setResult(response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load drill-through rows.');
    } finally {
      setLoadingMetric(null);
    }
  };

  const columns = result?.items[0] ? Object.keys(result.items[0]).slice(0, 6) : [];

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListFilter className="h-5 w-5" />
          <CardTitle>Drill-through audit trail</CardTitle>
        </div>
        <CardDescription>Inspect the learner or submission rows behind headline metrics.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(['active_learners', 'completion_rate', 'backlog'] as const).map((metric) => (
            <Button
              key={metric}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadMetric(metric)}
              disabled={loadingMetric !== null}
            >
              <Search className="h-3.5 w-3.5" />
              {metric.replaceAll('_', ' ')}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadMetric('pass_rate')}
            disabled={loadingMetric !== null || !assessment}
          >
            <Search className="h-3.5 w-3.5" />
            pass rate
          </Button>
        </div>

        {result ? (
          <div className="space-y-2">
            <Badge variant="outline">
              {result.metric.replaceAll('_', ' ')}: {result.total} rows
            </Badge>
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>{column.replaceAll('_', ' ')}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.slice(0, 8).map((item, index) => (
                  <TableRow key={`${result.metric}-${index}`}>
                    {columns.map((column) => (
                      <TableCell
                        key={column}
                        className="max-w-[220px] truncate"
                      >
                        {displayValue(item[column])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!result.items.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={Math.max(columns.length, 1)}
                      className="text-muted-foreground"
                    >
                      No source rows found for this metric.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">Choose a metric to load its source rows.</div>
        )}
      </CardContent>
    </Card>
  );
}
