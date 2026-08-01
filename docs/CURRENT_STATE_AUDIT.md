# ShimmerStock — Current State Audit

**Inspection date:** 2026-08-01 (second pass; supersedes the first-pass audit merged via PR #5 at `4269f81`)
**Inspected by:** technical-writer (delegated session), documentation-only — no production code, tests, migrations, branches, or PRs were modified to produce this audit.
**Repository:** `glitterqueen22/ShimmerStock`

**Branch/commit context at inspection time (verified via local clean clones and `git ls-remote`; GitHub API access is currently broken — see below):**

| Ref | Commit | Status |
|---|---|---|
| `main` (default) | `e878019` | **RED.** Fresh full-suite run by this session on a clean checkout: **44 pass / 5 fail / 126 expect() across 9 files (5.65s)**. Output quoted in §1 below. |
| `revert/rate-limiter-regression` | `25830c1` | Pushed to origin (confirmed via `git ls-remote origin`). Reverts PR #7. **No PR exists** — PR creation is blocked: `gh auth status` reports "The token in GH_TOKEN is invalid" and API calls return `HTTP 401: Bad credentials` (verified directly by this session). |
| PR #7 `security/auth-rate-limiting` | merged `e878019` | Merged 2026-08-01 with green CI on the branch; introduced the fresh-main regression above. |
| PR #6 `security/forgot-password-token-exposure` | merged `a07d6df` | Merged; the token-exposure finding from the first-pass audit is **fixed** (see §1). |
| PR #5 `docs/current-state-audit-and-roadmap` | merged `4269f81` | First pass of this audit + roadmap. |
| PR #4 `feature/test-foundation-part2a` | merged `6b96830` | Automated Tests Part 2A (Shopify OAuth/webhooks) — now merged; the first-pass audit's "open PR" status is stale. |

**Working-tree caveat:** `/home/team/shared/site` (the shared working tree) currently lags `origin/main` by two commits — it still contains the pre-PR-#6 `server/index.js` (token leak visible at its lines 304–320) and has no rate-limiter code. All code citations in this audit were verified against a clean checkout of `main` @ `e878019`, not against the stale tree. Any session reading code from `/home/team/shared/site` should treat `server/index.js` and `server/auth.js` there as outdated.

**Local full-suite test run performed directly by this session on `main` @ `e878019`:**
```
ENCRYPTION_KEY="0123…abcdef" bun test
 44 pass
 5 fail
 126 expect() calls
Ran 49 tests across 9 files. [5.65s]
5 tests failed (all in tests/auth.test.ts):
 (fail) POST /api/auth/login > succeeds with valid credentials and returns a session token
 (fail) POST /api/auth/login > returns 401 for wrong password
 (fail) POST /api/auth/login > never returns password_hash in the response body
 (fail) POST /api/auth/login > returns user business list with correct business info
 (fail) POST /api/auth/logout > invalidates the session so it can no longer be used
Representative error: expect(res.status).toBe(200) → Received: 429
 {"error":"Too many failed login attempts, please try again in 899 seconds."}
   at loginAs (tests/helpers/test-harness.js:174)
```
**Root cause (read directly from source):** PR #7 added module-level in-memory attempt Maps to `server/auth.js` (`loginAttempts` / `forgotAttempts`, `WINDOW_MS = 15 min`, `MAX_LOGIN_FAILURES = 5`, `MAX_FORGOT_ATTEMPTS = 3`, keyed by `ip:username` — `server/auth.js:153-215`, mounted at `server/index.js:80` and `:295`). The test harness boots one shared server process per run; failed-attempt state accumulates across tests sharing the same `ip:username` key, so once any five login failures occur, every subsequent login in the run receives HTTP 429. The 4 new tests in `tests/rate-limit.test.ts` (added by PR #7, 89 lines) pass; the 5 pre-existing auth tests that share limiter state fail. This is a test-isolation defect in the limiter's state design, not evidence that the limiter rejects correct credentials in a fresh process.

---

## Evidence legend

**Definition-of-Done level** (blueprint Part I §16 / founder's five-level scale) — tagged per row where it adds precision:
1. **Designed** — written spec/plan only, no code.
2. **Built** — code exists and compiles/runs in isolation.
3. **Connected to real data** — wired to the real DB/API, not a mock, but not proven under test.
4. **Validated end-to-end** — observed working via an automated test or a direct manual run performed by an inspector.
5. **Production-ready** — validated, plus monitoring/rollback/docs in place for real operation.

**Row classification** — exactly one of:
- **Verified complete** — directly executed/observed by this audit and it does what's claimed at a "validated end-to-end" level for the scope stated.
- **Implemented but unverified** — code/routes/tables exist (confirmed by direct file read) but this audit did not execute or test them.
- **Partial** — some pieces built/verified, other required pieces are missing or unverified.
- **Not started** — no code found. (Decorative UI, simulated data, and nonfunctional buttons count as *not started*, never as complete.)
- **Blocked** — cannot proceed without an external decision or dependency.
- **Intentionally deferred** — a documented decision exists to postpone this (cite the decision).

All file/line references were read directly from a clean checkout of `main` @ `e878019` during this audit. Where a claim comes only from an existing markdown doc and was **not** independently re-verified, that is stated explicitly.

---

## 1. P0 Production Hardening Sprint (business plan items)

| Item | Classification | DoD level | Evidence |
|---|---|---|---|
| P0.1 GitHub repo, private, MIT removed | Verified complete | 5 | Commit `5dc2038` "Remove MIT license" in `main` history; no `LICENSE` file in tree. (First-pass verification stands; re-confirmed in `git log`.) |
| P0.2 Credential rotation | Verified complete | 4 | `server/crypto-utils.js` reads `process.env.ENCRYPTION_KEY` with no fallback and throws if absent (`crypto-utils.js:29-40`). `tests/boot-safety.test.ts` passes in this session's run (3 tests). |
| P0.3 Session multi-tenancy | Verified complete | 4 | `server/db.js` idempotent `ALTER TABLE sessions ADD COLUMN business_id` migration; `tests/tenant-isolation.test.ts` passes in this session's run (16 tests incl. 3 forged-`business_id` cases). Evidence narrative file still lives only outside the repo (`/home/team/shared/design/p0.3-tenant-isolation-evidence.md`) — previously flagged, unchanged. |
| Secret scan + key rotation procedure | Implemented but unverified (by this audit) | — | `design/key-rotation-procedure.md`, `design/secret-scan-report.md` exist in-repo. truffleHog not re-run this pass. The live secret-exposure bug found in the first pass is now **fixed** — see next row. |
| Forgot-password token exposure (first-pass finding) | Verified complete (fixed via PR #6) | 4 | `server/index.js:295-…` (post-PR-#6): handler stores only the hashed token (`store.createResetToken` at :315) and prints a redacted banner with **no token**; `tests/auth.test.ts` "POST /api/auth/forgot-password > does not return resetToken in the response" **passes** in this session's run. |
| Auth rate limiting (PR #7) | **Blocked** (merged but regressed; revert pending) | 2 | PR #7 merged at `e878019` adding `server/auth.js:153-215` limiters + `tests/rate-limit.test.ts` (4 tests, passing). Fresh-`main` full suite is **red: 44/5** (run quoted above) because limiter state is shared across tests in one server process. Revert commit `25830c1` is pushed on `revert/rate-limiter-regression`; PR creation is **blocked by invalid `GH_TOKEN`** (`gh auth status`: "The token in GH_TOKEN is invalid"; API `HTTP 401`, verified by this session). Tracked as roadmap Milestone 0. |
| Branch protection + CI | Verified complete (CI pipeline); Implemented but unverified (protection settings) | 4 (CI), 2 (protection) | `.github/workflows/ci.yml` runs install/build/test. Latest CI on PR #7's branch was green pre-merge (per prior session's `gh pr checks 7`); post-merge `main` CI status could **not** be checked this pass because the GitHub API token is invalid. Branch-protection *settings* still never confirmed via API — now unverifiable until credentials are restored. |
| Backup + restoration | Partial | DB-level: 4; App-level: 2 | `scripts/backup.sh`, `scripts/restore.sh`, `BACKUP.md` unchanged since first pass. Application-level restore drill (boot server against restored DB) still not performed. Cron-exposes-`ENCRYPTION_KEY` caveat still open. |
| Automated Tests — Part 1 | Verified complete | 4 | Merged at `6cae66c` (PR #3). Re-run as part of this session's 49-test suite. |
| Automated Tests — Part 2A | **Verified complete — now merged** | 4 | PR #4 merged at `6b96830`. `tests/shopify-oauth.test.ts` (4) and `tests/shopify-webhooks.test.ts` (4) pass in this session's fresh-`main` run. First-pass "OPEN PR" status is stale. |
| PostgreSQL migration proposal | Intentionally deferred | 1 (Designed) | Proposal at `/home/team/shared/design/postgresql-migration-proposal.md` (shared workspace). Recommendation: do not migrate now. Cited, not re-derived. |
| Monitoring & Logging | Not started | 0 | `package.json` dependencies remain exactly `cors`, `express`, `html5-qrcode`, `react`, `react-dom`, `react-router-dom` — no error tracker, no structured logger. 721 `console.*` calls across 56 `server/*.js` files (counted this pass). Still no unauthenticated liveness route; `DEPLOYMENT.md` still misdocuments `/api/health` (see §6). |
| Environments (dev/staging/prod) | Not started | 0 | Single `.env`, single `shimmerstock.db`, no environment separation found. |
| Durable background processing | Not started | 0 | No scheduler/queue found (`setInterval`/cron/job-queue grep across `server/` = no matches). `server/events.js` is synchronous in-process pub/sub only. `shopify_sync_log` failure rows exist but nothing consumes them for retry/alert. |

---

## 2. Blueprint Part I §11 Technical Architecture Requirements

| Requirement | Classification | Evidence |
|---|---|---|
| §11.1 Multi-tenant SaaS foundation | Verified complete (for the paths under test) | `tests/tenant-isolation.test.ts` 16/16 pass in this session's run (products, orders, movements, users + forged-`business_id`). `server/auth.js` `requireAuth` sets `req.businessId` from session. Other domains implement the same `business_id` pattern but remain untested (implemented-but-unverified). |
| §11.2 Domain-oriented architecture | Verified complete (structurally) | One route/store module pair per domain in `server/` (56 top-level `.js` files + `commerce/`, `providers/`, `migrations/` subdirs at inspection time). Structural claim only. |
| §11.3 Event model | Implemented but unverified | `server/events.js` in-process emitter (`emit`/`on`/`off` — the "subscription" at `events.js:63` is pub-sub bookkeeping, not commerce subscriptions). Not durable, not idempotent, no dead-letter. Falls short of the §11.3 "durable, idempotent" language and of the v4 ShimmerFlow bar (see §6). |
| §11.4 Integration reliability | Partial | HMAC verification + replay dedup validated (`tests/shopify-webhooks.test.ts`, pass this run; webhook routes mounted before JSON parser). `shopify_sync_log` has `idempotency_key` + unique index `(business_id, idempotency_key)` (`server/db.js:508,541-542`). No retry policy, no dead-letter queue, no sync-failure alerting found. |
| §11.5 AI architecture | Not started | Novi files exist (`bestie.js`, `novi-messages.js`, `novi-detection.js`, `novi-evolution.js`) but no approval-gate framework, evaluation datasets, or Novi regression tests found. |
| §11.6 Security | Partial | Fixed this pass: forgot-password exposure (PR #6, verified). Added but regressed: rate limiting (PR #7, Blocked — see §1). Remaining gaps: branch-protection enforcement unconfirmed (and currently unverifiable via API); no dependency review automation found. |
| §11.7 Reliability and observability | Not started | `audit_log` + `auditLog()` (`server/audit.js`) remain the one genuine observability primitive (implemented but unverified at the consumer level). No `/healthz`, no error tracking, no uptime checks, no alert routing. |
| §11.8 Performance | Not started | No budgets, load tests, or pagination audit found. Not evaluated in depth — flagged as an open gap. |

---

## 3. Engine-level inventory (28 engines per `ARCHITECTURE.md`)

Every engine still has code present in `server/`; **none has been validated end-to-end against real GGE data under the production-readiness standard.** The suite (49 tests) validates cross-cutting platform concerns, not engine business logic. This table is unchanged from the first pass except where noted.

| # | Engine | Module(s) | Classification |
|---|---|---|---|
| 1 | Inventory & Warehouse | `server/store.js`, `server/warehouse-store.js` | Implemented but unverified |
| 2 | Commerce (Shopify) | `server/commerce/`, `server/shopify.js`, `server/shopify-oauth-routes.js`, `server/shopify-webhook-routes.js` | Partial — OAuth + webhook HMAC/dedup validated by tests (Part 2A, now merged); order/product import business logic not covered |
| 3 | Commerce (Marketplaces) | `server/commerce/*.js` | Implemented but unverified |
| 4 | Production | `server/db.js` (BOM/batch tables) | Implemented but unverified |
| 5 | Calculation | `server/calc.js` | Implemented but unverified |
| 6 | Purchasing Intelligence | `server/purchasing-routes.js`, `server/store-purchasing-v32.js` | Implemented but unverified |
| 7 | Novi Companion | `server/bestie.js`, `server/novi-messages.js`, `server/novi-detection.js` | Implemented but unverified |
| 8 | Opportunity Center | `server/opportunities.js`, `server/opportunity-bridge.js` | Implemented but unverified |
| 9 | Business Health Score | `server/health.js` | Implemented but unverified |
| 10 | Manual Orders | `server/store.js` (orders) | Partial — isolation tests cover order read/list; creation rules uncovered |
| 11 | PO Receiving | `server/db.js` (`receiving_events`) | Implemented but unverified |
| 12 | Manufacturing | `server/db.js` (`production_batches`) | Implemented but unverified |
| 13 | Warehouse Operations | `server/warehouse-routes.js`, `server/warehouse-store.js` | Implemented but unverified |
| 14 | Customer Service | `server/cs-routes.js`, `server/cs-store.js` | Implemented but unverified |
| 15 | Partner HQ | `server/partner-routes.js`, `server/partner-store.js` | Implemented but unverified |
| 16 | Daily Business Replay | `server/timeline.js`, `server/timeline-routes.js` | Implemented but unverified |
| 17 | Customer Hub | `server/customer-routes.js`, `server/customer-store.js` | Implemented but unverified |
| 18 | Studio | `server/studio-routes.js` | Implemented but unverified |
| 19 | Growth Intelligence | `server/growth-routes.js` | Implemented but unverified |
| 20 | Novi Evolution | `server/novi-evolution.js` | Implemented but unverified |
| 21 | Team HQ | `server/team-routes.js`, `server/hq.js` | Partial — RBAC tests pass; broader features unverified |
| 22 | Fulfillment HQ | `server/fulfillment-routes.js` | Implemented but unverified |
| 23 | Adaptive Onboarding | `server/onboarding-routes.js` | Implemented but unverified |
| 24 | Affiliate Attribution | `server/affiliate-attribution*.js` | Implemented but unverified |
| 25 | Affiliate Program | `server/affiliate-routes.js`, `server/affiliate-store.js` | Implemented but unverified |
| 26 | AI Brand Setup | `server/ai-brand-setup*.js` | Implemented but unverified |
| 27 | Industry Config | `server/industry-routes.js` | Implemented but unverified |
| 28 | Store Credit | `server/store-credit-routes.js` | Implemented but unverified |

---

## 4. Blueprint Part I §8 Core Platform Modules (Commerce Core 1.0 relevant subset)

| Blueprint module | Classification | Evidence |
|---|---|---|
| §8.1 Organization, tenancy, accounts | Partial | Multi-business, roles, RBAC, audit log exercised by tests. Usage metering, plan feature flags, account-closure/export: not found. |
| §8.2 Onboarding | Implemented but unverified | `server/onboarding-routes.js` + `onboarding_state` table. No walkthrough performed. |
| §8.3 Products and catalog | Implemented but unverified | Product/variant tables + routes (`variant-routes.js`, `variant-store.js`); product tenant isolation validated. See also §8 "Product Studio" row below. |
| §8.4 Orders and fulfillment | Partial | Order read/list/isolation validated. `orders.status` is free-text (`DEFAULT 'pending'`, **no CHECK constraint** — `server/db.js:369`); `order_shipments.status` has a real enum (`CHECK(status IN ('pending','picking','shipped','delivered'))` — `db.js:2611-2612`). Returns/refunds (`returns_refunds`, `db.js:1321`), store credit (`customer_store_credit` + redemptions, `db.js:2574,2591`) exist but unverified. |
| §8.5 Inventory and warehouse | Implemented but unverified | `inventory_movements` ledger (`db.js:327`), `inventory_reservations` (**production-batch-scoped** — `batch_id REFERENCES production_batches(id)`, `db.js:814-826`), bins/transfers tables. No inventory-logic tests. |
| §8.6 Purchasing and vendors | Implemented but unverified | `purchasing-routes.js`, `store-purchasing-v32.js`. No coverage. |
| §8.7 Manufacturing, recipes, production | Implemented but unverified | BOM/batch tables; no dedicated test. |
| §8.8 Customer service and CRM | Implemented but unverified | `cs-routes.js`, `cs-store.js`, `customer-routes.js`; `customer_notes` (`db.js:1307`); `packing_proof` artifact table (`db.js:1370`) with `addPackingProof` (`cs-store.js:439`). No coverage. |
| §8.9 Marketing/launch studio | Implemented but unverified | `studio-routes.js`: templates/assets/brand CRUD + `POST /api/studio/generate` (template + product data → content, `:140`) and `GET /api/studio/products` (`:421`). AI generation not exercised. |
| §8.10 Wholesale/B2B | Not started | No wholesale routes/price-list tables/B2B portal found. |
| §8.11 Affiliates/reps/ambassadors | Implemented but unverified | Two parallel affiliate systems still present (`affiliate-routes.js`/`affiliate-store.js` and `affiliate-attribution*.js`) — unresolved duplication, still flagged for owner. |
| §8.12 Money and profitability | Not started | No COGS/margin/profitability module beyond `calc.js` (production formula engine). |
| §8.13 Whatnot/live selling | Not started | No show-calendar/live-selling routes or tables found. |
| §8.14 Team, SOPs, approvals | Partial | `approvals` table (generic: `type`, `request_data` JSON, `requested_by`, `status`, `reviewed_by` — `db.js:1689-1704`), `approval-routes.js`, `team-routes.js`; RBAC validated. SOP library/training ack not found. |
| §8.15 ShimmerBox configurator | Not started | Zero matches for shimmerbox/configurator/option-group entities across `server/` and `client/src/` (re-grepped this pass). Blueprint-new, not a regression. |

---

## 5. Blueprint Part I §9 Flagship Differentiators

| Capability | Classification | Evidence |
|---|---|---|
| ShimmerScore | Implemented but unverified | `server/health.js` computes a health score; `/api/health` requires `reports.read`. Component explanations not validated. |
| Time Saved | Not started | No dedicated module/table. |
| Founder Mode | Not started | No matching module. |
| Business Timeline / celebrations | Implemented but unverified | `timeline.js`, `timeline-routes.js`; seed shows an "achievement" milestone event type (`db.js:1874`). |
| Business Wrapped | Not started | No matching module. |

---

## 6. Universal E-Commerce Layer (approved v4 layer) — capability audit

**Source:** `docs/SHIMMERSTOCK_MASTER_BLUEPRINT.md` Part II (owner-approved v4 layer, 2026-08-01) plus ShimmerBox (Part I §8.15) and Product Studio (Part II §11), which the owner named as v4 scope. Every capability the owner named is classified below. Citations are from the clean `main` @ `e878019` checkout. Per the owner constraint, **none of this section authorizes interruption of stabilization work** — sequencing lives in `docs/ROADMAP.md`.

| v4 capability (addendum §) | Classification | Evidence |
|---|---|---|
| **ShimmerFlow — no-code automation** (§2) | Not started | Zero matches for `shimmerflow` or `automation` across `server/` and `client/src/`. No workflow-definition/run tables. Only the in-process event bus (`server/events.js`) exists — it is synchronous, in-memory, and not durable, so it does not yet satisfy ShimmerFlow's idempotency/run-history bar. |
| **Shimmer Command — universal search/action bar** (§3) | Not started | No command bar or global search in `client/src/` (grep: no matches). Only one scoped search endpoint exists: `POST /api/orders/search-products` for manual-order product lookup (`server/index.js:2257-2267`). No saved views, no quick actions. |
| **Customer self-service portal — Shimmer Account** (§4) | Not started | Zero matches for `portal`/`self-service`. Note: `POST /api/waitlist/join` (`server/index.js:3467-3479`) is the **marketing-site waitlist for ShimmerStock itself** (collects name/email/business_type/current_software/pain_point) — it is not a merchant-customer feature and must not be miscounted as one. |
| **Order Care / Exception Center** (§5) | Not started | Primitives only: shipment status enum includes `'exception'` (`db.js:2148`); one aggregate count of exception shipments (`store.js:3912`); generic `approvals` table (`db.js:1689`); `orders.notes` column (`db.js:371`). No exception queue, no order-edit/hold/split/consolidation API, no "who is working on this order" lock found. |
| **Channel inventory allocation, drops, preorders, waitlists** (§6) | Not started | Zero matches for `allocat`. `inventory_reservations` exists but is **production-material reservation only** (`batch_id NOT NULL REFERENCES production_batches`, `db.js:814-826`) with a bare `status DEFAULT 'reserved'` — no channel/purpose dimension, no quantity-cap/oversell policy, no drop/preorder tables. |
| **Custom Order and Proofing Studio** (§7) | Not started | Zero matches for custom-order proofs/approvals/deposits. The existing `packing_proof` table (`db.js:1370-1374`, `proof_type DEFAULT 'photo'`) + `addPackingProof` (`cs-store.js:439`) is **warehouse packing photo proof**, a different concept — but it is the right artifact pattern to generalize (see roadmap "Foundational decisions" #9). |
| **Shipping intelligence** (§8) | Partial | Built-but-unverified: split-shipment tables (`order_shipments`, `order_shipment_items`, `db.js:2605-2625`), manual shipment creation with carrier/tracking/cost (`fulfillment-routes.js:282-314`), printable label/packing-slip data (`fulfillment-routes.js:551`), delivery-exception status value. Not started: address validation, rate shopping, carrier-integrated label purchase, batch labels, shipping rules, insurance/claims, branded tracking page, carrier performance and margin reporting. No provider-adapter layer for carriers exists (`server/providers/` contains commerce-channel providers only). |
| **Promotions, discounts, Launch Room** (§9) | Not started | No promotion engine (no discount rules/stacking/scheduling tables). Discount concepts appear only inside affiliate/partner coupon context (`partner-store.js`) and as Novi *suggestion text* ("Run a promotion…" — `growth-routes.js:652-654,684`). No Launch Room workspace. |
| **Subscription and Replenishment Hub** (§10) | Not started | No selling plans, subscription contracts, renewal, or dunning tables. The only `subscription` match is event-bus bookkeeping (`events.js:63`) — unrelated. |
| **Storefront Studio** (§11) | Not started | Zero matches for `storefront`. The existing Studio engine (`studio-routes.js`) generates marketing content from templates — it does not manage Shopify theme/announcement/menu/collection merchandising. |
| **Migration and Data Health Center** (§12) | Partial | Built-but-unverified: Shopify connection + product/order import path (`server/sync.js`, `shopify_sync_log` with idempotency and `provider`/`external_id` columns — `db.js:508-534`), and a Sync Log UI (`client/src/pages/SyncLog.tsx`). Not started: CSV/spreadsheet mapping, dry-run, duplicate detection, data-quality reports (missing SKU/barcode/weight/cost), customer dedupe review, resumable background imports (no job queue exists), rollback plan, app-replacement checklist. |
| **Commerce Calendar and collaboration** (§13) | Partial | Built-but-unverified primitives: generic `approvals` (`db.js:1689`), `customer_notes` (`db.js:1307`), `supplier_notes` (`db.js:1145`), `activity_log`/`audit_log`. Not started: universal comments/@mentions/tasks/attachments on any object, shared commerce calendar. |
| **Risk, chargebacks, commerce protection** (§14) | Not started | Zero matches for `chargeback`; `fraud` matches are confined to affiliate self-referral controls (`is_self_referral` — `db.js:2702`; `affiliate-store.js`). No order-risk import, hold rules, review queue, blocklist/allowlist, or evidence-packet tooling. |
| **Mobile, offline, notifications** (§16) | Partial | Built-but-unverified: camera barcode scanner page (`client/src/pages/Scan.tsx` via `Html5Qrcode`, lines 2/46/104) and responsive layouts. Not started: zero matches for `offline` (no local queue, conflict handling, or resync), no push-notification infrastructure, no in-app notification center table found. |
| **Markets, localization, privacy readiness** (§15) | Not started | Single hardcoded `currency TEXT DEFAULT 'USD'` exists only on the affiliate-attribution table (`db.js:2699`). Zero matches for `timezone`; `locale` matches are `toLocaleString` display calls only. Timestamps are SQLite `datetime('now')` UTC text. No market/catalog/language/tax-presentation modeling; no data-export/deletion workflow found. |
| **ShimmerBox** (Part I §8.15, v4 scope per owner) | Not started | Zero matches for shimmerbox/configurator/ConfigurableProduct/OptionGroup anywhere in `server/` or `client/src/`. The §8.15 spec (entities, storefront behavior, 10 acceptance criteria) is the build target when scheduled. |
| **Product Studio** (§11, v4 scope per owner) | Partial | Built-but-unverified: catalog CRUD (products + `variant-routes.js`/`variant-store.js`; product tenant isolation **validated** by tests), template-driven product content generation (`studio-routes.js:140,421`), product media fields per `DATABASE.md`. Not started: listing health/channel reconciliation, option/choice modeling (see ShimmerBox), bulk merchandising, media workflow hooks. Addendum §11 naming note: Product Studio = catalog side; Storefront Studio = theme/merchandising side — do not conflate. |

**Summary counts for this section:** 2 Partial (shipping intelligence; migration/data health) + 2 Partial-pattern (calendar/collaboration; mobile/offline) + 1 Partial (Product Studio) = **5 Partial**; **13 Not started**; **0 Verified complete, 0 Blocked, 0 Intentionally deferred** among the 18 v4 capabilities. Nothing in this section was executed end-to-end by this audit; "Partial" rows are code-read classifications only.

---

## 7. Documentation vs. code contradictions found (cumulative)

1. **`DEPLOYMENT.md`** still documents `GET /api/health → {status, uptime}` "for monitoring and load balancer health checks." The actual route (`server/health.js`, `mountHealthRoutes`) requires `requireAuth(db, "reports.read")` and returns a Business Health Score. No unauthenticated liveness route exists. Still open.
2. **Shared-workspace evidence files** (`p0.3-tenant-isolation-evidence.md`, `postgresql-migration-proposal.md`, `palette-compliance-audit.md`) exist only outside version control (`/home/team/shared/design/`), while the business plan cites repo-relative paths. Still open.
3. **`README.md`** still says `## License — MIT — see [LICENSE](LICENSE)` though `LICENSE` was removed (`5dc2038`) and the project is proprietary. Still open.
4. **New this pass:** the `/home/team/shared/site` shared working tree lags `origin/main` by two commits (pre-PR-#6 `server/index.js`, no PR-#7 limiter). Sessions must not cite code from that tree without checking commit freshness (see header caveat).

---

## 8. Open verification gaps (things this audit could not directly confirm)

- GitHub branch-protection settings and post-merge `main` CI status — **unverifiable this pass** because `GH_TOKEN` is invalid (API returns 401). This is the same credential fault blocking the revert PR.
- Whether the "0 secrets in git history" scan finding still holds after PRs #4–#7 — truffleHog not re-run.
- Backup/restore not re-executed live; application-level restore drill still outstanding.
- No performance, load, or migration-rollback testing performed or found.
- 24 of 28 engines still have no automated coverage; "code present" remains the strongest supported claim.
- No real Shopify store was connected; all Shopify evidence is from mocked HMAC/OAuth tests.
- The two parallel affiliate code paths remain unresolved (owner decision).
- The exact behavior of the rate limiter under real multi-IP traffic is unverified (it was only observed through the test suite, where its shared-state design causes the regression).

---

*Re-run this audit (do not just re-read it) when: the revert PR merges and `main` goes green, the rate limiter is re-landed, any new PR merges to `main`, or before any Commerce Core 1.0 or v4-capability work begins.*
