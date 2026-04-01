import { BadRequestException, NotFoundException } from '@nestjs/common';

export class InsufficientStockException extends BadRequestException {
  constructor(message: string = 'Insufficient stock available') {
    super(message);
  }
}

export class ReservationNotFoundException extends NotFoundException {
  constructor(message: string = 'Inventory reservation not found') {
    super(message);
  }
}

export class ReservationAlreadyConfirmedException extends BadRequestException {
  constructor(message: string = 'Reservation has already been confirmed') {
    super(message);
  }
}

export class InventoryItemNotFoundException extends NotFoundException {
  constructor(message: string = 'Inventory item not found') {
    super(message);
  }
}
