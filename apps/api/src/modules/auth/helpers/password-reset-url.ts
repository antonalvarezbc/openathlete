/** The page where a reset token sets a new password. */
export function passwordResetUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/auth/password-reset?token=${encodeURIComponent(token)}`;
}
