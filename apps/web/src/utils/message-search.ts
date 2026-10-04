import type { Message, MessageThread } from '@openathlete/shared';

export interface MessageSearchTarget {
  messageThreadId: number;
  messageId: number;
}

export function normalizeMessageSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Searches the full histories already returned by the authorized threads API. */
export function searchThreadMessages(
  threads: MessageThread[],
  query: string,
  threadId?: number,
  displayContent: (message: Message) => string = (message) => message.content,
  displayTitle: (thread: MessageThread) => string | undefined = (thread) =>
    thread.title,
) {
  const terms = normalizeMessageSearch(query)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return [];
  return threads
    .filter(
      (thread) => threadId === undefined || thread.messageThreadId === threadId,
    )
    .flatMap((thread) =>
      (thread.messages ?? []).map((message) => ({ thread, message })),
    )
    .filter(({ thread, message }) => {
      const text = normalizeMessageSearch(
        [
          displayTitle(thread),
          message.sender?.firstName,
          message.sender?.lastName,
          displayContent(message),
          message.activityNotice?.eventName,
        ]
          .filter(Boolean)
          .join(' '),
      );
      return terms.every((term) => text.includes(term));
    })
    .sort(
      (a, b) =>
        Date.parse(b.message.createdAt) - Date.parse(a.message.createdAt) ||
        b.message.messageId - a.message.messageId,
    );
}
