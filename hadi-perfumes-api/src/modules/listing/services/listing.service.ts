import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Listing, ListingStatus } from '../entities/listing.entity';
import { ListingImage } from '../entities/listing-image.entity';
import {
  ActorType,
  ListingStatusHistory,
} from '../entities/listing-status-history.entity';
import {
  ListingModerationAction,
  ModerationAction,
} from '../entities/listing-moderation-action.entity';
import { CreateListingDto } from '../dto/create-listing.dto';
import { UpdateListingDto } from '../dto/update-listing.dto';
import { AddImageDto } from '../dto/add-image.dto';
import { ModerationActionDto } from '../dto/moderation-action.dto';
import { ListingSearchDto } from '../dto/listing-search.dto';
import {
  ListingNotFoundException,
  ListingStateTransitionException,
  SkuAlreadyExistsException,
} from '../exceptions/listing.exceptions';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class ListingService {
  private readonly logger = new Logger(ListingService.name);

  constructor(
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async createListing(
    adminId: string,
    dto: CreateListingDto,
  ): Promise<Listing> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      // 1. Check SKU Uniqueness
      const existingSku = await em.findOne(Listing, {
        where: { sku: dto.sku },
      });
      if (existingSku) {
        throw new SkuAlreadyExistsException();
      }

      // 2. Create Listing
      const listing = em.create(Listing, {
        ...dto,
        seller_id: adminId, // using seller_id field configured for admin_id per Phase 4
        status: dto.status || ListingStatus.DRAFT,
      });
      const savedListing = await em.save(Listing, listing);

      // 3. Create initial InventoryItem synchronously
      const invItem = em.create(InventoryItem, {
        listing_id: savedListing.id,
        total_qty: dto.quantity,
        available_qty: dto.quantity,
      });
      await em.save(InventoryItem, invItem);

      // 4. Log initial status history
      const history = em.create(ListingStatusHistory, {
        listing_id: savedListing.id,
        from_status: savedListing.status, // non-nullable column
        to_status: savedListing.status,
        actor_id: adminId,
        actor_type: ActorType.ADMIN,
        reason: 'Initial creation',
      });
      await em.save(ListingStatusHistory, history);

      // Phase 9: Audit log
      this.auditService.log({
        actor_id: adminId,
        action: 'PRODUCT_CREATED',
        entity_type: 'listing',
        entity_id: savedListing.id,
        after_snapshot: { title: savedListing.title, sku: savedListing.sku, price: savedListing.price, status: savedListing.status },
      });

      return savedListing;
    });
  }

  async updateListing(
    id: string,
    adminId: string,
    dto: UpdateListingDto,
  ): Promise<Listing> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const listing = await em.findOne(Listing, { where: { id } });
      if (!listing) {
        throw new ListingNotFoundException();
      }

      const updateDto = dto as any;
      if (updateDto.sku && updateDto.sku !== listing.sku) {
        const existingSku = await em.findOne(Listing, {
          where: { sku: updateDto.sku },
        });
        if (existingSku) {
          throw new SkuAlreadyExistsException();
        }
      }

      const prevStatus = listing.status;
      em.merge(Listing, listing, dto);
      const savedListing = await em.save(Listing, listing);

      if (updateDto.status && updateDto.status !== prevStatus) {
        const history = em.create(ListingStatusHistory, {
          listing_id: savedListing.id,
          from_status: prevStatus,
          to_status: savedListing.status,
          actor_id: adminId,
          actor_type: ActorType.ADMIN,
          reason: 'Listing metadata update including status change',
        });
        await em.save(ListingStatusHistory, history);
      }

      // Phase 9: Audit log
      const changes: Record<string, any> = {};
      if (updateDto.price !== undefined) changes.price = { from: prevStatus, to: savedListing.price };
      if (updateDto.title !== undefined) changes.title = savedListing.title;
      if (updateDto.status !== undefined) changes.status = { from: prevStatus, to: savedListing.status };
      this.auditService.log({
        actor_id: adminId,
        action: updateDto.price !== undefined ? 'PRODUCT_PRICE_CHANGE' : 'PRODUCT_UPDATED',
        entity_type: 'listing',
        entity_id: savedListing.id,
        before_snapshot: { price: listing.price, status: prevStatus },
        after_snapshot: changes,
      });

      return savedListing;
    });
  }

  private async _transitionStatus(
    id: string,
    adminId: string,
    action: ModerationAction,
    newStatus: ListingStatus,
    dto: ModerationActionDto,
    em: EntityManager,
  ): Promise<Listing> {
    const listing = await em.findOne(Listing, { where: { id } });
    if (!listing) {
      throw new ListingNotFoundException();
    }

    const validTransitions: Record<ListingStatus, ListingStatus[]> = {
      [ListingStatus.DRAFT]: [
        ListingStatus.PENDING_REVIEW,
        ListingStatus.ACTIVE,
        ListingStatus.REMOVED,
      ],
      [ListingStatus.PENDING_REVIEW]: [
        ListingStatus.DRAFT,
        ListingStatus.ACTIVE,
        ListingStatus.REMOVED,
      ],
      [ListingStatus.ACTIVE]: [
        ListingStatus.PAUSED,
        ListingStatus.SOLD_OUT,
        ListingStatus.REMOVED,
      ],
      [ListingStatus.PAUSED]: [ListingStatus.ACTIVE, ListingStatus.REMOVED],
      [ListingStatus.SOLD_OUT]: [ListingStatus.ACTIVE, ListingStatus.REMOVED],
      [ListingStatus.REMOVED]: [], // Terminal
    };

    const allowed = validTransitions[listing.status as ListingStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new ListingStateTransitionException(
        `Cannot transition from ${listing.status} to ${newStatus}`,
      );
    }

    const prevStatus = listing.status;
    listing.status = newStatus;
    const savedListing = await em.save(Listing, listing);

    const history = em.create(ListingStatusHistory, {
      listing_id: savedListing.id,
      from_status: prevStatus,
      to_status: savedListing.status,
      actor_id: adminId,
      actor_type: ActorType.ADMIN,
      reason: dto.reason,
    });
    await em.save(ListingStatusHistory, history);

    const modAction = em.create(ListingModerationAction, {
      listing_id: savedListing.id,
      admin_id: adminId,
      action: action,
      reason: dto.reason,
      evidence: dto.evidence,
    });
    await em.save(ListingModerationAction, modAction);

    return savedListing;
  }

  async moderateListing(
    id: string,
    adminId: string,
    action: ModerationAction,
    dto: ModerationActionDto,
  ): Promise<Listing> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      let nextStatus: ListingStatus;
      switch (action) {
        case ModerationAction.APPROVE:
        case ModerationAction.RESUME:
          nextStatus = ListingStatus.ACTIVE;
          break;
        case ModerationAction.REJECT:
          nextStatus = ListingStatus.DRAFT; // Send back to draft
          break;
        case ModerationAction.PAUSE:
        case ModerationAction.FLAG_FOR_REVIEW:
          nextStatus = ListingStatus.PAUSED;
          break;
        case ModerationAction.REMOVE:
          nextStatus = ListingStatus.REMOVED;
          break;
        default:
          throw new ListingStateTransitionException(
            'Unknown moderation action',
          );
      }

      return this._transitionStatus(id, adminId, action, nextStatus, dto, em);
    });
  }

  async searchListings(
    filters: ListingSearchDto,
    isAdmin: boolean = false,
  ): Promise<{ data: Listing[]; total: number; page: number; limit: number }> {
    const query = this.listingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.images', 'images')
      .leftJoinAndSelect('listing.category', 'category');

    if (!isAdmin) {
      // Public view forces active items only
      query.andWhere('listing.status = :activeStatus', {
        activeStatus: ListingStatus.ACTIVE,
      });
    } else if (filters.status) {
      query.andWhere('listing.status = :status', { status: filters.status });
    }

    if (filters.condition)
      query.andWhere('listing.condition = :condition', {
        condition: filters.condition,
      });
    if (filters.authenticity_status)
      query.andWhere('listing.authenticity_status = :auth', {
        auth: filters.authenticity_status,
      });
    if (filters.category_id)
      query.andWhere('listing.category_id = :catId', {
        catId: filters.category_id,
      });
    if (filters.seller_id)
      query.andWhere('listing.seller_id = :sellerId', {
        sellerId: filters.seller_id,
      });

    if (filters.min_price !== undefined)
      query.andWhere('listing.price >= :minP', { minP: filters.min_price });
    if (filters.max_price !== undefined)
      query.andWhere('listing.price <= :maxP', { maxP: filters.max_price });

    if (filters.q) {
      query.andWhere(
        '(listing.title ILIKE :q OR listing.description ILIKE :q OR listing.sku ILIKE :q)',
        { q: `%${filters.q}%` },
      );
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;

    query
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('listing.created_at', 'DESC');

    const [data, total] = await query.getManyAndCount();

    return { data, total, page, limit };
  }

  async getListingById(
    id: string,
    includeNonPublic: boolean = false,
  ): Promise<Listing> {
    const listing = await this.listingRepository.findOne({
      where: { id },
      relations: ['images', 'category'],
    });

    if (!listing) {
      throw new ListingNotFoundException();
    }

    if (!includeNonPublic && listing.status !== ListingStatus.ACTIVE) {
      throw new ListingNotFoundException();
    }

    return listing;
  }

  async addImage(
    listingId: string,
    adminId: string,
    dto: AddImageDto,
  ): Promise<ListingImage> {
    // Validate existence first
    await this.getListingById(listingId, true);

    return this.dataSource.transaction(async (em: EntityManager) => {
      const image = em.create(ListingImage, {
        listing_id: listingId,
        storage_key: dto.storage_key,
        sort_order: dto.sort_order || 0,
      });

      return await em.save(ListingImage, image);
    });
  }

  async removeImage(imageId: string, adminId: string): Promise<void> {
    await this.dataSource.transaction(async (em: EntityManager) => {
      const img = await em.findOne(ListingImage, { where: { id: imageId } });
      if (img) {
        img.deleted_at = new Date(); // soft delete for metadata
        await em.save(ListingImage, img);
      }
    });
  }

  async reorderImages(
    listingId: string,
    adminId: string,
    orderedIds: string[],
  ): Promise<void> {
    await this.dataSource.transaction(async (em: EntityManager) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await em.update(
          ListingImage,
          { id: orderedIds[i], listing_id: listingId },
          { sort_order: i },
        );
      }
    });
  }
}
