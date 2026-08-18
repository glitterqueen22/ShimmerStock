# ShimmerStock Brand Assets

The approved identity board is stored at
[`shimmerstock-approved-brand-board.png`](./shimmerstock-approved-brand-board.png).
It is the visual source of truth for this implementation and must remain brand
documentation, not a production website image.

## Identity Hierarchy

- **Primary logo:** the navy `S`, partial pink-to-lilac orbit, primary pink
  four-point sparkle, subtle purple sparkle, and ShimmerStock wordmark.
- **Favicon and app icon:** the simplified `S`/orbit/sparkle mark on deep navy.
  It contains no wordmark and is optically simplified for small sizes.
- **Novi signature:** `public/brand/novi-sparkle.svg`. This exact four-point
  sparkle represents Novi's intelligence and should not be redrawn per feature.
- **Secondary device:** `public/brand/shimmerstock-layers-symbol.svg`. The
  layered sparkle represents stock, operational layers, production, and
  connected workflows. It supports the system and never replaces the primary
  logo.

## Production Files

The files in `public/brand/` are clean SVG implementation assets. They do not
embed the raster board and do not require glow, shadow, or a background effect
to remain recognizable.

The approved board is a raster presentation rather than editable source art.
The current SVGs are a careful digital reconstruction for website use, built
from native paths plus legally available system type. They are not the final
outlined vector masters. Replace them only with owner-approved source SVG, AI,
EPS, or PDF artwork that preserves the same geometry and lockups.

## Core Palette

| Role | Value | Use |
| --- | --- | --- |
| Navy | `#0F172A` | Primary mark, structure, serious text |
| Purple | `#786CFF` | Orbit endpoint, connected operations |
| Lilac | `#B38CFF` | Stock wordmark treatment, secondary accent |
| Pink | `#FF86C1` | Monica's spark, primary brand personality |
| Peach | `#FFD2A8` | Selective warmth |
| Sage | `#C7E0D5` | Forward motion and calm support |
| Cream | `#FFF7F2` | Breathing room and warm light surfaces |
| Soft grey | `#E9EAF1` | Quiet dividers and neutral support |

Use repository design tokens rather than repeating these values in components.
Pink remains the foreground personality; purple supports it, and navy provides
the structural base.

## Light And Dark Use

- Use `shimmerstock-logo-horizontal.svg` on cream, white, and other light
  surfaces.
- Use `shimmerstock-logo-horizontal-dark.svg` on navy or similarly dark solid
  surfaces.
- Use `shimmerstock-mark.svg` when the wordmark does not fit and an accessible
  text label is available.
- Use `shimmerstock-mark-dark.svg` when the mark sits directly on a dark
  surface. Do not add a white box behind it.
- Do not depend on glow, shadow, shimmer, or animation for contrast.

## Minimum Size And Clear Space

- Horizontal logo: minimum `132px` CSS width for screen use.
- Stacked logo: minimum `88px` CSS width.
- Standalone mark: minimum `32px`; use the favicon artwork below `32px`.
- Favicon: use the supplied `favicon.svg` or rendered `32x32` PNG. Do not place
  the full wordmark in a browser tab.
- Keep clear space on every side equal to at least one quarter of the mark's
  diameter. For a horizontal lockup, measure that space from the orbit edge and
  the final letter.

## Incorrect Usage

Do not stretch, skew, rotate, outline, recolor individual parts, rearrange the
orbit and sparkles, add extra sparkles, add glow as a requirement, place the
mark on low-contrast imagery, or use the layered symbol as the primary logo.
Do not crop the board for website use or place the board itself into an SVG.
Do not substitute an emoji for the Novi sparkle.

## Clean Identity And Expressive Brand World

The clean logo identifies ShimmerStock. It should remain stable, legible, and
quiet in headers, footers, browser icons, login, metadata, and application
navigation. The expressive marketing world may use approved photography, Novi
artwork, motion, color fields, and occasional shimmer to tell a richer story.
Those treatments support the logo; they are not alternate logo versions.
