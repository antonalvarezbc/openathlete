import { AdaptationContextResponse } from '@/api/plan-adaptation/plan-adaptation.api';
import client from '@/utils/axios';

import {
  CoachAssistantChatRequest,
  CoachAssistantContextRequest,
} from '@openathlete/shared';

export const CoachAssistantAPI = {
  context: async (input: CoachAssistantContextRequest) =>
    (
      await client.post<AdaptationContextResponse>(
        '/agent/ai/coach-assistant/context',
        input,
      )
    ).data,
  chat: async (input: CoachAssistantChatRequest) =>
    (
      await client.post<{ reply: string; context: AdaptationContextResponse }>(
        '/agent/ai/coach-assistant/chat',
        input,
      )
    ).data,
};
