import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutRequest } from './entities/payout-request.entity';
import { PayoutBatch } from './entities/payout-batch.entity';
import { QualificationState } from '../network/entities/qualification-state.entity';
import { PayoutService } from './services/payout.service';
import { PayoutController } from './controllers/payout.controller';
import { AdminPayoutController } from './controllers/admin-payout.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';

import { PayoutHold } from '../trust/holds/entities/payout-hold.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayoutRequest,
      PayoutBatch,
      QualificationState,
      PayoutHold,
    ]),
    UserModule,    // exports TypeOrmModule → provides User repository
    LedgerModule,  // provides LedgerService and WalletService
    AuthModule,    // provides JwtAuthGuard
  ],
  providers: [PayoutService],
  controllers: [PayoutController, AdminPayoutController],
  exports: [PayoutService, TypeOrmModule],
})
export class PayoutModule {}
