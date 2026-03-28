import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommissionModule } from './modules/commission/commission.module';
import { AuthModule } from './modules/auth/auth.module';
import { ReferralModule } from './modules/referral/referral.module';
import { dataSourceOptions } from './config/database.config';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    CommissionModule,
    AuthModule,
    ReferralModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
