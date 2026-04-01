# context.md — Hadi Perfumes: Project Source of Truth

---

## Project Purpose

**Hadi Perfumes** is a production-grade, FTC-compliant **MLM-enabled eCommerce backend**.

The commerce model is now **single-vendor, admin-owned catalog** (not P2P marketplace):
- Only the company/admin account owns and publishes listings.
- Participants and customers can buy products, build referral networks, and earn commissions based on verified retail events.
- No participant-owned storefronts, no seller onboarding flow, and no vendor payout splitting.

---

## Domain Glossary

| Term | Definition |
|---|---|
| **Sponsor** | The user who referred a new member into the network. Fixed at signup. |
| **Upline** | All ancestors of a user in the sponsorship tree. |
| **Downline** | All descendants of a user in the sponsorship tree. |
| **Upline Path** | Materialized ancestor array for fast traversal and qualification calculations. |
| **Qualified Sale** | Paid, valid retail order event eligible for MLM commission logic per active policy version. |
| **Pending Commission** | Calculated commission not yet releasable (risk/return window not cleared). |
| **Available Commission** | Commission cleared for payout eligibility after policy hold conditions pass. |
| **Clawback** | Negative ledger movement reversing commission from refund/chargeback/dispute outcome. |
| **Ledger Entry** | Immutable append-only money event record. |
| **Wallet (derived)** | Computed balance view from ledger events; never a direct mutable source of truth. |
| **SKU** | Unique stock identifier in admin-owned catalog listings. |
| **Inventory Reservation** | Atomic stock hold during checkout with strict TTL (15 minutes in Phase 4). |
| **Catalog Owner** | Company/admin identity that exclusively controls listing creation and inventory. |
| **Rank** | Sales/volume-based participant tier per versioned qualification and rank rules. |
| **Commission Policy Version** | Immutable policy snapshot used at commission evaluation time. |
| **Audit Log** | Immutable record of admin/system actions for traceability and compliance. |

---

## System Overview

### Architecture Style
Modular monolith on NestJS + PostgreSQL, with clear module boundaries for later service extraction.

### Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Backend | NestJS (TypeScript) | Typed modular architecture |
| DB | PostgreSQL | ACID transactions, deterministic financial logic |
| Queue | BullMQ / background workers | async recalculation, expiry, settlement |
| Cache | Redis | rate limits, ephemeral state, job coordination |
| Payments | Stripe (standard platform charges) | single merchant flow, webhook ecosystem |
| Storage | S3-compatible | listing media |

---

## Build Phases

### Phase 1 — Commission & Compliance Rules Engine ✅
- Versioned, immutable compensation policy model.
- `CompensationPolicyVersion`, `CommissionRule`, `RankRule`, disclosures and audit primitives.
- Deterministic server-side policy evaluation without hardcoded plan math.

### Phase 2 — Identity, OTP, Referral Integrity ✅
- OTP onboarding flow.
- Strict referral redemption + sponsorship persistence.
- Anti-abuse invariants: no self-referral, no circular sponsorship, auditable corrections.

### Phase 3 — Network Graph & Qualification Engine ✅
- Materialized path + adjacency graph support.
- Qualification state/rank assignment services.
- Admin-safe graph correction and rebuild primitives.

### Phase 4 — Admin Catalog & Atomic Inventory ✅ (Pivot implemented)
- Product categories/listings/media/moderation built under admin routes.
- **Architectural pivot finalized:** no multi-vendor seller domain.
- `listings.seller_id` retained for user FK compatibility but operationally constrained to admin/company owner.
- Inventory engine guarantees no oversell via atomic SQL updates and reservation lifecycle.

### Phase 5 — Checkout, Orders, Payments (Single Merchant)
- Cart → order lifecycle with idempotent checkout.
- Stripe payment intent/capture where platform/company receives 100% gross revenue.
- No Stripe Connect account onboarding, no split transfers, no vendor payouts.
- Webhook deduplication and order state machine.

### Phase 6 — Commission Ledger, Wallets, Payout Settlement
- Append-only commission ledger and derived balances.
- Commission posting from eligible paid retail orders.
- Pending → available release after policy-defined windows.
- Participant commission payouts from platform-controlled revenue pool.
- Automatic clawbacks on refund/chargeback/dispute outcomes.

### Phase 7 — Returns, Disputes, Fraud, Moderation
- Return/dispute orchestration.
- Fraud review and payout hold hooks.
- Admin safety workflows and immutable audit trail.

### Phase 8 — Observability, Security, Scale
- Metrics, traces, structured logs, DLQ/retry hardening.
- Permissioned admin controls and idempotency enforcement across money-moving endpoints.

---

## Data Model (Current + Planned)

### Implemented Core (Phases 1–4)
- `users`
- `referral_codes`
- `referral_redemptions`
- `sponsorship_links`
- `network_nodes`, qualification/rank entities
- `compensation_policy_versions`, `commission_rules`, `rank_rules`, compliance tables
- `product_categories`
- `listings` (admin-owned; `seller_id` mapped to admin/company user)
- `listing_images`
- `listing_status_history`
- `listing_moderation_actions`
- `inventory_items`
- `inventory_reservations`
- `inventory_events`

### Planned Core (Phases 5–8)
- `carts`, `cart_items`
- `orders`, `order_items`
- `payments`, `payment_webhook_events`
- `commission_events`
- `ledger_entries`
- `payout_requests`, `payout_batches`
- `refunds`, `returns`, `disputes`
- `audit_logs`, `fraud_signals`

### Explicit Non-Goals After Phase 4 Pivot
- ❌ `seller_profiles`
- ❌ vendor KYC onboarding tables/flows
- ❌ participant-owned stores
- ❌ marketplace split-payments / Stripe Connect transfer topology

---

## Hard Constraints

1. No commission on recruitment/signup-only events.
2. No direct wallet mutation without ledger entries.
3. Inventory mutations must be transactional and atomic.
4. Payment and webhook handlers must be idempotent.
5. Sponsor tree integrity is enforced server-side with auditable admin corrections.
6. Catalog ownership is company-admin only.

