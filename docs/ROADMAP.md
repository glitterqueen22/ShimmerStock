# ShimmerStock — Roadmap

**Date:** 2026-08-01 (second pass; supersedes the first-pass roadmap merged via PR #5 at `4269f81`)
**Companion documents:** `docs/CURRENT_STATE_AUDIT.md` (evidence — read first), `docs/SHIMMERSTOCK_MASTER_BLUEPRINT.md` (canonical direction: Part I v2 blueprint + Part II approved Universal E-Commerce v4 layer).
**Basis:** Blueprint Part I §13 (phases) and §21 (immediate sequence), Part II §18 (universal priority sequence), the owner's 2026-08-01 constraint that v4 capabilities must not interrupt stabilization, and what the audit found actually exists.

Priority order (unchanged, per the lead):
1. Full-suite test stability and CI
2. Tenant isolation / security
3. Observability and backup/restore
4. Core Shopify/order/product/inventory workflows
5. Role-based HQ
6. Only then: universal (v4) capabilities, in the Part II §18 order

---

## Existing work being preserved (not rebuilt)

- **PR #1–#5** — CI/branch-protection docs, backup/restore, Automated Tests Part 1, Part 2A (Shopify OAuth/webhooks), first-pass audit+roadmap. All merged.
- **PR #6** (`a07d6df`) — forgot-password token exposure removed; verified by this pass's fresh-`main` test run.
- **PR #7** (`e878019`) — auth rate limiting. **Merged but regressed `main`** (44 pass / 5 fail fresh-run, verified by this pass). Preserved as the subject of Milestone 0, not as a silent loss: the limiter code and its 4 passing tests are good work that must be re-landed correctly (see "Smallest next bounded engineering task").
- **Revert commit `25830c1`** — pushed on `revert/rate-limiter-regression`; PR creation blocked by invalid `GH_TOKEN`. Preserved exactly as-is; this roadmap does not modify it.

---

## Milestone 0 — ACTIVE STABILIZATION: get `main` green again (do this first, nothing else alongside it)

**Current verified state (2026-08-01, verified directly by the auditing session):**
- `main` @ `e878019`: full suite **44 pass / 5 fail / 9 files** (run transcript in `docs/CURRENT_STATE_AUDIT.md` document header). All 5 failures are pre-existing `tests/auth.test.ts` login/logout tests receiving HTTP 429 from PR #7's rate limiter.
- Root cause (read from source): PR #7's limiter keeps attempt state in module-level in-memory Maps (`server/auth.js:153-215`, `WINDOW_MS` 15 min, `MAX_LOGIN_FAILURES` 5, keyed `ip:username`); the shared test server accumulates failures across tests until valid logins are throttled.
- Revert commit `25830c1` ("Revert \"security: add auth rate limiting…(#7)\"") is pushed to origin on `revert/rate-limiter-regression` (confirmed via `git ls-remote`).
- **Blocker:** `GH_TOKEN` is invalid — `gh auth status` fails and API calls return `HTTP 401: Bad credentials` (verified). The revert **PR cannot be created** until GitHub API credentials are restored. This is the active stabilization dependency.

**Scope:**
1. Restore working GitHub API credentials (owner/lead action — see "Owner decisions required").
2. Open the revert PR from `revert/rate-limiter-regression` @ `25830c1` and merge it through the normal review path.
3. Immediately after merge, run the full suite on fresh `main` and confirm CI green.
4. Independent verification: a session other than the merging session re-runs the suite and records the result.

**Exclusions:** No attempt to fix the limiter forward inside this milestone (that is the next bounded task, below). No other merges. No v4-capability work of any kind.

**Dependencies:** GitHub credentials restored. Nothing else.

**Risk:** Low. The revert restores the last known-green tree (49→45 tests, because the revert removes PR #7's `tests/rate-limit.test.ts`). Residual risk: if branch protection is in fact enforced, the merge needs a second approver — same credential dependency.

**Acceptance criteria:**
1. `main` HEAD is the revert merge commit (or an equivalent green state explicitly approved by the lead).
2. Fresh-`main` `ENCRYPTION_KEY=… bun test` → **45 pass / 0 fail across 8 files** (document and explain any deviation).
3. Post-merge CI run on `main` is green (verified via `gh run list --branch main` once credentials work).
4. The independent verifier's transcript is captured alongside the merging session's.

**Evidence/exit gate:** two independent green test transcripts + CI status, pasted into the PR or follow-up commit. **No milestone below starts until this gate is met.**

---

## Smallest next bounded engineering task after Milestone 0 is independently verified

**Hand this to the next engineering session, verbatim, only after the Milestone 0 exit gate is met:**

> **Objective:** Re-land auth rate limiting (PR #7's intent) with test-isolated state — nothing else.
>
> **Current verified state:** `main` green post-revert (Milestone 0 evidence). Limiter design to reuse: `loginRateLimiter` / `forgotPasswordRateLimiter` and `tests/rate-limit.test.ts` from reverted commit `e878019` (recoverable from git history; do not re-cherry-pick blindly).
>
> **In scope:**
> - Reintroduce the login and forgot-password rate limiters with state that cannot leak across tests: e.g., an exported reset hook wired into the test harness's per-test setup, or per-request DI of the attempt store, or namespacing attempt keys per test database. Engineer's choice; the isolation mechanism must be named in the PR description.
> - Restore `tests/rate-limit.test.ts` (4 tests) and keep them passing.
> - Full suite run together, green.
>
> **Out of scope:** Rate limiting any non-auth endpoint. Changing limits/windows from PR #7's values (15 min window, 5 login failures, 3 forgot attempts). Any other security work. Any v4 capability.
>
> **Acceptance criteria:**
> 1. `tests/rate-limit.test.ts` passes (4 tests).
> 2. All pre-existing auth tests pass in the same run — the suite total returns to 49/49 across 9 files.
> 3. CI green on the PR; independent re-run of the full suite on fresh `main` after merge.
> 4. PR description states the isolation mechanism and why the Milestone-0 failure mode cannot recur.
>
> **Definition of Done:** per blueprint Part I §16 — commit hash, PR number, exact test command + full output, CI evidence, no secrets, independent review by the lead.

---

## Milestone 1 — Tenant-isolation test extension (resumes after the rate limiter is re-landed)

**Scope:** Extend `tests/tenant-isolation.test.ts`'s pattern from the 4 covered domains (products, orders, movements, users) to the three highest-risk domains Commerce Core will touch next: **purchasing, production/manufacturing, customer service** (including at least one forged-`business_id` case per domain).
**Exclusions:** Coverage of all 28 engines — ongoing backlog, not a blocker.
**Dependencies:** Milestone 0 + rate-limiter re-land (stable, green base).
**Acceptance criteria:** new isolation tests pass; full suite at 100% run together; CI green.

---

## Milestone 2 — Minimum launch observability + application-level restore drill

**Scope (unchanged from first pass, still not started per audit §1):**
- Real unauthenticated `GET /healthz` returning `{status, uptime}` (`/api/health` is the authenticated Health Score engine and must not be repurposed; `DEPLOYMENT.md` doc fix included).
- Error tracking (Sentry or equivalent — vendor decision is the owner's, below).
- Structured logging for auth, webhook, and payment-adjacent paths first (721 raw `console.*` calls across 56 server files exist today).
- Application-level restore drill: boot the real server against a freshly restored backup and run the smoke suite against it.
- Alert path for `shopify_sync_log` failure rows (table exists; nothing consumes it).
**Dependencies:** Milestone 0. Independent of Milestone 1.
**Acceptance criteria:** `curl /healthz` 200 unauthenticated; a deliberately triggered error reaches the tracker; restore-drill transcript (restore → boot → smoke tests) captured; sync-failure alert code path shown.

---

## Milestone 3 — Core Shopify/order/product/inventory slice (Commerce Core 1.0, first cut)

**Scope (unchanged from first pass):** one real Shopify dev store connected via OAuth; ≥5 real products/variants imported (verified by DB query); a real order arriving by webhook, HMAC-validated and deduplicated; inventory decrement visible in UI; one human pick/pack/ship pass recorded. Use `SHOPIFY_READ_ONLY=true` for the first pass per `DEPLOYMENT.md`.
**Dependencies:** Milestones 0–2. A real Shopify development store credential set (owner decision below).
**Acceptance criteria:** as first-pass Milestone 4 (six items, incl. rerunning the isolation suite for newly touched tables and screenshot evidence per blueprint Part I §16).

---

## Milestone 4 — Role-based HQ (first cut)

**Scope (unchanged from first pass):** Owner view (real revenue/orders/inventory-risk from Milestone 3 data) and warehouse view (real pick/pack queue), with empty/loading/error/permission-denied states. The other four role views and CEO Mode remain explicitly deferred.

---

## Foundational data-model and API-boundary decisions to preserve NOW

These are the only v4-era items that constrain work **before** Commerce Core is stable (blueprint Part II §18 "architecture now"; owner brief). They are decisions about shape, recorded to avoid rework — **they authorize no feature build-out**. Each is stated with what exists today (audit citations) and the decision to preserve.

| # | Decision | What exists today (evidence) | Preserve |
|---|---|---|---|
| F1 | **Tenant scoping** — every table and route is `business_id`-scoped; server derives tenant from session, never client input | `requireAuth` sets `req.businessId` from session (`server/auth.js`); runtime `ALTER TABLE … ADD COLUMN business_id` migrations; `tests/tenant-isolation.test.ts` (16 tests, passing) | Every future v4 entity (workflows, allocations, proofs, portal requests, promotions, subscriptions, imports, comments) carries `business_id NOT NULL` from its first migration and is covered by the isolation-test pattern before its feature ships. |
| F2 | **Canonical product/variant IDs** — internal integer PKs are canonical; external identities live in provider-mapped columns | `orders.shopify_order_id TEXT UNIQUE` (`db.js:364`); order lines carry `shopify_order_id`/`shopify_product_id` (`db.js:510-511`); sync log has `provider` + `external_id` with backfill (`db.js:513,524-534`) | New channels map through `provider`+`external_id`; internal IDs are never overloaded with channel IDs. A future canonical `product_external_ids` mapping table is acceptable; renaming internal keys is not. |
| F3 | **Orders/fulfillment state machine** — order and fulfillment statuses are closed enums, extended only by migration | `orders.status` is currently free-text `DEFAULT 'pending'` with **no CHECK** (`db.js:369`); `order_shipments.status` has a real enum `('pending','picking','shipped','delivered')` (`db.js:2611-2612`); shipment exception value exists (`db.js:2148`) | Before Order Care/edits/holds are built, freeze an explicit order-status enum via migration (pick/pack/ship-relevant states + hold/exception). Do not let new code invent status strings; the shipment enum is the model. |
| F4 | **Inventory ledger and allocation** — one inventory truth; allocation is a dimension of the ledger, never a parallel count | `inventory_movements` ledger (`db.js:327`); `inventory_reservations` is production-material-only (`batch_id NOT NULL REFERENCES production_batches`, `db.js:814-826`) | Channel/purpose allocation (Shopify, Whatnot, wholesale, preorder, subscription, VIP, replacement, safety stock) must extend the reservation concept on the same ledger (add `channel`/`purpose`/`expires_at`), not create a second availability number. |
| F5 | **Idempotency and event envelope** — mutating integrations and future workflows dedupe on a persisted key; domain events follow one envelope | `shopify_sync_log.idempotency_key` + unique index `(business_id, idempotency_key)` (`db.js:508,541-542`); webhook replay prevention tested (`tests/shopify-webhooks.test.ts`); `server/events.js` is in-memory pub/sub only | Standard envelope before ShimmerFlow: `{event_id, business_id, type, payload, occurred_at, idempotency_key}`, persisted (durable), with replay prevention. The in-memory bus may remain for UI hints but never as the record of a business event. |
| F6 | **Auditability** — every consequential mutation writes an audit event | `audit_log` table + `auditLog()` (`server/audit.js`), called from 23+ files; `activity_log` exists for timeline | All v4 mutations (order edits, allocation changes, proof approvals, workflow activations, promotion publishes) call `auditLog()` with actor, before/after, and source. No unaudited mutation paths. |
| F7 | **Permissions** — granular `domain.action` permissions enforced server-side | `role_permissions` table; `requireAuth(db, "orders.write")` pattern; `tests/role-enforcement.test.ts` passing | New v4 surfaces register namespaced permissions (e.g., `exceptions.write`, `allocations.write`, `proofs.approve`, `automations.write`) before any UI is built; search/command surfaces must filter by permission. |
| F8 | **External IDs** — provider-scoped external identity on every synced entity | `provider` + `external_id` columns on `shopify_sync_log` with backfill from `shopify_order_id`/`shopify_product_id` (`db.js:524-534`) | Every synced entity (orders, products, customers, shipments) carries `(provider, external_id)` with a uniqueness rule per tenant, so future channels (Part I §11.2) do not require schema rewrites. |
| F9 | **Custom-order/proof artifacts** — customer-facing artifacts are immutable, versioned, tenant-scoped snapshots linked to their order | `packing_proof` (`db.js:1370-1374`, `proof_type DEFAULT 'photo'`) + `addPackingProof` (`cs-store.js:439`); blueprint Part I §8.15 requires immutable `ConfigurationSnapshot` on orders | Generalize the `packing_proof` shape for proofs/configurations: artifact table with `business_id`, linked order, version, immutable snapshot payload, actor, timestamps. Later catalog edits must never mutate historical order artifacts. |

---

## Universal-capability phases — only after a stable Commerce Core (blueprint Part II §18 order)

Sequencing rule (owner constraint): nothing below starts before Milestones 0–4 are done and Commerce Core is verified stable with real GGE data. Blueprint Part I Phase 2 (Production & Industry DNA) is also gated behind Commerce Core; the lead interleaves it with Phase U1 based on GGE pilot needs (default: Production & Industry DNA first, because GGE's operating loop requires production — flagged for owner confirmation below).

**Phase U1 — First expansion (Part II §18 "First expansion" order):**
1. Shimmer Command (universal search/action bar)
2. Order Care / Exception Center (requires F3)
3. Inventory allocation + preorder/drop controls (requires F4)
4. Migration and Data Health Center (extends the existing Shopify import path; requires durable background jobs — currently absent, audit §1)
5. Customer self-service for order status, claims, eligible returns (onto the existing returns/credit backend — no parallel engine, Part III §C2)
6. Custom Order and Proofing Studio (requires F9)
7. Shipping intelligence basics (extends existing shipment recording; provider-adapter layer per Part II §8)
8. ShimmerFlow templates for the highest-frequency workflows (requires F5 durable events + F1/F6/F7)

**ShimmerBox milestone (Part I §8.15 acceptance criteria — the GGE "Build Your Own Freshie Starter Box" end-to-end proof):** scheduled after Phase U1 item 3, because its inventory behavior depends on reservation/allocation primitives (F4), and its order snapshot depends on F9. Its 10 acceptance criteria in Part I §8.15 are the exit gate, unchanged.

**Phase U2 — Growth (Part II §18 "Growth phases" order):** promotions + Launch Room; Subscription and Replenishment Hub (commerce contracts only — separate from ShimmerStock SaaS billing, Part II §10); deeper Storefront Studio; risk/chargeback tooling.

**Phase U3 — Later:** international markets/localization depth (today: one hardcoded `USD` default, audit §6); native loyalty/referrals/reviews/wishlists only after the core is reliable — integrations first.

**Blueprint Part I Phases 2–7** (Production & Industry DNA; Novi Command Center; CS + Marketing Magic; Profit/ShimmerScore/Founder Mode; Wholesale/affiliates/live commerce; Ecosystem) remain approved direction behind the same Commerce Core gate, interleaved with U1–U3 by the lead per pilot needs.

---

## Owner decisions required

1. **Restore GitHub API credentials** — blocks Milestone 0 (revert PR creation) and all CI/branch-protection verification. `GH_TOKEN` currently returns `HTTP 401` (verified 2026-08-01).
2. **Monitoring vendor and budget** (Milestone 2) — error-tracking/uptime choice, account ownership, recurring cost. Same decision shape as the PostgreSQL proposal flagged.
3. **Real Shopify development store for GGE** (Milestone 3) — cannot be simulated with mocked fixtures and still satisfy "prove GGE can run its operating loop."
4. **Canonical affiliate path** — `affiliate-routes.js`/`affiliate-store.js` vs. `affiliate-attribution*.js` duplication (audit §4 §8.11) — decide before any affiliate milestone.
5. **U1 vs. Production & Industry DNA interleave** — confirm the default (Production & Industry DNA first for GGE's loop) or choose a different order.

---

## What this roadmap does not change

- No production code, tests, migrations, branches, or PRs are modified by this document.
- The active stabilization dependency (PR #7 regression; revert `25830c1` pushed; PR blocked on `GH_TOKEN`) is recorded, not resolved, here.
- No v4 capability is scheduled before Commerce Core stability; the F1–F9 decisions constrain shape only.
- The v2 blueprint phases and the Part II §18 priority sequence are both preserved; conflicts are flagged for the owner rather than silently resolved.
