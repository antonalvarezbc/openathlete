import type { AgentSpec } from 'src/modules/ai';

import { PLAN_GENERATION_INSTRUCTIONS } from '../../modules/agent/services/plan-generation';

export const planGenerationAgent: AgentSpec = {
  id: 'plan-generation',
  name: 'plan-generation',
  instructions: PLAN_GENERATION_INSTRUCTIONS,
};
