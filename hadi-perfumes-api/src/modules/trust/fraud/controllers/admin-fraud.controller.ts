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
import { FraudSignalService } from '../services/fraud-signal.service';
import { FraudSignalQueryDto } from '../dto/fraud-signal-query.dto';
import { AdminFraudReviewDto } from '../dto/admin-fraud-review.dto';

@Controller('admin/fraud-signals')
@UseGuards(AdminGuard)
export class AdminFraudController {
  constructor(private readonly fraudSignalService: FraudSignalService) {}

  @Get()
  async listSignals(@Query() query: FraudSignalQueryDto) {
    return this.fraudSignalService.listSignals(query);
  }

  @Get(':id')
  async getSignal(@Param('id') id: string) {
    return this.fraudSignalService.getSignal(id);
  }

  @Post(':id/review')
  async reviewSignal(
    @Param('id') id: string,
    @Body() dto: AdminFraudReviewDto,
    @Req() req: any,
  ) {
    return this.fraudSignalService.reviewSignal(
      id,
      req.adminActorId,
      dto.verdict as 'actioned' | 'false_positive',
      dto.note,
    );
  }
}
