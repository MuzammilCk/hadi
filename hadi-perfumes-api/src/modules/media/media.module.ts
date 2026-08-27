import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaAsset } from './entities/media-asset.entity';
import { MediaService } from './services/media.service';
import { AdminMediaController } from './controllers/admin-media.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaAsset]),
    AuthModule,
    AuditModule,
  ],
  providers: [MediaService],
  controllers: [AdminMediaController],
  exports: [MediaService],
})
export class MediaModule {}
