# CLAUDE.md — Ledger Module Agent Contract

**Preamble**: The ledger is the financial backbone of the participant wallet system. Every balance mutation must go through a ledger entry. Read root `CLAUDE.md`, `context.md`, and `diff.md` before any work.

**Before every task in this module**:
1. Read root `claude.md`
2. Read root `context.md`
3. Read root `diff.md`
4. Read this file (`src/modules/ledger/CLAUDE.md`)
5. Read `src/modules/ledger/context.md`
6. Read `src/modules/commission/context.md` (ledger depends on commission events)

**Module Integration Map**:
Reads from:  commission_events (commission module), payout_requests (payout module)
Writes to:   ledger_entries (self)
Must NOT write to: commission_events, payout_requests, wallet columns

**Working rules**:
- NEVER mutate an existing ledger entry — append only
- NEVER store a balance directly — derive from ledger entries on read
- Every ledger entry MUST have a `reference_id` pointing to the source record
- Every ledger entry MUST have a `user_id`
- Every ledger entry MUST have an `idempotency_key` — derived deterministically from the source record ID + entry_type
- Money must be `NUMERIC(12,2)` — enforce at entity level
- All ledger writes must be inside a DB transaction
- Reversals must be written as new entries with negative amounts — never delete or update the original
- Ledger entries written in the same transaction as the commission_event status change that triggered them

**What you must never do**:
- ❌ Delete or update a ledger entry row
- ❌ Store `pending_balance`, `available_balance`, or `total_balance` as columns anywhere
- ❌ Write a ledger entry without a valid `reference_id`
- ❌ Write a ledger entry outside of a database transaction
- ❌ Accept balance amounts from client input — always derive from source records
- ❌ Write duplicate ledger entries — idempotency_key unique constraint is the guard

**Financial invariants** (enforced by tests):
- `available_balance` for any user can never go negative (payout module must check before requesting)
- Two ledger entries with the same `idempotency_key` must never exist (unique constraint)
- Sum of all ledger entries for a user = total lifetime earnings adjusted for payouts and clawbacks
- A `commission_available` entry must always be preceded by a `commission_pending` entry for the same `commission_event_id`
