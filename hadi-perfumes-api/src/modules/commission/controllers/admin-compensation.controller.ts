import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminPolicyService } from '../services/admin-policy.service';
import { CreateCompensationPolicyDto } from '../dto/create-compensation-policy.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/compensation-policy')
export class AdminCompensationController {
  constructor(private readonly adminPolicyService: AdminPolicyService) {}

  @Get('current')
  async getCurrent() {
    return this.adminPolicyService.getCurrentActivePolicy();
  }

  @Post('drafts')
  @UsePipes(new ValidationPipe({ transform: true }))
  async createDraft(@Body() dto: CreateCompensationPolicyDto, @Req() req: any) {
    const actorId = req.adminActorId || '00000000-0000-0000-0000-000000000000';
    return this.adminPolicyService.createDraft(dto, actorId);
  }

  @Post('drafts/:id/validate')
  async validateDraft(@Param('id') id: string) {
    return this.adminPolicyService.validateDraft(id);
  }

  @Post('drafts/:id/activate')
  async activateDraft(@Param('id') id: string, @Req() req: any) {
    const actorId = req.adminActorId || '00000000-0000-0000-0000-000000000000';
    return this.adminPolicyService.activateDraft(id, actorId);
  }

  @Get(':id')
  async getPolicy(@Param('id') id: string) {
    // Basic read placeholder
    return { id, message: 'Fetch specific policy version' };
  }
}
