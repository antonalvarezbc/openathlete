import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiEnvSchemaType } from '@openathlete/shared';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_FROM_EMAIL = 'noreply@openathlete.org';
const REQUEST_TIMEOUT_MS = 10_000;

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  senderName?: string;
}

/**
 * Sends transactional emails through the Brevo HTTP API.
 *
 * Email is optional: without BREVO_API_KEY (typical for self-hosted
 * instances) sending is disabled and `send` resolves to false.
 */
@Injectable()
export class EmailTransportService {
  private readonly logger = new Logger(EmailTransportService.name);
  private readonly apiKey: string | undefined;
  private readonly fromEmail: string;

  constructor(configService: ConfigService<ApiEnvSchemaType, true>) {
    this.apiKey = configService.get('BREVO_API_KEY') || undefined;
    this.fromEmail =
      configService.get('BREVO_FROM_EMAIL') || DEFAULT_FROM_EMAIL;

    if (!this.apiKey) {
      this.logger.warn('BREVO_API_KEY is not set, emails are disabled');
    }
  }

  isEnabled(): boolean {
    return this.apiKey !== undefined;
  }

  /**
   * @returns true when the email was accepted, false when email is disabled.
   * @throws when the provider rejects the request.
   */
  async send(email: OutgoingEmail): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    const response = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: this.fromEmail, name: email.senderName },
        to: [{ email: email.to }],
        subject: email.subject,
        htmlContent: email.html,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Brevo rejected the email (HTTP ${response.status}): ${body.slice(0, 200)}`,
      );
    }

    return true;
  }
}
