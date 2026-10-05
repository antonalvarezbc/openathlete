import type { AgentSpec } from 'src/modules/ai';

import { WORKOUT_PARSER_INSTRUCTIONS } from '../../modules/agent/services/workout-parser';

export const workoutParserAgent: AgentSpec = {
  id: 'workout-parser',
  name: 'workout-parser',
  instructions: WORKOUT_PARSER_INSTRUCTIONS,
};
