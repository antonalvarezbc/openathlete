import { useMutation } from '@tanstack/react-query';

import {
  CreateEventDto,
  GenerateEventResponseDto,
  GenerateWorkoutStructureDto,
  GenerateWorkoutStructureResponseDto,
  ModifyEventResponseDto,
} from '@openathlete/shared';

import { AIFeaturesAPI } from './ai-features.api';

export function useGenerateEventMutation() {
  return useMutation<
    GenerateEventResponseDto,
    Error,
    { prompt: string; date: Date; athleteId?: number }
  >({
    mutationFn: ({ prompt, date, athleteId }) =>
      AIFeaturesAPI.generateEvent(prompt, date, athleteId),
  });
}

export function useModifyEventMutation() {
  return useMutation<
    ModifyEventResponseDto,
    Error,
    { prompt: string; eventData: CreateEventDto; athleteId?: number }
  >({
    mutationFn: ({ prompt, eventData, athleteId }) =>
      AIFeaturesAPI.modifyEvent(prompt, eventData, athleteId),
  });
}

export function useGenerateWorkoutStructureMutation() {
  return useMutation<
    GenerateWorkoutStructureResponseDto,
    Error,
    GenerateWorkoutStructureDto
  >({
    mutationFn: (body) => AIFeaturesAPI.generateWorkoutStructure(body),
  });
}
