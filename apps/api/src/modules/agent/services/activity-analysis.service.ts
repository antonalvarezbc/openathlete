import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { CoachActivityAnalysis, Prisma } from '@openathlete/database';
import {
  ActivityAnalysisRequest,
  ActivityAnalysisResult,
  AiTask,
  SavedActivityAnalysis,
  UpdateActivityAnalysis,
  activityAnalysisResultSchema,
} from '@openathlete/shared';

import {
  ACTIVITY_ANALYSIS_PROMPT_VERSION,
  activityAnalysisAgent,
} from '../../../mastra/agents/activity-analysis.agent';
import { AiModelResolverService, AiService } from '../../ai';
import { AiMemoryService } from '../../ai-memory/ai-memory.service';
import { AiInvalidAnswerException } from '../../ai/ai.errors';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { buildActivityAnalysisContext } from './activity-analysis-context';

@Injectable()
export class ActivityAnalysisService {
  private readonly pending = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly memory: AiMemoryService,
    private readonly resolver: AiModelResolverService,
    private readonly ai: AiService,
  ) {}

  private async authorize(
    user: AuthUser,
    eventId: number,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    if (!user.roles?.includes('COACH'))
      throw new ForbiddenException('Coach role required');
    const event = await db.event.findFirst({
      where: {
        eventId,
        type: 'ACTIVITY',
        athlete: {
          OR: [
            { coachAthletes: { some: { userId: user.userId } } },
            ...(user.roles.includes('ATHLETE')
              ? [{ userId: user.userId }]
              : []),
          ],
        },
      },
      select: {
        athleteId: true,
        activity: { select: { eventActivityId: true } },
      },
    });
    if (!event?.activity || !event.athleteId)
      throw new NotFoundException('Activity not available');
    return {
      eventActivityId: event.activity.eventActivityId,
      athleteId: event.athleteId,
    };
  }

  private serialize(
    row: CoachActivityAnalysis,
    eventId: number,
  ): SavedActivityAnalysis {
    return {
      activityAnalysisId: row.activityAnalysisId,
      eventId,
      coachContext: row.coachContext,
      language: row.language as ActivityAnalysisRequest['language'],
      analysis: activityAnalysisResultSchema.parse(row.analysis),
      feedbackDraft: row.feedbackDraft,
      contextSnapshot: row.contextSnapshot as Record<string, unknown>,
      model: row.model,
      promptVersion: row.promptVersion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(user: AuthUser, eventId: number) {
    const { eventActivityId } = await this.authorize(user, eventId);
    const records = await this.prisma.coachActivityAnalysis.findMany({
      where: { eventActivityId, coachUserId: user.userId },
      orderBy: [{ createdAt: 'desc' }, { activityAnalysisId: 'desc' }],
      take: 20,
    });
    return records.map((record) => this.serialize(record, eventId));
  }

  async context(
    user: AuthUser,
    eventId: number,
    request: ActivityAnalysisRequest,
  ) {
    const { data } = await this.buildContext(user, eventId, request);
    return { data };
  }

  private async buildContext(
    user: AuthUser,
    eventId: number,
    request: ActivityAnalysisRequest,
  ) {
    const { eventActivityId, athleteId } = await this.authorize(user, eventId);
    const [data, aiMemory] = await Promise.all([
      buildActivityAnalysisContext(
        this.prisma,
        eventId,
        request.coachContext,
        request.language,
      ),
      this.memory.getCoachMemory(user.userId, athleteId, {
        excludeEventActivityId: eventActivityId,
      }),
    ]);
    return { data: aiMemory ? { ...data, aiMemory } : data, athleteId };
  }

  async generate(
    user: AuthUser,
    eventId: number,
    request: ActivityAnalysisRequest,
  ) {
    // The coach's own AI settings, checked before anything else.
    const model = await this.resolver.resolveForUser(
      AiTask.ACTIVITY_ANALYSIS,
      user.userId,
    );
    const key = `${user.userId}:${eventId}`;
    if (this.pending.has(key))
      throw new ConflictException({ code: 'ACTIVITY_ANALYSIS_BUSY' });
    this.pending.add(key);
    try {
      const { data, athleteId } = await this.buildContext(
        user,
        eventId,
        request,
      );
      let output: unknown;
      try {
        output = await this.ai.generateObject(
          activityAnalysisAgent,
          model,
          JSON.stringify(data),
          activityAnalysisResultSchema,
        );
      } catch (error) {
        // Provider errors reach the coach as AiService reports them, without
        // provider bodies, headers or keys.
        if (error instanceof AiInvalidAnswerException)
          throw new UnprocessableEntityException({
            code: 'ACTIVITY_ANALYSIS_INVALID',
          });
        throw error;
      }
      const parsed = activityAnalysisResultSchema.safeParse(output);
      if (!parsed.success)
        throw new UnprocessableEntityException({
          code: 'ACTIVITY_ANALYSIS_INVALID',
        });
      // The provider has no database tools. Only validated output is persisted,
      // and authorization is rechecked after the possibly long model request.
      const saved = await this.prisma.$transaction(async (tx) => {
        const { eventActivityId } = await this.authorize(user, eventId, tx);
        const saved = await tx.coachActivityAnalysis.create({
          data: {
            eventActivityId,
            coachUserId: user.userId,
            coachContext: request.coachContext,
            language: request.language,
            analysis: parsed.data,
            feedbackDraft: parsed.data.athleteFeedback,
            contextSnapshot: JSON.parse(
              JSON.stringify(data),
            ) as Prisma.InputJsonObject,
            model: `${model.provider}/${model.modelId}`,
            promptVersion: ACTIVITY_ANALYSIS_PROMPT_VERSION,
          },
        });
        return this.serialize(saved, eventId);
      });
      await this.memory.addNote(
        user.userId,
        athleteId,
        'ACTIVITY_ANALYSIS',
        activityAnalysisNote(data, parsed.data),
      );
      return saved;
    } finally {
      this.pending.delete(key);
    }
  }

  async updateFeedback(
    user: AuthUser,
    eventId: number,
    analysisId: number,
    request: UpdateActivityAnalysis,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { eventActivityId } = await this.authorize(user, eventId, tx);
      const where = {
        activityAnalysisId: analysisId,
        eventActivityId,
        coachUserId: user.userId,
      };
      const result = await tx.coachActivityAnalysis.updateMany({
        where,
        data: { feedbackDraft: request.feedbackDraft },
      });
      if (!result.count) throw new NotFoundException('Analysis not available');
      const saved = await tx.coachActivityAnalysis.findFirstOrThrow({ where });
      return this.serialize(saved, eventId);
    });
  }
}

/** One-line digest of an analysis for the coach's AI memory. */
export function activityAnalysisNote(
  context: Record<string, unknown>,
  analysis: ActivityAnalysisResult,
): string {
  const activity = context.activity as
    { name?: string; startDate?: string; sport?: string } | undefined;
  const label = [
    activity?.startDate?.slice(0, 10),
    activity?.sport,
    activity?.name,
  ]
    .filter(Boolean)
    .join(' ');
  return [
    label && `${label}:`,
    analysis.summary,
    analysis.concerns[0] && `Concern: ${analysis.concerns[0]}`,
    analysis.nextSteps[0] && `Next: ${analysis.nextSteps[0]}`,
  ]
    .filter(Boolean)
    .join(' ');
}
