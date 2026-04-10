import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  Optional,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    // Phase 8: Optional injection — works even when OpsModule isn't imported
    @Optional()
    @Inject('SecurityEventService')
    private readonly securityEventService?: any,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const adminToken: string | undefined = request.headers['x-admin-token'];
    const secret: string = process.env.ADMIN_TOKEN || '';

    // Fix H5: use timingSafeEqual to prevent timing-based token enumeration.
    // Short-circuit only on missing token or length mismatch (both constant-time safe).
    if (!adminToken || !secret || adminToken.length !== secret.length) {
      // Phase 8: log security event (async-safe, never blocks)
      this.logSecurityEvent(request, 'token_missing_or_length_mismatch');
      throw new UnauthorizedException('Invalid or missing admin token');
    }

    const tokBuf = Buffer.from(adminToken);
    const secBuf = Buffer.from(secret);
    if (!timingSafeEqual(tokBuf, secBuf)) {
      // Phase 8: log security event (async-safe, never blocks)
      this.logSecurityEvent(request, 'token_mismatch');
      throw new UnauthorizedException('Invalid or missing admin token');
    }

    // Set actor context for audit logging
    request.adminActorId =
      process.env.ADMIN_ACTOR_ID || '00000000-0000-0000-0000-000000000000';

    return true;
  }

  private logSecurityEvent(request: any, reason: string): void {
    if (!this.securityEventService) return;
    // Fire-and-forget — DB failure must never prevent guard from throwing
    this.securityEventService
      .record({
        event_type: 'invalid_admin_token',
        severity: 'high',
        ip_address: request.ip || null,
        path: request.path || null,
        method: request.method || null,
        details: { reason },
      })
      .catch(() => {});
  }
}
