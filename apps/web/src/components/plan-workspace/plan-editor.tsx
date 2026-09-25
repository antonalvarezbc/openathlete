import {
  ManagedPlan,
  PlanWorkspaceAPI,
} from '@/api/plan-workspace/plan-workspace.api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { useState } from 'react';

import { UpdateManagedPlan } from '@openathlete/shared';

import { Field, dateInput, selectClass, workspaceError } from './helpers';

export function PlanEditor({
  athleteId,
  plan,
  onClose,
  onSaved,
}: {
  athleteId: number;
  plan?: ManagedPlan;
  onClose: () => void;
  onSaved: (plan: ManagedPlan) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const statuses: Record<UpdateManagedPlan['status'], string> = {
    DRAFT: m.workspace_draft(),
    ACTIVE: m.workspace_active(),
    COMPLETED: m.workspace_completed(),
    ARCHIVED: m.workspace_archived(),
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {plan ? m.workspace_edit_plan() : m.workspace_new_plan()}
          </DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            setError('');
            const fields = {
              name: String(form.get('name')),
              goal: String(form.get('goal')),
              description: String(form.get('description')),
            };
            try {
              const result = plan
                ? await PlanWorkspaceAPI.update(plan.trainingPlanId, {
                    ...fields,
                    status: String(
                      form.get('status'),
                    ) as UpdateManagedPlan['status'],
                  })
                : await PlanWorkspaceAPI.create({
                    ...fields,
                    athleteId,
                    startDate: String(form.get('startDate')),
                    endDate: String(form.get('endDate')),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  });
              onSaved(result);
            } catch (err) {
              setError(workspaceError(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={m.workspace_plan_name()}>
            <Input
              name="name"
              defaultValue={plan?.name}
              required
              maxLength={100}
            />
          </Field>
          <Field label={m.workspace_goal()}>
            <Textarea
              name="goal"
              defaultValue={plan?.goal}
              required
              maxLength={2000}
              className="min-h-20"
            />
          </Field>
          <Field label={m.description()}>
            <Textarea
              name="description"
              defaultValue={plan?.description ?? ''}
              maxLength={5000}
              className="min-h-20"
            />
          </Field>
          {plan ? (
            <Field label={m.status()}>
              <select
                name="status"
                defaultValue={plan.status}
                className={selectClass}
              >
                {Object.entries(statuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={m.start_date()}>
                  <Input
                    name="startDate"
                    type="date"
                    required
                    defaultValue={dateInput()}
                  />
                </Field>
                <Field label={m.end_date()}>
                  <Input name="endDate" type="date" required />
                </Field>
              </div>
              <p className="text-sm text-muted-foreground">
                {m.workspace_empty_weeks_help()}
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
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
