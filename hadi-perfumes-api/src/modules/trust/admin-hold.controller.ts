import { Controller, Post, Param, Req, Body, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { HoldService } from './holds/services/hold.service';

@Controller('admin')
@UseGuards(AdminGuard)
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
    return this.holdService.releaseCommissionHold(id, req.adminActorId, body.note);
  }
}
