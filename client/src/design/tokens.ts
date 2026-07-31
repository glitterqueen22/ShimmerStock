// ── ShimmerStock Design Tokens ──────────────────────────────────
// Single source of truth for all visual design.
// Components reference these tokens; one change here propagates everywhere.

// ── Colors (reference values — actual rendering uses Tailwind classes) ─
export const COLORS = {
  primary: {
    50: '#fff1f2',
    100: '#ffe4e6',
    200: '#fecdd3',
    300: '#fda4af',
    400: '#fb7185',
    500: '#f43f5e',
    600: '#e11d48',
  },
  rose: {
    50: '#fff1f2',
    100: '#ffe4e6',
    200: '#fecdd3',
    300: '#fda4af',
    400: '#fb7185',
    500: '#f43f5e',
    600: '#e11d48',
  },
  gold: {
    400: '#fbbf24',
    500: '#f59e0b',
  },
  success: {
    bg: '#ecfdf5',
    text: '#065f46',
    border: '#a7f3d0',
  },
  warning: {
    bg: '#fffbeb',
    text: '#92400e',
    border: '#fde68a',
  },
  danger: {
    bg: '#fef2f2',
    text: '#991b1b',
    border: '#fecaca',
  },
  info: {
    bg: '#eff6ff',
    text: '#1e40af',
    border: '#bfdbfe',
  },
  neutral: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    500: '#737373',
    700: '#404040',
    900: '#171717',
  },
} as const;

// ── Typography ───────────────────────────────────────────────────
export const TYPOGRAPHY = {
  pageTitle: 'text-2xl font-bold',
  sectionTitle: 'text-lg font-semibold',
  cardTitle: 'text-base font-semibold',
  body: 'text-sm',
  caption: 'text-xs text-neutral-500',
} as const;

// ── Spacing ──────────────────────────────────────────────────────
export const SPACING = {
  page: 'space-y-6',
  section: 'space-y-4',
  card: 'p-5',
  cardSm: 'p-4',
  grid: 'gap-4',
  stack: 'gap-3',
} as const;

// ── Border Radius ────────────────────────────────────────────────
export const RADIUS = {
  card: 'rounded-2xl',
  button: 'rounded-lg',
  pill: 'rounded-full',
  input: 'rounded-lg',
  modal: 'rounded-2xl',
} as const;

// ── Shadows ──────────────────────────────────────────────────────
export const SHADOWS = {
  card: 'shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
  modal: 'shadow-xl',
} as const;
