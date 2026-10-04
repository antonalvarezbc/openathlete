import { CUSTOM_AI_PROVIDER } from '@openathlete/shared';

import { ModelRegistry } from '../model-registry';
import { AiPolicyService } from './ai-policy.service';
import {
  AiProviderCatalogService,
  isPrivateUrl,
} from './ai-provider-catalog.service';

const registry: ModelRegistry = {
  providers: {
    zeta: {
      name: 'Zeta AI',
      apiKeyEnvVar: 'ZETA_API_KEY',
      models: ['z-1'],
    },
    openai: {
      name: 'OpenAI',
      apiKeyEnvVar: 'OPENAI_API_KEY',
      models: ['gpt-4', 'gpt-5.1'],
      deprecatedModels: ['gpt-4'],
      docUrl: 'https://platform.openai.com/docs',
    },
    anthropic: {
      name: 'Anthropic',
      apiKeyEnvVar: 'ANTHROPIC_API_KEY',
      models: ['claude-sonnet-4-5'],
    },
    google: {
      name: 'Google',
      apiKeyEnvVar: ['GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
      models: ['gemini-2.5-flash'],
    },
    lmstudio: {
      name: 'LMStudio',
      url: 'http://127.0.0.1:1234/v1',
      apiKeyEnvVar: 'LMSTUDIO_API_KEY',
      models: ['qwen3'],
    },
  },
  supportsStructuredOutput: (id) =>
    id === 'zeta/z-1' ? false : id.startsWith('openai/') ? true : undefined,
};

function catalog(customEndpointsAllowed: boolean) {
  return new AiProviderCatalogService(registry, {
    customEndpointsAllowed,
  } as AiPolicyService);
}

describe('AiProviderCatalogService', () => {
  it('lists featured providers first, then the others by name', () => {
    const ids = catalog(false)
      .list()
      .map((provider) => provider.id);

    expect(ids).toEqual(['openai', 'anthropic', 'google', 'zeta']);
  });

  it('hides deprecated models and flags those without JSON output', () => {
    const providers = catalog(false).list();

    expect(providers.find((p) => p.id === 'openai')?.models).toEqual([
      { id: 'gpt-5.1' },
    ]);
    expect(providers.find((p) => p.id === 'zeta')?.models).toEqual([
      { id: 'z-1', structuredOutput: false },
    ]);
  });

  it('hides local providers and custom endpoints on public instances', () => {
    const service = catalog(false);

    expect(service.list().map((p) => p.id)).not.toContain('lmstudio');
    expect(service.isAvailable('lmstudio')).toBe(false);
    expect(service.isAvailable(CUSTOM_AI_PROVIDER)).toBe(false);
  });

  it('offers them, without requiring a key, when the instance allows', () => {
    const providers = catalog(true).list();

    expect(providers.find((p) => p.id === 'lmstudio')).toMatchObject({
      apiKeyOptional: true,
    });
    expect(providers.at(-1)).toMatchObject({
      id: CUSTOM_AI_PROVIDER,
      requiresBaseUrl: true,
      apiKeyOptional: true,
    });
  });

  it('rejects unknown providers', () => {
    expect(catalog(true).isAvailable('not-a-provider')).toBe(false);
  });

  it('knows every environment variable of a provider key', () => {
    expect(catalog(false).apiKeyEnvVars('google')).toEqual([
      'GOOGLE_API_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY',
    ]);
    expect(catalog(false).apiKeyEnvVars('unknown')).toEqual([]);
  });
});

describe('isPrivateUrl', () => {
  it.each([
    'http://localhost:11434/v1',
    'http://127.0.0.1:1234',
    'http://10.0.0.5/v1',
    'http://192.168.1.10:8000',
    'http://172.20.0.3',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]:8080',
    'http://redis:6379',
    'http://ollama.local:11434',
    'not a url',
  ])('treats %s as private', (url) => {
    expect(isPrivateUrl(url)).toBe(true);
  });

  it.each([
    'https://api.openai.com/v1',
    'https://openrouter.ai/api/v1',
    'http://172.32.0.1',
  ])('treats %s as public', (url) => {
    expect(isPrivateUrl(url)).toBe(false);
  });
});
