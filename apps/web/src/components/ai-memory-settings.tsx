import {
  useAiMemoryQuery,
  useClearAiMemoryMutation,
  useUpdateAiMemoryModeMutation,
} from '@/api/ai-memory/ai-memory.hooks';
import { ConfirmAction } from '@/components/confirm-action/confirm-action';
import { LoadingScreen } from '@/components/loading-screen';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { m } from '@/paraglide/messages';
import { useState } from 'react';
import { toast } from 'sonner';

import { AiMemoryMode, AiMemorySource } from '@openathlete/shared';

interface P {
  athleteId: number;
}

const modeLabels: Record<AiMemoryMode, () => string> = {
  OFF: m.ai_memory_mode_off,
  COMPACT: m.ai_memory_mode_compact,
  EXTENDED: m.ai_memory_mode_extended,
};

const modeDescriptions: Record<AiMemoryMode, () => string> = {
  OFF: m.ai_memory_mode_off_description,
  COMPACT: m.ai_memory_mode_compact_description,
  EXTENDED: m.ai_memory_mode_extended_description,
};

const sourceLabels: Record<AiMemorySource, () => string> = {
  ACTIVITY_ANALYSIS: m.ai_memory_source_activity_analysis,
  PLAN_ADAPTATION: m.ai_memory_source_plan_adaptation,
  COACH_ASSISTANT: m.ai_memory_source_coach_assistant,
  EVENT_GENERATION: m.ai_memory_source_event_generation,
  EVENT_MODIFICATION: m.ai_memory_source_event_modification,
};

/**
 * Coach-only: the coach's private AI memory about one athlete. Rendered in a
 * dialog from the athletes list, which provides the title.
 */
export function AiMemorySettings({ athleteId }: P) {
  const { data: memory, isLoading } = useAiMemoryQuery(athleteId);
  const updateMode = useUpdateAiMemoryModeMutation(athleteId);
  const clear = useClearAiMemoryMutation(athleteId);
  const [confirmClear, setConfirmClear] = useState(false);

  if (isLoading) return <LoadingScreen />;
  if (!memory) return null;

  const isEmpty = !memory.summary && memory.notes.length === 0;

  return (
    <>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {m.ai_memory_settings_description()}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="ai-memory-mode">{m.ai_memory_mode()}</Label>
            <p className="text-sm text-muted-foreground">
              {modeDescriptions[memory.mode]()}
            </p>
          </div>
          <Select
            value={memory.mode}
            disabled={updateMode.isPending}
            onValueChange={(mode) =>
              updateMode.mutate(mode as AiMemoryMode, {
                onError: () => toast.error(m.ai_memory_update_error()),
              })
            }
          >
            <SelectTrigger id="ai-memory-mode" className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(modeLabels) as AiMemoryMode[]).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {modeLabels[mode]()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label>{m.ai_memory_contents()}</Label>
            <Button
              variant="outline"
              size="sm"
              disabled={isEmpty || clear.isPending}
              onClick={() => setConfirmClear(true)}
            >
              {m.ai_memory_clear()}
            </Button>
          </div>
          {isEmpty ? (
            <p className="text-sm text-muted-foreground">
              {m.ai_memory_empty()}
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              {memory.summary && (
                <p className="whitespace-pre-line rounded-md border bg-muted/40 p-3">
                  {memory.summary}
                </p>
              )}
              {memory.notes.length > 0 && (
                <ul className="space-y-2">
                  {memory.notes.map((note, index) => (
                    <li
                      key={`${note.createdAt}-${index}`}
                      className="break-words"
                    >
                      <span className="text-muted-foreground">
                        {new Date(note.createdAt).toLocaleDateString()} ·{' '}
                        {sourceLabels[note.source]()}
                      </span>
                      <br />
                      {note.content}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {m.ai_memory_privacy_note()}
          </p>
        </div>
      </div>

      <ConfirmAction
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() =>
          clear.mutate(undefined, {
            onSuccess: () => {
              setConfirmClear(false);
              toast.success(m.ai_memory_cleared());
            },
            onError: () => toast.error(m.ai_memory_update_error()),
          })
        }
        title={m.ai_memory_clear()}
        message={m.ai_memory_clear_confirm()}
        isLoading={clear.isPending}
      />
    </>
  );
}
