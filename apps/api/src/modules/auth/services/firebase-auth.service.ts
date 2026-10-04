import { getAuth } from 'firebase-admin/auth';

import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiEnvSchemaType } from '@openathlete/shared';

import { getFirebaseApp } from 'src/common/firebase/firebase-app';

export type VerifiedFirebaseIdToken = {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
};

@Injectable()
export class FirebaseAuthService {
  constructor(
    private readonly configService: ConfigService<ApiEnvSchemaType, true>,
  ) {}

  private getFirebaseAuth() {
    let app;
    try {
      app = getFirebaseApp(
        this.configService.get('FIREBASE_SERVICE_ACCOUNT_JSON'),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : String(error),
      );
    }

    if (!app) {
      throw new InternalServerErrorException(
        'Firebase Auth is not configured (missing FIREBASE_SERVICE_ACCOUNT_JSON)',
      );
    }

    return getAuth(app);
  }

  async verifyIdToken(idToken: string): Promise<VerifiedFirebaseIdToken> {
    const auth = this.getFirebaseAuth();

    let decoded: {
      uid: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    try {
      decoded = (await auth.verifyIdToken(idToken)) as typeof decoded;
    } catch {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }

    if (!decoded.email) {
      throw new UnauthorizedException('Firebase token has no email');
    }
    if (decoded.email_verified === false) {
      throw new UnauthorizedException('Email is not verified');
    }

    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
    };
  }
}
