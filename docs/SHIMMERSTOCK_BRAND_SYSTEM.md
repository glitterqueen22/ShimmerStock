# ShimmerStock Brand System

> Source of truth for all visual, layout, and component conventions.

---

## Color Origin

| Color | Represents | Meaning |
|-------|-----------|---------|
| Purple | Dad | Calm, steady, reassuring, patient, supportive, grounding |
| Green  | Mom | Drive, growth, determination, humor, strength, resilience |
| Novi   | Both | The best of both parents — and Monica's own ambition |

---

## Color Tokens

See `public/assets/marketing/tokens.css` for the single source of truth.

```
--plum-deep:    #2d1b4e   Deep plum — premium dark moments
--violet:       #5b3f8c   Primary brand violet
--violet-2:     #8066d8   Interactive violet
--violet-soft:  #dcd4f5   Lavender — light accent
--violet-mist:  #f0ecfd   Very light lavender — backgrounds

--green:        #4f8a68   Primary brand green
--green-mid:    #6aad86   Medium green
--green-soft:   #ddefe4   Sage — light accent
--sage-soft:    #a9cbb5   Sage — mid tone
--mint-soft:    #ddf0e4   Mint — highlights

--bg:           #fff9f2   Warm white — page background
--cream:        #fffaf2   Warm cream
--cream-warm:   #fff7ee   Warmer cream variant
--blush-soft:   #f4dce5   Selective blush — accent
--gold:         #d2a46f   Warm gold — accent

--ink:          #1f1b29   Deep plum ink — primary text
--ink-soft:     #524c5d   Medium — secondary text
--muted:        #756d80   Quiet — labels, tertiary

--line:         #e4d8ea   Light border
--line-strong:  #cbb8dd   Medium border
```

---

## Typography

**Headings:** "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif
**Body:** "Avenir Next", "Avenir", "Segoe UI", "Helvetica Neue", Arial, sans-serif

| Scale | Size |
|-------|------|
| H1 | `clamp(2rem, 5vw, 3.45rem)` |
| H2 | `clamp(1.7rem, 3.9vw, 2.7rem)` |
| H3 | `clamp(1.17rem, 2.5vw, 1.55rem)` |
| Lead | `clamp(1.05rem, 2.1vw, 1.22rem)` |
| Body | `1.03rem` |
| Small | `0.84rem` |
| Eyebrow | `0.74rem` |

---

## Layout System

```
--content-max:     1240px   Standard marketing content
--content-wide:    1360px   Wide product canvas moments
--content-reading:  820px   Long-form text
--content-full:    1440px   Full-bleed sections

--page-gutter: clamp(18px, 4vw, 64px)
```

### Container Classes

| Class | Width | Use |
|-------|-------|-----|
| `.container` | `--content-max` | Standard content |
| `.container-wide` | `--content-wide` | Product canvases, showcase layouts |
| `.container-reading` | `--content-reading` | Legal, long-form text, founder letter |
| `.container-full` | `--content-full` | Full-bleed visual moments |

### Section Classes

| Class | Description |
|-------|-------------|
| `.section` | Standard section padding |
| `.section-tight` | 72% of standard (used between closely related sections) |
| `.section-hero` | Reduced top padding for hero sections |

### Section Background Classes

| Class | Use |
|-------|-----|
| `.band` | Subtle lavender/sage gradient band — for alternating content |
| `.section-lavender` | Light purple tint |
| `.section-mint` | Light green/mint tint |
| `.section-sage` | Sage tint |
| `.section-blush` | Blush tint |
| `.section-wash` | Very subtle warm wash |
| `.hero-founders` | About/founder hero gradient |
| `.hero-novi` | Novi flagship hero gradient |

---

## CSS Module Structure

```
public/assets/marketing.css          Entry point — imports all modules + existing base
public/assets/marketing/
  tokens.css                          CSS custom properties — single source of truth
  phase2.css                          Phase 2 components: Novi demo, day timeline, catalogs, etc.
```

Future planned expansion:
- `base.css` — reset, typography, global
- `layout.css` — containers, sections
- `components.css` — buttons, cards, badges, forms, nav
- `homepage.css` — command shell, product tour, industry switcher
- `pages.css` — product/solution page patterns
- `responsive.css` — consolidated media queries

---

## Status Badge System

**Product maturity (do not mix with operational status):**

| Class | Label | Use |
|-------|-------|-----|
| `.status-live` | Live | Fully functional |
| `.status-beta` | Beta | Working, needs more real-world pressure |
| `.status-early` | Early Access | Available to Early Access members |
| `.status-planned` | Planned | On roadmap, not yet built |
| `.status-demo` | Demo | Illustrative only, no live backend |

**Operational status (keep separate from product maturity):**

Ready · In progress · Attention · Low stock · Draft · Shipped

---

## Key Components

All components are in `marketing.css` and `marketing/phase2.css`.

| Component | Class | File |
|-----------|-------|------|
| Novi morning brief demo | `.novi-flagship-demo` | phase2.css |
| Novi priority buttons | `.novi-priority-btn` | phase2.css |
| Voice examples | `.voice-example` | phase2.css |
| Founder letter | `.founder-letter` | phase2.css |
| Origin cards (purple/green) | `.origin-card.purple/.green` | phase2.css |
| Day timeline | `.day-timeline` | phase2.css |
| Engine cards | `.engine-card` | phase2.css |
| Catalog preview | `.catalog-preview` | phase2.css |
| Formula card (freshies) | `.formula-card` | phase2.css |
| Integration cards | `.integration-card` | phase2.css |
| Permission flow | `.permission-flow` | phase2.css |
| Can/Cannot lists | `.can-list/.cannot-list` | phase2.css |
| Staging notice | `.staging-notice` | phase2.css |
| Novi greeting | `.novi-greeting` | phase2.css |

---

## Motion and Accessibility

- All transitions use `--transition-standard: 160ms ease` or `--transition-fast: 120ms ease`
- All animations respect `prefers-reduced-motion: reduce`
- `.novi-dot` pulse animation is disabled under reduced motion
- Focus visible uses `2px solid var(--violet)` outline
