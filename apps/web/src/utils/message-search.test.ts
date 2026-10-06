import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { MessageThread } from '@openathlete/shared';

import { searchThreadMessages } from './message-search';

const threads = [
  {
    messageThreadId: 1,
    title: 'Atleta Uno',
    messages: [
      {
        messageId: 11,
        content: 'Sesión de montaña: revisar recuperación',
        createdAt: '2024-01-01T10:00:00Z',
        sender: { firstName: 'María', lastName: 'López' },
      },
      {
        messageId: 12,
        content: 'Mañana rodaje suave',
        createdAt: '2026-01-01T10:00:00Z',
      },
    ],
  },
  {
    messageThreadId: 2,
    title: 'Atleta Dos',
    messages: [
      {
        messageId: 21,
        content: 'Recuperación completa',
        createdAt: '2026-01-02T10:00:00Z',
      },
      {
        messageId: 22,
        content: 'Trail nocturno',
        createdAt: '2026-01-03T10:00:00Z',
      },
    ],
  },
] as unknown as MessageThread[];
const ids = (query: string, threadId?: number) =>
  searchThreadMessages(threads, query, threadId).map(
    ({ message }) => message.messageId,
  );
test('finds old messages across histories and sorts newest first', () =>
  assert.deepEqual(ids('recuperacion'), [21, 11]));
test('limits matches to the chosen conversation', () =>
  assert.deepEqual(ids('recuperacion', 1), [11]));
test('normalizes accents, case and whitespace; matches all words', () =>
  assert.deepEqual(ids('  MONTAÑA   RECUPERACION '), [11]));
test('searches sender names and chat titles', () => {
  assert.deepEqual(ids('maria lopez'), [11]);
  assert.deepEqual(ids('atleta dos'), [22, 21]);
});
test('does not match empty queries or unknown conversations', () => {
  assert.deepEqual(ids('  '), []);
  assert.deepEqual(ids('recuperacion', 99), []);
});
test('supports a display-content formatter', () => {
  assert.deepEqual(ids('trail'), [22]);
  assert.equal(
    searchThreadMessages(threads, 'RPE 6/10', undefined, (m) =>
      m.messageId === 22 ? 'RPE 6/10' : m.content,
    )[0].message.messageId,
    22,
  );
});
test('treats punctuation literally, without regex or HTML interpretation', () => {
  assert.deepEqual(ids('.*'), []);
  assert.deepEqual(ids('<script>'), []);
});
test('handles absent messages and never mutates histories', () => {
  const before = structuredClone(threads);
  assert.deepEqual(
    searchThreadMessages([{ messageThreadId: 3 }] as MessageThread[], 'hola'),
    [],
  );
  ids('sesion');
  assert.deepEqual(threads, before);
});
