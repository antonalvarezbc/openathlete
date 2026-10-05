import { Agent } from '@mastra/core/agent';

import { EVENT_MODIFICATION_MODEL } from '../../common/constants/ai-models.constant';
import { PLAN_GENERATION_INSTRUCTIONS } from '../../modules/agent/services/plan-generation';

/** Same instance model and access as plan adaptation. */
export const planGenerationAgent = new Agent({
  id: 'plan-generation',
  name: 'plan-generation',
  model: EVENT_MODIFICATION_MODEL,
  instructions: PLAN_GENERATION_INSTRUCTIONS,
  // No hidden retries: the default error processors retry quota and key
  // errors too. Callers retry rate limits and outages (shouldRetryAiCall).
  errorProcessorDefaults: false,
});
