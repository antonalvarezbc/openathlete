/* eslint-disable react-refresh/only-export-components */
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { aiErrorMessage } from '@/utils/ai-errors';
import { isAxiosError } from 'axios';
import { ReactNode } from 'react';

export function workspaceError(error: unknown) {
  // No AI set up, or the key's account refused: say so, not "no access".
  const ai = aiErrorMessage(error);
  if (ai) return ai;
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return status === 403
    ? m.adaptation_access_error()
    : status === 409
      ? m.workspace_conflict()
      : status === 400
        ? m.workspace_invalid()
        : m.workspace_failed();
}
export function dateInput(value: string | Date = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function displayDate(value: string) {
  return new Date(value).toLocaleDateString(getLocale());
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
export const selectClass =
  'h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base';
