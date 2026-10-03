import { RuntimeContext } from '@mastra/core/runtime-context';
import { createTool } from '@mastra/core/tools';

import { AI_TOOLS } from '../../modules/ai-tools/ai-tools.definitions';
import type { AiToolsService } from '../../modules/ai-tools/ai-tools.service';
import type { AuthUser } from '../../modules/auth/decorators/user.decorator';

export const AI_TOOLS_SERVICE_KEY = 'aiToolsService';
export const AI_TOOLS_USER_KEY = 'aiToolsUser';

/** Runtime context that lets data tools act as the requesting user. */
export function aiToolsRuntimeContext(service: AiToolsService, user: AuthUser) {
  const context = new RuntimeContext();
  context.set(AI_TOOLS_SERVICE_KEY, service);
  context.set(AI_TOOLS_USER_KEY, user);
  return context;
}

/**
 * The shared read-only data tools as Mastra tools. Access is checked by
 * AiToolsService for the user in the runtime context; errors are returned to
 * the model as data so it can adjust instead of failing the answer.
 */
export const openAthleteDataTools = Object.fromEntries(
  AI_TOOLS.map((tool) => [
    tool.name,
    createTool({
      id: tool.name,
      description: tool.description,
      inputSchema: tool.input,
      execute: async ({ context, runtimeContext }) => {
        const service = runtimeContext.get(AI_TOOLS_SERVICE_KEY) as
          | AiToolsService
          | undefined;
        const user = runtimeContext.get(AI_TOOLS_USER_KEY) as
          | AuthUser
          | undefined;
        if (!service || !user) return { error: 'Data tools are unavailable' };
        try {
          return await service.run(user, tool.name, context);
        } catch (error) {
          return {
            error:
              error instanceof Error ? error.message.slice(0, 300) : 'Failed',
          };
        }
      },
    }),
  ]),
);
