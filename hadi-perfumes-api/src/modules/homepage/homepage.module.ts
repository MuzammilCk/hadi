import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomepageSection } from './entities/homepage-section.entity';
import { HomepageService } from './services/homepage.service';
import { PublicHomepageController } from './controllers/public-homepage.controller';
import { AdminHomepageController } from './controllers/admin-homepage.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([HomepageSection]),
    AuthModule,
    AuditModule,
    MediaModule,
  ],
  providers: [HomepageService],
  controllers: [PublicHomepageController, AdminHomepageController],
  exports: [HomepageService],
})
export class HomepageModule {}
