/**
 * FirstDayChecklist — helps new beta users understand what to explore.
 * Visible from Command Center. Progress stored per business+user in localStorage.
 * Progress is browser/device-local during beta and does not sync across devices.
 * Fail-closed: no read or write to localStorage unless both IDs are present.
 * No guilt language. Every item links to a real destination.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Novi from "./Novi";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  link: string;
  icon: string;
}

const ITEMS: ChecklistItem[] = [
  { id: "profile",    icon: "👤", label: "Complete business profile",    description: "Name, type, and contact info",           link: "/settings" },
  { id: "command",    icon: "🏠", label: "Explore the Command Center",   description: "See your daily overview and Novi brief",  link: "/hq" },
  { id: "morning",    icon: "✨", label: "Review Novi Morning Brief",    description: "What Novi has noticed about your business", link: "/novi" },
  { id: "products",   icon: "📦", label: "Explore products",             description: "Review your catalog, SKUs, and stock",   link: "/products" },
  { id: "locations",  icon: "🏗️", label: "Confirm inventory locations",  description: "Set up bins and warehouse locations",    link: "/warehouse" },
  { id: "orders",     icon: "📋", label: "Explore an order workflow",    description: "See how an order moves through the system", link: "/orders" },
  { id: "teammate",   icon: "👥", label: "Invite a teammate",            description: "Add a team member and assign a role",    link: "/team" },
  { id: "shopify",    icon: "🔗", label: "Review Shopify pilot readiness", description: "See the read-only connection checklist", link: "/commerce" },
];

/**
 * Returns a scoped storage key only when BOTH IDs are present and non-empty.
 * Returns null (not empty string) when either ID is missing — callers must check.
 */
export function getChecklistStorageKey(
  businessId: number | string | null | undefined,
  userId: number | string | null | undefined,
): string | null {
  if (businessId == null || businessId === "" || userId == null || userId === "") return null;
  return `shimmerstock_first_day_b${businessId}_u${userId}`;
}

interface FirstDayChecklistProps {
  businessId?: number | string;
  userId?: number | string;
  /** Called once when all items are first completed */
  onAllComplete?: () => void;
}

export default function FirstDayChecklist({ businessId, userId, onAllComplete }: FirstDayChecklistProps) {
  const navigate = useNavigate();
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  // Derive scoped key — null means IDs not ready yet
  const storageKey = getChecklistStorageKey(businessId, userId);

  /**
   * Load from localStorage only when a valid scoped key exists.
   * Reset state to empty whenever the key changes (account/business switch).
   */
  useEffect(() => {
    // Always reset before loading so a previous user's state never lingers
    setCompleted(new Set());
    setCelebrated(false);

    if (storageKey === null) return; // fail closed — no IDs, no read

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        setCompleted(new Set(ids));
        if (ids.length === ITEMS.length) setCelebrated(true);
      }
    } catch {
      // Corrupt storage: silently ignore, start fresh
    }
  }, [storageKey]);

  const toggle = useCallback((id: string) => {
    setCompleted(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      // Write only when we have a valid scoped key — never to localStorage[""]
      if (storageKey !== null) {
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // Storage full or unavailable — state stays in memory
        }
      }
      if (next.size === ITEMS.length && !celebrated) {
        setCelebrated(true);
        onAllComplete?.();
      }
      return next;
    });
  }, [storageKey, celebrated, onAllComplete]);

  const doneCount = completed.size;
  const totalCount = ITEMS.length;
  const allDone = doneCount === totalCount;
  const progressPct = Math.round((doneCount / totalCount) * 100);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-violet-100 bg-violet-50 hover:bg-violet-100 transition-colors text-left"
      >
        <span className="text-sm" aria-hidden>✅</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-violet-800">First Day Checklist</span>
          <span className="ml-2 text-xs text-violet-500">{doneCount}/{totalCount} complete</span>
        </div>
        <div className="w-16 h-1.5 rounded-full bg-violet-200 overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="text-xs text-violet-400">▲ expand</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-violet-100 flex items-center justify-between bg-violet-50">
        <div className="flex items-center gap-2">
          <span className="text-sm" aria-hidden>✅</span>
          <span className="text-sm font-bold text-violet-800">First Day Checklist</span>
          <span className="text-xs text-violet-500">{doneCount}/{totalCount}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-20 h-1.5 rounded-full bg-violet-200 overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
          <button onClick={() => setCollapsed(true)} className="text-xs text-violet-400 hover:text-violet-600 transition-colors" aria-label="Collapse">▼</button>
        </div>
      </div>

      {/* Celebration when all done */}
      {allDone && (
        <div className="px-5 py-4 bg-gradient-to-r from-violet-50 to-emerald-50 border-b border-emerald-100 flex items-start gap-3">
          <Novi expression="celebrating" size="sm" animated />
          <div>
            <p className="text-sm font-semibold text-emerald-800">You built the foundation.</p>
            <p className="text-xs text-emerald-700 mt-0.5">Your workspace is ready for real data when you are.</p>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="divide-y divide-neutral-50">
        {ITEMS.map(item => {
          const done = completed.has(item.id);
          return (
            <div key={item.id} className={`flex items-start gap-3 px-4 py-3 transition-colors ${done ? "bg-emerald-50/40" : "hover:bg-neutral-50"}`}>
              <button
                onClick={() => toggle(item.id)}
                className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all mt-0.5
                  ${done ? "bg-emerald-500 border-emerald-500 text-white" : "border-neutral-300 hover:border-violet-400"}`}
                aria-label={done ? `Mark ${item.label} as incomplete` : `Mark ${item.label} as complete`}
              >
                {done && <span className="text-[9px] font-bold">✓</span>}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span aria-hidden className="text-sm">{item.icon}</span>
                  <p className={`text-sm font-medium ${done ? "line-through text-neutral-400" : "text-neutral-800"}`}>{item.label}</p>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">{item.description}</p>
              </div>
              <button
                onClick={() => navigate(item.link)}
                className="flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
              >
                Go →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
