import {
  Controller,
  Post,
  Req,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PaymentService } from '../services/payment.service';
import { CreatePaymentIntentDto } from '../dto/create-payment-intent.dto';
import { WebhookSignatureInvalidException } from '../exceptions/order.exceptions';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('intent')
  @UseGuards(JwtAuthGuard)
  async createIntent(@Req() req: any, @Body() dto: CreatePaymentIntentDto) {
    const { payment, clientSecret } =
      await this.paymentService.createPaymentIntent(
        dto.order_id,
        dto.idempotency_key,
        req.user.sub,
      );
    return {
      clientSecret,
      paymentIntentId: payment.provider_payment_intent_id,
    };
  }

  @Post('capture')
  @UseGuards(JwtAuthGuard)
  async capturePayment(@Req() req: any, @Body('order_id') orderId: string) {
    return this.paymentService.getPayment(orderId);
  }

  // NO auth guard — verified by Stripe signature only
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) throw new WebhookSignatureInvalidException();
    return this.paymentService.handleWebhook(rawBody, signature);
  }
}
