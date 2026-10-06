import { providerRedirectUri, providerWebhookUrl } from './provider-urls';

describe('provider URLs', () => {
  it('follow APP_URL when they are not set', () => {
    expect(
      providerRedirectUri(undefined, 'https://oa.example.org/', 'strava'),
    ).toBe('https://oa.example.org/auth/callback/strava');
    expect(providerWebhookUrl('', 'https://oa.example.org', 'polar')).toBe(
      'https://oa.example.org/api/provider/polar/webhook',
    );
  });

  it('keep an explicit value', () => {
    expect(
      providerRedirectUri(
        'https://app.example.org/auth/callback/strava',
        'https://other.example.org',
        'strava',
      ),
    ).toBe('https://app.example.org/auth/callback/strava');
  });

  it('stay empty without APP_URL', () => {
    expect(providerRedirectUri(undefined, undefined, 'garmin')).toBe('');
    expect(providerWebhookUrl(undefined, undefined, 'polar')).toBe('');
  });
});
