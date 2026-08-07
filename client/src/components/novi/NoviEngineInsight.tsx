/**
 * NoviEngineInsight — contextual Novi presence for engine pages.
 *
 * Renders a compact, restrained insight strip at the top of any engine page.
 * CODE CALCULATES. NOVI EXPLAINS.
 * Demo insights must be labeled is_demo=true; never fabricate live data.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Novi from "../Novi";
import type { DemoInsight } from "../../lib/businessDna";

export interface NoviEngineInsightProps {
  /** Insights pre-filtered for this engine by the parent page */
  insights: DemoInsight[];
  /** Full experience (Morning Brief style) vs. compact strip */
  variant?: "full" | "compact";
  className?: string;
}

export default function NoviEngineInsight({ insights, variant = "compact", className = "" }: NoviEngineInsightProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  if (dismissed || insights.length === 0) return null;

  const primary = insights[0];
  const noviExpression =
    primary.severity === "urgent" ? "concerned" as const
    : primary.severity === "warning" ? "thinking" as const
    : primary.severity === "celebration" ? "happy" as const
    : "calm" as const;

  const colors = {
    urgent:      { wrap: "bg-red-50 border-red-200",    badge: "bg-red-100 text-red-700",    icon: "🔴" },
    warning:     { wrap: "bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-700", icon: "⚠️" },
    celebration: { wrap: "bg-emerald-50 border-emerald-200", badge: "bg-emerald-100 text-emerald-700", icon: "🎉" },
    info:        { wrap: "bg-violet-50 border-violet-200", badge: "bg-violet-100 text-violet-700", icon: "ℹ️" },
  }[primary.severity] ?? { wrap: "bg-violet-50 border-violet-200", badge: "bg-violet-100 text-violet-700", icon: "ℹ️" };

  if (variant === "compact") {
    return (
      <div className={`rounded-2xl border ${colors.wrap} p-4 flex items-start gap-3 ${className}`} role="note" aria-label="Novi insight">
        <Novi expression={noviExpression} size="sm" animated={false} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-neutral-900 leading-tight">{primary.title}</p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${colors.badge}`}>{primary.severity}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-500">Demo</span>
            </div>
          </div>
          <p className="text-xs text-neutral-600 mt-1">{primary.summary}</p>

          {expanded === 0 && (
            <div className="mt-2 border-t border-neutral-200 pt-2 space-y-1">
              <p className="text-[11px] text-neutral-500 italic">Why: {primary.reasoning}</p>
              <p className="text-[11px] text-neutral-700 font-medium">→ {primary.recommended_action}</p>
            </div>
          )}

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              onClick={() => navigate(primary.action_link)}
              className="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors"
            >
              {primary.action_label}
            </button>
            <button
              onClick={() => setExpanded(expanded === 0 ? null : 0)}
              className="text-xs text-violet-500 hover:text-violet-700 transition-colors"
            >
              {expanded === 0 ? "Less" : "Show me why"}
            </button>
            {insights.length > 1 && (
              <span className="text-xs text-neutral-400">+{insights.length - 1} more</span>
            )}
            <button
              onClick={() => setDismissed(true)}
              className="ml-auto text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
              aria-label="Dismiss Novi insight"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Full variant — shows all insights
  return (
    <div className={`rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-purple-50 shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 py-3 border-b border-violet-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-violet-500 uppercase tracking-widest">Novi</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-600 border border-violet-200">Demo</span>
        </div>
        <button onClick={() => setDismissed(true)} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors" aria-label="Dismiss">
          Dismiss
        </button>
      </div>
      <div className="p-5 flex gap-4">
        <div className="flex-shrink-0">
          <Novi expression={noviExpression} size="md" animated />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          {insights.map((insight, idx) => {
            const c = {
              urgent:      { bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-700", icon: "🔴" },
              warning:     { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-700", icon: "⚠️" },
              celebration: { bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700", icon: "🎉" },
              info:        { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700", icon: "ℹ️" },
            }[insight.severity] ?? { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700", icon: "ℹ️" };

            return (
              <div key={idx} className={`rounded-xl border ${c.border} ${c.bg} p-3`}>
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 text-sm mt-0.5" aria-hidden>{c.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-neutral-900 leading-tight">{insight.title}</p>
                      <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${c.badge}`}>{insight.severity}</span>
                    </div>
                    <p className="text-xs text-neutral-600 mt-1">{insight.summary}</p>
                    {expanded === idx && (
                      <div className="mt-2 border-t border-neutral-200 pt-2 space-y-1.5">
                        <p className="text-[11px] text-neutral-500 italic">Why: {insight.reasoning}</p>
                        <p className="text-[11px] text-neutral-700 font-medium">→ {insight.recommended_action}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <button onClick={() => navigate(insight.action_link)}
                        className="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors">
                        {insight.action_label}
                      </button>
                      <button onClick={() => setExpanded(expanded === idx ? null : idx)}
                        className="text-xs text-violet-500 hover:text-violet-700 transition-colors">
                        {expanded === idx ? "Less" : "Show me why"}
                      </button>
                      <span className="text-[10px] text-neutral-400 ml-auto">Demo · {insight.engine}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
