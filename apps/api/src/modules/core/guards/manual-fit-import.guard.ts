import { CanActivate, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { assertManualFitImportEnabled } from '../helpers/installation-features';

/** Reject disabled uploads before the multipart interceptor reads the file. */
@Injectable()
export class ManualFitImportGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    assertManualFitImportEnabled(this.config);
    return true;
  }
}
