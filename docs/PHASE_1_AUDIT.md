# PHASE 1: NOVI-FIRST PRODUCT BETA

## AUDIT BASELINE

**Date:** 2026-08-07  
**Branch:** `feat/novi-first-product-beta` (from main ac22aa0)  
**Scope:** Complete authenticated product experience audit

---

## PART 1: EXECUTIVE SUMMARY

ShimmerStock has a **substantial but uncoordinated** authenticated product foundation:
- 29 page files (~22K lines of React)
- Multiple engines partially implemented (Orders, Products, Inventory, Warehouse, etc.)
- Novi component system exists (9 expressions, rich visual system)
- HQ Command Center exists but needs Novi-centric redesign
- Onboarding flow exists but needs polish and demo workspace integration
- Design system tokens exist but lack unified spacing/margin strategy
- Many pages have dead ends, empty states not handled, or missing navigation

**Primary Gap:** The product doesn't yet feel like **one connected operating system**. Engines feel isolated. Novi isn't woven throughout. First-time experience doesn't prepare user for system coherence.

**Phase 1 Goal:** Transform into cohesive, first-day-compelling, Novi-first experience where user feels "This understands my business" within 5 minutes.

---

## OWNER DECISIONS — APPLIED 2026-08-07

| Decision | Resolution |
|----------|-----------|
| Business types V1 | Craft & Maker Supplies + E-commerce Brand (flagship deep demos); Made-to-Order + Freshies (polished presets) |
| Novi breadth | All 11 launch-critical engines; Full interactive for 6; Contextual for 5 |
| Demo data scope | Realistic — 40-60 products, 20-30 orders, multiple locations per flagship |
| Customer Care V1 | Queue + history + order context + Novi summary |
| Shopify pilot readiness | BUILD IN PHASE 1 — all 14 connection states, READ-ONLY EARLY ACCESS labeling, pilot-readiness checklist |
| Default demo | Craft & Maker Supplies (not Freshies) |
| Implementation order | P0: Business DNA, demo data, Command Center, Novi, golden path, Customer Care, Shopify readiness, dead-end audit |

---

## PART 2: ONBOARDING AUDIT

**File:** `client/src/pages/Onboarding.tsx` (~800 lines)

### Current State
- ✅ **Exists** with multi-step flow
- ✅ **Collects** business type (with industry config system)
- ✅ **Supports** terminology adaptation per industry
- ✅ **Integrates** with backend proposal engine
- ✅ **Shows** Novi with expressions

### Gaps
- ❌ **No demo workspace preview** — User doesn't see app before committing
- ❌ **No 10-step clarity** — Steps not numbered/visualized progressively
- ❌ **No "skip for now"** — Can feel like mandatory questionnaire
- ❌ **Missing business context collection:**
  - [ ] Business name (exists)
  - [ ] Business type (exists)
  - [ ] What they sell (exists?)
  - [ ] Current platform (exists?)
  - [ ] Team size (exists?)
  - [ ] Locations (missing?)
  - [ ] Operational priorities (missing?)
  - [ ] Demo vs blank workspace (missing)
  - [ ] Future Shopify connection intent (missing)
  - [ ] First useful action (missing)
- ❌ **No Novi intro sequence** — Novi appears but role unclear
- ❌ **No post-onboarding guidance** — Where to go after?

### Recommendation
**Redesign onboarding as guided tour with:**
1. Welcome + Novi intro
2. Business name
3. Business type (with demo preview)
4. What you sell (examples per type)
5. Current platform
6. Team size + locations
7. Operational priorities (multi-select)
8. Demo workspace + data confirmation
9. Command Center preview
10. Ready to go + first action (link to relevant engine)

Each step: ~40-60 lines. Progress bar. Can skip/back at any point. Demo preview available from step 3.

---

## PART 3: COMMAND CENTER AUDIT

**File:** `client/src/pages/HQ.tsx` (~500 lines)

### Current State
- ✅ **Data structure exists:** whatHappened, needsAttention, whatToDoNext, opportunities
- ✅ **API endpoint built:** `/api/hq/summary` aggregates all engines
- ✅ **Renders activity feed** with timeAgo formatting
- ✅ **Shows low stock, pending batches, overdue POs, unfulfilled orders**
- ✅ **Shows recommendations** by engine

### Gaps
- ❌ **Not Novi-centric:** Novi doesn't appear prominently
- ❌ **No "TODAY" section:** Queue visibility for immediate work
- ❌ **No "BUSINESS SNAPSHOT":** KPIs (orders, revenue, inventory health, queues)
- ❌ **No "WHAT CHANGED" section:** Events since last visit
- ❌ **No "NEXT BEST ACTIONS":** Limited, prioritized actions (vs. endless list)
- ❌ **No Morning Brief:** Expected first thing, not buried
- ❌ **No celebration state:** When things are healthy, owner doesn't know
- ❌ **Visual hierarchy weak:** All sections same visual weight
- ❌ **No empty states:** What to do when new workspace (no data)?
- ❌ **No mobile optimization:** Designed for desktop only

### Recommendation
**Redesign HQ as four-section Command Center:**

1. **NOVI MORNING BRIEF** (Top, prominent)
   - Greeting from Novi (contextual expression)
   - 3-5 key insights for today
   - Each insight: title, reasoning, action, severity
   - Call-to-action buttons per insight

2. **TODAY** (Second priority)
   - Orders requiring attention (count + link)
   - Inventory risks (count + link)
   - Purchasing decisions (count + link)
   - Production blockers (count + link)
   - Fulfillment exceptions (count + link)
   - Customer conversations (count + link)
   - Team workload distribution (count + link)
   - Horizontal card layout, each shows count + status color + CTA

3. **BUSINESS SNAPSHOT** (Right sidebar or second column)
   - Orders this week (count)
   - Revenue where supported (amount)
   - Inventory health (score 0-100, green/yellow/red)
   - Fulfillment queue (count)
   - Production queue (count)
   - Purchasing status (count pending)
   - Customer care queue (count)
   - Each with sparkline or simple graph

4. **WHAT CHANGED** (Below TODAY or expandable)
   - Recent important events (limit 5)
   - Audit log entries filtered for meaningful actions
   - Timeago formatting
   - If nothing new, celebration message

### Implementation Estimate
~800 lines of restructure + CSS + component extraction

---

## PART 4: NOVI INTEGRATION AUDIT

**Current:** Novi appears in BusinessBestie.tsx landing page and some individual Novi page

**Gap:** Novi should appear contextually in 9+ engines but currently isolated

### Required Novi Moments

| Engine | Insight | Example | Voice |
|--------|---------|---------|-------|
| **Orders** | Blocked orders | "These 4 orders are blocked by missing components" | Calm, helpful |
| **Inventory** | Stock depletion | "Vanilla Base may run out before next delivery" | Concerned, actionable |
| **Products** | Missing data | "You haven't set reorder thresholds for 3 products" | Curious, supportive |
| **Production** | Batch risk | "This batch can't start; waiting on Component X" | Focused, clear |
| **Purchasing** | PO suggestion | "I've prepared a suggested PO based on current demand" | Proud, confident |
| **Fulfillment** | Exception handling | "9 orders moving normally; these 3 need attention" | Calm, prioritized |
| **Warehouse** | Location efficiency | "Reorder point for Widget A is 15; you're at 14" | Thinking, helpful |
| **Customer Care** | Context summary | "This customer contacted twice about same order" | Grateful, supportive |
| **Team** | Workload | "Fulfillment queue is unevenly distributed" | Thinking, analytical |

### Novo

 Integration Checklist
- [ ] Each engine page renders Novi at top (small, expression contextual to status)
- [ ] Novi message title (one line)
- [ ] Reasoning summary (2-3 lines)
- [ ] Severity badge (Critical/High/Normal)
- [ ] Confidence indicator where relevant
- [ ] Recommended action (clear next step)
- [ ] Action buttons (Show me why, Review, Approve, Dismiss, Remind me)
- [ ] Timestamp of when insight was created
- [ ] Demo vs live data clearly labeled

### Implementation Estimate
~1000-1200 lines total (~110-140 lines per engine)

---

## PART 5: GOLDEN PATH AUDIT

**Flow:** Order → Inventory → Production → Purchasing → Fulfillment

### Current State
- ✅ Orders page exists
- ✅ Inventory page exists
- ✅ Production page exists
- ✅ Purchasing page exists
- ✅ Fulfillment page exists
- ✅ Each has some demo data

### Gaps
- ❌ **Flow disconnection:** Clicking "Create Order" doesn't show inventory impact
- ❌ **Inventory reservation:** Not visible after order creation
- ❌ **Production trigger:** No indication production was allocated
- ❌ **Purchasing risk:** Not surfaced when stock becomes risky
- ❌ **Warehouse prep:** No pick/pack task generated
- ❌ **Fulfillment status:** Doesn't show order progress
- ❌ **Customer notification:** Not shown
- ❌ **Novi watching:** Doesn't track exceptions in flow
- ❌ **HQ reflection:** Command Center doesn't show flow progress

### Recommendation
Build single demo order through entire flow:
1. Create test order from Orders page
2. Navigate to Inventory → see reservation
3. Check Production → see batch allocation
4. Check Purchasing → see component risk
5. Check Warehouse → see pick ticket
6. Check Fulfillment → see shipment status
7. Check Customer Care → see order history
8. Check HQ → see in activity log + recommendations
9. Check Novi → sees exceptions and celebrates completion

Each step documented with screenshots and logic explained.

### Implementation Estimate
~500-700 lines (ensuring data flows through all engines + Novi watches)

---

## PART 6: DEAD ENDS AUDIT

**29 pages need systematic audit:**

### Classification System
- **WORKING:** Fully functional end-to-end flow
- **INTENTIONALLY DISABLED:** Clear UI (disabled button + tooltip explaining why)
- **DEMO:** Demo data only, clearly labeled
- **PLANNED:** Roadmap item, status visible
- **BROKEN:** Dead link, silent failure, unexplained empty state

### Pages to Audit
1. HQ ❓ (needs retest after redesign)
2. BusinessBestie ❓ 
3. Products ❓
4. ProductHQ ❓
5. Orders ❓
6. Scan ❓
7. Production ❓
8. Purchasing ❓
9. Warehouse ❓
10. Fulfillment ❓
11. Calculation ❓
12. CustomerHub ❓
13. Opportunities ❓
14. Partner ❓
15. Affiliates ❓
16. Team ❓
17. Growth ❓
18. Studio ❓
19. Commerce ❓
20. BrandSetup ❓
21. Settings ❓
22. Timeline ❓
23. AuditLog ❓
24. SyncLog ❓
25. NoviMessages ❓
26. Onboarding ✅ (needs redesign)
27. Login ✅ (public route)
28. ResetPassword ✅ (public route)
29. Scan ❓ (mobile barcode workflow)

**Task:** Audit each page for:
- Silent clicks → Fix or disable+explain
- Empty states → Add contextual guidance
- Missing navigation → Add "Next step" links
- Unexplained statuses → Add status explanation
- Broken flows → Add demo data or roadmap status
- Missing Novi → Add contextual insight

### Implementation Estimate
~200-300 lines per page (varies; some just need labels, some need flows)

---

## PART 7: DESIGN SYSTEM AUDIT

**Current:** `client/src/design/tokens.ts` exists with basic tokens

### Gaps
- ❌ **No margin system:** Inconsistent page gutters
- ❌ **No spacing scale:** Cards, sections, components use ad-hoc padding
- ❌ **No type scale:** Sizes don't follow clear progression
- ❌ **No density levels:** No data-dense vs. comfortable variants
- ❌ **No state colors:** Purple/green not used meaningfully for status
- ❌ **No mobile strategy:** Responsive breakpoints not centralized

### Recommendation
**Establish design system tokens:**

```typescript
// Spacing Scale (8px base unit)
const SPACING = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '3rem',   // 48px
};

// Page/Section Gutters
const GUTTERS = {
  page: '2rem',       // Desktop page margin
  pageMd: '1.5rem',   // Tablet
  pageSm: '1rem',     // Mobile
  section: '1.5rem',  // Section spacing
  card: '1.25rem',    // Card padding
};

// Breakpoints
const BREAKPOINTS = {
  xs: '375px',
  sm: '430px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1440px',
};

// Status Colors (Purple = Intelligence/Recommendation, Green = Health/Progress)
const STATUS = {
  info: 'purple-500',      // Novi insight
  success: 'green-500',    // Healthy, on-track
  warning: 'amber-500',    // Needs attention
  error: 'red-500',        // Blocked, critical
  neutral: 'slate-400',    // Neutral info
};
```

### Implementation Estimate
~300 lines (tokens) + refactor existing page files to use them

---

## PART 8: RESPONSIVE DESIGN AUDIT

**Test at:** 375, 430, 768, 1024, 1280, 1440

**Required checks:**
- No horizontal overflow
- App navigation accessible
- Tables adapt (scroll or collapse)
- Filters remain usable
- Novi panel fits
- Modals readable
- Forms complete-able
- Touch targets ≥44px
- Keyboard navigation works
- No color-only meaning
- Sufficient contrast

**Status:** ❓ Needs systematic testing

### Implementation Estimate
Varies per page; expect ~100-500 lines per page needing responsive fixes

---

## PART 9: PERFORMANCE AUDIT

**Baseline:** Current build time, bundle size, console output

### Required Checks
- Build time ≤ 10 seconds
- Bundle size not materially worse
- No console errors on core paths
- API calls efficient
- Demo data lightweight
- No layout shifts

**Status:** ❓ Needs measurement

---

## PART 10: FEATURE COMPLETENESS AUDIT

### Launch-Critical Engines (11)

#### 1. Command Center
- **Status:** Exists, needs Novi redesign
- **V1 Complete?** 70% (structure there, Novi integration needed)
- **Missing:** Novi Morning Brief, TODAY section, SNAPSHOT, NEXT BEST ACTIONS
- **Action:** Redesign + Novi integration

#### 2. Products
- **Status:** Exists
- **V1 Complete?** 60% (list/view works, missing reorder setup, bulk actions)
- **Missing:** Reorder thresholds, supplier mapping, bulk edits, Novi guidance
- **Action:** Add thresholds UI, Novi stock warnings

#### 3. Inventory
- **Status:** Exists
- **V1 Complete?** 70% (view works, missing location management)
- **Missing:** Location/bin assignment, variance investigation, physical count
- **Action:** Add location UI, Novi depletion warnings

#### 4. Warehouse
- **Status:** Exists
- **V1 Complete?** 50% (structure only, needs picking/packing workflow)
- **Missing:** Pick tickets, pack verification, label printing, Novi staging
- **Action:** Build pick/pack workflows, Novi queue alerts

#### 5. Orders
- **Status:** Exists
- **V1 Complete?** 80% (receipt, viewing, status tracking work)
- **Missing:** Blocked order resolution, customer communication
- **Action:** Add block indicators, Novi insights on blocks

#### 6. Purchasing
- **Status:** Exists
- **V1 Complete?** 60% (PO creation, supplier management partial)
- **Missing:** Auto-suggestion, approval workflow, vendor performance
- **Action:** Add Novi PO suggestions, approval flow

#### 7. Production
- **Status:** Exists
- **V1 Complete?** 70% (batch tracking works, missing allocation + blocking)
- **Missing:** Component allocation, blocker detection, capacity planning
- **Action:** Add allocation UI, Novi blocker warnings

#### 8. Fulfillment
- **Status:** Exists
- **V1 Complete?** 60% (tracking works, missing exception handling)
- **Missing:** Exception capture, customer notification, carrier integration
- **Action:** Add exception UI, Novi prioritization

#### 9. Customer Care
- **Status:** Exists
- **V1 Complete?** 40% (conversation queue exists, missing context integration)
- **Missing:** Order context, previous issue history, resolution templates
- **Action:** Build context pane, Novi summaries

#### 10. Teams
- **Status:** Exists
- **V1 Complete?** 50% (member mgmt works, missing permissions + workload)
- **Missing:** Role-based permissions, workload balancing, assignment
- **Action:** Add permissions system, Novi workload insights

#### 11. Novi
- **Status:** Component exists, integration in progress
- **V1 Complete?** 30% (component visual system works, logic not connected)
- **Missing:** Insight generation, global access pattern, contextual appearance
- **Action:** Implement global panel, integrate into all engines

### Other Engines (17)

| Engine | Status | Type | Notes |
|--------|--------|------|-------|
| Scan | Exists | BETA | Mobile barcode workflow, needs testing |
| Affiliates/Partners | Exists | BETA | Payouts, tracking, needs V1 refinement |
| Growth | Exists | PLANNED | Revenue reports (future) |
| Studio | Exists | PLANNED | Brand customization (future) |
| Commerce | Exists | PLANNED | Marketplace expansion (future) |
| BrandSetup | Exists | PLANNED | Brand configuration (future) |
| Timeline | Exists | DEMO | Historical view (demo data only) |
| AuditLog | Exists | LIVE | System audit trail |
| SyncLog | Exists | LIVE | Shopify sync tracking |
| NoviMessages | Exists | DEMO | Novi message history (demo) |
| Calculation | Exists | LIVE | Unit/cost calculations |
| Opportunities | Exists | BETA | Recommendations dashboard |

---

## PART 11: BUSINESS DNA AUDIT

**Goal:** Adapt product experience per business type (Craft, E-commerce, Freshies, etc.)

**Current:** Industry config system exists

**Missing:**
- [ ] Demo workspaces for each type
- [ ] Terminology mapping (e.g., "Product" vs. "Formula" for freshies)
- [ ] Example data reflecting real workflows
- [ ] Default engine priorities per type
- [ ] Novi examples in domain language

**Implementation Estimate:** ~400-600 lines (demo data, terminology context, examples)

---

## PART 12: DEMO WORKSPACE AUDIT

**Goal:** User sees live product without connecting real store

**Current:** No clear demo workspace system

**Required:**
- [ ] Demo label visible everywhere
- [ ] Sample data for multiple business types
- [ ] Can switch types without losing real data
- [ ] All engines have demo content
- [ ] Demo mode persists through session
- [ ] Clear path to connect real store

**Implementation Estimate:** ~500-700 lines (demo data structure, context, labels)

---

## PART 13: DOCUMENTATION AUDIT

**Required:**
- [ ] `docs/PRODUCT_BETA_STANDARD.md` — Quality gates for beta
- [ ] `docs/NOVI_PRODUCT_INTEGRATION.md` — Novi system across all engines
- [ ] `docs/CORE_ENGINE_V1_MATRIX.md` — Status of each engine
- [ ] `docs/SHOPIFY_PILOT_READINESS.md` — Read-only connection states
- [ ] `docs/AI_COST_AND_SAFETY.md` — AI architecture, safeguards

**Status:** ❌ Not created

**Implementation Estimate:** ~1000-1500 lines total

---

## SUMMARY TABLE

| Component | Current | Gap | Effort | Priority |
|-----------|---------|-----|--------|----------|
| Onboarding | 70% | Demo workspace, 10-step flow | Medium | P0 |
| Command Center | 60% | Novi redesign, new sections | Medium | P0 |
| Novi Integration | 10% | Integrate into 9 engines | High | P0 |
| Golden Path | 50% | Connect all engines | High | P0 |
| Dead Ends | 40% | Audit + fix all 29 pages | High | P0 |
| Design System | 40% | Spacing, margins, scale | Medium | P0 |
| Responsive Design | 60% | 5+ breakpoints testing + fixes | High | P0 |
| Demo Workspace | 0% | Sample data, labeling | Medium | P1 |
| Business DNA | 20% | Terminology, examples per type | Medium | P1 |
| Customer Care V1 | 40% | Context integration, Novi | Medium | P1 |
| Documentation | 0% | 5 new docs | Medium | P1 |
| Performance | 80% | Audit + optimize | Low | P2 |

---

## ESTIMATED TOTAL IMPLEMENTATION

- **Onboarding redesign:** ~500 lines
- **Command Center redesign:** ~800 lines
- **Novi integration (9 engines):** ~1200 lines
- **Dead end fixes (29 pages):** ~3000 lines (average 100 lines/page)
- **Design system:** ~300 lines
- **Responsive fixes:** ~2000 lines (varies per page)
- **Demo workspace:** ~600 lines
- **Business DNA:** ~400 lines
- **Customer Care V1:** ~600 lines
- **Documentation:** ~1000 lines
- **Testing & QA:** (non-code)

**Total:** ~10,000-12,000 lines of changes across codebase

**Effort:** 40-60 engineer-hours for complete Phase 1

---

## NEXT STEPS

1. **Owner Review** — Validate priorities, scope, approach
2. **Implementation** — Prioritize P0, build systematically
3. **Testing** — QA across all 29 pages, 5+ viewports
4. **Verification** — Full Bun suite, accessibility, performance
5. **Documentation** — Comprehensive beta readiness docs
6. **Final Report** — Complete audit + deliverables

---

**Baseline SHA:** ac22aa0  
**Branch:** feat/novi-first-product-beta  
**Status:** Audit Complete — Awaiting Owner Review Before Implementation
