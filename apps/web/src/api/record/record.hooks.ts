import { useQuery } from '@tanstack/react-query';

import { GetRecordsQueryDto } from '@openathlete/shared';

import { RecordAPI } from './record.api';
import { recordKeys } from './record.keys';

export const useGetRecordsQuery = (
  query: GetRecordsQueryDto,
  { enabled = true }: { enabled?: boolean } = {},
) =>
  useQuery({
    queryFn: () => RecordAPI.getRecords(query),
    queryKey: [
      recordKeys.getRecords,
      query.sport,
      query.athleteId,
      query.from?.toISOString(),
      query.to?.toISOString(),
    ],
    enabled,
  });

export const useGetRecordSportsQuery = (athleteId?: number) =>
  useQuery({
    queryFn: () => RecordAPI.getRecordSports(athleteId),
    queryKey: [recordKeys.getRecordSports, athleteId],
  });
