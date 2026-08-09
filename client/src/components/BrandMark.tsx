interface BrandMarkProps {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
}

export default function BrandMark({ compact = false, inverse = false, className = "" }: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="ShimmerStock">
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden="true">
        <path d="M8 4h18l6 6v19l-7 7H8l-4-4V8z" fill={inverse ? "#fff" : "#f43f72"} />
        <path d="M8 4h18l6 6-7 3H12L4 8z" fill={inverse ? "#ffd8e3" : "#ffb4c7"} />
        <path d="M28 9l4 1v19l-7 7v-23z" fill={inverse ? "#7c3aed" : "#6d28d9"} opacity=".82" />
        <path d="M13 15.5c1.2-2.3 4-3.6 7.4-3.2 2.4.2 4.3 1 5.7 2.2l-2.8 3c-1.1-.8-2.4-1.3-3.7-1.4-1.5-.2-2.5.2-2.7.9-.2.8.8 1.2 3.2 1.8 4.2 1 6.1 2.8 5.5 6-.7 3.5-4.3 5.4-8.7 4.8-2.9-.3-5.3-1.4-7-3.1l2.9-3.1c1.5 1.2 3 1.9 4.9 2.1 1.8.2 3-.2 3.2-1 .2-.9-.8-1.3-3.4-2-4.1-1-5.9-2.9-5.3-6z" fill="#fff" />
        <circle cx="30.5" cy="5.5" r="2" fill="#a7dc9b" />
      </svg>
      {!compact && (
        <span className={`font-[family-name:var(--font-heading)] text-xl font-bold leading-none ${inverse ? "text-white" : "text-rose-600"}`}>
          ShimmerStock
        </span>
      )}
    </span>
  );
}