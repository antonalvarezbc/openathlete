import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { CoachActivityAnalysis, Prisma } from '@openathlete/database';
import {
  ActivityAnalysisRequest,
  SavedActivityAnalysis,
  UpdateActivityAnalysis,
  activityAnalysisResultSchema,
} from '@openathlete/shared';

import { EVENT_MODIFICATION_MODEL } from '../../../common/constants/ai-models.constant';
import {
  ACTIVITY_ANALYSIS_PROMPT_VERSION,
  activityAnalysisAgent,
} from '../../../mastra/agents/activity-analysis.agent';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { buildActivityAnalysisContext } from './activity-analysis-context';

@Injectable()
export class ActivityAnalysisService {
  private readonly pending = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

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
      select: { activity: { select: { eventActivityId: true } } },
    });
    if (!event?.activity) throw new NotFoundException('Activity not available');
    return event.activity.eventActivityId;
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
    const eventActivityId = await this.authorize(user, eventId);
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
    await this.authorize(user, eventId);
    const data = await buildActivityAnalysisContext(
      this.prisma,
      eventId,
      request.coachContext,
      request.language,
    );
    return { data };
  }

  async generate(
    user: AuthUser,
    eventId: number,
    request: ActivityAnalysisRequest,
  ) {
    const key = `${user.userId}:${eventId}`;
    if (this.pending.has(key))
      throw new ConflictException({ code: 'ACTIVITY_ANALYSIS_BUSY' });
    this.pending.add(key);
    try {
      const { data } = await this.context(user, eventId, request);
      let output: unknown;
      try {
        const result = await activityAnalysisAgent.generate(
          JSON.stringify(data),
          {
            structuredOutput: { schema: activityAnalysisResultSchema },
            maxSteps: 1,
            abortSignal: AbortSignal.timeout(120_000),
          },
        );
        output = result.object;
      } catch (error) {
        // Never expose provider response bodies, request headers or credentials.
        if (
          error instanceof Error &&
          (error.name === 'AI_NoObjectGeneratedError' ||
            error.name === 'ZodError' ||
            error.message.includes('Structured output validation failed'))
        )
          throw new UnprocessableEntityException({
            code: 'ACTIVITY_ANALYSIS_INVALID',
          });
        throw new ServiceUnavailableException({
          code: 'ACTIVITY_ANALYSIS_PROVIDER',
        });
      }
      const parsed = activityAnalysisResultSchema.safeParse(output);
      if (!parsed.success)
        throw new UnprocessableEntityException({
          code: 'ACTIVITY_ANALYSIS_INVALID',
        });
      // The provider has no database tools. Only validated output is persisted,
      // and authorization is rechecked after the possibly long model request.
      return await this.prisma.$transaction(async (tx) => {
        const eventActivityId = await this.authorize(user, eventId, tx);
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
            model: EVENT_MODIFICATION_MODEL,
            promptVersion: ACTIVITY_ANALYSIS_PROMPT_VERSION,
          },
        });
        return this.serialize(saved, eventId);
      });
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
      const eventActivityId = await this.authorize(user, eventId, tx);
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
