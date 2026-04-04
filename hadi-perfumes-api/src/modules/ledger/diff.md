# diff.md — Ledger Module (Phase 6)

> Append-only. Each session adds a dated entry.
> This file tracks changes specific to ledger logic only.
> Root diff.md tracks cross-cutting changes.

---

## 2026-04-02 (Phase 6 — Module Setup)

### Changed
- Created module-level agent files: `CLAUDE.md`, `context.md`, `diff.md`.
- No logic implemented yet.
- No migrations created yet.
- No entities created yet.

### Why
- Establishes agent context before Phase 6 implementation begins.
- Ensures ledger logic has clear scope boundaries relative to commission and payout modules.

### Impact
- Phase 6 implementation can now begin with clear instructions.
- No existing Phase 1–5 code was modified.

### Follow-up
- [x] Implement `LedgerEntry` entity.
- [x] Implement migration (in Phase 6 migration file).
- [x] Implement `LedgerService` (append-only write).
- [x] Implement balance derivation query.
- [x] Wire into `LedgerModule` and `AppModule`.
- [x] Full test suite: unit + integration + e2e.

---

## 2026-04-04 (Phase 6 — Ledger Implementation)

### Changed
- Created `LedgerEntry` entity (`src/modules/ledger/entities/ledger-entry.entity.ts`) — NO `updated_at` column (append-only)
- Created `LedgerService` (`src/modules/ledger/services/ledger.service.ts`) — single write method with optional EntityManager
- Created `WalletService` (`src/modules/ledger/services/wallet.service.ts`) — derived balance view
- Created `WalletController` (`src/modules/ledger/controllers/wallet.controller.ts`) — GET /wallet/balance, GET /wallet/ledger
- Created `LedgerModule` (`src/modules/ledger/ledger.module.ts`)
- Created ledger exceptions (`src/modules/ledger/exceptions/ledger.exceptions.ts`)
- Created `LedgerQueryDto` (`src/modules/ledger/dto/ledger-query.dto.ts`)

### Why
- Provides the financial backbone — all balance mutations go through ledger entries
- Wallet balances are NEVER stored; always derived from SUM of ledger entries
- HELD status for PAYOUT_REQUESTED prevents double-payout requests (FAILURE-11 fix)

### Impact
- `getAvailableBalance()` correctly includes HELD entries
- Supports transaction participation via `em` parameter
- Append-only: no UPDATE or DELETE on ledger_entries

### Tests Added
- `test/unit/ledger/ledger.spec.ts` (10 tests)
- `test/integration/ledger-release.workflow.spec.ts` (5 tests)
- `test/e2e/wallet.e2e-spec.ts` (7 tests)
