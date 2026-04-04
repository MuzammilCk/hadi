import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { LedgerService } from './services/ledger.service';
import { WalletService } from './services/wallet.service';
import { WalletController } from './controllers/wallet.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LedgerEntry]),
    AuthModule,
  ],
  providers: [LedgerService, WalletService],
  controllers: [WalletController],
  exports: [LedgerService, WalletService, TypeOrmModule],
})
export class LedgerModule {}
