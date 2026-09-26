import { subject } from '@casl/ability';

import { Event, Workout } from '@openathlete/database';

import { AuthUser } from '../decorators/user.decorator';
import { CaslAbilityFactory } from './casl-ability.factory';

describe('Account mode permissions', () => {
  const factory = new CaslAbilityFactory();
  const user = (roles: NonNullable<AuthUser['roles']>): AuthUser => ({
    userId: 1,
    email: 'qa@example.test',
    roles,
    athlete: { athleteId: 10 },
    coachAthletes: [{ athleteId: 20 }],
  });
  const event = (athleteId: number, type = 'TRAINING') =>
    subject('Event', { athleteId, type } as Event);
  it('athlete can read planned sessions and log activities, but cannot plan even if an old coach link exists', async () => {
    const ability = await factory.getFor({ user: user(['ATHLETE']) });
    expect(ability.can('read', event(10))).toBe(true);
    for (const action of ['create', 'update', 'delete'] as const) {
      expect(ability.can(action, event(10))).toBe(false);
      expect(ability.can(action, event(10, 'ACTIVITY'))).toBe(true);
      expect(ability.can(action, event(20))).toBe(false);
    }
    expect(
      ability.can(
        'update',
        subject('Workout', {
          eventTraining: { event: { athleteId: 10 } },
        } as unknown as Workout),
      ),
    ).toBe(false);
  });
  it('coach can plan only for linked athletes and has no personal athlete calendar', async () => {
    const ability = await factory.getFor({ user: user(['COACH']) });
    expect(ability.can('update', event(20))).toBe(true);
    expect(ability.can('update', event(10))).toBe(false);
    expect(ability.can('update', event(99))).toBe(false);
  });
  it('both enables personal planning and coaching, without access to unrelated athletes', async () => {
    const ability = await factory.getFor({ user: user(['COACH', 'ATHLETE']) });
    expect(ability.can('update', event(10))).toBe(true);
    expect(ability.can('update', event(20))).toBe(true);
    expect(ability.can('update', event(99))).toBe(false);
  });
  it('missing roles never grant calendar write access', async () => {
    const { roles: _roles, ...unknown } = user(['COACH']);
    const ability = await factory.getFor({ user: unknown });
    expect(ability.can('update', event(10))).toBe(false);
    expect(ability.can('update', event(20))).toBe(false);
  });
});
