import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HomepageSection } from '../entities/homepage-section.entity';
import { UpsertSectionDto } from '../dto/upsert-section.dto';
import { MediaService } from '../../media/services/media.service';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class HomepageService {
  private readonly logger = new Logger(HomepageService.name);

  constructor(
    @InjectRepository(HomepageSection)
    private readonly sectionRepo: Repository<HomepageSection>,
    private readonly mediaService: MediaService,
    private readonly auditService: AuditService,
  ) {}

  async getPublicSections(): Promise<any[]> {
    const sections = await this.sectionRepo.find({
      where: { is_active: true },
      order: { sort_order: 'ASC' },
    });

    return Promise.all(
      sections.map(async (s) => ({
        section_key: s.section_key,
        content: s.content,
        media_urls: await this.mediaService.resolveMediaUrls(
          s.media_ids ?? [],
        ),
        sort_order: s.sort_order,
        updated_at: s.updated_at,
      })),
    );
  }

  async getAllSections(): Promise<HomepageSection[]> {
    return this.sectionRepo.find({ order: { sort_order: 'ASC' } });
  }

  async upsertSection(
    sectionKey: string,
    dto: UpsertSectionDto,
    userId: string,
  ): Promise<HomepageSection> {
    let existing = await this.sectionRepo.findOne({
      where: { section_key: sectionKey },
    });

    const beforeSnapshot = existing ? { ...existing } : null;

    if (existing) {
      existing.content = dto.content;
      existing.media_ids = dto.media_ids ?? existing.media_ids;
      existing.is_active = dto.is_active ?? existing.is_active;
      existing.sort_order = dto.sort_order ?? existing.sort_order;
      existing.updated_by = userId;
    } else {
      existing = this.sectionRepo.create({
        section_key: sectionKey,
        content: dto.content,
        media_ids: dto.media_ids ?? null,
        is_active: dto.is_active ?? true,
        sort_order: dto.sort_order ?? 0,
        updated_by: userId,
      });
    }

    const saved = await this.sectionRepo.save(existing);

    await this.auditService.log({
      actor_id: userId,
      action: beforeSnapshot ? 'HOMEPAGE_SECTION_UPDATED' : 'HOMEPAGE_SECTION_CREATED',
      entity_type: 'homepage_section',
      entity_id: saved.id,
      before_snapshot: beforeSnapshot,
      after_snapshot: { content: saved.content, is_active: saved.is_active },
    });

    return saved;
  }
}
