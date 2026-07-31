import React from 'react';

// ── Skeleton Props ───────────────────────────────────────────────
export interface SkeletonProps {
  /** Shape variant */
  variant?: 'card' | 'table-row' | 'text' | 'block';
  /** For text variant: number of lines to show */
  lines?: number;
  /** Additional CSS classes for sizing */
  className?: string;
}

// ── Skeleton Component ───────────────────────────────────────────
export function Skeleton({ variant = 'text', lines = 3, className = '' }: SkeletonProps) {
  const base = 'animate-pulse bg-neutral-100 rounded';

  // ── Card skeleton — matches SPACING.card + RADIUS.card ─────────
  if (variant === 'card') {
    return (
      <div className={`p-5 rounded-2xl bg-white border border-neutral-100 ${className}`}>
        <div className={`h-5 w-2/3 ${base} mb-3`} />
        <div className={`h-4 w-full ${base} mb-2`} />
        <div className={`h-4 w-4/5 ${base} mb-4`} />
        <div className={`h-8 w-1/3 ${base}`} />
      </div>
    );
  }

  // ── Table row skeleton — mimics a data row ─────────────────────
  if (variant === 'table-row') {
    return (
      <div className={`flex items-center gap-4 py-3 px-4 border-b border-neutral-100 ${className}`}>
        <div className={`h-4 w-1/4 ${base}`} />
        <div className={`h-4 w-1/6 ${base}`} />
        <div className={`h-4 w-1/6 ${base}`} />
        <div className={`h-4 w-1/6 ${base}`} />
        <div className={`h-4 w-1/12 ml-auto ${base}`} />
      </div>
    );
  }

  // ── Text skeleton — several lines of varying width ─────────────
  if (variant === 'text') {
    const widths = ['w-full', 'w-4/5', 'w-2/3', 'w-5/6', 'w-3/4'];
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className={`h-4 ${widths[i % widths.length]} ${base}`} />
        ))}
      </div>
    );
  }

  // ── Block skeleton — arbitrary sized rectangle ─────────────────
  return <div className={`${base} ${className || 'h-20 w-full'}`} />;
}

export default Skeleton;
