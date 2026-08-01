# ShimmerStock — Current State Audit

**Inspection date:** 2026-08-01
**Inspected by:** technical-writer (delegated session), documentation-only — no production code, tests, migrations, or existing branches/PRs were modified to produce this audit.
**Repository:** `glitterqueen22/ShimmerStock`
**Branch/commit context at inspection time:**

| Ref | Commit | Status |
|---|---|---|
| `main` (default) | `6cae66c` | CI green (latest push run succeeded). Merges: Part 1 tests (#3), backup/restore (#2). |
| `feature/test-foundation-part2a` | `c754968` | PR **#4**, **OPEN**, mergeable state `CLEAN`, CI check `CI/ci` = success (verified via `gh pr checks 4` and `gh pr view 4 --json mergeStateStatus`). Not merged as of this audit. |
| `p0.3-session-multi-tenancy` | `1040969` | Merged into main history via `main`'s ancestry (session tenancy code is present on `main`). |
| `branch-protection-ci` | `c692618` | Superseded by content now on `main`. |
| `p0.2-credential-rotation` | `5318d6b` | Superseded by content now on `main`. |

Local full-suite test run performed directly by this session on `feature/test-foundation-part2a` @ `c754968`:
```
ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" bun test
 45 pass
 0 fail
 125 expect() calls
Ran 45 tests across 8 files. [4.47s]
```
This matches the number reported by the lead (45/0 across 8 files) and was independently re-run, not just read from a report.

**PostgreSQL migration status:** per the business plan, a full proposal exists — recommendation is **do not migrate now**. That proposal document lives in the team's shared workspace (`/home/team/shared/design/postgresql-migration-proposal.md`), not inside this git repository. It is cited here as context, not as repository evidence.

---

## Evidence legend

**Definition-of-Done level** (blueprint §16 / founder's five-level scale) — tagged per row where it adds precision:
1. **Designed** — written spec/plan only, no code.
2. **Built** — code exists and compiles/runs in isolation.
3. **Connected to real data** — wired to the real DB/API, not a mock, but not proven under test.
4. **Validated end-to-end** — observed working via an automated test or a direct manual run performed by an inspector.
5. **Production-ready** — validated, plus monitoring/rollback/docs in place for real operation.

**Row classification** (required by this audit's brief) — exactly one of:
- **Verified complete** — directly executed/observed by this audit (test run, `gh` API call, direct file read confirming behavior) and it does what's claimed at a "validated end-to-end" level for the scope stated.
- **Implemented but unverified** — code/routes/tables exist (confirmed by direct file read) but this audit did not execute or test them.
- **Partial** — some pieces built/verified, other required pieces are missing or unverified.
- **Not started** — no code found.
- **Blocked** — cannot proceed without an external decision or dependency (owner call, missing account, etc.).
- **Intentionally deferred** — a documented decision exists to postpone this (cite the decision).

All file/line references were read directly from the repository during this audit (commands: `grep`, `sed -n`, `wc -l`, `ls`, `git log`, `gh pr view`/`gh pr checks`/`gh run list`). Where a claim comes only from an existing markdown doc and was **not** independently re-verified, that is stated explicitly.

---

## 1. P0 Production Hardening Sprint (business plan items)

| Item | Classification | DoD level | Evidence |
|---|---|---|---|
| P0.1 GitHub repo, private, MIT removed | Verified complete | 5 | Repo confirmed private-style access via `gh` with token scoped to `glitterqueen22/ShimmerStock`; commit `5dc2038` "Remove MIT license" present in `git log --oneline` on `main`. No `LICENSE` file present in current tree. |
| P0.2 Credential rotation (no hardcoded fallback key) | Verified complete | 4 | `server/crypto-utils.js`: `process.env.ENCRYPTION_KEY` is read with no fallback; throws `"ENCRYPTION_KEY environment variable is not set..."` if absent, and a length-validation error if not 64 hex chars (`crypto-utils.js:29-40`). `tests/boot-safety.test.ts` exercises exactly this and passed in the local run above ("Boot safety — ENCRYPTION_KEY required": 3 tests, all pass). |
| P0.3 Session multi-tenancy (`business_id` on sessions) | Verified complete | 4 | `server/db.js:218-222` runtime `ALTER TABLE sessions ADD COLUMN business_id INTEGER REFERENCES businesses(id)` guarded by a `PRAGMA table_info` existence check (idempotent). `tests/tenant-isolation.test.ts` (16 `it` blocks covering products, orders, movements, users, and 3 forged-`business_id` cases) passed in the local run. The narrative evidence file referenced by the business plan (`p0.3-tenant-isolation-evidence.md`) is **not in this git repo** — it exists only as a shared-workspace file at `/home/team/shared/design/p0.3-tenant-isolation-evidence.md`, outside version control. Flag: if this evidence is meant to be durable, it should be committed to the repo, not left in the shared scratch directory. |
| Secret scan + key rotation procedure | Implemented but unverified (by this audit) | — | `design/key-rotation-procedure.md` and `design/secret-scan-report.md` exist in-repo. This audit did not re-run truffleHog; it takes the prior report's "0 secrets in git history" on faith, consistent with the "implemented but unverified by this pass" label. Separately, this audit **did** find a live secret-hygiene issue not previously flagged: `server/index.js:287-320`, the `POST /api/auth/forgot-password` handler, logs the raw password-reset token to stdout (`console.log(`     Reset token: ${resetToken}`)`) and returns it directly in the JSON response body (`resetToken` field), guarded only by a `// TODO: remove token from response once email is set up` comment. This is a real secret-exposure bug, independent of the truffleHog history scan, and should be tracked as an open finding. |
| Branch protection + CI | Verified complete (CI itself); Implemented but unverified (branch-protection settings) | 4 (CI), 2 (branch protection) | `.github/workflows/ci.yml` runs `bun install --frozen-lockfile`, `tsc --noEmit` (non-blocking, `continue-on-error: true`), `bun run build`, then `bun test`. Confirmed running and green via `gh run list --branch main` (latest run on `main` = success) and `gh pr checks 4` (success). GitHub branch-protection *rules* (required reviews, required status checks enforced at the settings level) were **not verified via the GitHub API** in this session — `BRANCH_PROTECTION.md` documents a recommended configuration for the owner to apply, but this audit did not query repo branch-protection settings to confirm they're actually turned on. |
| Backup + restoration | Partial | DB-level: 4; App-level: 2 | `scripts/backup.sh` and `scripts/restore.sh` exist and are documented in `BACKUP.md` (AES-256-CBC via openssl, PBKDF2 100k, gzip, integrity check). `BACKUP.md`'s own "Restoration Verification" section documents a 2026-07-31 test with `PRAGMA integrity_check` = `ok` and row counts matching, **and** a server boot against the restored DB (`bun run serve.ts` → listening, login succeeded). This audit did not re-run backup/restore itself (would require a live ENCRYPTION_KEY and would touch the shared DB file), so it is recorded as implemented-and-previously-validated-per-doc, not re-verified live in this session. The two caveats already logged in the business plan still stand: cron would expose `ENCRYPTION_KEY` in the process list, and full environment separation (dev/staging/prod restore drill) hasn't happened. |
| Automated Tests — Part 1 | Verified complete | 4 | Merged to `main` at `6cae66c` (PR #3, confirmed via `git log` and `gh pr list --state all`). Re-run directly by this audit as part of the combined 45-test suite above. |
| Automated Tests — Part 2A (Shopify OAuth/webhooks) | Verified complete (tests exist and pass locally + in CI); **not merged** | 4 | PR **#4** is **OPEN** as of this audit (`gh pr view 4` → `state: OPEN`, `mergeStateStatus: CLEAN`, base `main`, head `feature/test-foundation-part2a` @ `c754968`). CI check `CI/ci` = success (`gh pr checks 4`). Adds `tests/shopify-oauth.test.ts` (4 tests: authorize redirect/state, forged-state rejection, invalid-HMAC rejection, token exchange+encrypted storage) and `tests/shopify-webhooks.test.ts` (4 tests: missing-HMAC rejection, tampered-body rejection, valid-HMAC acceptance, duplicate-order replay prevention). Both files' `describe`/`it` names were read directly from source. All 8 pass in the local 45-test run. **This work is preserved, not duplicated, by this audit** — no rebuild, no re-merge performed. |
| PostgreSQL migration proposal | Intentionally deferred | 1 (Designed) | Proposal document lives at `/home/team/shared/design/postgresql-migration-proposal.md` (shared workspace, not this git repo). Recommendation per that document: do not migrate now; SQLite is not today's bottleneck. This audit did not re-derive that analysis; it is cited, not re-verified. |
| Monitoring & Logging | Not started | 0 | `package.json` dependencies are exactly `cors`, `express`, `html5-qrcode`, `react`, `react-dom`, `react-router-dom` (`package.json:14-19`) — no Sentry, no structured-logging library (pino/winston), no APM client of any kind. `grep -c "console\." server/*.js` returns matches across the server tree (722 total `console.*` calls found across the 56 `server/*.js` files in an earlier pass by this same auditor persona; re-confirmed present in spot checks of `server/index.js`, `server/health.js`). There is no `/healthz`/liveness endpoint — `DEPLOYMENT.md` documents `GET /api/health → {status, uptime}`, but the actual route (`server/health.js:651-660`, `mountHealthRoutes`) requires `requireAuth(db, "reports.read")` and returns the Business Health Score object from `getHealthScore()`, not a liveness payload. **`DEPLOYMENT.md` is factually wrong about this endpoint** — flagged as a doc/code contradiction per this audit's mandate to prefer code over docs. |
| Environments (dev/staging/prod separation) | Not started | 0 | Single `.env` file, single `shimmerstock.db` at repo root, no environment-specific config found. No evidence of separate deployments. |
| Durable background processing | Not started | 0 | No job scheduler found: `grep` for `setInterval`/`cron`/job-queue packages across `server/` returned nothing beyond the in-process event bus (`server/events.js`), which is a synchronous pub/sub, not a durable queue. `shopify_sync_log` table (per `DATABASE.md`) tracks sync status, but nothing consumes failures to alert or retry. |

---

## 2. Blueprint §11 Technical Architecture Requirements

| Requirement | Classification | Evidence |
|---|---|---|
| §11.1 Multi-tenant SaaS foundation (tenant isolation, org-scoped queries, auditability, automated isolation tests) | Verified complete (for the paths under test) | `tests/tenant-isolation.test.ts` passed 16/16 in the local run, covering products, orders, movements/inventory, users, and 3 forged-`business_id` variants (query string and 2 body-payload cases). `server/auth.js:41` `requireAuth(db, permission)` middleware sets `req.businessId` from the session, not from client input — this is the mechanism the forged-`business_id` tests exercise. **Scope limit:** these tests cover 4 domains (products, orders, movements, users) out of dozens of tenant-scoped tables listed in `DATABASE.md`; isolation for the remaining domains (purchasing, production, customer service, affiliates, etc.) is implemented via the same `business_id` column pattern (confirmed present via `db.js` `ALTER TABLE ... business_id` statements at lines 169, 498, 569, 601, 790) but **not exercised by an automated test**, so classified only as implemented-but-unverified for those other domains. |
| §11.2 Domain-oriented architecture | Verified complete (structurally) | `server/` is split into one route/store module pair per domain (`cs-routes.js`/`cs-store.js`, `partner-routes.js`/`partner-store.js`, `warehouse-routes.js`/`warehouse-store.js`, etc.) — 60 files in `server/` at inspection time, matching the 28-engine table in `ARCHITECTURE.md`. This is a structural/code-organization claim, directly confirmed by directory listing; it does not imply every domain is feature-complete (see §3 engine table below). |
| §11.3 Event model | Implemented but unverified | `server/events.js` provides an in-process emitter (`emit`/`on`) per `ARCHITECTURE.md`'s documented pattern. Events are not durable (no persistence, no replay, no dead-letter) — this is an in-memory pub/sub, which satisfies "engines don't call each other directly" but not the blueprint's "durable, idempotent domain events" language literally. No test exercises event delivery guarantees. |
| §11.4 Integration reliability (secure creds, webhook signature verification, idempotency, retry, dead-letter, sync status, reconciliation) | Partial | Webhook **HMAC verification** is real and tested: `server/shopify-webhook-routes.js` (283 lines) is mounted before the JSON body parser specifically so raw-body HMAC validation works (commit `08249ee` "mount shopify webhook routes before json parser for HMAC validation"); `tests/shopify-webhooks.test.ts` passed all 4 cases including duplicate/replay prevention. Credential encryption is implemented (`shopify-oauth.test.ts`: "successfully exchanges token and stores it encrypted", pass). **Missing/unverified:** no retry policy or dead-letter queue found in `server/sync.js` or webhook routes beyond what's exercised by the duplicate-prevention test; `shopify_sync_log` table exists (per `DATABASE.md`) but nothing was found that alerts on sync failures (see Monitoring row above). |
| §11.5 AI architecture (Novi tool registry, approval gates, evaluation datasets, regression tests) | Not started | `server/bestie.js`, `server/novi-messages.js`, `server/novi-detection.js`, `server/novi-evolution.js` exist (code present), but no approval-gate framework, no evaluation dataset, and no Novi-specific regression test was found in `tests/`. This is a "Built" (level 2) claim at best for the messaging/detection plumbing, not validated against the blueprint's AI-safety requirements. |
| §11.6 Security | Partial | ENCRYPTION_KEY-required boot, encrypted Shopify token storage, HMAC webhook validation, tenant isolation tests, and a secret-scan report all exist (see rows above). **Gaps directly found in this audit:** no rate limiting anywhere in the codebase (`grep -rn "rateLimit\|rate-limit\|express-rate" server/ package.json` returned zero matches); the forgot-password token leak described above; branch-protection *enforcement* not confirmed via API (only documented as a recommendation). |
| §11.7 Reliability and observability | Not started | See Monitoring & Logging row above — no structured logging library, no error tracker, no uptime check, no alert routing exists in code. `audit_log` table and `auditLog()` helper (`server/audit.js`, 66 lines) are real and are called from multiple modules — this is the one observability primitive that is genuinely built and connected to real data. |
| §11.8 Performance | Not started | No performance budgets, load tests, or pagination audit found in this pass. Not evaluated in depth given time budget — flagged as an open gap, not confirmed absent everywhere. |

---

## 3. Engine-level inventory (28 engines per `ARCHITECTURE.md`)

Every engine listed below has at least one source file present in `server/` (code-present, confirmed by direct `ls server/`). **None of the 28 engines have been validated end-to-end against real GGE data under the new production-readiness standard** — this matches the business plan's own current status line and this audit did not find evidence to contradict it. The automated test suite (45 tests) validates cross-cutting platform concerns (auth, sessions, tenant isolation, roles, boot safety, Shopify OAuth/webhooks) rather than engine business logic itself (e.g., no test exercises production-batch calculation, purchasing recommendations, or affiliate commission math).

| # | Engine | Module(s) (confirmed present) | Classification |
|---|---|---|---|
| 1 | Inventory & Warehouse | `server/store.js` (4,919 lines), `server/warehouse-store.js` | Implemented but unverified — no dedicated inventory-logic test found |
| 2 | Commerce (Shopify) | `server/commerce/`, `server/shopify.js`, `server/shopify-oauth-routes.js` (408 lines), `server/shopify-webhook-routes.js` (283 lines) | Partial — OAuth + webhook HMAC/dedup validated by tests (Part 2A); order/product import business logic itself not covered by a passing test |
| 3 | Commerce (Marketplaces: Amazon/Etsy/Faire/TikTok/WooCommerce) | `server/commerce/*.js` | Implemented but unverified |
| 4 | Production | `server/db.js` (BOM/batch tables) | Implemented but unverified |
| 5 | Calculation | `server/calc.js` | Implemented but unverified |
| 6 | Purchasing Intelligence | `server/purchasing-routes.js`, `server/store-purchasing-v32.js` | Implemented but unverified |
| 7 | Novi Companion | `server/bestie.js`, `server/novi-messages.js`, `server/novi-detection.js` | Implemented but unverified |
| 8 | Opportunity Center | `server/opportunities.js`, `server/opportunity-bridge.js` | Implemented but unverified |
| 9 | Business Health Score | `server/health.js` (688 lines) | Implemented but unverified — `/api/health` requires auth + `reports.read` permission and computes a real score from `getHealthScore()`, but no test exercises it |
| 10 | Manual Orders | `server/store.js` (orders) | Partial — tenant-isolation tests cover order read/list scoping; order-creation business rules not covered |
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
| 21 | Team HQ | `server/team-routes.js`, `server/hq.js` (357 lines) | Partial — role-enforcement tests (`role-enforcement.test.ts`) validate RBAC for user management, product deletion, settings; broader Team HQ features (tasks, SOPs) unverified |
| 22 | Fulfillment HQ | `server/fulfillment-routes.js` | Implemented but unverified |
| 23 | Adaptive Onboarding | `server/onboarding-routes.js` | Implemented but unverified |
| 24 | Affiliate Attribution | `server/affiliate-attribution.js`, `server/affiliate-attribution-routes.js` | Implemented but unverified |
| 25 | Affiliate Program | `server/affiliate-routes.js`, `server/affiliate-store.js` | Implemented but unverified |
| 26 | AI Brand Setup | `server/ai-brand-setup.js`, `server/ai-brand-setup-routes.js` | Implemented but unverified |
| 27 | Industry Config | `server/industry-routes.js` | Implemented but unverified |
| 28 | Store Credit | `server/store-credit-routes.js` | Implemented but unverified |

---

## 4. Blueprint §8 Core Platform Modules (Commerce Core 1.0 relevant subset)

This section maps the blueprint's product-level module list to what exists. It intentionally does not re-list the engine table above; it evaluates the *product capability*, which sometimes spans multiple engines.

| Blueprint module | Classification | Evidence |
|---|---|---|
| §8.1 Organization, tenancy, accounts | Partial | Multi-business support, roles, RBAC (`role_permissions`), and audit log exist and are exercised by tests. Usage metering, feature flags by plan, and account-closure/data-export workflows: no evidence found in this pass — classified not-started for those sub-items. |
| §8.2 Onboarding | Implemented but unverified | `server/onboarding-routes.js` + `onboarding_state` table exist per `DATABASE.md`. No test or manual walkthrough performed in this audit. |
| §8.3 Products and catalog | Implemented but unverified | Product/variant tables and routes exist (`server/variant-routes.js`, `server/variant-store.js`); tenant isolation on products is validated by tests. Bundles/kits/ShimmerBox configurator (blueprint §8.15): **not started** — no `ConfigurableProduct`/`OptionGroup`/etc. entities or routes were found anywhere in `server/`. |
| §8.4 Orders and fulfillment | Partial | Core order read/list/isolation validated by tests. Returns, exchanges, replacements, store credit: `server/store-credit-routes.js` exists (code present) but unverified. Split-shipment tables (`order_shipments`, `order_shipment_items`) exist per `DATABASE.md`. Full pick/pack/ship workflow: not exercised. |
| §8.5 Inventory and warehouse | Implemented but unverified | Warehouse bins, transfers tables exist (`DATABASE.md`); movement routes exist (`server/movement-routes.js`, mounted per test-run log "Movement routes mounted"). No inventory-logic test found. |
| §8.6 Purchasing and vendors | Implemented but unverified | `server/purchasing-routes.js`, `server/store-purchasing-v32.js` present. No test coverage found. |
| §8.7 Manufacturing, recipes, production | Implemented but unverified | BOM/batch tables in `server/db.js`; no dedicated test. |
| §8.8 Customer service and CRM | Implemented but unverified | `server/cs-routes.js`, `server/cs-store.js`, `server/customer-routes.js` present; shared-inbox pattern documented in the team's `cs-inbox` skill. No test coverage found in `tests/`. |
| §8.9 Marketing/launch studio | Implemented but unverified | `server/studio-routes.js` present; AI-copy generation, campaign approvals not confirmed. |
| §8.10 Wholesale/B2B | Not started | No wholesale-specific routes, price-list tables, or B2B portal found in `server/` file listing or `DATABASE.md`. |
| §8.11 Affiliates/reps/ambassadors | Implemented but unverified | Two parallel affiliate systems exist in code (`affiliate-routes.js`/`affiliate-store.js` and the newer `affiliate-attribution*.js`) — worth the founder's attention as possible duplication, not consolidated in this audit. |
| §8.12 Money and profitability | Not started | No COGS/margin/profitability calculation module found distinct from `server/calc.js` (formula engine for production, not financial profitability). |
| §8.13 Whatnot/live selling | Not started | No live-selling/show-calendar routes or tables found. |
| §8.14 Team, SOPs, approvals | Partial | `approval-routes.js`, `team-routes.js`, `activity_log` table exist; RBAC validated by tests. SOP library, training acknowledgment: not found. |
| §8.15 ShimmerBox configurator | Not started | No matching entities/routes found anywhere in `server/`. This is a blueprint-new capability, not a regression. |

---

## 5. Blueprint §9 Flagship Differentiators

| Capability | Classification | Evidence |
|---|---|---|
| ShimmerScore (explainable health score) | Implemented but unverified | `server/health.js` computes and returns a health score with `/api/health/summary` for "AI-consumable summary" per its own route comment; component breakdown and "what raised/lowered it" explanation logic not read in full during this pass — classify as built, not validated. |
| Time Saved | Not started | No dedicated module or table found (`activity_log` exists but is generic, not a time-saved calculator). |
| Founder Mode | Not started | No matching module found. |
| Business Timeline / celebrations | Implemented but unverified | `server/timeline.js`, `server/timeline-routes.js` present ("Daily Business Replay" engine #16). |
| Business Wrapped | Not started | No matching module found. |

---

## 6. Documentation vs. code contradictions found in this pass

1. **`DEPLOYMENT.md`** states `GET /api/health → { "status": "ok", "uptime": 12345 }` and recommends it "for monitoring and load balancer health checks." The actual route (`server/health.js`, `mountHealthRoutes`) requires session auth (`requireAuth(db, "reports.read")`) and returns a Business Health Score object, not a liveness payload. **A load balancer cannot use this endpoint as documented** — there is no unauthenticated liveness/readiness route in the codebase at all. This is a real gap for any deployment automation that follows `DEPLOYMENT.md` literally.
2. **Business plan / `BACKUP.md`** reference an evidence file `design/p0.3-tenant-isolation-evidence.md` "at" that repo-relative path. It does not exist in the git repository; it exists only in the team's shared workspace outside version control (`/home/team/shared/design/`). Same is true for `postgresql-migration-proposal.md` and `palette-compliance-audit.md`. These are real, readable documents, just not committed to the repo the business plan implies they're "at."
3. **`README.md`** still says `## License \n MIT — see [LICENSE](LICENSE)` even though commit `5dc2038` removed the LICENSE file and the business plan states the project is proprietary. No `LICENSE` file exists in the current tree, so this line is stale.

---

## 7. Open verification gaps (things this audit could not directly confirm)

- GitHub branch-protection *settings* (required reviews/status checks actually enforced) — not queried via the GitHub API in this session.
- Whether the secret-scan report's "0 secrets in git history" finding still holds after subsequent commits (P0.3, backup scripts, Part 1/2A tests) — not re-run.
- Backup/restore was not re-executed live by this audit; it relies on `BACKUP.md`'s documented 2026-07-31 test.
- No performance testing, load testing, or migration-rollback testing was performed or found.
- 24 of 28 engines (everything except Commerce/Shopify, Team HQ/RBAC, and the cross-cutting auth/tenant layer) have no automated test coverage at all — "code present" is the strongest claim this audit can support for them.
- This audit did not boot the application against a live GGE Shopify store; all Shopify-integration evidence is from the automated test suite's mocked HMAC/OAuth flows, not a real Shopify sandbox or production store.
- Whether the two parallel affiliate code paths (`affiliate-routes.js` vs `affiliate-attribution*.js`) are both live/intended or one is legacy was not resolved — flagged for the founder/lead, not decided here.

---

*This document should be re-run (not just re-read) whenever a new PR merges to `main`, PR #4 is merged, or before any Commerce Core 1.0 work begins.*
