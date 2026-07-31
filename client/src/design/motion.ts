// ── ShimmerStock Motion System ─────────────────────────────────────
// Animation constants referenced by components.
// The actual @keyframes definitions live in index.css.

export const MOTION = {
  // Tailwind-based animation classes (defined via @theme in index.css)
  fadeIn: 'animate-fadeIn',
  slideUp: 'animate-slideUp',
  slideRight: 'animate-slideRight',
  scaleIn: 'animate-scaleIn',

  // Consistent hover transitions
  hover: 'transition-all duration-200',

  // Page transitions (for future page-level animations)
  pageEnter: 'animate-fadeIn animate-slideUp',
} as const;
