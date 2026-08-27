import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

export class PayoutRequestNotFoundException extends NotFoundException {
  constructor(id?: string) {
    super(id ? `Payout request ${id} not found` : 'Payout request not found');
  }
}
export class PayoutBatchNotFoundException extends NotFoundException {
  constructor(id?: string) {
    super(id ? `Payout batch ${id} not found` : 'Payout batch not found');
  }
}
export class PendingPayoutAlreadyExistsException extends ConflictException {
  constructor() {
    super('A pending or approved payout request already exists for this user');
  }
}
export class InsufficientBalanceForPayoutException extends BadRequestException {
  constructor(available: number, requested: number) {
    super(
      `Insufficient balance. Available: ${available} INR, Requested: ${requested} INR`,
    );
  }
}
export class BelowMinimumPayoutAmountException extends BadRequestException {
  constructor(minimum: number) {
    super(`Amount is below minimum threshold of ${minimum} INR`);
  }
}
export class PayoutNotApprovableException extends UnprocessableEntityException {
  constructor(status: string) {
    super(`Payout in status '${status}' cannot be approved`);
  }
}
export class PayoutNotRejectableException extends UnprocessableEntityException {
  constructor(status: string) {
    super(`Payout in status '${status}' cannot be rejected`);
  }
}
export class UserNotEligibleForPayoutException extends UnprocessableEntityException {
  constructor(reason: string) {
    super(`User not eligible for payout: ${reason}`);
  }
}
