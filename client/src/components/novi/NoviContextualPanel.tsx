import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiGet } from "../../lib/api";
import Novi from "../Novi";

// ── Types ───────────────────────────────────────────────────────────

interface NoviMessage {
  id: number;
  event_type: string;
  title: string;
  description: string;
  action_type: string | null;
  action_label: string | null;
  action_link: string | null;
  severity: "info" | "warning" | "opportunity" | "celebration" | "urgent";
  status: string;
  context_data: Record<string, any> | null;
  created_at: string;
}

interface NoviSettings {
  frequency: "proactive" | "balanced" | "minimal" | "quiet";
}

// ── Page-to-context mapping ─────────────────────────────────────────

const PAGE_TO_CONTEXT: Record<string, string> = {
  "/products": "products",
  "/orders": "orders",
  "/fulfillment": "fulfillment",
  "/purchasing": "purchasing",
  "/production": "production",
  "/warehouse": "warehouse",
  "/customers": "customers",
  "/hq": "hq",
  "/commerce": "commerce",
  "/partners": "partners",
};

function getPageContext(pathname: string): string | null {
  // Match exact path first
  if (PAGE_TO_CONTEXT[pathname]) return PAGE_TO_CONTEXT[pathname];
  // Match prefix for sub-routes (e.g. /products/123 → products)
  for (const [route, context] of Object.entries(PAGE_TO_CONTEXT)) {
    if (pathname.startsWith(route + "/") || pathname.startsWith(route + "?")) {
      return context;
    }
  }
  return null;
}

// ── Severity config ─────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  urgent: { bg: "bg-red-50/50", border: "border-l-red-400", icon: "🔴" },
  warning: { bg: "bg-amber-50/50", border: "border-l-amber-400", icon: "⚠️" },
  opportunity: { bg: "bg-blue-50/50", border: "border-l-blue-400", icon: "💡" },
  celebration: { bg: "bg-purple-50/50", border: "border-l-purple-400", icon: "🎉" },
  info: { bg: "bg-neutral-50", border: "border-l-neutral-300", icon: "ℹ️" },
};

// ── localStorage helpers ────────────────────────────────────────────

const DISMISSED_KEY = "novi_dismissed_contexts";
const DISMISS_EXPIRY_MS = 1000 * 60 * 60; // 1 hour

function getDismissedContexts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function isContextDismissed(context: string): boolean {
  const dismissed = getDismissedContexts();
  const expiry = dismissed[context];
  if (!expiry) return false;
  return Date.now() < expiry;
}

function dismissContext(context: string): void {
  const dismissed = getDismissedContexts();
  dismissed[context] = Date.now() + DISMISS_EXPIRY_MS;
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
}

// ── Component ───────────────────────────────────────────────────────

export default function NoviContextualPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState<NoviMessage | null>(null);
  const [settings, setSettings] = useState<NoviSettings | null>(null);
  const [visible, setVisible] = useState(true);
  const [animationState, setAnimationState] = useState<"entering" | "visible" | "exiting">("entering");
  const prevPathRef = useRef<string>(location.pathname);

  // ── Fetch messages for current page ───────────────────────────────

  const fetchMessages = useCallback(async () => {
    const pageContext = getPageContext(location.pathname);
    if (!pageContext) {
      setMessage(null);
      return;
    }

    // Check dismissal
    if (isContextDismissed(pageContext)) {
      setMessage(null);
      return;
    }

    try {
      const data = await apiGet<{ messages: NoviMessage[] }>(
        "/api/novi/messages?status=new&limit=5"
      );
      const messages = data.messages || [];

      // Filter by context_data.page matching current page
      const matching = messages.filter(
        (m) => m.context_data?.page === pageContext
      );

      if (matching.length > 0) {
        setMessage(matching[0]); // Most recent (API returns newest first)
      } else {
        setMessage(null);
      }
    } catch {
      // Silently fail — contextual panel is non-critical
      setMessage(null);
    }
  }, [location.pathname]);

  // ── Fetch settings ────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    try {
      const data = await apiGet<NoviSettings>("/api/novi/settings");
      setSettings(data);
    } catch {
      // Default to balanced if settings fail
      setSettings({ frequency: "balanced" });
    }
  }, []);

  // ── Initialize ────────────────────────────────────────────────────

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // ── Handle route change → re-trigger animation ────────────────────

  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      setVisible(true);
      setAnimationState("entering");
      const timer = setTimeout(() => setAnimationState("visible"), 350);
      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  // ── Dismiss handler ───────────────────────────────────────────────

  function handleDismiss() {
    const pageContext = getPageContext(location.pathname);
    if (pageContext) {
      dismissContext(pageContext);
    }
    setAnimationState("exiting");
    setTimeout(() => {
      setVisible(false);
      setMessage(null);
    }, 300);
  }

  // ── Frequency gating ──────────────────────────────────────────────

  // Quiet: never show contextual panel
  if (settings?.frequency === "quiet") return null;
  // Minimal: only show urgent
  if (settings?.frequency === "minimal" && message && message.severity !== "urgent") {
    return null;
  }

  // ── No message to show ────────────────────────────────────────────

  if (!message || !visible) return null;

  const sev = SEVERITY_COLORS[message.severity] || SEVERITY_COLORS.info;
  const isUrgentOrWarning =
    message.severity === "urgent" || message.severity === "warning";

  // ── Top Banner (urgent + warning) ─────────────────────────────────

  if (isUrgentOrWarning) {
    return (
      <div
        className={`w-full z-20 ${sev.bg} border ${sev.border} border-l-4 shadow-md`}
        style={{
          animation:
            animationState === "entering"
              ? "noviBannerSlideDown 0.35s ease-out both"
              : animationState === "exiting"
              ? "noviBannerSlideDown 0.3s ease-in reverse both"
              : "none",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <Novi expression={message.severity === "urgent" ? "protective" : "suspicious"} size="sm" animated={false} />
              <div className="min-w-0">
                <p className="font-semibold text-sm text-[#121212]">
                  {message.title}
                </p>
                {message.description && (
                  <p className="text-xs text-neutral-600 mt-0.5 line-clamp-2">
                    {message.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {message.action_type && message.action_label && (
                <button
                  onClick={() => {
                    if (message.action_link) {
                      navigate(message.action_link);
                    }
                  }}
                  className="px-3 py-1 text-xs font-medium bg-rose-500 text-white rounded-lg
                             hover:bg-rose-600 transition-colors touch-target"
                >
                  {message.action_label}
                </button>
              )}
              <button
                onClick={handleDismiss}
                className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-600
                           transition-colors touch-target"
                title="Show less for this page"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Slide-in Panel (opportunity + celebration + info) ─────────────

  return (
    <div
      className="fixed right-0 top-16 z-30 w-80 bg-white shadow-xl border border-purple-100 rounded-l-2xl overflow-hidden"
      style={{
        animation:
          animationState === "entering"
            ? "noviSlideInRight 0.35s ease-out both"
            : animationState === "exiting"
            ? "noviSlideInRight 0.3s ease-in reverse both"
            : "none",
      }}
    >
      {/* Header bar with severity color */}
      <div className={`${sev.border} border-l-4 pl-3 pr-2 py-3 flex items-start justify-between`}>
        <div className="flex items-start gap-2 min-w-0">
          <Novi expression={message.severity === "celebration" ? "proud" : "curious"} size="sm" animated={false} />
          <div className="min-w-0">
            <p className="font-semibold text-sm text-[#121212]">{message.title}</p>
            {message.description && (
              <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">
                {message.description}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 text-neutral-300 hover:text-neutral-500 transition-colors
                     rounded-lg hover:bg-neutral-100 touch-target"
          title="Show less for this page"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 1l6 6m0 0l6 6M7 7L1 13m6-6l6-6" />
          </svg>
        </button>
      </div>

      {/* Action button */}
      {message.action_type && message.action_label && (
        <div className="px-4 pb-3 pt-1">
          <button
            onClick={() => {
              if (message.action_link) navigate(message.action_link);
            }}
            className="w-full py-2 text-xs font-medium bg-purple-500 text-white rounded-lg
                       hover:bg-purple-600 transition-colors touch-target"
          >
            {message.action_label}
          </button>
        </div>
      )}

      {/* Dismiss footer */}
      <div className="px-4 pb-3">
        <button
          onClick={handleDismiss}
          className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          Show less for this page
        </button>
      </div>
    </div>
  );
}
