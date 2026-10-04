import { getAiProviderWarnings } from './ai-provider-warnings.util';

const defaults = {
  agents: 'openai',
  transcription: 'openai',
};

describe('getAiProviderWarnings', () => {
  it('stays quiet for the default OpenAI setup, even without keys', () => {
    expect(getAiProviderWarnings(defaults, {})).toEqual([]);
  });

  it('warns when Claude is selected without an Anthropic key', () => {
    const warnings = getAiProviderWarnings(
      { ...defaults, agents: 'anthropic' },
      {
        OPENAI_API_KEY: 'sk-real',
        ANTHROPIC_API_KEY: 'your-anthropic-api-key',
      },
    );
    expect(warnings).toEqual([expect.stringContaining('ANTHROPIC_API_KEY')]);
  });

  it('warns when Claude agents leave transcription without a key', () => {
    const warnings = getAiProviderWarnings(
      { ...defaults, agents: 'anthropic' },
      { ANTHROPIC_API_KEY: 'sk-ant-real' },
    );
    expect(warnings).toEqual([
      expect.stringContaining(
        'Voice note transcription: AI_TRANSCRIPTION_PROVIDER=openai',
      ),
    ]);
  });

  it('warns about the Google transcription trade-offs', () => {
    const warnings = getAiProviderWarnings(
      { agents: 'anthropic', transcription: 'google' },
      {
        ANTHROPIC_API_KEY: 'sk-ant-real',
        GOOGLE_GENERATIVE_AI_API_KEY: 'g-real',
      },
    );
    expect(warnings).toEqual([
      expect.stringContaining('not guaranteed verbatim'),
    ]);
  });

  it('warns when Google is selected without a Google key', () => {
    const warnings = getAiProviderWarnings(
      { ...defaults, transcription: 'google' },
      {},
    );
    expect(warnings[0]).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
  });
});
