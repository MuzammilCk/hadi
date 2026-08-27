import {
  Controller,
  Post,
  Get,
  Req,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OrderService } from '../services/order.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { OrderListQueryDto } from '../dto/order-list-query.dto';
import { IdempotencyKeyRequiredException } from '../exceptions/order.exceptions';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Req() req: any,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
      throw new IdempotencyKeyRequiredException();
    }
    return this.orderService.createOrder(req.user.sub, dto, idempotencyKey);
  }

  @Get()
  async listOrders(@Req() req: any, @Query() query: OrderListQueryDto) {
    return this.orderService.listOrders(req.user.sub, query);
  }

  @Get(':id')
  async getOrder(@Req() req: any, @Param('id') id: string) {
    return this.orderService.getOrderWithPermissions(id, req.user.sub);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrder(@Req() req: any, @Param('id') id: string) {
    return this.orderService.cancelOrder(id, req.user.sub);
  }
}
