/**
 * Masks an email address for logs: keeps the first character of the local
 * part and the domain (`a***@example.com`).
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) {
    return '<no email>';
  }
  const at = email.lastIndexOf('@');
  if (at <= 0) {
    return '***';
  }
  return `${email[0]}***${email.slice(at)}`;
}
