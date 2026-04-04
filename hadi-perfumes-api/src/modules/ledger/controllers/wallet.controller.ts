import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WalletService } from '../services/wallet.service';
import { LedgerService } from '../services/ledger.service';
import { LedgerQueryDto } from '../dto/ledger-query.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly ledgerService: LedgerService,
  ) {}

  @Get('wallet/balance')
  async getBalance(@Req() req: any) {
    return this.walletService.getWalletSummary(req.user.sub);
  }

  @Get('wallet/ledger')
  async getLedger(@Req() req: any, @Query() query: LedgerQueryDto) {
    return this.ledgerService.getLedgerHistory(req.user.sub, {
      page: query.page || 1,
      limit: query.limit || 20,
      entry_type: query.entry_type,
      status: query.status,
    });
  }
}
