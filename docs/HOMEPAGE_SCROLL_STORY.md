# Homepage Scroll Story

> Issue #38 implementation contract. This document is the required design, motion, product-truth, accessibility, and performance specification for the homepage story. It does not authorize deployment, Shopify connection, or final Novi character art.

## Decision

Transform the current homepage from eleven visually separate marketing sections into eight connected narrative chapters. Preserve the strongest current copy, product surfaces, status transparency, and calls to action. Combine or remove repetition instead of adding sections.

**Design read:** B2B commerce operating-system redesign for owner-operators, with editorial kinetic storytelling, high spatial variance, purposeful scroll choreography, and moderate product density.

**Design dials:** variance 8 / motion 8 / density 4.

The story follows one set of operational fragments from scattered work to a calm, connected operating system. Motion explains that change. It is not decoration.

## Live Baseline

Audited deployment: `https://shimmerstock-production.up.railway.app/`

### Structure

- Eleven top-level homepage sections.
- Desktop page height: 10,175px at 1440 x 900.
- Mobile page height: 16,448px at 390 x 844.
- 47 buttons and 80 links.
- No horizontal overflow, console errors, or failed responses at the audited viewports.
- The hero is readable but follows a familiar two-column SaaS composition.
- Product UI appears before the fragmentation problem is established.
- The six-card workflow grid and later order-flow scene repeat the same product argument.
- The Novi section repeats priorities and actions in multiple nested surfaces.
- The industry switcher is useful but renders far more repeated markup than the narrative requires.
- Independent reveal animations do not create object continuity.
- Large rounded panels, pills, and chip rows flatten the editorial hierarchy.
- `novi-character.png` is used twice and accounts for most of the transfer budget while conflicting with the pending final tuxedo-cat art direction.

### Lighthouse Baseline

| Metric | Desktop | Mobile |
| --- | ---: | ---: |
| Performance | 86 | 60 |
| Accessibility | 86 | 86 |
| First Contentful Paint | 588ms | 1,723ms |
| Largest Contentful Paint | 1,891ms | 9,682ms |
| Speed Index | 1,287ms | 3,778ms |
| Total Blocking Time | 169ms | 490ms |
| Cumulative Layout Shift | 0 | 0 |
| Transfer | 1,679,440 bytes | 1,679,001 bytes |
| Main-thread work | 924ms | 3,230ms |

## Content Disposition

| Current material | Decision | Story destination |
| --- | --- | --- |
| Hero headline, lead, and primary CTAs | KEEP, EDIT | Chapter 1 editorial hero |
| Command Center product canvas | REDESIGN | Chapters 1-2 shared workspace |
| Hero chip row | REMOVE | Meaning moves into the visual story |
| "Everything behind your storefront" overview | COMBINE | Chapter 1 operational fragments |
| Before/after fragmentation | COMBINE | Chapters 1-2 chaos-to-command transition |
| Six core-workflow cards | REMOVE AS GRID | Chapter 3 one-order journey |
| Order-flow section | COMBINE | Chapter 3 one-order journey |
| Novi introduction and Morning Brief | REDESIGN | Chapter 4 two-beat decision reduction |
| Duplicate Novi action rows | REMOVE | One clear review action per decision |
| Giant Novi portrait | REMOVE | Reserved approved-art integration point |
| Industry switcher | KEEP, REDESIGN | Chapter 5 workspace morph |
| SKU and label capability | ADD WITHIN STORY | Chapter 6 compact operational beat |
| Savings calculator | KEEP, REDESIGN | Chapter 7 consolidation outcome |
| Standalone Early Access explanation | COMBINE | Final CTA supporting copy |
| Security and trust | KEEP, REDESIGN | Chapter 8 quiet navy trust scene |
| Existing final CTA | KEEP, EDIT | Narrative close after trust scene |
| Generic reveal on every section | REMOVE | Scene-specific motion only |

This disposition removes redundant layouts while retaining every strong product argument. It does not create eleven new scenes below the existing page.

## Narrative Chapters

### Chapter 1: The Work Behind the Storefront

**Purpose:** Establish the owner-operator's problem before presenting the product.

The existing headline remains the primary statement: "Your storefront sells the product. ShimmerStock runs everything behind it." The supporting copy becomes shorter and the first viewport signals operational reality rather than a finished dashboard.

Six shared fragments enter as recognizable work, not generic floating cards:

1. Shopify order `#8197`.
2. Inventory warning for Vanilla Base.
3. Customer conversation linked to the order.
4. Production task for Batch `#52`.
5. Shipping task requiring a label reprint.
6. SKU/barcode issue requiring review.

Desktop motion introduces the fragments around the editorial copy with restrained depth and varied timing. Scroll does not move the page sideways. The fragments begin aligned enough to read, then drift into conflict as the next chapter starts.

Mobile renders the same six fragments as a deliberate vertical sequence below the headline. No pinning is required in the first viewport. Reduced motion shows the complete sequence in its initial reading order.

### Chapter 2: From Fragmentation to Command

**Purpose:** Demonstrate consolidation using the exact objects introduced in Chapter 1.

The opening stage may pin on desktop while the six fragments separate into app-like lanes, overlap, and become harder to reconcile. A single transition then assembles those same DOM objects into the Command Center shell. New substitutes must not fade in over old objects because that would break continuity.

The resulting workspace is an illustrative product surface with explicit status labeling. It should be calmer than the current dashboard: one navigation rail, one owner-attention summary, and the six shared objects in their appropriate operational lanes. Fake revenue, customer, and success metrics are not introduced.

Desktop choreography:

- Native scroll drives one top-level ScrollTrigger timeline.
- The outer chapter may pin; only children animate.
- Fragment movement uses `x`, `y`, `scale`, `rotation`, `opacity`, and `autoAlpha`.
- A timeline label marks `fragmentation`, `alignment`, and `command` states.
- Pin duration must be short enough that the story does not feel trapped.

Mobile choreography:

- No multi-screen pin.
- A static "scattered" stack is followed by an assembled Command Center state.
- A short one-time transform may connect the states when motion is allowed.

Reduced motion:

- Show a labeled "Disconnected work" composition followed by "One Command Center."
- All objects remain visible and readable without timeline state.

### Chapter 3: One Order, One Connected Journey

**Purpose:** Replace the six-card feature inventory and duplicate order-flow section with one concrete operational thread.

Order `#8197` becomes the chapter's persistent anchor. It moves through:

1. Shopify order intake - read-only imported order context.
2. Inventory - availability and the linked Vanilla Base risk.
3. Production - Batch `#52` status and component context.
4. Fulfillment - pick, pack, and label-reprint exception.
5. Shipment - operational shipped state, not an automatic Shopify write claim.
6. Customer care - order, fulfillment, and conversation context together.

Only one main workspace is on screen. Its content and emphasis change while the order token remains spatially recognizable. The motion communicates that the record remains connected across modules; it must not imply that every operational action happens automatically.

Desktop may use a pinned stage with a vertical progress rail and one timeline. Mobile uses six stacked steps with a sticky order summary only when it does not obscure content. Reduced motion renders all six steps in document order.

### Chapter 4: Novi Reduces the Noise

**Purpose:** Show Novi as operating intelligence that reduces owner workload, not a chatbot or mascot performance.

Beat one starts with 26 illustrative records from fulfillment, inventory, customers, demand, and purchasing. The visual count is explicitly illustrative and represents records under review, not live customer activity. The records organize into three grouped owner decisions:

1. Clear the fulfillment exception holding Order `#8197`.
2. Decide whether to reorder Vanilla Base based on runway and lead time.
3. Reply to the customer with order and fulfillment context.

Use the established voice principle: "There are 26 records asking for your attention. Only three need your decision today." Novi recommends, prepares, previews, and explains. Novi does not claim to have sent, ordered, fulfilled, or changed anything.

Beat two resolves into a calm Morning Brief. The brief shows the same three decisions, their reasoning, and one explicit next step each. It does not repeat a second list of generic Novi actions.

Approved-art boundary:

- Do not use the giant current public portrait as the scene's focal point.
- Do not draw a replacement mascot in CSS, SVG, canvas, or generated art.
- Reserve one subtle artwork slot driven by the approved Novi asset manifest.
- Until final approved tuxedo-cat states exist, use a restrained `N` brand mark or the repository's pending-art treatment and identify the limitation in owner review.

Mobile uses progressive disclosure: grouped decision headings are always visible and details open accessibly. Reduced motion shows the final grouped brief with a short static preface explaining that 26 illustrative records were consolidated.

### Chapter 5: One Workspace, Different Businesses

**Purpose:** Preserve the current industry's specificity without rendering eight full duplicate dashboards.

One workspace morphs across a focused set of business types: craft supplies, e-commerce brand, freshies, apparel, bakery, candles, bath and body, and boutique. The frame remains stable while vocabulary, inventory examples, production language, and alert context change.

The default view should be selected based on editorial fit, not auto-rotate. User-selected tabs remain authoritative and keyboard accessible. Scroll may demonstrate up to three representative morphs once; all eight remain available through the controls.

Motion changes text and a small number of visual tokens. It must not move every panel independently. Mobile uses a horizontally scrollable tab list with 44px minimum targets and a single stable workspace below it. Reduced motion changes content immediately with no crossfade dependency.

### Chapter 6: Identity at the Shelf

**Purpose:** Add a compact SKU, label, and scan beat only where current implementation supports the claim.

The scene follows one affected variant from review to a usable label:

1. Audit identifies a missing or conflicting identifier.
2. Novi prepares a deterministic SKU or internal barcode proposal.
3. The owner reviews and approves selected ready items.
4. Approved identifiers are saved in ShimmerStock.
5. A test label is previewed and printed at a real thermal size.
6. A USB or Bluetooth scan resolves the product, stock count, bin, and Shopify location context when available.

Safe default labels are `Review`, `Approve`, `Saved in ShimmerStock`, `Print test label`, and `Scan match`. Internal barcodes must be described as operational identifiers, not retail UPCs or GTINs.

Optional Shopify product identifier writeback exists only behind active `write_products` permission, owner/admin controls, an exact confirmation, per-row result handling, and reread verification. Because public onboarding and integration pages still describe Shopify as read-only beta, this homepage chapter must not show `Shopify Updated`, imply default write access, or make writeback part of the core story. The capability can be disclosed later as an explicitly permissioned Early Access path after public truth documentation is reconciled in a separate issue.

### Chapter 7: Fewer Tools, Clearer Cost

**Purpose:** Retain the useful consolidation calculator while making the outcome part of the narrative.

The existing tool inputs converge into one operational-system line. Savings are calculated only from user-entered values; no prefilled result may masquerade as a customer outcome. The section states what is included and what is not, and avoids guaranteed savings language.

Desktop motion may collapse named tool rows into the ShimmerStock line after the user changes an input. Mobile uses the same calculator in a single column. Reduced motion uses immediate state changes and a textual result announcement.

### Chapter 8: Trust, Then Invitation

**Purpose:** End with structural confidence and a clear next step, not another feature grid.

The page enters a quiet deep-navy field. Trust statements remain specific:

- Tenant-scoped data access.
- Role-aware authorization.
- Encrypted credential handling.
- Secure HttpOnly sessions.
- Read-only Shopify Early Access by default.
- Explicit product maturity labels.
- Preview and approval before sensitive Novi actions.

No compliance badges, uptime claims, certifications, or customer logos are invented. Purple, green, pink, and warm cream remain accents against navy rather than becoming a one-hue dark theme.

The final CTA follows as the conclusion: "Your business grew up. Your back office should too." Supporting copy absorbs the current standalone Early Access explanation. Primary action remains `/early-access`; the secondary action points to the product experience. No card grid follows it.

## Shared Object Contract

| Object | First appearance | Later use | Truth constraint |
| --- | --- | --- | --- |
| Shopify order `#8197` | Chapter 1 | Command Center, journey, Novi, care | Imported/read-only context; do not imply order mutation |
| Vanilla Base warning | Chapter 1 | Inventory, production, Novi | Recommendation based on illustrative runway and lead time |
| Customer conversation | Chapter 1 | Novi decision, customer care | Illustrative; no automatic email claim |
| Batch `#52` | Chapter 1 | Production and fulfillment | Status context; no automatic production claim |
| Label reprint task | Chapter 1 | Fulfillment and SKU scene | Operational exception, not automatic Shopify fulfillment |
| SKU/barcode issue | Chapter 1 | Novi grouping and label scene | Human review; synthetic Shopify keys never shown as merchant SKUs |

Shared objects require stable `data-story-object` identifiers. Desktop timelines should transform the same elements when practical. Where responsive markup must differ, object names, content, and reading order remain consistent.

## Motion Architecture

GSAP with ScrollTrigger is justified because the brief requires object continuity, pinning, scrubbed state transitions, labeled sequencing, and responsive timeline composition. CSS remains responsible for layout, static states, hover/focus feedback, and simple non-scroll transitions.

Implementation rules:

- Use GSAP as the only animation framework.
- Register ScrollTrigger once in the homepage-only module.
- Do not use ScrollSmoother, a custom scroll proxy, or any scroll hijacking.
- Native scrolling remains authoritative.
- Lazy-load the homepage story module so other marketing pages do not pay its cost.
- Put ScrollTrigger on top-level timelines, not child tweens.
- Use timeline labels for semantic states.
- Prefer transforms, opacity, and `autoAlpha`; avoid layout-property animation.
- Animate children of pinned sections, not the pinned element itself.
- Use `gsap.matchMedia()` for desktop, mobile, and reduced-motion branches.
- Revert match-media contexts and kill created timelines/triggers during cleanup.
- Refresh ScrollTrigger after fonts and critical images settle.
- Keep trigger count small and inspect all pinned sections for keyboard reachability.
- Do not hide required content before JavaScript initializes.

Progressive enhancement is mandatory. Semantic HTML and the full story must remain understandable when JavaScript, GSAP, or IntersectionObserver is unavailable.

## Responsive Contract

### Desktop, 1024px and wider

- At most three pinned narrative stages: opening assembly, one-order journey, and Novi reduction.
- No pinned stage should require more than roughly 2.5 viewport heights without owner review.
- Keep editorial copy in normal document flow beside or above the stage.
- Prevent nested scrolling regions inside story stages.
- Maintain visible focus and ensure focused controls are not trapped under pinned content.

### Tablet, 768px to 1023px

- Shorter pin distances or unpinned step transitions based on real-browser QA.
- Workspace details reduce before type becomes too small.
- Touch controls remain at least 44px high.
- Landscape at 1024 x 768 and 844 x 390 receives explicit overlap checks.

### Mobile, below 768px

- Use native vertical chapters rather than a scaled desktop pinning experience.
- Preserve the six shared objects and story order.
- Use stable aspect ratios and min-heights for workspaces to prevent layout shift.
- Use 18-20px gutters at 375-430px.
- Keep CTAs full width at 480px and below.
- Avoid horizontal overflow; only tab lists may scroll horizontally by design.
- Do not require drag, hover, or precise pointer movement.

### Reduced Motion

- Render a complete static story in logical DOM order.
- Do not simply set animation duration to zero on hidden or transformed states.
- Disable pinning, scrubbing, parallax, drifting, and count cascades.
- Preserve all product truth, labels, controls, decisions, and CTAs.
- Use immediate accessible state changes for user-controlled tabs and calculator inputs.

## Accessibility Contract

- One H1 and logical H2/H3 progression.
- Every illustrative workspace carries a visible or accessible `Illustrative workspace` label.
- Decorative operational fragments are hidden from assistive technology only when equivalent text is present nearby.
- Interactive tabs use correct roles, selected state, roving or predictable focus, arrow-key behavior where established, and visible focus.
- No scroll-driven visual state is the only source of information.
- Color is never the only status indicator.
- Body text and controls meet WCAG AA contrast, including the navy scene.
- All pointer targets are at least 44 x 44px on touch layouts.
- Dynamic calculator results use a polite live region.
- Focus order follows DOM order regardless of transformed visual position.
- Screen-reader and keyboard users can bypass decorative story mechanics and reach every CTA.

Target Lighthouse accessibility score: at least 95.

## Performance Budget

| Metric | Required | Target rationale |
| --- | ---: | --- |
| Desktop LCP | <= 2.2s | Preserve current strong desktop paint |
| Mobile LCP | <= 3.0s | Remove the current 9.7s mobile failure |
| CLS | <= 0.05 | Keep stable layout behavior |
| Desktop TBT | <= 150ms | Offset animation dependency cost |
| Mobile TBT | <= 250ms | Keep story responsive on constrained CPUs |
| Total transfer | <= baseline | Hard ceiling of 1.68MB |
| Total transfer target | < 1.0MB | Remove giant portrait from critical path |
| Accessibility | >= 95 | Correct current baseline gaps |

Performance implementation requirements:

- Remove `novi-character.png` from the homepage critical path; do not replace it with another unapproved large asset.
- Load homepage animation code only on `/`.
- Do not load GSAP on other public pages.
- Avoid autoplay video and large background media.
- Declare image dimensions and lazy-load below-the-fold media.
- Keep animated layer count bounded and use `will-change` only during active animation.
- Measure desktop and mobile with the repository's local production server and the same Lighthouse environment used for baseline.
- Inspect main-thread time, transfer, long tasks, and memory in addition to score.

## Product Truth Matrix

| Story claim | Status | Required language or boundary |
| --- | --- | --- |
| Shopify order context enters ShimmerStock | Safe | Early Access / read-only beta; illustrative workspace |
| Inventory, production, fulfillment, and care share context | Safe | Describe visibility and workflow, not automatic execution |
| Novi groups records into owner decisions | Safe | Illustrative count; recommends/prepares/previews |
| Novi places orders, sends messages, or fulfills automatically | Forbidden | Owner review and approval remain explicit |
| SKU and barcode catalog audit | Safe | Tenant-scoped, deterministic proposals, review required |
| Save approved identifiers locally | Safe | `Saved in ShimmerStock` |
| Print real thermal label sizes | Safe | Test-label-first and browser print flow |
| Scan to product, stock, bin, and locations | Safe | State that location context appears when available |
| Internal barcode is a retail UPC/GTIN | Forbidden | Explicitly distinguish internal operational barcode |
| Shopify identifier writeback | Conditional | Only with approved `write_products`, exact confirmation, row results, and reread verification |
| `Shopify Updated` in default homepage story | Forbidden | Public onboarding remains read-only beta |
| Savings amount | Conditional | Derived only from user input; no guaranteed outcome |
| Security controls | Safe | Use verified controls only; no invented certification |

## Visual Direction

- Preserve the brand's warm cream, violet, green, selective blush/pink, and gold accents.
- Introduce deep navy only for structure and the trust chapter; document the final token in the brand system when implemented.
- Use the established editorial serif for large narrative statements and the established sans serif for product UI.
- Let typography, rhythm, and negative space provide more hierarchy than containers.
- Keep cards at 8px radius or less in the new story unless they represent a literal app panel that already requires a different product-system radius.
- Avoid cards inside cards, decorative blobs, gradient orbs, generic dashboard mosaics, and repeated pill rows.
- Product frames should feel like one evolving workspace, not unrelated screenshots floating around the page.
- Use icons only when they add operational meaning; prefer the repository's established icon library where available.

## Taste Gate

The implementation fails review if any answer below is yes:

- Could the page belong to a generic AI SaaS company after changing the logo?
- Does it add sections instead of combining the existing story?
- Are there repeated rounded cards, pill clouds, or decorative gradients doing the hierarchy's work?
- Are metrics presented as live customer outcomes or social proof?
- Do product screenshots float without a narrative relationship?
- Does Novi become a giant mascot, chatbot bubble, or invented character design?
- Does motion occur without explaining fragmentation, continuity, prioritization, adaptation, or consolidation?
- Does desktop pinning make the page feel trapped?
- Is mobile a compressed copy of desktop rather than a deliberate vertical story?
- Does reduced motion omit information or show hidden intermediate states?
- Does any Shopify language contradict read-only public onboarding?

The implementation also fails if the final still screenshot is only recognizable as "purple SaaS cards." It should be recognizable as one product-business order moving through a calm operational system.

## Validation and Review Package

Before owner review:

1. Run `bun install --frozen-lockfile`.
2. Run `node scripts/redact-secret-report.mjs --check` when present.
3. Run `bun run check:safety` when present.
4. Run `bun run typecheck`.
5. Run `bun test` and report test/file/assertion counts.
6. Run `bun run build`.
7. Run `git diff --check`.
8. Capture desktop, tablet, mobile, landscape, and reduced-motion screenshots.
9. Test keyboard navigation, focus visibility, touch target size, overflow, and text overlap.
10. Run Lighthouse desktop and mobile and compare every budget metric with baseline.
11. Inspect CPU, memory, long tasks, total transfer, and GSAP bundle impact.
12. Conduct explicit UI/UX Pro Max and Taste Skill critiques using the taste gate above.
13. Record a short desktop and mobile motion walkthrough if the environment supports stable capture.

The owner-review package must include the before/after map, this storyboard, animation behavior by breakpoint, screenshots, reduced-motion evidence, dependency and bundle impact, Lighthouse comparison, accessibility findings, design critiques, exact verification results, and known limitations.

## Open Dependencies and Stop Condition

- Final approved Novi tuxedo-cat artwork and state variants are not present. This PR must preserve an asset-manifest integration point and report the gap.
- Public Shopify documentation still describes read-only behavior while narrowly permissioned identifier writeback now exists. This homepage story stays read-only-safe; documentation reconciliation belongs in a separate approved issue.
- Final GSAP dependency size and loading strategy must be measured after the smallest story foundation is implemented.

Stop after opening the focused owner-review pull request for issue #38. Do not merge. Do not deploy. Do not connect Shopify or any real merchant store.