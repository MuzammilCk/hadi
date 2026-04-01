import { Injectable, Logger } from '@nestjs/common';
import { InventoryService } from '../modules/inventory/services/inventory.service';

@Injectable()
export class ReservationExpiryJob {
  private readonly logger = new Logger(ReservationExpiryJob.name);

  constructor(private readonly inventoryService: InventoryService) {}

  async run(): Promise<{ expired: number }> {
    this.logger.log('Starting reservation expiry job...');
    try {
      const result = await this.inventoryService.expireStaleReservations();
      this.logger.log(`Completed reservation expiry job. Expired: ${result.expired}`);
      return result;
    } catch (error) {
      this.logger.error('Failed to run reservation expiry job', error);
      return { expired: 0 };
    }
  }
}
