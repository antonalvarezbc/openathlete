import { eventKeys } from '@/api/event/event.keys';
import { trainingLoadKeys } from '@/api/training-load/training-load.keys';
import { EventDetails } from '@/components/event-details/event-details';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import client from '@/utils/axios';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Upload } from 'lucide-react';
import { FormEvent, useRef, useState } from 'react';

interface ImportResult {
  eventId: number;
  name: string;
  startDate: string;
  alreadyImported: boolean;
  processingQueued: boolean;
  warnings: string[];
}

export function ImportFitDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [viewActivity, setViewActivity] = useState(false);
  const clientCache = useQueryClient();
  const warnings: Record<string, string> = {
    FIT_INCOMPLETE_CHANNELS: m.fit_import_incomplete(),
    FIT_NO_STREAM: m.fit_import_no_stream(),
    FIT_MISSING_SUMMARY: m.fit_import_missing_summary(),
    FIT_UNKNOWN_SPORT: m.fit_import_unknown_sport(),
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('name', name.trim());
      const response = await client.post<ImportResult>(
        '/activity-import/fit',
        body,
      );
      await Promise.allSettled([
        clientCache.invalidateQueries({ queryKey: [eventKeys.getMyEvents] }),
        clientCache.invalidateQueries({
          queryKey: [eventKeys.getEventStream, response.data.eventId],
        }),
        clientCache.invalidateQueries({
          queryKey: [trainingLoadKeys.getWeeklyLoadSummary],
        }),
      ]);
      setResult(response.data);
    } catch (failure) {
      const status = isAxiosError(failure)
        ? failure.response?.status
        : undefined;
      const code = isAxiosError(failure)
        ? failure.response?.data?.message
        : undefined;
      setError(
        status === 413 || code === 'FIT_LIMIT'
          ? m.fit_import_limit()
          : code === 'FIT_MULTISPORT_UNSUPPORTED'
            ? m.fit_import_multisport()
            : code === 'FIT_DUPLICATE_TIME'
              ? m.fit_import_duplicate_time()
              : status === 403
                ? m.fit_import_forbidden()
                : status === 400
                  ? m.fit_import_invalid()
                  : m.fit_import_failed(),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        className="min-h-11"
        data-import-fit-trigger
        onClick={() => {
          setFile(null);
          setName('');
          setError('');
          setResult(null);
          setViewActivity(false);
          setOpen(true);
        }}
      >
        <Upload className="size-4" />
        {m.fit_import_title()}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!running.current) setOpen(value);
        }}
      >
        <DialogContent className={viewActivity ? 'sm:max-w-6xl' : undefined}>
          <DialogHeader>
            <DialogTitle>
              {viewActivity ? result?.name : m.fit_import_title()}
            </DialogTitle>
            <DialogDescription>{m.fit_import_help()}</DialogDescription>
          </DialogHeader>
          {viewActivity && result ? (
            <EventDetails eventId={result.eventId} />
          ) : result ? (
            <div className="space-y-4">
              <p role="status" className="font-medium">
                {result.alreadyImported
                  ? m.fit_import_already()
                  : m.fit_import_success()}
              </p>
              <p className="break-words">
                {result.name} ·{' '}
                {new Date(result.startDate).toLocaleString(getLocale())}
              </p>
              {!result.processingQueued && (
                <p role="alert">{m.fit_import_processing_pending()}</p>
              )}
              {result.warnings.map((warning) => (
                <p className="text-sm text-muted-foreground" key={warning}>
                  {warnings[warning] ?? m.fit_import_incomplete()}
                </p>
              ))}
              <Button onClick={() => setViewActivity(true)}>
                {m.fit_import_view()}
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <label className="block space-y-2 text-sm font-medium">
                <span>{m.fit_import_file()}</span>
                <Input
                  type="file"
                  accept=".fit,application/vnd.garmin.fit,application/fit"
                  required
                  disabled={busy}
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    setError('');
                    setFile(null);
                    if (!selected) return;
                    if (
                      !selected.name.toLowerCase().endsWith('.fit') ||
                      !selected.size
                    ) {
                      setError(m.fit_import_invalid());
                      return;
                    }
                    if (selected.size > 20 * 1024 * 1024) {
                      setError(m.fit_import_limit());
                      return;
                    }
                    setFile(selected);
                    setName(selected.name.replace(/\.fit$/i, '').slice(0, 100));
                  }}
                />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>{m.name()}</span>
                <Input
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={100}
                  disabled={busy}
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  {m.cancel()}
                </Button>
                <Button
                  type="submit"
                  disabled={!file || !name.trim() || busy}
                  isLoading={busy}
                >
                  {m.fit_import_submit()}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
