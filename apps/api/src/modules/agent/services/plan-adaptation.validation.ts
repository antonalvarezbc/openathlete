import { BadRequestException } from '@nestjs/common';

import {
  AdaptationNewSession,
  AdaptationSession,
  PlanAdaptationProposal,
  PlanAdaptationRequest,
} from '@openathlete/shared';

import type { PlanAdaptationContext } from './plan-adaptation.service';

function fail(message: string, code = 'ADAPTATION_INVALID'): never {
  throw new BadRequestException({ code, message });
}
function forSession(name: string, validate: () => void) {
  try {
    validate();
  } catch (error) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      throw new BadRequestException({
        ...(typeof response === 'object' ? response : { message: response }),
        sessionName: name,
      });
    }
    throw error;
  }
}
const numericKeys = [
  'goalDuration',
  'goalDistance',
  'goalElevationGain',
  'goalRpe',
] as const;

function exposure(
  session: Pick<AdaptationSession, 'workout'>,
  context: PlanAdaptationContext,
) {
  const totals: Record<string, number> = {};
  for (const step of session.workout?.steps ?? []) {
    const repetitions = step.repeatBlock?.repetitions ?? 1;
    const children = step.repeatBlock?.childSteps ?? [step];
    for (const child of children) {
      if (child.stepType === 'REPEAT')
        fail(
          'Nested workout repeats are not supported',
          'ADAPTATION_STRUCTURE',
        );
      if (
        !['OPEN', 'LAP_BUTTON'].includes(child.durationType) &&
        child.durationValue == null
      )
        fail('Workout duration is missing', 'ADAPTATION_STRUCTURE');
      const amount = child.durationValue ?? 0;
      totals[`duration:${child.durationType}`] =
        (totals[`duration:${child.durationType}`] ?? 0) + repetitions * amount;
      for (const target of child.targets) {
        if (
          target.targetMin != null &&
          target.targetMax != null &&
          target.targetMin > target.targetMax
        )
          fail('Invalid target range', 'ADAPTATION_TARGET');
        let maximum = Math.max(
          target.targetValue ?? 0,
          target.targetMax ?? 0,
          target.targetMin ?? 0,
        );
        let key = `${target.targetType}:${target.metricType ?? 'absolute'}`;
        if (target.targetType === 'ZONE') {
          const zone = context.zones.find(
            (zone) => zone.trainingZoneId === target.targetValue,
          );
          if (!zone)
            fail(
              'Workout references a zone outside this athlete',
              'ADAPTATION_TARGET',
            );
          maximum = zone.index + 1;
          key = `ZONE:${zone.type}`;
        }
        totals[`peak:${key}`] = Math.max(totals[`peak:${key}`] ?? 0, maximum);
        const weighted = `exposure:${key}:${child.durationType}`;
        totals[weighted] =
          (totals[weighted] ?? 0) + repetitions * amount * maximum;
      }
    }
    if (step.stepType === 'REPEAT' && !step.repeatBlock)
      fail('REPEAT needs child steps', 'ADAPTATION_STRUCTURE');
    if (step.stepType !== 'REPEAT' && step.repeatBlock)
      fail('Only REPEAT can have child steps', 'ADAPTATION_STRUCTURE');
  }
  return totals;
}

/** Time-based structure with explicit RPE ceilings, including repeat multipliers. */
function validateTimeWorkout(
  session: Pick<AdaptationNewSession, 'workout' | 'goalDuration'>,
  maxRpe: number,
  context: PlanAdaptationContext,
) {
  if (!session.workout?.steps.length)
    fail('A structured workout is required', 'ADAPTATION_STRUCTURE');
  exposure(session, context);
  let seconds = 0;
  for (const step of session.workout.steps) {
    if (step.repeatBlock && step.targets.length)
      fail('Repeat targets belong on child blocks', 'ADAPTATION_TARGET');
    for (const child of step.repeatBlock?.childSteps ?? [step]) {
      if (child.durationType !== 'TIME' || !child.durationValue)
        fail('New structure requires timed blocks', 'ADAPTATION_STRUCTURE');
      seconds += child.durationValue * (step.repeatBlock?.repetitions ?? 1);
      for (const target of child.targets) {
        if (
          target.targetType !== 'RPE' ||
          target.metricType != null ||
          ![target.targetMin, target.targetMax, target.targetValue].some(
            (value) => value != null,
          ) ||
          Math.max(
            target.targetMin ?? 0,
            target.targetMax ?? 0,
            target.targetValue ?? 0,
          ) > maxRpe
        )
          fail(
            'New block targets must use absolute RPE within the authorized ceiling',
            'ADAPTATION_TARGET',
          );
      }
    }
  }
  if (Math.abs(seconds - session.goalDuration) > 1)
    fail(
      'Structured block time must match session duration',
      'ADAPTATION_DURATION',
    );
}

/** These are technical change limits, not a physiological model of training load. */
export function validateAdaptation(
  request: PlanAdaptationRequest,
  context: PlanAdaptationContext,
  proposal: PlanAdaptationProposal,
  allowEmpty = false,
) {
  const originals = new Map(
    context.sessions.map((item) => [item.original.eventId, item.original]),
  );
  const ids = proposal.sessions.map((session) => session.eventId);
  if (
    new Set(ids).size !== ids.length ||
    ids.length !== originals.size ||
    ids.some((id) => !originals.has(id))
  )
    fail(
      'Proposal must contain each eligible session exactly once',
      'ADAPTATION_IDS',
    );
  const additions = proposal.newSessions ?? [];
  if (!proposal.sessions.length && !additions.length && !allowEmpty)
    fail('Proposal is empty', 'ADAPTATION_EMPTY');
  if (additions.length) {
    if (
      !request.allowNewSessions ||
      request.scope !== 'WEEK' ||
      request.readiness !== 'READY' ||
      context.injuries.length
    )
      fail(
        'New sessions require explicit permission, WEEK scope, READY state and no unresolved injury',
        'ADAPTATION_NEW_PERMISSION',
      );
    if (
      !request.maxNewSessions ||
      !request.newSessionMinutes ||
      !request.newSessionMaxRpe ||
      additions.length > request.maxNewSessions ||
      additions.reduce((sum, session) => sum + session.goalDuration, 0) >
        request.newSessionMinutes * 60 ||
      additions.some(
        (session) => session.goalRpe > (request.newSessionMaxRpe ?? 0),
      )
    )
      fail(
        'New sessions exceed the explicit count, time or RPE budget',
        'ADAPTATION_NEW_BUDGET',
      );
    for (const session of additions) {
      forSession(session.name, () =>
        validateTimeWorkout(session, request.newSessionMaxRpe!, context),
      );
      const week = context.availableWeeks.find(
        (week) => week.trainingWeekId === session.trainingWeekId,
      );
      const start = new Date(session.startDate).getTime();
      if (
        !week ||
        !Number.isFinite(start) ||
        start < new Date(week.startDate).getTime() ||
        start >= new Date(week.endDate).getTime() ||
        start + session.goalDuration * 1000 > new Date(week.endDate).getTime()
      )
        fail(
          'New session must belong to an available future week of this plan',
          'ADAPTATION_DATE',
        );
    }
  }
  // Validate final positions together so swapping two sessions is possible.
  const positions = proposal.sessions.map((session) => {
    const item = context.sessions.find(
      (item) => item.original.eventId === session.eventId,
    )!;
    const start = new Date(session.startDate ?? item.startDate).getTime();
    const oldStart = new Date(item.startDate).getTime();
    const moved = start !== oldStart;
    const end =
      session.action === 'KEEP'
        ? new Date(item.endDate).getTime()
        : start + session.goalDuration * 1000;
    if (!Number.isFinite(start))
      fail('Invalid proposed date', 'ADAPTATION_DATE');
    if (moved) {
      if (!request.allowRedistribution)
        fail(
          'Redistribution requires explicit permission',
          'ADAPTATION_REDISTRIBUTION',
        );
      if (session.action === 'KEEP')
        fail('KEEP must preserve the original date', 'ADAPTATION_KEEP');
      if (
        start < new Date(item.rescheduleStart).getTime() ||
        start >= new Date(item.rescheduleEnd).getTime() ||
        end > new Date(item.rescheduleEnd).getTime()
      )
        fail(
          'Proposed date must remain in the future and within the selected period and original plan week',
          'ADAPTATION_DATE',
        );
    }
    return {
      id: session.eventId,
      start,
      end,
      changed: moved || end > new Date(item.endDate).getTime(),
    };
  });
  positions.push(
    ...additions.map((session, index) => ({
      id: -(index + 1),
      start: new Date(session.startDate).getTime(),
      end: new Date(session.startDate).getTime() + session.goalDuration * 1000,
      changed: true,
    })),
  );
  for (const position of positions.filter((item) => item.changed)) {
    const obstacles = [
      ...positions.filter((item) => item.id !== position.id),
      ...context.surroundingCalendar
        .filter((event) => !originals.has(event.eventId))
        .map((event) => ({
          start: new Date(event.date).getTime(),
          end: new Date(event.endDate).getTime(),
        })),
    ];
    if (
      obstacles.some(
        (other) => position.start < other.end && position.end > other.start,
      )
    )
      fail(
        'Proposed schedule overlaps another scheduled event',
        'ADAPTATION_OVERLAP',
      );
  }
  const canIncrease =
    request.allowIncrease &&
    request.readiness === 'READY' &&
    context.injuries.length === 0;
  const ratio = 1 + (canIncrease ? request.maxIncreasePercent / 100 : 0);
  const compare = (
    oldValue: number | null | undefined,
    newValue: number | null | undefined,
    label: string,
  ) => {
    if (newValue == null || newValue <= (oldValue ?? 0)) return;
    if (!canIncrease)
      fail(
        `Increase requires explicit permission, READY state and no unresolved injuries: ${label}`,
        'ADAPTATION_INCREASE',
      );
    if (!oldValue || newValue > oldValue * ratio + 0.000001)
      fail(
        `Increase exceeds the configured limit or lacks a baseline: ${label}`,
        'ADAPTATION_INCREASE',
      );
  };
  for (const session of proposal.sessions) {
    forSession(session.name, () => {
      const original = originals.get(session.eventId)!;
      if (
        session.action !== 'KEEP' &&
        context.sessions.find(
          (item) => item.original.eventId === session.eventId,
        )?.exported
      )
        fail(
          'Exported workouts are protected; keep them unchanged',
          'ADAPTATION_EXPORTED',
        );
      if (session.action === 'KEEP') {
        for (const key of [
          'name',
          'sport',
          'description',
          ...numericKeys,
          'workout',
        ] as const) {
          if (JSON.stringify(session[key]) !== JSON.stringify(original[key]))
            fail('KEEP must preserve the original session', 'ADAPTATION_KEEP');
        }
        return;
      }
      if (session.action === 'REST') {
        if (session.workout || numericKeys.some((key) => session[key] !== 0))
          fail('REST requires zero goals and no workout', 'ADAPTATION_REST');
        return;
      }
      if (session.goalDuration <= 0)
        fail(
          'UPDATE requires a positive duration; use REST for rest',
          'ADAPTATION_DURATION',
        );
      if (
        context.sessions.find(
          (item) => item.original.eventId === session.eventId,
        )?.durationInferred &&
        session.goalDuration > original.goalDuration
      )
        fail(
          'Cannot increase duration without an explicit planned duration',
          'ADAPTATION_BASELINE',
        );
      for (const key of numericKeys)
        compare(original[key], session[key], `${session.eventId}.${key}`);
      const before = exposure(original, context);
      const after = exposure(session, context);
      if (!original.workout && session.workout) {
        validateTimeWorkout(
          { ...session, workout: session.workout },
          session.goalRpe ?? 0,
          context,
        );
      } else {
        for (const key of Object.keys(after))
          compare(before[key], after[key], `${session.eventId}.${key}`);
      }
      if (after['duration:TIME'] > session.goalDuration + 1)
        fail('Workout time exceeds session duration', 'ADAPTATION_DURATION');
    });
  }
  // Check totals as well as individual sessions. Keeping one session unchanged must not bypass a weekly cap.
  for (const key of numericKeys) {
    const before = context.sessions.reduce(
      (sum, item) => sum + (item.original[key] ?? 0),
      0,
    );
    const after = proposal.sessions.reduce(
      (sum, item) => sum + (item[key] ?? 0),
      0,
    );
    compare(before, after, `total.${key}`);
  }
}
