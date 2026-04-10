import { HttpException, HttpStatus } from '@nestjs/common';

export enum ReferralErrorCode {
  MISSING_CODE = 'MISSING_CODE',
  INVALID_CODE_FORMAT = 'INVALID_CODE_FORMAT',
  CODE_NOT_FOUND = 'CODE_NOT_FOUND',
  CODE_EXPIRED = 'CODE_EXPIRED',
  CODE_DISABLED = 'CODE_DISABLED',
  CODE_EXHAUSTED = 'CODE_EXHAUSTED',
  SELF_REFERRAL = 'SELF_REFERRAL',
  CIRCULAR_SPONSORSHIP = 'CIRCULAR_SPONSORSHIP',
  DUPLICATE_REDEMPTION = 'DUPLICATE_REDEMPTION',
  SUSPICIOUS_REPLAY = 'SUSPICIOUS_REPLAY',
}

export class ReferralValidationException extends HttpException {
  constructor(
    public readonly code: ReferralErrorCode,
    message: string,
  ) {
    super({ code, message }, HttpStatus.BAD_REQUEST);
  }
}
