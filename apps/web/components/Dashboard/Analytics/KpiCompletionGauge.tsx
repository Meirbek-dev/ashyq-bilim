'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Cell, Pie, PieChart } from 'recharts';
import { useTranslations } from 'next-intl';

interface KpiCompletionGaugeProps {
  completionPct: number;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat';
}

export default function KpiCompletionGauge({ completionPct, deltaPct, direction }: KpiCompletionGaugeProps) {
  const t = useTranslations('TeacherAnalytics');

  const gaugeData = [
    { name: t('kpiCharts.completionRate'), value: completionPct },
    { name: t('kpiCharts.remaining'), value: Math.max(0, 100 - completionPct) },
  ];

  const deltaColor =
    direction === 'up' ? 'text-emerald-600' : direction === 'down' ? 'text-amber-600' : 'text-muted-foreground';

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{t('kpiCharts.completionGaugeTitle')}</CardTitle>
        <CardDescription>{t('kpiCharts.completionGaugeDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ChartContainer
            className="h-[220px] w-full"
            config={{
              completion: {
                label: t('kpiCharts.completionRate'),
                color: 'var(--chart-2)',
                valueFormatter: (value) => `${value ?? 0}%`,
              },
              remaining: {
                label: t('kpiCharts.remaining'),
                color: 'var(--chart-5)',
                valueFormatter: (value) => `${value ?? 0}%`,
              },
            }}
          >
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="name"
                    formatter={(v) => [`${v}%`, '']}
                  />
                }
              />
              <Pie
                data={gaugeData}
                cx="50%"
                cy="80%"
                startAngle={180}
                endAngle={0}
                innerRadius={75}
                outerRadius={105}
                dataKey="value"
                paddingAngle={0}
                strokeWidth={0}
              >
                <Cell fill="var(--chart-2)" />
                <Cell fill="var(--chart-5)" />
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-foreground">{completionPct.toLocaleString()}%</div>
              {deltaPct !== null && (
                <div className={`mt-0.5 text-sm font-medium ${deltaColor}`}>
                  {deltaPct > 0 ? '+' : ''}
                  {deltaPct}% {t('kpiCharts.vsPrevPeriod')}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
