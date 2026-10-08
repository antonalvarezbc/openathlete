import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import {
  BackfillWorkerMessage,
  runManualGarminBackfill,
} from './manual-garmin-backfill-worker';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('Manual Garmin backfill worker', () => {
  const runId = '237ce3d8-04e7-4c2c-af8f-f947ed1bb26c';
  let child: EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: jest.Mock;
  };
  let input: string[];
  let onMessage: jest.Mock<Promise<boolean>, [BackfillWorkerMessage]>;

  beforeEach(() => {
    input = [];
    child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: jest.fn().mockReturnValue(true),
    });
    child.stdin.on('data', (chunk: Buffer) => input.push(chunk.toString()));
    jest.mocked(spawn).mockReset();
    jest
      .mocked(spawn)
      .mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    onMessage = jest.fn().mockResolvedValue(true);
  });

  afterEach(() => jest.useRealTimers());

  const run = (signal?: AbortSignal, ids = ['123']) =>
    runManualGarminBackfill(
      '/connector',
      '/connector/accounts/5',
      ids,
      runId,
      onMessage,
      signal,
    );
  const emit = (message: unknown) =>
    child.stdout.write(JSON.stringify(message) + '\n');
  const done = (reason = 'COMPLETE', extra = {}) =>
    emit({ type: 'done', reason, ...extra });
  const close = (code: number | null = 0) => child.emit('close', code);
  const fit = { type: 'fit', id: '123', ready: true, cached: false };
  const waiting = {
    type: 'waiting',
    nextRequestAt: '2026-09-26T12:00:00.000Z',
  };

  it('starts one Python process with the private directory and operation IDs', async () => {
    const result = run();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      '/connector/.venv/bin/python',
      ['/connector/backfill.py'],
      {
        env: expect.objectContaining({
          PYTHONUNBUFFERED: '1',
          OA_GARMIN_PRIVATE_DIR: '/connector/accounts/5/.private',
          OA_GARMIN_BACKFILL_IDS: '["123"]',
          OA_GARMIN_BACKFILL_RUN_ID: runId,
          OA_GARMIN_LOCK_DIRECTORY: '/connector/.private',
        }),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    done();
    close();
    await expect(result).resolves.toEqual({ reason: 'COMPLETE' });
  });

  it('does not hand the API secrets to the Python process', async () => {
    process.env.JWT_SECRET_KEY_TEST_SENTINEL = 'synthetic';
    try {
      const result = run();
      const [, , options] = jest.mocked(spawn).mock.calls[0];
      expect(options?.env).not.toHaveProperty('JWT_SECRET_KEY_TEST_SENTINEL');
      done();
      close();
      await result;
    } finally {
      delete process.env.JWT_SECRET_KEY_TEST_SENTINEL;
    }
  });

  it('does not start a process for an aborted or empty operation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(run(controller.signal)).resolves.toEqual({
      reason: 'CANCELLED',
    });
    await expect(run(undefined, [])).resolves.toEqual({ reason: 'COMPLETE' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects malformed IDs before starting Python', async () => {
    await expect(run(undefined, ['../private'])).rejects.toThrow(
      'Garmin backfill worker failed.',
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it('waits for FIT persistence before acknowledging and for exit after done', async () => {
    let persisted!: (value: boolean) => void;
    onMessage.mockReturnValue(
      new Promise((resolve) => {
        persisted = resolve;
      }),
    );
    let resolved = false;
    const result = run().then((value) => {
      resolved = true;
      return value;
    });
    emit(fit);
    await flush();
    expect(onMessage).toHaveBeenCalledWith(fit);
    expect(input).toEqual([]);
    persisted(true);
    await flush();
    expect(input).toEqual(['continue\n']);
    done();
    await flush();
    expect(resolved).toBe(false);
    close();
    await expect(result).resolves.toEqual({ reason: 'COMPLETE' });
  });

  it('handles fragmented NDJSON and waiting updates without acknowledgements', async () => {
    const result = run();
    const line = JSON.stringify(waiting) + '\n';
    child.stdout.write(line.slice(0, 12));
    child.stdout.write(line.slice(12));
    await flush();
    expect(onMessage).toHaveBeenCalledWith(waiting);
    expect(input).toEqual([]);
    done();
    close();
    await result;
  });

  it('sends stop after a FIT and waits for the cancellation result', async () => {
    onMessage.mockResolvedValue(false);
    const result = run();
    emit(fit);
    await flush();
    expect(input).toEqual(['stop\n']);
    expect(child.kill).not.toHaveBeenCalled();
    done('CANCELLED');
    close();
    await expect(result).resolves.toEqual({ reason: 'CANCELLED' });
  });

  it('cancels on a refused waiting callback without writing an acknowledgement', async () => {
    onMessage.mockResolvedValue(false);
    const result = run();
    emit(waiting);
    await flush();
    expect(input).toEqual([]);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    close(null);
    await expect(result).resolves.toEqual({ reason: 'CANCELLED' });
  });

  it.each([
    'COMPLETE',
    'CANCELLED',
    'BUDGET',
    'RATE_LIMIT',
    'AUTH',
    'ERROR',
    'BUSY',
    'COOLDOWN',
  ])('returns a validated %s result and retry delay', async (reason) => {
    const result = run();
    done(reason, { retryAfterSeconds: 7200 });
    close();
    await expect(result).resolves.toEqual({ reason, retryAfterSeconds: 7200 });
  });

  it.each([
    '{"private account": "do not expose"}\n',
    'not JSON containing private account data\n',
    JSON.stringify({ ...fit, password: 'do not expose' }) + '\n',
    JSON.stringify({ ...waiting, nextRequestAt: 'tomorrow' }) + '\n',
    JSON.stringify({ type: 'done', reason: 'UNKNOWN' }) + '\n',
    JSON.stringify({
      type: 'done',
      reason: 'RATE_LIMIT',
      retryAfterSeconds: -1,
    }) + '\n',
    JSON.stringify({ ...fit, id: '999' }) + '\n',
  ])('rejects invalid protocol without exposing its output', async (line) => {
    const result = run();
    child.stdout.write(line);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    close(null);
    await expect(result).rejects.toThrow('Garmin backfill worker failed.');
    expect(input).toEqual([]);
  });

  it('rejects duplicate FIT messages rather than importing twice', async () => {
    const result = run();
    emit(fit);
    await flush();
    emit(fit);
    close();
    await expect(result).rejects.toThrow('Garmin backfill worker failed.');
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects further output after a terminal message', async () => {
    const result = run();
    done();
    emit(waiting);
    close();
    await expect(result).rejects.toThrow('Garmin backfill worker failed.');
  });

  it.each(['missing done', 'partial line', 'nonzero exit'])(
    'rejects an unfinished or unsuccessful worker: %s',
    async (condition) => {
      const result = run();
      if (condition !== 'missing done') done();
      if (condition === 'partial line') child.stdout.write('{');
      close(condition === 'nonzero exit' ? 1 : 0);
      await expect(result).rejects.toThrow('Garmin backfill worker failed.');
    },
  );

  it('bounds each line even when chunks arrive separately', async () => {
    const result = run();
    child.stdout.write('x'.repeat(8192));
    expect(child.kill).not.toHaveBeenCalled();
    child.stdout.write('x');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    close(null);
    await expect(result).rejects.toThrow('Garmin backfill worker failed.');
  });

  it('bounds total stdout before decoding or storing messages', async () => {
    const result = run();
    child.stdout.write(Buffer.alloc(1024 * 1024 + 1));
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    close(null);
    await expect(result).rejects.toThrow('Garmin backfill worker failed.');
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('kills the process if persistence fails and never acknowledges that FIT', async () => {
    onMessage.mockRejectedValue(new Error('private database error'));
    const result = run();
    emit(fit);
    await flush();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(input).toEqual([]);
    close(null);
    await expect(result).rejects.toThrow('Garmin backfill worker failed.');
  });

  it('handles a closed stdin without leaking raw errors', async () => {
    const result = run();
    child.stdin.emit('error', new Error('private EPIPE diagnostic'));
    close(null);
    await expect(result).rejects.toThrow('Garmin backfill worker failed.');
  });

  it('handles a process launch failure without leaking the executable path', async () => {
    const result = run();
    child.emit('error', new Error('private ENOENT path'));
    close(-2);
    await expect(result).rejects.toThrow('Garmin backfill worker failed.');
  });

  it('discards stderr without including it in a result or callback', async () => {
    const result = run();
    child.stderr.write('private account response');
    done();
    close();
    await expect(result).resolves.toEqual({ reason: 'COMPLETE' });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('aborts with SIGTERM and uses SIGKILL if the worker does not exit', async () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    const result = run(controller.signal);
    controller.abort();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    jest.advanceTimersByTime(2000);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    close(null);
    await expect(result).resolves.toEqual({ reason: 'CANCELLED' });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops acknowledging an in-flight callback after cancellation', async () => {
    let persisted!: (value: boolean) => void;
    onMessage.mockReturnValue(
      new Promise((resolve) => {
        persisted = resolve;
      }),
    );
    const controller = new AbortController();
    const result = run(controller.signal);
    emit(fit);
    await flush();
    controller.abort();
    persisted(true);
    close(null);
    await expect(result).resolves.toEqual({ reason: 'CANCELLED' });
    expect(input).toEqual([]);
  });

  it('enforces the 15-minute deadline and clears process timers', async () => {
    jest.useFakeTimers();
    const result = run();
    jest.advanceTimersByTime(15 * 60 * 1000);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    close(null);
    await expect(result).rejects.toThrow('Garmin backfill worker failed.');
    expect(jest.getTimerCount()).toBe(0);
  });
});
