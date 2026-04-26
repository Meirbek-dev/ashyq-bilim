'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TeacherWorkloadSummary } from '@/types/analytics';
import { Clock4, Inbox, TimerReset } from 'lucide-react';
import { useLocale } from 'next-intl';

interface TeacherWorkloadPanelProps {
  workload: TeacherWorkloadSummary;
}

export default function TeacherWorkloadPanel({ workload }: TeacherWorkloadPanelProps) {
  const locale = useLocale();
  const numberFormatter = new Intl.NumberFormat(locale);
  const hours = (value: number | null | undefined) =>
    value === null || value === undefined ? 'n/a' : `${numberFormatter.format(value)}h`;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          <CardTitle>Teacher workload</CardTitle>
        </div>
        <CardDescription>Review backlog, SLA pressure, feedback latency, and near-term load forecast.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="bg-muted rounded-lg border p-4">
            <div className="text-muted-foreground flex items-center gap-2 text-xs tracking-wider uppercase">
              <Inbox className="h-3.5 w-3.5" />
              Backlog
            </div>
            <div className="text-foreground mt-2 text-2xl font-semibold">{numberFormatter.format(workload.backlog_total)}</div>
          </div>
          <div className="bg-muted rounded-lg border p-4">
            <div className="text-muted-foreground flex items-center gap-2 text-xs tracking-wider uppercase">
              <Clock4 className="h-3.5 w-3.5" />
              SLA breaches
            </div>
            <div className="text-foreground mt-2 text-2xl font-semibold">{numberFormatter.format(workload.sla_breaches)}</div>
          </div>
          <div className="bg-muted rounded-lg border p-4">
            <div className="text-muted-foreground flex items-center gap-2 text-xs tracking-wider uppercase">
              <TimerReset className="h-3.5 w-3.5" />
              7d forecast
            </div>
            <div className="text-foreground mt-2 text-2xl font-semibold">{numberFormatter.format(workload.forecast_backlog_7d)}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">0-24h: {workload.aging_buckets.h0_24}</Badge>
          <Badge variant="outline">1-3d: {workload.aging_buckets.d1_3}</Badge>
          <Badge variant={workload.aging_buckets.d3_7 ? 'warning' : 'outline'}>3-7d: {workload.aging_buckets.d3_7}</Badge>
          <Badge variant={workload.aging_buckets.d7_plus ? 'destructive' : 'outline'}>7d+: {workload.aging_buckets.d7_plus}</Badge>
          <Badge variant="outline">Median feedback: {hours(workload.median_feedback_latency_hours)}</Badge>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Assignment</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Waiting</TableHead>
              <TableHead>Oldest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workload.backlog_by_assignment.slice(0, 5).map((item) => (
              <TableRow key={`${item.assessment_id}-${item.course_id}`}>
                <TableCell className="max-w-[260px] whitespace-normal font-medium">{item.title}</TableCell>
                <TableCell className="max-w-[220px] whitespace-normal">{item.course_name}</TableCell>
                <TableCell>{item.awaiting_review}</TableCell>
                <TableCell>{hours(item.age_hours)}</TableCell>
              </TableRow>
            ))}
            {!workload.backlog_by_assignment.length ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground"
                >
                  No submissions are waiting for review.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
