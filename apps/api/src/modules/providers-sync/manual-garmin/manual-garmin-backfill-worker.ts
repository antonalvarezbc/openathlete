import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { z } from 'zod';

const messageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('waiting'),
      nextRequestAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      type: z.literal('fit'),
      id: z.string().regex(/^\d+$/),
      ready: z.boolean(),
      cached: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('done'),
      reason: z.enum([
        'COMPLETE',
        'CANCELLED',
        'BUDGET',
        'RATE_LIMIT',
        'AUTH',
        'ERROR',
        'BUSY',
        'COOLDOWN',
      ]),
      retryAfterSeconds: z.number().finite().int().nonnegative().optional(),
    })
    .strict(),
]);

type WorkerMessage = z.infer<typeof messageSchema>;
export type BackfillWorkerMessage = Exclude<WorkerMessage, { type: 'done' }>;
export type BackfillWorkerResult = Omit<
  Extract<WorkerMessage, { type: 'done' }>,
  'type'
>;

const MAX_LINE_BYTES = 8 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const TIMEOUT_MS = 15 * 60 * 1000;
const failure = () => new Error('Garmin backfill worker failed.');

// One process keeps a single Garmin session for the entire explicit operation.
// Python waits for each FIT acknowledgement before it can request another file.
export function runManualGarminBackfill(
  root: string,
  directory: string,
  ids: string[],
  runId: string,
  onMessage: (message: BackfillWorkerMessage) => Promise<boolean>,
  signal?: AbortSignal,
): Promise<BackfillWorkerResult> {
  if (signal?.aborted) return Promise.resolve({ reason: 'CANCELLED' });
  if (!ids.length) return Promise.resolve({ reason: 'COMPLETE' });
  if (ids.some((id) => !/^\d+$/.test(id))) return Promise.reject(failure());

  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        join(root, '.venv/bin/python'),
        [join(root, 'backfill.py')],
        {
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            OA_GARMIN_PRIVATE_DIR: join(directory, '.private'),
            OA_GARMIN_BACKFILL_IDS: JSON.stringify(ids),
            OA_GARMIN_BACKFILL_RUN_ID: runId,
            OA_GARMIN_LOCK_DIRECTORY: join(root, '.private'),
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
    } catch {
      reject(failure());
      return;
    }

    let buffer: Buffer = Buffer.alloc(0);
    let outputBytes = 0;
    let closed = false;
    let failed = false;
    let cancelled = false;
    let done: BackfillWorkerResult | undefined;
    let doneReceived = false;
    let messages = Promise.resolve();
    let killTimer: NodeJS.Timeout | undefined;
    const expectedIds = new Set(ids);
    const receivedIds = new Set<string>();

    const terminate = () => {
      if (closed || killTimer) return;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (!closed) child.kill('SIGKILL');
      }, 2000);
      killTimer.unref();
    };
    const fail = () => {
      failed = true;
      terminate();
    };
    const abort = () => {
      cancelled = true;
      terminate();
    };
    const timer = setTimeout(fail, TIMEOUT_MS);
    timer.unref();
    signal?.addEventListener('abort', abort, { once: true });

    child.on('error', fail);
    child.stdin?.on('error', fail);
    child.stdout?.on('error', fail);
    // Discard diagnostics: provider responses can include private account data.
    child.stderr?.on('error', fail);
    child.stderr?.resume();

    child.stdout?.on('data', (chunk: Buffer) => {
      if (failed || cancelled || closed) return;
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        fail();
        return;
      }
      buffer = Buffer.concat([buffer, chunk]);
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        if (newline > MAX_LINE_BYTES || doneReceived) {
          fail();
          return;
        }
        let message: WorkerMessage;
        try {
          message = messageSchema.parse(
            JSON.parse(buffer.subarray(0, newline).toString('utf8')),
          );
        } catch {
          fail();
          return;
        }
        buffer = buffer.subarray(newline + 1);
        if (message.type === 'fit') {
          if (!expectedIds.has(message.id) || receivedIds.has(message.id)) {
            fail();
            return;
          }
          receivedIds.add(message.id);
        }
        if (message.type === 'done') doneReceived = true;
        messages = messages
          .then(async () => {
            if (failed || cancelled) return;
            if (message.type === 'done') {
              const { type: _type, ...result } = message;
              done = result;
              return;
            }
            const proceed = await onMessage(message);
            if (failed || cancelled || closed) return;
            if (message.type === 'fit') {
              child.stdin?.write(proceed ? 'continue\n' : 'stop\n');
            } else if (!proceed) {
              abort();
            }
          })
          .catch(fail);
      }
      if (buffer.length > MAX_LINE_BYTES) fail();
    });

    child.once('close', (code) => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      void messages.then(() => {
        if (cancelled) {
          resolve({ reason: 'CANCELLED' });
        } else if (failed || code !== 0 || buffer.length || !done) {
          reject(failure());
        } else {
          resolve(done);
        }
      });
    });
    // An abort may have happened between the initial check and registration.
    if (signal?.aborted) abort();
  });
}
