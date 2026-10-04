import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import {
  CoachAssistantChatRequest,
  CoachAssistantContextRequest,
} from '@openathlete/shared';

import { coachAssistantAgent } from '../../../mastra/agents/coach-assistant.agent';
import { aiToolsRequestContext } from '../../../mastra/tools/openathlete-data.tools';
import { AiMemoryService } from '../../ai-memory/ai-memory.service';
import { AiToolsService } from '../../ai-tools/ai-tools.service';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { PlanAdaptationService } from './plan-adaptation.service';

@Injectable()
export class CoachAssistantService {
  constructor(
    private readonly adaptation: PlanAdaptationService,
    private readonly memory: AiMemoryService,
    private readonly tools: AiToolsService,
  ) {}

  async context(user: AuthUser, input: CoachAssistantContextRequest) {
    const context = await this.adaptation.context(
      user,
      {
        ...input,
        currentState: input.currentState || 'Not provided',
        scope: 'WEEK',
        readiness: 'UNKNOWN',
        instructions: '',
        allowIncrease: false,
        maxIncreasePercent: 0,
        allowRedistribution: false,
        allowNewSessions: false,
      },
      undefined,
      new Date(),
      'CONSULTATION',
    );
    return {
      ...context,
      data: await this.adaptation.withMemory(
        user,
        input.athleteId,
        context.data,
      ),
    };
  }

  async chat(user: AuthUser, input: CoachAssistantChatRequest) {
    // Always recheck ownership and fetch current data, including on follow-up turns.
    const { question, history, ...selection } = input;
    const context = await this.context(user, selection);
    try {
      const result = await coachAssistantAgent.generate(
        JSON.stringify({
          language: context.data.language,
          context: context.data,
          history,
          question,
        }),
        {
          // Read-only data tools act as this user (same access checks as the API).
          requestContext: aiToolsRequestContext(this.tools, user),
          maxSteps: 6,
        },
      );
      const reply = result.text?.trim();
      if (!reply || reply.length > 8000)
        throw new Error('Invalid assistant response');
      await this.memory.addNote(
        user.userId,
        selection.athleteId,
        'COACH_ASSISTANT',
        `Coach asked: ${question} → ${reply}`,
      );
      return { reply, context };
    } catch {
      // Do not return provider errors, request headers or credentials to the client.
      throw new ServiceUnavailableException({
        code: 'COACH_ASSISTANT_PROVIDER',
      });
    }
  }
}
