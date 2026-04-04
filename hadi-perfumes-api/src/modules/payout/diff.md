# diff.md — Payout Module (Phase 6)

> Append-only. Each session adds a dated entry.
> This file tracks changes specific to payout logic only.
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
- Ensures payout logic has clear scope boundaries relative to commission and ledger modules.

### Impact
- Phase 6 implementation can now begin with clear instructions.
- No existing Phase 1–5 code was modified.

### Follow-up
- [x] Implement `PayoutRequest` entity.
- [x] Implement `PayoutBatch` entity.
- [x] Implement migration (in Phase 6 migration file).
- [x] Implement `PayoutService`.
- [x] Implement admin payout controller.
- [x] Implement participant payout request controller.
- [x] Wire into `PayoutModule` and `AppModule`.
- [x] Full test suite: unit + integration + e2e.

---

## 2026-04-04 (Phase 6 — Payout Implementation)

### Changed
- Created `PayoutRequest` entity (`src/modules/payout/entities/payout-request.entity.ts`)
- Created `PayoutBatch` entity (`src/modules/payout/entities/payout-batch.entity.ts`)
- Created `PayoutService` (`src/modules/payout/services/payout.service.ts`)
- Created `PayoutController` (`src/modules/payout/controllers/payout.controller.ts`) — POST /wallet/payout-request, GET /wallet/payout-requests
- Created `AdminPayoutController` (`src/modules/payout/controllers/admin-payout.controller.ts`) — full admin CRUD + batch execution
- Created `PayoutModule` (`src/modules/payout/payout.module.ts`)
- Created payout exceptions (`src/modules/payout/exceptions/payout.exceptions.ts`)
- Created DTOs: `CreatePayoutRequestDto`, `RejectPayoutDto`, `PayoutQueryDto`

### Why
- Enables participant payout requests with balance sufficiency checks
- Admin approval/rejection lifecycle with ledger entry atomicity
- Batch execution stub for Phase 7/8 bank transfer integration
- Idempotency via unique `idempotency_key` header (UUID format required)

### Impact
- Single-active-payout enforcement: no duplicate pending/approved payouts per user
- Rejection restores balance via PAYOUT_FAILED ledger entry (positive credit)
- All money-moving endpoints require Idempotency-Key header

### Tests Added
- `test/unit/payout/payout.spec.ts` (12 tests)
- `test/integration/payout-flow.workflow.spec.ts` (7 tests)
- `test/e2e/wallet.e2e-spec.ts` (7 tests — shared with ledger)
- `test/e2e/admin-commission.e2e-spec.ts` (9 tests — shared with commission)
