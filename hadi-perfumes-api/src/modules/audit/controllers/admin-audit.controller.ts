import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from '../services/audit.service';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findLogs(@Query() query: AuditLogQueryDto) {
    return this.auditService.findLogs(query);
  }
}
