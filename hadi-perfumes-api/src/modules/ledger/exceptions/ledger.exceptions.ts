import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';

export class LedgerEntryWriteException extends UnprocessableEntityException {
  constructor(reason: string) { super(`Ledger write failed: ${reason}`); }
}
export class InsufficientBalanceException extends BadRequestException {
  constructor(available: number, requested: number) {
    super(`Insufficient balance: ${available} INR available, ${requested} INR requested`);
  }
}
