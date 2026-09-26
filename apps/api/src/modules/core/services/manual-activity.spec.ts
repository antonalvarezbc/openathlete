import {
  EVENT_TYPE,
  SPORT_TYPE,
  createEventDtoSchema,
  updateEventDtoSchema,
} from '@openathlete/shared';

const activity = {
  type: EVENT_TYPE.ACTIVITY,
  name: 'Manual run',
  sport: SPORT_TYPE.RUNNING,
  startDate: '2026-09-14T08:00:00Z',
  endDate: '2026-09-14T08:30:00Z',
  distance: 5000,
  elevationGain: 80,
  movingTime: 1800,
  averageSpeed: 5000 / 1800,
  maxSpeed: 4,
  rpe: 0.5,
  description: 'Comfortable effort',
};

describe('manual activity request validation', () => {
  it('preserves supplied activity metrics, RPE and comments', () => {
    expect(createEventDtoSchema.parse(activity)).toMatchObject({
      distance: 5000,
      elevationGain: 80,
      movingTime: 1800,
      averageSpeed: 5000 / 1800,
      maxSpeed: 4,
      rpe: 0.5,
      description: 'Comfortable effort',
    });
  });

  it.each([
    'distance',
    'elevationGain',
    'movingTime',
    'averageSpeed',
    'maxSpeed',
  ])('rejects missing %s before persistence', (field) => {
    expect(
      createEventDtoSchema.safeParse({ ...activity, [field]: undefined })
        .success,
    ).toBe(false);
  });

  it.each([-1, Infinity, NaN])('rejects invalid distance %s', (distance) => {
    expect(
      createEventDtoSchema.safeParse({ ...activity, distance }).success,
    ).toBe(false);
  });

  it('allows stationary activities without inventing distance or speed', () => {
    expect(
      createEventDtoSchema.safeParse({
        ...activity,
        distance: 0,
        averageSpeed: 0,
        maxSpeed: 0,
      }).success,
    ).toBe(true);
  });

  it('rejects fractional moving time', () => {
    expect(
      createEventDtoSchema.safeParse({ ...activity, movingTime: 1.5 }).success,
    ).toBe(false);
  });

  it('does not accept provider identity from manual activity requests', () => {
    const result = createEventDtoSchema.parse({
      ...activity,
      provider: 'GARMIN',
      externalId: 'garmin:123',
    });
    expect(result).not.toHaveProperty('provider');
    expect(result).not.toHaveProperty('externalId');
  });

  it('requires normalized RPE on both creation and edits', () => {
    expect(
      createEventDtoSchema.safeParse({ ...activity, rpe: 5 }).success,
    ).toBe(false);
    expect(
      updateEventDtoSchema.safeParse({ type: EVENT_TYPE.ACTIVITY, rpe: 5 })
        .success,
    ).toBe(false);
    expect(
      updateEventDtoSchema.safeParse({
        type: EVENT_TYPE.ACTIVITY,
        rpe: 0.5,
        description: 'Updated',
      }).success,
    ).toBe(true);
  });
});
