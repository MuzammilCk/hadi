import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Req,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '../../../user/entities/user.entity';
import { ModerationService } from '../services/moderation.service';
import { CreateModerationActionDto } from '../dto/create-moderation-action.dto';
import { ModerationQueryDto } from '../dto/moderation-query.dto';

@Controller('admin/moderation-actions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get()
  async listActions(@Query() query: ModerationQueryDto) {
    return this.moderationService.listModerationActions(query);
  }

  @Post()
  async createAction(@Body() dto: CreateModerationActionDto, @Req() req: any) {
    return this.moderationService.applyModerationAction(req.adminActorId, dto);
  }

  @Post(':id/reverse')
  async reverseAction(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Req() req: any,
  ) {
    return this.moderationService.reverseModerationAction(
      id,
      req.adminActorId,
      body.note,
    );
  }
}
