import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import {
  ReferralCode,
  ReferralCodeStatus,
} from '../entities/referral-code.entity';
import { ReferralRedemption } from '../entities/referral-redemption.entity';
import { SponsorshipLink } from '../entities/sponsorship-link.entity';
import {
  ReferralErrorCode,
  ReferralValidationException,
} from '../exceptions/referral-validation.exception';

@Injectable()
export class ReferralValidationService {
  constructor(
    @InjectRepository(ReferralCode)
    private codeRepo: Repository<ReferralCode>,
    @InjectRepository(ReferralRedemption)
    private redemptionRepo: Repository<ReferralRedemption>,
    @InjectRepository(SponsorshipLink)
    private linkRepo: Repository<SponsorshipLink>,
  ) {}

  async validateAndRedeem(
    codeStr: string,
    newUserId: string,
    ipAddress?: string,
    deviceHash?: string,
    transactionalEntityManager?: EntityManager,
  ): Promise<{
    referralCode: ReferralCode;
    sponsorId: string;
    uplinePath: string[];
  }> {
    if (!codeStr) {
      throw new ReferralValidationException(
        ReferralErrorCode.MISSING_CODE,
        'Referral code is missing',
      );
    }

    if (!/^[A-Z0-9]{8}$/.test(codeStr)) {
      throw new ReferralValidationException(
        ReferralErrorCode.INVALID_CODE_FORMAT,
        'Invalid code format',
      );
    }

    const em = transactionalEntityManager || this.codeRepo.manager;

    // Retrieve code with pessimistic read if transactional
    const codeQuery = em
      .createQueryBuilder(ReferralCode, 'rc')
      .where('rc.code = :code', { code: codeStr });

    if (transactionalEntityManager && process.env.NODE_ENV !== 'test') {
      codeQuery.setLock('pessimistic_read');
    }

    const code = await codeQuery.getOne();

    if (!code) {
      throw new ReferralValidationException(
        ReferralErrorCode.CODE_NOT_FOUND,
        'Referral code not found',
      );
    }

    if (code.status === ReferralCodeStatus.DISABLED) {
      throw new ReferralValidationException(
        ReferralErrorCode.CODE_DISABLED,
        'Referral code is disabled',
      );
    }

    if (
      code.status === ReferralCodeStatus.EXHAUSTED ||
      (code.max_uses !== null && code.uses_count >= code.max_uses)
    ) {
      throw new ReferralValidationException(
        ReferralErrorCode.CODE_EXHAUSTED,
        'Referral code usage limit reached',
      );
    }

    if (code.expires_at && code.expires_at < new Date()) {
      throw new ReferralValidationException(
        ReferralErrorCode.CODE_EXPIRED,
        'Referral code has expired',
      );
    }

    if (code.owner_id === newUserId) {
      throw new ReferralValidationException(
        ReferralErrorCode.SELF_REFERRAL,
        'Cannot refer yourself',
      );
    }

    // Check duplicate redemption
    const previousRedemption = await em.findOne(ReferralRedemption, {
      where: { redeemed_by_user_id: newUserId, code_id: code.id },
    });
    if (previousRedemption) {
      throw new ReferralValidationException(
        ReferralErrorCode.DUPLICATE_REDEMPTION,
        'Referral code already redeemed by this user',
      );
    }

    // Check circular sponsorship
    const sponsorId = code.owner_id;
    const sponsorLinkQuery = em
      .createQueryBuilder(SponsorshipLink, 'sl')
      .where('sl.user_id = :sponsorId', { sponsorId })
      .andWhere('sl.corrected_at IS NULL');

    if (transactionalEntityManager && process.env.NODE_ENV !== 'test') {
      sponsorLinkQuery.setLock('pessimistic_read');
    }

    const sponsorLink = await sponsorLinkQuery.getOne();
    let parentUplinePath: string[] = [];

    if (sponsorLink) {
      // Circular check
      const currentUpline: string[] =
        typeof sponsorLink.upline_path === 'string'
          ? JSON.parse(sponsorLink.upline_path)
          : sponsorLink.upline_path;

      if (currentUpline.includes(newUserId) || sponsorId === newUserId) {
        throw new ReferralValidationException(
          ReferralErrorCode.CIRCULAR_SPONSORSHIP,
          'Circular sponsorship detected',
        );
      }
      parentUplinePath = currentUpline;
    }

    const newUplinePath = [sponsorId, ...parentUplinePath];

    // If we're inside the transaction, proceed to create the redemption
    // Otherwise just validate
    if (transactionalEntityManager) {
      code.uses_count += 1;
      if (code.max_uses !== null && code.uses_count >= code.max_uses) {
        code.status = ReferralCodeStatus.EXHAUSTED;
      }
      await em.save(ReferralCode, code);

      const redemption = em.create(ReferralRedemption, {
        code_id: code.id,
        redeemed_by_user_id: newUserId,
        sponsor_id: sponsorId,
        ip_address: ipAddress,
        device_hash: deviceHash,
      });
      await em.save(ReferralRedemption, redemption);
    }

    return { referralCode: code, sponsorId, uplinePath: newUplinePath };
  }
}
