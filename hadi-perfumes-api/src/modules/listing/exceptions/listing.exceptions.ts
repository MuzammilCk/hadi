import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';

export class ListingNotFoundException extends NotFoundException {
  constructor(message: string = 'Listing not found') {
    super(message);
  }
}

export class ListingStateTransitionException extends BadRequestException {
  constructor(message: string = 'Invalid listing state transition') {
    super(message);
  }
}

export class SkuAlreadyExistsException extends ConflictException {
  constructor(message: string = 'Listing with this SKU already exists') {
    super(message);
  }
}

export class CategoryNotFoundException extends NotFoundException {
  constructor(message: string = 'Product category not found') {
    super(message);
  }
}
