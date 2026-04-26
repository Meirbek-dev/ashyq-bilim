'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ContentBottleneckRow } from '@/types/analytics';
import { RouteOff } from 'lucide-react';
import { useLocale } from 'next-intl';

interface ContentBottlenecksTableProps {
  rows: ContentBottleneckRow[];
}

const signalLabel = (signal: ContentBottleneckRow['signal']) => {
  switch (signal) {
    case 'high_time_low_completion':
      return 'Time sink';
    case 'exit_after_open':
      return 'Exit after open';
    case 'repeated_assessment_failures':
      return 'Assessment failure';
    case 'stale_low_performance':
      return 'Stale content';
  }
};

export default function ContentBottlenecksTable({ rows }: ContentBottlenecksTableProps) {
  const locale = useLocale();
  const numberFormatter = new Intl.NumberFormat(locale);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <RouteOff className="h-5 w-5" />
          <CardTitle>Content bottlenecks</CardTitle>
        </div>
        <CardDescription>Activities where learners stall, exit, repeatedly fail, or underperform on stale material.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Activity</TableHead>
              <TableHead>Signal</TableHead>
              <TableHead>Completion</TableHead>
              <TableHead>Exits</TableHead>
              <TableHead>Evidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 8).map((row) => (
              <TableRow key={`${row.signal}-${row.activity_id}`}>
                <TableCell className="max-w-[260px] whitespace-normal">
                  <div className="font-medium">{row.activity_name}</div>
                  <div className="text-muted-foreground text-xs">{row.course_name}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={row.severity === 'critical' ? 'destructive' : row.severity === 'warning' ? 'warning' : 'outline'}>
                    {signalLabel(row.signal)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {row.completion_rate === null || row.completion_rate === undefined
                    ? 'n/a'
                    : `${numberFormatter.format(row.completion_rate)}%`}
                </TableCell>
                <TableCell>{numberFormatter.format(row.exit_count)}</TableCell>
                <TableCell className="max-w-[360px] whitespace-normal text-sm text-muted-foreground">{row.note}</TableCell>
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground"
                >
                  No bottlenecks detected for the current filter.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
