import { Agent } from '@mastra/core/agent';

import { WORKOUT_PARSER_MODEL } from '../../common/constants/ai-models.constant';
import { WORKOUT_PARSER_INSTRUCTIONS } from '../../modules/agent/services/workout-parser';

export const workoutParserAgent = new Agent({
  id: 'workout-parser',
  name: 'workout-parser',
  model: WORKOUT_PARSER_MODEL,
  instructions: WORKOUT_PARSER_INSTRUCTIONS,
  // No hidden retries: the default error processors retry quota and key
  // errors too. Callers retry rate limits and outages (shouldRetryAiCall).
  errorProcessorDefaults: false,
});
