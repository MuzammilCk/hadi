import { BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';

export class CommissionAlreadyCalculatedException extends ConflictException {
  constructor(idempotencyKey: string) {
    super(`Commission already calculated for key '${idempotencyKey}'`);
  }
}
export class NoActivePolicyException extends UnprocessableEntityException {
  constructor() { super('No active compensation policy version found'); }
}
export class BeneficiaryNotQualifiedException extends UnprocessableEntityException {
  constructor(userId: string) { super(`User ${userId} is not qualified to receive commission`); }
}
export class SelfPurchaseCommissionException extends BadRequestException {
  constructor() { super('Commission cannot be paid to the order buyer'); }
}
