import { SPORT_TYPE } from '@openathlete/shared';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
// Load order of the auth/subscription barrels (circular import).
import '../../subscription';
import { EventGenerationService } from '../services/event-generation.service';
import { EventModificationService } from '../services/event-modification.service';
import { AIFeaturesController } from './ai-features.controller';

jest.mock('../services/event-generation.service', () => ({
  EventGenerationService: class {},
}));
jest.mock('../services/event-modification.service', () => ({
  EventModificationService: class {},
}));

const coach = { userId: 3, roles: ['COACH'] } as AuthUser;

function setup() {
  const generation = {
    generateTrainingEvent: jest.fn().mockResolvedValue({
      name: 'Ignored name',
      sport: 'RUNNING',
      workout: {
        steps: [
          { stepType: 'WARMUP', durationType: 'TIME', durationValue: 900 },
          {
            stepType: 'REPEAT',
            repeatBlock: {
              repetitions: 6,
              childSteps: [
                {
                  stepType: 'INTERVAL_ACTIVE',
                  durationType: 'DISTANCE',
                  durationValue: 1000,
                  targets: [{ targetType: 'ZONE', targetValue: 28 }],
                },
              ],
            },
          },
        ],
      },
    }),
  };
  const prisma = {
    coachAthlete: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
  };
  const controller = new AIFeaturesController(
    generation as unknown as EventGenerationService,
    {} as EventModificationService,
    prisma as unknown as PrismaService,
  );
  return { controller, generation, prisma };
}

describe('POST agent/ai/events/structure', () => {
  it('returns only the steps, built from the session being edited', async () => {
    const { controller, generation } = setup();
    const result = await controller.generateWorkoutStructure(coach, {
      athleteId: 7,
      sport: SPORT_TYPE.RUNNING,
      name: 'Series 6x1000',
      description: 'At 10 km pace',
      goalDuration: 3600,
      instructions: '90 s recovery',
    });

    expect(result).toEqual({
      steps: [
        expect.objectContaining({
          stepType: 'WARMUP',
          durationValue: 900,
          targets: [],
        }),
        expect.objectContaining({
          stepType: 'REPEAT',
          repeatBlock: {
            repetitions: 6,
            childSteps: [
              expect.objectContaining({
                stepType: 'INTERVAL_ACTIVE',
                targets: [
                  expect.objectContaining({
                    targetType: 'ZONE',
                    targetValue: 28,
                  }),
                ],
              }),
            ],
          },
        }),
      ],
    });
    const [prompt, athleteId, userId, memoryNote] =
      generation.generateTrainingEvent.mock.calls[0];
    expect(athleteId).toBe(7);
    expect(userId).toBe(3);
    expect(prompt).toContain('Keep the sport RUNNING');
    expect(prompt).toContain('Session name: Series 6x1000');
    expect(prompt).toContain('Session description: At 10 km pace');
    expect(prompt).toContain('duration 60 min');
    expect(prompt).toContain('Structure requested by the coach: 90 s recovery');
    // The coach memory keeps a short note, not the composed prompt.
    expect(memoryNote).toBe(
      'Built the workout structure of RUNNING session "Series 6x1000": 90 s recovery',
    );
  });

  it('refuses athletes the coach is not linked to', async () => {
    const { controller, generation, prisma } = setup();
    prisma.coachAthlete.findFirst.mockResolvedValue(null);
    await expect(
      controller.generateWorkoutStructure(coach, {
        athleteId: 9,
        sport: SPORT_TYPE.RUNNING,
        name: 'x',
      }),
    ).rejects.toThrow();
    expect(generation.generateTrainingEvent).not.toHaveBeenCalled();
  });
});
