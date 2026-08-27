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
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '../../../user/entities/user.entity';
import { FraudSignalService } from '../services/fraud-signal.service';
import { FraudSignalQueryDto } from '../dto/fraud-signal-query.dto';
import { AdminFraudReviewDto } from '../dto/admin-fraud-review.dto';

@Controller('admin/fraud-signals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
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
