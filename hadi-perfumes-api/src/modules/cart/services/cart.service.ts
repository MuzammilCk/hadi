import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CartItem } from '../entities/cart-item.entity';
import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { UpdateCartItemDto } from '../dto/update-cart-item.dto';
import { MergeCartItemDto } from '../dto/merge-cart.dto';
import { Listing, ListingStatus } from '../../listing/entities/listing.entity';

const MAX_QTY = 10;

/** Shape returned by getCart — includes live price and stock data */
export interface CartItemView {
  id: string;
  listing_id: string;
  title: string;
  sku: string;
  price: string;
  qty: number;
  image_url: string;
  available_qty: number;
  in_stock: boolean;
  listing_status: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @InjectRepository(CartItem)
    private readonly cartRepo: Repository<CartItem>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
  ) {}

  /**
   * Returns the full cart for a user with live listing data.
   * Joins listings + inventory_items so prices and stock are always current.
   */
  async getCart(userId: string): Promise<CartItemView[]> {
    const items = await this.cartRepo
      .createQueryBuilder('ci')
      .leftJoinAndSelect('ci.listing', 'listing')
      .leftJoinAndSelect('listing.images', 'images')
      .leftJoinAndSelect('listing.inventory_item', 'inventory_item')
      .where('ci.user_id = :userId', { userId })
      .orderBy('ci.created_at', 'ASC')
      .getMany();

    return items.map((ci) => this.toView(ci));
  }

  /**
   * Add an item to the cart. If the listing already exists for this user,
   * increment the qty (capped at MAX_QTY).
   */
  async addItem(userId: string, dto: AddCartItemDto): Promise<CartItemView[]> {
    // Validate listing exists and is active
    const listing = await this.listingRepo.findOne({
      where: { id: dto.listing_id },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('This product is not currently available');
    }

    // Check for existing cart item
    const existing = await this.cartRepo.findOne({
      where: { user_id: userId, listing_id: dto.listing_id },
    });

    if (existing) {
      existing.qty = Math.min(existing.qty + dto.qty, MAX_QTY);
      await this.cartRepo.save(existing);
    } else {
      const newItem = this.cartRepo.create({
        user_id: userId,
        listing_id: dto.listing_id,
        qty: Math.min(dto.qty, MAX_QTY),
      });
      await this.cartRepo.save(newItem);
    }

    return this.getCart(userId);
  }

  /**
   * Update quantity of a specific cart item.
   */
  async updateItem(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartItemView[]> {
    const item = await this.cartRepo.findOne({
      where: { id: itemId, user_id: userId },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    item.qty = Math.min(dto.qty, MAX_QTY);
    await this.cartRepo.save(item);

    return this.getCart(userId);
  }

  /**
   * Remove a single item from the cart.
   */
  async removeItem(userId: string, itemId: string): Promise<void> {
    const result = await this.cartRepo.delete({
      id: itemId,
      user_id: userId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Cart item not found');
    }
  }

  /**
   * Clear the entire cart for a user.
   */
  async clearCart(userId: string): Promise<void> {
    await this.cartRepo.delete({ user_id: userId });
  }

  /**
   * Merge guest (localStorage) cart items into the server-side cart.
   * For each item: upsert keeping the higher qty.
   * Silently skips invalid or inactive listings.
   */
  async mergeGuestCart(
    userId: string,
    items: MergeCartItemDto[],
  ): Promise<CartItemView[]> {
    for (const incoming of items) {
      try {
        // Validate listing
        const listing = await this.listingRepo.findOne({
          where: { id: incoming.listing_id },
        });

        if (!listing || listing.status !== ListingStatus.ACTIVE) {
          this.logger.debug(
            `Skipping merge for inactive/missing listing ${incoming.listing_id}`,
          );
          continue;
        }

        const existing = await this.cartRepo.findOne({
          where: { user_id: userId, listing_id: incoming.listing_id },
        });

        if (existing) {
          // Keep the higher qty
          existing.qty = Math.min(
            Math.max(existing.qty, incoming.qty),
            MAX_QTY,
          );
          await this.cartRepo.save(existing);
        } else {
          const newItem = this.cartRepo.create({
            user_id: userId,
            listing_id: incoming.listing_id,
            qty: Math.min(incoming.qty, MAX_QTY),
          });
          await this.cartRepo.save(newItem);
        }
      } catch (err) {
        // Best-effort merge: skip items that fail (e.g. FK constraint)
        this.logger.warn(
          `Failed to merge cart item ${incoming.listing_id}: ${err.message}`,
        );
      }
    }

    return this.getCart(userId);
  }

  /** Map a CartItem entity (with eager-loaded listing) to the API view shape */
  private toView(ci: CartItem): CartItemView {
    const listing = ci.listing;
    const inventoryItem = (listing as any)?.inventory_item;
    const primaryImage = listing?.images
      ?.filter((img) => !img.deleted_at)
      ?.sort((a, b) => a.sort_order - b.sort_order)?.[0];

    return {
      id: ci.id,
      listing_id: ci.listing_id,
      title: listing?.title ?? 'Unknown Product',
      sku: listing?.sku ?? '',
      price: String(listing?.price ?? '0'),
      qty: ci.qty,
      image_url: primaryImage?.storage_key ?? '',
      available_qty: inventoryItem?.available_qty ?? 0,
      in_stock:
        listing?.status === ListingStatus.ACTIVE &&
        (inventoryItem?.available_qty ?? 0) > 0,
      listing_status: listing?.status ?? 'unknown',
      created_at: ci.created_at,
      updated_at: ci.updated_at,
    };
  }
}
