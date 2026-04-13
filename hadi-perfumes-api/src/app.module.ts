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
import { TrustModule } from './modules/trust/trust.module';
import { OpsModule } from './modules/ops/ops.module';
import { AuditModule } from './modules/audit/audit.module';
import { MediaModule } from './modules/media/media.module';
import { HomepageModule } from './modules/homepage/homepage.module';
import { CartModule } from './modules/cart/cart.module';
import { dataSourceOptions } from './config/database.config';

// Phase 8: QueueModule requires Redis — only load outside test environment
const conditionalImports =
  process.env.NODE_ENV !== 'test'
    ? [require('./queue/queue.module').QueueModule]
    : [];

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL_SECONDS || '60', 10) * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
      },
    ]),
    CommissionModule,
    AuthModule,
    ReferralModule,
    UserModule,
    NetworkModule,
    ListingModule,
    InventoryModule,
    OrderModule,
    LedgerModule, // Phase 6 — new
    PayoutModule, // Phase 6 — new
    TrustModule, // Phase 7 — new
    OpsModule, // Phase 8 — new
    AuditModule, // Phase 9 — new
    MediaModule, // Phase 9 — new
    HomepageModule, // Phase 9 — new
    CartModule, // Phase 10 — server-side cart
    ...conditionalImports, // Phase 8 — QueueModule (requires Redis)
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

