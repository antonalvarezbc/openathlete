import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AccessTokensService } from './access-tokens.service';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

/**
 * Authenticates data tool requests with a personal access token
 * (Authorization: Bearer oat_...) and limits each token to 60 requests a minute.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { start: number; count: number }
  >();

  constructor(private readonly tokens: AccessTokensService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const user = token ? await this.tokens.authenticate(token) : null;
    if (!user)
      throw new UnauthorizedException('Invalid or expired access token');

    const now = Date.now();
    const window = this.windows.get(token);
    if (!window || now - window.start > WINDOW_MS)
      this.windows.set(token, { start: now, count: 1 });
    else if (++window.count > MAX_REQUESTS_PER_WINDOW)
      throw new HttpException(
        'Too many requests for this token, wait a minute',
        HttpStatus.TOO_MANY_REQUESTS,
      );

    request.user = user;
    return true;
  }
}
