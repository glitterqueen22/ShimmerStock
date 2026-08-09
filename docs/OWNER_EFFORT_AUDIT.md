# Owner Effort Audit

Date: 2026-08-09  
Baseline: `origin/main` at `ddf2213`  
Primary question: **Why does the owner have to do this manually?**

This audit describes the implemented product, not roadmap promises. Time and click counts are reasoned estimates for a practiced merchant using a populated workspace; they are not analytics measurements. Demo-only surfaces are excluded from operational truth.

## Action classes

| Class | Meaning | ShimmerStock rule |
|---|---|---|
| A. Automatic | Safe, reversible internal work with a known business preference | Run it, record it, and surface exceptions. Never use it for external writes or legal/security decisions. |
| B. Novi prepares | Novi analyzes and prepares a scoped preview | Show source, assumptions, count, exceptions, and proposed result. No consequential change yet. |
| C. User confirms | Consequential, external, financial, destructive, or bulk action | Require explicit approval, execute once, verify, and retain failure/history details. |
| D. User-only | Physical, legal, credential, or identity action | Explain the required owner action and never pretend Novi completed it. |

## Highest-impact findings

1. Settings is an industry-label editor, not an account and business control center.
2. Password change and logout-all are implemented securely but are buried in the login/user menu experience.
3. There is no authenticated support-request persistence or reference number.
4. There is no authoritative billing provider or subscription record; pricing claims must remain public marketing or “Current access.”
5. Shopify, label, Novi, team, and business preferences live in separate modules and are hard to discover.
6. Customer inbox, returns/refunds, store credit, and customer records share one very large route with heavy tab switching.
7. Order, production, and fulfillment handoffs still rely on the owner opening the next module even when ShimmerStock already knows the blocker.
8. Fulfillment has scan truth, but batch-oriented packing and a persistent scan-first mobile flow need further reduction in taps.
9. Product setup is now substantially prepared by Novi, but location/bin and production setup still require follow-on navigation.
10. Workspace switching is safe and quick, but the active workspace and role should remain visible in every consequential confirmation.
11. Public pages describe many modules before consistently demonstrating outcome-based missions.
12. Onboarding asks setup questions before exploiting all available imported Shopify/catalog facts.
13. Empty states are inconsistent: some explain the next action, while others only report that no records exist.
14. Global navigation exposes module ownership; merchants must know where an order, return, label, or customer problem belongs.
15. Search is local to modules. There is no practical global command/search surface.
16. Repeated settings such as packing defaults, stock thresholds, response tone, and report filters lack one human-readable memory center.
17. Notifications are generated individually in several engines and need stronger bundling by urgency and expiry.
18. Bulk operations are mature for labels and some customer/partner actions, but uneven across production, packing, returns, and team administration.
19. Public contact exists, but authenticated support context is not connected to a tenant-safe support workflow.
20. “Success” language improved in P0, but every new workflow must keep the sequence Preview → Approve → Execute → Verify → History.
21. Mobile tap targets exist globally, but dense tables and modal chains still dominate operational routes.
22. Retry and partial-success behavior is strongest in Shopify import/writeback and weaker in multi-record operational actions.
23. Account data, business profile, brand profile, and public-site business details are separate entry points.
24. Role-specific navigation hides some unauthorized actions, but dashboards remain largely owner-shaped for every role.
25. The product has strong underlying audit data that is not consistently translated into plain-language recovery guidance.

## Authenticated route audit: effort and known context

| Route / surface | Owner goal | Too many clicks / repeated typing | What ShimmerStock already knows | What Novi can prepare |
|---|---|---|---|---|
| `/hq` Command Center | Understand the day and act on exceptions | Opening downstream modules for each exception | Tenant orders, tracked stock, production batches, customer wait, identifier exceptions | Ordered brief, grouped exceptions, mission handoffs |
| `/bestie`, `/novi` | Ask Novi and review messages/history | Re-explaining which business/module is in context | Active workspace, route, operational summaries, audit history | Contextual answer, scoped plan, stale-message cleanup |
| `/products` | Find and maintain catalog products | Opening each product for identifiers, bin, and detail | Imported product/variant identity, stock truth, SKU/barcode state | Missing-data queue, safe bulk cleanup preview |
| `/products/:id` | Understand one product and fix issues | Moving between product, inventory, production, and history views | Product, variants, stock, movements, production and purchasing facts | Product-specific exception summary and direct next action |
| `/products/sku-label-studio` | Prepare SKUs, barcodes, labels, and scans | Advanced customization and follow-up location setup | Existing conventions, identifiers, label defaults, Shopify permissions | Missing-only deterministic identifiers, label batches, conflicts |
| `/scan` and scanner panels | Identify or move stock quickly | Selecting actions after every scan; keyboard/mobile context switching | Tenant barcode identity, variant, availability, bin/locations | Keep last action and location, prepare next scan action |
| `/warehouse` | Receive, locate, pick, and move inventory | Re-entering bins/quantities and handling one record at a time | Bins, movements, pending picks, canonical stock | Scan-first move/receive plan and grouped pick exceptions |
| `/orders` | Review and progress orders | Provider/import controls and per-order inspection | Source order, items, scan state, production/fulfillment status | Blocker queue, safe fulfillment/production handoff plan |
| `/production` | Decide what to make and execute batches | Manually creating/prioritizing batches from order demand | BOMs, stock availability, reservations, pending orders | Shortage-aware priority queue and draft batches |
| `/calc` | Calculate formulas and batch quantities | Re-entering recurring inputs | Saved formulas, units, prior executions | Fill known defaults and prepare calculation |
| `/purchasing` | Replenish low stock and receive POs | Supplier/quantity decisions repeated product by product | Reorder points, stock, suppliers, lead times, open POs | Best-seller/shortage reorder proposal; owner approves PO |
| `/fulfillment` | Pack, verify, ship, and recover exceptions | Tab changes, modal chains, per-order packaging decisions | Pick scans, addresses, recipes, shipments, deadlines | Packing order, recipe/defaults, combined shipment candidates |
| `/customers` Hub | See customer history and manage relationships | Large multi-tab route; duplicate navigation between customer, order, inbox | Customer/order/email/tag/credit/return history | Prioritized customer waits and response context |
| `/customers` Inbox | Answer customer messages | Repeated tone/context gathering and one-message-at-a-time triage | Customer, orders, templates, prior contact, wait time | Draft response with facts; user confirms external send |
| `/customers` Returns/refunds | Resolve returns and inventory disposition | Re-entering order/item/reason and navigating to stock effect | Order/customer/items/payment-independent local records | Return plan and restock/store-credit preview |
| `/customers` Store credit | Issue and redeem local credit | Manual amount/reason entry and cross-checks | Customer, existing balance, returns history | Eligible amount/reason suggestion; owner confirms |
| Split shipment workflow | Ship available items without blocking an order | Selecting individual items and follow-up tracking | Item availability and order address | Preselect available items and explain held remainder |
| `/commerce` Shopify | Connect, import, reconcile, and inspect capability | Reauthorization/import/status spread across panels | Store, scopes, sync state, reconciliation, last success | Import audit and exact recovery steps |
| `/studio`, `/brand-setup` | Create branded assets and define business brand | Re-entering brand/product details already stored elsewhere | Products and stored brand settings | Pre-fill brand/product facts and prepare assets |
| `/growth`, `/opportunities` | Understand growth and choose opportunities | Inspecting many cards and marking each outcome | Real opportunity records and measurable business facts | Rank only actionable opportunities and retire stale ones |
| `/team` | Add people and manage permissions | Repeated role selection and permission review | Memberships, roles, activity, business context | Least-privilege role recommendation and change preview |
| `/partners` / Affiliate HQ | Operate partner, affiliate, payout, and asset workflows | Dense tabs and one-at-a-time reviews | Programs, members, attribution, flags, wallet/activity | Exception queue for applications, fraud, payouts, missing assets |
| `/timeline`, `/audit-log`, `/sync-log` | Explain what changed and recover failures | Searching three history surfaces | Actor, action, source, previous/new values, sync results | Human summary, causal grouping, retry/recovery link |
| `/settings` | Control account, business, plan, integrations, Novi, security | Currently only industry selection; other controls are scattered | User/role/workspace, industry, Shopify, identity/label and Novi preferences | One searchable control center with truthful summaries |
| `/onboarding` | Reach the first useful result | Questions that imported/store data may answer; linear screens | Account/business, Shopify/catalog data, existing settings | Skip known questions and route directly to first exception/value |
| `/login`, `/reset-password` | Authenticate and secure account | Password recovery may require admin/manual token policy | User/session state and password-change requirement | Explain valid recovery path; never claim email was sent |
| Workspace switcher | Change active business safely | Minimal, but users must reorient after switch | Membership, role, active business, route | Confirm new context and refresh authoritative data automatically |

## Authenticated route audit: automation and control

| Route / surface | A. Automatic | B. Novi prepares | C. User confirms | D. User-only | Bulk / remembered preference |
|---|---|---|---|---|---|
| Command Center | Refresh tenant facts, expire stale notices | Daily priorities and mission plan | Mission execution at owning module | Physical work | Bundle by urgency; remember dashboard/workflow priority |
| Novi/messages | Read context and bundle low-value notices | Answer/plan with cited sources | Any consequential handoff | Legal/security decisions | Remember communication and proactivity level |
| Products/Product HQ | Detect missing/conflicting data | Bulk correction set | Product changes/deletion | Verify physical item facts | Bulk identifiers/tags; remember filters |
| SKU/Label Studio | Audit without mutation | SKUs, barcodes, labels | Local save, Shopify write, large print | Load printer/media | Bulk all; remember pattern, fields, size |
| Scanner/Warehouse | Resolve scan, retain context | Move/receive/pick proposal | Stock movement | Scan/physically move item | Batch scan; remember bin/action/printer |
| Orders | Detect blockers and stale orders | Fulfillment/production plan | Status-changing action | Resolve external payment/address uncertainty | Bulk eligible orders; remember filters |
| Production/Calculation | Calculate shortages and priorities | Draft/reserve batch | Reserve, execute, undo/cancel | Make product | Bulk batches; remember priority/formula inputs |
| Purchasing | Calculate reorder need | Draft PO/reorder group | Place/receive PO | Contact/pay supplier | Bulk by supplier; remember thresholds/lead time |
| Fulfillment/Split shipment | Sort queue and detect fully picked | Packing/split/combination plan | Create shipment/mark shipped | Pack, weigh, buy/attach label externally | Batch pack; remember recipes/package defaults |
| Customer Hub/Inbox | Link history and age waits | Response/return/credit proposal | Send response, refund/credit/restock | Sensitive judgment and physical inspection | Bulk tags/templates; remember tone |
| Commerce/Shopify | Read-only import and reconciliation checks | Catalog cleanup/recovery plan | OAuth, disconnect, approved SKU/barcode write | Enter Shopify/admin authorization | Remember store mode; never remember credentials |
| Studio/Brand | Fill known business/product data | Draft asset | Save/publish/export action | Final creative/legal approval | Bulk products; remember brand fields |
| Growth/Opportunities | Retire invalid/stale facts | Ranked opportunity plan | Mark accepted/completed | Business strategy decision | Bundle; remember dismissed categories |
| Team | Enforce authorization | Least-privilege role/change preview | Invite/change/remove membership | Verify employee identity | Bulk role review; remember role templates |
| Partner/Affiliate | Calculate internal status and flag exceptions | Application/payout/action queue | Approve member/payout/content action | Financial/legal approval | Bulk eligible records; remember program defaults |
| History/logs | Record immutable event | Human recovery explanation | Retry supported operation | Investigate external systems | Group related events; remember filters |
| Settings | Load authoritative summaries | Plan-fit and preference explanation | Password/preferences/disconnect changes | Current password, legal/privacy requests | Remember each business preference, allow reset |
| Onboarding | Skip completed/known steps | Next best setup | Connect/import/save settings | OAuth and business decisions | Persist progress per business |
| Auth/workspaces | Refresh session and context | Explain security/context impact | Password/session/workspace changes | Enter password and choose identity context | Remember active workspace safely |

## Authenticated route audit: confusion and exception-first redesign

| Route / surface | Potentially misleading / confusing status | Exception-first change | Remove entirely |
|---|---|---|---|
| Command Center | Counts can overlap categories; freshness is implicit | Show source timestamp and only actionable exceptions | Duplicate snapshot cards that repeat the brief |
| Novi/messages | Generic answers can look authoritative | Cite live source and state uncertainty/staleness | Demo insights in real workspaces |
| Products/Product HQ | Aggregate stock needs tracked/untracked context | Missing identifiers, zero/low tracked stock, conflicts first | Repeated stock calculations in pages |
| SKU/Label Studio | Generated vs saved vs Shopify-verified | Show failed/review rows before ready rows | Second confirmations after approved policy where safe |
| Scanner/Warehouse | “Moved” must mean movement persisted | Unresolved barcode, insufficient stock, missing bin first | Product re-selection after successful scan |
| Orders | Connected is not imported/reconciled | Blocked/late/unverified orders first | Provider controls duplicated outside Commerce |
| Production | Draft/reserved/completed must stay distinct | Shortages and order-blocking batches first | Empty metrics with no next action |
| Purchasing | Recommendation is not a placed PO | Urgent stockout and overdue PO first | Manual product facts already known |
| Fulfillment | Pending is not necessarily fully picked/ready | Picking failures, late orders, address/stock blockers first | Static demo guidance in live route |
| Customer Hub/Inbox | Draft is not sent; local refund record may not equal processor refund | Longest wait, failed send, unresolved return first | Re-entered customer/order identity |
| Commerce/Shopify | Connected ≠ synced; local save ≠ Shopify update | Failed import/reconciliation/scope mismatch first | “Full Sync” promises beyond allowlist |
| Studio/Brand | Generated asset is not published | Missing brand data and failed generation first | Duplicate business/product fields |
| Growth/Opportunities | Opportunity is a recommendation, not measured value | High-confidence current opportunities only | Stale speculative cards |
| Team | Role label can hide effective permissions | Missing access, risky privilege, inactive member first | Duplicate permission explanations |
| Partner/Affiliate | Calculated payout is not paid | Fraud, overdue review, payout failure first | Planned/live ambiguity |
| History/logs | Event recorded does not prove external outcome | Failed/partial actions and recovery first | Three separate searches where one filterable history works |
| Settings | No current plan/support/security overview | Security, failed integration, usage-limit exceptions first | Industry-only page framing |
| Onboarding | “Ready” can overstate incomplete setup | First blocker and first useful result | Questions answerable from import |
| Auth/workspaces | Forgot-password response must not claim email | Expired session, forced password change, membership failure first | Local active-business value as authority |

## Public route audit

| Route / surface | Visitor goal | Manual/friction issue | Known/reusable facts | Prepare/automatic/approval | Confusing status / exception-first / removal |
|---|---|---|---|---|---|
| `/` homepage | Decide whether ShimmerStock solves the business problem | Module-heavy exploration before outcome is clear | Product capabilities and safety model | Show outcome missions and real product proof; signup remains user-confirmed | Remove duplicate generic feature claims; lead with owner outcome |
| `/product/`, `/product.html` | Understand coordinated product | Multiple legacy/modern entry points | Same product architecture | Canonicalize content and links | Avoid divergent claims between duplicate pages |
| `/novi.html`, `/product/novi/` | Understand Novi | Abstract capability explanation | Real Command Center and mission behavior | Show real exception-first examples | Never imply autonomous external execution |
| `/inventory.html`, `/production.html`, `/fulfillment.html`, `/customer-care.html` | Evaluate a specific workflow | Visitor must mentally reconnect modules | Shared data path and handoffs | Demonstrate one end-to-end mission | Remove isolated-module impression |
| `/solutions/` | See fit for business type | Repeated broad marketing copy | Industry adaptation and core workflows | Reuse outcome proof by segment | Clearly label illustrative examples |
| `/pricing/` | Understand access and cost | Public pricing may not map to an in-app billing system | Canonical public offer if maintained | Link to request/contact until billing exists | Do not imply checkout, renewal, invoice, or active subscription |
| `/early-access/`, terms | Apply and understand terms | Form and policy are separate | Application record and published terms | Persist application, return real reference | “Submitted” only after persistence |
| `/contact/` | Reach ShimmerStock | Public contact lacks authenticated workspace context | Public submission fields only | Persist/send only through real route | Never claim sent without durable success |
| `/about/`, `/team.html`, `/partners.html`, `/wholesale.html` | Build trust / explore relationship | Several paths compete for trust proof | Brand/company/program facts | Clear single next action | Remove unsupported scale or live-program implications |
| `/security/`, `/privacy/`, `/terms/`, `/data-request/` | Evaluate safeguards or exercise rights | Policy-to-product path can be unclear | Published policy and request workflow | Legal requests remain user-only; persist valid request | No fake SLA or automated deletion claim |
| `/resources/` | Learn and troubleshoot | Content discovery is route-driven | Product/Shopify safety guidance | Searchable help and contextual links | Retire obsolete docs and duplicate setup steps |
| `/dream-grant/` | Apply to a program | Eligibility/context repeated | Existing public application persistence | Validate and persist; owner supplies legal facts | Clearly state open/closed truth and no award guarantee |
| Legacy flat flagship pages | Explore feature-specific marketing | Duplicate navigation/content maintenance | Canonical modern pages | Redirect or share templates where appropriate | Remove stale duplicated status/pricing claims |

## Twenty highest-frequency workflows: owner minutes saved

Estimates assume no exceptional failure and measure active owner time, not network/import/print waiting.

| Workflow | Current clicks | Current screens | Current manual fields | Current time | Proposed class and flow | Proposed clicks | Proposed screens | Fields eliminated | Proposed time | Minutes saved |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| Open and understand the day | 8 | 4 | 0 | 8 min | A/B: Morning Brief + exceptions | 2 | 1 | 0 | 3 min | 5 |
| Connect Shopify | 8 | 3 | 2 | 6 min | C/D: one guided OAuth flow | 5 | 2 | 1 | 4 min | 2 |
| Import and assess catalog | 7 | 3 | 0 | 8 min | A/B: import then automatic audit | 2 | 1 | 0 | 3 min | 5 |
| Set up new products | 24 | 6 | 12 | 18 min | B/C: prepared missing-data review | 6 | 2 | 9 | 7 min | 11 |
| Generate SKUs | 20 | 4 | 10 | 15 min | B/C: missing-only deterministic batch | 4 | 1 | 9 | 4 min | 11 |
| Create internal barcodes | 18 | 4 | 8 | 12 min | B/C: collision-safe batch | 4 | 1 | 8 | 4 min | 8 |
| Print labels | 14 | 4 | 7 | 10 min | B/C/D: remembered template + test label | 5 | 2 | 5 | 5 min | 5 |
| Handle low inventory | 18 | 5 | 6 | 15 min | B/C: grouped reorder proposal | 5 | 2 | 4 | 6 min | 9 |
| Process today's orders | 30 | 7 | 8 | 30 min | A/B/C: blocker-first mission | 10 | 3 | 5 | 15 min | 15 |
| Create production work | 18 | 5 | 9 | 20 min | B/C: demand-derived draft batches | 6 | 2 | 7 | 8 min | 12 |
| Pack and verify orders | 20 | 4 | 5 | 18 min | A/B/C/D: scan-first queue + remembered recipe | 9 | 2 | 3 | 10 min | 8 |
| Answer customer messages | 14 | 4 | 10 | 15 min | B/C: context-rich response draft | 5 | 2 | 7 | 7 min | 8 |
| Handle a return | 18 | 5 | 9 | 18 min | B/C/D: linked return/disposition plan | 7 | 2 | 6 | 9 min | 9 |
| Issue store credit | 10 | 3 | 5 | 8 min | B/C: linked customer/return proposal | 4 | 1 | 3 | 4 min | 4 |
| Split a shipment | 12 | 3 | 5 | 10 min | B/C: preselected available items | 5 | 1 | 3 | 5 min | 5 |
| Switch workspace and reorient | 5 | 3 | 0 | 3 min | A/C: switch, refresh, show context | 2 | 1 | 0 | 1 min | 2 |
| Change account/password | 8 | 3 | 3 | 6 min | C/D: discoverable Settings form | 5 | 1 | 0 | 4 min | 2 |
| Get support | 10 | 4 | 8 | 12 min | B/C: contextual persisted request | 5 | 1 | 4 | 6 min | 6 |
| Review team access | 14 | 4 | 4 | 12 min | B/C: exception-first permission review | 6 | 2 | 2 | 6 min | 6 |
| Catch up after absence | 24 | 8 | 0 | 25 min | A/B: grouped changes, failures, priorities | 4 | 2 | 0 | 8 min | 17 |

Total estimated active owner time across one occurrence of each workflow:

- Current: **269 minutes**
- Proposed: **118 minutes**
- **Owner minutes saved: 151 minutes (56%)**

Frequency matters more than the one-time total. Daily order, packing, customer, inventory, and catch-up improvements compound; settings and Shopify connection improvements mainly reduce onboarding and recovery friction.

## PR sequencing after this audit

1. P0 data truth is already merged in PR #32; do not duplicate it.
2. Settings / Account / Support / Plan should consolidate implemented controls and add missing tenant-safe support/current-access truth.
3. SKU/Barcode/Label Studio is already merged through PRs #31 and #32; extend only verified gaps.
4. Command Center foundations are merged in PR #32; add missions/handoffs only where authoritative execution and tests exist.
5. Launch experience should simplify public outcomes, onboarding, empty states, route recovery, and global interaction language.
6. Brand/Novi foundations are merged in PR #32; finish asset variants and visual consistency after functional PRs.

## Non-negotiable implementation tests

Every business-owned addition must prove tenant read/write isolation, authenticated workspace authority over client input, and workspace-switch context refresh. Every consequential workflow must distinguish prepared, approved, executed, verified, partial, and failed states. No screen or optimistic toast is completion evidence.