import { SportType } from '@openathlete/database';

import { buildZonesContext, describeZoneSports } from './event-ai-helpers';

const ALL = Object.values(SportType) as string[];
const RUN = ['RUNNING', 'TRAIL_RUNNING', 'VIRTUAL_RUN'];

const zones = {
  HEARTRATE: [
    {
      trainingZoneId: 26,
      type: 'HEARTRATE',
      index: 0,
      name: 'Zone 1',
      description: 'Recovery',
      values: [{ min: 60, max: 137, sports: ALL }],
    },
  ],
  PACE: [
    {
      trainingZoneId: 40,
      type: 'PACE',
      index: 0,
      name: 'Easy',
      description: '',
      values: [{ min: 5, max: 6, sports: RUN }],
    },
  ],
} as never;

describe('describeZoneSports', () => {
  it('leaves out sports when a value applies to all of them', () => {
    expect(describeZoneSports(ALL)).toBe('');
    expect(describeZoneSports([])).toBe('');
  });

  it('lists a few sports, or the exceptions when that is shorter', () => {
    expect(describeZoneSports(RUN)).toBe(RUN.join(', '));
    expect(
      describeZoneSports(ALL.filter((sport) => sport !== 'SWIMMING')),
    ).toBe('all sports except SWIMMING');
  });
});

describe('buildZonesContext', () => {
  it('never enumerates every sport and states zone ID usage once per type', () => {
    const context = buildZonesContext(zones);
    expect(context).toBe(
      [
        'HEARTRATE Zones:',
        '  Zone ID 26 Zone 1 - Recovery: 60-137',
        '  Use the zone ID for ZONE targets of type HEARTRATE.',
        'PACE Zones:',
        `  Zone ID 40 Easy: 5-6 (${RUN.join(', ')})`,
        '  Use the zone ID for ZONE targets of type PACE.',
      ].join('\n'),
    );
  });

  it('keeps only the values of a known sport, without IDs when not needed', () => {
    expect(buildZonesContext(zones, { sport: 'CYCLING', ids: false })).toBe(
      'HEARTRATE Zones:\n  Zone 1 - Recovery: 60-137',
    );
    expect(buildZonesContext(zones, { sport: 'RUNNING', ids: false })).toBe(
      [
        'HEARTRATE Zones:',
        '  Zone 1 - Recovery: 60-137',
        'PACE Zones:',
        '  Easy: 5-6',
      ].join('\n'),
    );
    expect(buildZonesContext({} as never, { sport: 'RUNNING' })).toBe('');
  });
});
