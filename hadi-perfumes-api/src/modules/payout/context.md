# context.md — Payout Module

**Scope statement**: The payout module handles participant requests to withdraw available commission balance. It enforces balance sufficiency, minimum thresholds, and audit requirements. It writes to the ledger to debit available balance. It does NOT process actual bank transfers (deferred to Phase 7/8) — it manages the payout lifecycle state.

**Payout lifecycle** (states and allowed transitions):
```
requested → approved → batched → sent
          ↘            ↘
           rejected     failed
```
- `requested`: participant requests payout (balance sufficiency checked here)
- `approved`: admin reviews and approves
- `rejected`: admin rejects request (balance restored via ledger reversal)
- `batched`: grouped into a payout_batch for execution
- `sent`: actual transfer completed (bank/UPI/wallet)
- `failed`: transfer failed (balance restored via ledger reversal)

**Payout constraints** (from root context.md hard constraints — never invent):
- Payout only from `available_balance` (derived from ledger entries)
- Must respect minimum payout threshold (configurable — NOT hardcoded)
- No payout if `available_balance < requested_amount`
- No payout if `available_balance < minimum_threshold`
- Payout reduces available balance via a `payout_requested` ledger entry at request time
- If rejected/failed, balance is restored via a `refund_reversal` ledger entry

**Planned data model**:
```
payout_requests
  id uuid PK
  idempotency_key varchar(255) UNIQUE
  user_id uuid (FK users)
  amount numeric(12,2) NOT NULL
  currency varchar(3) DEFAULT 'INR'
  status varchar(50) DEFAULT 'requested'
  payout_method varchar(50)           ← 'bank_transfer' | 'upi' | 'manual'
  payout_details simple-json          ← encrypted/masked bank/UPI details
  requested_at timestamptz NOT NULL DEFAULT now()
  reviewed_at timestamptz nullable
  reviewed_by uuid nullable           ← admin actor ID
  rejection_reason varchar nullable
  ledger_entry_id uuid nullable       ← FK to ledger_entries (the payout_requested entry)
  payout_batch_id uuid nullable
  created_at timestamptz NOT NULL DEFAULT now()
  updated_at timestamptz NOT NULL DEFAULT now()

payout_batches
  id uuid PK
  status varchar(50) DEFAULT 'pending'
  total_amount numeric(12,2)
  currency varchar(3) DEFAULT 'INR'
  item_count integer DEFAULT 0
  executed_by uuid nullable
  executed_at timestamptz nullable
  provider_batch_id varchar nullable
  metadata simple-json nullable
  created_at timestamptz NOT NULL DEFAULT now()
  updated_at timestamptz NOT NULL DEFAULT now()
```

**Relation to ledger**: The payout module calls `LedgerService.writeEntry()` to write a `payout_requested` entry when a payout is approved. This debits `available_balance`. If rejected or failed, it calls `LedgerService.writeEntry()` with a `refund_reversal` entry to restore balance.

**Relation to commission module**: Payout module reads available_balance from the ledger (which is fed by commission events). It does NOT interact with commission_events directly.
