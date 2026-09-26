import { AthleteMetric, useGetMetricsQuery } from '@/api/metric';
import { UpcomingCompetitions } from '@/components/dashboard/upcoming-competitions';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { m } from '@/paraglide/messages';
import { isCapacitor } from '@/utils/capacitor';
import { metricTypeLabelMap } from '@/utils/label-map/core/metric-type.label-map';
import { getMetricUnit } from '@/utils/metric-unit';
import { useMemo } from 'react';

import { METRIC_TYPE } from '@openathlete/shared';

interface AthleteDashboardHeaderProps {
  athleteId?: number;
}

export function AthleteDashboardHeader({
  athleteId,
}: AthleteDashboardHeaderProps) {
  const isMobile = isCapacitor();
  // Get all metrics to find recent updates
  const { data: allMetrics = [], isLoading: isLoadingMetrics } =
    useGetMetricsQuery(undefined, athleteId);

  // Get 2-3 most recent metrics with different types
  const recentMetrics = useMemo(() => {
    if (!allMetrics || allMetrics.length === 0) return [];

    // Sort by updatedAt descending
    const sorted = [...allMetrics].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    // Take first 2-3 with different types
    const seenTypes = new Set<METRIC_TYPE>();
    const result: AthleteMetric[] = [];

    for (const metric of sorted) {
      if (!seenTypes.has(metric.type as METRIC_TYPE)) {
        seenTypes.add(metric.type as METRIC_TYPE);
        result.push(metric);
        if (result.length >= 3) break;
      }
    }

    return result;
  }, [allMetrics]);

  if (isMobile) {
    return null;
  }
  return (
    <Card className="mb-6">
      <CardContent>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Upcoming Competitions */}
          <UpcomingCompetitions athleteId={athleteId} />

          {/* Recent Metrics */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {m.dashboard_header_recent_metrics()}
            </h3>
            {isLoadingMetrics ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-md" />
                ))}
              </div>
            ) : recentMetrics.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {m.dashboard_header_no_recent_metrics()}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {recentMetrics.map((metric, index) => {
                  const label =
                    metricTypeLabelMap[metric.type as METRIC_TYPE] ||
                    metric.type;
                  const unit = getMetricUnit(metric.type as METRIC_TYPE) || '';

                  // Different gradient colors for each metric
                  const gradientColors = [
                    'from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30',
                    'from-pink-50 to-rose-50 dark:from-pink-950/30 dark:to-rose-950/30',
                    'from-cyan-50 to-teal-50 dark:from-cyan-950/30 dark:to-teal-950/30',
                  ];
                  const textColors = [
                    'text-indigo-700 dark:text-indigo-300',
                    'text-pink-700 dark:text-pink-300',
                    'text-cyan-700 dark:text-cyan-300',
                  ];

                  return (
                    <div
                      key={metric.athleteMetricId}
                      className={`rounded-md bg-gradient-to-br p-2 ${gradientColors[index % gradientColors.length]}`}
                    >
                      <div className="flex flex-col">
                        <span className="text-[10px] font-medium text-muted-foreground mb-0.5 truncate">
                          {label}
                        </span>
                        <div className="flex items-baseline gap-0.5">
                          <span
                            className={`text-lg font-bold ${textColors[index % textColors.length]}`}
                          >
                            {Number(metric.value.toFixed(2))}
                          </span>
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {unit}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
