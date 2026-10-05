import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { metricTypeLabelMap } from '@/utils/label-map/core/metric-type.label-map';

import { METRIC_TYPE, PlanningEvidence } from '@openathlete/shared';

/** The coach sees the same dated evidence the model receives. */
export function PlanningEvidenceSummary({
  evidence,
}: {
  evidence?: PlanningEvidence;
}) {
  if (!evidence) return null;
  const number = (value: number | null) =>
    value == null
      ? '—'
      : value.toLocaleString(getLocale(), { maximumFractionDigits: 2 });
  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleDateString(getLocale(), { timeZone: 'UTC' })
      : '—';
  const unit = (value: string) => (value === 'bpm' ? m.bpm() : value);
  const status = {
    MISSING: m.planning_evidence_missing,
    STALE: m.planning_evidence_stale,
    INSUFFICIENT: m.planning_evidence_sparse,
    AVAILABLE: m.planning_evidence_available,
  };
  return (
    <section
      aria-label={m.planning_evidence_title()}
      className="min-w-0 space-y-3 rounded-lg border p-3 text-sm"
    >
      <h3 className="font-semibold">
        {m.planning_evidence_title()} · {date(evidence.asOfDate)} UTC
      </h3>
      <p className="text-muted-foreground">{m.planning_evidence_help()}</p>
      {evidence.historyTruncated && (
        <p role="status">{m.planning_evidence_truncated()}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {[evidence.recent, evidence.previous].map((period, index) => (
          <div
            key={index}
            className="min-w-0 rounded-md bg-muted/40 p-3 space-y-1"
          >
            <h4 className="font-medium">
              {index === 0
                ? m.planning_evidence_recent()
                : m.planning_evidence_previous()}
            </h4>
            <p>
              {date(period.fromDate)} – {date(period.throughDate)}
            </p>
            <p>
              {m.planning_evidence_sessions({
                count: String(period.activities),
              })}{' '}
              · {number(period.minutes)} min · D+{' '}
              {number(period.elevationGainMeters)} m
            </p>
            <p>
              {m.planning_evidence_rpe({
                value: number(period.meanRpe),
                count: String(period.rpeAnswers),
              })}
            </p>
            {period.loads.length ? (
              period.loads.map((load) => (
                <p key={load.method}>
                  {load.method}: {number(load.total)} ·{' '}
                  {m.planning_evidence_coverage({
                    known: String(load.activities),
                    total: String(period.activities),
                  })}
                </p>
              ))
            ) : (
              <p>{m.planning_evidence_no_load()}</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-muted-foreground">
        {m.planning_evidence_baseline_help()}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {evidence.recovery.map((metric) => (
          <div
            key={metric.type}
            className="min-w-0 rounded-md border p-3 space-y-1"
          >
            <h4 className="font-medium">
              {metricTypeLabelMap[metric.type as METRIC_TYPE] ?? metric.type}
            </h4>
            <p>
              {m.planning_evidence_latest()}: {number(metric.latestValue)}{' '}
              {unit(metric.unit)} · {date(metric.latestDate)}
            </p>
            <p>{status[metric.status]()}</p>
            <p>
              {m.planning_evidence_trend({
                recent: number(metric.recentMean),
                baseline: number(metric.baselineMedian),
                unit: unit(metric.unit),
                change: number(metric.changePercent),
              })}
            </p>
            <p className="text-muted-foreground">
              {m.planning_evidence_samples({
                recent: String(metric.recentDays),
                baseline: String(metric.baselineDays),
              })}
            </p>
          </div>
        ))}
      </div>
      {!!evidence.comparisons.length && (
        <details>
          <summary className="cursor-pointer min-h-11 py-2">
            {m.planning_evidence_comparisons()}
          </summary>
          <ul className="space-y-2">
            {evidence.comparisons.map((item, index) => (
              <li key={index} className="rounded border p-2">
                <p>{date(item.date)}</p>
                <p>
                  {number(item.minutes.planned)} → {number(item.minutes.actual)}{' '}
                  min ({number(item.minutes.changePercent)}%)
                </p>
                <p>
                  D+ {number(item.elevationGainMeters.planned)} →{' '}
                  {number(item.elevationGainMeters.actual)} m (
                  {number(item.elevationGainMeters.changePercent)}%)
                </p>
                <p>
                  RPE {number(item.rpe.planned)} → {number(item.rpe.actual)}/10
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
