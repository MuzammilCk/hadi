import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommissionModule } from './modules/commission/commission.module';
import { dataSourceOptions } from './config/database.config';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    CommissionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
