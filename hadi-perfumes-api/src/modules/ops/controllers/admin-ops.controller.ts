import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { OpsService } from '../services/ops.service';
import {
  JobRunQueryDto,
  DeadLetterQueryDto,
  SecurityEventQueryDto,
  AuditLogQueryDto,
} from '../dto/ops-query.dto';

@Controller('admin/ops')
@UseGuards(AdminGuard)
export class AdminOpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('job-runs')
  listJobRuns(@Query() query: JobRunQueryDto) {
    return this.opsService.listJobRuns(query);
  }

  @Get('job-runs/:id')
  getJobRun(@Param('id') id: string) {
    return this.opsService.getJobRun(id);
  }

  @Get('dead-letter')
  listDeadLetter(@Query() query: DeadLetterQueryDto) {
    return this.opsService.listDeadLetterEvents(query);
  }

  @Post('dead-letter/:id/replay')
  async replayDeadLetter(@Param('id') id: string, @Req() req: any) {
    return this.opsService.replayDeadLetterEvent(id, req.adminActorId);
  }

  @Get('security-events')
  listSecurityEvents(@Query() query: SecurityEventQueryDto) {
    return this.opsService.listSecurityEvents(query);
  }

  @Get('audit-logs')
  listAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.opsService.listAuditLogs(query);
  }

  @Get('system-health')
  systemHealth() {
    return this.opsService.getSystemHealthSummary();
  }
}
