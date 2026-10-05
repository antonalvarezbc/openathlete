// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { PlanningEvidence } from '@openathlete/shared';

import { PlanningEvidenceSummary } from './planning-evidence';

vi.mock('@/paraglide/messages', () => ({
  m: new Proxy(
    {},
    {
      get: (_t, key) => (p?: Record<string, string>) =>
        `${String(key)} ${p ? JSON.stringify(p) : ''}`,
    },
  ),
}));
vi.mock('@/paraglide/runtime', () => ({ getLocale: () => 'es' }));
vi.mock('@/utils/label-map/core/metric-type.label-map', () => ({
  metricTypeLabelMap: { HR_REST: 'FC en reposo' },
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const period = {
  fromDate: '2030-10-15',
  throughDate: '2030-10-21',
  activities: 2,
  minutes: 142,
  distanceMeters: 10000,
  elevationGainMeters: 1050,
  meanRpe: 7,
  rpeAnswers: 1,
  loads: [{ method: 'TRIMP', total: 85.67, activities: 1 }],
};
const evidence: PlanningEvidence = {
  asOfDate: '2030-10-21',
  windowDays: 42,
  historyTruncated: true,
  lastActivityDate: null,
  recent: period,
  previous: { ...period, loads: [], minutes: null },
  recovery: [
    {
      type: 'HR_REST',
      unit: 'bpm',
      latestDate: '2030-10-18',
      latestValue: 65,
      ageDays: 3,
      recentDays: 1,
      baselineDays: 0,
      recentMean: null,
      baselineMedian: null,
      changePercent: null,
      status: 'STALE',
    },
  ],
  comparisons: [],
  feedback: [],
  limitations: [],
};
it('shows coverage, unknown values, dates and stale data without a readiness score', async () => {
  await act(async () =>
    root.render(<PlanningEvidenceSummary evidence={evidence} />),
  );
  expect(container.textContent).toContain('planning_evidence_truncated');
  expect(container.textContent).toContain('"known":"1","total":"2"');
  expect(container.textContent).toContain('85,67');
  expect(container.textContent).toContain('planning_evidence_stale');
  expect(container.textContent).toContain('18/10/2030');
  expect(container.textContent).toContain('planning_evidence_no_load');
  expect(container.textContent).toContain('—');
});
it('renders nothing for older responses without evidence', async () => {
  await act(async () => root.render(<PlanningEvidenceSummary />));
  expect(container.textContent).toBe('');
});
