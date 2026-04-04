# CLAUDE.md — Payout Module Agent Contract

**Preamble**: Payout logic directly affects participant earnings disbursement. All actions must be auditable and idempotent. Read root `CLAUDE.md`, `context.md`, and `diff.md` before any work.

**Before every task in this module**:
1. Read root `claude.md`
2. Read root `context.md`
3. Read root `diff.md`
4. Read this file (`src/modules/payout/CLAUDE.md`)
5. Read `src/modules/payout/context.md`
6. Read `src/modules/ledger/context.md` (payout writes to ledger)

**Module Integration Map**:
Reads from:  ledger_entries (ledger module) for balance derivation
Writes to:   payout_requests (self), payout_batches (self), ledger_entries via LedgerService
Must NOT write to: commission_events, wallet columns directly

**Working rules**:
- ALWAYS check `available_balance >= requested_amount` before writing a payout_request
- ALWAYS check `requested_amount >= minimum_threshold` (read from config, not hardcoded)
- ALWAYS write a `payout_requested` ledger entry atomically with the payout_request status change
- ALWAYS write an audit log entry for every payout state transition
- Payout operations must be idempotent — same `idempotency_key` returns existing record
- Admin approval must record `reviewed_by` actor from `AdminGuard.req.adminActorId`
- Failed payouts must restore balance via `refund_reversal` ledger entry in the same transaction

**What you must never do**:
- ❌ Allow payout when `available_balance < requested_amount`
- ❌ Mutate wallet balance directly (no wallet column exists — it is derived from ledger)
- ❌ Create a payout without a corresponding ledger debit entry
- ❌ Execute a bank transfer call in this phase — payout execution is Phase 7/8
- ❌ Hardcode minimum payout thresholds — read from config/env
- ❌ Allow participant to create a payout request without JWT authentication
- ❌ Allow admin approval without `AdminGuard` protection and audit log

**Financial invariants**:
- `available_balance` after payout_requested ledger entry = `available_balance_before - requested_amount`
- Two payout_requests with the same `idempotency_key` must never exist
- A payout_request cannot move to `approved` if `available_balance < amount` at approval time
- Every payout_request in `approved` or later status must have a `ledger_entry_id` pointing to a `payout_requested` ledger entry
