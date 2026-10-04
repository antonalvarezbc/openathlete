import { getFirebaseApp } from 'src/common/firebase/firebase-app';

import { PushNotificationService } from './push-notification.service';

const send = jest.fn();

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ send }),
}));
jest.mock('src/common/firebase/firebase-app', () => ({
  getFirebaseApp: jest.fn(),
}));

const getFirebaseAppMock = getFirebaseApp as jest.MockedFunction<
  typeof getFirebaseApp
>;

function createService(env: Record<string, string> = {}) {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ userId: 7, pushToken: 'device-token' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const config = { get: (key: string) => env[key] };
  const service = new PushNotificationService(prisma as never, config as never);
  return { service, prisma };
}

const params = {
  userId: 7,
  title: 'Tomorrow',
  body: 'Long run',
  data: { eventId: '42' },
};

describe('PushNotificationService', () => {
  beforeEach(() => {
    send.mockReset();
    getFirebaseAppMock.mockReset();
  });

  it('sends through FCM with the service account', async () => {
    getFirebaseAppMock.mockReturnValue({} as never);
    send.mockResolvedValue('message-id');
    const { service } = createService();

    await expect(service.sendPushNotification(params)).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'device-token',
        notification: { title: 'Tomorrow', body: 'Long run' },
        data: { eventId: '42' },
      }),
    );
  });

  it('clears a token FCM reports as unregistered', async () => {
    getFirebaseAppMock.mockReturnValue({} as never);
    send.mockRejectedValue({
      code: 'messaging/registration-token-not-registered',
    });
    const { service, prisma } = createService();

    await expect(service.sendPushNotification(params)).resolves.toBe(false);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { userId: 7, pushToken: 'device-token' },
      data: { pushToken: null },
    });
  });

  it('keeps the token on transient FCM errors', async () => {
    getFirebaseAppMock.mockReturnValue({} as never);
    send.mockRejectedValue({ code: 'messaging/internal-error' });
    const { service, prisma } = createService();

    await expect(service.sendPushNotification(params)).resolves.toBe(false);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('skips sending when Firebase is not configured', async () => {
    getFirebaseAppMock.mockReturnValue(null);
    const { service } = createService();

    await expect(service.sendPushNotification(params)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
