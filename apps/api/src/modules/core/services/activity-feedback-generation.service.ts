import { z } from 'zod';

import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { Prisma } from '@openathlete/database';
import { FeatureName } from '@openathlete/shared';

import {
  POST_ACTIVITY_FEEDBACK_MODEL,
  getAiModelApiKeyEnvVar,
  hasAiApiKey,
} from 'src/common/constants/ai-models.constant';
import { Language } from 'src/common/constants/languages.constant';
import { postActivityFeedbackAgent } from 'src/mastra/agents/post-activity-feedback.agent';
import {
  buildMetricsContext,
  buildZonesContext,
  fetchAthleteMetrics,
  fetchAthleteZones,
  formatZonesByType,
} from 'src/modules/agent/services/event-ai-helpers';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';
import { FeatureAccessService } from 'src/modules/subscription/services/feature-access.service';

export const feedbackQuestionsSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(500),
            qcmOptions: z
              .array(
                z.object({ label: z.string().trim().min(1).max(200) }).strict(),
              )
              .min(2)
              .max(8)
              .optional(),
          })
          .strict(),
      )
      .min(3)
      .max(4),
  })
  .strict()
  .refine(
    ({ questions }) =>
      new Set(questions.map((q) => q.text.toLocaleLowerCase())).size ===
      questions.length,
  );

@Injectable()
export class ActivityFeedbackGenerationService {
  private readonly pending = new Map<number, Promise<void>>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FeatureAccessService,
  ) {}

  private async authorize(
    user: AuthUser,
    eventActivityId: number,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const activity = await db.eventActivity.findUnique({
      where: { eventActivityId },
      select: { event: { select: { athleteId: true } } },
    });
    const athleteId = activity?.event?.athleteId;
    if (!athleteId) throw new NotFoundException('Activity not found');
    if (user.athlete?.athleteId === athleteId) return;
    if (
      !user.roles?.includes('COACH') ||
      !(await db.coachAthlete.findFirst({
        where: { userId: user.userId, athleteId },
      }))
    ) {
      throw new ForbiddenException('Access denied to this activity');
    }
  }

  async generateForUser(user: AuthUser, eventActivityId: number) {
    await this.authorize(user, eventActivityId);
    await this.generate(eventActivityId, user);
    await this.authorize(user, eventActivityId);
  }

  async generate(eventActivityId: number, user?: AuthUser) {
    const existing = this.pending.get(eventActivityId);
    if (existing) return existing;
    const operation = this.generateAndStore(eventActivityId, user);
    this.pending.set(eventActivityId, operation);
    try {
      await operation;
    } finally {
      this.pending.delete(eventActivityId);
    }
  }

  private async generateAndStore(eventActivityId: number, user?: AuthUser) {
    const activity = await this.prisma.eventActivity.findUnique({
      where: { eventActivityId },
      include: {
        relatedCompetition: true,
        relatedTraining: true,
        feedbackQuestions: true,
        event: {
          include: {
            athlete: { include: { user: { select: { language: true } } } },
          },
        },
      },
    });
    if (!activity?.event?.athlete)
      throw new NotFoundException('Activity not found');
    if (activity.feedbackQuestions.length) return;
    const athleteId = activity.event.athlete.athleteId;
    const settings = await this.prisma.athleteSettings.findUnique({
      where: { athleteId },
    });
    if (!settings?.requireFeedbackQuestions)
      throw new ForbiddenException('FEEDBACK_DISABLED');
    if (
      !(await this.access.canAccessFeatureForAthlete(
        athleteId,
        FeatureName.AI_RPE_QUESTIONS,
      ))
    )
      throw new ForbiddenException('FEEDBACK_AI_UNAVAILABLE');
    const userLanguage = activity.event.athlete.user?.language ?? Language.EN;
    const keyName = getAiModelApiKeyEnvVar(POST_ACTIVITY_FEEDBACK_MODEL);
    if (keyName && !hasAiApiKey(keyName)) {
      throw new ServiceUnavailableException('FEEDBACK_MODEL_NOT_CONFIGURED');
    }

    // Fetch last metrics & zones for context
    const [metrics, zones] = await Promise.all([
      fetchAthleteMetrics(this.prisma, athleteId),
      fetchAthleteZones(this.prisma, athleteId),
    ]);

    // Fetch active injuries separately (new Prisma model)
    const injuries =
      (await this.prisma.athleteInjury?.findMany({
        where: { athleteId: athleteId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })) ?? [];

    const injuryMap = new Map<string, (typeof injuries)[number]>();
    for (const injury of injuries) {
      if (!injuryMap.has(injury.location)) {
        injuryMap.set(injury.location, injury);
      }
    }

    const activeInjuries = Array.from(injuryMap.values()).filter(
      (injury) => injury.painScore > 0 && injury.status !== 'RESOLVED',
    );

    const latestMetrics = Object.fromEntries(
      [...metrics].reverse().map((metric) => [metric.type, metric.value]),
    ) as Parameters<typeof buildMetricsContext>[0];
    const athleteMetricsSummary = buildMetricsContext(latestMetrics);
    const zonesByType = formatZonesByType(zones);
    const trainingZonesSummary = buildZonesContext(zonesByType);

    const training = activity.relatedTraining;
    const competition = activity.relatedCompetition;
    const goalSummary = training
      ? `Target distance: ${training.goalDistance ?? 'n/a'} m, Target elevation gain: ${training.goalElevationGain ?? 'n/a'} m, Target duration: ${training.goalDuration ?? 'n/a'} s, Target RPE: ${training.goalRpe ?? 'n/a'}`
      : competition
        ? `Target distance: ${competition.goalDistance ?? 'n/a'} m, Target elevation gain: ${competition.goalElevationGain ?? 'n/a'} m, Target duration: ${competition.goalDuration ?? 'n/a'} s, Target RPE: ${competition.goalRpe ?? 'n/a'}`
        : 'No goals specified';

    const injuriesSummary =
      activeInjuries.length === 0
        ? 'No active injuries reported.'
        : activeInjuries
            .map(
              (injury: {
                location: string;
                painScore: number;
                status: string;
              }) =>
                `- ${injury.location} (pain score: ${injury.painScore.toFixed(2)}, status: ${injury.status})`,
            )
            .join('\n');

    const plannedVsCompletedSummary = [
      `Event name: ${activity.event.name}`,
      `Sport: ${activity.sport}`,
      '',
      'PLANNED (if available):',
      training
        ? `- Target distance: ${training.goalDistance ?? 'n/a'} m\n- Target elevation gain: ${training.goalElevationGain ?? 'n/a'} m\n- Target duration: ${training.goalDuration ?? 'n/a'} s\n- Target RPE: ${training.goalRpe ?? 'n/a'}`
        : 'No planned training linked to this activity.',
      '',
      'COMPLETED:',
      `- Distance: ${activity.distance} m`,
      `- Elevation gain: ${activity.elevationGain} m`,
      `- Duration (moving_time): ${activity.movingTime} s`,
      `- Actual RPE: ${activity.rpe ?? 'n/a'}`,
      `- Average HR: ${activity.averageHeartrate ?? 'n/a'} bpm`,
    ].join('\n');

    const targetLanguage =
      { FR: 'French', EN: 'English', IT: 'Italian', ES: 'Spanish' }[
        userLanguage
      ] ?? 'English';

    const context = [
      '=== LATEST STORED METRICS (no historical trends supplied) ===',
      athleteMetricsSummary,
      'Missing values are unknown. No CTL, ATL, TSB or training history is supplied. Do not infer trends.',
      '',
      '=== TRAINING ZONES ===',
      trainingZonesSummary,
      '',
      '=== CURRENT INJURIES ===',
      injuriesSummary,
      '',
      '=== SESSION GOALS ===',
      goalSummary,
      '',
      '=== PLANNED VS COMPLETED COMPARISON ===',
      plannedVsCompletedSummary,
      '',
      `=== LANGUAGE REQUIREMENT ===`,
      `IMPORTANT: Generate all questions and QCM option labels in ${targetLanguage} (${userLanguage}).`,
      `Use ${({ French: 'tu', Italian: 'tu', Spanish: 'tú', English: 'you' } as Record<string, string>)[targetLanguage]} form, direct and friendly coaching style.`,
    ].join('\n');

    let response: { text?: string };
    try {
      response = await postActivityFeedbackAgent.generate(context, {
        abortSignal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new BadGatewayException('FEEDBACK_PROVIDER_ERROR');
    }
    let parsed: z.infer<typeof feedbackQuestionsSchema>;
    try {
      const text = response.text
        ?.trim()
        .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
      const result = feedbackQuestionsSchema.safeParse(
        JSON.parse(text || 'null'),
      );
      if (!result.success) throw new Error('Invalid generated questionnaire');
      parsed = result.data;
    } catch {
      throw new BadGatewayException('FEEDBACK_INVALID_QUESTIONS');
    }
    // No external requests while holding a row lock. All generation paths share
    // this lock so separate API processes cannot insert duplicate questionnaires.
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT event_activity_id FROM event_activity WHERE event_activity_id = ${eventActivityId} FOR UPDATE`,
      );
      if (user) await this.authorize(user, eventActivityId, tx);
      const currentSettings = await tx.athleteSettings.findUnique({
        where: { athleteId },
      });
      if (!currentSettings?.requireFeedbackQuestions)
        throw new ForbiddenException('FEEDBACK_DISABLED');
      if (
        await tx.activityFeedbackQuestion.count({ where: { eventActivityId } })
      )
        return;
      await tx.activityFeedbackQuestion.createMany({
        data: parsed.questions.map((question) => ({
          eventActivityId,
          questionText: question.text,
          qcmOptions: question.qcmOptions ?? Prisma.DbNull,
        })),
      });
    });
  }
}
