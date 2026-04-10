import {
  Controller,
  Post,
  Get,
  Req,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PayoutService } from '../services/payout.service';
import { CreatePayoutRequestDto } from '../dto/create-payout-request.dto';
import { PayoutQueryDto } from '../dto/payout-query.dto';
import { IdempotencyKeyRequiredException } from '../../order/exceptions/order.exceptions';

@Controller()
@UseGuards(JwtAuthGuard)
export class PayoutController {
  constructor(private readonly payoutService: PayoutService) {}

  @Post('wallet/payout-request')
  @HttpCode(HttpStatus.CREATED)
  async createPayoutRequest(
    @Req() req: any,
    @Body() dto: CreatePayoutRequestDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
      throw new IdempotencyKeyRequiredException();
    }
    return this.payoutService.createPayoutRequest(
      req.user.sub,
      dto,
      idempotencyKey,
    );
  }

  @Get('wallet/payout-requests')
  async listPayoutRequests(@Req() req: any, @Query() query: PayoutQueryDto) {
    return this.payoutService.listUserPayouts(req.user.sub, query);
  }
}
