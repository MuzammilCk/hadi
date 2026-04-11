import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MediaService } from '../services/media.service';
import { CreateSignedUrlDto } from '../dto/create-signed-url.dto';
import { ConfirmUploadDto } from '../dto/confirm-upload.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';

@Controller('admin/media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTENT_MANAGER)
export class AdminMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('signed-url')
  async getSignedUrl(@Req() req: any, @Body() dto: CreateSignedUrlDto) {
    return this.mediaService.generateSignedUploadUrl(
      req.user.sub,
      dto.filename,
      dto.mime_type,
    );
  }

  @Post('confirm')
  async confirmUpload(@Req() req: any, @Body() dto: ConfirmUploadDto) {
    return this.mediaService.confirmUpload(dto.storage_key, req.user.sub, {
      alt_text: dto.alt_text,
      width: dto.width,
      height: dto.height,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMedia(@Req() req: any, @Param('id') id: string) {
    return this.mediaService.softDelete(id, req.user.sub);
  }
}
