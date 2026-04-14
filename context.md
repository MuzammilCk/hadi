# Hadi Perfumes — Architecture & Context Source of Truth

**Hadi Perfumes** is a production-grade, FTC-compliant **Multi-Level Marketing (MLM) eCommerce application**.
This document serves as the architectural compass and business rule set for onboarding senior engineers.

---

## 1. Business Model & Philosophy

Hadi Perfumes uses a **single-vendor, admin-owned catalog** commerce model combined with an **MLM referral network**.
- **Not a P2P Marketplace**: Participants do not own storefronts, and there are no vendor payouts or split payments (e.g., no Stripe Connect).
- **Company Catalog**: The company (Admin) owns, manages, and ships all products (SKUs) and holds all inventory.
- **Retail-Driven MLM**: Users can buy products, refer others to build a "downline" network, and earn commissions. 
- **FTC Compliance**: Commissions are strictly generated from **verified retail sales** (paid orders), never from mere recruitment or signup events. Fraud or refunds trigger immediate, automated commission clawbacks.

---

## 2. Tech Stack & Infrastructure

The application uses a **Modular Monolith** pattern designed for eventual microservice extraction.

| Layer | Technology | Rationale & Usage |
|---|---|---|
| **Frontend** | React, Vite, Tailwind CSS | High-performance SPA with secure context-driven state management (Cart, Wishlist, Auth). |
| **Backend API** | NestJS (TypeScript) | Strong typing, Dependency Injection, and bounded module contexts. |
| **Database** | PostgreSQL (Supabase) | Strict ACID transactional requirements for order processing and ledgers. |
| **ORM** | TypeORM | Utilizing transactional Entity Managers (`em`) for atomic, cross-table workflows. |
| **Async Tasks** | BullMQ & Redis | Handing retries, commission calculations, and schedule-based jobs (Crons). |
| **External Integrations** | Stripe, MSG91 | Stripe for 100% platform-revenue payment intents + webhooks. MSG91 for SMS OTP auth. |
| **Storage** | Supabase Storage (S3) | Secured, signed URL delivery for catalog media. |

---

## 3. Core Domain Glossary

| Term | Concept Definition |
|---|---|
| **Sponsor / Upline** | The user who referred a member. "Upline" represents the entire materialized path of ancestors. |
| **Downline** | All descendant nodes in a user's referral graph. |
| **Network Node** | The materialized graph row used for fast tree traversal and rank/volume evaluation. |
| **Inventory Reservation** | A strict, atomic stock hold created during checkout (TTL restricted). Prevents overselling. |
| **Commission Outbox** | Transactional outbox pattern table mapping paid orders to asynchronous commission calculation events. |
| **Pending vs Available** | Commissions sit in a "Pending" risk window to account for chargebacks/returns before becoming "Available" to withdraw. |
| **Ledger Entry** | An immutable, append-only financial record. Wallets are derived from these, never updated directly. |
| **Clawback** | A negative ledger correction that traverses up the network to reclaim commissions on refunded/cancelled orders. |
| **Idempotency Key** | A unique frontend-generated UUID attached to checkouts/payments to guarantee single-execution across network retries. |

---

## 4. Architectural Patterns & Guardrails

Senior engineers touching this codebase must strictly adhere to the following implemented patterns:

### 1. The Transactional Outbox Pattern
We do **not** calculate commissions synchronously during the checkout/webhook flow. 
- When an order transitions to `PAID`, an event is saved to `money_event_outbox` inside the exact same database transaction that updates the order.
- A `@Cron` job picks up unpublished outbox events and pushes them to a BullMQ queue for safe, isolated, and retriable commission graph traversal.

### 2. Transaction Atomicity & `em` propagation
Functions mutating critical state (e.g., `cancelOrder`, `releaseReservation`) accept an optional TypeORM `EntityManager (em)`. 
- If an operation belongs to a larger workflow (like an Order Cancellation causing an Inventory Release), the `em` is passed down to join the parent transaction. This prevents partial rollbacks.

### 3. Graceful Degradation & Resilience
- **Node.js Crash Guards**: We trap `unhandledRejection` and `uncaughtException`. Transient network blips (e.g., DNS failures to the DB pooler) log loudly but **never** kill the HTTP process.
- **Stripe Outages**: Network connection failures to Stripe throw proper `503 Service Unavailable` exceptions, instructing the frontend UI to gracefully allow a retry rather than hanging or leaving an order in a zombie state.

### 4. Live-Evaluated RBAC (Role-Based Access Control)
- JSON Web Tokens (JWT) manage session identity, but **critical Admin routes** do not trust the JWT's role claim directly. 
- The `RolesGuard` performs a live DB lookup for High-Privilege actions. If an admin is demoted, their access is revoked mid-session immediately.

---

## 5. Implementation Roadmap Status

The system was built in sequential logic phases. **Phases 1 through 9 are fully implemented.**

✅ **Phase 1-3:** Immutable Commission Rule Engine, OTP Identity, and Tree Graph traversal algorithms.
✅ **Phase 4:** Admin Catalog management and the Atomic Inventory Engine.
✅ **Phase 5:** End-to-end Checkout form and Stripe Webhooks.
✅ **Phase 6:** The Append-only Ledger, Outbox Processing, and Wallet balances.
✅ **Phase 7:** Automated Clawbacks and Refund propagation.
✅ **Phase 8:** Logging, Auditing, and Global Error Filters.
✅ **Phase 9:** Dynamic Homepage content, and RBAC implementation.

### Pre-Production Hardening (`Bucket A` & `Bucket B` - ✅ COMPETED)
Following Phase 9, intense audit patches were applied:
1. **Commission Exploits Closed**: Automated clawback hooks attached to `CANCELLED` orders.
2. **Double-Spend Prevention**: Distributed locking (`FOR UPDATE SKIP LOCKED`) attached to BullMQ background workers to stop race conditions on ledger payouts.
3. **Idempotency Regeneration**: Frontend safely rolls idempotency UUIDs strictly on 503/Network failures, but preserves them on 4xx business errors.
4. **Data Sync**: Denormalized `sponsor_id` sync drift eliminated, Wallet Balances connected to live Ledgers, Cart Images properly resolved via Signed URLs.

### What's Next: `Bucket C` (Current Focus)
The system is operationally secure. The next objective involves deep regression testing, deduplication of business logic code, performance optimization, and collusion detection algorithms.

---

## 6. Hard Invariants (Do Not Break)

1. **No direct wallet mutation**: Wallets are a mathematical sum of Ledger Entries.
2. **No commission on signup**: Code must evaluate product volume, not headcount.
3. **Zero tolerance for phantom stock**: Inventory holds must always have an expiration TTL or be joined transactionally to an Order pipeline.
4. **Assume the network lies**: Every POST request moving money must enforce idempotency via UUIDs.
5. **Fail closed**: If Stripe or a dependency is unreachable, abort the transaction cleanly to prevent corrupted application state.
