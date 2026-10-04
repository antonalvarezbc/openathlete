import axios, { AxiosInstance } from 'axios';
import { Message, getMessaging } from 'firebase-admin/messaging';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiEnvSchemaType } from '@openathlete/shared';

import { getFirebaseApp } from 'src/common/firebase/firebase-app';

import { PrismaService } from '../../prisma/services/prisma.service';

export interface SendPushNotificationParams {
  userId: number;
  title: string;
  body: string;
  data?: Record<string, string>;
}

// FCM error codes meaning the device token will never work again
const STALE_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export function buildPushMessage(
  token: string,
  { title, body, data }: Omit<SendPushNotificationParams, 'userId'>,
): Message {
  return {
    token,
    notification: { title, body },
    data: data
      ? Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, String(value)]),
        )
      : undefined,
    android: { priority: 'high' },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  };
}

/**
 * Sends push notifications through Firebase Cloud Messaging with the API's
 * service account (FIREBASE_SERVICE_ACCOUNT_JSON).
 *
 * FIREBASE_FUNCTIONS_URL (the former sendPushNotification Cloud Function) is
 * only used as a fallback when no service account is configured. That
 * function is unauthenticated and should be decommissioned.
 */
@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly httpClient: AxiosInstance;
  private readonly firebaseFunctionsUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<ApiEnvSchemaType, true>,
  ) {
    this.firebaseFunctionsUrl =
      this.configService.get('FIREBASE_FUNCTIONS_URL') ?? '';

    this.httpClient = axios.create({
      timeout: 10000,
    });
  }

  async sendPushNotification(
    params: SendPushNotificationParams,
  ): Promise<boolean> {
    const { userId } = params;

    try {
      const user = await this.prisma.user.findUnique({
        where: { userId: userId },
        select: { pushToken: true, userId: true },
      });

      if (!user || !user.pushToken) {
        this.logger.debug(
          `User ${userId} does not have a push token registered`,
        );
        return false;
      }

      const app = getFirebaseApp(
        this.configService.get('FIREBASE_SERVICE_ACCOUNT_JSON'),
      );
      if (app) {
        return await this.sendWithFirebase(
          getMessaging(app),
          userId,
          user.pushToken,
          params,
        );
      }

      if (this.firebaseFunctionsUrl) {
        return await this.sendWithCloudFunction(userId, user.pushToken, params);
      }

      this.logger.debug(
        'Firebase is not configured, skipping push notification',
      );
      return false;
    } catch (error) {
      this.logger.error(
        `Failed to send push notification to user ${userId}:`,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  private async sendWithFirebase(
    messaging: ReturnType<typeof getMessaging>,
    userId: number,
    token: string,
    params: SendPushNotificationParams,
  ): Promise<boolean> {
    try {
      await messaging.send(buildPushMessage(token, params));
      return true;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code && STALE_TOKEN_ERROR_CODES.has(code)) {
        // The app was uninstalled or the token rotated: stop targeting it
        await this.prisma.user.updateMany({
          where: { userId, pushToken: token },
          data: { pushToken: null },
        });
        this.logger.log(`Removed stale push token of user ${userId} (${code})`);
        return false;
      }
      throw error;
    }
  }

  private async sendWithCloudFunction(
    userId: number,
    token: string,
    { title, body, data }: SendPushNotificationParams,
  ): Promise<boolean> {
    this.logger.warn(
      'Sending push through FIREBASE_FUNCTIONS_URL; set FIREBASE_SERVICE_ACCOUNT_JSON to send directly',
    );

    const response = await this.httpClient.post(this.firebaseFunctionsUrl, {
      token,
      title,
      body,
      data,
    });

    if (response.data.success) {
      this.logger.log(`Push notification sent successfully to user ${userId}`);
      return true;
    }

    return false;
  }

  async sendPushNotificationToUsers(
    userIds: number[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<number> {
    const results = await Promise.allSettled(
      userIds.map((userId) =>
        this.sendPushNotification({ userId, title, body, data }),
      ),
    );

    const successCount = results.filter(
      (result) => result.status === 'fulfilled' && result.value === true,
    ).length;

    this.logger.log(
      `Sent push notifications to ${successCount}/${userIds.length} users`,
    );

    return successCount;
  }
}
