import {
  AiPlanCheckFacts,
  CYCLE_PHASE,
  METRIC_TYPE,
  SEOPlanData,
  SPORT_TYPE,
  aiPlanRequestSchema,
  aiPlanWeekCount,
  checkAiPlan,
} from '@openathlete/shared';

// A Monday start; the race is the Saturday of the last week.
const START = '2030-10-21';
const raceFor = (weeks: number) =>
  new Date(Date.UTC(2030, 9, 21) + ((weeks - 1) * 7 + 5) * 86400000)
    .toISOString()
    .slice(0, 10);

/** A plan with the given weekly minutes on Tuesday, Thursday and Saturday. */
function planOf(minutes: number[]): SEOPlanData {
  return {
    plan: {
      name: 'AI plan',
      description: '',
      goal: '10K',
      sportType: SPORT_TYPE.RUNNING,
      distance: 10000,
      duration: minutes.length,
    },
    cycles: [
      {
        name: 'Build',
        description: '',
        phase: CYCLE_PHASE.BASE,
        weeks: minutes.map((total, index) => {
          // The race is on the last Saturday: nothing that day.
          const days = index === minutes.length - 1 ? [2, 4] : [2, 4, 6];
          return {
            weekNumber: index + 1,
            theme: null,
            sessions: days.map((dayOfWeek) => ({
              dayOfWeek,
              name: `W${index + 1} D${dayOfWeek}`,
              sport: SPORT_TYPE.RUNNING,
              description: 'Easy run',
              goalDuration: Math.round((total / days.length) * 60),
              goalRpe: 4,
            })),
          };
        }),
      },
    ],
  };
}

const facts = (
  overrides: Partial<AiPlanCheckFacts> = {},
): AiPlanCheckFacts => ({
  startDate: START,
  raceDate: raceFor(8),
  weeks: 8,
  sports: [SPORT_TYPE.RUNNING],
  trainingDays: [2, 4, 6],
  weeklyHours: 5,
  injuries: 0,
  zoneNumbers: [1, 2, 3, 4, 5],
  metrics: [],
  recentWeeklyMinutes: 170,
  ...overrides,
});

// Builds, recovers, builds and tapers within every limit.
const GOOD = [180, 195, 210, 160, 220, 240, 170, 100];
const codes = (plan: SEOPlanData, f = facts()) =>
  checkAiPlan(plan, f).map((issue) => `${issue.code}:${issue.week ?? ''}`);
const session = (plan: SEOPlanData, week: number, index = 0) =>
  plan.cycles[0].weeks[week - 1].sessions[index];

describe('checkAiPlan', () => {
  test('accepts a plan within every limit', () => {
    expect(checkAiPlan(planOf(GOOD), facts())).toEqual([]);
  });

  test('keeps weeks within the hours available', () => {
    expect(codes(planOf(GOOD), facts({ weeklyHours: 3 }))).toEqual([
      'WEEK_TOO_LONG:3',
      'WEEK_TOO_LONG:5',
      'WEEK_TOO_LONG:6',
    ]);
  });

  test('limits growth over the three weeks before and the first week', () => {
    const minutes = [...GOOD];
    minutes[1] = 260;
    expect(codes(planOf(minutes))).toContain('PROGRESSION:2');
    expect(checkAiPlan(planOf(GOOD), facts())).toEqual([]);
    expect(codes(planOf(GOOD), facts({ recentWeeklyMinutes: 100 }))).toEqual([
      'FIRST_WEEK:1',
    ]);
    // Unknown recent training is not zero.
    expect(codes(planOf(GOOD), facts({ recentWeeklyMinutes: null }))).toEqual(
      [],
    );
  });

  test('asks for a recovery week after four loading weeks', () => {
    const minutes = [150, 157, 165, 173, 182, 191, 200, 210, 140, 90];
    expect(
      codes(planOf(minutes), facts({ weeks: 10, raceDate: raceFor(10) })),
    ).toContain('NO_RECOVERY:5');
  });

  test('asks for a taper in the last two weeks', () => {
    const minutes = [...GOOD];
    minutes[6] = 230;
    minutes[7] = 230;
    expect(codes(planOf(minutes))).toEqual(
      expect.arrayContaining(['NO_TAPER:8', 'NO_TAPER:7']),
    );
  });

  test('refuses sessions on or after race day and on other days', () => {
    const plan = planOf(GOOD);
    plan.cycles[0].weeks[7].sessions.push({
      ...session(plan, 8),
      dayOfWeek: 6,
    });
    expect(codes(plan)).toContain('AFTER_RACE:8');
    expect(codes(planOf(GOOD), facts({ trainingDays: [2, 4] }))).toContain(
      'DAY_NOT_AVAILABLE:1',
    );
  });

  test('limits sessions a day and the sports used', () => {
    const plan = planOf(GOOD);
    const week = plan.cycles[0].weeks[0];
    week.sessions.push({ ...week.sessions[0] }, { ...week.sessions[0] });
    week.sessions[1] = { ...week.sessions[1], sport: SPORT_TYPE.CYCLING };
    expect(codes(plan)).toEqual(
      expect.arrayContaining(['TOO_MANY_SESSIONS:1', 'SPORT_NOT_ALLOWED:1']),
    );
  });

  test('keeps intensity down early on with unresolved injuries', () => {
    const plan = planOf(GOOD);
    session(plan, 1).goalRpe = 8;
    session(plan, 3).goalRpe = 8;
    expect(codes(plan, facts({ injuries: 1 }))).toEqual(['INJURY_INTENSITY:1']);
    expect(codes(plan, facts({ injuries: 0 }))).toEqual([]);
  });

  test('only refers to zones and metrics the athlete has', () => {
    const plan = planOf(GOOD);
    session(plan, 1).description = "15' easy + 5x4' Z5, 3' easy";
    session(plan, 2).description = '20 min zona 3';
    session(plan, 3).description = "3x10' at 95% FTP";
    session(plan, 4).description = "6x3' at 90% FCmax";
    session(plan, 5).description = '40 min at 70% of heart-rate reserve';
    expect(codes(plan, facts({ zoneNumbers: [1, 2, 3, 4] }))).toEqual([
      'UNKNOWN_ZONE:1',
      'UNKNOWN_METRIC:3',
      'UNKNOWN_METRIC:4',
      'UNKNOWN_METRIC:5',
    ]);
    expect(
      codes(
        plan,
        facts({
          metrics: [
            METRIC_TYPE.FTP_CYCLING,
            METRIC_TYPE.HR_MAX,
            METRIC_TYPE.HR_REST,
          ],
        }),
      ),
    ).toEqual([]);
    // Reserve needs the resting heart rate too.
    expect(
      codes(
        plan,
        facts({ metrics: [METRIC_TYPE.FTP_CYCLING, METRIC_TYPE.HR_MAX] }),
      ),
    ).toEqual(['UNKNOWN_METRIC:5']);
    expect(codes(plan, facts({ zoneNumbers: [] }))).toContain('UNKNOWN_ZONE:2');
  });

  test('checks the shape: weeks, numbering and durations', () => {
    expect(codes(planOf(GOOD.slice(0, 7)))).toContain('WEEK_COUNT:');
    const renumbered = planOf(GOOD);
    renumbered.cycles[0].weeks[2].weekNumber = 9;
    expect(codes(renumbered)).toContain('WEEK_NUMBERS:');
    const missing = planOf(GOOD);
    session(missing, 2).goalDuration = null;
    expect(codes(missing)).toContain('MISSING_DURATION:2');
  });
});

describe('aiPlanRequestSchema', () => {
  const request = (overrides: Record<string, unknown> = {}) => ({
    athleteId: 4,
    goal: { name: '10K', date: raceFor(8), sport: SPORT_TYPE.RUNNING },
    startDate: START,
    timeZone: 'Europe/Madrid',
    sports: [SPORT_TYPE.RUNNING],
    trainingDays: [2, 4, 6],
    weeklyHours: 5,
    language: 'es',
    ...overrides,
  });
  const messages = (input: unknown) => {
    const result = aiPlanRequestSchema.safeParse(input);
    return result.success
      ? []
      : result.error.issues.map((issue) => issue.message);
  };

  test('accepts up to 24 weeks ending with the race', () => {
    expect(messages(request())).toEqual([]);
    const lastDay24 = new Date(Date.UTC(2030, 9, 21) + 167 * 86400000)
      .toISOString()
      .slice(0, 10);
    expect(aiPlanWeekCount(START, lastDay24)).toBe(24);
    expect(
      messages(
        request({ goal: { name: 'M', date: lastDay24, sport: 'RUNNING' } }),
      ),
    ).toEqual([]);
    const firstDay25 = new Date(Date.UTC(2030, 9, 21) + 168 * 86400000)
      .toISOString()
      .slice(0, 10);
    expect(
      messages(
        request({ goal: { name: 'M', date: firstDay25, sport: 'RUNNING' } }),
      ),
    ).toEqual(['AI_PLAN_LENGTH']);
    expect(
      messages(
        request({ goal: { name: 'M', date: '2030-10-24', sport: 'RUNNING' } }),
      ),
    ).toEqual(['AI_PLAN_LENGTH']);
    expect(
      messages(
        request({ goal: { name: 'M', date: '2030-10-20', sport: 'RUNNING' } }),
      ),
    ).toEqual(['AI_PLAN_RACE_BEFORE_START']);
  });

  test('keeps the goal sport and long day consistent with the rest', () => {
    expect(messages(request({ sports: [SPORT_TYPE.CYCLING] }))).toEqual([
      'AI_PLAN_GOAL_SPORT',
    ]);
    expect(messages(request({ longSessionDay: 0 }))).toEqual([
      'AI_PLAN_LONG_DAY',
    ]);
    expect(messages(request({ trainingDays: [2, 2] }))).toEqual([
      'Repeated day',
    ]);
    expect(messages(request({ planId: 3 }))).not.toEqual([]);
    expect(messages(request({ constraints: 'x'.repeat(1501) }))).not.toEqual(
      [],
    );
  });
});
