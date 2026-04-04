# diff.md — Commission Module (Phase 6)

> Append-only. Each session adds a dated entry.
> This file tracks changes specific to commission event logic only.
> Root diff.md tracks cross-cutting changes.

---

## 2026-04-02 (Phase 6 — Module Setup)

### Changed
- Created module-level agent files: `CLAUDE.md`, `context.md`, `diff.md`.
- No business logic implemented yet.
- No migrations created yet.
- No entities created yet.

### Why
- Establishes agent context before Phase 6 implementation begins.
- Ensures commission calculation logic has clear scope boundaries relative to ledger and payout modules.

### Impact
- Phase 6 implementation can now begin with clear instructions.
- No existing Phase 1–5 code was modified.

### Follow-up
- [x] Implement `CommissionEvent` entity.
- [x] Implement migration `1711600000000-Phase6CommissionLedgerInit.ts`.
- [x] Implement `CommissionCalculationService`.
- [x] Implement `CommissionProcessingJob` (outbox consumer).
- [x] Wire into `CommissionModule` and `AppModule`.
- [x] Full test suite: unit + integration + e2e.

---

## 2026-04-04 (Phase 6 — Commission Logic Implementation)

### Changed
- Created `CommissionEvent` entity (`src/modules/commission/entities/commission-event.entity.ts`)
- Created `CommissionEventSource` entity (`src/modules/commission/entities/commission-event-source.entity.ts`)
- Created `CommissionCalculationService` (`src/modules/commission/services/commission-calculation.service.ts`)
- Created `AdminCommissionTriggerController` (`src/modules/commission/controllers/admin-commission-trigger.controller.ts`)
- Created `CommissionReleaseJob` (`src/jobs/commission-release.job.ts`)
- Created `ClawbackJob` (`src/jobs/clawback.job.ts`)
- Created commission exceptions (`src/modules/commission/exceptions/commission.exceptions.ts`)
- Extended `CommissionModule` with Phase 6 entities, services, jobs, and controller
- Migration `1711600000000-Phase6LedgerInit.ts` creates 5 tables

### Why
- Enables commission calculation from paid retail orders via MoneyEventOutbox consumption
- Supports multi-level upline commission distribution with qualification checks
- Provides admin endpoints for manual outbox processing and commission release
- ClawbackJob enables reversal of commissions on refund/chargeback

### Impact
- Commission events are now created atomically with ledger entries
- Outbox events are marked published in the same transaction
- Self-purchase commission is blocked (FTC compliance)
- Unqualified upline participants are skipped

### Tests Added
- `test/unit/commission/commission-calculation.spec.ts` (12 tests)
- `test/unit/commission/commission-release.spec.ts` (5 tests)
- `test/unit/commission/clawback.spec.ts` (7 tests)
- `test/integration/commission-calculation.workflow.spec.ts` (3 tests)
- `test/integration/clawback.workflow.spec.ts` (5 tests)
- `test/e2e/admin-commission.e2e-spec.ts` (9 tests)
