import { Controller, Post, Param, Req, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { HoldService } from './holds/services/hold.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminHoldController {
  constructor(private readonly holdService: HoldService) {}

  @Post('payout-holds/:id/release')
  async releasePayoutHold(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Req() req: any,
  ) {
    return this.holdService.releasePayoutHold(id, req.adminActorId, body.note);
  }

  @Post('commission-holds/:id/release')
  async releaseCommissionHold(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Req() req: any,
  ) {
    return this.holdService.releaseCommissionHold(
      id,
      req.adminActorId,
      body.note,
    );
  }
}
