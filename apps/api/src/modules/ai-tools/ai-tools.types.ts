import { z } from 'zod';

import { AuthUser } from '../auth/decorators/user.decorator';
import { TrainingLoadService } from '../core/services/training-load.service';
import { WeekPlanningService } from '../core/services/week-planning.service';
import { PrismaService } from '../prisma/services/prisma.service';

export interface AiToolDeps {
  prisma: PrismaService;
  trainingLoad: TrainingLoadService;
  weekPlanning: WeekPlanningService;
}

/**
 * A read-only data tool shared by internal agents and the MCP server.
 * Handlers enforce access for `user` and return bounded, JSON-serializable data.
 */
export interface AiTool<Input extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  input: Input;
  run(
    deps: AiToolDeps,
    user: AuthUser,
    input: z.infer<Input>,
  ): Promise<unknown>;
}

export const defineTool = <Input extends z.ZodTypeAny>(tool: AiTool<Input>) =>
  tool as unknown as AiTool;
