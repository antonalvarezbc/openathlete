import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { join } from 'node:path';

import { ConflictException, ServiceUnavailableException } from '@nestjs/common';

type Reply = { mfaRequired?: boolean; connected?: boolean };
type Pending = {
  child: ChildProcessWithoutNullStreams;
  next?: { resolve: (reply: Reply) => void; reject: (error: Error) => void };
  waitingMfa: boolean;
};
const pending = new Map<number, Pending>();
const attempts = new Map<number, number>();
const failure = () =>
  new ServiceUnavailableException({
    code: 'GARMIN_LOGIN_FAILED',
    message: 'Garmin authentication failed. Try again.',
  });

// Each pending process belongs to one authenticated OA user. No password is persisted.
export async function loginGarmin(
  userId: number,
  root: string,
  privateDirectory: string,
  input: {
    email?: string;
    password?: string;
    code?: string;
    athleteId: number;
    timezone: string;
  },
): Promise<Reply> {
  let entry = pending.get(userId);
  if (input.code) {
    if (!entry?.waitingMfa || entry.next) throw failure();
    entry.waitingMfa = false;
  } else {
    if (entry || Date.now() - (attempts.get(userId) ?? 0) < 120000)
      throw new ConflictException({
        code: 'GARMIN_LOGIN_BUSY',
        message: 'Wait before reconnecting.',
      });
    attempts.set(userId, Date.now());
    const child = spawn(
      join(root, '.venv/bin/python'),
      [join(root, 'login.py')],
      {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          OA_GARMIN_PRIVATE_DIR: privateDirectory,
          OA_GARMIN_LOCK_DIRECTORY: join(root, '.private'),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    entry = { child, waitingMfa: false };
    pending.set(userId, entry);
    const active = entry;
    let buffer = '';
    const finish = () => {
      clearTimeout(timer);
      if (pending.get(userId) === active) pending.delete(userId);
      active.next?.reject(failure());
      active.next = undefined;
    };
    const timer = setTimeout(() => {
      child.kill();
      finish();
    }, 180000);
    timer.unref();
    child.on('error', finish);
    child.on('close', finish);
    child.stdin.on('error', finish);
    child.stderr.resume();
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      if (buffer.length > 4096) {
        child.kill();
        finish();
        return;
      }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          const reply = JSON.parse(line);
          const waiter = active.next;
          active.next = undefined;
          if (reply.mfaRequired === true) {
            active.waitingMfa = true;
            waiter?.resolve({ mfaRequired: true });
          } else if (reply.connected === true) {
            waiter?.resolve({ connected: true });
          } else {
            const code =
              reply.code === 'BUSY'
                ? 'GARMIN_BACKFILL_BUSY'
                : ['RATE_LIMIT', 'COOLDOWN'].includes(reply.code)
                  ? 'GARMIN_REMOTE_COOLDOWN'
                  : reply.code === 'AUTH'
                    ? 'GARMIN_LOGIN_REQUIRED'
                    : undefined;
            waiter?.reject(
              code
                ? new ServiceUnavailableException({
                    code,
                    message: 'Garmin authentication stopped.',
                  })
                : failure(),
            );
            child.kill();
          }
        } catch {
          child.kill();
          finish();
        }
      }
    });
  }
  const active = entry;
  return new Promise<Reply>((resolve, reject) => {
    active.next = { resolve, reject };
    active.child.stdin.write(JSON.stringify(input) + '\n');
  });
}
