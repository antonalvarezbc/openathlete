export const coachKeys = {
  all: ['coach'] as const,
  dashboard: (start?: string, end?: string) =>
    [...coachKeys.all, 'dashboard', start || 'auto', end || 'auto'] as const,
  overview: (from: string, today: string, until: string) =>
    [...coachKeys.all, 'overview', from, today, until] as const,
  getPendingInvitations: ['coach', 'invitations', 'pending'] as const,
};
