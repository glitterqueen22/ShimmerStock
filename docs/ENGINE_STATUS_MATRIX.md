# ShimmerStock Engine Status Matrix

> Current capability status for every major ShimmerStock engine.
> Updated as each engine progresses through Live → Beta → Early Access → Planned.
> Do not mark anything Live simply because a UI screen exists.

---

## Status Definitions

| Status | Meaning |
|--------|---------|
| **Live** | Fully functional, production-grade, actively used |
| **Beta** | Works, needs more real-world testing and edge-case hardening |
| **Early Access** | Available to Early Access members, expanding |
| **Demo** | Illustrative workspace only — no live backend |
| **Planned** | On roadmap — not yet built |

---

## Core Engine Status

| Engine | Current Status | Notes |
|--------|---------------|-------|
| Orders | Live | Shopify order sync (read-only), manual order entry, queue management |
| Fulfillment | Live | Pick, pack, ship queue |
| Inventory | Early Access | Multi-location, bins, receiving, reorder signals |
| Warehouse | Early Access | Location and bin management, inbound receiving |
| Purchasing | Beta | PO creation, supplier management, receiving |
| Production | Beta | Batch planning, BOM, formula costing |
| Customer Care | Demo | UI exists; full backend in progress |
| Customers | Early Access | Customer profiles, order history |
| Teams | Early Access | Role-based permissions |
| Partners & Affiliates | Early Access | Programs, commissions, attribution |
| Wholesale | Planned | Wholesale pricing tiers, B2B account management |
| Reporting | Planned | Cross-module analytics |
| Novi Intelligence | Early Access | Morning brief, exception detection, purchase recommendations |

---

## Shopify Integration Status

| Capability | Status | Notes |
|-----------|--------|-------|
| Read orders | Early Access | read_orders scope |
| Read products | Early Access | read_products scope |
| Read inventory | Early Access | read_inventory scope |
| Read locations | Early Access | read_locations scope |
| Write inventory | Not available | Requires separate approved milestone |
| Write orders | Not available | Not planned in current roadmap |
| Webhooks | Planned | Pending approved milestone |
| Automatic fulfillment | Not available | Not planned in current roadmap |

---

## Useful V1 Philosophy

The philosophy for all engines:

**Useful V1 > Giant unfinished feature**

A module that does 40% of what it will eventually do, but does that 40% reliably, clearly labeled, is better than a module that claims to do 100% and fails silently.

### What makes a Useful V1?

For each engine, a Useful V1 means:
- The most common workflow is functional
- The data it shows is accurate
- Errors are surfaced clearly
- Status is labeled honestly
- The interface is usable without training
- Novi has at least one meaningful signal from this engine

---

## Engine Roadmap Priorities (Private)

High priority for expansion:
1. Inventory — depth (lot tracking, expiry, advanced reorder)
2. Production — recipe and batch scheduling depth
3. Customer Care — backend operational
4. Shopify — write-back milestone (pending approval)
5. Reporting — cross-module analytics
6. Wholesale — B2B account management

---

## Do Not Claim

These capabilities are **not** available and must **not** be described as available:

- Shopify inventory write-back
- Automatic order fulfillment
- Automatic customer emails (no email provider configured)
- Real testimonials (no customers have given public permission)
- Real order counts/revenue figures (not disclosed)
- GGE full migration complete (in progress)
- Any integration listed as Planned being available now
