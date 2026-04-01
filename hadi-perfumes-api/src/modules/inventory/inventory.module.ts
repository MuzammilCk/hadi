import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryItem } from './entities/inventory-item.entity';
import { InventoryReservation } from './entities/inventory-reservation.entity';
import { InventoryEvent } from './entities/inventory-event.entity';
import { InventoryService } from './services/inventory.service';
import { InventoryController } from './controllers/inventory.controller';
import { AdminInventoryController } from './controllers/admin-inventory.controller';
import { ReservationExpiryJob } from '../../jobs/reservation-expiry.job';
import { ListingModule } from '../listing/listing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryItem,
      InventoryReservation,
      InventoryEvent,
    ]),
    ListingModule,
  ],
  providers: [InventoryService, ReservationExpiryJob],
  controllers: [InventoryController, AdminInventoryController],
  exports: [InventoryService, ReservationExpiryJob],
})
export class InventoryModule {}
