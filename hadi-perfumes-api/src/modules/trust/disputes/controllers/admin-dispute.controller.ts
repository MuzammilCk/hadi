import { Controller, Post, Get, Patch, Param, Query, Req, Body, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../../admin/guards/admin.guard';
import { DisputeService } from '../services/dispute.service';
import { DisputeQueryDto } from '../dto/dispute-query.dto';
import { AdminDisputeDecisionDto } from '../dto/admin-dispute-decision.dto';

@Controller('admin/disputes')
@UseGuards(AdminGuard)
export class AdminDisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @Get()
  async listDisputes(@Query() query: DisputeQueryDto) {
    return this.disputeService.adminListDisputes(query);
  }

  @Get(':id')
  async getDispute(@Param('id') id: string) {
    return this.disputeService.adminGetDispute(id);
  }

  @Patch(':id/resolve')
  async resolveDispute(
    @Param('id') id: string,
    @Body() dto: AdminDisputeDecisionDto,
    @Req() req: any,
  ) {
    return this.disputeService.resolveDispute(id, req.adminActorId, dto);
  }

  @Post(':id/escalate')
  async escalateDispute(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Req() req: any,
  ) {
    return this.disputeService.escalateDispute(id, req.adminActorId, body.note);
  }

  @Post(':id/close')
  async closeDispute(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Req() req: any,
  ) {
    return this.disputeService.closeDispute(id, req.adminActorId, body.note);
  }
}
