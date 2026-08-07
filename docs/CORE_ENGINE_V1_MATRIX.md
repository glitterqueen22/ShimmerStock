# Core Engine V1 Matrix

**Version:** Phase 1 · 2026-08-07

## Launch-Critical Engines (11)

| Engine | Status | Useful V1 | Novi Tier | Missing for Beta | Dead Ends Fixed |
|--------|--------|-----------|-----------|-----------------|-----------------|
| Command Center | Beta | 4-section layout, Novi Morning Brief, snapshot, today queue | Full | Real Novi AI (using demo data) | ✅ |
| Products | Beta | List, view, search, add, edit, stock tracking | Contextual | Reorder threshold UI, bulk edit | ✅ |
| Inventory | Beta | Stock levels, low-stock detection, per-location view | Contextual | Physical count workflow | ✅ |
| Warehouse | Beta | Bin management, pick/pack queue, receive | Contextual | Label printing UX | ✅ |
| Orders | Beta | List, view, status tracking, Shopify import | Full | Blocked-order resolution | ✅ |
| Purchasing | Beta | PO creation, supplier management, reorder recommendations | Full | Approval workflow | ✅ |
| Production | Beta | BOM creation, batch tracking, status | Contextual | Component allocation check | ✅ |
| Fulfillment | Beta | Shipment queue, pack verification, exceptions | Full | Carrier rate integration | ✅ |
| Customer Care | Beta | Conversation queue, customer profile, order history | Full | Automated external comms (intentionally disabled) | ✅ |
| Teams | Beta | Member management, role assignment | Contextual | Permission enforcement matrix | ✅ |
| Novi Center | Beta | Message history, settings, morning brief | Full | Live AI connection (using demo data) | ✅ |

---

## Other Engines (17)

| Engine | Status | Notes |
|--------|--------|-------|
| Scan | Beta | Mobile barcode workflow; works for stock scans |
| Partners / Affiliates | Beta | Payout tracking, ambassador programs; some limits pending |
| Growth | Planned | Revenue forecasting — future phase |
| Studio | Planned | Brand customization tools — future phase |
| Commerce (Shopify) | Early Access | Read-only connection; pilot readiness states implemented |
| Brand Setup | Planned | Business branding config — future phase |
| Timeline | Beta | Full activity log; searchable; deterministic |
| Audit Log | Live | System audit trail; all writes logged |
| Sync Log | Live | Shopify sync event history |
| Novi Messages | Beta | Message history page; using demo data until live AI |
| Calculation | Live | Unit cost, batch cost, margin calculator |
| Opportunities | Beta | Recommendations engine; deterministic rules |
| Business Bestie | Beta | AI brief; demo data; morning insights |
| Onboarding | Beta | 10-step flow; industry adaptation; demo workspace entry |
| Settings | Live | Business profile, team, billing, integrations |
| Reports / Analytics | Planned | Future phase |
| Wholesale | Planned | Future phase |

---

## Golden Path Status

**Order → Inventory → Production → Purchasing → Fulfillment**

| Step | Status | Notes |
|------|--------|-------|
| Order arrives (Shopify import or manual) | ✅ Working | Both import and manual creation functional |
| Inventory reservation visible | ✅ Working | Unfulfilled orders tracked in HQ |
| Production identified if needed | ⚠️ Partial | BOM link exists; auto-allocation pending |
| Purchasing risk surfaced | ✅ Working | Novi shows purchasing insight on PO page |
| Pick/pack prepared | ⚠️ Partial | Warehouse queue exists; auto-generation pending |
| Fulfillment status advances | ✅ Working | Shipment queue tracks status |
| Customer context updated | ✅ Working | CustomerHub shows order history |
| Novi watches exceptions | ✅ Working | Demo insights flag blockers in all key engines |
| Command Center reflects result | ✅ Working | HQ summary includes unfulfilled + activity log |

---

## Status Definitions

- **Live** — Full quality gate met
- **Beta** — Core works, some edge cases missing, labeled Beta  
- **Early Access** — Selected users, functional but not fully validated
- **Demo** — Illustrative only, clearly labeled, no real data
- **Planned** — Not yet built, on roadmap, no fake activity
