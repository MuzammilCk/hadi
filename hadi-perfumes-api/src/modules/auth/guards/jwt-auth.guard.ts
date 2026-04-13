import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid token');
    }

    try {
      const payload = this.jwtService.verify(authHeader.split(' ')[1]);

      // Fix A5: signup_only scoped tokens must NOT access protected resources.
      // These are issued after OTP verification but before signup completion.
      // The sub field contains a phone number (not a user UUID), so allowing
      // these through would cause DB errors or unauthorized access.
      if (payload.scope === 'signup_only') {
        throw new UnauthorizedException(
          'Signup incomplete — this token cannot access protected resources',
        );
      }

      req.user = payload;
      // Backward compat: admin controllers read req.adminActorId for audit/actor context.
      // Previously set by the old AdminGuard; now derived from the JWT subject (actual user UUID).
      req.adminActorId = payload.sub;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
