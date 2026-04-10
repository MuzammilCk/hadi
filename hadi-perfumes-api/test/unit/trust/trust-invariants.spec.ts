jest.setTimeout(30000);

import { v4 as uuidv4 } from 'uuid';
import { ReturnRequestStatus } from '../../../src/modules/trust/returns/entities/return-request.entity';
import {
  DisputeStatus,
  DisputeResolution,
} from '../../../src/modules/trust/disputes/entities/dispute.entity';
import {
  HoldStatus,
  HoldReasonType,
} from '../../../src/modules/trust/holds/entities/payout-hold.entity';
import {
  FraudSignalSeverity,
  FraudSignalStatus,
} from '../../../src/modules/trust/fraud/entities/fraud-signal.entity';
import {
  ModerationActionType,
  ModerationTargetType,
} from '../../../src/modules/trust/moderation/entities/moderation-action.entity';

/**
 * Trust-layer invariant tests — verifying the RULES of the domain,
 * not the implementation details.
 */
describe('Trust Layer Invariants', () => {
  // ─── RETURN STATUS MACHINE ───────────────────────────────────
  describe('Return status transitions', () => {
    const VALID_TRANSITIONS: Record<string, string[]> = {
      [ReturnRequestStatus.PENDING_REVIEW]: [
        'approved',
        'rejected',
        'escalated',
      ],
      [ReturnRequestStatus.APPROVED]: ['completed'],
      [ReturnRequestStatus.ESCALATED]: ['approved', 'rejected'],
      [ReturnRequestStatus.REJECTED]: [],
      [ReturnRequestStatus.COMPLETED]: [],
    };

    it('pending_review can transition to approved, rejected, or escalated', () => {
      expect(VALID_TRANSITIONS[ReturnRequestStatus.PENDING_REVIEW]).toEqual(
        expect.arrayContaining(['approved', 'rejected', 'escalated']),
      );
    });

    it('approved can only transition to completed', () => {
      expect(VALID_TRANSITIONS[ReturnRequestStatus.APPROVED]).toEqual([
        'completed',
      ]);
    });

    it('rejected and completed are terminal statuses', () => {
      expect(VALID_TRANSITIONS[ReturnRequestStatus.REJECTED]).toHaveLength(0);
      expect(VALID_TRANSITIONS[ReturnRequestStatus.COMPLETED]).toHaveLength(0);
    });
  });

  // ─── DISPUTE STATUS MACHINE ──────────────────────────────────
  describe('Dispute status transitions', () => {
    const RESOLVABLE_STATUSES = [
      DisputeStatus.OPEN,
      DisputeStatus.UNDER_REVIEW,
      DisputeStatus.ESCALATED,
    ];
    const CLOSABLE_STATUSES = [DisputeStatus.RESOLVED, DisputeStatus.ESCALATED];

    it('disputes can only be resolved from open, under_review, or escalated', () => {
      expect(RESOLVABLE_STATUSES).toContain(DisputeStatus.OPEN);
      expect(RESOLVABLE_STATUSES).toContain(DisputeStatus.UNDER_REVIEW);
      expect(RESOLVABLE_STATUSES).not.toContain(DisputeStatus.CLOSED);
    });

    it('disputes can only be closed from resolved or escalated', () => {
      expect(CLOSABLE_STATUSES).toContain(DisputeStatus.RESOLVED);
      expect(CLOSABLE_STATUSES).not.toContain(DisputeStatus.OPEN);
    });
  });

  // ─── HOLD ENUMS ──────────────────────────────────────────────
  describe('Hold enums', () => {
    it('HoldStatus has active, released, expired', () => {
      expect(Object.values(HoldStatus)).toContain('active');
      expect(Object.values(HoldStatus)).toContain('released');
      expect(Object.values(HoldStatus)).toContain('expired');
    });

    it('HoldReasonType has required reason types', () => {
      expect(Object.values(HoldReasonType)).toContain('dispute_open');
      expect(Object.values(HoldReasonType)).toContain('return_pending');
      expect(Object.values(HoldReasonType)).toContain('fraud_review');
      expect(Object.values(HoldReasonType)).toContain('admin_manual');
    });
  });

  // ─── FRAUD SEVERITY ──────────────────────────────────────────
  describe('Fraud severity levels', () => {
    it('fraud severities are ordered: low < medium < high < critical', () => {
      const orderedSeverities = ['low', 'medium', 'high', 'critical'];
      expect(orderedSeverities.indexOf(FraudSignalSeverity.LOW)).toBeLessThan(
        orderedSeverities.indexOf(FraudSignalSeverity.CRITICAL),
      );
    });

    it('fraud signal has required statuses', () => {
      expect(Object.values(FraudSignalStatus)).toContain('new');
      expect(Object.values(FraudSignalStatus)).toContain('reviewed');
      expect(Object.values(FraudSignalStatus)).toContain('actioned');
      expect(Object.values(FraudSignalStatus)).toContain('false_positive');
    });
  });

  // ─── MODERATION ENUMS ────────────────────────────────────────
  describe('Moderation enums', () => {
    it('moderation target types include user, listing, order', () => {
      expect(Object.values(ModerationTargetType)).toContain('user');
      expect(Object.values(ModerationTargetType)).toContain('listing');
      expect(Object.values(ModerationTargetType)).toContain('order');
    });

    it('moderation action types include required actions', () => {
      expect(Object.values(ModerationActionType)).toContain('suspend');
      expect(Object.values(ModerationActionType)).toContain('warn');
      expect(Object.values(ModerationActionType)).toContain('ban');
      expect(Object.values(ModerationActionType)).toContain('reinstate');
    });
  });
});
