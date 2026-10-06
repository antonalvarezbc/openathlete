import { useGetRecordSportsQuery, useGetRecordsQuery } from '@/api/record';
import { RecordsChart } from '@/components/charts/records-chart';
import { SportSelect } from '@/components/sport-select/sport-select';
import { Card, CardContent } from '@/components/ui/card';
import { SkeletonChart } from '@/components/ui/skeleton';
import { useAthleteInfo } from '@/hooks/use-athlete-info';
import { m } from '@/paraglide/messages';
import { useState } from 'react';

import { SPORT_TYPE } from '@openathlete/shared';

interface P {
  athleteId?: number;
}

export function RecordsView({ athleteId }: P) {
  const { data: sports, isPending: isLoadingSports } =
    useGetRecordSportsQuery(athleteId);
  const [chosenSport, setChosenSport] = useState<SPORT_TYPE | null>(null);
  // One sport at a time: a run and a ride on the same curve mean nothing.
  // The athlete's most frequent sport comes first.
  const sport =
    chosenSport && sports?.includes(chosenSport)
      ? chosenSport
      : (sports?.[0] ?? null);
  const { data: records, isPending: isLoadingRecords } = useGetRecordsQuery(
    sport ?? undefined,
    athleteId,
    { enabled: sport !== null },
  );
  const { athlete, isCurrentUser } = useAthleteInfo({ athleteId });

  const pageTitle = isCurrentUser
    ? m.my_records()
    : m.records_of({
        firstName: athlete?.user?.firstName || '',
        lastName: athlete?.user?.lastName || '',
      });
  const isLoading = isLoadingSports || (sport !== null && isLoadingRecords);

  return (
    <div className="w-full p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-4">
      <h1 className="text-2xl font-semibold col-span-2 md:block hidden">
        {pageTitle}
      </h1>
      {sports && sports.length > 0 && (
        <Card className="col-span-2">
          <CardContent>
            <SportSelect
              selected={sport}
              onChange={setChosenSport}
              sports={sports}
              allowAll={false}
            />
          </CardContent>
        </Card>
      )}
      <Card className="col-span-2">
        <CardContent>
          {isLoading ? (
            <SkeletonChart className="h-[500px]" />
          ) : records && records.length > 0 ? (
            <RecordsChart records={records} className="h-[500px]" />
          ) : (
            <h1 className="text-2xl font-semibold">
              {m.no_records_found({ sport: '' })}
            </h1>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
