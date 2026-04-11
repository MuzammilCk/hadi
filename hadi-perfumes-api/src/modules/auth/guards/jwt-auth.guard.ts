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
      req.user = payload;
      // Backward compat: admin controllers read req.adminActorId for audit/actor context.
      // Previously set by the old AdminGuard; now derived from the JWT subject (actual user UUID).
      req.adminActorId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
