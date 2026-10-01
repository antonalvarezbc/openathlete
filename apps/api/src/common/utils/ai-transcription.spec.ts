import { getVoiceTranscriptionStatus } from './ai-transcription.util';

describe('getVoiceTranscriptionStatus', () => {
  const claude = { agents: 'anthropic', transcription: 'openai' };

  it('is available with a key for the transcription provider', () => {
    expect(
      getVoiceTranscriptionStatus(claude, { OPENAI_API_KEY: 'sk-real' }),
    ).toBe('available');
    expect(
      getVoiceTranscriptionStatus(
        { agents: 'anthropic', transcription: 'google' },
        { GOOGLE_GENERATIVE_AI_API_KEY: 'g-real' },
      ),
    ).toBe('available');
  });

  it('blames the AI provider when Claude has no alternative', () => {
    expect(
      getVoiceTranscriptionStatus(claude, {
        ANTHROPIC_API_KEY: 'sk-ant-real',
        OPENAI_API_KEY: 'sk-your-openai-api-key',
      }),
    ).toBe('unsupported-by-ai-provider');
  });

  it('reports missing configuration otherwise', () => {
    expect(
      getVoiceTranscriptionStatus(
        { agents: 'openai', transcription: 'openai' },
        {},
      ),
    ).toBe('not-configured');
    // An explicit Google choice without its key is a configuration error.
    expect(
      getVoiceTranscriptionStatus(
        { agents: 'anthropic', transcription: 'google' },
        { OPENAI_API_KEY: 'sk-real' },
      ),
    ).toBe('not-configured');
  });
});
