---
applyTo: ["public/assets/homepage-story.js"]
---

# GSAP Timeline Guidance (adapted from greensock/gsap-skills)

- Use `gsap.timeline()` for multi-step sequences; do not chain manual delays.
- Use timeline `defaults` for shared duration/ease consistency.
- Use the position parameter (`"<"`, `">"`, `"+=..."`, labels) for choreography.
- Add labels for narrative moments (e.g., `desk`, `go-time`, `exception`, `cozy`).
- Keep ScrollTrigger at timeline level or top-level tween; do not place ScrollTrigger on child tweens.
