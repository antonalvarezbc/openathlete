import { SPORT_TYPE } from '@openathlete/shared';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
// Load order of the auth/subscription barrels (circular import).
import '../../subscription';
import { EventGenerationService } from '../services/event-generation.service';
import { EventModificationService } from '../services/event-modification.service';
import { WorkoutParserService } from '../services/workout-parser.service';
import { AIFeaturesController } from './ai-features.controller';

jest.mock('../services/event-generation.service', () => ({
  EventGenerationService: class {},
}));
jest.mock('../services/event-modification.service', () => ({
  EventModificationService: class {},
}));
jest.mock('../services/workout-parser.service', () => ({
  WorkoutParserService: class {},
}));

const coach = { userId: 3, roles: ['COACH'] } as AuthUser;
// The coach's model for written workouts.
const model = { task: 'WORKOUT_PARSER', userId: 3 };
const steps = [
  { stepType: 'WARMUP', durationType: 'TIME', durationValue: 900 },
];

function setup() {
  const parser = {
    resolveModel: jest.fn().mockResolvedValue(model),
    parse: jest.fn().mockResolvedValue(steps),
    parseSession: jest
      .fn()
      .mockResolvedValue({ steps, name: 'Series', sport: 'RUNNING' }),
  };
  const generation = { generateTrainingEvent: jest.fn() };
  const prisma = {
    coachAthlete: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
  };
  const controller = new AIFeaturesController(
    generation as unknown as EventGenerationService,
    {} as EventModificationService,
    prisma as unknown as PrismaService,
    parser as unknown as WorkoutParserService,
  );
  return { controller, parser, generation, prisma };
}

describe('POST agent/ai/events/structure', () => {
  it('converts the written workout with the parser, not the session generator', async () => {
    const { controller, parser, generation } = setup();
    const result = await controller.generateWorkoutStructure(coach, {
      athleteId: 7,
      sport: SPORT_TYPE.RUNNING,
      name: 'Series',
      description: 'Old description',
      instructions: "15' calentar + 3x8' RPE 6-7",
    });
    expect(result).toEqual({ steps });
    expect(parser.resolveModel).toHaveBeenCalledWith(3);
    expect(parser.parse).toHaveBeenCalledWith(
      {
        text: "15' calentar + 3x8' RPE 6-7",
        sport: SPORT_TYPE.RUNNING,
        athleteId: 7,
      },
      model,
    );
    expect(generation.generateTrainingEvent).not.toHaveBeenCalled();
  });

  it('uses the description, then the name, when no text is given', async () => {
    const { controller, parser } = setup();
    await controller.generateWorkoutStructure(coach, {
      athleteId: 7,
      sport: SPORT_TYPE.RUNNING,
      name: 'Rodaje',
      description: "45' suave",
    });
    expect(parser.parse.mock.calls[0][0].text).toBe("45' suave");
    await controller.generateWorkoutStructure(coach, {
      athleteId: 7,
      sport: SPORT_TYPE.RUNNING,
      name: "Rodaje 45'",
    });
    expect(parser.parse.mock.calls[1][0].text).toBe("Rodaje 45'");
  });

  it('works without an athlete for templates', async () => {
    const { controller, parser, prisma } = setup();
    await controller.generateWorkoutStructure(coach, {
      sport: SPORT_TYPE.CYCLING,
      instructions: "4x5' a 250 W",
    });
    expect(parser.parse.mock.calls[0][0].athleteId).toBeUndefined();
    expect(prisma.coachAthlete.findFirst).not.toHaveBeenCalled();
  });

  it('also names a new session when no sport is sent', async () => {
    const { controller, parser } = setup();
    const result = await controller.generateWorkoutStructure(coach, {
      athleteId: 7,
      instructions: "3x8' a 4:35/km",
    });
    expect(result).toEqual({ steps, name: 'Series', sport: 'RUNNING' });
    expect(parser.parseSession).toHaveBeenCalledWith(
      { text: "3x8' a 4:35/km", athleteId: 7 },
      model,
    );
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('refuses athletes the coach is not linked to', async () => {
    const { controller, parser, prisma } = setup();
    prisma.coachAthlete.findFirst.mockResolvedValue(null);
    await expect(
      controller.generateWorkoutStructure(coach, {
        athleteId: 9,
        sport: SPORT_TYPE.RUNNING,
        name: 'x',
      }),
    ).rejects.toThrow();
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('needs AI for written workouts', async () => {
    const { controller, parser } = setup();
    parser.resolveModel.mockRejectedValue(new Error('AI_NOT_CONFIGURED'));
    await expect(
      controller.generateWorkoutStructure(coach, {
        sport: SPORT_TYPE.RUNNING,
        instructions: "30' Z2",
      }),
    ).rejects.toThrow('AI_NOT_CONFIGURED');
    expect(parser.parse).not.toHaveBeenCalled();
  });
});
