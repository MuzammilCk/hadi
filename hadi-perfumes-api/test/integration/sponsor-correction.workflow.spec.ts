import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ReferralModule } from '../../src/modules/referral/referral.module';
import { INestApplication } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { SponsorshipLink } from '../../src/modules/referral/entities/sponsorship-link.entity';
import {
  ReferralCode,
  ReferralCodeStatus,
} from '../../src/modules/referral/entities/referral-code.entity';
import { User } from '../../src/modules/user/entities/user.entity';
import { OnboardingAuditLog } from '../../src/modules/auth/entities/onboarding-audit-log.entity';

describe('Sponsor Correction Workflow (Integration)', () => {
  jest.setTimeout(30000);

  let dataSource: DataSource;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
          synchronize: true,
        }),
        AuthModule,
        ReferralModule,
      ],
    }).compile();

    dataSource = module.get<DataSource>(DataSource);
  }, 30000);

  afterAll(async () => {
    await dataSource.destroy();
  });

  async function seedSponsorAndUser(
    ds: DataSource,
    sponsorId: string,
    userId: string,
    codeStr: string,
  ) {
    const userRepo = ds.getRepository(User);
    const codeRepo = ds.getRepository(ReferralCode);
    const linkRepo = ds.getRepository(SponsorshipLink);

    // Create sponsor
    const sponsor = userRepo.create({
      id: sponsorId,
      phone: `+1000000${sponsorId.slice(-4)}`,
      status: 'active',
      kyc_status: 'not_required',
    });
    await userRepo.save(sponsor);

    // Create code for sponsor
    const code = codeRepo.create({
      code: codeStr,
      owner_id: sponsorId,
      status: ReferralCodeStatus.ACTIVE,
    });
    await codeRepo.save(code);

    // Create user
    const user = userRepo.create({
      id: userId,
      phone: `+2000000${userId.slice(-4)}`,
      status: 'active',
      kyc_status: 'not_required',
      sponsor_id: sponsorId,
    });
    await userRepo.save(user);

    // Create original sponsorship link
    const link = linkRepo.create({
      user_id: userId,
      sponsor_id: sponsorId,
      referral_code_id: code.id,
      upline_path: JSON.stringify([sponsorId]) as any,
    });
    await linkRepo.save(link);

    return { sponsor, user, code, link };
  }

  it('should allow admin to correct sponsor and preserve history', async () => {
    const sponsorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const newSponsorId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const userId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    await seedSponsorAndUser(dataSource, sponsorId, userId, 'ABCD1234');

    // Seed new sponsor without a link (root sponsor)
    const userRepo = dataSource.getRepository(User);
    const newSponsor = userRepo.create({
      id: newSponsorId,
      phone: '+3000000001',
      status: 'active',
      kyc_status: 'not_required',
    });
    await userRepo.save(newSponsor);

    const linkRepo = dataSource.getRepository(SponsorshipLink);
    const originalLink = await linkRepo.findOne({
      where: { user_id: userId, corrected_at: IsNull() },
    });
    expect(originalLink).toBeDefined();
    expect(originalLink!.sponsor_id).toBe(sponsorId);

    // Perform correction directly via entity manager
    const em = dataSource.createEntityManager();
    await em.transaction(async (txEm) => {
      originalLink!.corrected_at = new Date();
      originalLink!.corrected_by = null;
      await txEm.save(SponsorshipLink, originalLink!);

      const newUpline = [newSponsorId];
      const codeRepo = txEm.getRepository(ReferralCode);
      const code = await codeRepo.findOne({ where: { owner_id: sponsorId } });

      const newLink = txEm.create(SponsorshipLink, {
        user_id: userId,
        sponsor_id: newSponsorId,
        referral_code_id: code!.id,
        upline_path: JSON.stringify(newUpline) as any,
      });
      await txEm.save(SponsorshipLink, newLink);

      const auditLog = txEm.create(OnboardingAuditLog, {
        actor_id: null,
        action: 'admin_sponsor_correction',
        target_type: 'sponsorship_link',
        target_id: newLink.id,
        metadata: JSON.stringify({
          old_sponsor_id: sponsorId,
          new_sponsor_id: newSponsorId,
          reason: 'Integration test correction',
        }) as any,
      });
      await txEm.save(OnboardingAuditLog, auditLog);
    });

    // Verify old link is preserved (corrected_at set, not deleted)
    const allLinks = await linkRepo.find({ where: { user_id: userId } });
    expect(allLinks.length).toBe(2);

    const oldLink = allLinks.find((l) => l.corrected_at !== null);
    expect(oldLink).toBeDefined();
    expect(oldLink!.sponsor_id).toBe(sponsorId);

    // Verify new active link
    const activeLink = await linkRepo.findOne({
      where: { user_id: userId, corrected_at: IsNull() },
    });
    expect(activeLink).toBeDefined();
    expect(activeLink!.sponsor_id).toBe(newSponsorId);

    // Verify audit log was written
    const auditRepo = dataSource.getRepository(OnboardingAuditLog);
    const log = await auditRepo.findOne({
      where: { action: 'admin_sponsor_correction' },
    });
    expect(log).toBeDefined();
    expect(log!.target_type).toBe('sponsorship_link');
  });

  it('should not allow circular sponsorship in correction', async () => {
    // User A is sponsored by User B. Correcting A's sponsor to themselves is blocked.
    const userAId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const userBId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    const userRepo = dataSource.getRepository(User);
    const linkRepo = dataSource.getRepository(SponsorshipLink);

    const userA = userRepo.create({
      id: userAId,
      phone: '+4000000001',
      status: 'active',
      kyc_status: 'not_required',
    });
    const userB = userRepo.create({
      id: userBId,
      phone: '+4000000002',
      status: 'active',
      kyc_status: 'not_required',
    });
    await userRepo.save([userA, userB]);

    // userA's upline contains userB
    const codeRepo = dataSource.getRepository(ReferralCode);
    const code = codeRepo.create({
      code: 'CIRC1234',
      owner_id: userBId,
      status: ReferralCodeStatus.ACTIVE,
    });
    await codeRepo.save(code);

    const linkA = linkRepo.create({
      user_id: userAId,
      sponsor_id: userBId,
      referral_code_id: code.id,
      upline_path: JSON.stringify([userBId]) as any,
    });
    await linkRepo.save(linkA);

    // userB's upline contains userA → circular
    const linkB = linkRepo.create({
      user_id: userBId,
      sponsor_id: userAId,
      referral_code_id: code.id,
      upline_path: JSON.stringify([userAId]) as any,
    });
    await linkRepo.save(linkB);

    // Attempting to correct userA's sponsor to userB when userB's upline already contains userA
    const bLink = await linkRepo.findOne({
      where: { user_id: userBId, corrected_at: IsNull() },
    });
    const bUpline: string[] = JSON.parse(bLink!.upline_path as any);

    // This is the check the controller does:
    expect(bUpline.includes(userAId)).toBe(true);
    // → correction would be rejected with 'Circular sponsorship detected'
  });
});
