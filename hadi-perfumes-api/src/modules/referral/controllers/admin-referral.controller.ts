import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, IsNull } from 'typeorm';
import { SponsorshipLink } from '../entities/sponsorship-link.entity';
import { OnboardingAuditLog } from '../../auth/entities/onboarding-audit-log.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../user/entities/user.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/referrals')
export class AdminReferralController {
  constructor(
    @InjectEntityManager()
    private entityManager: EntityManager,
  ) {}

  // STATIC ROUTES FIRST — must come before :userId dynamic route
  @Get('onboarding-attempts')
  async getOnboardingAttempts() {
    return this.entityManager
      .createQueryBuilder()
      .select('*')
      .from('onboarding_attempts', 'oa')
      .getRawMany();
  }

  @Get('codes/:code')
  async getReferralCode(@Param('code') code: string) {
    return this.entityManager
      .createQueryBuilder()
      .select('*')
      .from('referral_codes', 'rc')
      .where('rc.code = :code', { code })
      .getRawOne();
  }

  // DYNAMIC ROUTE — must come after all static routes
  @Get(':userId')
  async getReferral(@Param('userId') userId: string) {
    return this.entityManager.findOne(SponsorshipLink, {
      where: { user_id: userId, corrected_at: IsNull() },
    });
  }

  @Post(':userId/correct')
  async correctSponsor(
    @Param('userId') userId: string,
    @Body('new_sponsor_id') newSponsorId: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        'Reason must be at least 10 characters long',
      );
    }

    if (!newSponsorId || newSponsorId === userId) {
      throw new BadRequestException('Invalid new sponsor id');
    }

    return this.entityManager.transaction(async (em) => {
      const currentLink = await em.findOne(SponsorshipLink, {
        where: { user_id: userId, corrected_at: IsNull() },
      });

      if (!currentLink) {
        throw new BadRequestException('Sponsorship link not found for user');
      }

      const newSponsorLink = await em.findOne(SponsorshipLink, {
        where: { user_id: newSponsorId, corrected_at: IsNull() },
      });

      let parentUplinePath: string[] = [];
      if (newSponsorLink) {
        const upline: string[] =
          typeof newSponsorLink.upline_path === 'string'
            ? JSON.parse(newSponsorLink.upline_path)
            : newSponsorLink.upline_path;

        if (upline.includes(userId)) {
          throw new BadRequestException('Circular sponsorship detected');
        }
        parentUplinePath = upline;
      }

      // Mark old link as corrected — preserve history, never delete
      const adminActorId = req.adminActorId || null;
      currentLink.corrected_at = new Date();
      currentLink.corrected_by = adminActorId;
      await em.save(SponsorshipLink, currentLink);

      // Create new active link
      const newUplinePath = [newSponsorId, ...parentUplinePath];
      const newLink = em.create(SponsorshipLink, {
        user_id: userId,
        sponsor_id: newSponsorId,
        referral_code_id: currentLink.referral_code_id,
        upline_path:
          process.env.NODE_ENV === 'test'
            ? (JSON.stringify(newUplinePath) as any)
            : newUplinePath,
      });
      await em.save(SponsorshipLink, newLink);

      // Fix B6: Sync users.sponsor_id to match the corrected sponsorship link.
      // Without this, the denormalized sponsor_id on the user row drifts from
      // the canonical SponsorshipLink, causing inconsistent reads downstream.
      await em.query(
        `UPDATE users SET sponsor_id = $1, updated_at = NOW() WHERE id = $2`,
        [newSponsorId, userId],
      );

      // Audit log — actor_id set from AdminGuard context
      const auditLog = em.create(OnboardingAuditLog, {
        actor_id: adminActorId,
        action: 'admin_sponsor_correction',
        target_type: 'sponsorship_link',
        target_id: newLink.id,
        metadata:
          process.env.NODE_ENV === 'test'
            ? (JSON.stringify({
                old_sponsor_id: currentLink.sponsor_id,
                new_sponsor_id: newSponsorId,
                reason,
              }) as any)
            : {
                old_sponsor_id: currentLink.sponsor_id,
                new_sponsor_id: newSponsorId,
                reason,
              },
      });
      await em.save(OnboardingAuditLog, auditLog);

      return {
        success: true,
        new_sponsorship: {
          id: newLink.id,
          user_id: newLink.user_id,
          sponsor_id: newLink.sponsor_id,
          upline_path: newUplinePath,
        },
      };
    });
  }
}
