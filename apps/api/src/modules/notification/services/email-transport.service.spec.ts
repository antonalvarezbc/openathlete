import { ConfigService } from '@nestjs/config';

import { EmailTransportService } from './email-transport.service';

function createService(env: Record<string, string | undefined>) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new EmailTransportService(config as never);
}

const email = { to: 'athlete@example.com', subject: 'Hi', html: '<p>Hi</p>' };

describe('EmailTransportService', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('is disabled and sends nothing without an API key', async () => {
    const service = createService({});

    expect(service.isEnabled()).toBe(false);
    await expect(service.send(email)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the email to Brevo', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));
    const service = createService({
      BREVO_API_KEY: 'key',
      BREVO_FROM_EMAIL: 'team@example.com',
    });

    await expect(
      service.send({ ...email, senderName: 'OpenAthlete' }),
    ).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers).toMatchObject({ 'api-key': 'key' });
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { email: 'team@example.com', name: 'OpenAthlete' },
      to: [{ email: 'athlete@example.com' }],
      subject: 'Hi',
      htmlContent: '<p>Hi</p>',
    });
  });

  it('falls back to the default sender address', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));
    await createService({ BREVO_API_KEY: 'key' }).send(email);

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.sender.email).toBe('noreply@openathlete.org');
  });

  it('throws when Brevo rejects the request', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"message":"unauthorized"}', { status: 401 }),
    );

    await expect(
      createService({ BREVO_API_KEY: 'bad' }).send(email),
    ).rejects.toThrow('HTTP 401');
  });
});
