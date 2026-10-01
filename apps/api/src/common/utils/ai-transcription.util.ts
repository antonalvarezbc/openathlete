import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

import { ServiceUnavailableException } from '@nestjs/common';

import { VoiceTranscriptionStatus } from '@openathlete/shared';

import {
  AI_PROVIDER,
  AI_TRANSCRIPTION_PROVIDER,
  GOOGLE_TRANSCRIPTION_MODEL,
  hasAiApiKey,
} from '../constants/ai-models.constant';

/**
 * Whether voice notes can be transcribed. Claude has no audio input, so a
 * Claude installation without an OpenAI or Google key reports the AI
 * provider as the reason rather than a generic missing configuration.
 */
export function getVoiceTranscriptionStatus(
  settings = { agents: AI_PROVIDER, transcription: AI_TRANSCRIPTION_PROVIDER },
  env: NodeJS.ProcessEnv = process.env,
): VoiceTranscriptionStatus {
  const key =
    settings.transcription === 'google'
      ? 'GOOGLE_GENERATIVE_AI_API_KEY'
      : 'OPENAI_API_KEY';
  if (hasAiApiKey(key, env)) return 'available';
  return settings.agents === 'anthropic' && settings.transcription === 'openai'
    ? 'unsupported-by-ai-provider'
    : 'not-configured';
}

export function assertVoiceTranscriptionAvailable() {
  const status = getVoiceTranscriptionStatus();
  if (status === 'unsupported-by-ai-provider')
    throw new ServiceUnavailableException(
      'TRANSCRIPTION_UNSUPPORTED_BY_AI_PROVIDER',
    );
  if (status === 'not-configured')
    throw new ServiceUnavailableException('TRANSCRIPTION_NOT_CONFIGURED');
}

const LANGUAGE_NAMES = {
  es: 'Spanish',
  en: 'English',
  fr: 'French',
  it: 'Italian',
} as const;

/**
 * Transcribes a voice note with Gemini. Unlike Whisper this is a generative
 * model, so the prompt asks for a verbatim transcript only.
 */
export async function transcribeAudioWithGoogle(
  audio: Buffer,
  mediaType: string,
  language?: keyof typeof LANGUAGE_NAMES,
): Promise<string> {
  const { text } = await generateText({
    model: google(GOOGLE_TRANSCRIPTION_MODEL),
    system:
      'You transcribe audio. Return only the verbatim transcript of the speech, in the language spoken, with no translation, summary, headings or commentary. If there is no speech, return an empty response.',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: language
              ? `Transcribe this audio. The speaker uses ${LANGUAGE_NAMES[language]}.`
              : 'Transcribe this audio.',
          },
          { type: 'file', data: audio, mediaType },
        ],
      },
    ],
  });
  return text.trim();
}
