import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryItem } from '../entities/inventory-item.entity';
import { InventoryReservation, ReservationStatus } from '../entities/inventory-reservation.entity';
import { InventoryEvent, InventoryEventType } from '../entities/inventory-event.entity';
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

/** Run an UPDATE with RETURNING * on Postgres, or UPDATE + SELECT on SQLite */
async function updateReturning(
  em: EntityManager,
  opts: {
    pgSql: string;
    pgParams: any[];
    sqliteSql: string;
    sqliteParams: any[];
    selectSql: string;
    selectParams: any[];
    /** If true, return null when SQLite UPDATE affected 0 rows (for conditional WHERE clauses) */
    checkChanges?: boolean;
  },
): Promise<any> {
  if (isSqlite()) {
    await em.query(opts.sqliteSql, opts.sqliteParams);
    if (opts.checkChanges) {
      const [{ changed }] = await em.query(`SELECT changes() as changed`);
      if (changed === 0) return null;
    }
    const rows = await em.query(opts.selectSql, opts.selectParams);
    return rows.length > 0 ? rows[0] : null;
  } else {
    const rows = await em.query(opts.pgSql, opts.pgParams);
    return rows.length > 0 ? rows[0] : null;
  }
}

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
    const item = await this.inventoryRepo.findOne({ where: { listing_id: listingId } });
    if (!item) {
      throw new InventoryItemNotFoundException();
    }
    return item;
  }

  async addStock(listingId: string, dto: AddStockDto, actorId: string): Promise<InventoryItem> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const item = await this.getInventoryItem(listingId);

      // We can use standard save here or atomic update since we are purely adding
      await em.query(
        sqlParams(`UPDATE inventory_items 
         SET total_qty = total_qty + $1, 
             available_qty = available_qty + $1, 
             updated_at = ${nowFn()} 
         WHERE id = $2`),
        [dto.qty, item.id],
      );

      const updatedItem = await em.findOne(InventoryItem, { where: { id: item.id } });
      if (!updatedItem) throw new InventoryItemNotFoundException();

      // If listing was sold out, update strictly to active.
      await em.query(
        `UPDATE listings SET status = $1, updated_at = now() WHERE id = $2 AND status = $3`,
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

  async adjustStock(listingId: string, dto: AdjustStockDto, actorId: string): Promise<InventoryItem> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const item = await this.getInventoryItem(listingId);
      const diff = dto.newTotalQty - item.total_qty;

      if (item.available_qty + diff < 0) {
        throw new InsufficientStockException('Adjustment shrinks total beyond active reservations');
      }

      await em.query(
        sqlParams(`UPDATE inventory_items 
         SET total_qty = $1, 
             available_qty = available_qty + $2, 
             updated_at = ${nowFn()} 
         WHERE id = $3`),
        [dto.newTotalQty, diff, item.id],
      );

      const updatedItem = await em.findOne(InventoryItem, { where: { id: item.id } });
      if (!updatedItem) throw new InventoryItemNotFoundException();

      if (updatedItem.available_qty === 0) {
        await em.query(
          sqlParams(`UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`),
          [ListingStatus.SOLD_OUT, listingId, ListingStatus.ACTIVE],
        );
      } else if (updatedItem.available_qty > 0) {
        await em.query(
          sqlParams(`UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`),
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

  async reserveStock(userId: string, dto: ReserveStockDto): Promise<InventoryReservation> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const item = await this.getInventoryItem(dto.listingId);

      // ATOMIC UPDATE FOR RESERVATION
      const result = await updateReturning(em, {
        pgSql: `UPDATE inventory_items SET available_qty = available_qty - $1, reserved_qty = reserved_qty + $1, updated_at = now() WHERE id = $2 AND available_qty >= $1 RETURNING *`,
        pgParams: [dto.qty, item.id],
        sqliteSql: `UPDATE inventory_items SET available_qty = available_qty - ?, reserved_qty = reserved_qty + ?, updated_at = ${nowFn()} WHERE id = ? AND available_qty >= ?`,
        sqliteParams: [dto.qty, dto.qty, item.id, dto.qty],
        selectSql: `SELECT * FROM inventory_items WHERE id = ?`,
        selectParams: [item.id],
        checkChanges: true,
      });

      if (!result) {
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

      // Check if item went completely out of stock by this reservation
      if (result.available_qty === 0 || Number(result.available_qty) === 0) {
        await em.query(
          sqlParams(`UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`),
          [ListingStatus.SOLD_OUT, dto.listingId, ListingStatus.ACTIVE],
        );
      }

      const ttl = dto.ttlSeconds || Number(process.env.RESERVATION_TTL_SECONDS) || 900;
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

  async confirmReservation(reservationId: string, orderId: string, actorId: string): Promise<InventoryReservation> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const res = await em.findOne(InventoryReservation, { where: { id: reservationId } });
      if (!res) throw new ReservationNotFoundException();
      if (res.status !== ReservationStatus.RESERVED) throw new ReservationAlreadyConfirmedException(`already ${res.status}`);

      res.status = ReservationStatus.CONFIRMED;
      res.order_id = orderId;
      await em.save(InventoryReservation, res);

      const result = await updateReturning(em, {
        pgSql: `UPDATE inventory_items SET reserved_qty = reserved_qty - $1, sold_qty = sold_qty + $1, updated_at = now() WHERE id = $2 RETURNING *`,
        pgParams: [res.qty, res.inventory_item_id],
        sqliteSql: `UPDATE inventory_items SET reserved_qty = reserved_qty - ?, sold_qty = sold_qty + ?, updated_at = ${nowFn()} WHERE id = ?`,
        sqliteParams: [res.qty, res.qty, res.inventory_item_id],
        selectSql: `SELECT * FROM inventory_items WHERE id = ?`,
        selectParams: [res.inventory_item_id],
      });

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

  async releaseReservation(reservationId: string, actorId: string, isExpiry: boolean = false): Promise<InventoryReservation> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const res = await em.findOne(InventoryReservation, { where: { id: reservationId } });
      if (!res) throw new ReservationNotFoundException();
      
      if (res.status !== ReservationStatus.RESERVED) {
        return res; // Ignore if already confirmed or released to maintain idempotency
      }

      res.status = isExpiry ? ReservationStatus.EXPIRED : ReservationStatus.RELEASED;
      await em.save(InventoryReservation, res);

      const result = await updateReturning(em, {
        pgSql: `UPDATE inventory_items SET reserved_qty = reserved_qty - $1, available_qty = available_qty + $1, updated_at = now() WHERE id = $2 RETURNING *`,
        pgParams: [res.qty, res.inventory_item_id],
        sqliteSql: `UPDATE inventory_items SET reserved_qty = reserved_qty - ?, available_qty = available_qty + ?, updated_at = ${nowFn()} WHERE id = ?`,
        sqliteParams: [res.qty, res.qty, res.inventory_item_id],
        selectSql: `SELECT * FROM inventory_items WHERE id = ?`,
        selectParams: [res.inventory_item_id],
      });

      // Restore active status if it was previously sold out
      if (result.available_qty > 0) {
        await em.query(
          sqlParams(`UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`),
          [ListingStatus.ACTIVE, res.listing_id, ListingStatus.SOLD_OUT],
        );
      }

      const event = em.create(InventoryEvent, {
        inventory_item_id: res.inventory_item_id,
        listing_id: res.listing_id,
        event_type: isExpiry ? InventoryEventType.RESERVATION_EXPIRED : InventoryEventType.RESERVATION_RELEASED,
        qty_delta: res.qty, // returning available stock
        qty_after: result.total_qty,
        actor_id: actorId,
        reference_id: res.id,
      });
      await em.save(InventoryEvent, event);

      return res;
    });
  }

  async expireStaleReservations(): Promise<{ expired: number }> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      // Find all reserved stock that passed expiry
      const expirySql = isSqlite()
        ? `SELECT id FROM inventory_reservations WHERE status = ? AND expires_at < ${nowFn()} LIMIT 100`
        : `SELECT id FROM inventory_reservations WHERE status = $1 AND expires_at < now() FOR UPDATE SKIP LOCKED LIMIT 100`;
      const expired = await em.query(expirySql, [ReservationStatus.RESERVED]);

      let processed = 0;
      for (const row of expired) {
        try {
          // Release reservation
          const res = await em.findOne(InventoryReservation, { where: { id: row.id } });
          if (res) {
            res.status = ReservationStatus.EXPIRED;
            await em.save(InventoryReservation, res);

            const result = await updateReturning(em, {
              pgSql: `UPDATE inventory_items SET reserved_qty = reserved_qty - $1, available_qty = available_qty + $1, updated_at = now() WHERE id = $2 RETURNING *`,
              pgParams: [res.qty, res.inventory_item_id],
              sqliteSql: `UPDATE inventory_items SET reserved_qty = reserved_qty - ?, available_qty = available_qty + ?, updated_at = ${nowFn()} WHERE id = ?`,
              sqliteParams: [res.qty, res.qty, res.inventory_item_id],
              selectSql: `SELECT * FROM inventory_items WHERE id = ?`,
              selectParams: [res.inventory_item_id],
            });

            if (result.available_qty > 0) {
              await em.query(
                sqlParams(`UPDATE listings SET status = $1, updated_at = ${nowFn()} WHERE id = $2 AND status = $3`),
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
          }
        } catch (error) {
          this.logger.error(`Failed to expire reservation ${row.id}`, error);
        }
      }

      return { expired: processed };
    });
  }
}
