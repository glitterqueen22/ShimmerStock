# ShimmerStock — Master Blueprint (Canonical Repository Source of Truth)

## Version and provenance

| Field | Value |
|---|---|
| Document status | Canonical source of truth for product direction inside this repository |
| Assembled | 2026-08-01 by technical-writer (delegated session), documentation-only |
| Verified against | `main` @ `e878019` (clean checkout; `/home/team/shared/site` working tree lags `origin/main` by 2 commits at assembly time) |
| Source input 1 | `ShimmerStock_CTO_Master_Blueprint_v2.md` — "Master Product Blueprint & CTO Execution Plan", Version 1.0, dated July 31, 2026 (shared workspace) |
| Source input 2 | `ShimmerStock_Universal_Ecommerce_Addendum.md` — "Universal E-Commerce Experience Addendum", Version 1.0, dated August 1, 2026 (shared workspace) |
| Owner directive | The owner states that **Blueprint v4 replaces the prior version** and includes the **Universal E-Commerce Layer, ShimmerBox, and Product Studio**. |

### How this document was assembled (read before citing it)

1. **Part I** reproduces the v2 Master Blueprint **verbatim and complete** — no v2 section was dropped, summarized away, or silently reordered. Where the owner-approved v4 layer changes emphasis, that is recorded in Part III, never by editing Part I.
2. **Part II** reproduces the Universal E-Commerce Experience Addendum **verbatim and complete**. Per the owner directive, this addendum is the approved **v4 layer** of the blueprint. ShimmerBox (already present as v2 §8.15) and Product Studio (referenced in addendum §11) are part of the approved v4 scope.
3. **Part III** is new editorial material written for this canonical edition: it reconciles v2 and the v4 layer, states what supersedes what, and records the owner's standing constraint that v4 capabilities must **not** interrupt the active stabilization, testing, security, monitoring, backup, or bounded Commerce Core work.

### Precedence rules (agreed reading order)

- If Part I (v2) and Part II (v4 layer) appear to conflict, **Part II wins for sequencing and scope of universal commerce capabilities**; Part I wins for brand, mission, Novi, industry packs, pricing direction, and the Definition of Done. Known overlaps are listed explicitly in Part III §C2 rather than resolved by silent edits.
- The owner's 2026-08-01 constraint (addendum §1, restated in the delegation that produced this file): capabilities in Part II are added to the approved roadmap and the current-state audit, but they **must not interrupt the active stabilization, automated-test, CI, security, monitoring, backup, or bounded Commerce Core milestone**, except where a foundational data-model decision must be made now to avoid rework (see `docs/ROADMAP.md` §"Foundational decisions").
- Evidence classifications for every capability — including every Part II capability — live in `docs/CURRENT_STATE_AUDIT.md`. Sequencing lives in `docs/ROADMAP.md`. This document defines *what* and *why*; those two documents define *what is true today* and *in what order we build*.

---
---

# PART I — Master Product Blueprint (v2), preserved in full

*Source: `ShimmerStock_CTO_Master_Blueprint_v2.md`, Version 1.0, July 31, 2026. Reproduced verbatim below this line.*

---
# ShimmerStock
## Master Product Blueprint & CTO Execution Plan

**Version:** 1.0  
**Date:** July 31, 2026  
**Repository:** `glitterqueen22/ShimmerStock`  
**Official product name:** **ShimmerStock**  
**Primary AI business companion:** **Novi**

---

# 1. Executive Directive

ShimmerStock is not being rebuilt from scratch. It is an existing product with an active repository, completed work, preserved branches, tests, CI work, and product decisions already made.

The first responsibility of every engineering session is to inspect the current repository and preserve verified work. Do not recreate a module merely because it appears in this blueprint. Compare the blueprint to the implementation, document the gaps, and continue from the current state.

ShimmerStock is being built as:

> **The commerce operating system for product-based small businesses.**

Its promise is:

> **Run your entire business from one login.**

Its mission is:

> **Give entrepreneurs their evenings back by making a product business easier to understand, operate, and grow.**

Every feature must do at least one of the following:

1. Save the owner or team meaningful time.
2. Reduce stress, errors, or operational uncertainty.
3. Help the business make or protect money.
4. Replace a disconnected tool or manual spreadsheet.
5. Make sophisticated business operations understandable to a nontechnical owner.

ShimmerStock must feel like premium e-commerce software, not a traditional ERP. It should be powerful under the hood while remaining calm, visual, friendly, and easy to use.

---

# 2. Product Positioning

## 2.1 What ShimmerStock is

ShimmerStock is an all-in-one operating platform for businesses that sell physical products online, in person, through wholesale, through affiliates, and through live-selling channels.

It unifies:

- E-commerce command center
- Orders and fulfillment
- Products and variants
- Inventory and warehouse operations
- Purchasing and vendors
- Recipes, bills of materials, batches, and production
- Shipping and returns
- Customer service and CRM
- Marketing and content creation
- Wholesale and B2B
- Affiliates, ambassadors, and reps
- Sales and profitability intelligence
- Whatnot and live-sale planning
- Employee workspaces and permissions
- AI-assisted operations through Novi

ShimmerStock should replace the need for a small business to stitch together a collection of disconnected inventory, customer-service, warehouse, marketing, analytics, and workflow tools.

## 2.2 What ShimmerStock is not

ShimmerStock is not:

- A generic spreadsheet replacement
- A basic stock counter
- A clone of Shopify
- A generic chatbot placed on top of dashboards
- A cluttered enterprise ERP made smaller
- A collection of unrelated features without a shared data model

Shopify and other channels may remain the storefronts. ShimmerStock becomes the operational home where the owner and team spend their workday.

## 2.3 Core belief

> **Small businesses deserve enterprise-level capability without enterprise-level complexity or pricing.**

## 2.4 Brand outcome

The long-term brand goal is for customers to say:

> **“We run on ShimmerStock.”**

---

# 3. Target Customers

ShimmerStock serves product-based businesses, especially businesses that make, personalize, batch, assemble, source, store, and ship their own products.

## 3.1 Initial priority industries

The first three deeply tailored Business DNA packs should be:

### Freshie and fragrance-product makers

Needs include:

- Fragrance oils and raw materials
- Aroma beads and base materials
- Weight-based inventory
- Formulas and fragrance-load calculations
- Batch production
- Cure times
- Mold and blank tracking
- Packaging and labeling
- Cost-per-batch and cost-per-unit
- Bundles, samples, unreleased items, and live-sale inventory

### Apparel and T-shirt makers

Needs include:

- Blank garments by brand, style, color, and size
- Artwork and design files
- Decoration method
- Personalization fields
- Job tickets and production queues
- Gang sheets or print batches
- Material usage
- Quality-control stages
- Made-to-order and preorder workflows
- Finished-product and component inventory

### Bakeries and cottage-food businesses

Needs include:

- Recipes and batch yields
- Ingredient inventory and unit conversions
- Allergens and dietary attributes
- Shelf life and expiration
- Prep schedules
- Production capacity
- Pickup and delivery windows
- Custom-order details
- Deposits and final payments
- Cost per batch and cost per serving

## 3.2 Later industry packs

- Candles and wax products
- Soap and bath/body products
- Tumblers and drinkware
- Laser engraving and personalization
- Jewelry
- Pet treats and pet products
- Coffee roasting
- Freeze-dried candy and packaged food
- Boutiques and gift businesses
- Print shops
- Subscription-box businesses
- Small-batch wholesale manufacturers

## 3.3 Shared customer problems

Every supported industry is trying to answer a similar set of questions:

- What sold?
- What needs to be made, picked, packed, or shipped?
- Where is the inventory?
- What will run out next?
- What should be reordered?
- Did the product actually make money?
- Which customers need attention?
- What should the owner or employee do next?
- What can be automated?
- What opportunity is being missed?

ShimmerStock must answer those questions clearly and proactively.

---

# 4. Product Experience

## 4.1 The ShimmerStock feeling

A customer should log in and feel:

> **Everything is under control.**

The interface must not create the feeling:

> “Where do I even start?”

## 4.2 Premium e-commerce design direction

ShimmerStock should visually feel closer to a modern commerce, finance, or productivity platform than a legacy warehouse system.

Design qualities:

- Premium and polished
- Cream, lavender, purple, and restrained accent colors
- Rounded cards and calm spacing
- Clear serif display headlines paired with highly readable interface text
- Strong product imagery where useful
- Clean order and fulfillment timelines
- Channel badges
- Status chips
- Helpful empty states
- Large, clear actions
- Minimal cognitive overload
- Responsive desktop, tablet, and mobile behavior
- Scanner-first mobile workflows for warehouse users
- Accessible contrast, keyboard navigation, focus states, and screen-reader labeling

Avoid:

- Dense ERP-style grids as the default experience
- Tiny controls
- Long unprioritized menus
- Technical database language presented to ordinary business owners
- Dashboard pages made only of charts
- AI copy that is vague, overly chatty, or unsupported by data

## 4.3 Primary navigation model

Recommended top-level product areas:

1. **HQ** — command center, Novi briefing, business health, actions
2. **Sell** — channels, storefront connections, POS, live selling
3. **Orders** — orders, returns, fulfillment, shipping
4. **Products** — catalog, variants, bundles, pricing, listings
5. **Inventory** — stock, warehouses, bins, counts, transfers
6. **Make** — recipes/BOMs, production plans, batches, job tickets
7. **Customers** — CRM, tickets, credits, loyalty, customer history
8. **Market** — campaigns, content, email, SMS, social, launches
9. **Wholesale** — accounts, price lists, case packs, invoices, terms
10. **Money** — COGS, margin, payouts, fees, cash-flow snapshots
11. **Team** — roles, tasks, performance, approvals, SOPs
12. **Reports** — deeper analytics and exports
13. **Novi** — business assistant, recommendations, action history
14. **Settings** — organization, integrations, permissions, billing

Navigation should adapt by plan, permission, industry pack, and enabled modules.

---

# 5. HQ: The E-Commerce Command Center

HQ is not a generic dashboard. It is the owner’s prioritized operating brief.

## 5.1 Core HQ sections

### Welcome and current status

Example:

> **Good morning, Monica. Your business is healthy today.**

### What happened

- Revenue since last login
- Orders received
- Orders fulfilled
- Production completed
- Customer issues resolved
- Channel or product spikes

### What needs attention

- Orders at risk of missing service level
- Inventory below reorder point
- Failed channel synchronization
- Unanswered customer messages
- Negative-margin products
- Production delays
- Payment or fulfillment exceptions

### What to do next

A prioritized, role-aware action list:

- Ship 17 orders due today
- Approve a purchase order
- Reorder a material predicted to run out
- Review two customer escalations
- Start a production batch
- Publish a prepared launch campaign

### Opportunities

- Trending product
- High-intent abandoned carts
- Strong cross-sell pairing
- Unused wholesale opportunity
- Product with increasing search or view activity
- Slow-moving stock suitable for a bundle

### Wins

- Faster shipping time
- Improved repeat purchase rate
- Better customer response time
- New sales milestone
- Reduced stockouts
- Hours saved through automation

## 5.2 Role-based HQ

Different users should see different priorities.

### Owner / CEO

- Revenue, margin, cash, risk, opportunities, approvals
- Multi-business and multi-location overview
- Founder Mode

### Warehouse employee

- Pick queue
- Pack queue
- Bin locations
- Scan tasks
- Exceptions
- Shipping labels

### Production employee

- Production schedule
- Materials available
- Batch instructions
- Quality-control checkpoints
- Completion and waste capture

### Customer-service employee

- Queue and service levels
- Customer history
- Suggested replies
- Replacement, refund, or store-credit actions
- Escalations

### Marketing employee

- Launch calendar
- Draft content
- Campaign performance
- Product opportunities
- Required approvals

### Manager

- Team queue
- Workload balance
- exceptions
- approvals
- progress against daily goals

## 5.3 CEO Mode

CEO Mode provides one command center across multiple businesses, brands, storefronts, locations, and teams.

It should show:

- Consolidated revenue and margin
- Business-by-business health
- Orders and fulfillment risk
- Cash and payout visibility
- Customer-service risk
- Inventory risk
- Team approval queues
- Biggest opportunity and biggest threat across all businesses

A user may operate GGE, The Party Lab, Wish Upon a Design, or future brands from one account without mixing tenant data or employee permissions.

---

# 6. Novi: The AI Business Companion

Novi is a defining part of ShimmerStock. Novi is not merely a chatbot.

## 6.1 Novi personality

Novi should be:

- Supportive
- Smart
- Calm
- Proactive
- Trustworthy
- Encouraging
- Organized
- Clear about uncertainty
- Helpful without being distracting

Novi should never fabricate certainty, financial impact, inventory availability, or completed actions.

## 6.2 Novi core experiences

- Morning Brief
- What Happened
- What Needs Attention
- What to Do Next
- Opportunity Center
- Low-stock and stockout forecasts
- Business Health explanations
- Business Wrapped summaries
- Milestone celebrations
- Area-specific assistance for warehouse, production, marketing, finance, customer support, and affiliates

## 6.3 Novi action pattern

Every recommendation should include:

1. **Observation** — what Novi detected
2. **Evidence** — the data or event supporting it
3. **Impact** — why it matters
4. **Recommended action** — what to do
5. **Confidence or limitation** — when prediction is involved
6. **Action control** — preview, approve, dismiss, snooze, or automate

Example:

> **Formula 26 may sell out in approximately six days.**  
> Based on the last 30 days of sales and the current available inventory.  
> Recommended action: create a draft purchase order for 200 pounds.  
> **[Preview Purchase Order] [Snooze]**

## 6.4 Novi permissions and safety

Novi may draft and recommend actions. Sensitive actions require explicit approval based on role and organization policy.

Approval should be required for actions such as:

- Sending customer communications when not covered by an approved automation
- Issuing refunds or high-value credits
- Changing product prices
- Placing purchase orders
- Editing accounting records
- Publishing campaigns
- Deleting data
- Changing permissions

Every Novi action must be logged with:

- User
- Timestamp
- Source data
- Suggested action
- Approval state
- Result
- Reversal or remediation path when supported

## 6.5 Novi memory and context

Novi should understand the organization’s:

- Products and variants
- Inventory and locations
- Orders and customer history
- Policies
- Recipes and production
- Vendors and lead times
- Service levels
- Marketing calendar
- Employee permissions
- Brand voice
- Industry pack

Novi should use tenant-scoped retrieval and never cross customer data between organizations.

---

# 7. Business DNA: Industry-Adaptive ShimmerStock

Business DNA allows one platform to deliver a deeply relevant experience to different product businesses.

## 7.1 Business DNA onboarding

During onboarding, ask:

- What do you make or sell?
- Do you manufacture, personalize, assemble, source, or resell?
- Where do you sell?
- Do you hold inventory?
- Do you sell made-to-order, ready-to-ship, preorder, wholesale, or subscription products?
- Do you operate one or multiple locations?
- Do you have employees?
- Which workflows are most painful today?

The result determines:

- Terminology
- Default navigation
- Enabled modules
- Dashboard cards
- Calculators
- Templates
- Onboarding checklist
- Recommended automations
- Starter reports
- Sample data
- SOP suggestions

## 7.2 Industry-pack architecture

Business DNA must be implemented as configuration and extensibility, not hard-coded duplicate applications.

An industry pack should be able to define:

- Display terminology
- Product and material field schemas
- Recipe or job structures
- Units of measure
- Production statuses
- Required compliance fields
- Default reports
- Onboarding steps
- Automation templates
- Novi knowledge and prompts
- Dashboard components
- Recommended integrations

## 7.3 Freshie pack

Recommended domain concepts:

- Fragrance oil
- Aroma beads
- Base material
- Mold
- Blank
- Formula
- Fragrance percentage/load
- Batch weight
- Cure start and cure-ready date
- Yield and waste
- Scented-bead inventory
- Ready-to-package inventory
- Ready-to-sell inventory
- Sample sizes
- Unreleased or vault products

## 7.4 Apparel pack

Recommended domain concepts:

- Blank garment
- Brand/style/color/size matrix
- Artwork/design
- Print method
- Transfer or decoration material
- Personalization
- Job ticket
- Due date
- Production station
- Quality-control status
- Pack by order or production batch

## 7.5 Bakery pack

Recommended domain concepts:

- Ingredient
- Recipe
- Batch yield
- Serving/unit yield
- Allergen
- Shelf life
- Expiration or best-by date
- Prep date
- Pickup/delivery window
- Custom design details
- Capacity and production slot
- Deposit and balance

---

# 8. Core Platform Modules

# 8.1 Organization, tenancy, and accounts

- Multi-tenant organizations
- Multiple businesses/brands per account
- Multiple locations and warehouses
- Multiple selling channels
- User invitations
- Role-based access control
- Fine-grained permissions
- Approval policies
- Audit logs
- Subscription plan and usage metering
- Feature flags
- Data export and account closure workflow

# 8.2 Onboarding

Target experience: from signup to useful operation quickly, with a guided goal of connecting a store and reaching a first operational win in approximately 30 minutes where the customer’s data size permits.

Onboarding should include:

- Business DNA selection
- Store/channel connection
- Product and inventory import
- Location setup
- Team invitation
- Shipping configuration
- Customer-service policy setup
- Brand voice setup
- First Novi briefing
- Progress checklist
- Safe sample/demo mode

# 8.3 Products and catalog

- Products and variants
- Media and product imagery
- SKUs, UPCs, barcodes
- Channel listing status
- Pricing and compare-at pricing
- Cost data
- Tax and fulfillment attributes
- Bundles, kits, sets, and case packs
- Custom fields by industry pack
- Product status: draft, active, archived, unreleased, preorder
- Listing health and channel reconciliation
- Product relationship and cross-sell suggestions

# 8.4 Orders and fulfillment

- Unified orders across channels
- Order timeline
- Payment and fulfillment status
- Pick, pack, and ship
- Split fulfillment
- Backorders and preorders
- Holds and exceptions
- Returns and exchanges
- Replacements
- Store credit
- Refund approvals
- Shipping labels and tracking
- Packing slips
- Internal notes
- Customer communication timeline
- Service-level tracking

# 8.5 Inventory and warehouse

- Inventory by location
- Bins and barcode scanning
- Available, committed, incoming, damaged, quarantined, and in-production quantities
- Stock counts and cycle counts
- Transfers
- Adjustments with reason codes
- Lot and batch tracking where relevant
- Expiration tracking where relevant
- Reorder points
- Safety stock
- Vendor lead time
- Forecasted stockout date
- Purchase suggestions
- Bundle and component availability
- Inventory audit trail
- Mobile scan mode

# 8.6 Purchasing and vendors

- Vendor directory
- Vendor products and costs
- Lead times
- Minimum order quantities
- Case packs
- Purchase orders
- Draft, submitted, partially received, received, canceled statuses
- Receiving by scanner
- Discrepancy capture
- Landed-cost allocation
- Vendor performance
- Reorder recommendations
- Attachments and notes

# 8.7 Manufacturing, recipes, and production

- Bills of materials and recipes
- Versioned formulas
- Unit conversions
- Yield and waste
- Cost per batch and per sellable unit
- Production planning
- Production runs and job tickets
- Material reservation
- Work-in-progress inventory
- Quality-control checkpoints
- Completion and finished-goods receipt
- Batch labels
- Lot traceability where needed
- Capacity scheduling
- Industry-specific instructions

# 8.8 Customer service and CRM

- Shared inbox and ticketing
- Email integration
- Live-chat widget
- Customer profile and lifetime history
- Order and tracking context
- Rules and routing
- Spam filtering
- Service-level timers
- Canned replies
- Knowledge base
- Damage, leak, spill, shortage, missing-item, and delay workflows
- Photo requests
- Replacement or store-credit resolution
- Configurable credit incentives, including percentage increases where business policy allows
- Approval thresholds
- Escalations
- Customer sentiment and risk indicators
- Novi-drafted replies grounded in current order and policy data

# 8.9 Marketing and product-launch studio

“Magic” may be used as the customer-facing label for AI-assisted creation while Novi remains the named business companion.

Capabilities:

- Product-description generation
- SEO title and meta description
- Email campaigns
- SMS campaigns
- Facebook and Instagram posts
- TikTok scripts
- Pinterest copy
- Launch calendars
- Product-release checklists
- Store banners
- Affiliate graphics and copy
- Image and mockup workflow hooks
- Campaign approvals
- Brand voice profiles
- Attribution and performance reporting
- Suggested campaigns based on inventory and sales data
- Abandoned-cart and win-back opportunities

# 8.10 Wholesale and B2B

- Wholesale accounts
- Applications and approval
- Customer-specific price lists
- Case packs
- Minimum-order quantities
- Net terms
- Draft orders
- Quotes and invoices
- Payment links
- Purchase-order references
- B2B portal
- Wholesale-only products
- Sales-rep assignment
- Production/material calculation for wholesale orders
- Faire and other channel integration hooks
- Account notes and credit status

# 8.11 Affiliates, reps, and ambassadors

- Application and approval
- Affiliate links and QR codes
- Discount codes
- Tiered commission structures
- Store-credit or cash payout options
- Attribution rules
- Leaderboards
- Payout reports
- Fraud and self-referral controls
- Campaign assets
- Rep communications
- Performance goals
- Automatic milestone emails

# 8.12 Money and profitability

- Revenue
- Discounts
- Refunds
- Platform and payment fees
- Shipping revenue and shipping cost
- Product COGS
- Packaging COGS
- Labor allocation where configured
- Gross margin
- Contribution margin
- Product profitability
- Order profitability
- Channel profitability
- Payout reconciliation
- Cash-flow snapshots
- Sales-tax data and exports
- Accounting integration layer

Financial information must show data source, date range, and known limitations. Forecasts must be labeled as estimates.

# 8.13 Whatnot and live selling

- Show calendar
- Show themes
- Bundles and bundle versions
- Exact component quantities
- Pull sheets
- Pull totals
- Starting prices
- Estimated margin
- Reserved live inventory
- Inventory deduction/minus list
- Post-show reconciliation
- Shipping-combination support
- Mystery bundles
- Unreleased and vault inventory
- Live-show performance reporting

# 8.14 Team, SOPs, and approvals

- Roles and permissions
- Employee task views
- Daily checklists
- SOP library
- Training acknowledgment
- Approval queues
- Activity and audit logs
- Workload visibility
- Production and fulfillment performance
- Exception handling
- Internal announcements

Employee performance metrics must be contextual, transparent, role-appropriate, and not presented as simplistic surveillance scores.

---

# 8.15 ShimmerBox: Configurable Bundles, Build-a-Box, and Product Options

ShimmerStock must include a native e-commerce product configurator so merchants can sell customizable bundles, boxes, kits, and personalized products without paying for a separate Shopify options or bundle-builder app.

Working product name: **ShimmerBox**.

## Core merchant experience

A merchant can create a configurable product and define:

- Required and optional selection groups
- Checkboxes, radio buttons, dropdowns, swatches, image tiles, quantity selectors, text fields, file uploads, and personalization fields
- Minimum and maximum selections per group
- Rules such as “choose any 5,” “choose 2 scents and 1 mold,” or “select up to 10 colors”
- Conditional logic that shows later choices based on earlier selections
- Per-choice price adjustments
- Per-choice weight adjustments
- Per-choice inventory consumption
- Sold-out choice handling and substitutions
- Default selections and featured choices
- Choice images, descriptions, badges, and search/filtering
- Fixed-price boxes, dynamically priced boxes, subscriptions, preorders, wholesale case packs, and mystery-box configurations

Examples:

- Freshie starter box: choose 5 fragrance oils, 2 molds, 1 bag of beads, and a color
- T-shirt bundle: choose garment style, color, size, artwork, placement, personalization, and add-ons
- Bakery box: choose 6 flavors, dietary preferences, pickup date, message, and packaging upgrade
- Gift box: choose any 8 eligible products while enforcing category limits and stock availability

## Storefront experience

ShimmerBox should render as a fast, polished Shopify storefront component that matches the merchant's theme and works on mobile. It should include:

- Progress indicator and clear “Step 1 of 4” guidance
- Live price, discount, weight, and selection-count updates
- Product images or swatches for each choice
- Search and category filters for large option lists
- Clear validation before add-to-cart
- A cart summary showing every selected component
- Edit-your-box capability from the cart when technically safe
- Accessible keyboard navigation and screen-reader labels
- Merchant-controlled wording, styling, and brand colors

## Shopify implementation requirements

Do not create a Shopify variant for every possible combination. That causes combinatorial variant explosion and makes large customizable products difficult to maintain. Instead:

1. Store the configurator definition and rules in ShimmerStock.
2. Publish the storefront UI through a Shopify theme app extension or the best currently supported Shopify extension surface.
3. Add the configured product to cart using a stable parent merchandise item plus structured selection data.
4. Where inventory, fulfillment, discounts, or component-level order data require it, use the appropriate Shopify bundle/cart transformation capabilities and supported APIs rather than unsupported checkout hacks.
5. Preserve an immutable configuration snapshot on the order so later catalog edits do not change historical orders.
6. Expand each configured box into its component demand inside ShimmerStock for reservation, picking, packing, COGS, purchasing, and forecasting.
7. Provide human-readable selections on Shopify orders, packing slips, customer confirmations, and ShimmerStock work orders.
8. Design the integration with provider adapters so the same configurator engine can later support other commerce channels.

The implementation must account for Shopify's current product and bundle limits at build time. Limits can change, so they must be documented and isolated behind integration capability checks rather than hard-coded into ShimmerStock's core domain model.

## Inventory and fulfillment behavior

Each selectable component must map to a real product, variant, raw material, service, or non-stock option. ShimmerStock must:

- Calculate real-time buildable quantity from the scarcest required component
- Reserve selected components when the order is accepted
- Prevent overselling according to merchant policy
- Generate a component-level pick list while preserving the customer-facing box as one purchase
- Support component substitutions with approval and audit history
- Return component inventory correctly after cancellations, edits, or returns
- Calculate actual COGS and margin from the final selections
- Forecast component demand across all configured boxes that use the same item

## Merchant admin tools

The ShimmerBox builder must include:

- Drag-and-drop group and choice organization
- Bulk import of eligible products or variants
- Reusable option groups and templates
- Duplicate-a-box workflow
- Preview for desktop and mobile
- Rule-conflict detection before publishing
- Test-order mode
- Version history, draft/published states, and rollback
- Analytics for selections, abandonment, conversion, margin, and unavailable choices
- Novi recommendations such as high-converting choices, low-margin combinations, and components likely to sell out

## Data model additions

Add or adapt entities equivalent to:

- ConfigurableProduct
- ConfigurationVersion
- OptionGroup
- OptionChoice
- SelectionRule
- ConditionalRule
- ComponentMapping
- PriceAdjustment
- InventoryAdjustment
- CustomerConfiguration
- ConfigurationSnapshot
- ConfiguredOrderComponent

All records must be tenant-scoped, auditable, and safe for concurrent inventory updates.

## Acceptance criteria for the first production milestone

The first bounded ShimmerBox milestone should prove one complete GGE use case:

1. A merchant creates a “Build Your Own Freshie Starter Box.”
2. The customer must select exactly 5 oils, exactly 2 molds, and 1 bead option.
3. Sold-out components cannot be selected.
4. The live total updates correctly when premium choices are added.
5. The configured box is added to Shopify cart with readable selections.
6. The completed Shopify order imports into ShimmerStock with an immutable configuration snapshot.
7. ShimmerStock reserves and deducts every selected component.
8. Warehouse staff receive a component-level pick list.
9. Cancellation restores the correct component quantities.
10. Automated tests cover validation, pricing, tenant isolation, inventory reservation, webhook retries, cancellation, and order re-import idempotency.

This feature should ultimately be a headline differentiator:

> **Build customizable products and boxes without variant chaos or another monthly app.**

---

# 9. Flagship Differentiators

## 9.1 ShimmerScore

ShimmerScore is an explainable business-health score, not a mysterious gamification number.

Potential components:

- Inventory health
- Fulfillment health
- Product profitability
- Customer-service health
- Marketing health
- Cash-flow visibility
- Automation adoption
- Operational documentation
- Growth and retention

Requirements:

- Show component scores
- Explain what raised or lowered the score
- Identify missing data
- Offer specific actions
- Never present uncertain estimates as facts
- Allow businesses to hide score categories they do not use

Example:

> **ShimmerScore: 92/100**  
> Biggest improvement opportunity: abandoned-cart recovery.  
> Estimated impact is based on the last 60 days of store traffic and order data.

## 9.2 Time Saved

ShimmerStock should demonstrate value by estimating time saved through completed automations and assisted workflows.

Examples:

- Emails answered through approved automation
- Labels created in batch
- Inventory adjustments completed through scanning
- Reports generated automatically
- Purchase orders drafted
- Listings generated

Requirements:

- Show how the estimate was calculated
- Avoid false precision
- Let the organization configure average task time
- Separate estimated time from directly measured time

## 9.3 Founder Mode

Founder Mode helps the owner build a business that does not require constant personal intervention.

Potential insights:

- Approval queue growth
- Tasks repeatedly completed by the owner that could be delegated
- Excessive customer-service involvement
- Work performed outside configured business hours
- Automations that could remove repetitive work
- Teams successfully resolving issues without owner involvement

Founder Mode should be supportive, never shaming. Activity-derived workload estimates must be labeled as estimates.

## 9.4 Business Timeline and celebrations

Celebrate meaningful business milestones:

- First sale
- 100 orders
- First $10,000 month
- First wholesale order
- First employee
- Shipping-time improvement
- One-year business anniversary
- First million in lifetime sales

Celebrations should be tasteful, optional, and brand-consistent. Users may control celebration style and frequency.

## 9.5 Business Wrapped

Create periodic summaries such as weekly, monthly, quarterly, and annual Business Wrapped experiences.

Include:

- Revenue and order trends
- Best products
- New and repeat customers
- Fastest fulfillment
- Time saved
- Team wins
- Biggest growth moment
- Inventory lessons
- Novi’s recommended focus for the next period

---

# 10. Marketplace, Education, and Network Roadmap

These are strategic platform phases and must not delay the commerce core.

## 10.1 Shimmer University

- Industry-specific learning paths
- Pricing and profitability
- Inventory foundations
- Hiring and delegation
- Wholesale
- Live selling
- Marketing
- Photography and packaging
- SOP and training templates
- Completion badges
- Certified ShimmerStock Expert program

## 10.2 ShimmerStock Marketplace

- Industry workflow templates
- Automation templates
- Dashboard templates
- Label and document templates
- SOP packs
- Integrations and plugins
- Approved consultants
- Implementation partners

Marketplace architecture should include review, versioning, permissions, billing, security review, and compatibility controls before public launch.

## 10.3 Commerce Network

Long-term opt-in network opportunities:

- Suppliers
- Wholesalers
- Influencers and affiliates
- Designers
- Photographers
- Virtual assistants
- 3PL providers
- Certified consultants

Participation must be optional, privacy-preserving, and governed by clear data-sharing consent.

## 10.4 Shimmer Summit

Shimmer Summit is a future brand and community initiative, not an initial software milestone. Preserve it in the strategic roadmap without allocating core engineering capacity until product-market fit and community scale justify it.

---

# 11. Technical Architecture Requirements

## 11.1 Multi-tenant SaaS foundation

- Strict tenant isolation
- Organization-scoped queries and authorization
- Multi-business support within an account
- Role and location scoping
- Auditability
- Automated tenant-isolation tests
- Safe impersonation/support tooling with explicit logging, if implemented

## 11.2 Domain-oriented architecture

Maintain clear domains such as:

- Identity and organizations
- Catalog
- Orders
- Inventory
- Purchasing
- Production
- Fulfillment
- Customers and support
- Marketing
- Finance
- Affiliates
- Integrations
- AI/Novi
- Notifications
- Audit and observability

Avoid coupling every feature directly to a Shopify-specific model. Channels should connect through normalized ShimmerStock commerce entities while preserving channel-specific metadata.

## 11.3 Event model

Important business changes should produce durable, idempotent domain events where appropriate, such as:

- Order created or updated
- Inventory committed or released
- Item received
- Production completed
- Shipment created
- Ticket escalated
- Product price changed
- Purchase order approved
- Campaign published

Events support:

- Novi briefings
- Audit history
- Automations
- Integration synchronization
- Time-saved calculations
- Notifications
- Analytics

## 11.4 Integration reliability

All integrations should include:

- Secure credential handling
- Webhook signature verification
- Idempotency
- Retry policy
- Dead-letter or failure queue
- Sync status
- Last successful sync
- Reconciliation tools
- Human-readable error messages
- Tenant-scoped logs

## 11.5 AI architecture

Novi and Magic features should use a controlled action framework.

Required concepts:

- Tenant-scoped context retrieval
- Prompt and instruction versioning
- Tool/action registry
- Permission checks
- Human approval gates
- Preview before consequential actions
- Structured outputs
- Source references inside the product
- Confidence and limitation language
- Evaluation datasets
- Regression testing
- Cost and usage metering
- Safety and abuse controls
- Action audit trail

## 11.6 Security

- Secrets stored outside source control
- Secret scanning
- Protected branches
- Dependency review
- Authentication and session hardening
- Authorization tests
- Input validation
- Rate limiting
- Encryption in transit and at rest where applicable
- Backup and restore procedures
- Security event logging
- Least-privilege integrations
- Data export and deletion support

## 11.7 Reliability and observability

- Structured logging
- Error tracking
- Performance monitoring
- Uptime checks
- Queue and webhook monitoring
- Database health monitoring
- Alert routing
- Deployment markers
- Audit logs
- Backup verification
- Restore testing
- Service-level objectives appropriate to the current stage

## 11.8 Performance

Define and test performance budgets for:

- HQ initial load
- Order list and search
- Barcode scan response
- Inventory adjustment
- Product search
- Webhook processing
- Bulk import
- Report generation

Large stores must use pagination, background processing, progress indicators, and resumable imports.

---

# 12. Baseline Data Model

The implementation may use different names, but the product should support these conceptual entities:

- User
- Organization
- Business/Brand
- Location
- Warehouse
- Bin
- Role
- Permission
- Sales Channel
- Integration Connection
- Customer
- Customer Address
- Product
- Variant
- Inventory Item
- Inventory Balance
- Inventory Transaction
- Lot/Batch
- Bundle/Kit
- Vendor
- Vendor Item
- Purchase Order
- Receipt
- Recipe/BOM
- Recipe Version
- Production Run/Job
- Material Reservation
- Quality Check
- Order
- Order Line
- Fulfillment
- Shipment
- Return
- Refund
- Store Credit
- Support Ticket
- Conversation/Message
- Knowledge Article
- Campaign
- Content Asset
- Affiliate/Rep
- Attribution
- Commission
- Payout
- Cost Record
- Financial Snapshot
- Task
- Approval
- Automation
- Domain Event
- Notification
- Audit Event
- Novi Recommendation
- Novi Action
- Industry Pack
- Custom Field Definition
- Subscription Plan
- Usage Record

All monetary values require currency. Quantities require unit-of-measure awareness. Historical cost and formula data should be versioned rather than overwritten when business reporting depends on it.

---

# 13. Delivery Roadmap

The following phases define outcome groups. The current repository audit determines what is already complete and what should be skipped, repaired, or extended.

## Phase 0 — Audit, stabilization, and source of truth

**Goal:** Preserve existing work and establish a verified baseline.

Deliverables:

- Repository and branch audit
- Open PR audit, including preserved PR #4 work
- Current architecture map
- Current feature inventory
- Automated test status
- Full-suite isolation fixes
- CI green on the default branch
- Security and secret review
- Monitoring/logging recommendation and implementation plan
- Backup and restore verification
- Gap analysis against this blueprint
- Prioritized backlog
- Release definition

Do not proceed to broad feature expansion while the full suite is unstable or tenant isolation is uncertain.

## Phase 1 — Commerce Core 1.0

**Goal:** A product business can connect commerce data and run daily operations from ShimmerStock.

Deliverables:

- Organization and user setup
- Shopify connection
- Product and variant import
- Unified orders
- Inventory by location
- Basic bins and scanning
- Pick/pack/ship workflow
- Vendors and purchase orders
- Bundles and kits
- Core reports
- Role-based permissions
- Audit log
- HQ operational summary

Launch criteria:

- A pilot store can operate a normal day without data loss or manual duplicate entry for the supported flows.

## Phase 2 — Production and Industry DNA

**Goal:** ShimmerStock becomes meaningfully better for makers than generic inventory software.

Deliverables:

- Industry-pack framework
- Freshie pack
- Apparel pack
- Bakery pack
- Recipes/BOMs
- Production runs or job tickets
- Unit conversions
- Cost per batch and unit
- Work-in-progress
- Quality-control checkpoints
- Industry-specific onboarding and dashboard language

Launch criteria:

- At least one real pilot business in each initial industry completes an end-to-end production workflow.

## Phase 3 — Novi Command Center and Business Intelligence

**Goal:** ShimmerStock tells users what matters and what to do next.

Deliverables:

- Morning Brief
- What Happened
- What Needs Attention
- What to Do Next
- Opportunity Center
- Low-stock forecast
- Reorder suggestions
- Explainable recommendation cards
- Approval-controlled Novi actions
- Recommendation history
- Evaluation and regression tests

Launch criteria:

- Recommendations are grounded in tenant data, explainable, permission-aware, and measured for accuracy.

## Phase 4 — Customer Service and Marketing Magic

**Goal:** Replace more disconnected apps and connect customer communication to commerce data.

Deliverables:

- Shared support inbox
- Rules and routing
- Knowledge base
- Damage and shortage workflows
- Replacement/store-credit actions
- Novi reply drafts
- Brand voice
- Product-launch studio
- Social, email, and SMS content drafts
- Campaign calendar
- Approval and publishing workflow
- Attribution basics

## Phase 5 — Profit, ShimmerScore, Time Saved, and Founder Mode

**Goal:** Make business health understandable and prove ShimmerStock’s value.

Deliverables:

- Product/order/channel profitability
- Financial data-source labels
- ShimmerScore and component explanations
- Time Saved methodology and dashboard
- Founder Mode insights
- Business Timeline
- Milestone celebrations
- Business Wrapped
- CEO Mode across businesses

## Phase 6 — Wholesale, affiliates, and live commerce depth

**Goal:** Support the channels and growth systems common to product businesses.

Deliverables:

- B2B portal
- Price lists, MOQs, case packs, terms
- Quotes, invoices, and payment links
- Affiliate application, attribution, commissions, and payouts
- Whatnot planning and reconciliation
- Reserved live inventory
- Multi-channel margin comparison

## Phase 7 — Ecosystem

**Goal:** Build a platform and community around ShimmerStock.

Deliverables:

- Shimmer University
- Template marketplace
- Consultant/certification framework
- Public integration framework
- Commerce Network pilots

This phase begins only after the core product is reliable and pilot retention supports expansion.

---

# 14. Pilot Strategy

Use real businesses as design partners, beginning with ShimmerStock’s founding use cases.

Recommended pilot sequence:

1. **GGE** — complex inventory, fragrance materials, production, bundles, wholesale, affiliates, customer service, Shopify, and Whatnot
2. **Apparel/T-shirt pilot** — blank matrix, personalization, production queue
3. **Bakery pilot** — recipes, ingredients, scheduling, shelf life, pickup/custom orders

For every pilot:

- Document current workflow
- Measure time, errors, and tool count before implementation
- Define one end-to-end success scenario
- Observe actual use
- Record blockers and workarounds
- Re-test after correction
- Measure time saved and error reduction

Do not rely only on owner interviews. Observe real workflow execution.

---

# 15. Pricing and Plan Architecture

ShimmerStock should preserve an accessible entry point while protecting sustainability, especially for AI, messaging, storage, and high-volume integrations.

Current directional target:

- Entry plan around the low-cost small-business range, approximately $10 where viable
- Main small-business plan around approximately $50 where viable
- Higher tiers for multi-location, advanced automation, larger order volume, advanced AI, wholesale, and team permissions

Engineering requirements:

- Feature flags by plan
- Usage metering
- AI usage budgets
- Order/contact/storage thresholds
- Add-on architecture
- Trial support
- Graceful upgrade prompts
- No destructive downgrade behavior

Final pricing requires cost modeling and pilot feedback. Do not hard-code business-critical limits without configuration.

---

# 16. Definition of Done

A task or milestone is not complete because an agent reports that it is complete.

Every completed engineering task must include the applicable evidence below:

1. Code committed to the correct branch
2. Commit hash
3. Pull request created or updated
4. Exact tests run
5. Full relevant test suite run together, not merely isolated files
6. Test results captured
7. CI status verified green
8. Lint and type checks complete
9. Database migration tested forward and backward where applicable
10. Tenant-isolation and permission tests where applicable
11. Screenshots or short recording for user-facing work
12. Accessibility check for changed interface
13. Documentation updated
14. Monitoring added for critical workflows
15. Rollback or remediation plan for risky changes
16. No secrets or credentials committed
17. Independent review of acceptance criteria

For feature work, also require:

- Empty state
- Loading state
- Error state
- Permission-denied state
- Mobile/responsive behavior
- Audit event where appropriate
- Analytics/event tracking where appropriate
- User-facing wording consistent with ShimmerStock and the active Business DNA pack

---

# 17. CTO.new Execution Protocol

The purpose of this protocol is to prevent duplicated work, wasted credits, unverified completions, and repeated failed delegations.

## 17.1 Before coding

The lead must:

1. Inspect the current repository, branches, commits, PRs, CI, and documentation.
2. Identify what is complete, partial, broken, missing, or obsolete.
3. Reuse and preserve verified work.
4. Create or update a written current-state audit.
5. Select one bounded milestone or task.
6. Define acceptance criteria before delegation.

## 17.2 Delegation rules

- Use one focused engineer session per bounded task.
- Avoid broad “build everything” delegations.
- Do not send duplicate delegations while a serialized write slot is occupied.
- Do not repeatedly retry an identical failed delegation.
- After a failed or empty engineer result, inspect the saved state before retrying.
- After repeated failure, stop and report the exact execution blocker.
- Preserve existing branches and commits.
- Do not reset or discard work without explicit justification and a backup reference.

## 17.3 Reporting rules

Every update should distinguish:

- **Verified complete**
- **Implemented but not verified**
- **In progress**
- **Blocked**
- **Not started**

A final report must include:

- Scope completed
- Files changed
- Commit hash
- PR number/status
- Test commands
- Test results
- CI result
- Screenshots/evidence
- Known limitations
- Next recommended task

## 17.4 Credit discipline

- Read existing docs before starting discovery again.
- Save every research result and architecture decision to the repository.
- Keep prompts bounded.
- Complete verification before opening another broad workstream.
- Prefer small PRs that can be reviewed and recovered.
- Do not spend credits rewriting an already-approved blueprint.

---

# 18. Required Repository Documents

Create or maintain the following as source-of-truth documents:

- `docs/SHIMMERSTOCK_MASTER_BLUEPRINT.md`
- `docs/CURRENT_STATE_AUDIT.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/INDUSTRY_PACKS.md`
- `docs/NOVI_SPEC.md`
- `docs/UX_INFORMATION_ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/SECURITY.md`
- `docs/OBSERVABILITY.md`
- `docs/TEST_STRATEGY.md`
- `docs/DEFINITION_OF_DONE.md`
- `docs/DECISIONS/` for architecture decision records

Documents must state the date, status, owner, and last verified commit where appropriate.

---

# 19. First Directive to CTO.new

Use the following as the first instruction after credits reset:

> You are continuing the existing ShimmerStock product in repository `glitterqueen22/ShimmerStock`. ShimmerStock is the commerce operating system for product-based small businesses, with Novi as its proactive AI business companion. The attached Master Product Blueprint is the approved product direction.
>
> Do not rebuild completed work and do not begin a broad feature implementation yet. First inspect the current repository, branches, commits, open pull requests, CI status, migrations, tests, and existing documentation. Preserve all verified work, including the existing Part 2A/PR #4 workstream.
>
> Create or update `docs/CURRENT_STATE_AUDIT.md` with a precise matrix showing each blueprint capability as: verified complete, implemented but unverified, partial, not started, blocked, or intentionally deferred. Cite the files, routes, migrations, tests, and commits that support each conclusion.
>
> Then create or update `docs/ROADMAP.md` with the smallest safe sequence of milestones needed to reach a reliable Commerce Core 1.0. Prioritize in this order: full-suite test stability and CI, tenant isolation and security, observability and backup/restore, core Shopify/order/product/inventory workflows, then role-based HQ. Do not duplicate completed modules.
>
> Before changing production code, return the audit, the proposed milestone sequence, dependencies, risks, and the exact first bounded engineering task. The first task must have explicit acceptance criteria and a Definition of Done. Do not mark anything complete without direct verification.

---

# 20. Milestone Prompt Template

Use this template for every subsequent CTO.new engineering request:

> Continue ShimmerStock from the verified repository state. Work only on **[MILESTONE/TASK NAME]**.
>
> **Objective:** [single measurable outcome]
>
> **Current verified state:** [branch, commit, PR, and relevant existing implementation]
>
> **In scope:**
> - [item]
> - [item]
>
> **Out of scope:**
> - [item]
> - [item]
>
> **Acceptance criteria:**
> 1. [observable behavior]
> 2. [observable behavior]
> 3. [test/security/permission requirement]
>
> **Required verification:**
> - Run [specific tests]
> - Run the full relevant suite together
> - Run lint/type checks
> - Verify CI is green
> - Provide screenshots for user-facing changes
> - Confirm tenant isolation and permissions where applicable
>
> **Required final report:**
> - Files changed
> - Commit hash
> - PR number and status
> - Exact test commands and results
> - CI result
> - Screenshots/evidence
> - Known limitations
> - Recommended next task
>
> Preserve existing work. Do not broaden the scope. Do not mark the task complete based solely on an engineer summary.

---

# 21. Immediate Recommended Sequence

Based on the latest known workstream, the next sequence should be:

1. Finish Automated Tests Part 2A by resolving shared-state/test-isolation failures and proving the full suite passes together.
2. Verify PR #4, merge only with green CI, and preserve evidence.
3. Complete and save the Monitoring & Logging recommendation.
4. Implement minimum launch observability for errors, uptime, critical queues/webhooks, structured logs, and backup verification.
5. Perform the full current-state audit against this blueprint.
6. Choose the smallest missing Commerce Core 1.0 workflow.
7. Build one end-to-end pilot flow for GGE.
8. Validate with real use before expanding to the next vertical pack.

---

# 22. North Star

ShimmerStock succeeds when it becomes the first place a product-business owner opens in the morning, the place employees use throughout the day, and the place the owner trusts to explain what happened, what needs attention, and what to do next.

The North Star is not the number of features.

It is this outcome:

> **Running a product business feels joyful and controlled instead of chaotic and overwhelming.**


---
---

# PART II — Universal E-Commerce Layer (approved v4 layer), preserved in full

*Source: `ShimmerStock_Universal_Ecommerce_Addendum.md`, Version 1.0, August 1, 2026. Owner-approved as the v4 layer of this blueprint on 2026-08-01. Reproduced verbatim below this line. Its §1 constraint governs: these capabilities join the approved roadmap and audit but do not interrupt active stabilization, testing, security, or the bounded Commerce Core milestone.*

---
# ShimmerStock
## Universal E-Commerce Experience Addendum

**Version:** 1.0  
**Date:** August 1, 2026  
**Applies to:** ShimmerStock Master Product Blueprint  
**Purpose:** Preserve the cross-industry capabilities that make ShimmerStock easy enough for a first-time maker and powerful enough for a growing multi-channel product business.

---

# 1. Product Decision

ShimmerStock should not become a giant screen containing every possible e-commerce feature. It should become a calm, adaptive operating system that reveals the right capability at the right time.

The universal product principle is:

> **Simple on day one. Powerful when the business is ready.**

Every capability in this addendum must support:

- Progressive disclosure instead of overwhelming menus
- Business DNA and role-based language
- Clear preview before consequential actions
- Undo, version history, or a safe recovery path where technically possible
- Human-readable errors and recovery instructions
- Permission-aware actions
- Mobile and accessibility support
- Audit history
- Reliable channel synchronization
- Honest boundaries when Shopify or another channel must remain the system of record for a specific function

These capabilities should be added to the approved product roadmap and current-state audit. They must **not interrupt the active stabilization, testing, security, or Commerce Core milestone** unless the lead determines that a foundational data-model decision must be made now to avoid rework.

---

# 2. ShimmerFlow: No-Code Commerce Automation

ShimmerFlow is the cross-platform automation engine for ShimmerStock.

A merchant should be able to build an automation through either:

1. A visual trigger-condition-action builder
2. A plain-language request to Novi that is converted into a reviewable workflow
3. An approved industry or marketplace template

## Required workflow concepts

- Trigger
- Conditions
- Branches
- Actions
- Delays and schedules
- Approval steps
- Human tasks
- Retry behavior
- Failure path
- Version history
- Run history
- Test mode
- Dry-run simulation
- Enable, pause, duplicate, archive, and rollback

## Example automations

- When available inventory falls below the safety threshold, draft a purchase order and request manager approval.
- When a high-value order arrives, place it in review, notify the owner, and prevent fulfillment until approved.
- When a product is published, create the launch checklist, prepare marketing drafts, and notify affiliates.
- When a preorder date changes, identify affected customers and prepare an approval-controlled update.
- When a return is approved, create the return instructions, reserve exchange inventory, and route the item to the correct disposition after receipt.
- When a customer reaches a lifetime-spend milestone, add the VIP status and create a surprise-and-delight task.
- When a production batch fails quality control, quarantine the affected inventory and identify linked orders.

## Safety requirements

- Novi must show the exact trigger, conditions, and actions before activating a workflow.
- High-impact actions require approval based on organization policy.
- Every run must show what happened, what was skipped, what failed, and how to retry.
- Workflow loops, duplicate sends, and duplicate financial actions must be prevented.
- Workflows must be tenant-scoped, permission-aware, idempotent where required, and covered by regression tests.

---

# 3. Shimmer Command: Universal Search and Action Bar

A merchant should never need to remember which module contains an item.

A persistent command/search bar should find:

- Order number
- Customer name, email, or phone
- Product, variant, SKU, UPC, or barcode
- Tracking number
- Shipment
- Return or exchange
- Support ticket
- Purchase order
- Vendor
- Production batch or job
- Affiliate or discount code
- Campaign
- Task, approval, or automation

It should also support permission-aware quick actions such as:

- Create product
- Duplicate listing
- Receive purchase order
- Start inventory count
- Open scan mode
- Hold an order
- Edit shipping address
- Issue store credit
- Draft a campaign
- Ask Novi a data question

## Usability requirements

- Keyboard shortcut on desktop
- Scan-to-open on mobile
- Recent items
- Favorites and pinned actions
- Saved searches and views
- Typo tolerance
- Plain-language queries such as “show unshipped orders older than two days”
- No exposure of restricted records or actions through search

---

# 4. Shimmer Account: Branded Customer Self-Service Portal

ShimmerStock should give merchants a branded customer-account layer that reduces support tickets while keeping policies under merchant control.

Customers should be able to access eligible features such as:

- View order history and status
- Track shipments
- Reorder
- Request cancellation before the merchant-defined lock point
- Request an address correction before fulfillment locks
- Start a return or exchange
- Report a missing, damaged, leaked, or incorrect item
- Upload supporting photos
- View and use store credit
- View gift-card information where supported
- Manage subscriptions
- Join or view a waitlist
- Request a back-in-stock alert
- Review and approve a custom-product proof
- View pickup or delivery instructions
- Pay an approved balance or invoice
- Read merchant-specific policies

## Merchant controls

- Eligibility rules
- Return windows
- Final-sale exclusions
- Fees
- Returnless-resolution thresholds
- Automatic versus manual approval
- Exchange inventory rules
- Cancellation deadline
- Address-edit deadline
- Required evidence
- Customer-facing status and communication templates

Every customer request must appear in the order timeline and Customer Hub so the customer and team never receive conflicting information.

---

# 5. Order Care and Exception Center

Orders should not become scattered problems hidden across multiple screens.

Create one prioritized Exception Center for:

- Payment authorization or capture issue
- Fraud or risk review
- Invalid or uncertain address
- Inventory shortage
- Split-location fulfillment
- Backorder or preorder delay
- Missing personalization
- Customer proof awaiting approval
- Order edit requested
- Shipping method conflict
- Missed fulfillment SLA
- Delivery exception
- Return, exchange, or claim
- Chargeback deadline
- Integration or sync failure

## Order Care capabilities

- Add or remove eligible items
- Change quantities
- Update allowed customer or shipping information
- Apply or remove discounts where supported
- Adjust shipping charges
- Collect an additional balance or issue a partial refund
- Hold and release
- Split fulfillment
- Route fulfillment to a supported location
- Consolidate shipments for eligible orders while preserving each original order and payment record
- Add internal notes, tasks, and @mentions
- Lock conflicting edits and show who is working on the order
- Display a complete customer, payment, inventory, fulfillment, and communication timeline

ShimmerStock must never pretend two paid orders became one legal transaction. Shipment consolidation should preserve the underlying order records and maintain correct accounting, tax, refund, and customer history.

---

# 6. Inventory Allocation, Drops, Preorders, and Waitlists

ShimmerStock needs one inventory truth with controlled availability by channel.

## Inventory allocation

A merchant should be able to reserve or allocate inventory for:

- Shopify online store
- Whatnot or another live sale
- Wholesale
- Retail or pop-up event
- Preorders
- Subscription renewals
- VIP or early-access launch
- Replacement inventory
- Safety stock

The platform should show:

- Physical on hand
- Available to promise
- Committed
- Allocated by channel
- Reserved for production
- Reserved for exchanges or replacements
- Incoming
- Quarantined or damaged
- Unavailable due to expiration or quality hold

## Drop and preorder controls

- Launch date and time
- Early-access group
- Quantity cap
- Per-customer limit
- Expected ship date
- Production-capacity limit
- Component-capacity limit for bundles and ShimmerBoxes
- Waitlist
- Back-in-stock notification
- Automatic close condition
- Oversell policy
- Customer update rules
- Post-launch reconciliation

This module should prevent a Whatnot show, wholesale order, or preorder launch from silently consuming inventory promised elsewhere.

---

# 7. Custom Order and Proofing Studio

Custom and personalized sellers need a workflow between “customer asked” and “ready to produce.”

Support:

- Inquiry or custom-order form
- Quote
- Deposit
- Balance due
- Due date
- Pickup, delivery, or ship date
- Customer file upload
- Personalization fields
- Internal design file
- Proof versions
- Comments and requested changes
- Customer approval
- Change-order fee
- Final production lock
- Job ticket
- Production status
- Quality approval
- Final invoice or balance collection

This should work for:

- T-shirts and apparel
- Tumblers
- Laser engraving
- Bakery and decorated-cookie orders
- Gift boxes
- Jewelry
- Personalized freshies
- Custom wholesale work

Production must not begin until required approvals and deposits are satisfied according to the merchant’s policy.

---

# 8. Shipping Intelligence

ShimmerStock should make shipping understandable and protect margin.

Capabilities should include, through native functions or integrations as appropriate:

- Address validation and correction workflow
- Package presets
- Package recommendation based on items, dimensions, and weight
- Carrier and service comparison
- Shipping-label creation
- Batch labels
- Packing slips and branded documents
- Combined-shipping opportunity detection
- Split-shipment decisions
- Shipping rules by product, location, market, or customer type
- Local pickup and local delivery support
- International paperwork support
- Insurance and claim tracking
- Branded tracking page or portal status
- Delivery-exception alerts
- Carrier performance reporting
- Shipping revenue versus actual shipping cost
- Identification of products and destinations that consistently lose money on shipping

Do not require ShimmerStock to become its own carrier or label broker at launch. Use a provider-adapter layer so the best label and rate source can change without rewriting fulfillment.

---

# 9. Promotions, Discounts, and Launch Room

Merchants should be able to plan a sale without juggling the product editor, discount screen, email app, social scheduler, affiliate portal, and team chat.

## Promotion engine

Support supported-channel promotions such as:

- Percentage or fixed discount
- Product, collection, order, or shipping discount
- Buy X, get Y
- Quantity breaks
- Tiered spend rewards
- Free gift
- Free shipping threshold
- VIP or segment-only offer
- Market-specific offer
- Channel-specific offer
- Scheduled start and end
- Combination and stacking rules
- Usage limits
- Affiliate or rep attribution

Before activation, show:

- Eligible products and customers
- Conflicting promotions
- Estimated margin effect
- Products that fall below the configured profit floor
- Inventory risk
- Start and end time in the organization’s time zone

## Launch Room

One launch workspace should contain:

- Products
- Collections
- ShimmerBoxes
- Inventory allocation
- Production readiness
- Pricing and promotion
- Storefront placement
- Email and SMS
- Social content
- Affiliate or rep assets
- Staff tasks and approvals
- Countdown
- Publish sequence
- Live health and post-launch results

---

# 10. Subscription and Replenishment Hub

Preserve a native subscription architecture for products that are naturally replenished or sold as recurring boxes.

Support:

- Subscribe-and-save
- Prepaid subscriptions
- Recurring ShimmerBoxes
- Delivery frequency
- Billing frequency
- Product swap
- Skip, pause, resume, or cancel
- Customer payment-method update through supported channel flows
- Renewal inventory reservation
- Upcoming-renewal forecast
- Failed-payment recovery
- Renewal notifications
- Subscription discounts
- Churn and retention reporting
- Subscription profitability
- Merchant rules for out-of-stock substitutions

Subscription contracts and selling plans must be represented separately from ShimmerStock’s own SaaS billing plan.

---

# 11. Storefront Studio

Product Studio handles the catalog. Storefront Studio should eventually handle routine merchandising so a merchant needs Shopify admin even less often.

Initial supported scope should be intentionally bounded:

- Announcement bars
- Featured collections and products
- ShimmerStock app blocks
- ShimmerBox blocks
- Basic landing and launch blocks
- Navigation menus
- Collection ordering and merchandising rules
- Store pages and reusable content where supported
- Search synonyms and redirects where supported
- Customer-account blocks and actions
- Desktop and mobile preview
- Schedule, publish, unpublish, and rollback

Do not promise a universal replacement for every Shopify theme editor. Theme capabilities vary. ShimmerStock should show exactly which content it controls for the connected theme and offer safe extension-based blocks instead of fragile direct code edits whenever possible.

---

# 12. Migration and Data Health Center

The hardest part of adopting business software is often cleaning and trusting the imported data.

ShimmerStock should provide:

- Guided connection and import
- CSV and spreadsheet mapping
- Import from supported apps or systems
- Dry run before commit
- Duplicate detection
- Missing SKU, barcode, weight, cost, image, and location report
- Invalid variant or option report
- Inventory mismatch report
- Customer duplicate review
- Safe field mapping
- Resumable background imports
- Progress and error report
- Reconciliation totals
- Rollback or correction plan
- “Clean my catalog” recommendations from Novi
- App-replacement checklist showing what can be safely turned off and what still needs migration

A merchant should know exactly what imported, what did not, and what needs attention.

---

# 13. Commerce Calendar and Collaboration

Create one shared calendar for:

- Product launches
- Sales
- Email and SMS campaigns
- Social posts
- Purchase-order arrivals
- Production runs
- Preorder deadlines
- Subscription renewals
- Wholesale due dates
- Pickup and delivery windows
- Inventory counts
- Staff schedules or assigned operational tasks where enabled

Every important ShimmerStock object should support the appropriate combination of:

- Comment
- @mention
- Task
- Owner
- Due date
- Attachment
- Approval
- Activity history

This keeps the discussion attached to the product, order, ticket, campaign, or purchase order instead of buried in outside messages.

---

# 14. Risk, Chargebacks, and Commerce Protection

ShimmerStock should centralize provider risk information and operational safeguards without pretending to be a payment network.

Capabilities:

- Import available order-risk indicators
- Configurable hold and review rules
- Risk-review queue
- Customer and address history
- Blocklist and allowlist with strict permissions
- Evidence checklist
- Chargeback deadline and status
- Evidence-packet assembly from order, tracking, policy, communication, and proof data
- Fraud-loss and chargeback reporting
- Approval before fulfillment or payment capture where the connected provider supports it

All risk decisions must be explainable and reviewable. Novi may summarize evidence but must not make unsupported accusations about a customer.

---

# 15. Markets, Localization, and Privacy Readiness

Launch may remain United States-first, but the foundation should not assume that every future store uses one currency, language, tax presentation, time zone, or unit system.

Preserve support for:

- Organization and market time zones
- Multiple currencies
- Market-specific prices and catalogs
- Language and translation fields
- Units of measure
- Tax-inclusive and tax-exclusive presentation
- Duties and international-shipping information
- Regional product restrictions
- Market-specific promotions
- Consent and marketing preferences
- Data-export and deletion workflows
- Privacy-aware analytics and tracking integrations

Legal and tax calculations should rely on appropriate providers and merchant configuration. ShimmerStock should surface status and data clearly without representing itself as legal or tax counsel.

---

# 16. Mobile, Offline, and Notification Experience

The operational mobile experience must be designed, not treated as a compressed desktop screen.

## Mobile priorities

- Scan and search
- Pick and pack
- Receive a purchase order
- Inventory count
- Production checklist
- Product photo capture
- Damage-photo capture
- Order exception review
- Approval actions
- Push notifications

## Offline behavior

Where practical, permit temporary offline capture for scanning, counts, checklists, and photos with:

- Visible offline state
- Local queue
- Safe resynchronization
- Duplicate prevention
- Conflict handling
- No offline execution of sensitive financial actions

## Notification center

- One in-app inbox
- Email, SMS, or push preferences
- Role-based routing
- Severity
- Quiet hours
- Immediate versus digest delivery
- Snooze
- Escalation
- Clear link to the affected record

---

# 17. Human-First UX and Visual Guardrails

ShimmerStock must not look like a generic AI-generated SaaS template.

## Visual guardrails

Avoid:

- Random gradients on every screen
- Excessive sparkles, floating blobs, and decorative icons
- Repetitive oversized cards with little information
- Fake charts or simulated data presented as functional
- Generic stock illustrations
- Emoji used in place of a coherent icon system
- Robotic headings such as “Unlock the power of…”
- Long marketing copy inside operational screens
- Inconsistent spacing, corner radius, shadows, and typography

Require:

- A documented design system
- Consistent type scale, spacing, iconography, states, and motion
- Real merchant and product imagery where appropriate
- Calm, editorial hierarchy
- Dense views only when the task requires them
- A compact mode for experienced teams
- A guided mode for newer owners
- Customizable saved views without complete layout chaos
- Autosave and visible save/sync state
- Undo or version recovery where possible
- Contextual help
- Novi “Explain this” assistance
- Keyboard navigation and accessible labels
- Reduced-motion support
- User testing with freshie, apparel, bakery, and general retail merchants

Novi should appear when she has something useful to explain, recommend, prepare, or celebrate. She should not cover the screen, interrupt ordinary work, or make every sentence sound like AI.

---

# 18. Priority Sequence

## Architecture now; implementation only when scheduled

These concepts must be accounted for in the domain model and API boundaries early:

1. ShimmerFlow workflow definitions and runs
2. Universal search and saved views
3. Order edits, holds, exceptions, and customer requests
4. Inventory allocations and reservations by channel
5. Custom-order proofs, approvals, deposits, and balances
6. Commerce selling plans and subscription contracts
7. Markets, currencies, and translations
8. Import jobs, mappings, and data-quality issues
9. Platform-wide comments, tasks, approvals, notifications, and audit history

## First expansion after a stable Commerce Core

1. Shimmer Command
2. Exception Center
3. Inventory allocation and preorder/drop controls
4. Migration and Data Health Center
5. Customer self-service for order status, claims, and eligible returns
6. Custom Order and Proofing Studio
7. Shipping intelligence basics
8. ShimmerFlow templates for the highest-frequency workflows

## Growth phases

1. Promotions and Launch Room
2. Subscriptions
3. Deeper Storefront Studio
4. Risk and chargeback tooling
5. International markets and localization depth
6. Native loyalty, referrals, reviews, wishlists, and other retention modules only after the core product is reliable; integrations may be used first

---

# 19. Universal Definition of Done

A universal commerce feature is not complete until:

- It is connected to real tenant data rather than simulated placeholders.
- The primary workflow can be completed by a nontechnical merchant.
- The workflow has empty, loading, error, permission-denied, partial-failure, and recovery states.
- Consequential actions show a preview and require the correct permission or approval.
- Relevant changes appear in the record timeline and audit log.
- Sync status is clear when a channel is involved.
- Duplicate messages, orders, refunds, credits, inventory deductions, or workflow actions are prevented.
- Mobile behavior is verified.
- Accessibility is verified.
- User-facing copy has been reviewed for plain language and brand consistency.
- At least one real pilot merchant completes the end-to-end workflow.
- Tests include tenant isolation, permissions, idempotency, retries, concurrent edits, and provider failure where applicable.

---

# 20. North Star

The final experience should let a merchant say:

> **I run my products, orders, inventory, customers, production, launches, and team from ShimmerStock. Shopify powers my checkout, but I rarely need to open its admin.**

ShimmerStock wins by making complicated commerce feel clear—not by displaying the largest possible number of features at once.

---
---

# PART III — Reconciliation: how Part I and the v4 layer fit together

*New editorial material for this canonical edition, written 2026-08-01. This is the only part of the document that interprets rather than reproduces. Interpretations flagged here are working readings for the team, not new owner decisions, unless the owner ratifies them.*

## C1. What the v4 layer changes — and what it does not

**Changes:**

1. **Scope.** Seventeen named universal commerce capabilities (Part II §§2–16) plus ShimmerBox (Part I §8.15, carried into v4 scope by the owner) and Product Studio (Part II §11) are now approved product direction, not ideas.
2. **Sequencing authority.** Part II §18 ("Priority Sequence") is the authoritative order for all universal-capability work: architecture-now items first as *data-model/API-boundary decisions only*, then the "first expansion after a stable Commerce Core" list, then growth phases.
3. **Definition of Done.** Part II §19 ("Universal Definition of Done") now applies alongside Part I §16. Both must be satisfied for any universal commerce feature; where they overlap, the stricter requirement wins (e.g., Part II §19 adds "at least one real pilot merchant completes the end-to-end workflow").

**Does not change:**

1. **Mission, positioning, brand, Novi** (Part I §§1–6) — untouched.
2. **Business DNA / industry packs** (Part I §7) — untouched; Part II §1 reinforces that universal capabilities must speak Business DNA language.
3. **The active stabilization program.** Part II §1 is explicit: nothing in the v4 layer interrupts stabilization, automated tests, CI, security, monitoring, backup, or the bounded Commerce Core milestone. The current state of that program is in `docs/CURRENT_STATE_AUDIT.md`; its sequence is in `docs/ROADMAP.md`.
4. **Pricing direction** (Part I §15). Part II §10's "Subscription and Replenishment Hub" is about *merchants' commerce* subscription contracts and is explicitly separate from ShimmerStock's own SaaS billing plan.

## C2. Known overlaps between Part I and Part II, and how to read them

| Overlap | Part I says | Part II says | Agreed reading |
|---|---|---|---|
| **ShimmerBox** | §8.15 full product spec: entities, storefront behavior, inventory behavior, acceptance criteria for a first GGE milestone | §6 component-capacity limits; §9 Launch Room includes ShimmerBoxes; §10 recurring ShimmerBoxes; §11 ShimmerBox storefront blocks | One ShimmerBox program. §8.15 is the spec; Part II adds the surfaces it must plug into (allocation, launches, subscriptions, storefront blocks). Build nothing twice. |
| **Product Studio** | §8.3 products/catalog module; §8.9 marketing & launch studio ("Magic") | §11: "Product Studio handles the catalog; Storefront Studio handles routine merchandising" | Product Studio is the v4 name for the catalog-side product surface (§8.3 plus the existing Studio engine's product-content generation). Storefront Studio is a separate, intentionally bounded new capability (Part II §11). Do not conflate them in the audit. |
| **Returns, exchanges, store credit** | §8.4 orders/fulfillment; §8.8 customer service workflows | §4 customer self-service (customer-initiated returns/claims); §5 Order Care (team-initiated edits/holds) | Self-service and Order Care are new front doors onto one returns/credit backend. No parallel returns engine may be built for the portal. |
| **Inventory states vs. allocation** | §8.5: available/committed/incoming/damaged/quarantined/in-production | §6: allocation by channel (Shopify, Whatnot, wholesale, preorder, subscription, VIP, replacement, safety stock) | One inventory truth. Part II §6 adds a channel/purpose dimension to the same ledger; it must not become a second inventory count. |
| **Events and automation** | §11.3: durable, idempotent domain events "where appropriate" | §2 ShimmerFlow: trigger-condition-action workflows with run history, idempotency, duplicate prevention | ShimmerFlow consumes the domain-event model. The durability/idempotency bar in §11.3 becomes mandatory before ShimmerFlow activation, not optional — recorded as a foundational decision in `docs/ROADMAP.md`. |
| **Approvals** | §6.4 Novi approval gates; §8.14 team approvals | §2 workflow approval steps; §4 merchant-controlled auto-vs-manual approval; §14 risk approval before capture | One approvals primitive (the existing tenant-scoped `approvals` table pattern) reused by Novi, ShimmerFlow, Order Care, and risk review. |
| **Navigation** | §4.3: 14 top-level areas (HQ, Sell, Orders, Products, Inventory, Make, Customers, Market, Wholesale, Money, Team, Reports, Novi, Settings) | Adds Exception Center, Launch Room, portal admin, etc. | New v4 surfaces slot into existing areas — Exception Center under Orders, Launch Room under Market, allocation under Inventory, portal settings under Settings — rather than creating new top-level silos. (Editorial reading; confirm with design before build.) |

## C3. Standing constraints carried into every milestone

1. **Evidence standard.** Nothing is "complete" without its level: Designed / Built / Connected to real data / Validated end-to-end / Production-ready (founder's five-level scale; Part I §16; Part II §19). Decorative UI, simulated data, and nonfunctional buttons never count as complete.
2. **Stabilization first.** As of 2026-08-01 the repository has an active regression on `main` (PR #7 rate limiter; 44 pass / 5 fail on a fresh full-suite run; revert commit `25830c1` pushed on `revert/rate-limiter-regression`, PR blocked by invalid `GH_TOKEN`). No v4 capability work may start until `docs/ROADMAP.md` Milestone 0 is independently verified green. Details and citations: `docs/CURRENT_STATE_AUDIT.md` §1.
3. **Architecture now, implementation later.** Part II §18's nine "architecture now" items are preserved as *decisions* in `docs/ROADMAP.md` ("Foundational data-model and API-boundary decisions") — they constrain table and API shape today without authorizing feature build-out.
4. **Tenant isolation is non-negotiable.** Every v4 entity (workflow definitions, allocations, proofs, portal requests, promotions, subscriptions, imports) must be `business_id`-scoped from the first migration, matching the pattern enforced by `tests/tenant-isolation.test.ts`.

## C4. Where the truth lives (document map)

| Question | Authoritative document |
|---|---|
| What are we building and why? | This document (Parts I–III) |
| What is actually true in the repo today? | `docs/CURRENT_STATE_AUDIT.md` |
| In what order do we build, and what is next? | `docs/ROADMAP.md` |
| Architecture as implemented | `ARCHITECTURE.md` |
| Database schema as implemented | `DATABASE.md` |
| Test strategy and current suite | `TESTING.md` |
| Backup/restore procedure | `BACKUP.md` |

Part I §18 lists additional required repository documents (`PRODUCT_REQUIREMENTS.md`, `DATA_MODEL.md`, `INDUSTRY_PACKS.md`, `NOVI_SPEC.md`, `UX_INFORMATION_ARCHITECTURE.md`, `SECURITY.md`, `OBSERVABILITY.md`, `TEST_STRATEGY.md`, `DEFINITION_OF_DONE.md`, `docs/DECISIONS/`). As of 2026-08-01 those are **not yet created** — tracked in `docs/CURRENT_STATE_AUDIT.md` rather than silently absent.

## Document control

- **Assembled:** 2026-08-01, technical-writer delegated session (documentation-only; no production code, tests, migrations, branches, or PRs touched).
- **Sources:** `ShimmerStock_CTO_Master_Blueprint_v2.md` (v1.0, 2026-07-31) and `ShimmerStock_Universal_Ecommerce_Addendum.md` (v1.0, 2026-08-01), both reproduced verbatim in Parts I and II.
- **Supersedes:** the two source files as the citable repository location; the source files remain in the team shared workspace unchanged for provenance.
- **Next update trigger:** any owner-approved blueprint revision, or when a Part II capability changes classification in `docs/CURRENT_STATE_AUDIT.md`.
