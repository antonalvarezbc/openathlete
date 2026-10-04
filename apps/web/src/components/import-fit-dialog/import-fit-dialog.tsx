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
import { sportTypeLabelMap } from '@/utils/label-map/core';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Upload } from 'lucide-react';
import { FormEvent, useRef, useState } from 'react';

import {
  activityFileKind,
  fileActivityName,
  gpxTrackName,
} from './activity-file';

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
  // GPX only: '' keeps the sport the file declares.
  const [sport, setSport] = useState('');
  const latestFile = useRef<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [viewActivity, setViewActivity] = useState(false);
  const clientCache = useQueryClient();
  const isGpx = !!file && activityFileKind(file.name) === 'gpx';
  const warnings: Record<string, string> = {
    FIT_INCOMPLETE_CHANNELS: m.fit_import_incomplete(),
    FIT_NO_STREAM: m.fit_import_no_stream(),
    FIT_MISSING_SUMMARY: m.fit_import_missing_summary(),
    FIT_UNKNOWN_SPORT: m.fit_import_unknown_sport(),
    GPX_INCOMPLETE_CHANNELS: m.fit_import_incomplete(),
    GPX_NO_GPS: m.gpx_import_no_gps(),
    GPX_UNKNOWN_SPORT: m.fit_import_unknown_sport(),
  };
  const sports = Object.entries(sportTypeLabelMap).sort(([, a], [, b]) =>
    a.localeCompare(b, getLocale()),
  );
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
      if (isGpx && sport) body.append('sport', sport);
      const response = await client.post<ImportResult>(
        isGpx ? '/activity-import/gpx' : '/activity-import/fit',
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
              : code === 'GPX_NO_TIME'
                ? m.gpx_import_no_time()
                : status === 403
                  ? m.fit_import_forbidden()
                  : status === 400
                    ? isGpx
                      ? m.gpx_import_invalid()
                      : m.fit_import_invalid()
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
          setSport('');
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
                  accept=".fit,.gpx,application/vnd.garmin.fit,application/fit,application/gpx+xml"
                  required
                  disabled={busy}
                  onChange={async (event) => {
                    const selected = event.target.files?.[0] ?? null;
                    latestFile.current = selected;
                    setError('');
                    setFile(null);
                    setSport('');
                    if (!selected) return;
                    const kind = activityFileKind(selected.name);
                    if (!kind || !selected.size) {
                      setError(m.activity_import_unsupported());
                      return;
                    }
                    if (selected.size > 20 * 1024 * 1024) {
                      setError(m.fit_import_limit());
                      return;
                    }
                    setFile(selected);
                    setName(fileActivityName(selected.name));
                    if (kind !== 'gpx') return;
                    // Suggest the track's own name, unless another file
                    // was chosen meanwhile.
                    const trackName = gpxTrackName(
                      await selected.text().catch(() => ''),
                    );
                    if (trackName && latestFile.current === selected)
                      setName(trackName);
                  }}
                />
              </label>
              {isGpx && (
                <label className="block space-y-2 text-sm font-medium">
                  <span>{m.sport()}</span>
                  <select
                    name="sport"
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={sport}
                    onChange={(event) => setSport(event.target.value)}
                    disabled={busy}
                  >
                    <option value="">{m.gpx_import_sport_auto()}</option>
                    {sports.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {m.gpx_import_sport_help()}
                  </span>
                </label>
              )}
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
