import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const adminToken: string | undefined = request.headers['x-admin-token'];
    const secret: string = process.env.ADMIN_TOKEN || '';

    // Fix H5: use timingSafeEqual to prevent timing-based token enumeration.
    // Short-circuit only on missing token or length mismatch (both constant-time safe).
    if (!adminToken || !secret || adminToken.length !== secret.length) {
      throw new UnauthorizedException('Invalid or missing admin token');
    }

    const tokBuf = Buffer.from(adminToken);
    const secBuf = Buffer.from(secret);
    if (!timingSafeEqual(tokBuf, secBuf)) {
      throw new UnauthorizedException('Invalid or missing admin token');
    }

    // Set actor context for audit logging
    request.adminActorId =
      process.env.ADMIN_ACTOR_ID || '00000000-0000-0000-0000-000000000000';

    return true;
  }
}
