import { Controller, Post, Get, Param, Query, Req, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { DisputeService } from '../services/dispute.service';
import { CreateDisputeDto } from '../dto/create-dispute.dto';
import { DisputeQueryDto } from '../dto/dispute-query.dto';
import { SubmitEvidenceDto } from '../dto/submit-evidence.dto';

@Controller('disputes')
@UseGuards(JwtAuthGuard)
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @Post()
  async openDispute(@Req() req: any, @Body() dto: CreateDisputeDto) {
    return this.disputeService.openDispute(req.user.sub, dto, dto.idempotency_key);
  }

  @Get('my')
  async listMyDisputes(@Req() req: any, @Query() query: DisputeQueryDto) {
    return this.disputeService.listMyDisputes(req.user.sub, query);
  }

  @Get(':id')
  async getDispute(@Req() req: any, @Param('id') id: string) {
    return this.disputeService.getDispute(id, req.user.sub);
  }

  @Post(':id/evidence')
  async submitEvidence(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SubmitEvidenceDto,
  ) {
    return this.disputeService.submitEvidence(id, req.user.sub, dto);
  }
}
