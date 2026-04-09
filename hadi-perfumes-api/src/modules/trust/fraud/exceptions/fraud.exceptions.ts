import { NotFoundException, ConflictException } from '@nestjs/common';

export class FraudSignalNotFoundException extends NotFoundException {
  constructor(id?: string) { super(id ? `Fraud signal ${id} not found` : 'Fraud signal not found'); }
}
export class FraudSignalAlreadyExistsException extends ConflictException {
  constructor() { super('A fraud signal with this idempotency key already exists'); }
}
