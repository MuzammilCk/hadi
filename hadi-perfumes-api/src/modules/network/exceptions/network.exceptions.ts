import { BadRequestException, NotFoundException } from '@nestjs/common';

export class NetworkCycleException extends BadRequestException {
  constructor(userId: string) {
    super(`Cycle detected: userId ${userId} already exists in the proposed upline path`);
  }
}

export class NetworkNodeNotFoundException extends NotFoundException {
  constructor(userId: string) {
    super(`Network node not found for user ${userId}`);
  }
}
