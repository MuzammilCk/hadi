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
import { AdminGuard } from '../../../admin/guards/admin.guard';
import { ReturnService } from '../services/return.service';
import { ReturnQueryDto } from '../dto/return-query.dto';
import { AdminReturnDecisionDto } from '../dto/admin-return-decision.dto';

@Controller('admin/returns')
@UseGuards(AdminGuard)
export class AdminReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @Get()
  async listReturns(@Query() query: ReturnQueryDto) {
    return this.returnService.adminListReturns(query);
  }

  @Get(':id')
  async getReturn(@Param('id') id: string) {
    return this.returnService.adminGetReturn(id);
  }

  @Post(':id/approve')
  async approveReturn(
    @Param('id') id: string,
    @Body() dto: AdminReturnDecisionDto,
    @Req() req: any,
  ) {
    return this.returnService.approveReturn(id, req.adminActorId, dto.note);
  }

  @Post(':id/reject')
  async rejectReturn(
    @Param('id') id: string,
    @Body() dto: AdminReturnDecisionDto,
    @Req() req: any,
  ) {
    return this.returnService.rejectReturn(id, req.adminActorId, dto.note);
  }

  @Post(':id/complete')
  async completeReturn(
    @Param('id') id: string,
    @Body() dto: AdminReturnDecisionDto,
    @Req() req: any,
  ) {
    return this.returnService.completeReturn(id, req.adminActorId, dto.note);
  }
}
