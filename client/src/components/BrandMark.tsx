interface BrandMarkProps {
  variant?: "light" | "dark" | "oneColor";
  layout?: "horizontal" | "stacked" | "mark";
  showTagline?: boolean;
  compact?: boolean;
  inverse?: boolean;
  className?: string;
}

export default function BrandMark({
  variant = "light",
  layout = "horizontal",
  showTagline = false,
  compact = false,
  inverse = false,
  className = "",
}: BrandMarkProps) {
  const resolvedVariant = inverse ? "dark" : variant;
  const resolvedLayout = compact ? "mark" : layout;
  const source = resolvedLayout === "mark"
    ? (resolvedVariant === "dark" ? "/brand/shimmerstock-mark-dark.svg" : "/brand/shimmerstock-mark.svg")
    : resolvedLayout === "stacked"
      ? "/brand/shimmerstock-logo-stacked.svg"
      : (resolvedVariant === "dark" ? "/brand/shimmerstock-logo-horizontal-dark.svg" : "/brand/shimmerstock-logo-horizontal.svg");

  return (
    <span className={`inline-flex min-w-0 items-center ${showTagline ? "gap-3" : ""} ${className}`} role="img" aria-label="ShimmerStock">
      <img
        src={source}
        alt=""
        width={resolvedLayout === "mark" ? 44 : resolvedLayout === "stacked" ? 210 : 235}
        height={resolvedLayout === "mark" ? 44 : resolvedLayout === "stacked" ? 155 : 50}
        className={`${resolvedLayout === "mark" ? "h-10 w-10" : resolvedLayout === "stacked" ? "h-auto w-[210px]" : "h-auto w-[190px]"} shrink-0 object-contain ${resolvedVariant === "oneColor" ? "grayscale" : ""}`}
        decoding="async"
      />
      {showTagline && <span className={`max-w-40 text-xs leading-snug ${resolvedVariant === "dark" ? "text-white/75" : "text-slate-600"}`}>The operating system for product businesses</span>}
    </span>
  );
}