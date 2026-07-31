import { useState, useEffect, useCallback } from "react";
import { apiGet } from "../lib/api";
import { PageHeader, Skeleton, ErrorBanner, EmptyState, Badge } from "../components/ui";

// ── Types ─────────────────────────────────────────────────────────────

interface TimelineEntry {
  timestamp: string;
  time: string;
  department: string;
  icon: string;
  title: string;
  detail: string;
  event_type: string;
  source_table: string;
  source_id: number;
  links_to: number | null;
}

interface TimelineResponse {
  date: string;
  events: TimelineEntry[];
  total: number;
  departments_active: number;
  departments: string[];
  loop_completion_pct: number;
}

// ── Department config ─────────────────────────────────────────────────

interface DeptConfig {
  icon: string;
  label: string;
  color: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
}

const DEPT_CONFIG: Record<string, DeptConfig> = {
  commerce:      { icon: "🛒", label: "Commerce",      color: "#059669", bgClass: "bg-emerald-50", borderClass: "border-emerald-300", textClass: "text-emerald-700" },
  production:    { icon: "🏭", label: "Production",    color: "#d97706", bgClass: "bg-amber-50", borderClass: "border-amber-300", textClass: "text-amber-700" },
  warehouse:     { icon: "🏗️", label: "Warehouse",     color: "#2563eb", bgClass: "bg-blue-50", borderClass: "border-blue-300", textClass: "text-blue-700" },
  shipping:      { icon: "🚚", label: "Shipping",      color: "#4f46e5", bgClass: "bg-indigo-50", borderClass: "border-indigo-300", textClass: "text-indigo-700" },
  customer_service: { icon: "💬", label: "Customer Svc", color: "#db2777", bgClass: "bg-pink-50", borderClass: "border-pink-300", textClass: "text-pink-700" },
  marketing:     { icon: "📢", label: "Marketing",     color: "#7c3aed", bgClass: "bg-purple-50", borderClass: "border-purple-300", textClass: "text-purple-700" },
  purchasing:    { icon: "📦", label: "Purchasing",    color: "#0d9488", bgClass: "bg-teal-50", borderClass: "border-teal-300", textClass: "text-teal-700" },
  novi:          { icon: "✨", label: "Novi",           color: "#c026d3", bgClass: "bg-fuchsia-50", borderClass: "border-fuchsia-300", textClass: "text-fuchsia-700" },
  system:        { icon: "🔧", label: "System",        color: "#6b7280", bgClass: "bg-gray-50", borderClass: "border-gray-300", textClass: "text-gray-700" },
};

// ── Operating Loop nodes ──────────────────────────────────────────────

const LOOP_NODES = [
  { key: "commerce", icon: "🛒", label: "Commerce" },
  { key: "production", icon: "🏭", label: "Production" },
  { key: "warehouse", icon: "🏗️", label: "Warehouse" },
  { key: "shipping", icon: "🚚", label: "Shipping" },
  { key: "customer_service", icon: "💬", label: "Customer Svc" },
  { key: "marketing", icon: "📢", label: "Marketing" },
  { key: "novi", icon: "✨", label: "Novi" },
];

// ── Page component ────────────────────────────────────────────────────

export default function Timeline() {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [highlightedIdx, setHighlightedIdx] = useState<number | null>(null);

  const fetchTimeline = useCallback(async (selectedDate: string) => {
    setLoading(true);
    setError(null);
    setHighlightedIdx(null);
    try {
      const result = await apiGet<TimelineResponse>(`/api/timeline?date=${selectedDate}`);
      setData(result);
      // Default all departments active
      setActiveFilters(new Set(result.departments));
    } catch (err: any) {
      setError(err.message || "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTimeline(date);
  }, [date, fetchTimeline]);

  // ── Toggle department filter ──────────────────────────────────────
  function toggleFilter(dept: string) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(dept)) {
        next.delete(dept);
      } else {
        next.add(dept);
      }
      return next;
    });
  }

  // ── Filtered events ───────────────────────────────────────────────
  const filteredEvents = data?.events.filter(e => activeFilters.has(e.department)) || [];
  const activeDeptKeys = data?.departments || [];

  // ── Check if a loop handoff is "active" (both depts have events) ──
  function isConnectionActive(fromKey: string, toKey: string): boolean {
    if (!data) return false;
    return data.departments.includes(fromKey) && data.departments.includes(toKey);
  }

  // ── Loading state ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="📋 Timeline" subtitle="Daily Business Replay™" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="card" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="📋 Timeline" subtitle="Daily Business Replay™" />
        <ErrorBanner message={error} onRetry={() => fetchTimeline(date)} />
      </div>
    );
  }

  const isEmpty = !data || data.total === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <PageHeader title="📋 Timeline" subtitle="Daily Business Replay™" />
        
        {/* Date picker */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-rose-400">Date:</label>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="touch-target text-sm border border-rose-200 rounded-xl px-3 py-2 bg-rose-50/50
                       focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none
                       transition-all duration-300 text-neutral-900"
          />
        </div>
      </div>

      {/* ── Summary header ────────────────────────────────────────── */}
      {!isEmpty && data && (
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <div>
              <span className="text-2xl font-bold text-neutral-900">{data.total}</span>
              <span className="text-sm text-rose-400 ml-1">events</span>
            </div>
          </div>
          <div className="w-px h-8 bg-rose-100 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-lg">🏢</span>
            <div>
              <span className="text-lg font-bold text-neutral-900">{data.departments_active}</span>
              <span className="text-sm text-rose-400 ml-1">departments active</span>
            </div>
          </div>
          <div className="w-px h-8 bg-rose-100 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-lg">🔗</span>
            <div>
              <span className="text-lg font-bold text-neutral-900">{data.loop_completion_pct}%</span>
              <span className="text-sm text-rose-400 ml-1">loop completion</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Operating Loop Visualization ──────────────────────────── */}
      {!isEmpty && data && (
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-neutral-700 mb-4 flex items-center gap-2">
            <span>🔄</span> Operating Loop™
          </h3>
          <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
            {LOOP_NODES.map((node, idx) => {
              const isActive = data.departments.includes(node.key);
              const nextNode = LOOP_NODES[idx + 1];
              const connActive = nextNode ? isConnectionActive(node.key, nextNode.key) : false;
              return (
                <div key={node.key} className="flex items-center">
                  <div
                    className={`flex flex-col items-center px-2 sm:px-3 py-2 rounded-xl transition-all duration-300 ${
                      isActive
                        ? "bg-rose-100 shadow-sm ring-2 ring-rose-300"
                        : "bg-gray-100 opacity-40"
                    }`}
                    title={`${node.label}${isActive ? " — active" : " — no events"}`}
                  >
                    <span className="text-xl sm:text-2xl">{node.icon}</span>
                    <span className="text-[10px] sm:text-xs font-medium text-neutral-600 mt-1 hidden sm:block">
                      {node.label}
                    </span>
                  </div>
                  {nextNode && (
                    <span
                      className={`text-lg mx-0.5 transition-all duration-500 ${
                        connActive ? "animate-pulse text-rose-400" : "text-gray-300"
                      }`}
                    >
                      →
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Department filters ────────────────────────────────────── */}
      {!isEmpty && data && (
        <div className="flex flex-wrap gap-2">
          {activeDeptKeys.map(dept => {
            const cfg = DEPT_CONFIG[dept] || DEPT_CONFIG.system;
            const isActive = activeFilters.has(dept);
            return (
              <button
                key={dept}
                onClick={() => toggleFilter(dept)}
                className={`touch-target flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
                  transition-all duration-300 border
                  ${isActive
                    ? `${cfg.bgClass} ${cfg.borderClass} ${cfg.textClass}`
                    : "bg-gray-50 border-gray-200 text-gray-400 opacity-60"
                  }`}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────── */}
      {isEmpty ? (
        <EmptyState
          icon="📅"
          title="No activity on this date"
          description="Pick another day or start using ShimmerStock to see your business timeline."
        />
      ) : (
        <>
          {/* ── Vertical timeline ──────────────────────────────────── */}
          <div className="relative">
            {/* Center line */}
            <div className="hidden md:block absolute left-8 top-0 bottom-0 w-0.5"
                 style={{ background: "linear-gradient(180deg, #fda4af 0%, #e11d48 50%, #fda4af 100%)" }} />

            <div className="space-y-0">
              {filteredEvents.length === 0 ? (
                <div className="text-center py-8 text-rose-400 text-sm">
                  No events match the selected department filters.
                </div>
              ) : (
                filteredEvents.map((event, idx) => {
                  const deptCfg = DEPT_CONFIG[event.department] || DEPT_CONFIG.system;
                  return (
                    <TimelineCard
                      key={`${event.source_table}-${event.source_id}-${idx}`}
                      event={event}
                      deptCfg={deptCfg}
                      isHighlighted={highlightedIdx === idx}
                      onLinkClick={() => {
                        if (event.links_to !== null && event.links_to < filteredEvents.length) {
                          setHighlightedIdx(event.links_to);
                          // Scroll to the linked element after a tick
                          setTimeout(() => {
                            const el = document.getElementById(`timeline-event-${event.links_to}`);
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                          }, 100);
                        }
                      }}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* Footer */}
          {filteredEvents.length > 0 && (
            <div className="text-center pt-4 pb-8">
              <p className="text-rose-300 text-sm font-medium">
                ✨ {filteredEvents.length} of {data.total} events shown
                {activeFilters.size < (data.departments?.length || 0) ? " (filtered)" : ""}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Timeline Card ──────────────────────────────────────────────────────

function TimelineCard({
  event,
  deptCfg,
  isHighlighted,
  onLinkClick,
}: {
  event: TimelineEntry;
  deptCfg: DeptConfig;
  isHighlighted: boolean;
  onLinkClick: () => void;
}) {
  // Compute a unique-ish key for the DOM id
  const idx = `${event.source_table}-${event.source_id}`;

  return (
    <div
      id={`timeline-event-${idx}`}
      className={`relative flex items-start mb-4 transition-all duration-500 ${
        isHighlighted ? "scale-[1.02]" : ""
      }`}
    >
      {/* Left: time + icon dot */}
      <div className="hidden md:flex flex-col items-center w-16 flex-shrink-0">
        <span className="text-xs text-rose-400 font-medium mb-1">{event.time}</span>
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center z-10 shadow-sm border-2 transition-all duration-300 ${
            isHighlighted
              ? "ring-4 ring-rose-300 ring-offset-2"
              : deptCfg.borderClass
          }`}
          style={{ backgroundColor: isHighlighted ? "#fff1f2" : "#fff" }}
        >
          <span className="text-base">{event.icon}</span>
        </div>
      </div>

      {/* Mobile time badge */}
      <span className="md:hidden text-xs text-rose-400 font-medium mt-1 mr-2 w-12 flex-shrink-0 text-right">
        {event.time}
      </span>

      {/* Card body */}
      <div
        className={`flex-1 bg-white rounded-2xl shadow-sm border transition-all duration-300 overflow-hidden
          ${isHighlighted ? "border-rose-400 shadow-md ring-2 ring-rose-200" : "border-rose-100 hover:shadow-md hover:-translate-y-0.5 hover:border-rose-200"}
        `}
      >
        {/* Department color strip on left */}
        <div className="flex">
          <div className="w-1 flex-shrink-0" style={{ backgroundColor: deptCfg.color }} />
          <div className="flex-1 p-3 sm:p-4">
            {/* Department badge + time (desktop time already shown, so just badge) */}
            <div className="flex items-center justify-between mb-1.5">
              <Badge engine={event.department} />
              <span className="md:hidden text-xs text-rose-400">{event.time}</span>
            </div>

            {/* Title */}
            <p className="text-sm font-semibold text-neutral-900 leading-snug">
              {event.title}
            </p>

            {/* Detail */}
            {event.detail && (
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                {event.detail}
              </p>
            )}

            {/* Link to next event in loop */}
            {event.links_to !== null && (
              <button
                onClick={onLinkClick}
                className="mt-2 text-xs font-semibold text-rose-500 hover:text-rose-600 
                           flex items-center gap-1 transition-all duration-200
                           hover:underline"
              >
                <span>Next →</span>
                <span className="text-[10px] opacity-70">see handoff</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
