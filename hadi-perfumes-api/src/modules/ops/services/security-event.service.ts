import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SecurityEvent } from '../entities/security-event.entity';

@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);

  constructor(
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepo: Repository<SecurityEvent>,
  ) {}

  /**
   * Record a security event. Async-safe — never blocks the caller.
   * DB failure is caught and logged, never propagated.
   */
  async record(event: {
    event_type: string;
    severity?: string;
    ip_address?: string | null;
    user_id?: string | null;
    path?: string | null;
    method?: string | null;
    details?: Record<string, any> | null;
  }): Promise<void> {
    try {
      await this.securityEventRepo.save(
        this.securityEventRepo.create({
          event_type: event.event_type,
          severity: event.severity || 'medium',
          ip_address: event.ip_address || null,
          user_id: event.user_id || null,
          path: event.path || null,
          method: event.method || null,
          details: event.details || null,
        }),
      );
    } catch (err) {
      // Never block the guard — log and swallow
      this.logger.error('Failed to write security event:', err);
    }
  }
}
