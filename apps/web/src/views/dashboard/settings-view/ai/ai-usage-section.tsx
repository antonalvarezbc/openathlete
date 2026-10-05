import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { getDateLocale } from '@/utils/locales';
import { cn } from '@/utils/shadcn';

import { AiAccessDto } from '@openathlete/shared';

/**
 * This month's AI usage: the included allowance on the instance keys, and
 * what ran on the user's own keys (billed to them by their provider).
 */
export function AiUsageSection({ access }: { access: AiAccessDto }) {
  const { usage, hostedAccess, hostedQuotaExhausted } = access;
  const showAllowance = hostedAccess && usage.hostedLimit !== null;
  if (!showAllowance && usage.ownKeyTokens === 0) return null;

  const locale = getDateLocale(getLocale());
  const tokens = (value: number) =>
    new Intl.NumberFormat(locale, { notation: 'compact' }).format(value);
  const resetsOn = new Date(usage.resetsAt).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const percent =
    usage.hostedLimit && usage.hostedLimit > 0
      ? Math.min(100, (usage.hostedTokens / usage.hostedLimit) * 100)
      : 100;

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">{m.ai_usage_title()}</h3>
      {showAllowance && usage.hostedLimit !== null && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            <span>{m.ai_usage_included()}</span>
            <span className="text-muted-foreground">
              {m.ai_usage_tokens_of({
                used: tokens(usage.hostedTokens),
                limit: tokens(usage.hostedLimit),
              })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={m.ai_usage_included()}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                'h-full rounded-full',
                hostedQuotaExhausted ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p
            className={cn(
              'text-sm',
              hostedQuotaExhausted
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {hostedQuotaExhausted
              ? m.ai_usage_exhausted({ date: resetsOn })
              : m.ai_usage_resets({ date: resetsOn })}
          </p>
        </div>
      )}
      {usage.ownKeyTokens > 0 && (
        <p className="text-sm text-muted-foreground">
          {m.ai_usage_own_keys({ tokens: tokens(usage.ownKeyTokens) })}
        </p>
      )}
    </section>
  );
}
