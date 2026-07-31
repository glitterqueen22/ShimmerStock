import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api";

// ── Types ───────────────────────────────────────────────────────────

interface NoviMessage {
  id: number;
  business_id: number;
  user_id: number | null;
  event_type: string;
  title: string;
  description: string;
  action_type: string | null;
  action_label: string | null;
  action_link: string | null;
  action_route: string | null;
  severity: "info" | "warning" | "opportunity" | "celebration" | "urgent";
  status: "new" | "viewed" | "snoozed" | "completed" | "dismissed";
  context_data: Record<string, any> | null;
  created_at: string;
  viewed_at: string | null;
  completed_at: string | null;
}

interface MessagesResponse {
  messages: NoviMessage[];
  unread_count: number;
}

interface SummaryResponse {
  unread_count: number;
  urgent_count: number;
  celebration_count: number;
  latest_message: NoviMessage | null;
}

// ── Severity config ─────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  urgent: 0,
  warning: 1,
  opportunity: 2,
  celebration: 3,
  info: 4,
};

const SEVERITY_CONFIG: Record<
  string,
  { icon: string; bg: string; text: string; border: string; label: string }
> = {
  urgent: {
    icon: "🔴",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-300",
    label: "Urgent",
  },
  warning: {
    icon: "⚠️",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-300",
    label: "Warning",
  },
  opportunity: {
    icon: "💡",
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    border: "border-yellow-300",
    label: "Opportunity",
  },
  celebration: {
    icon: "🎉",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-300",
    label: "Celebration",
  },
  info: {
    icon: "ℹ️",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-300",
    label: "Info",
  },
};

const SEVERITY_GROUP_LABELS: Record<string, string> = {
  urgent: "🔴 Needs Attention Now",
  warning: "⚠️ Warnings",
  opportunity: "💡 Opportunities",
  celebration: "🎉 Celebrations",
  info: "ℹ️ Info",
};

// ── Relative time helper ────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
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

// ── Component ───────────────────────────────────────────────────────

interface NoviMessageCenterProps {
  /** If embedded, show compact version; if full page, show full layout */
  embedded?: boolean;
  /** Increment to force a refresh of all data */
  refreshKey?: number;
}

export default function NoviMessageCenter({ embedded = false, refreshKey = 0 }: NoviMessageCenterProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<NoviMessage[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});

  // ── Fetch all messages ────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<MessagesResponse>("/api/novi/messages?status=new&limit=50");
      setMessages(data.messages || []);
    } catch (err: any) {
      setError(err.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch summary ─────────────────────────────────────────────────

  const fetchSummary = useCallback(async () => {
    try {
      const data = await apiGet<SummaryResponse>("/api/novi/messages/summary");
      setSummary(data);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchMessages();
  }, [fetchSummary, fetchMessages, refreshKey]);

  // ── Update status ─────────────────────────────────────────────────

  async function updateStatus(messageId: number, status: string) {
    setActionLoading((prev) => ({ ...prev, [messageId]: status }));
    try {
      const token = localStorage.getItem("shimmerstock_token");
      const res = await fetch(`/api/novi/messages/${messageId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) throw new Error("Failed to update");

      // If completing an opportunity message, also sync to opportunities table
      if (status === "completed") {
        const msg = messages.find((m) => m.id === messageId);
        const oppId = msg?.context_data?.opportunity_id;
        if (oppId && (msg?.event_type?.startsWith("opportunity") || msg?.severity === "opportunity")) {
          // Fire-and-forget: mark the opportunity as complete too
          fetch(`/api/opportunities/${encodeURIComponent(oppId)}/complete`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }).catch(() => {});
        }
      }

      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      fetchSummary();
    } catch {
      // Silently fail
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    }
  }

  // ── Handle action button ──────────────────────────────────────────

  function handleAction(msg: NoviMessage) {
    // Opportunities: navigate to Opportunity Center with highlight
    if (msg.event_type?.startsWith("opportunity") || msg.severity === "opportunity") {
      const oppId = msg.context_data?.opportunity_id;
      const route = oppId
        ? `/opportunities?tab=active&highlight=${encodeURIComponent(oppId)}`
        : "/opportunities?tab=active";
      updateStatus(msg.id, "viewed");
      navigate(route);
      return;
    }

    const route = msg.action_route || msg.action_link;
    if (route) {
      // Mark as viewed first, then navigate
      updateStatus(msg.id, "viewed");
      navigate(route);
    }
  }

  // ── Group messages by severity ────────────────────────────────────

  const grouped = messages.reduce((acc, msg) => {
    const sev = msg.severity || "info";
    if (!acc[sev]) acc[sev] = [];
    acc[sev].push(msg);
    return acc;
  }, {} as Record<string, NoviMessage[]>);

  // Sort groups by severity priority
  const sortedGroups = Object.keys(grouped).sort(
    (a, b) => (SEVERITY_ORDER[a] ?? 99) - (SEVERITY_ORDER[b] ?? 99)
  );

  // ── Loading state ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={embedded ? "space-y-3" : "space-y-6"}>
        {!embedded && (
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-2xl font-bold text-[#121212]">✨ Message Center</h1>
          </div>
        )}
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-rose-100 p-4 shadow-sm animate-pulse"
            >
              <div className="h-4 w-24 bg-neutral-100 rounded mb-3" />
              <div className="h-3 w-full bg-neutral-50 rounded mb-2" />
              <div className="h-3 w-2/3 bg-neutral-50 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────

  if (error) {
    return (
      <div className={embedded ? "" : "space-y-6"}>
        {!embedded && (
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-2xl font-bold text-[#121212]">✨ Message Center</h1>
          </div>
        )}
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-red-600 font-medium mb-2">Couldn't load messages</p>
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button
            onClick={fetchMessages}
            className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────

  if (messages.length === 0) {
    return (
      <div className={embedded ? "" : "space-y-6"}>
        {!embedded && (
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-2xl font-bold text-[#121212]">✨ Message Center</h1>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-rose-100 p-8 text-center shadow-sm">
          <div className="text-5xl mb-4">💜</div>
          <h3 className="text-lg font-semibold text-[#121212] mb-2">
            No messages yet
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            I'll let you know when something needs attention — inventory alerts,
            order opportunities, milestones, and more.
          </p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className={embedded ? "space-y-3" : "space-y-6"}>
      {/* Header with stats */}
      {!embedded && (
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-[#121212]">✨ Message Center</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {summary ? `${summary.unread_count} unread message(s)` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Summary stats */}
            {summary && (
              <>
                {summary.urgent_count > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                    🔴 {summary.urgent_count}
                  </span>
                )}
                {summary.celebration_count > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                    🎉 {summary.celebration_count}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Messages grouped by severity */}
      {sortedGroups.map((severity) => {
        const sevConfig = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.info;
        const groupLabel = SEVERITY_GROUP_LABELS[severity] || severity;
        const msgs = grouped[severity];

        return (
          <div key={severity} className="space-y-2">
            {/* Group header */}
            <h3
              className={`text-xs font-semibold uppercase tracking-wide px-1 ${sevConfig.text}`}
            >
              {groupLabel} ({msgs.length})
            </h3>

            {/* Messages in this group */}
            <div className="space-y-2">
              {msgs.map((msg) => {
                const isLoading = !!actionLoading[msg.id];
                const currentAction = actionLoading[msg.id];

                return (
                  <div
                    key={msg.id}
                    className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden
                      ${sevConfig.border} border-l-4`}
                  >
                    <div className="p-4">
                      {/* Top row */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sevConfig.bg} ${sevConfig.text}`}
                          >
                            <span>{sevConfig.icon}</span>
                            <span>{sevConfig.label}</span>
                          </span>
                          <span className="text-xs text-neutral-400">
                            {relativeTime(msg.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Title + description */}
                      <h3 className="font-semibold text-[#121212] text-sm mb-1">
                        {msg.title}
                      </h3>
                      {msg.description && (
                        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                          {msg.description}
                        </p>
                      )}

                      {/* Action row */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Primary action button */}
                        {(msg.action_type && msg.action_label) ? (
                          <button
                            onClick={() => handleAction(msg)}
                            disabled={isLoading}
                            className="px-3 py-1.5 text-xs font-medium bg-rose-500 text-white rounded-lg
                                       hover:bg-rose-600 transition-colors disabled:opacity-50"
                          >
                            {msg.action_label}
                          </button>
                        ) : null}

                        {/* Quick actions */}
                        <button
                          onClick={() => updateStatus(msg.id, "completed")}
                          disabled={isLoading}
                          className="px-2.5 py-1 text-xs text-neutral-500 hover:text-emerald-600
                                     hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          ✅ {currentAction === "completed" ? "..." : "Complete"}
                        </button>
                        <button
                          onClick={() => updateStatus(msg.id, "snoozed")}
                          disabled={isLoading}
                          className="px-2.5 py-1 text-xs text-neutral-500 hover:text-amber-600
                                     hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          💤 {currentAction === "snoozed" ? "..." : "Snooze"}
                        </button>
                        <button
                          onClick={() => updateStatus(msg.id, "dismissed")}
                          disabled={isLoading}
                          className="px-2.5 py-1 text-xs text-neutral-400 hover:text-red-500
                                     hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          ✕ {currentAction === "dismissed" ? "..." : "Dismiss"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
