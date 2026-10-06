export type CoachActivityNoticeKind = 'COMMENT' | 'RPE' | 'ACTIVITY';

export class CoachActivityNoticeEvent {
  static readonly SLUG = 'coach.activity.notice';
  constructor(
    public readonly payload: {
      eventId: number;
      kind: CoachActivityNoticeKind;
      deliveryKey: string;
      actorUserId?: number;
      rpe?: number | null;
      // Thread the comment was written in: its participants already saw it
      sourceThreadId?: number;
    },
  ) {}
}
