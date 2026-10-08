import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from 'src/modules/prisma/services/prisma.service';
import { StripeService } from 'src/modules/subscription/services/stripe.service';

import { AccountDeletionService } from './account-deletion.service';

// What the transaction deletes is covered by account-deletion.int-spec.ts,
// against PostgreSQL. This covers the files kept outside the database.
describe('AccountDeletionService: manual Garmin session files', () => {
  let root: string;
  const prisma = {
    user: { findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn(),
  };
  const stripe = { cancelSubscriptionNow: jest.fn() };

  const exists = (path: string) =>
    access(join(root, path)).then(
      () => true,
      () => false,
    );
  const service = (settings: Record<string, unknown> = {}) =>
    new AccountDeletionService(
      prisma as unknown as PrismaService,
      stripe as unknown as StripeService,
      new ConfigService({ GARMIN_UNOFFICIAL_DIRECTORY: root, ...settings }),
    );

  beforeEach(async () => {
    jest.resetAllMocks();
    root = await mkdtemp(join(tmpdir(), 'oa-account-deletion-'));
    for (const athleteId of [7, 8]) {
      await mkdir(join(root, `accounts/${athleteId}/.private/tokens`), {
        recursive: true,
      });
      await writeFile(
        join(root, `accounts/${athleteId}/.private/tokens/garmin_tokens.json`),
        '{}',
      );
    }
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      athlete: { athleteId: 7 },
      subscription: null,
    });
    prisma.$transaction.mockResolvedValue(undefined);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("removes the athlete's Garmin session once the database deletion commits", async () => {
    prisma.$transaction.mockImplementation(async () => {
      // Files cannot be rolled back: they must still be there meanwhile
      expect(await exists('accounts/7')).toBe(true);
    });

    await service().deleteAccount(1);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(await exists('accounts/7')).toBe(false);
    expect(await exists('accounts/8/.private/tokens/garmin_tokens.json')).toBe(
      true,
    );
  });

  it('keeps the session when the database deletion fails', async () => {
    prisma.$transaction.mockRejectedValue(new Error('rolled back'));

    await expect(service().deleteAccount(1)).rejects.toThrow('rolled back');

    expect(await exists('accounts/7/.private/tokens/garmin_tokens.json')).toBe(
      true,
    );
  });

  it('removes the session even after the connector was turned off', async () => {
    await service({
      ENABLE_MANUAL_GARMIN_SYNC: false,
      SELF_HOSTED: false,
    }).deleteAccount(1);

    expect(await exists('accounts/7')).toBe(false);
  });

  it('deletes accounts without a Garmin directory, session or athlete', async () => {
    await expect(
      service({ GARMIN_UNOFFICIAL_DIRECTORY: undefined }).deleteAccount(1),
    ).resolves.toBeUndefined();
    await expect(
      service({ GARMIN_UNOFFICIAL_DIRECTORY: 'relative/garmin' }).deleteAccount(
        1,
      ),
    ).resolves.toBeUndefined();
    expect(await exists('accounts/7')).toBe(true);

    await rm(join(root, 'accounts'), { recursive: true });
    await expect(service().deleteAccount(1)).resolves.toBeUndefined();

    prisma.user.findUniqueOrThrow.mockResolvedValue({
      athlete: null,
      subscription: null,
    });
    await expect(service().deleteAccount(2)).resolves.toBeUndefined();
  });

  it('reports leftover files without failing a deletion that already happened', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    // A file where the directory should be makes the removal fail
    const file = join(root, 'not-a-directory');
    await writeFile(file, '');

    await expect(
      service({ GARMIN_UNOFFICIAL_DIRECTORY: file }).deleteAccount(1),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('athlete 7: ENOTDIR'),
    );
    error.mockRestore();
  });
});
