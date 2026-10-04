import { describe, expect, it } from 'vitest';

import type { MessageThread } from '@openathlete/shared';

import { searchThreadMessages } from './message-search';
import { getThreadDisplayTitle } from './messages';

const person = (userId: number, firstName: string, lastName: string) => ({
  messageThreadParticipantId: userId,
  messageThreadId: 1,
  userId,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  user: { userId, firstName, lastName, email: `${userId}@x.test` },
});

const thread = (overrides: Partial<MessageThread> = {}): MessageThread => ({
  messageThreadId: 1,
  // Stored once, ordered by user ID: starts with the viewer (user 1).
  title: 'Anton Alvarez, Olaia Alvarez',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  participants: [
    person(1, 'Anton', 'Alvarez'),
    person(12, 'Olaia', 'Bermúdez'),
  ],
  ...overrides,
});

describe('getThreadDisplayTitle', () => {
  it('names the other person first and the viewer last', () => {
    expect(getThreadDisplayTitle(thread(), 1)).toBe(
      'Olaia Bermúdez, Anton Alvarez',
    );
    expect(getThreadDisplayTitle(thread(), 12)).toBe(
      'Anton Alvarez, Olaia Bermúdez',
    );
  });

  it('keeps the viewer last in group conversations', () => {
    const group = thread({
      participants: [
        person(1, 'Anton', 'Alvarez'),
        person(12, 'Olaia', 'Bermúdez'),
        person(5, 'Carla', 'Ruiz'),
      ],
    });
    expect(getThreadDisplayTitle(group, 12)).toBe(
      'Anton Alvarez, Carla Ruiz, Olaia Bermúdez',
    );
  });

  it('uses current names instead of the stored snapshot', () => {
    // The stored title still says "Olaia Alvarez".
    expect(getThreadDisplayTitle(thread(), 1)).not.toContain('Olaia Alvarez');
  });

  it('keeps the session name of conversations about a training session', () => {
    expect(
      getThreadDisplayTitle(
        thread({ eventActivityId: 32, title: 'Tempo run' }),
        1,
      ),
    ).toBe('Tempo run');
  });

  it('falls back to the stored title without participant names', () => {
    expect(getThreadDisplayTitle(thread({ participants: [] }), 1)).toBe(
      'Anton Alvarez, Olaia Alvarez',
    );
    expect(getThreadDisplayTitle(thread({ participants: undefined }), 1)).toBe(
      'Anton Alvarez, Olaia Alvarez',
    );
  });

  it('works before the viewer is known', () => {
    expect(getThreadDisplayTitle(thread(), undefined)).toBe(
      'Anton Alvarez, Olaia Bermúdez',
    );
  });
});

describe('message search by conversation name', () => {
  const withMessage = thread({
    messages: [
      {
        messageId: 7,
        messageThreadId: 1,
        senderId: 1,
        content: 'Hola',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      },
    ],
  });

  it('matches the name shown, not only the stored snapshot', () => {
    const titleFor1 = (t: MessageThread) => getThreadDisplayTitle(t, 1);
    expect(
      searchThreadMessages(
        [withMessage],
        'bermudez',
        undefined,
        undefined,
        titleFor1,
      ),
    ).toHaveLength(1);
    // Without the displayed title only the outdated snapshot is searched.
    expect(searchThreadMessages([withMessage], 'bermudez')).toHaveLength(0);
  });
});
