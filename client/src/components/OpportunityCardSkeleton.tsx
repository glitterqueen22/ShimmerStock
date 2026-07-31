// ── OpportunityCardSkeleton ─────────────────────────────────────────
// Loading placeholder matching the OpportunityCard shape.
// Uses animate-pulse on bg-neutral-100 for all bars.

export default function OpportunityCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5 overflow-hidden">
      {/* Badge row */}
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-20 bg-neutral-100 rounded-full animate-pulse" />
        <div className="h-5 w-16 bg-neutral-100 rounded-full animate-pulse" />
        <div className="h-5 w-24 bg-neutral-100 rounded-full animate-pulse" />
      </div>

      {/* Icon + Title */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 bg-neutral-100 rounded-lg animate-pulse flex-shrink-0" />
        <div className="flex-1">
          <div className="h-5 w-3/4 bg-neutral-100 rounded animate-pulse mb-2" />
          <div className="h-4 w-full bg-neutral-100 rounded animate-pulse mb-1" />
          <div className="h-4 w-2/3 bg-neutral-100 rounded animate-pulse" />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 flex-1 bg-neutral-100 rounded-lg animate-pulse" />
        <div className="h-8 flex-1 bg-neutral-100 rounded-lg animate-pulse" />
      </div>

      {/* Footer icons */}
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 bg-neutral-100 rounded animate-pulse" />
        <div className="flex items-center gap-1">
          <div className="w-6 h-6 bg-neutral-100 rounded-lg animate-pulse" />
          <div className="w-6 h-6 bg-neutral-100 rounded-lg animate-pulse" />
          <div className="w-6 h-6 bg-neutral-100 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}
