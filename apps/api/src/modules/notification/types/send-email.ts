import { EmailId, EmailLanguage, EmailPropsFromId } from '@openathlete/shared';

export interface SendEmail<T extends EmailId> {
  type: T;
  to: string;
  params: EmailPropsFromId<T>;
  subject?: string;
  /**
   * Used when the recipient has no account yet (invitations): the language
   * saved on their account wins
   */
  language?: EmailLanguage;
}
