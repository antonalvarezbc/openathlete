import {
  AI_PROVIDER,
  AI_TRANSCRIPTION_PROVIDER,
  hasAiApiKey,
} from '../constants/ai-models.constant';

export interface AiProviderSettings {
  agents: string;
  transcription: string;
}

const KEY_BY_PROVIDER: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

/**
 * Warnings for AI provider choices that need attention: a missing key for an
 * explicitly selected provider, or a switch away from the OpenAI default for
 * transcription.
 */
export function getAiProviderWarnings(
  settings: AiProviderSettings = {
    agents: AI_PROVIDER,
    transcription: AI_TRANSCRIPTION_PROVIDER,
  },
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const warnings: string[] = [];
  const missingKey = (provider: string) => {
    const key = KEY_BY_PROVIDER[provider];
    return key && !hasAiApiKey(key, env) ? key : undefined;
  };

  const agentsKey = settings.agents === 'anthropic' && missingKey('anthropic');
  if (agentsKey) {
    warnings.push(
      `AI_PROVIDER=anthropic but ${agentsKey} is not set: AI agents will fail.`,
    );
  }

  // With Claude agents, OpenAI may no longer be configured for transcription.
  const transcriptionKey = missingKey(settings.transcription);
  if (
    transcriptionKey &&
    (settings.transcription !== 'openai' || settings.agents === 'anthropic')
  ) {
    warnings.push(
      `Voice note transcription: AI_TRANSCRIPTION_PROVIDER=${settings.transcription} needs ${transcriptionKey}, which is not set; this feature will fail.`,
    );
  }

  if (settings.transcription === 'google') {
    warnings.push(
      'AI_TRANSCRIPTION_PROVIDER=google: Gemini transcribes with a generative model, so ' +
        'transcripts are not guaranteed verbatim, and WebM (browser recordings) is not in ' +
        "Gemini's documented audio formats. Test with real voice notes before relying on it.",
    );
  }

  return warnings;
}
