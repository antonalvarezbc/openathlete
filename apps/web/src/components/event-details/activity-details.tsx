import { useGetMyAthleteQuery } from '@/api/athlete';
import { useGetEventStreamQuery, useGetEventWeatherQuery } from '@/api/event';
import { SparklesIcon } from '@/components/ui/sparkles-icon';
import { useAuthContext } from '@/contexts/auth';
import { useSpaceContext } from '@/contexts/space';
import { m } from '@/paraglide/messages';
import { useMemo, useState } from 'react';

import { ActivityEvent, getSportConfig } from '@openathlete/shared';

import { ActivityFeedbackOverlay } from '../activity-feedback/activity-feedback-overlay';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ActivityDetailsAnalysisTab } from './tabs/activity-details-analysis-tab';
import { ActivityDetailsOverviewTab } from './tabs/activity-details-overview-tab';
import { ActivityDetailsSplitsTab } from './tabs/activity-details-splits-tab';
import { ActivityDetailsWeatherTab } from './tabs/activity-details-weather-tab';

interface P {
  event: ActivityEvent;
}

export function ActivityDetails({ event }: P) {
  const { data: athlete } = useGetMyAthleteQuery();
  const { user } = useAuthContext();
  const { space } = useSpaceContext();
  const canAnalyze = space === 'COACH' && user?.roles.includes('COACH');
  const [showNormalView, setShowNormalView] = useState(false);
  const [showEditFeedback, setShowEditFeedback] = useState(false);
  const isMyActivity = athlete?.athleteId === event.athleteId;
  const { data: stream } = useGetEventStreamQuery(event.eventId, 3000, [
    'altitude',
    'latlng',
    'heartrate',
    'distance',
    'time',
    'watts',
    'gap',
    'temp',
    'cadence',
  ]);
  const sportConfig = getSportConfig(event.sport);
  const hasSplits = useMemo(() => {
    if (!sportConfig.showSplits) return false;
    const d = stream?.distance;
    if (!d?.length) return false;
    const lastDistance = d[d.length - 1] ?? 0;
    return Math.floor(lastDistance / 1000) > 0;
  }, [stream?.distance, sportConfig.showSplits]);

  const { data: weather } = useGetEventWeatherQuery(event.eventId, {
    retry: 1,
  });

  return (
    <>
      {isMyActivity && (!showNormalView || showEditFeedback) && (
        <ActivityFeedbackOverlay
          event={event}
          onSkip={() => {
            setShowNormalView(true);
            setShowEditFeedback(false);
          }}
          isEditMode={showEditFeedback}
        />
      )}

      {(!isMyActivity || (showNormalView && !showEditFeedback)) && (
        <Tabs defaultValue="overview" className="flex flex-col gap-4">
          <div className="max-w-full overflow-x-auto">
            <TabsList className="min-w-max">
              <TabsTrigger value="overview">{m.overview()}</TabsTrigger>
              {hasSplits && (
                <TabsTrigger value="splits">{m.splits()}</TabsTrigger>
              )}
              {weather && (
                <TabsTrigger value="weather">{m.weather()}</TabsTrigger>
              )}
              {canAnalyze && (
                <TabsTrigger value="analysis">
                  <SparklesIcon className="h-4 w-4" />
                  {m.activity_analysis_title()}
                </TabsTrigger>
              )}
            </TabsList>
          </div>
          <TabsContent value="overview">
            <ActivityDetailsOverviewTab
              event={event}
              stream={stream}
              isMyActivity={athlete?.athleteId === event.athleteId}
              onEditFeedback={() => setShowEditFeedback(true)}
              onReopenFeedback={() => {
                setShowNormalView(false);
                setShowEditFeedback(true);
              }}
            />
          </TabsContent>
          {hasSplits && (
            <TabsContent value="splits">
              <ActivityDetailsSplitsTab stream={stream} sport={event.sport} />
            </TabsContent>
          )}
          {weather && (
            <TabsContent value="weather">
              <ActivityDetailsWeatherTab data={weather} stream={stream} />
            </TabsContent>
          )}
          {canAnalyze && (
            <TabsContent value="analysis" className="min-w-0">
              <ActivityDetailsAnalysisTab
                key={`${user?.userId}-${event.eventId}`}
                eventId={event.eventId}
              />
            </TabsContent>
          )}
        </Tabs>
      )}
    </>
  );
}
