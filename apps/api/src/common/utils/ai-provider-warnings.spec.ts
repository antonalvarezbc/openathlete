import { getAiProviderWarnings } from './ai-provider-warnings.util';

const defaults = {
  agents: 'openai',
  embeddings: 'openai',
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

  it('warns when Claude agents leave OpenAI features without a key', () => {
    const warnings = getAiProviderWarnings(
      { ...defaults, agents: 'anthropic' },
      { ANTHROPIC_API_KEY: 'sk-ant-real' },
    );
    expect(warnings).toHaveLength(2);
    expect(warnings.join('\n')).toContain(
      'Embeddings: AI_EMBEDDING_PROVIDER=openai',
    );
    expect(warnings.join('\n')).toContain(
      'Voice note transcription: AI_TRANSCRIPTION_PROVIDER=openai',
    );
  });

  it('warns about Google embeddings and transcription trade-offs', () => {
    const warnings = getAiProviderWarnings(
      { agents: 'anthropic', embeddings: 'google', transcription: 'google' },
      {
        ANTHROPIC_API_KEY: 'sk-ant-real',
        GOOGLE_GENERATIVE_AI_API_KEY: 'g-real',
      },
    );
    expect(warnings).toEqual([
      expect.stringContaining('not comparable'),
      expect.stringContaining('not guaranteed verbatim'),
    ]);
  });

  it('warns when Google is selected without a Google key', () => {
    const warnings = getAiProviderWarnings(
      { ...defaults, embeddings: 'google' },
      {},
    );
    expect(warnings[0]).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
  });
});
