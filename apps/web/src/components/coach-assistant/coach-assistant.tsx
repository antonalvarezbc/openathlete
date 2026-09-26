import { CoachAssistantAPI } from '@/api/coach-assistant/coach-assistant.api';
import { AdaptationContextResponse } from '@/api/plan-adaptation/plan-adaptation.api';
import {
  Field,
  dateInput,
  workspaceError,
} from '@/components/plan-workspace/helpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SparklesIcon } from '@/components/ui/sparkles-icon';
import { Textarea } from '@/components/ui/textarea';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { isAxiosError } from 'axios';
import { FormEvent, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import {
  CoachAssistantChatRequest,
  CoachAssistantContextRequest,
} from '@openathlete/shared';

export function CoachAssistant({
  athleteId,
  planId,
  onAdapt,
}: {
  athleteId: number;
  planId: number;
  onAdapt: () => void;
}) {
  const [weekStart, setWeekStart] = useState(dateInput());
  const [currentState, setCurrentState] = useState('');
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<CoachAssistantChatRequest['history']>(
    [],
  );
  const [context, setContext] = useState<AdaptationContextResponse | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const request: CoachAssistantContextRequest = {
    athleteId,
    planId,
    language: getLocale(),
    weekStart,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    currentState,
  };
  const reset = () => {
    setHistory([]);
    setContext(null);
    setError('');
  };
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(
        isAxiosError(failure) && failure.response?.status === 503
          ? m.assistant_provider_error()
          : workspaceError(failure),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    void run(async () => {
      const result = await CoachAssistantAPI.chat({
        ...request,
        question: text,
        history: history.slice(-8),
      });
      setHistory((old) =>
        [...old, { question: text, answer: result.reply }].slice(-8),
      );
      setContext(result.context);
      setQuestion('');
    });
  };
  return (
    <section
      className="min-w-0 space-y-5 rounded-xl border p-4 sm:p-6"
      aria-label={m.assistant_title()}
    >
      <header className="space-y-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <SparklesIcon className="size-5 shrink-0" />
          {m.assistant_title()}
        </h3>
        <p className="text-sm text-muted-foreground">{m.assistant_help()}</p>
        <p className="text-sm text-muted-foreground">
          {m.assistant_history_help()}
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={m.adaptation_week_start()}>
          <Input
            type="date"
            required
            value={weekStart}
            disabled={busy}
            onChange={(e) => {
              setWeekStart(e.target.value);
              reset();
            }}
          />
        </Field>
        <Field label={m.assistant_state()}>
          <Textarea
            value={currentState}
            maxLength={3000}
            disabled={busy}
            onChange={(e) => {
              setCurrentState(e.target.value);
              reset();
            }}
          />
        </Field>
      </div>
      <p className="text-sm text-muted-foreground">
        {m.assistant_context_help()}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={busy || !weekStart}
        onClick={() =>
          void run(async () =>
            setContext(await CoachAssistantAPI.context(request)),
          )
        }
      >
        {m.adaptation_context()}
      </Button>
      {context && (
        <details className="min-w-0 rounded-lg border p-3">
          <summary className="cursor-pointer text-sm">
            {m.adaptation_context_details()}
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            {m.assistant_as_of()}:{' '}
            {new Date(context.data.asOf).toLocaleString(getLocale())}
          </p>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
            {JSON.stringify(context.data, null, 2)}
          </pre>
        </details>
      )}
      <div
        role="log"
        aria-live="polite"
        aria-label={m.assistant_conversation()}
        className="space-y-4"
      >
        {!history.length && (
          <p className="rounded-lg bg-muted p-4 text-sm">
            {m.assistant_empty()}
          </p>
        )}
        {history.map((turn, index) => (
          <div key={index} className="space-y-3">
            <div className="rounded-lg border p-3">
              <p className="text-sm font-semibold">
                {m.adaptation_coach_message()}
              </p>
              <p className="whitespace-pre-wrap break-words">{turn.question}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm font-semibold">{m.assistant_title()}</p>
              <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:overflow-x-auto">
                <ReactMarkdown
                  skipHtml
                  disallowedElements={['img', 'a']}
                  unwrapDisallowed
                >
                  {turn.answer}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="space-y-3">
        <Field label={m.assistant_question()}>
          <Textarea
            required
            value={question}
            disabled={busy}
            maxLength={3000}
            rows={4}
            placeholder={m.assistant_placeholder()}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={busy || !weekStart || !question.trim()}
          >
            <SparklesIcon className="size-4" />
            {busy ? m.loading() : m.assistant_send()}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !history.length}
            onClick={() => {
              reset();
              setQuestion('');
            }}
          >
            {m.assistant_clear()}
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="space-y-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {m.assistant_review_help()}
        </p>
        <Button variant="outline" onClick={onAdapt}>
          {m.workspace_adapt()}
        </Button>
      </div>
    </section>
  );
}
