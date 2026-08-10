---
applyTo: ["public/assets/homepage-story.js", "public/assets/marketing/homepage-story.css"]
---

# GSAP Core Guidance (adapted from greensock/gsap-skills)

- Use `gsap.to`, `gsap.from`, `gsap.fromTo`, and `gsap.set` with explicit duration/ease defaults.
- Prefer transform properties (`x`, `y`, `scale`, `rotation`) and `autoAlpha` over layout properties and raw `opacity`.
- Use `gsap.matchMedia()` for responsive motion and `prefers-reduced-motion` parity.
- Avoid overlapping `from`/`fromTo` on same target/property unless `immediateRender: false` is set on later tweens.
- Use `clearProps` when animation cleanup must return control to stylesheet defaults.
