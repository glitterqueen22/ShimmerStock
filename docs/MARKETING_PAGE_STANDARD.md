# ShimmerStock Marketing Page Standard

> Every ShimmerStock marketing page must meet this standard.
> This document defines what makes a page pass and what makes it fail.

---

## The 10/10 Quality Gate

Before any flagship page is marked complete, it must pass all of these:

| Question | Pass condition |
|----------|---------------|
| Could this page belong to 500 other SaaS websites? | No — it feels unmistakably ShimmerStock |
| Does it show the real product? | Yes — with accurate status labels |
| Can the intended customer understand its value in 10 seconds? | Yes |
| Does Novi add meaningful intelligence? | Yes — not a bolt-on section |
| Is the page outcome-led rather than feature-led? | Yes |
| Is every claim truthful? | Yes — no fake counts, no simulated functionality |
| Does desktop look premium? | Yes |
| Does mobile look intentional? | Yes |
| Does the CTA have a real destination? | Yes |
| Does it feel like a person who runs a product business built this? | Yes |

---

## Required Page Sections

Every flagship product/solutions page must answer:

1. **What problem does this solve?** — Outcome-led hero
2. **Who is it for?** — Specific, not generic
3. **What does the workflow look like?** — Realistic product canvas
4. **What information does it use?** — Data / inventory / orders / etc.
5. **What other ShimmerStock areas does it connect to?** — Cross-module connections
6. **Where does Novi help?** — At least one genuine Novi moment
7. **What exceptions can occur?** — Honest about edge cases
8. **What can the user do next?** — Clear CTA
9. **What is Live / Beta / Early Access / Demo / Planned?** — Status transparency

---

## Page Structure Anti-Patterns

**Never build:**
```
[Eyebrow]
[Headline]
[One paragraph]
[Four generic cards]
[CTA]
```
This is a placeholder, not a page.

**Always build:**
- Outcome-led hero with real product visual
- Specific workflow showing the actual experience
- At least one Novi intelligence moment
- Honest status labeling
- Industry-specific language for solution pages
- Real CTA with correct destination

---

## Hero Requirements

Every hero must include:
- Eyebrow (uppercase, pill)
- H1 that leads with outcome, not feature name
- Lead paragraph max 65 characters per line
- Status chip(s) showing current availability
- Primary CTA (`/early-access`)
- Secondary CTA (relevant product page or demo)
- A real product visual (workspace, canvas, interactive demo, or structured data)

**Avoid:**
- Hero images that could be any SaaS product
- Copy that says "powerful" or "seamless" without specifics
- Status badges that contradict each other

---

## Product Visuals

Every flagship page must include a realistic workspace visual. Options:

| Visual type | Good for |
|-------------|---------|
| `.catalog-preview` | Craft suppliers, inventory-heavy pages |
| `.novi-flagship-demo` | Novi page |
| `.formula-card` | Freshies page |
| `.engine-card` grid | Product page |
| `.day-timeline` | Product page, Product overview |
| `.ui-frame` | Simpler pages, About page |
| `.callout` cards | Alerting / operational state |

Visuals must:
- Use realistic data (not Lorem ipsum or "Sample Product")
- Include correct status badges
- Include "Illustrative workspace" label where appropriate

---

## Novi Moments

Every flagship page should include at least one Novi voice example.

Use `.novi-voice-bubble` with:
```html
<div class="novi-voice-bubble">
  <span class="novi-voice-label">Novi says</span>
  <p>[Industry-specific, specific-not-generic Novi message]</p>
</div>
```

Novi voice rules: see `docs/NOVI_CHARACTER_AND_VOICE.md`.

---

## Status Labeling

**Product maturity badges (`.status` classes):**

| Badge | Use |
|-------|-----|
| `status-live` | Fully operational |
| `status-beta` | Works, still testing |
| `status-early` | Available in Early Access |
| `status-planned` | Roadmap only |
| `status-demo` | Illustrative workspace only |

**Never:**
- Mix demo and live labels on the same feature
- Label something Live that has no backend
- Use "Coming Soon" without a status badge
- Imply Shopify writes exist

---

## Truthfulness Requirements

**Never claim:**
- Fake testimonials or customer quotes
- Real customer counts, order volumes, or revenue figures
- Shopify write-back capability (not yet built)
- Automatic fulfillment (not yet built)
- Automatic customer emails (not yet built)
- Any integration is live unless it actually is
- GGE has fully migrated to ShimmerStock

**Always say:**
- "ShimmerStock is being built and validated against real craft-supply and e-commerce operations."
- "Shopify connection status: Early Access / Read-only Beta"
- "Draft for Early Access — subject to legal review" on legal pages
- "Illustrative workspace" on demo UIs

---

## Mobile Standards

All marketing pages must:
- Use 18–20px gutters at 375–430px
- Avoid horizontal overflow
- Keep product visuals readable on mobile
- Use full-width CTAs at `max-width: 480px`
- Keep touch targets ≥ 44px height

---

## Accessibility Standards

- One `<h1>` per page
- Logical heading hierarchy (H1 → H2 → H3)
- All images and decorative elements have `aria-hidden="true"` or meaningful `alt`
- All interactive controls have accessible names
- Keyboard navigation works for all interactive demos
- Focus-visible ring: `2px solid var(--violet)`
- `prefers-reduced-motion` respected
- Form labels are visible and connected to inputs
