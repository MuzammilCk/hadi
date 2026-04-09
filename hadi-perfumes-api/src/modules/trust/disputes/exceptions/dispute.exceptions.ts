import { NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';

export class DisputeNotFoundException extends NotFoundException {
  constructor(id?: string) { super(id ? `Dispute ${id} not found` : 'Dispute not found'); }
}
export class DisputeAlreadyExistsException extends ConflictException {
  constructor() { super('An open or under_review dispute already exists for this order'); }
}
export class DisputeNotResolvableException extends UnprocessableEntityException {
  constructor(status: string) { super(`Dispute in status '${status}' cannot be resolved`); }
}
export class DisputeAlreadyClosedException extends UnprocessableEntityException {
  constructor() { super('Dispute is already closed'); }
}
export class DisputeStatusTransitionException extends UnprocessableEntityException {
  constructor(from: string, to: string) {
    super(`Cannot transition dispute from '${from}' to '${to}'`);
  }
}
