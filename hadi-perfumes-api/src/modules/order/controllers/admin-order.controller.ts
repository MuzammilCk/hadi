import {
  Controller,
  Get,
  Patch,
  Req,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { OrderService } from '../services/order.service';
import { OrderListQueryDto } from '../dto/order-list-query.dto';
import { AdminUpdateOrderStatusDto } from '../dto/admin-update-order-status.dto';

@Controller('admin/orders')
@UseGuards(AdminGuard)
export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  // STATIC ROUTES BEFORE DYNAMIC :id ROUTES
  @Get()
  async listOrders(@Query() query: OrderListQueryDto) {
    return this.orderService.adminListOrders(query);
  }

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    return this.orderService.adminGetOrder(id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: AdminUpdateOrderStatusDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.orderService.adminUpdateOrderStatus(
      id,
      dto.status,
      req.adminActorId,
      dto.reason,
      ip,
    );
  }
}
