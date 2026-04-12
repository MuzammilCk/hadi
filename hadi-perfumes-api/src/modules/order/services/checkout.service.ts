import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CheckoutSession,
  CheckoutSessionStatus,
} from '../entities/checkout-session.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatusHistory } from '../entities/order-status-history.entity';
import { CreateOrderDto } from '../dto/create-order.dto';
import { InventoryService } from '../../inventory/services/inventory.service';
import { ListingService } from '../../listing/services/listing.service';
import {
  InsufficientInventoryForOrderException,
  PriceChangedException,
  IdempotencyMismatchException,
} from '../exceptions/order.exceptions';
import { createHash } from 'crypto';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @InjectRepository(CheckoutSession)
    private readonly sessionRepo: Repository<CheckoutSession>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(OrderStatusHistory)
    private readonly historyRepo: Repository<OrderStatusHistory>,
    private readonly inventoryService: InventoryService,
    private readonly listingService: ListingService,
    private readonly dataSource: DataSource,
  ) {}

  async initiateCheckout(
    buyerId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<Order> {
    // 1. Idempotency check with payload hash validation (read-only — outside transaction)
    const incomingHash = this.computePayloadHash(dto.items);
    const existing = await this.orderRepo.findOne({
      where: { idempotency_key: idempotencyKey },
    });
    if (existing) {
      // If the existing order has a payload_hash (new orders always will),
      // verify the incoming payload matches. A mismatch means the client reused
      // a key with different cart contents — this is a bug or malicious request.
      if (existing.payload_hash && existing.payload_hash !== incomingHash) {
        throw new IdempotencyMismatchException();
      }
      return existing;
    }

    // 2. Sort items by listing_id to guarantee consistent lock acquisition order
    //    across concurrent transactions — eliminates PostgreSQL deadlocks entirely.
    const sortedItems = [...dto.items].sort((a, b) =>
      a.listing_id.localeCompare(b.listing_id),
    );

    // 3. Validate listings and snapshot prices (read-only, outside main tx)
    const snapshots = await this.snapshotListings(sortedItems);

    // 4. Single atomic transaction: reserve all inventory + create order.
    //    If anything fails, PostgreSQL rolls back everything — no orphaned reservations.
    try {
      return await this.dataSource.transaction(async (em) => {
        // 4a. Reserve inventory for all items using the em-aware variant.
        //     Runs inside this transaction — failure = instant atomic rollback.
        const reservationIds: string[] = [];
        for (const item of sortedItems) {
          const reservation = await this.inventoryService.reserveStockWithEm(
            buyerId,
            {
              listingId: item.listing_id,
              qty: item.qty,
              ttlSeconds: parseInt(
                process.env.RESERVATION_TTL_SECONDS || '900',
                10,
              ),
            },
            em,
          );
          reservationIds.push(reservation.id);
        }

        // 4b. Calculate totals
        const totals = this.calculateTotals(snapshots, dto);

        // 4c. Create checkout session
        const session = em.create(CheckoutSession, {
          idempotency_key: idempotencyKey,
          buyer_id: buyerId,
          status: CheckoutSessionStatus.PENDING,
          items: snapshots,
          ...totals,
          reservation_ids: reservationIds,
          expires_at: new Date(
            Date.now() +
              parseInt(process.env.RESERVATION_TTL_SECONDS || '900', 10) * 1000,
          ),
        });
        const savedSession = await em.save(CheckoutSession, session);

        // 4d. Create order
        const order = em.create(Order, {
          idempotency_key: idempotencyKey,
          checkout_session_id: savedSession.id,
          buyer_id: buyerId,
          status: OrderStatus.CREATED,
          ...totals,
          platform_revenue: parseFloat(
            (totals.subtotal - totals.discount_amount).toFixed(2),
          ),
          shipping_address: dto.shipping_address,
          billing_address: dto.billing_address || dto.shipping_address,
          contact: dto.contact,
          notes: dto.notes || null,
          payload_hash: incomingHash,
        });
        const savedOrder = await em.save(Order, order);

        // 4e. Create order items with price snapshot
        for (let i = 0; i < sortedItems.length; i++) {
          const snap = snapshots[i];
          const item = em.create(OrderItem, {
            order_id: savedOrder.id,
            listing_id: snap.listing_id,
            inventory_reservation_id: reservationIds[i],
            title: snap.title,
            sku: snap.sku,
            unit_price: snap.unit_price,
            qty: snap.qty,
            line_total: parseFloat((snap.unit_price * snap.qty).toFixed(2)),
            currency: totals.currency,
          });
          await em.save(OrderItem, item);
        }

        // 4f. Write initial status history
        const history = em.create(OrderStatusHistory, {
          order_id: savedOrder.id,
          from_status: null,
          to_status: OrderStatus.CREATED,
          actor_type: 'system',
          actor_id: null,
          reason: 'Order created',
        });
        await em.save(OrderStatusHistory, history);

        return savedOrder;
      });
    } catch (err: any) {
      // Fix H1: unique constraint on idempotency_key means a concurrent request
      // already won the race. Return the existing order — our transaction already
      // rolled back all reservations atomically, no manual cleanup needed.
      if (
        err?.code === '23505' ||
        err?.message?.includes('UNIQUE constraint failed')
      ) {
        const deduped = await this.orderRepo.findOne({
          where: { idempotency_key: idempotencyKey },
        });
        if (deduped) return deduped;
      }

      // InsufficientInventoryForOrderException and PriceChangedException:
      // the transaction rolled back atomically — rethrow as-is.
      throw err;
    }
  }

  private async snapshotListings(
    items: Array<{ listing_id: string; qty: number; expected_unit_price?: number }>,
  ): Promise<
    Array<{
      listing_id: string;
      qty: number;
      unit_price: number;
      title: string;
      sku: string;
    }>
  > {
    const snapshots = [];
    for (const item of items) {
      // getListingById with includeNonPublic=false ensures only active listings
      const listing = await this.listingService.getListingById(
        item.listing_id,
        false,
      );
      const unit_price = parseFloat(Number(listing.price).toFixed(2));

      // Price guard: if the frontend sent an expected price, verify it matches the DB.
      // Tolerance of 0.01 INR handles floating-point rounding differences.
      if (
        item.expected_unit_price !== undefined &&
        item.expected_unit_price !== null &&
        Math.abs(unit_price - item.expected_unit_price) > 0.01
      ) {
        throw new PriceChangedException(listing.id, item.expected_unit_price, unit_price);
      }

      snapshots.push({
        listing_id: listing.id,
        qty: item.qty,
        unit_price,
        title: listing.title,
        sku: listing.sku,
      });
    }
    return snapshots;
  }

  private computePayloadHash(
    items: Array<{ listing_id: string; qty: number }>,
  ): string {
    const canonical = [...items]
      .sort((a, b) => a.listing_id.localeCompare(b.listing_id))
      .map((i) => `${i.listing_id}:${i.qty}`)
      .join('|');
    return createHash('sha256').update(canonical).digest('hex');
  }

  private calculateTotals(
    snapshots: Array<{ unit_price: number; qty: number }>,
    dto: CreateOrderDto,
  ) {
    const subtotal = parseFloat(
      snapshots.reduce((sum, s) => sum + s.unit_price * s.qty, 0).toFixed(2),
    );
    const shipping_fee = parseFloat((dto.shipping_fee || 0).toFixed(2));
    const tax_amount = parseFloat((dto.tax_amount || 0).toFixed(2));
    const discount_amount = parseFloat((dto.discount_amount || 0).toFixed(2));
    const total_amount = parseFloat(
      (subtotal + shipping_fee + tax_amount - discount_amount).toFixed(2),
    );
    const currency = process.env.DEFAULT_CURRENCY || 'INR';
    return {
      subtotal,
      shipping_fee,
      tax_amount,
      discount_amount,
      total_amount,
      currency,
    };
  }
}
