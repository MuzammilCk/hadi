import { NotFoundException, ConflictException } from '@nestjs/common';

export class ModerationActionNotFoundException extends NotFoundException {
  constructor(id?: string) {
    super(
      id ? `Moderation action ${id} not found` : 'Moderation action not found',
    );
  }
}
export class ModerationActionAlreadyReversedException extends ConflictException {
  constructor() {
    super('This moderation action has already been reversed');
  }
}
