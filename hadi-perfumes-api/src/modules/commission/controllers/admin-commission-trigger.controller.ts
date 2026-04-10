import {
  Controller,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { CommissionCalculationService } from '../services/commission-calculation.service';
import { CommissionReleaseJob } from '../../../jobs/commission-release.job';
import { ClawbackJob } from '../../../jobs/clawback.job';

@Controller('admin/commission')
@UseGuards(AdminGuard)
export class AdminCommissionTriggerController {
  constructor(
    private readonly commissionCalcService: CommissionCalculationService,
    private readonly commissionReleaseJob: CommissionReleaseJob,
    private readonly clawbackJob: ClawbackJob,
  ) {}

  @Post('process-outbox')
  @HttpCode(HttpStatus.OK)
  async processOutbox() {
    return this.commissionCalcService.processUnpublishedEvents();
  }

  @Post('release')
  @HttpCode(HttpStatus.OK)
  async release() {
    return this.commissionReleaseJob.run();
  }

  @Post('clawback/:orderId')
  @HttpCode(HttpStatus.OK)
  async executeClawback(@Param('orderId') orderId: string) {
    return this.clawbackJob.clawbackForOrder(orderId);
  }
}
