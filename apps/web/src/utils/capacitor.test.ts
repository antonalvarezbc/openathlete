import { afterEach, describe, expect, it, vi } from 'vitest';

import { getApiBaseUrl } from './capacitor';

function withMetaUrl(content: string | null) {
  vi.stubGlobal('document', {
    querySelector: () =>
      content === null ? null : { getAttribute: () => content },
  });
}

describe('getApiBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('prefers the URL injected into index.html at container start', () => {
    withMetaUrl('https://api.example.org');
    vi.stubEnv('VITE_API_BASE_URL', '__OPENATHLETE_API_BASE_URL__');

    expect(getApiBaseUrl()).toBe('https://api.example.org');
  });

  it('falls back to the build-time URL when nothing was injected', () => {
    withMetaUrl('%VITE_API_BASE_URL%');
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.openathlete.org');

    expect(getApiBaseUrl()).toBe('https://api.openathlete.org');
  });

  it('never returns the Docker placeholder', () => {
    withMetaUrl('__OPENATHLETE_API_BASE_URL__');
    vi.stubEnv('VITE_API_BASE_URL', '__OPENATHLETE_API_BASE_URL__');

    expect(getApiBaseUrl()).toBe('http://localhost:3000');
  });
});
