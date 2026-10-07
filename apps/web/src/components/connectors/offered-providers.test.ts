import { describe, expect, it } from 'vitest';

import { offeredProviders } from './offered-providers';

describe('offered connectors', () => {
  const supported = ['STRAVA', 'GARMIN', 'SUUNTO', 'POLAR'] as const;

  it('offers only the connectors the instance has set up', () => {
    expect(offeredProviders([...supported], ['GARMIN'], [])).toEqual([
      'GARMIN',
    ]);
  });

  it('keeps a connected account visible so it can be disconnected', () => {
    expect(offeredProviders([...supported], [], ['STRAVA'])).toEqual([
      'STRAVA',
    ]);
  });
});
