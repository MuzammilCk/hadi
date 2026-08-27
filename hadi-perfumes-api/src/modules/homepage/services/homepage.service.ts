import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { HomepageSection } from '../entities/homepage-section.entity';
import { UpsertSectionDto } from '../dto/upsert-section.dto';
import { MediaService } from '../../media/services/media.service';
import { AuditService } from '../../audit/services/audit.service';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class HomepageService {
  private readonly logger = new Logger(HomepageService.name);

  constructor(
    @InjectRepository(HomepageSection)
    private readonly sectionRepo: Repository<HomepageSection>,
    private readonly mediaService: MediaService,
    private readonly auditService: AuditService,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async getPublicSections(): Promise<any[]> {
    const sections = await this.sectionRepo.find({
      where: { is_active: true },
      order: { sort_order: 'ASC' },
    });

    return Promise.all(
      sections.map(async (s) => {
        let content = s.content;

        // Resolve featured_collection listing IDs to full product objects
        if (s.section_key === 'featured_collection' && content?.items) {
          content = await this.resolveFeaturedCollectionItems(content);
        }

        return {
          section_key: s.section_key,
          content,
          media_urls: await this.mediaService.resolveMediaUrls(
            s.media_ids ?? [],
          ),
          sort_order: s.sort_order,
          updated_at: s.updated_at,
        };
      }),
    );
  }

  /**
   * Resolves featured collection listing IDs to full product objects.
   * Uses a single IN query to avoid N+1. Filters out inactive/deleted listings.
   */
  private async resolveFeaturedCollectionItems(
    content: Record<string, any>,
  ): Promise<Record<string, any>> {
    const items: any[] = content.items || [];

    // If items already have full data (legacy format), pass through
    if (items.length > 0 && items[0].name && !items[0].listing_id) {
      return content;
    }

    const listingIds = items
      .map((item: any) => item.listing_id)
      .filter(Boolean);

    if (listingIds.length === 0) {
      return { ...content, items: [] };
    }

    // Single query to fetch all listings with their images
    const listings = await this.entityManager.query(
      `SELECT l.id, l.title, l.price, l.status, l.description,
              c.name as category_name,
              (SELECT li.storage_key FROM listing_images li 
               WHERE li.listing_id = l.id AND li.deleted_at IS NULL 
               ORDER BY li.sort_order ASC LIMIT 1) as primary_image_key
       FROM listings l
       LEFT JOIN product_categories c ON c.id = l.category_id
       WHERE l.id = ANY($1) AND l.status = 'active'`,
      [listingIds],
    );

    // Build a map for O(1) lookup
    const listingMap = new Map<string, any>();
    for (const listing of listings) {
      listingMap.set(listing.id, listing);
    }

    // Resolve image URLs and merge with admin-provided overrides
    const resolvedItems = [];
    for (const item of items) {
      const listing = listingMap.get(item.listing_id);
      if (!listing) continue; // Skip deleted/inactive listings (graceful degradation)

      let imageUrl = '';
      if (listing.primary_image_key) {
        imageUrl = this.mediaService.getPublicUrl(listing.primary_image_key);
      }

      resolvedItems.push({
        id: listing.id,
        name: listing.title,
        family: item.family || listing.category_name || 'Signature',
        type: item.type || 'Eau de Parfum',
        notes: item.notes || listing.description || '',
        price: parseFloat(listing.price),
        ml: item.ml || '50',
        badge: item.badge || null,
        image_url: imageUrl,
        intensity: item.intensity || 70,
      });
    }

    return {
      ...content,
      items: resolvedItems,
    };
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
