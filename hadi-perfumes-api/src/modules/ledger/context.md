# context.md — Ledger Module

**Scope statement**: The ledger module is the single source of financial truth for participant balances. It receives commission events from the commission module and records immutable append-only ledger entries. Wallet balances are NEVER stored — they are always derived by summing ledger entries. This module does not initiate commission calculation or payout execution.

**Ledger is append-only**: No ledger entry is ever updated or deleted. Reversals are new entries of opposite sign. This is a hard constraint.

**Entry types** (exhaustive list — do not add more without product approval):
| Entry Type | Sign | Triggered By |
|---|---|---|
| `commission_pending` | positive | commission_event created (pending status) |
| `commission_available` | positive | commission_event released (hold window cleared) |
| `commission_pending_reversal` | negative | commission_event released (replaces pending entry) |
| `payout_requested` | negative | payout_request approved |
| `payout_sent` | neutral/marker | payout_batch executed |
| `clawback` | negative | order.refunded / order.chargeback commission reversal |
| `refund_reversal` | positive | restores balance if clawback was applied and refund reversed |

**Wallet balance derivation rules** (all computed from ledger entries, never stored):
```
pending_balance   = SUM(amount) WHERE entry_type IN ('commission_pending')
                    AND NOT reversed
available_balance = SUM(amount) WHERE entry_type IN ('commission_available', 'refund_reversal')
                    - SUM(amount) WHERE entry_type IN ('payout_requested', 'clawback')
held_balance      = alias for pending_balance (balance not yet available for payout)
total_balance     = pending_balance + available_balance
```

**Planned data model**:
```
ledger_entries
  id uuid PK
  idempotency_key varchar(255) UNIQUE
  user_id uuid (FK users)             ← participant earning/losing balance
  entry_type varchar(50) NOT NULL     ← one of the entry types above
  amount numeric(12,2) NOT NULL       ← positive for credits, negative for debits
  currency varchar(3) DEFAULT 'INR'
  reference_type varchar(50)          ← 'commission_event' | 'payout_request' | 'clawback'
  reference_id uuid NOT NULL          ← FK to the source record
  commission_event_id uuid nullable   ← direct FK to commission_events (for commission entries)
  policy_version_id uuid nullable     ← snapshot of policy version at time of entry
  metadata simple-json nullable       ← audit context (order_id, upline_depth, etc.)
  created_at timestamptz NOT NULL DEFAULT now()
```

**Relation to commission module**: The ledger module listens for `CommissionEvent` state changes (e.g., a commission_event moving from `pending` to `available`) and writes the corresponding ledger entries. It does NOT calculate commission amounts itself.

**Relation to payout module**: The payout module reads `available_balance` (derived from ledger) before creating a `payout_request`. Once a payout is approved, it writes a `payout_requested` ledger entry to debit the available balance.
