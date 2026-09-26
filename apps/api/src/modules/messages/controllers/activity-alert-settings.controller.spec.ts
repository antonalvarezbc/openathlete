import { INestApplication } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';

import { CoachActivityNoticeService } from '../services/coach-activity-notice.service';
import { ActivityAlertSettingsController } from './activity-alert-settings.controller';

jest.mock('../services/coach-activity-notice.service', () => ({
  CoachActivityNoticeService: class {},
}));

describe('activity alert settings HTTP validation', () => {
  let app: INestApplication;
  let origin: string;
  let authorized = true;
  const value = {
    notifyComments: true,
    notifyRpe: false,
    notifyNewActivities: true,
  };
  const service = {
    settings: jest.fn().mockResolvedValue(value),
    updateSettings: jest.fn().mockResolvedValue(value),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ActivityAlertSettingsController],
      providers: [{ provide: CoachActivityNoticeService, useValue: service }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => authorized })
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    authorized = true;
    jest.clearAllMocks();
  });
  const send = (body: unknown, id = '5') =>
    fetch(`${origin}/messages/activity-alert-settings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  it('accepts only complete boolean preferences', async () => {
    const r = await send(value);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(value);
  });
  it.each([
    { ...value, coachUserId: 3 },
    { ...value, notifyRpe: 'false' },
    { notifyComments: true },
    { ...value, notifyNewActivities: null },
  ])('rejects invalid payload %j', async (body) => {
    expect((await send(body)).status).toBe(400);
    expect(service.updateSettings).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated reads and writes', async () => {
    authorized = false;
    expect((await send(value)).status).toBe(403);
    expect(
      (await fetch(`${origin}/messages/activity-alert-settings/5`)).status,
    ).toBe(403);
    expect(service.settings).not.toHaveBeenCalled();
  });
  it('rejects malformed athlete IDs', async () => {
    expect((await send(value, 'not-an-id')).status).toBe(400);
  });
});
