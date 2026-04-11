import {
  Controller,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';
import { CommissionCalculationService } from '../services/commission-calculation.service';
import { CommissionReleaseJob } from '../../../jobs/commission-release.job';
import { ClawbackJob } from '../../../jobs/clawback.job';

@Controller('admin/commission')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
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
