import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ListingService } from '../../../src/modules/listing/services/listing.service';
import {
  Listing,
  ListingStatus,
  AuthenticityStatus,
  ListingCondition,
} from '../../../src/modules/listing/entities/listing.entity';
import { ListingImage } from '../../../src/modules/listing/entities/listing-image.entity';
import {
  ListingStatusHistory,
  ActorType,
} from '../../../src/modules/listing/entities/listing-status-history.entity';
import { ListingModerationAction } from '../../../src/modules/listing/entities/listing-moderation-action.entity';
import { InventoryItem } from '../../../src/modules/inventory/entities/inventory-item.entity';
import {
  SkuAlreadyExistsException,
  ListingNotFoundException,
  ListingStateTransitionException,
} from '../../../src/modules/listing/exceptions/listing.exceptions';

describe('ListingService', () => {
  let service: ListingService;
  let mockEntityManager: jest.Mocked<EntityManager>;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    mockEntityManager = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      merge: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<EntityManager>;

    mockDataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (cb) => cb(mockEntityManager)),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingService,
        {
          provide: getRepositoryToken(Listing),
          useValue: {
            createQueryBuilder: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<ListingService>(ListingService);
  });

  describe('createListing', () => {
    it('should throw SkuAlreadyExistsException if sku is duplicate', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: 'exists',
      } as Listing);

      await expect(
        service.createListing('admin123', {
          title: 'Test',
          sku: 'DUPE',
          price: 100,
          currency: 'INR',
          quantity: 5,
          condition: ListingCondition.NEW,
        }),
      ).rejects.toThrow(SkuAlreadyExistsException);
    });

    it('should create listing, inventory item, and history if sku is unique', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce(null); // No dupe sku

      const savedListing = {
        id: 'list1',
        status: ListingStatus.DRAFT,
        sku: 'UNIQUE',
      } as Listing;

      // Mocks for create
      mockEntityManager.create.mockImplementation(
        (entityClass, partial: any) => partial,
      );
      mockEntityManager.save.mockImplementation(async (entityClass, entity) => {
        if (entityClass === Listing) return savedListing;
        return entity;
      });

      const res = await service.createListing('admin123', {
        title: 'Test Perfume',
        sku: 'UNIQUE',
        price: 99.99,
        currency: 'INR',
        quantity: 10,
        condition: ListingCondition.NEW,
      });

      expect(res.id).toBe('list1');
      expect(mockEntityManager.save).toHaveBeenCalledTimes(3); // Listing, InventoryItem, ListingStatusHistory

      // Inventory item creation logic validation
      expect(mockEntityManager.create).toHaveBeenCalledWith(
        InventoryItem,
        expect.objectContaining({
          total_qty: 10,
          available_qty: 10,
          listing_id: 'list1',
        }),
      );
    });
  });

  describe('moderateListing', () => {
    it('should throw if invalid transition', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: 'list1',
        status: ListingStatus.REMOVED,
      } as Listing);

      await expect(
        service.moderateListing('list1', 'admin123', 'approve' as any, {
          reason: 'Test',
        }),
      ).rejects.toThrow(ListingStateTransitionException);
    });
  });
});
