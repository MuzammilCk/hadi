jest.setTimeout(30000);

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';

// Entities
import { User, UserRole } from '../../src/modules/user/entities/user.entity';
import { AuditLog } from '../../src/modules/audit/entities/audit-log.entity';
import { MediaAsset } from '../../src/modules/media/entities/media-asset.entity';
import { HomepageSection } from '../../src/modules/homepage/entities/homepage-section.entity';

// Services
import { AuditService } from '../../src/modules/audit/services/audit.service';
import { HomepageService } from '../../src/modules/homepage/services/homepage.service';
import { MediaService } from '../../src/modules/media/services/media.service';

// Guards & decorators
import { RolesGuard } from '../../src/modules/auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';

describe('Phase 9: RBAC + Audit + Homepage (Integration)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let auditService: AuditService;
  let homepageService: HomepageService;
  let userRepo: Repository<User>;
  let auditRepo: Repository<AuditLog>;
  let sectionRepo: Repository<HomepageSection>;

  let adminUser: User;
  let customerUser: User;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          entities: [User, AuditLog, MediaAsset, HomepageSection],
        }),
        TypeOrmModule.forFeature([User, AuditLog, MediaAsset, HomepageSection]),
      ],
      providers: [AuditService, HomepageService, MediaService, Reflector],
    }).compile();

    dataSource = module.get(DataSource);
    auditService = module.get(AuditService);
    homepageService = module.get(HomepageService);
    userRepo = dataSource.getRepository(User);
    auditRepo = dataSource.getRepository(AuditLog);
    sectionRepo = dataSource.getRepository(HomepageSection);

    // Create admin user
    adminUser = await userRepo.save(
      userRepo.create({
        phone: '+910000000001',
        status: 'active',
        role: UserRole.ADMIN,
        full_name: 'Test Admin',
        password_hash: await bcrypt.hash('admin123', 12),
      }),
    );

    // Create customer user
    customerUser = await userRepo.save(
      userRepo.create({
        phone: '+910000000002',
        status: 'active',
        role: UserRole.CUSTOMER,
        full_name: 'Test Customer',
      }),
    );
  }, 30000);

  afterAll(async () => {
    await module?.close();
  });

  // ========== RBAC Tests ==========

  describe('RolesGuard', () => {
    let guard: RolesGuard;
    let reflector: Reflector;

    beforeEach(() => {
      reflector = module.get(Reflector);
      guard = new RolesGuard(reflector);
    });

    it('should allow access when no roles are required', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { sub: adminUser.id, role: 'customer' } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      // When no @Roles() metadata, reflector returns undefined
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should allow access for matching role', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { sub: adminUser.id, role: UserRole.ADMIN } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN]);
      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should deny access for non-matching role (403)', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { sub: customerUser.id, role: UserRole.CUSTOMER },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN]);
      expect(() => guard.canActivate(mockContext)).toThrow('Insufficient permissions');
    });

    it('should deny access when no user on request', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN]);
      expect(() => guard.canActivate(mockContext)).toThrow('Insufficient permissions');
    });
  });

  // ========== Audit Tests ==========

  describe('AuditService', () => {
    it('should insert audit log entry', async () => {
      await auditService.log({
        actor_id: adminUser.id,
        action: 'PRODUCT_PRICE_CHANGE',
        entity_type: 'listing',
        entity_id: uuidv4(),
        before_snapshot: { price: 100 },
        after_snapshot: { price: 150 },
      });

      const logs = await auditRepo.find();
      expect(logs.length).toBeGreaterThanOrEqual(1);
      const last = logs[logs.length - 1];
      expect(last.action).toBe('PRODUCT_PRICE_CHANGE');
      expect(last.actor_id).toBe(adminUser.id);
    });

    it('should never throw even on invalid data', async () => {
      // Pass null actor_id (valid), but test resilience
      await expect(
        auditService.log({
          actor_id: null,
          action: 'SYSTEM_ACTION',
          entity_type: 'system',
          entity_id: 'test',
        }),
      ).resolves.not.toThrow();
    });

    it('should paginate audit logs', async () => {
      // Insert multiple
      for (let i = 0; i < 5; i++) {
        await auditService.log({
          actor_id: adminUser.id,
          action: 'BATCH_TEST',
          entity_type: 'test',
          entity_id: `item-${i}`,
        });
      }

      const result = await auditService.findLogs({
        entity_type: 'test',
        page: 1,
        limit: 3,
      });

      expect(result.data.length).toBeLessThanOrEqual(3);
      expect(result.total).toBeGreaterThanOrEqual(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(3);
    });
  });

  // ========== Homepage Tests ==========

  describe('HomepageService', () => {
    it('should upsert a new section', async () => {
      const section = await homepageService.upsertSection(
        'hero',
        {
          content: { title: 'Welcome', subtitle: 'To Hadi Perfumes' },
          is_active: true,
          sort_order: 0,
        },
        adminUser.id,
      );

      expect(section.section_key).toBe('hero');
      expect(section.content).toEqual({ title: 'Welcome', subtitle: 'To Hadi Perfumes' });
      expect(section.is_active).toBe(true);

      // Verify audit log was written
      const logs = await auditRepo.find({
        where: { entity_type: 'homepage_section' },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    it('should update existing section', async () => {
      const updated = await homepageService.upsertSection(
        'hero',
        {
          content: { title: 'Updated', subtitle: 'New Text' },
        },
        adminUser.id,
      );

      expect(updated.content).toEqual({ title: 'Updated', subtitle: 'New Text' });
    });

    it('should return only active sections for public', async () => {
      // Add inactive section
      await homepageService.upsertSection(
        'hidden_section',
        {
          content: { title: 'Hidden' },
          is_active: false,
          sort_order: 99,
        },
        adminUser.id,
      );

      const publicSections = await homepageService.getPublicSections();
      const hidden = publicSections.find(
        (s: any) => s.section_key === 'hidden_section',
      );
      expect(hidden).toBeUndefined();
    });

    it('should return all sections for admin', async () => {
      const allSections = await homepageService.getAllSections();
      const hidden = allSections.find((s) => s.section_key === 'hidden_section');
      expect(hidden).toBeDefined();
      expect(hidden!.is_active).toBe(false);
    });
  });

  // ========== User Role Tests ==========

  describe('User Role Field', () => {
    it('should default to customer role', async () => {
      const user = await userRepo.save(
        userRepo.create({
          phone: '+910000000003',
          status: 'active',
        }),
      );
      expect(user.role).toBe(UserRole.CUSTOMER);
    });

    it('should persist admin role', async () => {
      const found = await userRepo.findOne({ where: { id: adminUser.id } });
      expect(found!.role).toBe(UserRole.ADMIN);
    });
  });
});
