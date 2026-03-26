# context.md — Hadi Perfumes: Project Source of Truth

---

## Project Purpose

**Hadi Perfumes** is a real-world, production-grade perfume buy/sell marketplace built on a
**networked direct-selling (MLM) model with a multi-level commission ledger**.

Users can buy and sell authentic perfumes. Every user has a sponsor. Sales generate commissions
that flow up the sponsorship tree according to versioned commission rules. All money movement is
recorded in an immutable ledger. The system is designed to be FTC-compliant: commissions are
tied exclusively to verified retail sales, never to recruitment or signup alone.

---

## Domain Glossary

| Term | Definition |
|---|---|
| **Sponsor** | The user who referred a new member into the network. Fixed at signup. |
| **Upline** | All ancestors of a user in the sponsorship tree (sponsor, sponsor's sponsor, etc.). |
| **Downline** | All descendants of a user in the sponsorship tree. |
| **Upline Path** | Materialized array of ancestor user IDs stored for fast traversal. |
| **Commission Level** | How many hops up the tree a commission travels (L1, L2, L3…). |
| **Qualified Sale** | An order that is paid, delivered, past the return window, and not disputed. |
| **Pending Commission** | Commission calculated but not yet payable (order still in risk window). |
| **Available Commission** | Commission cleared for payout after delivery + return window expiry. |
| **Clawback** | Reversal of a commission because the triggering order was refunded or charged back. |
| **Ledger Entry** | An immutable, append-only record of every money movement. |
| **Wallet** | A derived view of a user's balance, computed from ledger entries — never a raw editable number. |
| **SKU** | Stock-Keeping Unit — unique product identifier per listing. |
| **Inventory Reservation** | Atomic hold on stock during checkout, preventing oversell. |
| **KYC** | Know Your Customer — identity verification required for sellers and high earners. |
| **Rank** | A tier earned by a participant based on personal and/or downline sales volume — never by recruitment alone. |
| **Commission Rule Version** | A timestamped snapshot of the commission plan applied to orders at calculation time. |
| **Holdback** | A portion of commission or payout temporarily held for risk/compliance reasons. |
| **Chargeback** | A payment reversal initiated by the buyer's bank — must trigger a clawback. |
| **Return Window** | The period after delivery during which a buyer may return an item. Commission is not released until this closes. |
| **Fraud Signal** | A recorded indicator of suspicious behavior (duplicate device, fake referral, self-purchase, etc.). |
| **Audit Log** | An immutable record of every admin or system action with actor, target, and timestamp. |

---

## System Overview

### Architecture Style
Modular monolith first, designed for clean extraction into microservices. All modules share one
PostgreSQL database in Phase 1–6, with clear service boundaries so extraction is low-risk later.

### Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| **Backend framework** | NestJS (TypeScript) | Strong typing, modular DI, fits event-driven patterns |
| **Primary DB** | PostgreSQL | ACID transactions, adjacency+materialized path, row-level locking |
| **Cache / Rate Limits** | Redis | Session, rate limits, hot listing cache, job coordination |
| **Job Queue** | BullMQ (Redis-backed) | Commission settlement, payouts, refund processing, notifications |
| **Payments** | Stripe Connect | Multi-party marketplace payouts, separate charges & transfers |
| **Object Storage** | S3-compatible (AWS S3 / MinIO) | Product images, KYC documents |
| **Auth** | Phone/email OTP + JWT (short-lived) + refresh tokens | Stateless API, refresh rotation |
| **Search** | PostgreSQL full-text (Phase 1–5), Elasticsearch later | Listings search |
| **Observability** | Structured JSON logs + Prometheus metrics + OpenTelemetry traces | Audit, alerting |
| **Frontend** | Next.js + TypeScript + Tailwind | (Out of backend scope but noted for API contract awareness) |

---

## Build Phases

### Phase 1 — Business Rules, Compensation Model, Compliance Boundaries
Define all money logic in config before writing product code.
- Commission levels, percentages, eligibility rules
- Payout delay rules (delivery + return window)
- Refund/clawback rules
- Rank advancement rules (sales-only basis, never recruitment-only)
- Allowed earnings claims
- Compliance disclosure config
- CommissionRules versioned table seeded
- No product code yet — rules only

### Phase 2 — Identity, Onboarding, Referral Validation
Gated signup: user cannot complete registration without a valid sponsor code.
- Referral code service
- Signup flow with sponsor assignment
- Anti-abuse: no self-referral, no circular sponsorship, rate limits, device hash
- One account per verified identity policy
- OTP auth, KYC hooks for sellers and high earners

### Phase 3 — Network Graph & Qualification Engine
Makes multi-level commissions possible.
- Sponsorship tree (adjacency + materialized upline path)
- Downline/upline query APIs
- Qualification status engine (active/inactive based on sales volume)
- Rank engine (sales-driven, versioned rules)
- Background jobs for qualification recalculation

### Phase 4 — Catalog, Seller Accounts, Inventory
Normal marketplace layer.
- Seller profile + KYC
- Product listings (SKU, price, quantity, condition, authenticity)
- Listing approval workflow
- Media uploads (S3)
- Inventory reservation (transactional, atomic)
- Search and filter

### Phase 5 — Orders, Checkout, Payments, Money Movement
Where money enters the system.
- Cart and checkout
- Order creation (idempotent)
- Payment intent + capture (Stripe Connect)
- Seller split + platform fee
- Webhook handling (idempotent deduplication)
- Order lifecycle state machine

### Phase 6 — Commission Ledger, Wallet, Payouts, Clawbacks
Most critical non-brittle system.
- Immutable ledger entries
- Wallet as derived balance (pending / available / held / reversed)
- Commission calculation engine (uses versioned rules)
- Payout requests and batches
- Reversal and clawback entries on refund/chargeback
- Payout delay enforcement

### Phase 7 — Disputes, Returns, Moderation, Fraud
Trust and safety layer.
- Return request flow
- Dispute case flow (buyer opens, seller responds, admin resolves)
- Fraud scoring engine
- Seller suspension
- Admin review queues
- Refund authorization with commission clawback trigger

### Phase 8 — Observability, Security, Scaling
System reliability under real load.
- Structured audit logs
- Metrics, traces, anomaly detection
- Dead-letter queues and retry strategy
- Idempotency keys across all money-moving endpoints
- Secret management (env-based, no secrets in code)
- Role-based admin access with permissioned panels

---

## Data Model

### Core Tables

#### users
```
id                UUID PK
name              VARCHAR
email             VARCHAR UNIQUE
phone             VARCHAR UNIQUE
status            ENUM(active, suspended, pending_kyc, banned)
role              ENUM(buyer, seller, admin)
sponsor_id        UUID FK → users.id  (NULL for root user only)
referral_code     VARCHAR UNIQUE
created_at        TIMESTAMPTZ
```

#### referral_codes
```
id                UUID PK
owner_user_id     UUID FK → users.id
code              VARCHAR UNIQUE
status            ENUM(active, revoked, exhausted)
max_uses          INTEGER
uses_count        INTEGER DEFAULT 0
expires_at        TIMESTAMPTZ
created_at        TIMESTAMPTZ
```

#### referral_redemptions
```
id                UUID PK
new_user_id       UUID FK → users.id
sponsor_user_id   UUID FK → users.id
code_used         VARCHAR
signup_ip         INET
device_hash       VARCHAR
created_at        TIMESTAMPTZ
```

#### sponsorship_tree
```
user_id           UUID PK FK → users.id
sponsor_id        UUID FK → users.id
upline_path       UUID[]   -- materialized ancestor array, root first
depth             INTEGER
created_at        TIMESTAMPTZ
```

#### seller_profiles
```
user_id           UUID PK FK → users.id
kyc_status        ENUM(pending, approved, rejected, under_review)
kyc_documents     JSONB
payout_method     JSONB   -- Stripe Connect account ID etc.
risk_score        NUMERIC(5,2) DEFAULT 0
stripe_account_id VARCHAR
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```

#### listings
```
id                UUID PK
seller_id         UUID FK → users.id
title             VARCHAR
description       TEXT
sku               VARCHAR UNIQUE
price             NUMERIC(12,2)
currency          VARCHAR(3) DEFAULT 'USD'
quantity          INTEGER
condition         ENUM(new, like_new, used, refurbished)
authenticity_status ENUM(verified, unverified, pending)
status            ENUM(draft, active, paused, sold_out, removed)
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```

#### listing_images
```
id                UUID PK
listing_id        UUID FK → listings.id
url               VARCHAR
sort_order        INTEGER
created_at        TIMESTAMPTZ
```

#### inventory_reservations
```
id                UUID PK
listing_id        UUID FK → listings.id
order_id          UUID FK → orders.id
qty               INTEGER
expires_at        TIMESTAMPTZ
status            ENUM(reserved, confirmed, released, expired)
created_at        TIMESTAMPTZ
```

#### orders
```
id                UUID PK
buyer_id          UUID FK → users.id
status            ENUM(created, payment_pending, paid, packed, shipped,
                       delivered, return_window_open, completed,
                       refunded, disputed, chargeback)
subtotal          NUMERIC(12,2)
shipping_fee      NUMERIC(12,2)
tax               NUMERIC(12,2)
platform_fee      NUMERIC(12,2)
total             NUMERIC(12,2)
currency          VARCHAR(3)
idempotency_key   VARCHAR UNIQUE
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```

#### order_items
```
id                UUID PK
order_id          UUID FK → orders.id
listing_id        UUID FK → listings.id
seller_id         UUID FK → users.id
qty               INTEGER
unit_price        NUMERIC(12,2)
subtotal          NUMERIC(12,2)
```

#### payments
```
id                UUID PK
order_id          UUID FK → orders.id
provider          VARCHAR DEFAULT 'stripe'
provider_txn_id   VARCHAR UNIQUE
status            ENUM(pending, authorized, captured, failed, refunded, disputed)
amount            NUMERIC(12,2)
currency          VARCHAR(3)
captured_at       TIMESTAMPTZ
created_at        TIMESTAMPTZ
```

#### commission_rules
```
id                UUID PK
version           INTEGER NOT NULL
level             INTEGER NOT NULL  -- 1 = direct sponsor, 2 = level up, etc.
percentage        NUMERIC(5,4)      -- e.g. 0.0500 = 5%
min_order_value   NUMERIC(12,2)
eligible_categories JSONB           -- product category restrictions
eligible_seller_statuses JSONB
cap_per_order     NUMERIC(12,2)     -- max commission per single order
payout_delay_days INTEGER           -- days after delivery before release
clawback_window_days INTEGER        -- days after payout where clawback is possible
effective_from    TIMESTAMPTZ
effective_to      TIMESTAMPTZ       -- NULL means currently active
created_at        TIMESTAMPTZ
```

#### commission_events
```
id                UUID PK
order_id          UUID FK → orders.id
order_item_id     UUID FK → order_items.id
beneficiary_id    UUID FK → users.id  -- who earns this commission
level             INTEGER
rule_version      INTEGER FK → commission_rules.version
calculated_amount NUMERIC(12,2)
status            ENUM(pending, available, paid, clawed_back, voided)
available_after   TIMESTAMPTZ         -- delivery date + return window
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```

#### ledger_entries
```
id                UUID PK
user_id           UUID FK → users.id
order_id          UUID FK → orders.id  (nullable for non-order entries)
commission_event_id UUID FK → commission_events.id (nullable)
entry_type        ENUM(sale_revenue, platform_fee, seller_payout,
                       commission_l1, commission_l2, commission_l3,
                       holdback, refund_reversal, chargeback_reversal,
                       manual_adjustment, payout_sent, payout_failed)
amount            NUMERIC(12,2)       -- positive = credit, negative = debit
currency          VARCHAR(3)
status            ENUM(pending, settled, reversed, held)
reference_id      VARCHAR             -- external reference (Stripe transfer ID, etc.)
note              TEXT
created_at        TIMESTAMPTZ
```

#### wallets (derived view, not source of truth)
```
user_id           UUID PK FK → users.id
pending_balance   NUMERIC(12,2)     -- derived from ledger
available_balance NUMERIC(12,2)     -- derived from ledger
held_balance      NUMERIC(12,2)     -- derived from ledger
reversed_balance  NUMERIC(12,2)     -- derived from ledger
updated_at        TIMESTAMPTZ
```
> **Critical rule**: wallets are recomputed from ledger_entries. Never mutate wallet balance directly.

#### payouts
```
id                UUID PK
user_id           UUID FK → users.id
amount            NUMERIC(12,2)
currency          VARCHAR(3)
status            ENUM(requested, approved, processing, sent, failed, cancelled)
destination       JSONB              -- Stripe Connect payout destination
stripe_payout_id  VARCHAR
requested_at      TIMESTAMPTZ
processed_at      TIMESTAMPTZ
```

#### disputes
```
id                UUID PK
order_id          UUID FK → orders.id
opened_by         UUID FK → users.id
reason            ENUM(item_not_received, item_not_as_described, damaged,
                       unauthorized_charge, other)
status            ENUM(open, seller_responded, under_review, resolved_buyer,
                       resolved_seller, escalated)
resolution_note   TEXT
created_at        TIMESTAMPTZ
resolved_at       TIMESTAMPTZ
```

#### fraud_signals
```
id                UUID PK
user_id           UUID FK → users.id
signal_type       ENUM(duplicate_device, self_purchase_attempt, circular_referral,
                       velocity_abuse, chargeback_pattern, fake_account_suspected)
metadata          JSONB
severity          ENUM(low, medium, high, critical)
created_at        TIMESTAMPTZ
```

#### audit_logs
```
id                UUID PK
actor_user_id     UUID FK → users.id  (NULL for system actions)
action            VARCHAR
target_type       VARCHAR
target_id         UUID
metadata          JSONB
ip_address        INET
created_at        TIMESTAMPTZ
```

---

## APIs and Integrations

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | /auth/signup | Register with referral code — gated |
| POST | /auth/otp/send | Send OTP to phone/email |
| POST | /auth/otp/verify | Verify OTP, return JWT |
| POST | /auth/refresh | Refresh access token |
| POST | /auth/logout | Invalidate refresh token |

### Referrals
| Method | Endpoint | Description |
|---|---|---|
| POST | /referrals/validate | Validate a referral code before signup |
| GET | /referrals/my-code | Get authenticated user's referral code |

### Network
| Method | Endpoint | Description |
|---|---|---|
| GET | /network/downline | Paginated downline tree |
| GET | /network/upline | Upline path |
| GET | /network/stats | Personal and downline sales volume, qualification status |

### Sellers
| Method | Endpoint | Description |
|---|---|---|
| POST | /sellers/apply | Submit seller application + KYC |
| GET | /sellers/:id/profile | Get seller public profile |
| PATCH | /sellers/profile | Update seller settings |

### Listings
| Method | Endpoint | Description |
|---|---|---|
| POST | /listings | Create listing |
| GET | /listings | Search/filter listings |
| GET | /listings/:id | Get listing detail |
| PATCH | /listings/:id | Update listing |
| DELETE | /listings/:id | Remove listing |

### Inventory
| Method | Endpoint | Description |
|---|---|---|
| POST | /inventory/reserve | Reserve stock at checkout (transactional) |
| DELETE | /inventory/reserve/:id | Release reservation on cancel |

### Orders
| Method | Endpoint | Description |
|---|---|---|
| POST | /orders | Create order from cart (idempotent key required) |
| GET | /orders/:id | Get order status |
| PATCH | /orders/:id/status | Admin/seller order status update |

### Payments
| Method | Endpoint | Description |
|---|---|---|
| POST | /payments/intent | Create Stripe PaymentIntent |
| POST | /payments/capture | Capture authorized payment |
| POST | /payments/webhook | Stripe webhook receiver (idempotent) |

### Commissions
| Method | Endpoint | Description |
|---|---|---|
| POST | /commissions/calculate | Triggered internally on order completion |
| GET | /commissions/my | User's commission history |

### Wallet & Payouts
| Method | Endpoint | Description |
|---|---|---|
| GET | /wallet/ledger | Paginated ledger entries for authenticated user |
| GET | /wallet/balance | Derived balance summary |
| POST | /wallet/payout-request | Request payout of available balance |

### Disputes & Refunds
| Method | Endpoint | Description |
|---|---|---|
| POST | /orders/:id/refund | Initiate refund (triggers clawback job) |
| POST | /disputes | Open a dispute |
| PATCH | /disputes/:id | Update dispute status |

### Admin
| Method | Endpoint | Description |
|---|---|---|
| POST | /admin/commission-hold | Place hold on user's commissions |
| GET | /admin/fraud-signals | Review fraud queue |
| POST | /admin/users/:id/suspend | Suspend user account |
| GET | /admin/audit-logs | Paginated audit log |
| POST | /admin/payouts/:id/approve | Approve payout request |

---

## Important Constraints

### Financial Safety Rules (Non-Negotiable)
1. Wallets are derived from ledger entries — never mutate a wallet balance directly.
2. Commissions only become `available` after order reaches `completed` state (delivery + return window closed).
3. Every refund or chargeback must trigger an automatic clawback job for associated commissions.
4. Commission rules are versioned — the rule version at time of order is locked to that commission event forever.
5. No commission on signup, recruitment, or self-purchase alone.
6. Every payment endpoint is idempotent — duplicate calls must not create duplicate charges or ledger entries.

### Inventory Safety Rules
7. Stock reservations use `SELECT ... FOR UPDATE` or equivalent atomic decrement — no plain read-modify-write.
8. Reservations expire (configurable TTL, default 15 minutes) and are automatically released by a background job.

### Referral / Identity Rules
9. Self-referral is blocked at the server — never trust the client.
10. Sponsor relationship is immutable after signup (corrections require an audited admin flow).
11. Circular sponsorship is blocked by upline path check on signup.
12. Device hash + IP + verified identity enforce one-account-per-person policy.

### Admin Rules
13. Every admin action is written to `audit_logs` before it takes effect.
14. Manual ledger adjustments require a second admin to approve (4-eyes principle in Phase 7+).
15. Admin roles are scoped: `support`, `finance`, `superadmin` — principle of least privilege.

### Commission Rule Constraints
16. Commission eligibility is category-specific and can have per-order caps.
17. Payout delay and clawback window are fields on the rule, not hardcoded.
18. Rules have `effective_from` / `effective_to` — old orders always use the rule version active at order creation time.

---

## Folder Map (Backend)

```
hadi-perfumes-api/
├── CLAUDE.md
├── context.md
├── diff.md
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── glossary.md
│   └── compliance.md
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/                    # env config, validation schemas
│   ├── common/
│   │   ├── decorators/
│   │   ├── filters/               # exception filters
│   │   ├── guards/                # auth, role guards
│   │   ├── interceptors/          # audit log interceptor, idempotency
│   │   ├── pipes/
│   │   └── utils/
│   ├── database/
│   │   ├── migrations/
│   │   └── seeds/
│   ├── modules/
│   │   ├── auth/                  # Phase 2
│   │   │   ├── CLAUDE.md
│   │   │   ├── context.md
│   │   │   └── diff.md
│   │   ├── referral/              # Phase 2
│   │   ├── network/               # Phase 3
│   │   ├── seller/                # Phase 4
│   │   ├── listing/               # Phase 4
│   │   ├── inventory/             # Phase 4
│   │   ├── order/                 # Phase 5
│   │   ├── payment/               # Phase 5
│   │   ├── commission/            # Phase 6
│   │   │   ├── CLAUDE.md
│   │   │   ├── context.md
│   │   │   └── diff.md
│   │   ├── ledger/                # Phase 6
│   │   ├── wallet/                # Phase 6
│   │   ├── payout/                # Phase 6
│   │   ├── dispute/               # Phase 7
│   │   ├── fraud/                 # Phase 7
│   │   └── admin/                 # Phase 7–8
│   ├── jobs/                      # BullMQ workers
│   │   ├── commission-settlement.job.ts
│   │   ├── payout-batch.job.ts
│   │   ├── reservation-expiry.job.ts
│   │   ├── clawback.job.ts
│   │   └── qualification-recalc.job.ts
│   └── integrations/
│       ├── stripe/
│       └── s3/
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## Open Questions (to resolve before / during each phase)

- [ ] How many commission levels deep? (2, 3, or deeper?)
- [ ] Exact return window duration (days)?
- [ ] What product categories are commission-eligible?
- [ ] Is there a maximum rank level? What are rank names?
- [ ] What qualifies a user as "active" for the commission engine?
- [ ] Which countries/currencies are supported at launch?
- [ ] Is there a seller onboarding fee or monthly subscription?
- [ ] What are the exact platform fee percentages?
- [ ] What KYC provider will be used (Stripe Identity, Persona, Onfido)?
- [ ] Are there caps on how much any single user can earn per month?
- [ ] What compliance disclosures are legally required in the target market?
- [ ] Is the admin panel a separate app or part of the API?
