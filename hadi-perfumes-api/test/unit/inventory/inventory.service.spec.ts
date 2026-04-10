import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryService } from '../../../src/modules/inventory/services/inventory.service';
import { InventoryItem } from '../../../src/modules/inventory/entities/inventory-item.entity';
import { InventoryReservation, ReservationStatus } from '../../../src/modules/inventory/entities/inventory-reservation.entity';
import { InventoryEvent, InventoryEventType } from '../../../src/modules/inventory/entities/inventory-event.entity';
import { InsufficientStockException, ReservationNotFoundException } from '../../../src/modules/inventory/exceptions/inventory.exceptions';
import { ListingStatus } from '../../../src/modules/listing/entities/listing.entity';

describe('InventoryService', () => {
  let service: InventoryService;
  let mockEntityManager: jest.Mocked<EntityManager>;
  let mockInventoryRepo: jest.Mocked<Repository<InventoryItem>>;

  beforeEach(async () => {
    mockInventoryRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<InventoryItem>>;

    mockEntityManager = {
      findOne: jest.fn(),
      query: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<EntityManager>;

    const mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(mockEntityManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: getRepositoryToken(InventoryItem),
          useValue: mockInventoryRepo,
        },
        {
          provide: getRepositoryToken(InventoryReservation),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  describe('reserveStock', () => {
    it('should block reservation and throw InsufficientStockException if atomic update fails', async () => {
      mockInventoryRepo.findOne.mockResolvedValueOnce({ id: 'inv1', total_qty: 10 } as InventoryItem);

      mockEntityManager.query.mockImplementation(async (sql) => {
        if (sql.includes('changes()')) return [{ changed: 0 }];
        return [];
      });

      mockEntityManager.create.mockImplementation((entityClass, data) => data as any);
      
      await expect(
        service.reserveStock('user1', { listingId: 'list1', qty: 5 })
      ).rejects.toThrow(InsufficientStockException);

      expect(mockEntityManager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE inventory_items'),
        [5, 5, 'inv1', 5]
      );
      
      // Should create OVERSELL_BLOCKED event
      expect(mockEntityManager.create).toHaveBeenCalledWith(InventoryEvent, expect.objectContaining({
        event_type: InventoryEventType.OVERSELL_BLOCKED,
        qty_delta: 5
      }));
    });

    it('should complete reservation and log event if stock is available', async () => {
      mockInventoryRepo.findOne.mockResolvedValueOnce({ id: 'inv1', total_qty: 10, available_qty: 10 } as InventoryItem);

      // Always return item on any em.findOne call (for post-update read)
      mockEntityManager.findOne.mockResolvedValue({ id: 'inv1', available_qty: 5, total_qty: 10 } as InventoryItem);

      mockEntityManager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('changes()')) return [{ changed: 1 }];
        if (sql.includes('SELECT')) return [{ id: 'inv1', available_qty: 5, total_qty: 10 }];
        // For UPDATE: return [[], 1] — matches PostgreSQL affectedRows format
        // This makes rowUpdated = true whether isSqlite() is true or false
        return [[], 1];
      });

      mockEntityManager.create.mockImplementation((entity: any, data: any) => data as any);
      mockEntityManager.save.mockImplementation(async (entityClass: any, data: any) => {
        if (entityClass === InventoryReservation) return { id: 'res1', ...(data as any) } as any;
        return data as any;
      });

      const res = await service.reserveStock('user1', { listingId: 'list1', qty: 5 });

      expect(res).toBeDefined();
      expect(res.id).toBe('res1');
      expect(res.qty).toBe(5);

      expect(mockEntityManager.create).toHaveBeenCalledWith(InventoryEvent, expect.objectContaining({
        event_type: InventoryEventType.RESERVED,
        qty_delta: -5,
      }));
    });
  });

  describe('releaseReservation', () => {
    it('should ignore and return same reservation if not in reserved state', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: 'res1',
        status: ReservationStatus.CONFIRMED,
        inventory_item_id: 'inv1',
        qty: 5,
        listing_id: 'list1'
      } as InventoryReservation);

      const res = await service.releaseReservation('res1', 'user1');
      
      expect(res.status).toBe(ReservationStatus.CONFIRMED);
      expect(mockEntityManager.query).not.toHaveBeenCalled();
    });

    it('should update stock, restore listing active status, and log RELEASED event', async () => {
      const mockRes = {
        id: 'res1',
        status: ReservationStatus.RESERVED,
        inventory_item_id: 'inv1',
        qty: 5,
        listing_id: 'list1'
      } as InventoryReservation;
      
      mockEntityManager.findOne
        .mockResolvedValueOnce(mockRes)
        .mockResolvedValueOnce({ id: 'inv1', available_qty: 5, total_qty: 10 } as InventoryItem);
      
      mockEntityManager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('changes()')) return [{ changed: 1 }];
        if (sql.includes('SELECT')) return [{ id: 'inv1', available_qty: 5, total_qty: 10 }];
        return [[], 1];  // UPDATE returns [rows, affectedCount] — valid for both modes
      });
      
      mockEntityManager.save.mockImplementation(async (_entityClass: any, data: any) => data as any);
      mockEntityManager.create.mockImplementation((_entityClass: any, data: any) => data as any);

      await service.releaseReservation('res1', 'user1');

      expect(mockRes.status).toBe(ReservationStatus.RELEASED);

      // Call 1: UPDATE inventory_items
      expect(mockEntityManager.query).toHaveBeenNthCalledWith(1,
        expect.stringContaining('UPDATE inventory_items'),
        [5, 5, 'inv1']
      );

      // Call 2: UPDATE listings (when available_qty > 0 restores ACTIVE)
      expect(mockEntityManager.query).toHaveBeenNthCalledWith(2,
        expect.stringContaining('UPDATE listings'),
        [ListingStatus.ACTIVE, 'list1', ListingStatus.SOLD_OUT]
      );

      expect(mockEntityManager.create).toHaveBeenCalledWith(InventoryEvent, expect.objectContaining({
        event_type: InventoryEventType.RESERVATION_RELEASED,
        qty_delta: 5,
      }));
    });
  });
});
