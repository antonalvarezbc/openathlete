import {
  useGenerateEventMutation,
  useGenerateWorkoutStructureMutation,
} from '@/api/agent';
import { m } from '@/paraglide/messages';
import { aiErrorMessage } from '@/utils/ai-errors';
import {
  AnalyticsEvent,
  analyticsErrorCodeFromUnknown,
} from '@/utils/analytics-events';
import { writtenWorkoutEvent } from '@/utils/workout/written-workout';
import { zodResolver } from '@hookform/resolvers/zod';
import { usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { CreateEventDto } from '@openathlete/shared';

import { FormProvider } from '../hook-form';
import { RHFTextarea } from '../hook-form/rhf-textarea';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

type P = {
  open: boolean;
  onClose: () => void;
  date: Date;
  /** Athlete the session is for (the calendar's athlete). */
  athleteId?: number;
  onEventGenerated: (event: CreateEventDto) => void;
  /** PostHog funnel attribution (no PII). */
  analyticsSource?: string;
};

const promptSchema = z.object({
  prompt: z.string().min(1, m.required()).max(500),
});

type PromptFormValues = z.infer<typeof promptSchema>;

export function AIGenerateEventDialog({
  open,
  onClose,
  date,
  athleteId,
  onEventGenerated,
  analyticsSource = 'calendar',
}: P) {
  const posthog = usePostHog();
  const requestStartedAtRef = useRef<number | null>(null);

  const methods = useForm<PromptFormValues>({
    resolver: zodResolver(promptSchema),
    defaultValues: {
      prompt: '',
    },
  });

  const generateEventMutation = useGenerateEventMutation();
  const convertMutation = useGenerateWorkoutStructureMutation();
  const isLoading =
    generateEventMutation.isPending || convertMutation.isPending;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      methods.reset({ prompt: '' });
      posthog?.capture(AnalyticsEvent.ai_event_generation_opened, {
        mode: 'create',
        source: analyticsSource,
      });
    }
  }, [open, analyticsSource, posthog, methods]);

  const onSubmit = methods.handleSubmit(async (data) => {
    requestStartedAtRef.current = performance.now();
    try {
      const generatedEvent = await generateEventMutation.mutateAsync({
        prompt: data.prompt,
        athleteId,
        date,
      });

      const durationMs =
        requestStartedAtRef.current !== null
          ? Math.round(performance.now() - requestStartedAtRef.current)
          : undefined;
      posthog?.capture(AnalyticsEvent.ai_event_generation_succeeded, {
        mode: 'create',
        source: analyticsSource,
        ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
      });

      toast.success(m.event_generated_successfully());
      onEventGenerated(generatedEvent);
      methods.reset();
      onClose();
    } catch (err) {
      const durationMs =
        requestStartedAtRef.current !== null
          ? Math.round(performance.now() - requestStartedAtRef.current)
          : undefined;
      posthog?.capture(AnalyticsEvent.ai_event_generation_failed, {
        mode: 'create',
        source: analyticsSource,
        error_code: analyticsErrorCodeFromUnknown(err),
        ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
      });
      toast.error(aiErrorMessage(err) ?? m.failed_to_generate_event());
    }
  });

  // The text is already the workout: a small model turns it into steps and
  // names the session; the event dialog then opens to review it.
  const onConvert = methods.handleSubmit(async ({ prompt }) => {
    try {
      const result = await convertMutation.mutateAsync({
        athleteId,
        instructions: prompt,
      });
      if (!result.steps.length) throw new Error('No steps');
      toast.success(m.ai_structure_done());
      onEventGenerated(
        writtenWorkoutEvent({ text: prompt, date, athleteId, result }),
      );
      methods.reset();
      onClose();
    } catch {
      toast.error(m.ai_structure_failed());
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        mobileFullscreen
        className={`sm:max-w-2xl ${isLoading ? 'overflow-visible' : ''}`}
      >
        <div className={isLoading ? 'ai-rotating-brand-border-dialog' : ''}>
          <DialogHeader>
            <DialogTitle>{m.create_with_ai()}</DialogTitle>
            <DialogDescription>
              {m.ai_generate_event_dialog_description()}
            </DialogDescription>
          </DialogHeader>
          <FormProvider methods={methods} onSubmit={onSubmit}>
            <div className="space-y-4 pt-3">
              <RHFTextarea
                name="prompt"
                label={m.ai_generate_event_prompt_label()}
                placeholder={m.ai_generate_event_prompt_placeholder()}
                className="min-h-[120px]"
                required
                disabled={isLoading}
              />
              <p className="text-sm text-muted-foreground">
                {m.ai_convert_as_written_help()}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  {m.cancel()}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onConvert}
                  isLoading={convertMutation.isPending}
                  disabled={isLoading}
                >
                  {m.ai_convert_as_written()}
                </Button>
                <Button
                  type="submit"
                  isLoading={generateEventMutation.isPending}
                  disabled={isLoading}
                >
                  {generateEventMutation.isPending
                    ? m.generating_event()
                    : m.generate()}
                </Button>
              </div>
            </div>
          </FormProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}
