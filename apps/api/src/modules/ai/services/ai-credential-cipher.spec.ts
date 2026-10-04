import { AiCredentialCipher, apiKeyHint } from './ai-credential-cipher';

const SECRET = 'pepper-at-least-32-characters-long-xxxxx';

describe('AiCredentialCipher', () => {
  const cipher = new AiCredentialCipher(SECRET);

  it('round-trips keys', () => {
    const encrypted = cipher.encrypt('sk-live-1234567890');

    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(encrypted).not.toContain('sk-live');
    expect(cipher.decrypt(encrypted)).toBe('sk-live-1234567890');
  });

  it('round-trips the empty key of keyless local endpoints', () => {
    expect(cipher.decrypt(cipher.encrypt(''))).toBe('');
  });

  it('uses a fresh IV for every encryption', () => {
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('rejects tampered values', () => {
    const [version, iv, tag, data] = cipher.encrypt('sk-secret').split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 1;

    expect(() =>
      cipher.decrypt([version, iv, tag, flipped.toString('base64')].join(':')),
    ).toThrow();
  });

  it('cannot decrypt with another secret', () => {
    const other = new AiCredentialCipher('another-pepper-at-least-32-chars-xx');

    expect(() => other.decrypt(cipher.encrypt('sk-secret'))).toThrow();
  });

  it('rejects unknown formats', () => {
    expect(() => cipher.decrypt('plain-text-key')).toThrow(
      'Unsupported encrypted value',
    );
  });
});

describe('apiKeyHint', () => {
  it('keeps only the last 4 characters of long keys', () => {
    expect(apiKeyHint('sk-proj-abcdefghijkl')).toBe('••••ijkl');
  });

  it('reveals nothing of short or missing keys', () => {
    expect(apiKeyHint('short')).toBe('••••');
    expect(apiKeyHint('')).toBe('');
  });
});
