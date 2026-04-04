# CLAUDE.md — Commission Module Agent Contract

**Preamble**: This is a financial-critical module. Errors here directly affect participant earnings and FTC compliance. Read root `CLAUDE.md`, `context.md`, and `diff.md` before any work.

**Before every task in this module**:
1. Read root `claude.md`
2. Read root `context.md`
3. Read root `diff.md`
4. Read this file (`src/modules/commission/CLAUDE.md`)
5. Read `src/modules/commission/context.md`
6. Confirm the active `CompensationPolicyVersion` status is `active` before calculating

**Module Integration Map**:
Reads from:  MoneyEventOutbox (order module), CompensationPolicyVersion (self/Phase1),
             CommissionRule (self/Phase1), NetworkNode (network module),
             QualificationState (network module), Order (order module)
Writes to:   commission_events (self), money_event_outbox.published=true (order module)
Must NOT write to: ledger_entries, payout_requests, wallet columns


**Working rules for Phase 6**:
- Commission calculation service must be stateless and deterministic — same inputs always produce the same output
- Must consume `MoneyEventOutbox` rows, not raw order events
- Must verify `order.status === 'paid'` via Order entity before writing commission
- Must verify upline participant's `QualificationState.is_active === true` before awarding commission at their depth
- Must write `commission_events` transactionally with the `money_event_outbox.published = true` update — never separately
- Must use the `idempotency_key` uniqueness constraint to safely retry failed commission jobs
- Must write an audit record for every commission event batch processing run

**What you must never do in this module**:
- ❌ Write to `ledger_entries` directly — the ledger module does that, triggered by commission events
- ❌ Write to `payout_requests` or `payout_batches` directly
- ❌ Read or mutate `wallet` balance fields (there are none — wallet is derived from ledger)
- ❌ Hardcode commission percentages — always read from `CommissionRule.percentage`
- ❌ Hardcode hold window days — always read from `CommissionRule.payout_delay_days`
- ❌ Hardcode clawback window days — always read from `CommissionRule.clawback_window_days`
- ❌ Award commission to an inactive/unqualified participant
- ❌ Award commission based on signup, recruitment, or rank upgrades alone
- ❌ Process the same `money_event_outbox` row twice (idempotency_key constraint must catch this)
- ❌ Modify any Phase 1, 2, 3, 4, or 5 entity or service

**Financial-critical invariants**:
- For a single `order.paid` event, the sum of all `commission_amount` values across all upline levels must never exceed `CommissionRule.cap_per_order` (if set)
- `commission_amount = order_total_amount × CommissionRule.percentage` rounded to 2dp
- `hold_until = paid_at + CommissionRule.payout_delay_days` (calendar days, UTC)
- A clawback commission_event must have a negative amount and reference the original via `clawback_for_id`
- No beneficiary can have two active (non-clawbacked) commission_events for the same order at the same upline_depth

**Build order for Phase 6 implementation**:
1. Migration (`1711600000000-Phase6CommissionLedgerInit.ts`)
2. Entities (`CommissionEvent`)
3. Exceptions
4. DTOs
5. `CommissionCalculationService` (core business logic)
6. `CommissionProcessingJob` (outbox consumer)
7. Controllers (admin read-only endpoints only)
8. Module wiring
9. Tests
10. Update all diff.md files (root + this module)

**Module is financial-critical**: Any change to commission calculation logic requires a test proving the change is deterministic and idempotent.
