---
applyTo: ["public/assets/homepage-story.js", "public/index.html"]
---

# GSAP ScrollTrigger Guidance (adapted from greensock/gsap-skills)

- Register once with `gsap.registerPlugin(ScrollTrigger)`.
- Use `scrub` for scroll-linked progress and `toggleActions` for discrete triggers; do not combine both on one trigger.
- Create ScrollTriggers in top-to-bottom document order or set `refreshPriority` to preserve refresh order.
- When pinning, animate children inside pinned wrappers instead of animating pinned element itself.
- Use `start`/`end` values that map to clear story beats and call `ScrollTrigger.refresh()` only after layout-affecting changes.
- Kill/revert triggers on teardown to prevent stale animations in SPA contexts.
