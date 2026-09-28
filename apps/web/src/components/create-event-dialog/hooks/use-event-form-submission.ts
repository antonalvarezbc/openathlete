import { useCreateEventMutation, useUpdateEventMutation } from '@/api/event';
import { useCreateEventTemplateMutation } from '@/api/event-template';
import { m } from '@/paraglide/messages';
import { AnalyticsEvent } from '@/utils/analytics-events';
import { workoutTargetErrorMessage } from '@/utils/workout-target-errors';
import { usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';
import { UseFormHandleSubmit } from 'react-hook-form';
import { toast } from 'sonner';

import type {
  CreateEventDto,
  CreateWorkoutStepDto,
  Event,
  UpdateEventDto,
} from '@openathlete/shared';
import { EVENT_TYPE } from '@openathlete/shared';

import type { EventFormValues } from '../utils/event-form-schemas';

type CreateProps = {
  date?: Date;
  type?: EVENT_TYPE;
  prefilledData?: CreateEventDto;
};

type EditProps = {
  event?: Event;
};

type Props = CreateProps | EditProps;

export function useEventFormSubmission(
  props: Props,
  athleteId: number,
  workoutSteps: CreateWorkoutStepDto[],
  onClose: () => void,
  trainingPlanId?: number,
) {
  const edit = 'event' in props;
  const create = 'type' in props && 'date' in props;
  const posthog = usePostHog();

  const createEventTemplateMutation = useCreateEventTemplateMutation({
    onSuccess: () => {
      posthog?.capture(AnalyticsEvent.event_template_saved, {
        from: 'create_dialog',
      });
      toast.success(m.template_saved_successfully());
    },
    onError: (error) => {
      toast.error(
        workoutTargetErrorMessage(error, m.failed_to_save_template()),
      );
    },
  });

  const createEventMutation = useCreateEventMutation({
    onSuccess: (_, variables) => {
      posthog?.capture('event_created', { event_type: variables.type });
      toast.success(m.event_created_successfully());
      onClose();
    },
    onError: (error) => {
      toast.error(workoutTargetErrorMessage(error, m.failed_to_create_event()));
    },
  });

  const updateEventMutation = useUpdateEventMutation({
    onSuccess: (_, variables) => {
      posthog?.capture('event_updated', { event_type: variables.body.type });
      toast.success(m.event_updated_successfully());
      onClose();
    },
    onError: (error) => {
      toast.error(workoutTargetErrorMessage(error, m.failed_to_update_event()));
    },
  });

  const onSubmit = useCallback(
    (handleSubmit: UseFormHandleSubmit<EventFormValues>) =>
      handleSubmit(
        async (data: EventFormValues) => {
          const { saveAsTemplate, startDate, endDate, ...eventData } = data;
          const shouldSaveAsTemplate = saveAsTemplate === true;

          // Prepare event data, only include dates if they exist
          const baseEventData = {
            ...eventData,
            ...(create && trainingPlanId ? { trainingPlanId } : {}),
            ...(startDate && { startDate }),
            ...(endDate && { endDate }),
          };

          // For training events, always include workout (even if empty)
          if (data.type === EVENT_TYPE.TRAINING) {
            const eventWithWorkout = {
              ...baseEventData,
              athleteId,
              workout: {
                steps: workoutSteps,
              },
            };

            if (create) {
              createEventMutation.mutate(eventWithWorkout as CreateEventDto, {
                onSuccess: (createdEvent) => {
                  if (shouldSaveAsTemplate && createdEvent.eventId) {
                    createEventTemplateMutation.mutate({
                      eventId: createdEvent.eventId,
                    });
                  }
                },
              });
            } else if (edit && 'event' in props && props.event) {
              updateEventMutation.mutate({
                eventId: props.event.eventId,
                body: eventWithWorkout as UpdateEventDto,
              });
            }
          } else {
            // For non-training events, no workout
            if (create) {
              createEventMutation.mutate(
                {
                  ...(baseEventData as CreateEventDto),
                  athleteId,
                },
                {
                  onSuccess: (createdEvent) => {
                    if (shouldSaveAsTemplate && createdEvent.eventId) {
                      createEventTemplateMutation.mutate({
                        eventId: createdEvent.eventId,
                      });
                    }
                  },
                },
              );
            } else if (edit && 'event' in props && props.event) {
              updateEventMutation.mutate({
                eventId: props.event.eventId,
                body: baseEventData as UpdateEventDto,
              });
            }
          }
        },
        (_) => {
          // Form validation failed
        },
      ),
    [
      workoutSteps,
      athleteId,
      trainingPlanId,
      create,
      edit,
      props,
      createEventMutation,
      updateEventMutation,
      createEventTemplateMutation,
    ],
  );

  return {
    onSubmit,
    isSubmitting:
      createEventMutation.isPending || updateEventMutation.isPending,
  };
}
