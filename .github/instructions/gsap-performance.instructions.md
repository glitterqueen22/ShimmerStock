---
applyTo: ["public/assets/homepage-story.js", "public/assets/marketing/homepage-story.css"]
---

# GSAP Performance Guidance (adapted from greensock/gsap-skills)

- Animate transform and opacity/autoAlpha first; avoid `top/left/width/height` animation for motion.
- Limit simultaneous tweens and use stagger or timeline sequencing to avoid jank.
- Use `will-change` only for actively animated elements, not globally.
- Respect reduced-motion and avoid perpetual loops without purpose.
- Keep scroll updates on GSAP/ScrollTrigger instead of raw `window.scroll` listeners.
