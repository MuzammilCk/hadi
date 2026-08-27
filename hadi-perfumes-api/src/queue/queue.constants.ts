/**
 * Queue name constants — extracted to a standalone file to avoid circular
 * dependency between queue.module.ts and the processor files that import
 * from it.  Both queue.module.ts and every processor import this file instead.
 */
export const QUEUE_NAMES = {
  COMMISSION_OUTBOX: 'commission-outbox',
  COMMISSION_RELEASE: 'commission-release',
  RESERVATION_EXPIRY: 'reservation-expiry',
  DISPUTE_ESCALATION: 'dispute-escalation',
  FRAUD_AGGREGATION: 'fraud-aggregation',
  HOLD_PROPAGATION: 'hold-propagation',
  RETURN_ELIGIBILITY: 'return-eligibility',
  QUALIFICATION_RECALC: 'qualification-recalc',
};
