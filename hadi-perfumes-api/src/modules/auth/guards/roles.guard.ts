import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';

// Roles that require live DB verification (high-privilege)
const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN];

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator → allow all authenticated users
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Fix B5: For admin-grade roles, re-verify against DB to catch
    // role revocations that happened after the JWT was issued.
    const requiresAdminRole = requiredRoles.some((r) => ADMIN_ROLES.includes(r));
    if (requiresAdminRole && user.sub) {
      const row = await this.dataSource.query(
        `SELECT role FROM users WHERE id = $1 LIMIT 1`,
        [user.sub],
      );
      const liveRole = row?.[0]?.role;
      if (!liveRole || !requiredRoles.includes(liveRole as UserRole)) {
        throw new ForbiddenException('Role has been revoked');
      }
      // Update request context with live role
      user.role = liveRole;
    }

    if (!requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
