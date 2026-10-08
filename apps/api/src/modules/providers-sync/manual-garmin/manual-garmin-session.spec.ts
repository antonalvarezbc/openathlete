import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  manualGarminAccountDirectory,
  removeManualGarminSession,
} from './manual-garmin-session';

describe('manual Garmin session files', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'oa-garmin-session-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const write = async (path: string, content = '{}') => {
    const file = join(root, path);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, content);
  };
  const list = async (path: string) => (await readdir(join(root, path))).sort();
  const session = (athleteId: number, prefix = `accounts/${athleteId}/`) =>
    Promise.all([
      write(`${prefix}.private/tokens/garmin_tokens.json`),
      write(
        `${prefix}.private/connection.json`,
        JSON.stringify({
          athleteId,
          garminUserProfileId: '123',
          timezone: 'Europe/Madrid',
        }),
      ),
      write(`${prefix}.private/sync-state.json`),
      write(`${prefix}.private/fit-backfill-state.json`),
      write(`${prefix}.private/fits/123/456.fit`, 'fit'),
    ]);

  it('builds paths from positive integer athlete IDs only', () => {
    expect(manualGarminAccountDirectory('/data/garmin', 7)).toBe(
      '/data/garmin/accounts/7',
    );
    for (const athleteId of [0, -1, 1.5, Number.NaN, 2 ** 53])
      expect(() =>
        manualGarminAccountDirectory('/data/garmin', athleteId),
      ).toThrow();
    expect(() => manualGarminAccountDirectory('data/garmin', 7)).toThrow();
  });

  it("removes the athlete's directory and leaves other athletes alone", async () => {
    await session(7);
    await session(8);
    await write('.private/request-safety.json');

    await removeManualGarminSession(root, 7);

    expect(await list('accounts')).toEqual(['8']);
    expect(await list('accounts/8/.private')).toHaveLength(5);
    expect(await list('.private')).toEqual(['request-safety.json']);
  });

  it('removes the command-line connection when it belongs to the athlete', async () => {
    await session(7, '');
    await write('.private/request-safety.json');
    await write('.private/garmin-operation.lock', '');
    await write('.private/report-2026-10-01.json');

    await removeManualGarminSession(root, 7);

    // The lock and request pacing are shared by every athlete; diagnostic
    // reports belong to the administrator's own command-line runs
    expect(await list('.private')).toEqual([
      'garmin-operation.lock',
      'report-2026-10-01.json',
      'request-safety.json',
    ]);
  });

  it("keeps another athlete's command-line connection", async () => {
    await session(8, '');

    await removeManualGarminSession(root, 7);

    expect(await list('.private')).toHaveLength(5);
  });

  it('succeeds when there is nothing to remove', async () => {
    await expect(removeManualGarminSession(root, 7)).resolves.toBeUndefined();
    await expect(
      removeManualGarminSession(join(root, 'missing'), 7),
    ).resolves.toBeUndefined();
  });
});
