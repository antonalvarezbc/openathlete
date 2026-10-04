import {
  useGenerateEventMutation,
  useGenerateWorkoutStructureMutation,
  useModifyEventMutation,
} from '@/api/agent';
import { m } from '@/paraglide/messages';
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

import type { CreateEventDto, UpdateEventDto } from '@openathlete/shared';

import { FormProvider } from '../../hook-form';
import { RHFTextarea } from '../../hook-form/rhf-textarea';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';

type Props = {
  open: boolean;
  onClose: () => void;
  eventData: CreateEventDto;
  date?: Date;
  /** Athlete the session is for (the calendar's athlete). */
  athleteId?: number;
  isCreateMode: boolean;
  /** PostHog funnel attribution (no PII). */
  analyticsSource?: string;
  onEventGenerated?: (event: CreateEventDto) => void;
  onEventModified?: (event: UpdateEventDto) => void;
};

const promptSchema = z.object({
  prompt: z.string().min(1, m.required()).max(500),
});

type PromptFormValues = z.infer<typeof promptSchema>;

export function AIModifyEventDialog({
  open,
  onClose,
  eventData,
  athleteId,
  date,
  isCreateMode,
  analyticsSource = 'event_dialog',
  onEventGenerated,
  onEventModified,
}: Props) {
  const posthog = usePostHog();
  const requestStartedAtRef = useRef<number | null>(null);
  const methods = useForm<PromptFormValues>({
    resolver: zodResolver(promptSchema),
    defaultValues: {
      prompt: '',
    },
  });

  const generateEventMutation = useGenerateEventMutation();
  const modifyEventMutation = useModifyEventMutation();

  const convertMutation = useGenerateWorkoutStructureMutation();

  const isGenerating = generateEventMutation.isPending;
  const isModifying = modifyEventMutation.isPending;
  const isConverting = convertMutation.isPending;
  const isLoading = isGenerating || isModifying || isConverting;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      methods.reset({ prompt: '' });
      posthog?.capture(AnalyticsEvent.ai_event_generation_opened, {
        mode: isCreateMode ? 'create' : 'modify',
        source: analyticsSource,
      });
    }
  }, [open, isCreateMode, analyticsSource, posthog, methods]);

  const onSubmit = methods.handleSubmit(async (data) => {
    requestStartedAtRef.current = performance.now();
    try {
      if (isCreateMode) {
        // Generate new event
        if (!date) {
          toast.error(m.date_required_for_event_generation());
          return;
        }
        const generatedEvent = await generateEventMutation.mutateAsync({
          prompt: data.prompt,
          date,
          athleteId,
        });

        toast.success(m.event_generated_successfully());
        if (onEventGenerated) {
          onEventGenerated(generatedEvent);
        }
      } else {
        // Modify existing event
        const modifiedEvent = await modifyEventMutation.mutateAsync({
          prompt: data.prompt,
          eventData,
          athleteId,
        });

        toast.success(m.event_modified_successfully());
        if (onEventModified) {
          onEventModified(modifiedEvent);
        }
      }
      const durationMs =
        requestStartedAtRef.current !== null
          ? Math.round(performance.now() - requestStartedAtRef.current)
          : undefined;
      posthog?.capture(AnalyticsEvent.ai_event_generation_succeeded, {
        mode: isCreateMode ? 'create' : 'modify',
        source: analyticsSource,
        ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
      });
      methods.reset();
      onClose();
    } catch (err) {
      const durationMs =
        requestStartedAtRef.current !== null
          ? Math.round(performance.now() - requestStartedAtRef.current)
          : undefined;
      posthog?.capture(AnalyticsEvent.ai_event_generation_failed, {
        mode: isCreateMode ? 'create' : 'modify',
        source: analyticsSource,
        error_code: analyticsErrorCodeFromUnknown(err),
        ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
      });
      if (isCreateMode) {
        toast.error(m.failed_to_generate_event());
      } else {
        toast.error(m.failed_to_modify_event());
      }
    }
  });

  // The text is already the workout: a small model only turns it into steps.
  // Editing keeps name, date and goals; a new session gets a name and sport.
  const onConvert = methods.handleSubmit(async ({ prompt }) => {
    try {
      if (isCreateMode) {
        if (!date) {
          toast.error(m.date_required_for_event_generation());
          return;
        }
        const result = await convertMutation.mutateAsync({
          athleteId,
          instructions: prompt,
        });
        if (!result.steps.length) throw new Error('No steps');
        onEventGenerated?.(
          writtenWorkoutEvent({
            text: prompt,
            date,
            athleteId,
            result,
            fallbackSport: 'sport' in eventData ? eventData.sport : undefined,
          }),
        );
      } else {
        const { steps } = await convertMutation.mutateAsync({
          athleteId,
          sport: 'sport' in eventData ? eventData.sport : undefined,
          instructions: prompt,
        });
        if (!steps.length) throw new Error('No steps');
        onEventModified?.({
          ...eventData,
          workout: { steps },
        } as UpdateEventDto);
      }
      toast.success(m.ai_structure_done());
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
            <DialogTitle>
              {isCreateMode ? m.create_with_ai() : m.modify_with_ai()}
            </DialogTitle>
            <DialogDescription>
              {isCreateMode
                ? m.ai_generate_event_dialog_description()
                : m.ai_modify_event_dialog_description()}
            </DialogDescription>
          </DialogHeader>
          <FormProvider methods={methods} onSubmit={onSubmit}>
            <div className="space-y-4 pt-3">
              <RHFTextarea
                name="prompt"
                label={
                  isCreateMode
                    ? m.ai_generate_event_prompt_label()
                    : m.ai_modify_event_prompt_label()
                }
                placeholder={
                  isCreateMode
                    ? m.ai_generate_event_prompt_placeholder()
                    : m.ai_modify_event_prompt_placeholder()
                }
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
                  isLoading={isConverting}
                  disabled={isLoading}
                >
                  {m.ai_convert_as_written()}
                </Button>
                <Button
                  type="submit"
                  isLoading={isGenerating || isModifying}
                  disabled={isLoading}
                >
                  {isLoading
                    ? isCreateMode
                      ? m.generating_event()
                      : m.modifying_event()
                    : isCreateMode
                      ? m.generate()
                      : m.modify()}
                </Button>
              </div>
            </div>
          </FormProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}
