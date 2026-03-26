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
