import { m } from '@/paraglide/messages';

import { SPORT_TYPE } from '@openathlete/shared';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ChartRecord, RECORD_METRICS } from './record-metrics';
import { RecordsCurveChart } from './records-curve-chart';

interface P {
  records: ChartRecord[];
  sport: SPORT_TYPE;
}

/** The best efforts of one activity, one chart per kind of record. */
export function ActivityRecordsCharts({ records, sport }: P) {
  const series = [
    { key: 'activity', label: m.records(), color: 'var(--chart-1)', records },
  ];
  return RECORD_METRICS.filter((metric) =>
    records.some((record) => record.type === metric.type),
  ).map((metric) => (
    <Card key={metric.type} className="col-span-2 md:col-span-1">
      <CardHeader>
        <CardTitle>
          {metric.title(sport)} · {metric.unit(sport)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RecordsCurveChart
          metric={metric}
          sport={sport}
          series={series}
          className="h-[200px] w-full"
        />
      </CardContent>
    </Card>
  ));
}
