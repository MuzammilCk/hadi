import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryItem } from '../entities/inventory-item.entity';
import {
  InventoryReservation,
  ReservationStatus,
} from '../entities/inventory-reservation.entity';
import {
  InventoryEvent,
  InventoryEventType,
} from '../entities/inventory-event.entity';
import { ReserveStockDto } from '../dto/reserve-stock.dto';
import { AddStockDto } from '../dto/add-stock.dto';
import { AdjustStockDto } from '../dto/adjust-stock.dto';
import {
  InsufficientStockException,
  InventoryItemNotFoundException,
  ReservationNotFoundException,
  ReservationAlreadyConfirmedException,
} from '../exceptions/inventory.exceptions';
import { ListingStatus } from '../../listing/entities/listing.entity';
import { nowFn, sqlParams, isSqlite } from '../../../common/utils/db-type.util';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
    @InjectRepository(InventoryReservation)
    private readonly reservationRepo: Repository<InventoryReservation>,
    private readonly dataSource: DataSource,
  ) {}

  async getInventoryItem(listingId: string): Promise<InventoryItem> {
    const item = await this.inventoryRepo.findOne({
      where: { listing_id: listingId },
    });
    if (!item) {
      throw new InventoryItemNotFoundException();
    }
    return item;
  }

  async addStock(
    listingId: string,
    dto: AddStockDto,
    actorId: string,
  ): Promise<InventoryItem> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      // Fix H6: read inside the transaction em, not the injected repo (TOCTOU fix)
      const item = await em.findOne(InventoryItem, {
        where: { listing_id: listingId },
      });
      if (!item) throw new InventoryItemNotFoundException();

      // We can use standard save here or atomic update since we are purely adding
      await em.query(
        sqlParams(`UPDATE inventory_items 
         SET total_qty = total_qty + $1, 
             available_qty = available_qty + $1, 
             updated_at = ${nowFn()} 
         WHERE id = $2`),
        [dto.qty, item.id],
      );

      const updatedItem = await em.findOne(InventoryItem, {
        where: { id: item.id },
      });
      if (!updatedItem) throw new InventoryItemNotFoundException();

      // If listing was sold out, update strictly to active.
      await em.query(
        sqlParams(
          `UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`,
        ),
        [ListingStatus.ACTIVE, listingId, ListingStatus.SOLD_OUT],
      );

      const event = em.create(InventoryEvent, {
        inventory_item_id: item.id,
        listing_id: listingId,
        event_type: InventoryEventType.STOCK_ADDED,
        qty_delta: dto.qty,
        qty_after: updatedItem.total_qty,
        actor_id: actorId,
      });
      await em.save(InventoryEvent, event);

      return updatedItem;
    });
  }

  async adjustStock(
    listingId: string,
    dto: AdjustStockDto,
    actorId: string,
  ): Promise<InventoryItem> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      // Fix H6: read inside the transaction em so the diff is based on a consistent snapshot
      const item = await em.findOne(InventoryItem, {
        where: { listing_id: listingId },
      });
      if (!item) throw new InventoryItemNotFoundException();
      const diff = dto.newTotalQty - item.total_qty;

      if (item.available_qty + diff < 0) {
        throw new InsufficientStockException(
          'Adjustment shrinks total beyond active reservations',
        );
      }

      await em.query(
        sqlParams(`UPDATE inventory_items 
         SET total_qty = $1, 
             available_qty = available_qty + $2, 
             updated_at = ${nowFn()} 
         WHERE id = $3`),
        [dto.newTotalQty, diff, item.id],
      );

      const updatedItem = await em.findOne(InventoryItem, {
        where: { id: item.id },
      });
      if (!updatedItem) throw new InventoryItemNotFoundException();

      if (updatedItem.available_qty === 0) {
        await em.query(
          sqlParams(
            `UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`,
          ),
          [ListingStatus.SOLD_OUT, listingId, ListingStatus.ACTIVE],
        );
      } else if (updatedItem.available_qty > 0) {
        await em.query(
          sqlParams(
            `UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`,
          ),
          [ListingStatus.ACTIVE, listingId, ListingStatus.SOLD_OUT],
        );
      }

      const event = em.create(InventoryEvent, {
        inventory_item_id: item.id,
        listing_id: listingId,
        event_type: InventoryEventType.STOCK_ADJUSTED,
        qty_delta: diff,
        qty_after: updatedItem.total_qty,
        actor_id: actorId,
        reference_id: null, // the note/reason goes somewhere else or extension column
      });
      await em.save(InventoryEvent, event);

      return updatedItem;
    });
  }

  async reserveStock(
    userId: string,
    dto: ReserveStockDto,
  ): Promise<InventoryReservation> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      // Fix H1: read inside em, not injected repo — prevents stale reference in atomic UPDATE
      const item = await em.findOne(InventoryItem, {
        where: { listing_id: dto.listingId },
      });
      if (!item) throw new InventoryItemNotFoundException();

      // ATOMIC UPDATE FOR RESERVATION
      const updateRes = await em.query(
        sqlParams(
          `UPDATE inventory_items SET available_qty = available_qty - $1, reserved_qty = reserved_qty + $2, updated_at = ${nowFn()} WHERE id = $3 AND available_qty >= $4`,
        ),
        [dto.qty, dto.qty, item.id, dto.qty],
      );

      // Determine if UPDATE succeeded — works for both SQLite and PostgreSQL
      let rowUpdated: boolean;
      if (isSqlite()) {
        const [{ changed }] = await em.query(`SELECT changes() as changed`);
        rowUpdated = Number(changed) > 0;
      } else {
        // PostgreSQL: em.query() UPDATE returns [rows[], affectedRowCount]
        const affectedCount =
          Array.isArray(updateRes) && updateRes.length === 2
            ? Number(updateRes[1])
            : 0;
        rowUpdated = affectedCount > 0;
      }

      if (!rowUpdated) {
        const event = em.create(InventoryEvent, {
          inventory_item_id: item.id,
          listing_id: dto.listingId,
          event_type: InventoryEventType.OVERSELL_BLOCKED,
          qty_delta: dto.qty,
          qty_after: item.total_qty,
          actor_id: userId,
        });
        await em.save(InventoryEvent, event);
        throw new InsufficientStockException();
      }

      const result = await em.findOne(InventoryItem, {
        where: { id: item.id },
      });
      if (!result) throw new InventoryItemNotFoundException();

      if (result.available_qty === 0 || Number(result.available_qty) === 0) {
        await em.query(
          sqlParams(
            `UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`,
          ),
          [ListingStatus.SOLD_OUT, dto.listingId, ListingStatus.ACTIVE],
        );
      }

      const ttl =
        dto.ttlSeconds || Number(process.env.RESERVATION_TTL_SECONDS) || 900;
      const expiresAt = new Date(Date.now() + ttl * 1000);

      const reservation = em.create(InventoryReservation, {
        listing_id: dto.listingId,
        inventory_item_id: item.id,
        reserved_by_user_id: userId,
        qty: dto.qty,
        expires_at: expiresAt,
        status: ReservationStatus.RESERVED,
        reservation_ttl_seconds: ttl,
      });
      const savedRes = await em.save(InventoryReservation, reservation);

      const event = em.create(InventoryEvent, {
        inventory_item_id: item.id,
        listing_id: dto.listingId,
        event_type: InventoryEventType.RESERVED,
        qty_delta: -dto.qty,
        qty_after: result.total_qty,
        actor_id: userId,
        reference_id: savedRes.id,
      });
      await em.save(InventoryEvent, event);

      return savedRes;
    });
  }

  /**
   * Em-aware variant of reserveStock for callers that already own a transaction.
   * Uses the provided EntityManager directly — NEVER opens its own dataSource.transaction().
   * Follow the same pattern as confirmReservationWithEm / releaseReservationWithEm.
   */
  async reserveStockWithEm(
    userId: string,
    dto: ReserveStockDto,
    em: EntityManager,
  ): Promise<InventoryReservation> {
    const item = await em.findOne(InventoryItem, {
      where: { listing_id: dto.listingId },
    });
    if (!item) throw new InventoryItemNotFoundException();

    const updateRes = await em.query(
      sqlParams(
        `UPDATE inventory_items SET available_qty = available_qty - $1, reserved_qty = reserved_qty + $2, updated_at = ${nowFn()} WHERE id = $3 AND available_qty >= $4`,
      ),
      [dto.qty, dto.qty, item.id, dto.qty],
    );

    let rowUpdated: boolean;
    if (isSqlite()) {
      const [{ changed }] = await em.query(`SELECT changes() as changed`);
      rowUpdated = Number(changed) > 0;
    } else {
      const affectedCount =
        Array.isArray(updateRes) && updateRes.length === 2
          ? Number(updateRes[1])
          : 0;
      rowUpdated = affectedCount > 0;
    }

    if (!rowUpdated) {
      const event = em.create(InventoryEvent, {
        inventory_item_id: item.id,
        listing_id: dto.listingId,
        event_type: InventoryEventType.OVERSELL_BLOCKED,
        qty_delta: dto.qty,
        qty_after: item.total_qty,
        actor_id: userId,
      });
      await em.save(InventoryEvent, event);
      throw new InsufficientStockException();
    }

    const result = await em.findOne(InventoryItem, { where: { id: item.id } });
    if (!result) throw new InventoryItemNotFoundException();

    if (result.available_qty === 0 || Number(result.available_qty) === 0) {
      await em.query(
        sqlParams(
          `UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`,
        ),
        [ListingStatus.SOLD_OUT, dto.listingId, ListingStatus.ACTIVE],
      );
    }

    const ttl =
      dto.ttlSeconds || Number(process.env.RESERVATION_TTL_SECONDS) || 900;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const reservation = em.create(InventoryReservation, {
      listing_id: dto.listingId,
      inventory_item_id: item.id,
      reserved_by_user_id: userId,
      qty: dto.qty,
      expires_at: expiresAt,
      status: ReservationStatus.RESERVED,
      reservation_ttl_seconds: ttl,
    });
    const savedRes = await em.save(InventoryReservation, reservation);

    const event = em.create(InventoryEvent, {
      inventory_item_id: item.id,
      listing_id: dto.listingId,
      event_type: InventoryEventType.RESERVED,
      qty_delta: dto.qty * -1,
      qty_after: result.total_qty,
      actor_id: userId,
      reference_id: savedRes.id,
    });
    await em.save(InventoryEvent, event);

    return savedRes;
  }

  async confirmReservation(
    reservationId: string,
    orderId: string,
    actorId: string,
  ): Promise<InventoryReservation> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const res = await em.findOne(InventoryReservation, {
        where: { id: reservationId },
      });
      if (!res) throw new ReservationNotFoundException();
      if (res.status !== ReservationStatus.RESERVED)
        throw new ReservationAlreadyConfirmedException(`already ${res.status}`);

      res.status = ReservationStatus.CONFIRMED;
      res.order_id = orderId;
      await em.save(InventoryReservation, res);

      await em.query(
        sqlParams(
          `UPDATE inventory_items SET reserved_qty = reserved_qty - $1, sold_qty = sold_qty + $2, updated_at = ${nowFn()} WHERE id = $3`,
        ),
        [res.qty, res.qty, res.inventory_item_id],
      );

      const result = await em.findOne(InventoryItem, {
        where: { id: res.inventory_item_id },
      });
      if (!result) throw new InventoryItemNotFoundException();

      const event = em.create(InventoryEvent, {
        inventory_item_id: res.inventory_item_id,
        listing_id: res.listing_id,
        event_type: InventoryEventType.RESERVATION_CONFIRMED,
        qty_delta: 0, // logical transfer, total items unmutated
        qty_after: result.total_qty,
        actor_id: actorId,
        reference_id: res.id,
      });
      await em.save(InventoryEvent, event);

      return res;
    });
  }

  /**
   * Fix H2: em-aware variant of confirmReservation for callers that already own a transaction.
   * Pass the outer EntityManager so inventory confirmation is atomic with the caller's operation
   * (e.g., marking an order PAID in the Stripe webhook handler).
   * NEVER opens its own dataSource.transaction() — uses the provided em directly.
   */
  async confirmReservationWithEm(
    reservationId: string,
    orderId: string,
    actorId: string,
    em: EntityManager,
  ): Promise<InventoryReservation> {
    const res = await em.findOne(InventoryReservation, {
      where: { id: reservationId },
    });
    if (!res) throw new ReservationNotFoundException();
    if (res.status !== ReservationStatus.RESERVED) {
      // Already confirmed by a prior call — idempotent
      return res;
    }

    res.status = ReservationStatus.CONFIRMED;
    res.order_id = orderId;
    await em.save(InventoryReservation, res);

    await em.query(
      sqlParams(
        `UPDATE inventory_items SET reserved_qty = reserved_qty - $1, sold_qty = sold_qty + $2, updated_at = ${nowFn()} WHERE id = $3`,
      ),
      [res.qty, res.qty, res.inventory_item_id],
    );

    const result = await em.findOne(InventoryItem, {
      where: { id: res.inventory_item_id },
    });
    if (!result) throw new InventoryItemNotFoundException();

    const event = em.create(InventoryEvent, {
      inventory_item_id: res.inventory_item_id,
      listing_id: res.listing_id,
      event_type: InventoryEventType.RESERVATION_CONFIRMED,
      qty_delta: 0,
      qty_after: result.total_qty,
      actor_id: actorId,
      reference_id: res.id,
    });
    await em.save(InventoryEvent, event);

    return res;
  }

  async releaseReservation(
    reservationId: string,
    actorId: string,
    isExpiry: boolean = false,
  ): Promise<InventoryReservation> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const res = await em.findOne(InventoryReservation, {
        where: { id: reservationId },
      });
      if (!res) throw new ReservationNotFoundException();

      if (res.status !== ReservationStatus.RESERVED) {
        return res; // Ignore if already confirmed or released to maintain idempotency
      }

      res.status = isExpiry
        ? ReservationStatus.EXPIRED
        : ReservationStatus.RELEASED;
      await em.save(InventoryReservation, res);

      await em.query(
        sqlParams(
          `UPDATE inventory_items SET reserved_qty = reserved_qty - $1, available_qty = available_qty + $2, updated_at = ${nowFn()} WHERE id = $3`,
        ),
        [res.qty, res.qty, res.inventory_item_id],
      );

      const result = await em.findOne(InventoryItem, {
        where: { id: res.inventory_item_id },
      });
      if (!result) throw new InventoryItemNotFoundException();

      // Restore active status if it was previously sold out
      if (result.available_qty > 0) {
        await em.query(
          sqlParams(
            `UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`,
          ),
          [ListingStatus.ACTIVE, res.listing_id, ListingStatus.SOLD_OUT],
        );
      }

      const event = em.create(InventoryEvent, {
        inventory_item_id: res.inventory_item_id,
        listing_id: res.listing_id,
        event_type: isExpiry
          ? InventoryEventType.RESERVATION_EXPIRED
          : InventoryEventType.RESERVATION_RELEASED,
        qty_delta: res.qty, // returning available stock
        qty_after: result.total_qty,
        actor_id: actorId,
        reference_id: res.id,
      });
      await em.save(InventoryEvent, event);

      return res;
    });
  }

  /**
   * Fix H2: em-aware variant of releaseReservation for callers that already own a transaction.
   * Uses the provided em directly — NEVER opens its own dataSource.transaction().
   */
  async releaseReservationWithEm(
    reservationId: string,
    actorId: string,
    isExpiry: boolean = false,
    em: EntityManager,
  ): Promise<InventoryReservation> {
    const res = await em.findOne(InventoryReservation, {
      where: { id: reservationId },
    });
    if (!res) throw new ReservationNotFoundException();

    if (res.status !== ReservationStatus.RESERVED) {
      return res; // idempotent
    }

    res.status = isExpiry
      ? ReservationStatus.EXPIRED
      : ReservationStatus.RELEASED;
    await em.save(InventoryReservation, res);

    await em.query(
      sqlParams(
        `UPDATE inventory_items SET reserved_qty = reserved_qty - $1, available_qty = available_qty + $2, updated_at = ${nowFn()} WHERE id = $3`,
      ),
      [res.qty, res.qty, res.inventory_item_id],
    );

    const result = await em.findOne(InventoryItem, {
      where: { id: res.inventory_item_id },
    });
    if (!result) throw new InventoryItemNotFoundException();

    if (result.available_qty > 0) {
      await em.query(
        sqlParams(
          `UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`,
        ),
        [ListingStatus.ACTIVE, res.listing_id, ListingStatus.SOLD_OUT],
      );
    }

    const event = em.create(InventoryEvent, {
      inventory_item_id: res.inventory_item_id,
      listing_id: res.listing_id,
      event_type: isExpiry
        ? InventoryEventType.RESERVATION_EXPIRED
        : InventoryEventType.RESERVATION_RELEASED,
      qty_delta: res.qty,
      qty_after: result.total_qty,
      actor_id: actorId,
      reference_id: res.id,
    });
    await em.save(InventoryEvent, event);

    return res;
  }

  async expireStaleReservations(): Promise<{ expired: number }> {
    // Fix B4: Fetch candidates outside the per-reservation transaction.
    // Each reservation is processed in its own independent transaction so one
    // failure doesn't roll back all successful expirations (PostgreSQL aborts
    // the entire tx on any error).
    const expirySql = isSqlite()
      ? sqlParams(
          `SELECT id FROM inventory_reservations WHERE status = $1 AND expires_at < ${nowFn()} LIMIT 100`,
        )
      : sqlParams(
          `SELECT id FROM inventory_reservations WHERE status = $1 AND expires_at < ${nowFn()} FOR UPDATE SKIP LOCKED LIMIT 100`,
        );
    const expired = await this.dataSource.query(expirySql, [ReservationStatus.RESERVED]);

    let processed = 0;
    for (const row of expired) {
      try {
        await this.dataSource.transaction(async (em: EntityManager) => {
          const res = await em.findOne(InventoryReservation, {
            where: { id: row.id },
          });
          if (!res || res.status !== ReservationStatus.RESERVED) return;

          res.status = ReservationStatus.EXPIRED;
          await em.save(InventoryReservation, res);

          await em.query(
            sqlParams(
              `UPDATE inventory_items SET reserved_qty = reserved_qty - $1, available_qty = available_qty + $2, updated_at = ${nowFn()} WHERE id = $3`,
            ),
            [res.qty, res.qty, res.inventory_item_id],
          );

          const result = await em.findOne(InventoryItem, {
            where: { id: res.inventory_item_id },
          });
          if (!result) throw new InventoryItemNotFoundException();

          if (result.available_qty > 0) {
            await em.query(
              sqlParams(
                `UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`,
              ),
              [ListingStatus.ACTIVE, res.listing_id, ListingStatus.SOLD_OUT],
            );
          }

          const event = em.create(InventoryEvent, {
            inventory_item_id: res.inventory_item_id,
            listing_id: res.listing_id,
            event_type: InventoryEventType.RESERVATION_EXPIRED,
            qty_delta: res.qty,
            qty_after: result.total_qty,
            actor_id: null,
            reference_id: res.id,
          });
          await em.save(InventoryEvent, event);

          processed++;
        });
      } catch (error) {
        this.logger.error(`Failed to expire reservation ${row.id}`, error);
      }
    }

    return { expired: processed };
  }
}
