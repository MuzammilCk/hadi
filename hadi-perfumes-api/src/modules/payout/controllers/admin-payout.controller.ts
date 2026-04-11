import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';
import { PayoutService } from '../services/payout.service';
import { RejectPayoutDto } from '../dto/reject-payout.dto';
import { PayoutQueryDto } from '../dto/payout-query.dto';

@Controller('admin/payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  // STATIC ROUTES FIRST
  @Get()
  async listPayouts(@Query() query: PayoutQueryDto) {
    return this.payoutService.adminListPayouts(query);
  }

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  async executeBatch(@Req() req: any) {
    return this.payoutService.executeBatch(req.adminActorId);
  }

  @Get('batches')
  async listBatches(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.payoutService.listBatches({
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '20', 10),
    });
  }

  // DYNAMIC :id ROUTES LAST
  @Get(':id')
  async getPayoutRequest(@Param('id') id: string) {
    return this.payoutService.getPayoutRequest(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(@Req() req: any, @Param('id') id: string) {
    return this.payoutService.approvePayoutRequest(id, req.adminActorId);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RejectPayoutDto,
  ) {
    return this.payoutService.rejectPayoutRequest(
      id,
      req.adminActorId,
      dto.reason,
    );
  }
}
