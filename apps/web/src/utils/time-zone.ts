import { UserAPI } from '@/api/user/user.api';

import { isTimeZone } from '@openathlete/shared';

/** The device's IANA time zone, if the browser reports a known one. */
export function deviceTimeZone(): string | undefined {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timeZone && isTimeZone(timeZone) ? timeZone : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Saves the device's time zone to the profile when it changed (first use,
 * travel), so reminders go out in the user's evening.
 */
export async function saveTimeZone(saved: string | null) {
  const timeZone = deviceTimeZone();
  if (!timeZone || timeZone === saved) return;
  try {
    await UserAPI.updateAccount({ timeZone });
  } catch (error) {
    console.error('Failed to save the time zone:', error);
  }
}
