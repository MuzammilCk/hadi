import { NotFoundException, ConflictException } from '@nestjs/common';

export class HoldNotFoundException extends NotFoundException {
  constructor(id?: string) { super(id ? `Hold ${id} not found` : 'Hold not found'); }
}
export class HoldAlreadyActiveException extends ConflictException {
  constructor() { super('A hold with this key is already active'); }
}
export class HoldAlreadyReleasedException extends ConflictException {
  constructor() { super('This hold has already been released'); }
}
