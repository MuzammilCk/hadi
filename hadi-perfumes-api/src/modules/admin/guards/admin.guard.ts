import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean {
    const request = context.switchToHttp().getRequest();
    const adminToken = request.headers['x-admin-token'];

    if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
      throw new UnauthorizedException('Invalid or missing admin token');
    }

    // Set actor context for audit logging (ERROR-4 fix)
    request.adminActorId =
      process.env.ADMIN_ACTOR_ID || '00000000-0000-0000-0000-000000000000';

    return true;
  }
}
