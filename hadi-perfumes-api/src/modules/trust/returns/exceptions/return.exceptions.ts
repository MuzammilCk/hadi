import { NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';

export class ReturnRequestNotFoundException extends NotFoundException {
  constructor(id?: string) { super(id ? `Return request ${id} not found` : 'Return request not found'); }
}
export class ReturnAlreadyExistsException extends ConflictException {
  constructor() { super('An open or approved return already exists for this order'); }
}
export class ReturnIneligibleException extends UnprocessableEntityException {
  constructor(reason: string) { super(`Return ineligible: ${reason}`); }
}
export class ReturnWindowExpiredException extends UnprocessableEntityException {
  constructor() { super('Return window has expired for this order'); }
}
export class ReturnStatusTransitionException extends UnprocessableEntityException {
  constructor(from: string, to: string) {
    super(`Cannot transition return from '${from}' to '${to}'`);
  }
}
