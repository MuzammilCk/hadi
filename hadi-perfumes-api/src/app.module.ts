import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommissionModule } from './modules/commission/commission.module';
import { AuthModule } from './modules/auth/auth.module';
import { ReferralModule } from './modules/referral/referral.module';
import { UserModule } from './modules/user/user.module';
import { NetworkModule } from './modules/network/network.module';
import { ListingModule } from './modules/listing/listing.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrderModule } from './modules/order/order.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { PayoutModule } from './modules/payout/payout.module';
import { dataSourceOptions } from './config/database.config';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    ThrottlerModule.forRoot([{
      ttl: parseInt(process.env.THROTTLE_TTL_SECONDS || '60', 10) * 1000,
      limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
    }]),
    CommissionModule,
    AuthModule,
    ReferralModule,
    UserModule,
    NetworkModule,
    ListingModule,
    InventoryModule,
    OrderModule,
    LedgerModule,       // Phase 6 — new
    PayoutModule,       // Phase 6 — new
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
