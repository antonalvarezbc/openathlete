import { AiMemoryService } from './ai-memory.service';

/** AiMemoryService stand-in for specs: memory off, notes discarded. */
export function disabledAiMemory() {
  return {
    getCoachMemory: jest.fn().mockResolvedValue(undefined),
    getAthleteFeedbackMemory: jest.fn().mockResolvedValue(undefined),
    addNote: jest.fn().mockResolvedValue(undefined),
  } as unknown as AiMemoryService & {
    getCoachMemory: jest.Mock;
    getAthleteFeedbackMemory: jest.Mock;
    addNote: jest.Mock;
  };
}
