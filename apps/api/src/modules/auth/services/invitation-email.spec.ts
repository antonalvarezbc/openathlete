import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { ApiEnvSchemaType, EmailId } from '@openathlete/shared';

import { SendEmailEvent } from 'src/events';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';
import { FeatureAccessService } from 'src/modules/subscription';

import { AthleteInvitationService } from './athlete-invitation.service';
import { CoachInvitationService } from './coach-invitation.service';

// The inviter, then nobody with the invitee's email
const inviter = {
  userId: 1,
  email: 'inviter@example.com',
  firstName: 'Ana',
  lastName: 'Lopez',
  language: 'ES',
};

function setup() {
  const emitter = { emit: jest.fn() };
  const invitations = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ invitationId: 9 }),
  };
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(inviter)
        .mockResolvedValueOnce(null),
    },
    athleteInvitation: invitations,
    coachInvitation: invitations,
  } as unknown as PrismaService;
  const config = {
    get: (key: string) => (key === 'APP_URL' ? 'http://localhost' : undefined),
  } as unknown as ConfigService<ApiEnvSchemaType, true>;
  const args = [
    prisma,
    config,
    emitter as unknown as EventEmitter2,
    {} as FeatureAccessService,
  ] as const;
  const email = () => {
    const [slug, event] = emitter.emit.mock.calls[0] as [
      string,
      SendEmailEvent<EmailId>,
    ];
    expect(slug).toBe(SendEmailEvent.SLUG);
    return event.payload;
  };
  return {
    athleteInvitations: new AthleteInvitationService(...args),
    coachInvitations: new CoachInvitationService(...args),
    email,
  };
}

describe("invitations to someone without an account use the inviter's language", () => {
  it('from a coach', async () => {
    const { athleteInvitations, email } = setup();
    await athleteInvitations.createInvitation(1, 'new@example.com');
    expect(email()).toMatchObject({
      type: 'athlete-invitation',
      to: 'new@example.com',
      language: 'ES',
    });
  });

  it('from an athlete', async () => {
    const { coachInvitations, email } = setup();
    await coachInvitations.createInvitation(1, 'new@example.com');
    expect(email()).toMatchObject({
      type: 'coach-invitation-new',
      to: 'new@example.com',
      language: 'ES',
    });
  });
});
