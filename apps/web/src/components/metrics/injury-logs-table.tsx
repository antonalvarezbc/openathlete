import { useGetInjuriesQuery } from '@/api/injury';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SkeletonTableRow } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { m } from '@/paraglide/messages';
import { getPainScoreColor } from '@/utils/color';
import { injuryStatusLabelMap } from '@/utils/label-map/core';
import { cn } from '@/utils/shadcn';
import { format } from 'date-fns';

import { AthleteInjury } from '@openathlete/shared';

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface InjuryLogsTableProps {
  athleteId?: number;
  className?: string;
}

export function InjuryLogsTable({
  athleteId,
  className,
}: InjuryLogsTableProps) {
  const { data: injuries = [], isLoading } = useGetInjuriesQuery(athleteId);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{m.injury_logs()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.date()}</TableHead>
                <TableHead>{m.location()}</TableHead>
                <TableHead>{m.pain_score()}</TableHead>
                <TableHead>{m.status()}</TableHead>
                <TableHead>{m.context()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonTableRow key={i} colCount={5} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  if (injuries.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{m.injury_logs()}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {m.no_injuries_found()}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{m.injury_logs()}</CardTitle>
        <CardDescription>{m.injury_logs_description()}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.date()}</TableHead>
              <TableHead>{m.location()}</TableHead>
              <TableHead>{m.pain_score()}</TableHead>
              <TableHead>{m.status()}</TableHead>
              <TableHead>{m.context()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {injuries.map((injury: AthleteInjury) => (
              <TableRow key={injury.athleteInjuryId}>
                <TableCell>
                  {format(new Date(injury.updatedAt), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell className="font-medium">{injury.location}</TableCell>
                <TableCell>
                  <div
                    className={cn(
                      'inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-semibold',
                      getPainScoreColor(injury.painScore),
                    )}
                  >
                    {(injury.painScore * 10).toFixed(0)}/10
                  </div>
                </TableCell>
                <TableCell>{injuryStatusLabelMap[injury.status]}</TableCell>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TableCell className="max-w-md truncate">
                      {injury.context}
                    </TableCell>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-sm">{injury.context}</p>
                  </TooltipContent>
                </Tooltip>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
