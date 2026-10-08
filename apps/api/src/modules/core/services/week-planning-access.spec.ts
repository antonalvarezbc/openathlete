import { prismaQuery } from '@casl/prisma/runtime';

import { Prisma } from '@openathlete/database';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { CaslAbilityFactory } from '../../auth/services/casl-ability.factory';
import { createPrismaAbility } from '../../auth/services/casl-prisma';
import { PrismaService } from '../../prisma/services/prisma.service';
import { EventService } from './event.service';
import { WeekPlanningService } from './week-planning.service';

jest.mock('./event.service', () => ({ EventService: class {} }));

const coach: AuthUser = {
  userId: 3,
  email: 'coach@example.test',
  roles: ['COACH'],
  athlete: null,
  coachAthletes: [{ athleteId: 7 }],
};
const actions = ['copy', 'move', 'delete'] as const;
const kinds = [
  ['pending training', 'TRAINING', null],
  ['completed training', 'TRAINING', 40],
  ['activity', 'ACTIVITY', null],
  ['note', 'NOTE', null],
  ['competition', 'COMPETITION', null],
] as const;
const missingId = 999;

function setup(athleteId = 7, abilities = new CaslAbilityFactory()) {
  const rows = kinds.map(([, type, relatedActivityId], index) => ({
    eventId: index + 1,
    athleteId,
    type,
    training: type === 'TRAINING' ? { relatedActivityId } : null,
    trainingWeek: null,
    templates: [],
  }));
  const db = {
    event: {
      // Interpret the actual CASL/Prisma predicate, not a mocked allow/deny
      // decision. An unscoped query would expose the foreign fixtures.
      findFirst: jest.fn(({ where }: { where: Prisma.EventWhereInput }) =>
        Promise.resolve(rows.find(prismaQuery(where)) ?? null),
      ),
      update: jest.fn(),
    },
  };
  const events = {
    duplicateEventComplete: jest.fn().mockResolvedValue({ eventId: 99 }),
    updateEvent: jest.fn().mockResolvedValue({}),
    deleteEvent: jest.fn().mockResolvedValue({}),
  };
  const service = new WeekPlanningService(
    db as unknown as PrismaService,
    abilities,
    events as unknown as EventService,
  );
  const run = (action: (typeof actions)[number], user = coach) => {
    const eventIds = [...rows.map(({ eventId }) => eventId), missingId];
    if (action === 'delete') return service.delete(user, { eventIds });
    return service[action](user, {
      items: eventIds.map((eventId) => ({
        eventId,
        startDate: new Date('2030-10-08T08:00:00Z'),
        endDate: new Date('2030-10-08T09:00:00Z'),
      })),
    });
  };
  return { rows, db, events, service, run };
}

describe('Week batch event authorization', () => {
  it.each(actions)(
    '%s hides all foreign event states behind the same not-found response',
    async (action) => {
      const { rows, db, events, run } = setup(70);
      const result = await run(action);
      expect(result).toEqual({
        succeeded: [],
        failed: [...rows.map(({ eventId }) => eventId), missingId].map(
          (eventId) => ({ eventId, message: 'Event not found' }),
        ),
      });
      expect(events.duplicateEventComplete).not.toHaveBeenCalled();
      expect(events.updateEvent).not.toHaveBeenCalled();
      expect(events.deleteEvent).not.toHaveBeenCalled();
      expect(db.event.update).not.toHaveBeenCalled();
    },
  );

  it.each(actions)(
    '%s hides states after the coaching link or coach role is removed',
    async (action) => {
      const users: AuthUser[] = [
        { ...coach, coachAthletes: [{ athleteId: 70 }] },
        // A remaining link grants no coaching access without the role.
        { ...coach, roles: ['ATHLETE'], athlete: { athleteId: 71 } },
        { ...coach, roles: [], athlete: null },
      ];
      for (const user of users) {
        const { rows, db, events, run } = setup();
        expect(await run(action, user)).toEqual({
          succeeded: [],
          failed: [...rows.map(({ eventId }) => eventId), missingId].map(
            (eventId) => ({ eventId, message: 'Event not found' }),
          ),
        });
        expect(events.duplicateEventComplete).not.toHaveBeenCalled();
        expect(events.updateEvent).not.toHaveBeenCalled();
        expect(events.deleteEvent).not.toHaveBeenCalled();
        expect(db.event.update).not.toHaveBeenCalled();
      }
    },
  );

  it.each(
    actions.flatMap((action) =>
      (
        [
          ['linked athlete', coach],
          [
            'own athlete',
            {
              ...coach,
              roles: ['COACH', 'ATHLETE'],
              athlete: { athleteId: 7 },
              coachAthletes: [],
            } as AuthUser,
          ],
        ] as const
      ).map(([label, user]) => [action, label, user] as const),
    ),
  )(
    '%s preserves the type and completion rules for the %s',
    async (action, _label, user) => {
      const { events, run } = setup();
      const result = await run(action, user);
      const eligibleIds = action === 'copy' ? [1, 2, 4] : [1, 4];
      expect(result.succeeded).toHaveLength(eligibleIds.length);
      expect(result.failed.find(({ eventId }) => eventId === 999)).toEqual({
        eventId: 999,
        message: 'Event not found',
      });
      for (const eventId of action === 'copy' ? [3, 5] : [2, 3, 5])
        expect(
          result.failed.find((failure) => failure.eventId === eventId),
        ).toEqual({
          eventId,
          message:
            action === 'copy'
              ? 'Only planned sessions and notes can be copied'
              : 'Only planned sessions without an activity and notes can be changed',
        });
      const mutation =
        action === 'copy'
          ? events.duplicateEventComplete
          : action === 'move'
            ? events.updateEvent
            : events.deleteEvent;
      expect(mutation.mock.calls.map(([, eventId]) => eventId)).toEqual(
        eligibleIds,
      );
    },
  );

  it.each(['read', 'create', 'update', 'delete'] as const)(
    'uses the operation-specific permissions for a %s-only Event ability',
    async (permission) => {
      const ability = createPrismaAbility([
        { action: permission, subject: 'Event', conditions: { athleteId: 7 } },
      ]);
      const abilities = new CaslAbilityFactory();
      jest.spyOn(abilities, 'getFor').mockResolvedValue(ability);
      for (const action of actions) {
        const { rows, run } = setup(7, abilities);
        const result = await run(action);
        const allowed =
          (action === 'move' && permission === 'update') ||
          (action === 'delete' && permission === 'delete');
        if (allowed) expect(result.succeeded).toHaveLength(2);
        else
          expect(result).toEqual({
            succeeded: [],
            failed: [...rows.map(({ eventId }) => eventId), missingId].map(
              (eventId) => ({ eventId, message: 'Event not found' }),
            ),
          });
      }
    },
  );

  it('requires read and create access on the same event when copying', async () => {
    const ability = createPrismaAbility([
      { action: 'read', subject: 'Event', conditions: { athleteId: 7 } },
      { action: 'create', subject: 'Event', conditions: { athleteId: 70 } },
    ]);
    const abilities = new CaslAbilityFactory();
    jest.spyOn(abilities, 'getFor').mockResolvedValue(ability);
    const { rows, run, db, events } = setup(7, abilities);
    expect(await run('copy')).toEqual({
      succeeded: [],
      failed: [...rows.map(({ eventId }) => eventId), missingId].map(
        (eventId) => ({ eventId, message: 'Event not found' }),
      ),
    });
    expect(events.duplicateEventComplete).not.toHaveBeenCalled();
    expect(db.event.update).not.toHaveBeenCalled();
  });
});
