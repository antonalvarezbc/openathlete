import { useGetWeeklyVolumeQuery } from '@/api/statistics';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { sportTypeLabelMap } from '@/utils/label-map/core';
import { getDateFnsLocale } from '@/utils/locales';
import { format } from 'date-fns';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import { SkeletonChart } from '../ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import {
  OTHER_SPORTS,
  VolumeMetric,
  VolumeSeries,
  weeklyVolumeData,
} from './weekly-volume-data';

const WEEKS = 26;

interface P {
  athleteId: number;
}

/** Hours, kilometres or metres climbed each week, stacked by sport. */
export function WeeklyVolumeChart({ athleteId }: P) {
  const { data: weeks, isPending } = useGetWeeklyVolumeQuery(athleteId, WEEKS);
  const [metric, setMetric] = useState<VolumeMetric>('duration');
  const dateFnsLocale = getDateFnsLocale(getLocale());
  const unit =
    metric === 'duration' ? 'h' : metric === 'distance' ? 'km' : m.meters();
  const { rows, series } = weeklyVolumeData(weeks ?? [], metric);
  const label = (key: VolumeSeries) =>
    key === OTHER_SPORTS ? m.other_sports() : sportTypeLabelMap[key];
  const color = (index: number) => `var(--chart-${(index % 5) + 1})`;
  const formatValue = (value: number) =>
    metric === 'duration' ? value.toFixed(1) : Math.round(value).toString();
  const weekLabel = (time: number) =>
    format(new Date(time), 'd MMM', { locale: dateFnsLocale });

  return (
    <Card data-weekly-volume>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base md:text-lg">
            {m.weekly_volume_title()}
          </CardTitle>
          <CardDescription>
            {m.weekly_volume_description({ weeks: WEEKS, unit })}
          </CardDescription>
        </div>
        <Tabs
          value={metric}
          onValueChange={(value) => setMetric(value as VolumeMetric)}
        >
          <TabsList>
            <TabsTrigger value="duration">{m.duration()}</TabsTrigger>
            <TabsTrigger value="distance">{m.distance()}</TabsTrigger>
            <TabsTrigger value="elevationGain">
              {m.elevation_gain()}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          <SkeletonChart className="h-[260px]" />
        ) : series.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {m.no_data_for_period()}
          </p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {series.map((key, index) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: color(index) }}
                  />
                  <span className="text-muted-foreground">{label(key)}</span>
                </li>
              ))}
            </ul>
            <ChartContainer
              config={Object.fromEntries(
                series.map((key, index) => [
                  key,
                  { label: label(key), color: color(index) },
                ]),
              )}
              className="h-[260px] w-full"
            >
              <BarChart data={rows} margin={{ top: 8, right: 8, left: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="weekStart"
                  tickFormatter={weekLabel}
                  tick={{ fontSize: 11 }}
                  minTickGap={16}
                />
                <YAxis
                  width={40}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: number) => `${value}`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => {
                        const time = payload?.[0]?.payload?.weekStart;
                        return typeof time === 'number'
                          ? m.week_of({ date: weekLabel(time) })
                          : '';
                      }}
                      formatter={(value, name) => (
                        <div className="flex w-full items-center gap-2 text-xs text-muted-foreground">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{
                              backgroundColor: color(
                                series.indexOf(name as VolumeSeries),
                              ),
                            }}
                          />
                          {label(name as VolumeSeries)}
                          <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                            {formatValue(Number(value))} {unit}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                {series.map((key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="volume"
                    fill={color(index)}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
