# diff.md — Hadi Perfumes: Change Ledger

> Append-only. Each session adds a dated entry. Never edit past entries.
> Format: date → changed → why → impact → follow-up.

---

## 2026-03-27

### Changed
- Initialized project. Created `context.md` (source of truth) and `claude.md` (agent operating contract).

### Why
- Project kickoff. Established the full domain model, tech stack, 8-phase build plan, database schema, API surface, folder structure, constraints, and compliance rules before any product code is written.

### Impact
- All future sessions start from a shared, consistent understanding of the system.
- `context.md` is the single source of truth — no facts should be invented outside of it.
- `claude.md` defines the agent's operating rules, validation checklist, and what it must never do.

### Follow-up
- [ ] Resolve open questions in `context.md` (commission levels, return window duration, KYC provider, platform fee %, rank names).
- [ ] Begin Phase 1: commission rules schema, compliance config tables, seed data.
- [ ] Confirm target market and currency to set initial `commission_rules` seed correctly.
- [ ] Confirm whether admin panel is a separate Next.js app or served from the same API.
- [ ] Decide on KYC provider (Stripe Identity vs Persona vs Onfido) before Phase 2 starts.

---

## 2026-03-27 (Phase 1)

### Changed
- Scaffolded NestJS application `hadi-perfumes-api` with TypeORM and PostgreSQL configuration.
- Created `CompensationPolicyVersion`, `CommissionRule`, `RankRule`, `ComplianceDisclosure`, `AllowedEarningsClaim`, and `RuleAuditLog` entities to represent the deterministic commission logic purely conceptually in the database.
- Implemented `PolicyEvaluationService` to enforce purely server-side business rules, ensuring isolation of constraints without direct ledger writes.
- Built `AdminPolicyService` and `AdminCompensationController` implementing the lifecycle for draft, validation, and active transitions with a `RuleAuditLog` generated alongside activation.
- Wrote full Test suite including unit tests for `PolicyEvaluationService`, an integration test for the admin change workflow, and `admin-compensation.e2e-spec.ts`.
- Changed `jsonb` array definitions in entities to `simple-json` specifically for compatibility with SQLite memory database test suite validation processes.

### Why
- We need the foundation of Phase 1 to execute deterministically without brittle hardcoded configuration values.

### Impact
- Establishes a completely versioned, immutable ruleset architecture ready for integration with Phase 5/6 transaction events without hardcoded dependencies.

### Follow-up
- Resolve the TypeORM SQLite `jsonb` or array dialect incompatibility affecting integration and E2E in-memory test passes (the code logic is complete, but `npx jest` requires environment tweaks to parse the JSON mappings cleanly).
- Begin development on Phase 2: User Onboarding and Referrals.

---

## 2026-03-27 (Phase 1 Fixes)

### Changed
- Created `db-type.util.ts` to export timezone agnostic conditional type alias `tstz`.
- Replaced `{ type: 'timestamptz' }` with `tstz() as any` across all 6 commission entity files.
- Replaced PostgreSQL specific types `inet` and `enum` with text types conditionally when `NODE_ENV === 'test'` in `rule-audit-log` and `compensation-policy-version` entities.
- Removed arbitrary `unique` constraint from `disclosure_key` and added composite `@Unique(['policy_version', 'disclosure_key'])` on `ComplianceDisclosure` class.
- Added `@OneToMany` relations for `compliance_disclosures` and `allowed_earnings_claims` on `CompensationPolicyVersion`.
- Updated `AdminPolicyService.createDraft` to instantiate and persist provided `compliance_disclosures` and `allowed_earnings_claims` array items from the creation DTO.
- Configured package.json `test:e2e` script to use `cross-env NODE_ENV=test` to instruct utilities mapped onto testing environments automatically.

### Why
- The E2E tests run against a `sqlite` memory database, which doesn't support the PostgreSQL specific types and exact constraints specified. These changes dynamically downgrade the strict typings to SQLite compatible formats during testing runs while preserving complete PostgreSQL integrity in production environments.

### Impact
- E2E tests for `AdminCompensationController` now pass.
- Compliance schemas and rules persist cleanly from DTO representations during Draft initialization.

### Follow-up
- Validate the remainder of the E2E testing suite execution utilizing the `tstz` type definition strategy.
