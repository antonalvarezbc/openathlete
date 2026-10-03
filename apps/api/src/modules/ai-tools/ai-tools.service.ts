import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { AuthUser } from '../auth/decorators/user.decorator';
import { TrainingLoadService } from '../core/services/training-load.service';
import { WeekPlanningService } from '../core/services/week-planning.service';
import { PrismaService } from '../prisma/services/prisma.service';
import { AI_TOOLS } from './ai-tools.definitions';
import { AiToolDeps } from './ai-tools.types';

export interface AiToolDescription {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Runs the shared read-only data tools for internal agents and the MCP
 * endpoint. Every call validates its input and checks access for the user.
 */
@Injectable()
export class AiToolsService {
  private readonly logger = new Logger(AiToolsService.name);
  private readonly deps: AiToolDeps;

  constructor(
    prisma: PrismaService,
    trainingLoad: TrainingLoadService,
    weekPlanning: WeekPlanningService,
  ) {
    this.deps = { prisma, trainingLoad, weekPlanning };
  }

  describe(): AiToolDescription[] {
    return AI_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.input, {
        target: 'jsonSchema7',
        $refStrategy: 'none',
      }) as Record<string, unknown>,
    }));
  }

  async run(user: AuthUser, name: string, input: unknown): Promise<unknown> {
    const tool = AI_TOOLS.find((candidate) => candidate.name === name);
    if (!tool) throw new NotFoundException(`Unknown tool ${name}`);
    const parsed = tool.input.safeParse(input ?? {});
    if (!parsed.success)
      throw new BadRequestException({
        code: 'AI_TOOL_INVALID_INPUT',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    const started = Date.now();
    const result = await tool.run(this.deps, user, parsed.data);
    this.logger.debug(
      `${name} for user ${user.userId} in ${Date.now() - started}ms`,
    );
    return result;
  }
}
