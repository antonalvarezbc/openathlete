import { ActivityAnalysisAPI } from '@/api/activity-analysis/activity-analysis.api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SparklesIcon } from '@/components/ui/sparkles-icon';
import { Textarea } from '@/components/ui/textarea';
import { useAuthContext } from '@/contexts/auth';
import { useFeatureAccess } from '@/hooks/use-feature-access';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Copy, Loader2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import {
  ActivityAnalysisRequest,
  FeatureName,
  SavedActivityAnalysis,
} from '@openathlete/shared';

function analysisError(error: unknown): string {
  if (isAxiosError(error)) {
    const code = error.response?.data?.code;
    if (code === 'ACTIVITY_ANALYSIS_PROVIDER')
      return m.activity_analysis_provider_error();
    if (code === 'ACTIVITY_ANALYSIS_INVALID')
      return m.activity_analysis_invalid_error();
    if (code === 'ACTIVITY_ANALYSIS_BUSY')
      return m.activity_analysis_busy_error();
    if ([401, 403, 404].includes(error.response?.status ?? 0))
      return m.activity_analysis_access_error();
  }
  return m.activity_analysis_request_error();
}

function Observations({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="space-y-2 min-w-0">
      <h4 className="font-medium">{title}</h4>
      {items.length ? (
        <ul className="list-disc pl-5 space-y-2 text-sm">
          {items.map((item, index) => (
            <li key={index} className="whitespace-pre-wrap break-words">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {m.activity_analysis_no_observations()}
        </p>
      )}
    </section>
  );
}

export function ActivityDetailsAnalysisTab({ eventId }: { eventId: number }) {
  const { user, authenticated } = useAuthContext();
  const { hasAccess, isLoading: accessLoading } = useFeatureAccess(
    FeatureName.AI_GENERATION,
  );
  const queryClient = useQueryClient();
  const queryKey = ['activity-analysis', user?.userId, eventId];
  const history = useQuery({
    queryKey,
    queryFn: ({ signal }) => ActivityAnalysisAPI.list(eventId, signal),
    enabled: authenticated,
    retry: false,
  });
  const [coachContext, setCoachContext] = useState('');
  const [preview, setPreview] = useState<{
    data: Record<string, unknown>;
    language: ActivityAnalysisRequest['language'];
  } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{
    analysisId: number;
    text: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [statusLocation, setStatusLocation] = useState<'request' | 'feedback'>(
    'request',
  );
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const language = getLocale();
  const records = history.data ?? [];
  const selected =
    records.find((record) => record.activityAnalysisId === selectedId) ??
    records[0];
  const feedback =
    selected && draft?.analysisId === selected.activityAnalysisId
      ? draft.text
      : (selected?.feedbackDraft ?? '');
  const dirty = !!selected && feedback !== selected.feedbackDraft;

  const contextMutation = useMutation({
    mutationFn: (request: ActivityAnalysisRequest) =>
      ActivityAnalysisAPI.context(eventId, request),
    onSuccess: (response, request) =>
      setPreview({ data: response.data, language: request.language }),
    onError: (error) => setError(analysisError(error)),
  });
  const generateMutation = useMutation({
    mutationFn: (request: ActivityAnalysisRequest) =>
      ActivityAnalysisAPI.generate(eventId, request),
    onSuccess: async (record) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<SavedActivityAnalysis[]>(queryKey, (old = []) =>
        [
          record,
          ...old.filter(
            (item) => item.activityAnalysisId !== record.activityAnalysisId,
          ),
        ].slice(0, 20),
      );
      setSelectedId(record.activityAnalysisId);
      setDraft(null);
      setNotice(m.activity_analysis_saved());
    },
    onError: (error) => setError(analysisError(error)),
  });
  const saveMutation = useMutation({
    mutationFn: (request: { analysisId: number; feedbackDraft: string }) =>
      ActivityAnalysisAPI.update(eventId, request.analysisId, {
        feedbackDraft: request.feedbackDraft,
      }),
    onSuccess: async (record) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<SavedActivityAnalysis[]>(queryKey, (old = []) =>
        old.map((item) =>
          item.activityAnalysisId === record.activityAnalysisId ? record : item,
        ),
      );
      setDraft(null);
      setNotice(m.activity_analysis_feedback_saved());
    },
    onError: (error) => setError(analysisError(error)),
  });
  const busy =
    contextMutation.isPending ||
    generateMutation.isPending ||
    saveMutation.isPending;
  const clearStatus = (location: 'request' | 'feedback' = 'request') => {
    setStatusLocation(location);
    setError('');
    setNotice('');
  };
  const copyFeedback = async () => {
    clearStatus('feedback');
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(feedback);
      setNotice(m.activity_analysis_copied());
    } catch {
      feedbackRef.current?.focus();
      feedbackRef.current?.select();
      setNotice(m.activity_analysis_copy_manually());
    }
  };
  const timestamp = (record: SavedActivityAnalysis) =>
    new Date(record.createdAt).toLocaleString(language);

  return (
    <div className="space-y-4 min-w-0" aria-busy={busy}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon className="h-4 w-4" />
            {m.activity_analysis_title()}
          </CardTitle>
          <CardDescription>{m.activity_analysis_private()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${id}-context`}>
              {m.activity_analysis_coach_context()}
            </Label>
            <Textarea
              id={`${id}-context`}
              value={coachContext}
              maxLength={5000}
              rows={4}
              disabled={busy}
              placeholder={m.activity_analysis_context_placeholder()}
              onChange={(event) => {
                setCoachContext(event.target.value);
                setPreview(null);
                clearStatus();
              }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {m.activity_analysis_disclosure()}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                clearStatus();
                contextMutation.mutate({ coachContext, language });
              }}
            >
              {contextMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {m.activity_analysis_preview_context()}
            </Button>
            <Button
              disabled={busy || dirty || accessLoading || !hasAccess}
              onClick={() => {
                clearStatus();
                generateMutation.mutate({ coachContext, language });
              }}
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SparklesIcon className="h-4 w-4" />
              )}
              {generateMutation.isPending
                ? m.activity_analysis_generating()
                : m.activity_analysis_generate()}
            </Button>
          </div>
          {!accessLoading && !hasAccess && (
            <p className="text-sm text-muted-foreground">
              {m.activity_analysis_generation_unavailable()}
            </p>
          )}
          {preview && preview.language === language && (
            <details className="min-w-0">
              <summary className="cursor-pointer text-sm font-medium">
                {m.activity_analysis_context_preview()}
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                {JSON.stringify(preview.data, null, 2)}
              </pre>
            </details>
          )}
          {statusLocation === 'request' && error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {statusLocation === 'request' && notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
        </CardContent>
      </Card>

      {history.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          {m.loading()}
        </p>
      )}
      {history.isError && (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">
            {m.activity_analysis_history_error()}
          </p>
          <Button
            variant="outline"
            disabled={history.isFetching}
            onClick={() => void history.refetch()}
          >
            {m.activity_analysis_retry()}
          </Button>
        </div>
      )}
      {history.isSuccess && records.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {m.activity_analysis_empty()}
        </p>
      )}
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>{m.activity_analysis_history()}</CardTitle>
            <CardDescription>
              {m.activity_analysis_history_limit()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 min-w-0">
            <div className="space-y-2">
              <Label htmlFor={`${id}-history`}>
                {m.activity_analysis_saved_version()}
              </Label>
              <select
                id={`${id}-history`}
                value={selected.activityAnalysisId}
                disabled={busy || dirty}
                className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
                onChange={(event) => {
                  setSelectedId(Number(event.target.value));
                  setDraft(null);
                  clearStatus();
                }}
              >
                {records.map((record) => (
                  <option
                    key={record.activityAnalysisId}
                    value={record.activityAnalysisId}
                  >
                    {timestamp(record)} · {record.analysis.summary.slice(0, 70)}
                  </option>
                ))}
              </select>
            </div>
            {selected.coachContext && (
              <section className="space-y-2">
                <h4 className="font-medium">
                  {m.activity_analysis_context_used()}
                </h4>
                <p className="text-sm whitespace-pre-wrap break-words">
                  {selected.coachContext}
                </p>
              </section>
            )}
            <section className="space-y-2">
              <h4 className="font-medium">{m.summary()}</h4>
              <p className="text-sm whitespace-pre-wrap break-words">
                {selected.analysis.summary}
              </p>
            </section>
            <section className="space-y-2">
              <h4 className="font-medium">
                {m.activity_analysis_plan_comparison()}
              </h4>
              <p className="text-sm whitespace-pre-wrap break-words">
                {selected.analysis.planComparison}
              </p>
            </section>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Observations
                title={m.activity_analysis_highlights()}
                items={selected.analysis.highlights}
              />
              <Observations
                title={m.activity_analysis_concerns()}
                items={selected.analysis.concerns}
              />
              <Observations
                title={m.activity_analysis_next_steps()}
                items={selected.analysis.nextSteps}
              />
              <Observations
                title={m.activity_analysis_data_gaps()}
                items={selected.analysis.dataGaps}
              />
            </div>
            <div className="space-y-3 border-t pt-5">
              <Label htmlFor={`${id}-feedback`}>
                {m.activity_analysis_feedback()}
              </Label>
              <p className="text-sm text-muted-foreground">
                {m.activity_analysis_feedback_help()}
              </p>
              <Textarea
                id={`${id}-feedback`}
                ref={feedbackRef}
                value={feedback}
                disabled={busy}
                rows={7}
                maxLength={5000}
                onChange={(event) => {
                  setDraft({
                    analysisId: selected.activityAnalysisId,
                    text: event.target.value,
                  });
                  clearStatus();
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || !dirty || !feedback.trim()}
                  onClick={() => {
                    clearStatus('feedback');
                    saveMutation.mutate({
                      analysisId: selected.activityAnalysisId,
                      feedbackDraft: feedback,
                    });
                  }}
                >
                  {saveMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {m.activity_analysis_save_feedback()}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !feedback.trim()}
                  onClick={() => void copyFeedback()}
                >
                  <Copy className="h-4 w-4" />
                  {m.copy()}
                </Button>
                {dirty && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setDraft(null);
                      clearStatus();
                    }}
                  >
                    {m.activity_analysis_discard_draft()}
                  </Button>
                )}
              </div>
              {statusLocation === 'feedback' && error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {statusLocation === 'feedback' && notice && (
                <p role="status" className="text-sm">
                  {notice}
                </p>
              )}
              {dirty && (
                <p className="text-sm text-muted-foreground">
                  {m.activity_analysis_unsaved_feedback()}
                </p>
              )}
            </div>
            <details className="min-w-0">
              <summary className="cursor-pointer text-sm font-medium">
                {m.activity_analysis_saved_context()}
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                {JSON.stringify(selected.contextSnapshot, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
