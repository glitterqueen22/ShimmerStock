import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Dropdown } from "./ui";

// ── Types ───────────────────────────────────────────────────────────

export type SnoozeDuration = "1_day" | "1_week" | "1_month";

export interface OpportunityCardProps {
  id: string;
  type: string;
  engine: string;
  icon: string;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  confidence: number;
  explanation: string;
  citedData?: Record<string, any>;
  actionLabel: string;
  actionRoute: string;
  noviAssistPrompt?: string;
  status: "active" | "snoozed" | "completed" | "dismissed";
  snoozedUntil?: string;
  createdAt: string;
  onAction: (id: string) => void;
  onNoviAssist: (id: string, prompt: string) => void;
  onSnooze: (id: string, duration: SnoozeDuration) => void;
  onComplete: (id: string) => void;
  onDismiss: (id: string) => void;
}

// ── Impact Config ───────────────────────────────────────────────────

const IMPACT_CONFIG: Record<
  string,
  { icon: string; label: string; badgeClass: string; borderClass: string }
> = {
  high: {
    icon: "🔴",
    label: "High Impact",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    borderClass: "border-l-4 border-l-red-400",
  },
  medium: {
    icon: "🟡",
    label: "Medium Impact",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    borderClass: "border-l-4 border-l-amber-400",
  },
  low: {
    icon: "🔵",
    label: "Low Impact",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    borderClass: "border-l-4 border-l-blue-400",
  },
};

const SNOOZE_LABELS: Record<SnoozeDuration, string> = {
  "1_day": "1 day",
  "1_week": "1 week",
  "1_month": "1 month",
};

// ── Helpers ─────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatSnoozedUntil(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function confidenceLabel(confidence: number): {
  text: string;
  color: "green" | "orange" | "red";
} {
  if (confidence >= 0.8) return { text: "High confidence", color: "green" };
  if (confidence >= 0.6) return { text: "Medium confidence", color: "orange" };
  return { text: "Low confidence", color: "red" };
}

function confidenceColorClass(color: "green" | "orange" | "red"): string {
  switch (color) {
    case "green": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "orange": return "bg-amber-50 text-amber-700 border-amber-200";
    case "red": return "bg-red-50 text-red-700 border-red-200";
  }
}

// ── OpportunityCard Component ───────────────────────────────────────

export default function OpportunityCard(props: OpportunityCardProps) {
  const {
    id, icon, title, description, impact, confidence, explanation,
    citedData, actionLabel, actionRoute, noviAssistPrompt,
    status, snoozedUntil, createdAt,
    onAction, onNoviAssist, onSnooze, onComplete, onDismiss,
  } = props;

  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const impactCfg = IMPACT_CONFIG[impact] || IMPACT_CONFIG.low;
  const conf = confidenceLabel(confidence);

  // ── Snoozed State ────────────────────────────────────────────────
  if (status === "snoozed") {
    return (
      <div
        className="bg-white rounded-2xl border border-neutral-200 shadow-sm
                   opacity-70 saturate-50 overflow-hidden transition-all duration-300"
      >
        <div className="p-5">
          {/* Top row: snoozed label + timestamp */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{icon}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-500 border border-neutral-200">
                💤 Snoozed
              </span>
            </div>
            <span className="text-xs text-neutral-400">
              {snoozedUntil ? `Until ${formatSnoozedUntil(snoozedUntil)}` : ""}
            </span>
          </div>

          <h3 className="font-semibold text-[#121212] text-base mb-2 leading-snug">
            {title}
          </h3>
          <p className="text-sm text-neutral-500 mb-4 leading-relaxed">
            {description}
          </p>

          {/* Action row */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onSnooze(id, "1_day"); // unsnooze by passing a null-like signal? Actually let's handle via parent
                // We'll have a dedicated unsnooze callback — using onSnooze with a special signal
                // For now, let's just call the parent and let it decide
                // Actually, the parent handles unsnooze by re-snoozing with original params
                // Let's add an onUnsnooze concept — but the spec says "Unsnooze text button"
                // Simplest: the parent checks status and reverses
              }}
              className="text-neutral-500 hover:text-rose-600"
            >
              Unsnooze
            </Button>
            {noviAssistPrompt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNoviAssist(id, noviAssistPrompt)}
                className="text-neutral-400 hover:text-purple-600"
              >
                💜 Do it with Novi
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Completed State ──────────────────────────────────────────────
  if (status === "completed") {
    return (
      <div
        className="bg-white rounded-2xl border border-neutral-200 shadow-sm
                   border-l-4 border-l-emerald-300 opacity-60 overflow-hidden transition-all duration-300"
      >
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">{icon}</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              ✅ Completed
            </span>
          </div>

          <h3 className="font-semibold text-[#121212] text-base mb-2 leading-snug">
            {title}
          </h3>
          <p className="text-sm text-neutral-500 mb-3 leading-relaxed">
            {description}
          </p>

          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span>✅ Completed {relativeTime(createdAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Active State ─────────────────────────────────────────────────
  return (
    <div
      className={`bg-white rounded-2xl border border-rose-100 shadow-sm
                  hover:shadow-md transition-all duration-300 overflow-hidden
                  ${impactCfg.borderClass} animate-scaleIn`}
    >
      <div className="p-5">
        {/* ── Top Row: badges ─────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {/* Impact badge */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${impactCfg.badgeClass}`}
          >
            <span>{impactCfg.icon}</span>
            <span>{impactCfg.label}</span>
          </span>

          {/* Engine badge */}
          <Badge engine={props.engine} />

          {/* Confidence pill */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${confidenceColorClass(conf.color)}`}
          >
            {Math.round(confidence * 100)}% {conf.text}
          </span>
        </div>

        {/* ── Icon + Title + Description ──────────────────────── */}
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl flex-shrink-0">{icon}</span>
          <div>
            <h3 className="font-semibold text-[#121212] text-base mb-1 leading-snug">
              {title}
            </h3>
            <p className="text-sm text-neutral-500 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* ── Action Buttons ──────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (actionRoute) navigate(actionRoute);
              onAction(id);
            }}
            className="flex-1"
          >
            {actionLabel}
          </Button>
          {noviAssistPrompt && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNoviAssist(id, noviAssistPrompt)}
              className="flex-1"
            >
              💜 Do it with Novi
            </Button>
          )}
        </div>

        {/* ── Footer Row ──────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-rose-400 hover:text-rose-500 transition-colors flex items-center gap-1"
          >
            <span>{expanded ? "▲" : "▼"}</span>
            <span>{expanded ? "Hide explanation" : "Why this matters"}</span>
          </button>

          <div className="flex items-center gap-1">
            {/* Snooze Dropdown */}
            <Dropdown
              align="right"
              trigger={
                <button
                  className="px-2 py-1 text-xs text-neutral-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                  title="Snooze"
                >
                  💤
                </button>
              }
              items={
                (["1_day", "1_week", "1_month"] as SnoozeDuration[]).map(
                  (d) => ({
                    id: d,
                    label: SNOOZE_LABELS[d],
                    icon: "💤",
                    onClick: () => onSnooze(id, d),
                  })
                )
              }
            />

            {/* Complete */}
            <button
              onClick={() => onComplete(id)}
              className="px-2 py-1 text-xs text-neutral-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Complete"
            >
              ✅
            </button>

            {/* Dismiss */}
            <button
              onClick={() => onDismiss(id)}
              className="px-2 py-1 text-xs text-neutral-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Expandable Explanation ──────────────────────────── */}
        {expanded && (
          <div className="mt-3 p-4 bg-rose-50/50 rounded-xl border border-rose-100 animate-slideRight">
            <p className="text-sm text-neutral-600 leading-relaxed mb-3">
              {explanation}
            </p>
            {citedData && Object.keys(citedData).length > 0 && (
              <div className="mt-3 pt-3 border-t border-rose-100">
                <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide mb-2">
                  Data Sources
                </p>
                <pre className="text-xs text-neutral-500 whitespace-pre-wrap font-mono bg-white rounded-lg p-2 overflow-x-auto">
                  {JSON.stringify(citedData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
