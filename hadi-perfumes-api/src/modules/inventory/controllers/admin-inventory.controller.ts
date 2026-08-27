import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InventoryService } from '../services/inventory.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';
import { AddStockDto } from '../dto/add-stock.dto';
import { AdjustStockDto } from '../dto/adjust-stock.dto';
import { ReservationExpiryJob } from '../../../jobs/reservation-expiry.job';

@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminInventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly reservationExpiryJob: ReservationExpiryJob,
  ) {}

  @Post(':listingId/stock')
  async addStock(
    @Req() req: any,
    @Param('listingId') listingId: string,
    @Body() dto: AddStockDto,
  ) {
    return this.inventoryService.addStock(listingId, dto, req.adminActorId);
  }

  @Patch(':listingId/stock')
  async adjustStock(
    @Req() req: any,
    @Param('listingId') listingId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustStock(listingId, dto, req.adminActorId);
  }

  @Post('expire-reservations')
  async triggerExpiryJob() {
    return this.reservationExpiryJob.run();
  }
}
