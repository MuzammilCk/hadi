import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

export class OrderNotFoundException extends NotFoundException {
  constructor(id?: string) {
    super(id ? `Order ${id} not found` : 'Order not found');
  }
}

export class InvalidOrderTransitionException extends UnprocessableEntityException {
  constructor(from: string, to: string) {
    super(`Cannot transition order from '${from}' to '${to}'`);
  }
}

export class OrderAlreadyPaidException extends ConflictException {
  constructor() {
    super('Order is already paid');
  }
}

export class OrderNotCancellableException extends UnprocessableEntityException {
  constructor(status: string) {
    super(`Order in status '${status}' cannot be cancelled`);
  }
}

export class PaymentAlreadyExistsException extends ConflictException {
  constructor() {
    super('A payment already exists for this order');
  }
}

export class WebhookSignatureInvalidException extends UnauthorizedException {
  constructor() {
    super('Webhook signature verification failed');
  }
}

export class DuplicateWebhookEventException extends ConflictException {
  constructor(eventId: string) {
    super(`Webhook event '${eventId}' already processed`);
  }
}

export class InsufficientInventoryForOrderException extends BadRequestException {
  constructor(listingId: string) {
    super(`Insufficient stock for listing ${listingId}`);
  }
}

export class CheckoutSessionExpiredException extends BadRequestException {
  constructor() {
    super('Checkout session has expired');
  }
}

export class IdempotencyKeyRequiredException extends BadRequestException {
  constructor() {
    super('Idempotency-Key header is required and must be a valid UUID');
  }
}
