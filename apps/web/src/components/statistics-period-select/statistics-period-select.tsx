import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { getDateLocale } from '@/utils/locales';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { StatisticsPeriodType, statisticsPeriod } from './statistics-period';

interface P {
  onChange: (start: Date, end: Date) => void;
  period: { start: Date; end: Date };
  className?: string;
}

export function StatisticsPeriodSelect({ onChange, period, className }: P) {
  const [type, setType] = useState<StatisticsPeriodType>('days7');
  const [offset, setOffset] = useState(0);

  const select = (nextType: StatisticsPeriodType, nextOffset: number) => {
    setType(nextType);
    setOffset(nextOffset);
    const { start, end } = statisticsPeriod(nextType, nextOffset);
    onChange(start, end);
  };
  const dayAndMonth = (date: Date) =>
    new Date(date).toLocaleString(getDateLocale(getLocale()), {
      day: 'numeric',
      month: 'short',
    });

  return (
    <Card className={className}>
      <CardContent className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 md:gap-0 p-4 md:p-6">
        <Tabs
          value={type}
          onValueChange={(t) => select(t as StatisticsPeriodType, 0)}
        >
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="days7">{m.last_7_days()}</TabsTrigger>
            <TabsTrigger value="week">{m.week()}</TabsTrigger>
            <TabsTrigger value="month">{m.month()}</TabsTrigger>
            <TabsTrigger value="year">{m.year()}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2 items-center justify-between md:justify-end">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => select(type, offset - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => select(type, offset + 1)}
              disabled={offset >= 0}
            >
              <ChevronRight />
            </Button>
          </div>
          <Badge className="text-xs md:text-sm">
            {type === 'days7' || type === 'week'
              ? `${dayAndMonth(period.start)} ${m.to()} ${dayAndMonth(period.end)}`
              : type === 'month'
                ? `${new Date(period.start).toLocaleString(
                    getDateLocale(getLocale()),
                    { month: 'long' },
                  )} ${new Date(period.start).getFullYear()}`
                : `${new Date(period.start).getFullYear()}`}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
