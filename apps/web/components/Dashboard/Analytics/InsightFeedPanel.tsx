'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { InsightFeedItem } from '@/types/analytics';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import Link from 'next/link';

interface InsightFeedPanelProps {
  items: InsightFeedItem[];
}

const iconForSeverity = (severity: InsightFeedItem['severity']) => {
  if (severity === 'critical') return <AlertTriangle className="h-4 w-4" />;
  if (severity === 'warning') return <Info className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
};

export default function InsightFeedPanel({ items }: InsightFeedPanelProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Insight feed</CardTitle>
        <CardDescription>Prioritized signals ranked by learner impact and operational urgency.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <div
              key={item.id}
              className="bg-muted rounded-lg border p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant={item.severity === 'critical' ? 'destructive' : item.severity === 'warning' ? 'warning' : 'outline'}>
                  {iconForSeverity(item.severity)}
                  {item.severity}
                </Badge>
                <span className="text-muted-foreground text-xs tracking-wider uppercase">{item.category}</span>
              </div>
              <div className="text-foreground font-medium">{item.title}</div>
              <div className="text-muted-foreground mt-1 text-sm leading-6">{item.body}</div>
              {item.href ? (
                <Link
                  href={item.href}
                  className="text-primary mt-3 inline-flex text-sm hover:underline"
                >
                  Inspect
                </Link>
              ) : null}
            </div>
          ))
        ) : (
          <div className="text-muted-foreground text-sm">No priority insights for the current filter.</div>
        )}
      </CardContent>
    </Card>
  );
}
