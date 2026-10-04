import { Message, MessageThread } from '@openathlete/shared';

/**
 * Calculate the number of unread messages in a thread for the current user
 */
export function calculateUnreadCount(
  thread: MessageThread,
  currentUserId: number,
): number {
  if (!thread.messages || thread.messages.length === 0) {
    return 0;
  }

  // Count messages that:
  // 1. Are not sent by the current user
  // 2. Don't have a read receipt from the current user
  return thread.messages.filter(
    (message: Message) =>
      message.senderId !== currentUserId &&
      !message.readReceipts?.some((rr) => rr.userId === currentUserId),
  ).length;
}

/**
 * Calculate total unread count across all threads
 */
export function calculateTotalUnreadCount(
  threads: MessageThread[],
  currentUserId: number,
): number {
  return threads.reduce(
    (total, thread) => total + calculateUnreadCount(thread, currentUserId),
    0,
  );
}

const fullName = (user?: { firstName?: string; lastName?: string }) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();

/**
 * Name of a conversation for the person viewing it: the other participants
 * first and the viewer last, with their current names. The stored title is
 * a snapshot ordered by user ID and shared by everyone, so it can start with
 * your own name or show an outdated one. Conversations about a training
 * session keep the session name.
 */
export function getThreadDisplayTitle(
  thread: MessageThread,
  currentUserId?: number,
): string | undefined {
  if (thread.eventActivityId || thread.eventTrainingId) return thread.title;
  const named = (thread.participants ?? []).flatMap((participant) => {
    const name = fullName(participant.user);
    return name ? [{ userId: participant.userId, name }] : [];
  });
  const others = named
    .filter((participant) => participant.userId !== currentUserId)
    .map((participant) => participant.name)
    .sort((a, b) => a.localeCompare(b));
  const viewer = named
    .filter((participant) => participant.userId === currentUserId)
    .map((participant) => participant.name);
  const names = [...new Set([...others, ...viewer])];
  return names.length ? names.join(', ') : thread.title;
}
