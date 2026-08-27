import {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InventoryService } from '../services/inventory.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReserveStockDto } from '../dto/reserve-stock.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('reserve')
  async reserveStock(@Req() req: any, @Body() dto: ReserveStockDto) {
    return this.inventoryService.reserveStock(req.user.userId, dto);
  }

  @Post('reserve/:id/confirm')
  async confirmReservation(
    @Req() req: any,
    @Param('id') id: string,
    @Body('orderId') orderId: string,
  ) {
    return this.inventoryService.confirmReservation(
      id,
      orderId,
      req.user.userId,
    );
  }

  @Delete('reserve/:id')
  async releaseReservation(@Req() req: any, @Param('id') id: string) {
    return this.inventoryService.releaseReservation(id, req.user.userId);
  }
}
