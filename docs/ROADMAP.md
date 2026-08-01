# ShimmerStock — Roadmap to Commerce Core 1.0

**Date:** 2026-08-01
**Companion document:** `docs/CURRENT_STATE_AUDIT.md` (read that first — this roadmap does not re-derive its evidence, only sequences the work it identifies)
**Basis:** Blueprint §13 Phase 0 → Phase 1, and blueprint §21 Immediate Recommended Sequence, reconciled against what the audit found actually exists today.

This roadmap does **not** duplicate work already verified complete in the audit (P0.1–P0.3, credential rotation, session tenancy, Automated Tests Part 1, backup/restore at the DB level). It sequences only what remains before Commerce Core 1.0, in the priority order the lead specified:

1. Full-suite test stability and CI
2. Tenant isolation / security
3. Observability and backup/restore
4. Core Shopify/order/product/inventory workflows
5. Role-based HQ

---

## Existing work being preserved (not rebuilt)

- **Part 1 automated tests** — merged to `main` at `6cae66c` (PR #3). 37 tests per `TESTING.md`, re-confirmed as part of the 45-test run below.
- **Part 2A automated tests (Shopify OAuth/webhooks)** — branch `feature/test-foundation-part2a` @ `c754968`, **PR #4, OPEN**, CI green, mergeable state `CLEAN` (confirmed directly via `gh pr view 4` / `gh pr checks 4` at time of writing, 2026-08-01). **This roadmap treats PR #4 as ready to merge, not as something to redo.** Milestone 1 below is "merge it," not "rebuild it."
- **Backup/restore scripts** — `scripts/backup.sh`, `scripts/restore.sh`, merged via PR #2, DB-level restore already verified per `BACKUP.md`.

---

## Milestone 1 — Merge PR #4 and stabilize the full suite on `main`

**Scope:**
- Merge `feature/test-foundation-part2a` (PR #4) into `main` now that CI is green and the branch is mergeable (`CLEAN`).
- After merge, run the full suite once more directly against `main` (not just the feature branch) to catch any interaction effect between Part 1 and Part 2A tests that only appears post-merge.
- Fix the `crypto.randomBytes`-without-import portability bug class if any further instance exists (the known one was already fixed pre-merge per the business plan; confirm no recurrence).

**Exclusions:** No new test coverage in this milestone (that's Part 2B, not scoped here). No production code changes beyond what's already in PR #4.

**Dependencies:** None — PR #4 is already CI-green and CLEAN as of this writing. This is the smallest possible next action.

**Risk:** Low. The only realistic risk is a merge-order test interaction (e.g., two test files racing on a shared ephemeral port or `/tmp` path). Mitigate by running the full suite immediately after merge, before starting any other work.

**Acceptance criteria:**
1. PR #4 is merged to `main` via the normal review path (lead review, not this session).
2. `git log --oneline -1 origin/main` shows the merge commit.
3. `ENCRYPTION_KEY=... bun test` run directly against fresh `main` shows the same 45 pass / 0 fail (or documents exactly what changed and why).
4. `gh run list --branch main --limit 1` shows the post-merge CI run as success.

**Evidence/exit gate:** Paste the post-merge test output and the `gh run` status into the PR or a follow-up commit message. Do not proceed to Milestone 2 until this is captured.

---

## Milestone 2 — Close the tenant-isolation and security gaps the audit found

**Scope (from audit §1, §2, §6):**
- Fix the `POST /api/auth/forgot-password` token leak in `server/index.js` (stop logging the raw token to stdout, stop returning it in the response body) — this is a real, already-identified secret exposure, not new scope.
- Add basic rate limiting to authentication endpoints (`/api/auth/login`, `/api/auth/forgot-password`) — currently **zero** rate limiting exists anywhere in the codebase (confirmed by grep in the audit).
- Confirm GitHub branch-protection settings are actually enforced (required status checks, required review) via the GitHub API or repo settings UI — the audit found this documented as a recommendation but not confirmed as turned on.
- Extend tenant-isolation test coverage from the 4 domains currently covered (products, orders, movements, users) to at least the highest-risk remaining domains before Commerce Core workflows depend on them: purchasing, production/manufacturing, customer service.

**Exclusions:** Full coverage of all ~28 engines' tenant isolation is out of scope for this milestone — that's an ongoing backlog item, not a blocker for Commerce Core 1.0. Do not attempt all of them at once.

**Dependencies:** Milestone 1 merged (so new tests land on a stable base).

**Risk:** Medium. Rate limiting, if misconfigured, can lock out legitimate users (especially a small pilot team sharing office IPs). Use a generous threshold (e.g., 10 attempts/5 min per IP+username pair) and log rather than hard-block on first pass.

**Acceptance criteria:**
1. `forgot-password` response no longer contains `resetToken`; token is delivered only via the (future) email channel or, until email exists, via a server-side-only log gated behind a `NODE_ENV !== production` check or removed entirely.
2. A rate-limit test exists and passes, proving repeated failed logins are throttled.
3. New tenant-isolation tests exist for purchasing, production, and customer-service domains, following the existing `tests/tenant-isolation.test.ts` pattern, and pass.
4. Full suite (`bun test`) still passes at 100%, run together, not file-by-file.
5. Branch protection confirmed on via direct inspection (screenshot or `gh api repos/glitterqueen22/ShimmerStock/branches/main/protection` output).

**Evidence/exit gate:** Full test output, the specific `gh api` branch-protection query result, and a diff of the forgot-password handler.

---

## Milestone 3 — Minimum launch observability + confirm backup/restore at the application level

**Scope (from audit §1 Monitoring row, and the business plan's own "Environments" caveat):**
- Add a real unauthenticated liveness endpoint (e.g. `GET /healthz` returning `{status, uptime}` with no auth) — `DEPLOYMENT.md` already documents this shape but the code does not provide it; `/api/health` is a different, authenticated, business-logic endpoint and must not be repurposed for load-balancer checks.
- Add Sentry (or equivalent) for error tracking — no error-tracking dependency exists in `package.json` today.
- Add structured logging to replace or wrap the 700+ raw `console.*` calls in `server/`, at minimum for auth, webhook, and payment-adjacent paths first.
- Close the "application-level restore" gap: boot the actual server process (not just `sqlite3 PRAGMA integrity_check`) against a freshly restored database and run the smoke test suite against it, as the business plan's own caveat requires.
- Add alerting on `shopify_sync_log` failure rows — table exists, nothing currently reads it for alerting.

**Exclusions:** Full BetterStack/uptime-monitoring vendor rollout is not required for this milestone — that can follow once a real pilot business is live. Do not build a custom logging pipeline; use an existing library.

**Dependencies:** Milestone 1 (stable base). Independent of Milestone 2.

**Risk:** Low-medium. Main risk is picking a monitoring vendor before pricing/ownership is confirmed — flag that decision to the owner rather than guessing (see "Owner decisions required" below).

**Acceptance criteria:**
1. `GET /healthz` (no auth) returns 200 with `{status:"ok", uptime:<seconds>}` and is confirmed via a direct `curl` against a locally running instance.
2. At least one error-tracking call path exists and a deliberately-triggered error appears in the tracking dashboard (or console output in absence of a paid tier) during a manual test.
3. Restore drill: restore a backup into a clean directory, **boot the actual `server/index.js` process** against it (not just check integrity), and confirm `bun test`'s smoke suite passes against that restored+booted instance.
4. A documented alert path exists for `shopify_sync_log` failures (even if it's just a logged warning to start).

**Evidence/exit gate:** `curl` output for `/healthz`, the restore-drill transcript (commands + output), and the sync-failure alert code/log line.

---

## Milestone 4 — Core Shopify/order/product/inventory workflow (first Commerce Core slice)

**Scope:** This is the blueprint's Phase 1 "Commerce Core 1.0," narrowed to the smallest slice that proves the loop for one pilot business (GGE), per blueprint §14 Pilot Strategy and §21 step 6-8:
- One real Shopify store connection (OAuth already implemented per audit — this milestone proves it against a real Shopify sandbox/dev store, not just the mocked HMAC tests).
- Product/variant import from that store.
- Order import via webhook (already HMAC-validated and dedup-tested per audit — this milestone proves it end-to-end with a real Shopify order, not a synthetic test payload).
- Inventory decrement on order import, visible in the ShimmerStock UI.
- One manual pick/pack/ship pass recorded against a real imported order.

**Exclusions:** No wholesale, no affiliates, no ShimmerBox configurator, no marketing studio, no Money/profitability module — all confirmed not-started or out-of-scope by the audit and explicitly deferred by the blueprint's own phase ordering (§13 Phase 1 vs. later phases).

**Dependencies:** Milestones 1–3. Specifically: cannot responsibly connect a real Shopify store without the rate-limiting and forgot-password fixes from Milestone 2 (auth surface must be hardened before external OAuth traffic flows through it), and without at least basic error tracking from Milestone 3 to catch a bad sync before it corrupts inventory data silently.

**Risk:** Medium-high — this is the first time real external data (a live Shopify store) touches the system under this hardening standard. Mitigate with a read-only or sandbox Shopify store first (the codebase already documents a `SHOPIFY_READ_ONLY=true` safety flag per `DEPLOYMENT.md`'s security checklist — use it for the first pass).

**Acceptance criteria:**
1. A real Shopify development store is connected via OAuth; token is confirmed encrypted at rest (reuse the existing test's assertion pattern, but against a real store).
2. At least 5 real products/variants import correctly, verified by direct DB query, not just a UI screenshot.
3. A real test order placed on the connected store arrives via webhook, is HMAC-validated, and appears in ShimmerStock within a defined time budget (state the number observed).
4. Inventory decrements correctly and is visible in the ShimmerStock product view.
5. A human performs one full pick/pack/ship pass against that order and the order status reflects it.
6. Tenant isolation still holds for all newly-touched tables (rerun Milestone 2's isolation suite).

**Evidence/exit gate:** Screenshots/recording of the imported order and inventory change (blueprint §16 DoD requirement #11), the webhook delivery log entry, and full test suite green.

---

## Milestone 5 — Role-based HQ (first cut)

**Scope:** Blueprint §5.2 role-based HQ, narrowed to the roles the audit confirmed already exist in RBAC (`role-enforcement.test.ts` proves owner/viewer distinction today):
- Owner view: today's revenue/orders/inventory-risk summary, built from data that now exists post-Milestone 4.
- Warehouse-employee view: pick/pack queue sourced from the same real orders proven in Milestone 4.

**Exclusions:** Production-employee, customer-service-employee, marketing-employee, and manager views (blueprint §5.2 lists six role views total) are explicitly deferred — building all six before Commerce Core data flows are proven would violate the "smallest safe milestone" instruction. CEO Mode (§5.3, multi-business) is explicitly out of scope; only one pilot business (GGE) exists.

**Dependencies:** Milestone 4 (needs real order/inventory data to summarize) and the existing RBAC tests from Milestone 2/audit baseline.

**Risk:** Low — this is UI/aggregation work over data whose correctness was already proven in Milestone 4; the main risk is scope creep into the other four role views.

**Acceptance criteria:**
1. Owner HQ view shows real revenue/order/inventory-risk numbers sourced from the Milestone 4 data, not placeholder/sample data.
2. Warehouse HQ view shows a real pick/pack queue reflecting the Milestone 4 test order.
3. A viewer-role user is denied access to the owner HQ view (reuses the existing RBAC test pattern).
4. Empty/loading/error/permission-denied states exist for both views per blueprint §16 DoD.

**Evidence/exit gate:** Screenshots of both views in populated and empty states, plus the permission-denial test result.

---

## Owner decisions required

Only genuine decisions that block or shape the sequence above — not a general feature wishlist:

1. **PR #4 merge approval.** PR #4 is CI-green and mergeable now. The lead should merge it (or explicitly decide not to) before Milestone 1 can be marked complete — this document does not merge it.
2. **Monitoring vendor and budget.** Milestone 3 needs a choice of error-tracking/uptime vendor (e.g., Sentry free tier vs. paid, BetterStack vs. a simpler healthcheck ping service) and confirmation of who owns that account and its recurring cost, consistent with how the PostgreSQL proposal already flagged a similar decision for that migration.
3. **Real Shopify store for Milestone 4.** Someone must provide (or create) a real Shopify development/sandbox store credential set for GGE before Milestone 4 can start — this cannot be simulated with the existing mocked test fixtures and still satisfy "prove GGE can run its operating loop."
4. **Scope confirmation on the two parallel affiliate code paths** (`affiliate-routes.js`/`affiliate-store.js` vs. the newer `affiliate-attribution*.js` engine) flagged in the audit — decide which is canonical before any affiliate work is scheduled, so a future milestone doesn't build on the wrong one.

---

## First bounded engineering task (hand this to the next engineering session, verbatim)

**Objective:** Merge PR #4 and prove the full test suite is stable on `main` post-merge — nothing else.

**Current verified state:** `feature/test-foundation-part2a` @ `c754968`, PR #4, OPEN, CI check `CI/ci` = success, `mergeStateStatus` = `CLEAN` (confirmed via `gh pr view 4` and `gh pr checks 4` on 2026-08-01). Local run of the full suite on this branch: 45 pass / 0 fail / 125 expect() calls across 8 files, 4.47s.

**In scope:**
- Merge PR #4 into `main` (standard merge, not squash-and-rewrite-history, to preserve commit provenance per blueprint §17.2 "preserve existing branches and commits").
- Immediately after merge, check out fresh `main` and run `ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" bun test` directly (not on the feature branch).
- Confirm `gh run list --branch main --limit 1` shows success for the post-merge push.

**Out of scope:**
- No new tests.
- No production code changes beyond what PR #4 already contains.
- No touching Milestone 2+ items (forgot-password fix, rate limiting, healthz endpoint, etc.) — those are separate bounded tasks.

**Acceptance criteria:**
1. `main`'s HEAD commit is the PR #4 merge commit (verify with `git log --oneline -1`).
2. Full suite passes 45/45 (or documents and explains any change in count) when run fresh against post-merge `main`.
3. CI run for the merge push is green.

**Definition of Done (per blueprint §16, applicable items):**
- Commit hash recorded.
- PR reference recorded (PR #4, now merged).
- Exact test command and full output captured verbatim.
- CI status verified green via `gh run list` or `gh run view`, not assumed.
- No secrets committed (no change expected here, but confirm `git diff` introduces none).
- Independent review: the lead (not the merging session) confirms the above before Milestone 2 starts.

**What must not be changed:**
- Do not rewrite or force-push `main` or `feature/test-foundation-part2a` history.
- Do not modify `tests/` files as part of this task — if a post-merge failure appears, stop and report it as a new bounded task rather than patching tests inside the merge task.
- Do not merge any other open branch in the same pass.
- Do not touch `docs/CURRENT_STATE_AUDIT.md` or `docs/ROADMAP.md` as part of this engineering task — they are updated by a documentation pass after the merge, referencing the new commit hash.
