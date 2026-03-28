import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminPolicyService } from '../services/admin-policy.service';
import { CreateCompensationPolicyDto } from '../dto/create-compensation-policy.dto';

// Notice: In real app, apply @UseGuards(RolesGuard) to ensure only admins access this
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
    // In actual implementation, extract actorId from request user (e.g., req.user.id)
    const mockActorId = '00000000-0000-0000-0000-000000000001';
    return this.adminPolicyService.createDraft(dto, mockActorId);
  }

  @Post('drafts/:id/validate')
  async validateDraft(@Param('id') id: string) {
    return this.adminPolicyService.validateDraft(id);
  }

  @Post('drafts/:id/activate')
  async activateDraft(@Param('id') id: string, @Req() req: any) {
    const mockActorId = '00000000-0000-0000-0000-000000000001';
    return this.adminPolicyService.activateDraft(id, mockActorId);
  }

  @Get(':id')
  async getPolicy(@Param('id') id: string) {
    // Basic read placeholder
    return { id, message: 'Fetch specific policy version' };
  }
}
