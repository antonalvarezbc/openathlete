import { BadRequestException } from '@nestjs/common';

import {
  AdaptationSession,
  PlanAdaptationProposal,
  PlanAdaptationRequest,
  SPORT_TYPE,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
  WORKOUT_TARGET_TYPE,
  adaptationWorkoutSchema,
  applyPlanAdaptationSchema,
  planAdaptationProposalSchema,
} from '@openathlete/shared';

import { adaptationWeek } from './adaptation-dates';
import type { PlanAdaptationContext } from './plan-adaptation.service';
import { validateAdaptation } from './plan-adaptation.validation';

const request: PlanAdaptationRequest = {
  athleteId: 4,
  planId: 10,
  scope: 'NEXT_SESSION',
  weekStart: '2030-10-21',
  timeZone: 'Europe/Madrid',
  readiness: 'READY',
  currentState: 'Recovered and rested',
  instructions: '',
  allowIncrease: false,
  maxIncreasePercent: 10,
};
const original: AdaptationSession = {
  eventId: 1,
  action: 'KEEP',
  reason: 'Original',
  name: 'Easy run',
  sport: SPORT_TYPE.RUNNING,
  description: '',
  goalDuration: 3600,
  goalDistance: 6000,
  goalElevationGain: 100,
  goalRpe: 3,
  workout: {
    steps: [
      {
        stepType: WORKOUT_STEP_TYPE.STEADY,
        name: null,
        notes: null,
        durationType: WORKOUT_DURATION_TYPE.TIME,
        durationValue: 3600,
        targets: [],
        repeatBlock: null,
      },
    ],
  },
};
function context(): PlanAdaptationContext {
  return {
    sessions: [
      {
        rescheduleStart: '2030-10-21T00:00:00Z',
        rescheduleEnd: '2030-10-28T00:00:00Z',
        startDate: '2030-10-22T07:00:00Z',
        endDate: '2030-10-22T08:00:00Z',
        exported: false,
        original: structuredClone(original),
      },
    ],
    injuries: [],
    zones: [],
    surroundingCalendar: [],
  } as unknown as PlanAdaptationContext;
}
function proposal(multiplier = 1): PlanAdaptationProposal {
  const session = structuredClone(original);
  session.action = 'UPDATE';
  session.reason = 'Specific evidence';
  session.goalDuration *= multiplier;
  session.workout!.steps[0].durationValue! *= multiplier;
  return { summary: 'Adaptation', warnings: [], sessions: [session] };
}

describe('Plan adaptation change limits', () => {
  test('permits a reduction without permission to increase', () => {
    expect(() =>
      validateAdaptation(request, context(), proposal(0.8)),
    ).not.toThrow();
  });
  test('blocks an increase by default', () => {
    expect(() => validateAdaptation(request, context(), proposal(1.1))).toThrow(
      BadRequestException,
    );
  });
  test('permits a justified increase at the configured boundary', () => {
    expect(() =>
      validateAdaptation(
        { ...request, allowIncrease: true },
        context(),
        proposal(1.1),
      ),
    ).not.toThrow();
  });
  test('rejects increases above the selected limit', () => {
    expect(() =>
      validateAdaptation(
        { ...request, allowIncrease: true },
        context(),
        proposal(1.11),
      ),
    ).toThrow();
  });
  test.each(['UNKNOWN', 'TIRED', 'ILL', 'PAIN'] as const)(
    'blocks increases with %s state',
    (readiness) => {
      expect(() =>
        validateAdaptation(
          { ...request, readiness, allowIncrease: true },
          context(),
          proposal(1.1),
        ),
      ).toThrow();
    },
  );
  test('blocks increases with unresolved injury records', () => {
    const c = context();
    c.injuries = [{ location: 'calf' }] as PlanAdaptationContext['injuries'];
    expect(() =>
      validateAdaptation({ ...request, allowIncrease: true }, c, proposal(1.1)),
    ).toThrow();
  });
  test('rejects invented event IDs and duplicate proposals', () => {
    const p = proposal();
    p.sessions[0].eventId = 999;
    expect(() => validateAdaptation(request, context(), p)).toThrow();
    p.sessions = [structuredClone(original), structuredClone(original)];
    expect(() => validateAdaptation(request, context(), p)).toThrow();
  });
  test('cannot hide changes behind KEEP', () => {
    const p = proposal();
    p.sessions[0].action = 'KEEP';
    p.sessions[0].goalDuration = 4200;
    expect(() => validateAdaptation(request, context(), p)).toThrow();
  });
  test('protects exported workouts', () => {
    const c = context();
    c.sessions[0].exported = true;
    expect(() => validateAdaptation(request, c, proposal(0.8))).toThrow();
  });
  test('rejects increases without a positive baseline', () => {
    const c = context();
    c.sessions[0].original.goalDistance = null;
    expect(() =>
      validateAdaptation({ ...request, allowIncrease: true }, c, proposal()),
    ).toThrow();
  });
  test('checks workout exposure, not just the summary duration', () => {
    const p = proposal();
    p.sessions[0].workout!.steps[0].durationValue = 4000;
    expect(() => validateAdaptation(request, context(), p)).toThrow();
  });
  test('rest is zero goals with no workout', () => {
    const p = proposal();
    Object.assign(p.sessions[0], {
      action: 'REST',
      goalDuration: 0,
      goalDistance: 0,
      goalElevationGain: 0,
      goalRpe: 0,
      workout: null,
    });
    expect(() => validateAdaptation(request, context(), p)).not.toThrow();
    p.sessions[0].goalDuration = 10;
    expect(() => validateAdaptation(request, context(), p)).toThrow();
  });
  test('requires explicit confirmation and rejects extra model fields', () => {
    expect(
      applyPlanAdaptationSchema.safeParse({
        request,
        contextVersion: 'a'.repeat(64),
        proposal: proposal(),
        confirmed: false,
      }).success,
    ).toBe(false);
    expect(
      planAdaptationProposalSchema.safeParse({
        ...proposal(),
        executeSql: 'untrusted',
      }).success,
    ).toBe(false);
  });
  test('cannot use a session from another scope even with matching totals', () => {
    const c = context();
    c.sessions.push({
      ...c.sessions[0],
      original: { ...original, eventId: 2 },
    });
    expect(() => validateAdaptation(request, c, proposal())).toThrow();
  });
});

describe('Adaptation calendar boundaries', () => {
  test('handles a 169-hour week over the autumn DST transition', () => {
    const range = adaptationWeek('2030-10-21', 'Europe/Madrid');
    expect(range.start.toISOString()).toBe('2030-10-20T22:00:00.000Z');
    expect((range.end.getTime() - range.start.getTime()) / 3600000).toBe(169);
  });
  test('rejects impossible dates', () => {
    expect(() => adaptationWeek('2030-02-30', 'Europe/Madrid')).toThrow();
  });
});

describe('Optional redistribution', () => {
  const enabled = { ...request, allowRedistribution: true };
  test('moving a session requires opt-in', () => {
    const p = proposal();
    p.sessions[0].startDate = '2030-10-23T07:00:00Z';
    expect(() => validateAdaptation(request, context(), p)).toThrow(
      'explicit permission',
    );
    expect(() => validateAdaptation(enabled, context(), p)).not.toThrow();
  });
  test.each([
    '2030-10-20T07:00:00Z',
    '2030-10-28T00:00:00Z',
    '2030-10-27T23:30:00Z',
  ])('rejects dates or ends outside bounds: %s', (date) => {
    const p = proposal();
    p.sessions[0].startDate = date;
    expect(() => validateAdaptation(enabled, context(), p)).toThrow(
      'original plan week',
    );
  });
  test('KEEP cannot conceal a date change', () => {
    const p = proposal();
    p.sessions[0].action = 'KEEP';
    p.sessions[0].startDate = '2030-10-23T07:00:00Z';
    expect(() => validateAdaptation(enabled, context(), p)).toThrow(
      'original date',
    );
  });
  test('detects overlap with an event that started earlier', () => {
    const c = context();
    c.surroundingCalendar = [
      {
        eventId: 99,
        date: new Date('2030-10-23T06:00:00Z'),
        endDate: new Date('2030-10-23T07:30:00Z'),
      },
    ] as PlanAdaptationContext['surroundingCalendar'];
    const p = proposal();
    p.sessions[0].startDate = '2030-10-23T07:00:00Z';
    expect(() => validateAdaptation(enabled, c, p)).toThrow('overlaps');
  });
  test('allows a swap but rejects collisions between final positions', () => {
    const c = context();
    c.sessions.push({
      ...c.sessions[0],
      startDate: '2030-10-23T07:00:00Z',
      endDate: '2030-10-23T08:00:00Z',
      original: { ...original, eventId: 2 },
    });
    const p = proposal();
    p.sessions[0].startDate = c.sessions[1].startDate;
    p.sessions.push({
      ...p.sessions[0],
      eventId: 2,
      startDate: c.sessions[0].startDate,
    });
    expect(() => validateAdaptation(enabled, c, p)).not.toThrow();
    p.sessions[1].startDate = p.sessions[0].startDate;
    expect(() => validateAdaptation(enabled, c, p)).toThrow('overlaps');
  });
});

describe('Adding reviewed sessions', () => {
  const enabled: PlanAdaptationRequest = {
    ...request,
    scope: 'WEEK',
    allowNewSessions: true,
    maxNewSessions: 2,
    newSessionMinutes: 60,
    newSessionMaxRpe: 4,
  };
  const addition = {
    trainingWeekId: 7,
    startDate: '2030-10-23T07:00:00Z',
    reason: 'Reviewed recovery',
    name: 'Easy run',
    description: 'Comfortable effort',
    sport: SPORT_TYPE.RUNNING,
    goalDuration: 1800,
    goalRpe: 3,
    workout: {
      steps: [{ ...original.workout!.steps[0], durationValue: 1800 }],
    },
  };
  function setup() {
    const c = context();
    c.availableWeeks = [
      {
        trainingWeekId: 7,
        startDate: '2030-10-21T00:00:00Z',
        endDate: '2030-10-28T00:00:00Z',
      },
    ];
    const p = { ...proposal(), newSessions: [{ ...addition }] };
    return { c, p };
  }
  test.each([false, true])(
    'independent permissions: allowIncrease=%s',
    (allowIncrease) => {
      for (const allowNewSessions of [false, true]) {
        const { c } = setup();
        const permissions = { ...enabled, allowIncrease, allowNewSessions };
        const reduced = proposal(0.8);
        expect(() => validateAdaptation(permissions, c, reduced)).not.toThrow();
        const increased = proposal(1.1);
        if (allowIncrease)
          expect(() =>
            validateAdaptation(permissions, c, increased),
          ).not.toThrow();
        else
          expect(() => validateAdaptation(permissions, c, increased)).toThrow();
        const added = { ...reduced, newSessions: [addition] };
        if (allowNewSessions)
          expect(() => validateAdaptation(permissions, c, added)).not.toThrow();
        else expect(() => validateAdaptation(permissions, c, added)).toThrow();
        const combined = { ...increased, newSessions: [addition] };
        if (allowIncrease && allowNewSessions)
          expect(() =>
            validateAdaptation(permissions, c, combined),
          ).not.toThrow();
        else
          expect(() => validateAdaptation(permissions, c, combined)).toThrow();
      }
    },
  );
  test('keeps the existing session and adds separately budgeted sessions', () => {
    const { c, p } = setup();
    p.sessions[0].action = 'KEEP';
    expect(() => validateAdaptation(enabled, c, p)).not.toThrow();
  });
  test('can fill an empty future week only with explicit permission', () => {
    const { c, p } = setup();
    c.sessions = [];
    p.sessions = [];
    expect(() => validateAdaptation(enabled, c, p)).not.toThrow();
    expect(() =>
      validateAdaptation({ ...enabled, allowNewSessions: false }, c, p),
    ).toThrow();
  });
  test.each(['UNKNOWN', 'TIRED', 'ILL', 'PAIN'] as const)(
    'rejects additions for %s',
    (readiness) => {
      const { c, p } = setup();
      expect(() =>
        validateAdaptation({ ...enabled, readiness }, c, p),
      ).toThrow();
    },
  );
  test('rejects injuries, next-session scope, absent budgets and foreign weeks', () => {
    const { c, p } = setup();
    expect(() =>
      validateAdaptation({ ...enabled, scope: 'NEXT_SESSION' }, c, p),
    ).toThrow();
    expect(() =>
      validateAdaptation({ ...enabled, newSessionMinutes: undefined }, c, p),
    ).toThrow();
    p.newSessions[0].trainingWeekId = 99;
    expect(() => validateAdaptation(enabled, c, p)).toThrow();
    p.newSessions[0].trainingWeekId = 7;
    c.injuries = [{ location: 'calf' }] as PlanAdaptationContext['injuries'];
    expect(() => validateAdaptation(enabled, c, p)).toThrow();
  });
  test('checks total additional minutes and RPE, not just each session', () => {
    const { c, p } = setup();
    p.newSessions.push({
      ...addition,
      startDate: '2030-10-24T07:00:00Z',
      goalDuration: 1860,
    });
    expect(() => validateAdaptation(enabled, c, p)).toThrow('budget');
    p.newSessions.pop();
    p.newSessions[0].goalRpe = 5;
    expect(() => validateAdaptation(enabled, c, p)).toThrow('budget');
    p.newSessions[0].goalRpe = 3;
    expect(() =>
      validateAdaptation({ ...enabled, maxNewSessions: undefined }, c, p),
    ).toThrow('budget');
  });
  test('rejects collisions with existing sessions and between new sessions', () => {
    const { c, p } = setup();
    p.newSessions[0].startDate = c.sessions[0].startDate;
    expect(() => validateAdaptation(enabled, c, p)).toThrow('overlaps');
    p.newSessions[0].startDate = addition.startDate;
    p.newSessions.push({ ...addition });
    expect(() => validateAdaptation(enabled, c, p)).toThrow('overlaps');
  });
  test('rejects past dates, out-of-week ends and empty proposals', () => {
    const { c, p } = setup();
    p.newSessions[0].startDate = '2030-10-20T07:00:00Z';
    expect(() => validateAdaptation(enabled, c, p)).toThrow('future week');
    p.newSessions[0].startDate = '2030-10-27T23:45:00Z';
    expect(() => validateAdaptation(enabled, c, p)).toThrow('future week');
    c.sessions = [];
    p.sessions = [];
    p.newSessions = [];
    expect(() => validateAdaptation(enabled, c, p)).toThrow('empty');
  });
  test('counts repeat blocks and rejects targets hidden on repeat parents', () => {
    const { c, p } = setup();
    const child = {
      stepType: WORKOUT_STEP_TYPE.STEADY,
      durationType: WORKOUT_DURATION_TYPE.TIME,
      durationValue: 600,
      name: null,
      notes: null,
      targets: [],
    };
    p.newSessions[0].workout.steps = [
      {
        ...child,
        stepType: WORKOUT_STEP_TYPE.REPEAT,
        repeatBlock: { repetitions: 3, childSteps: [child] },
      },
    ];
    expect(planAdaptationProposalSchema.safeParse(p).success).toBe(true);
    expect(() => validateAdaptation(enabled, c, p)).not.toThrow();
    p.newSessions[0].workout.steps[0].repeatBlock!.repetitions = 4;
    expect(() => validateAdaptation(enabled, c, p)).toThrow('must match');
    p.newSessions[0].workout.steps[0].repeatBlock!.repetitions = 3;
    p.newSessions[0].workout.steps[0].targets = [
      {
        targetType: WORKOUT_TARGET_TYPE.RPE,
        targetValue: 10,
        targetMin: null,
        targetMax: null,
        metricType: null,
      },
    ];
    expect(() => validateAdaptation(enabled, c, p)).toThrow('child blocks');
  });
  test('uses stable error codes for localized interface messages', () => {
    const { c, p } = setup();
    try {
      validateAdaptation(request, c, p);
      throw new Error('Expected rejection');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'ADAPTATION_NEW_PERMISSION',
      });
    }
  });
});

describe('Adding structure without changing planned goals', () => {
  test('structures an existing session with no workout within its original duration/RPE', () => {
    const c = context();
    c.sessions[0].original.workout = null;
    const p = proposal();
    expect(() => validateAdaptation(request, c, p)).not.toThrow();
    p.sessions[0].workout!.steps[0].targets = [
      {
        targetType: WORKOUT_TARGET_TYPE.RPE,
        targetValue: 8,
        targetMin: null,
        targetMax: null,
        metricType: null,
      },
    ];
    expect(() => validateAdaptation(request, c, p)).toThrow('ceiling');
  });
  test('rejects incomplete structured duration for a previously unstructured session', () => {
    const c = context();
    c.sessions[0].original.workout = null;
    const p = proposal();
    p.sessions[0].workout!.steps[0].durationValue = 100;
    expect(() => validateAdaptation(request, c, p)).toThrow('must match');
  });
});

describe('LLM workout format compatibility', () => {
  const block = {
    stepType: WORKOUT_STEP_TYPE.STEADY,
    name: null,
    notes: null,
    durationType: WORKOUT_DURATION_TYPE.TIME,
    durationValue: 600,
    targets: [],
  };
  test('normalizes omitted repeatBlock for ordinary blocks', () => {
    const parsed = adaptationWorkoutSchema.parse({ steps: [block] });
    expect(parsed.steps[0].repeatBlock).toBeNull();
  });
  test('accepts a zero-duration repeat container but rejects zero-duration work', () => {
    expect(
      adaptationWorkoutSchema.safeParse({
        steps: [
          {
            ...block,
            stepType: WORKOUT_STEP_TYPE.REPEAT,
            durationValue: 0,
            repeatBlock: { repetitions: 3, childSteps: [block] },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      adaptationWorkoutSchema.safeParse({
        steps: [{ ...block, durationValue: 0 }],
      }).success,
    ).toBe(false);
    expect(
      adaptationWorkoutSchema.safeParse({
        steps: [
          {
            ...block,
            stepType: WORKOUT_STEP_TYPE.REPEAT,
            durationValue: 0,
            repeatBlock: {
              repetitions: 3,
              childSteps: [{ ...block, durationValue: 0 }],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
  test('permits a read-only recommendation to add nothing but cannot apply an empty proposal', () => {
    const c = context();
    c.sessions = [];
    const p = {
      summary: 'No additional sessions recommended',
      warnings: [],
      sessions: [],
      newSessions: [],
    };
    expect(() => validateAdaptation(request, c, p, true)).not.toThrow();
    expect(() => validateAdaptation(request, c, p)).toThrow('empty');
  });
});
