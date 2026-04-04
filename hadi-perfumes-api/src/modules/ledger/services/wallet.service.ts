import { Injectable } from '@nestjs/common';
import { LedgerService } from './ledger.service';

@Injectable()
export class WalletService {
  constructor(private readonly ledgerService: LedgerService) {}

  async getWalletSummary(userId: string): Promise<{
    user_id: string;
    pending_balance: number;
    available_balance: number;
    currency: string;
  }> {
    const [pending, available] = await Promise.all([
      this.ledgerService.getPendingBalance(userId),
      this.ledgerService.getAvailableBalance(userId),
    ]);
    return {
      user_id: userId,
      pending_balance: pending,
      available_balance: available,
      currency: process.env.DEFAULT_CURRENCY || 'INR',
    };
  }
}
