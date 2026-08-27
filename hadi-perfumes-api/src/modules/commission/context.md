# context.md — Commission Module

**Scope statement**: This module handles commission event calculation and lifecycle. It consumes `MoneyEventOutbox` events from Phase 5 and produces `commission_events` that feed the ledger module. It does NOT mutate wallets, ledger entries, or payout records directly.

**Phase dependencies**:
- Reads `MoneyEventOutbox` (`published=false`, `event_type='order.paid'`) from Phase 5
- Reads active `CompensationPolicyVersion` + its `CommissionRule` records from Phase 1 (already in this module)
- Reads `NetworkNode.upline_path` from Phase 3 to traverse upline for commission distribution
- Reads `QualificationState` from Phase 3 to verify upline participants are active/qualified at commission calculation time
- Never touches Phase 4 inventory tables
- Never touches Phase 2 auth/referral tables directly

**Commission event lifecycle**:
```
created → pending → available → paid
                 ↘
                  clawback (on order.refunded / order.chargeback)
```
- `created`: commission record row written, not yet visible to participant
- `pending`: commission is held during `payout_delay_days` window (from CommissionRule)
- `available`: hold window cleared, commission is eligible for payout request
- `paid`: payout has been executed and this commission record is settled
- `clawback`: a reversal commission_event that offsets a prior pending/available entry

**Planned data model**:
```
commission_events
  id uuid PK
  idempotency_key varchar(255) UNIQUE  ← prevents duplicate commission on retry
  order_id uuid (FK orders)
  buyer_id uuid (FK users)            ← the customer who placed the order
  beneficiary_id uuid (FK users)      ← the upline participant earning commission
  policy_version_id uuid (FK compensation_policy_versions)
  commission_rule_id uuid (FK commission_rules)
  upline_depth integer                ← depth level in upline (1 = direct sponsor, 2 = grandparent, etc.)
  order_total_amount numeric(12,2)
  commission_amount numeric(12,2)
  status varchar(50) DEFAULT 'pending'
  source_event_type varchar(50)       ← 'order.paid' | 'order.refunded' | 'order.chargeback'
  source_outbox_id uuid               ← FK to money_event_outbox.id
  clawback_for_id uuid nullable       ← FK to commission_events.id (for clawback entries)
  hold_until timestamptz              ← calculated as paid_at + payout_delay_days
  released_at timestamptz nullable
  created_at timestamptz NOT NULL DEFAULT now()
  updated_at timestamptz NOT NULL DEFAULT now()
```

**Idempotency requirement**: Every commission event must have an `idempotency_key` derived deterministically from `order_id + beneficiary_id + policy_version_id + upline_depth`. Processing the same outbox event twice must produce zero duplicate commission events.

**FTC compliance exclusions**:
- No commission on user signup or referral code redemption alone
- No commission on self-purchases (buyer_id === beneficiary_id is blocked)
- No commission on unverified/unqualified upline participants
- No commission from orders in refunded/chargeback/disputed final state
- Commission only from verified paid retail sales via `order.paid` outbox events

**Rule version binding**: The `policy_version_id` at the time the `order.paid` event fires is the version used. It must be fetched at calculation time and stored immutably on the commission_event row. It must NOT be re-evaluated if the active policy changes later.
