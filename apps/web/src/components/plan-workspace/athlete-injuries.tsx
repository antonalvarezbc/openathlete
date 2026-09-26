import { useGetInjuriesQuery } from '@/api/injury';
import { InjuryAPI } from '@/api/injury/injury.api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { useQueryClient } from '@tanstack/react-query';
import { HeartPulse, Plus } from 'lucide-react';
import { useState } from 'react';

import { AthleteInjury, INJURY_STATUS } from '@openathlete/shared';

import { Field, selectClass, workspaceError } from './helpers';

function InjuryEditor({
  athleteId,
  injury,
  onClose,
  onSaved,
}: {
  athleteId: number;
  injury?: AthleteInjury;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(injury?.status ?? INJURY_STATUS.STABLE);
  const [pain, setPain] = useState(String((injury?.painScore ?? 0) * 10));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {injury ? m.workspace_edit_injury() : m.workspace_add_injury()}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            setError('');
            const data = {
              location: String(form.get('location')),
              context: String(form.get('context')),
              painScore: Number(pain) / 10,
              status,
            };
            try {
              if (injury) await InjuryAPI.update(injury.athleteInjuryId, data);
              else await InjuryAPI.create({ athleteId, injury: data });
              await onSaved();
              onClose();
            } catch (err) {
              setError(workspaceError(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={m.location()}>
            <Input
              name="location"
              defaultValue={injury?.location}
              required
              maxLength={200}
            />
          </Field>
          <Field label={`${m.pain_score()} (0–10)`}>
            <Input
              type="number"
              min="0"
              max="10"
              step="0.5"
              required
              disabled={status === INJURY_STATUS.RESOLVED}
              value={pain}
              onChange={(e) => setPain(e.target.value)}
            />
          </Field>
          <Field label={m.status()}>
            <select
              className={selectClass}
              value={status}
              onChange={(e) => {
                const value = e.target.value as INJURY_STATUS;
                setStatus(value);
                if (value === INJURY_STATUS.RESOLVED) setPain('0');
              }}
            >
              {Object.values(INJURY_STATUS).map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={m.workspace_injury_context()}>
            <Textarea
              className="min-h-24"
              name="context"
              defaultValue={injury?.context}
              required
              maxLength={5000}
            />
          </Field>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              {m.cancel()}
            </Button>
            <Button type="submit" isLoading={busy}>
              {m.save()}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function statusLabel(status: INJURY_STATUS) {
  return {
    WORSENING: m.injury_status_worsening(),
    IMPROVING: m.injury_status_improving(),
    STABLE: m.injury_status_stable(),
    RESOLVED: m.injury_status_resolved(),
  }[status];
}
export function AthleteInjuries({ athleteId }: { athleteId: number }) {
  const query = useGetInjuriesQuery(athleteId);
  const client = useQueryClient();
  const [editing, setEditing] = useState<AthleteInjury | 'new' | null>(null);
  return (
    <section className="rounded-xl border p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <HeartPulse className="size-5" />
          {m.injury_logs()}
        </h3>
        <Button variant="outline" onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          {m.workspace_add_injury()}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {m.workspace_injuries_help()}
      </p>
      {query.isLoading && <p>{m.loading()}</p>}
      {query.isError && (
        <p role="alert" className="text-destructive">
          {m.workspace_failed()}
        </p>
      )}
      {query.data?.length === 0 && (
        <p className="text-sm">{m.no_injuries_found()}</p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {query.data?.map((injury) => (
          <div
            key={injury.athleteInjuryId}
            className="rounded-lg border p-4 space-y-2"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-medium">{injury.location}</p>
              <span className="text-sm">
                {(injury.painScore * 10).toFixed(1).replace('.0', '')}/10 ·{' '}
                {statusLabel(injury.status)}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">
              {injury.context}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(injury)}
            >
              {m.edit()}
            </Button>
          </div>
        ))}
      </div>
      {editing && (
        <InjuryEditor
          athleteId={athleteId}
          injury={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await client.invalidateQueries({ queryKey: ['injuries'] });
          }}
        />
      )}
    </section>
  );
}
