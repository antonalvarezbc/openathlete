import { z } from 'zod';

export const coachActivityAlertSettingsSchema = z
  .object({
    notifyComments: z.boolean(),
    notifyRpe: z.boolean(),
    notifyNewActivities: z.boolean(),
  })
  .strict();
export type CoachActivityAlertSettingsDto = z.infer<
  typeof coachActivityAlertSettingsSchema
>;
export const defaultCoachActivityAlertSettings: CoachActivityAlertSettingsDto =
  {
    notifyComments: true,
    notifyRpe: true,
    // A coach with many athletes would get a message for every synced workout
    notifyNewActivities: false,
  };
export interface ActivityChatNoticeDto {
  kind: string;
  eventId: number | null;
  eventName: string;
  rpe: number | null;
}
