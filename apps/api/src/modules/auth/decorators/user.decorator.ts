import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { Athlete, CoachAthlete, User } from '@openathlete/database';

export type AuthUser = Pick<User, 'userId' | 'email'> & {
  roles?: User['roles'];
  athlete: Pick<Athlete, 'athleteId'> | null;
  coachAthletes?: Array<Pick<CoachAthlete, 'athleteId'>>;
};

export const JwtUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
