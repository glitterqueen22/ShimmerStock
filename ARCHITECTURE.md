# Architecture

## Overview

ShimmerStock follows a **monolithic modular** architecture: a single Bun/Express process serves both the API and the React frontend, but the business logic is organized into independent engines that communicate through a central event bus.

```
┌─────────────────────────────────────────────────────────┐
│                    Express Server (Bun)                  │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Auth    │  │  Routes  │  │  Static  │              │
│  │ Middleware│  │  (API)   │  │  (React) │              │
│  └──────────┘  └────┬─────┘  └──────────┘              │
│                     │                                    │
│            ┌────────┴────────┐                          │
│            │   Event Bus     │  ◄── engines publish     │
│            │  (events.js)    │      structured events   │
│            └────────┬────────┘                          │
│                     │                                    │
│  ┌──────┬──────┬────┼────┬──────┬──────┬──────┐        │
│  │Inv.  │Shop. │Prod│Calc│Purch.│Fulf. │Ware. │ ...    │
│  │Engine│Engine│Eng.│Eng.│Engine│Engine│Engine│        │
│  └──────┴──────┴────┴────┴──────┴──────┴──────┘        │
│                     │                                    │
│            ┌────────┴────────┐                          │
│            │   SQLite (WAL)  │                          │
│            └─────────────────┘                          │
└─────────────────────────────────────────────────────────┘
```

## The 28-Engine Model

Every engine is a self-contained module with:

1. **Business logic** — domain rules, calculations, validations
2. **Store functions** — database queries specific to the domain
3. **Routes** — REST API endpoints
4. **Events** — structured payloads published to the central bus
5. **AI summary** — human-readable state exposed for Novi

### Engine List

| # | Engine | Module(s) |
|---|--------|-----------|
| 1 | Inventory & Warehouse | `server/store.js`, `server/warehouse-store.js` |
| 2 | Commerce (Shopify) | `server/commerce/`, `server/shopify.js` |
| 3 | Commerce (Marketplaces) | `server/commerce/amazon.js`, `etsy.js`, `faire.js`, `tiktok-shop.js`, `woocommerce.js` |
| 4 | Production | `server/db.js` (boms, batches, movements) |
| 5 | Calculation | `server/calc.js` (formula engine) |
| 6 | Purchasing Intelligence | `server/purchasing-routes.js`, `server/store-purchasing-v32.js` |
| 7 | Novi Companion | `server/bestie.js`, `server/novi-messages.js`, `server/novi-detection.js` |
| 8 | Opportunity Center | `server/opportunities.js`, `server/opportunity-bridge.js` |
| 9 | Business Health Score | `server/health.js` |
| 10 | Manual Orders | `server/store.js` (orders) |
| 11 | PO Receiving | `server/db.js` (receiving_events) |
| 12 | Manufacturing | `server/db.js` (production_batches) |
| 13 | Warehouse Operations | `server/warehouse-routes.js`, `server/warehouse-store.js` |
| 14 | Customer Service | `server/cs-routes.js`, `server/cs-store.js` |
| 15 | Partner HQ | `server/partner-routes.js`, `server/partner-store.js` |
| 16 | Daily Business Replay | `server/timeline.js`, `server/timeline-routes.js` |
| 17 | Customer Hub | `server/customer-routes.js`, `server/customer-store.js` |
| 18 | Studio | `server/studio-routes.js` |
| 19 | Growth Intelligence | `server/growth-routes.js` |
| 20 | Novi Evolution | `server/novi-evolution.js` |
| 21 | Team HQ | `server/team-routes.js`, `server/hq.js` |
| 22 | Fulfillment HQ | `server/fulfillment-routes.js` |
| 23 | Adaptive Onboarding | `server/onboarding-routes.js` |
| 24 | Affiliate Attribution | `server/affiliate-attribution.js`, `server/affiliate-attribution-routes.js` |
| 25 | Affiliate Program | `server/affiliate-routes.js`, `server/affiliate-store.js` |
| 26 | AI Brand Setup | `server/ai-brand-setup.js`, `server/ai-brand-setup-routes.js` |
| 27 | Industry Config | `server/industry-routes.js` |
| 28 | Store Credit | `server/store-credit-routes.js` |

## Directory Structure

```
.
├── client/                    # React frontend
│   └── src/
│       ├── components/        # Reusable UI components
│       │   ├── ui/            # Design system primitives
│       │   ├── novi/          # Novi-specific components
│       │   └── *.tsx          # Feature components
│       ├── pages/             # Page-level components
│       ├── styles/            # Global styles
│       └── lib/               # Client utilities (API client, auth)
├── server/                    # Express backend
│   ├── index.js               # Server entry point
│   ├── db.js                  # Database init & schema
│   ├── store.js               # Core data access layer
│   ├── auth.js                # Authentication & sessions
│   ├── events.js              # Event bus
│   ├── audit.js               # Audit logging
│   ├── calc.js                # Formula engine
│   ├── sync.js                # Shopify sync logic
│   ├── commerce/              # Commerce provider modules
│   ├── providers/             # Provider registry & interface
│   ├── migrations/            # Database migrations
│   └── *-routes.js            # Route modules (one per engine)
├── src/                       # TanStack Start (SSR routes)
│   ├── router.tsx             # App router
│   ├── routes/                # Route definitions
│   └── styles/                # Styles
├── public/                    # Static assets
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Event Bus Pattern

Engines communicate through `server/events.js` — a simple in-process event emitter:

```js
// Publish an event
emit("production.batch_completed", {
  batchId: 42,
  product: "Glitter Jar",
  quantity: 100,
  consumed: [{ sku: "GLTR-001", qty: 2 }]
});

// Subscribe in another engine
on("production.batch_completed", (payload) => {
  // Inventory engine: update stock
  // Health engine: recalculate score
  // Timeline engine: record milestone
});
```

Event categories:
- `production.*` — Manufacturing events
- `commerce.*` — Order/revenue events
- `purchasing.*` — Supplier & PO events
- `calculation.*` — Formula execution
- `inventory.*` — Stock movements

## Key Design Decisions

1. **SQLite with WAL mode** — Fast, zero-config, single-file. PostgreSQL migration is planned for multi-user production.
2. **Bun runtime** — Native SQLite driver, fast startup, compatible with Node.js ecosystem.
3. **Monolithic modular** — Single process simplifies deployment; engine boundaries prevent spaghetti.
4. **Event bus over direct calls** — Engines don't import each other. They publish and subscribe.
5. **Multi-tenant from the start** — `businesses` table with `business_id` on all core tables.
6. **Role-based access** — `role_permissions` table with granular permission sets.
7. **Provider pattern** — Commerce integrations (Shopify, Amazon, etc.) implement a common interface.

## Data Flow

```
Shopify Webhook → webhook handler → sync engine → store functions → SQLite
                                                      ↓
                                                 event bus
                                                      ↓
                              ┌───────────────────────┼───────────────────┐
                              ↓                       ↓                   ↓
                        inventory update         health recalc      timeline record
                              ↓
                        Novi detection → opportunity surfaced
```

## Authentication Flow

```
POST /api/auth/login → verify password → create session → return token
All protected routes → requireAuth middleware → validate session token
Client → AuthContext (localStorage token) → API helper attaches Authorization header
```
