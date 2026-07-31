import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiGet } from "../../lib/api";

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

interface SummaryResponse {
  unread_count: number;
  urgent_count: number;
  celebration_count: number;
  latest_message: NoviMessage | null;
}

interface ChatMessage {
  role: "user" | "novi";
  text: string;
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
  if (PAGE_TO_CONTEXT[pathname]) return PAGE_TO_CONTEXT[pathname];
  for (const [route, context] of Object.entries(PAGE_TO_CONTEXT)) {
    if (pathname.startsWith(route + "/") || pathname.startsWith(route + "?")) {
      return context;
    }
  }
  return null;
}

// ── Suggested questions by page ─────────────────────────────────────

const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  products: ["Which products need reordering?", "What's my best seller?"],
  orders: ["Any orders that need attention?", "Orders to combine?"],
  fulfillment: ["What's ready to ship?", "Shipping deadlines?"],
  purchasing: ["Any overdue POs?", "What should I reorder?"],
  production: ["What's ready to produce?", "Batches pending?"],
  hq: ["How's my business doing?", "What needs attention?"],
  customers: ["Who are my best customers?", "At-risk customers?"],
};

const DEFAULT_QUESTIONS = ["What needs my attention?", "How's my business doing?"];

// ── Severity icons ──────────────────────────────────────────────────

const SEVERITY_ICONS: Record<string, string> = {
  urgent: "🔴",
  warning: "⚠️",
  opportunity: "💡",
  celebration: "🎉",
  info: "ℹ️",
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

export default function AskNoviWidget() {
  const location = useLocation();
  const navigate = useNavigate();

  // Panel state
  const [isOpen, setIsOpen] = useState(false);

  // Summary (unread count for badge)
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasUnread, setHasUnread] = useState(false);

  // Context messages for panel
  const [contextMessages, setContextMessages] = useState<NoviMessage[]>([]);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Poll summary for unread badge ─────────────────────────────────

  const fetchSummary = useCallback(async () => {
    try {
      const data = await apiGet<SummaryResponse>("/api/novi/messages/summary");
      setUnreadCount(data.unread_count);
      setHasUnread(data.unread_count > 0);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 60000); // Every 60s
    return () => clearInterval(interval);
  }, [fetchSummary]);

  // ── Fetch context messages when panel opens or route changes ──────

  const fetchContextMessages = useCallback(async () => {
    const pageContext = getPageContext(location.pathname);
    try {
      const data = await apiGet<{ messages: NoviMessage[] }>(
        "/api/novi/messages?status=new&limit=5"
      );
      const messages = data.messages || [];

      if (pageContext) {
        const matching = messages.filter(
          (m) => m.context_data?.page === pageContext
        );
        setContextMessages(matching.slice(0, 3));
      } else {
        setContextMessages(messages.slice(0, 3));
      }
    } catch {
      setContextMessages([]);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (isOpen) {
      fetchContextMessages();
    }
  }, [isOpen, fetchContextMessages]);

  // ── Toggle panel ──────────────────────────────────────────────────

  function togglePanel() {
    setIsOpen((prev) => {
      if (!prev) {
        // Opening — focus input after animation
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      return !prev;
    });
  }

  // ── Close panel on Escape ─────────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  // ── Close panel on outside click ──────────────────────────────────

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        isOpen &&
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement)?.closest("[data-novi-fab]")
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // ── Scroll chat to bottom ─────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isTyping]);

  // ── Send message ──────────────────────────────────────────────────

  async function handleSend(text?: string) {
    const messageText = (text || inputValue).trim();
    if (!messageText) return;

    setInputValue("");
    setInputError(null);

    // Add user message
    setChatMessages((prev) => [...prev, { role: "user", text: messageText }]);

    // Typing indicator
    setIsTyping(true);

    try {
      // Call the Bestie ask endpoint
      const encodedQ = encodeURIComponent(messageText);
      const pageCtx = getPageContext(location.pathname);
      const url = `/api/bestie/ask?q=${encodedQ}${pageCtx ? `&page=${pageCtx}` : ""}`;
      const data = await apiGet<{ answer: string }>(url);

      setIsTyping(false);
      setChatMessages((prev) => [
        ...prev,
        { role: "novi", text: data.answer || "I'm here to help! Let me look into that. ✨" },
      ]);
    } catch (err: any) {
      setIsTyping(false);
      setInputError(err.message || "Something went wrong. Try again.");
    }
  }

  // ── Handle key press ──────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Suggested questions for current page ──────────────────────────

  const pageContext = getPageContext(location.pathname);
  const questions = pageContext
    ? SUGGESTED_QUESTIONS[pageContext] || DEFAULT_QUESTIONS
    : DEFAULT_QUESTIONS;

  // ── Render ────────────────────────────────────────────────────────

  return (
    <>
      {/* ── FAB Button ────────────────────────────────────────────── */}
      <button
        data-novi-fab
        onClick={togglePanel}
        aria-label={isOpen ? "Close Novi chat" : "Ask Novi"}
        className={`
          fixed z-40 rounded-full flex items-center justify-center
          transition-all duration-300 ease-out touch-target
          bg-purple-500 hover:bg-purple-600
          shadow-lg shadow-purple-300/40 hover:shadow-xl hover:-translate-y-0.5
          ${hasUnread && !isOpen ? "animate-[noviFabPulse_2s_ease-in-out_infinite]" : ""}
          bottom-4 right-4 w-12 h-12
          sm:bottom-6 sm:right-6 sm:w-14 sm:h-14
        `}
        style={{
          animation:
            hasUnread && !isOpen
              ? "noviFabPulse 2s ease-in-out infinite"
              : "none",
        }}
      >
        {/* Novi crystal icon */}
        <span className="text-2xl sm:text-[28px] leading-none select-none">
          {isOpen ? "✕" : "💜"}
        </span>

        {/* Unread badge */}
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1
                           rounded-full bg-red-500 text-white text-[10px] font-bold
                           flex items-center justify-center shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Widget Panel ───────────────────────────────────────────── */}
      {isOpen && (
        <div
          ref={panelRef}
          className={`
            fixed z-40 bg-white shadow-2xl border border-purple-100
            flex flex-col overflow-hidden
            /* Mobile: bottom sheet */
            bottom-0 left-0 right-0 rounded-t-2xl max-h-[70vh]
            /* Desktop: floating panel */
            sm:bottom-20 sm:right-6 sm:left-auto sm:w-[360px] sm:h-[480px]
            sm:rounded-2xl sm:max-h-none
          `}
          style={{
            animation:
              "noviSheetUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both",
          }}
        >
          {/* ── Header ───────────────────────────────────────────── */}
          <div className="flex-shrink-0 bg-purple-500 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">💜</span>
              <div>
                <p className="font-semibold text-sm">How can I help?</p>
                <p className="text-xs text-purple-100">Ask me anything about your business</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors touch-target
                         text-white/80 hover:text-white"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 2l6 6m0 0l6 6M8 8L2 14m6-6L14 2" />
              </svg>
            </button>
          </div>

          {/* ── Content area (scrollable) ─────────────────────────── */}
          <div className="flex-1 overflow-y-auto">
            {/* Chat messages */}
            {chatMessages.length > 0 ? (
              <div className="px-4 py-3 space-y-3">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-purple-500 text-white rounded-br-md"
                          : "bg-neutral-100 text-[#121212] rounded-bl-md"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-neutral-100 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            ) : (
              /* No chat yet — show context cards + suggestions */
              <div className="p-4 space-y-4">
                {/* Context cards */}
                {contextMessages.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                      On this page
                    </p>
                    {contextMessages.map((msg) => (
                      <button
                        key={msg.id}
                        onClick={() => {
                          if (msg.action_link) navigate(msg.action_link);
                        }}
                        className="w-full text-left p-3 bg-neutral-50 rounded-xl border border-neutral-100
                                   hover:bg-purple-50 hover:border-purple-100 transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-sm flex-shrink-0 mt-0.5">
                            {SEVERITY_ICONS[msg.severity] || "ℹ️"}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#121212] group-hover:text-purple-700 truncate">
                              {msg.title}
                            </p>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              {relativeTime(msg.created_at)}
                            </p>
                          </div>
                          {msg.action_label && (
                            <span className="flex-shrink-0 text-xs text-purple-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity self-center">
                              {msg.action_label} →
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-2xl">✨</p>
                    <p className="text-sm text-neutral-500 mt-1">
                      Nothing needs attention on this page
                    </p>
                  </div>
                )}

                {/* Suggested questions */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                    Try asking
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {questions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(q)}
                        className="px-3 py-1.5 text-xs font-medium bg-purple-50 text-purple-600
                                   rounded-full border border-purple-100
                                   hover:bg-purple-100 hover:border-purple-200
                                   transition-colors touch-target"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Input row ─────────────────────────────────────────── */}
          <div className="flex-shrink-0 border-t border-neutral-100 p-3">
            {inputError && (
              <p className="text-xs text-red-500 mb-2 px-1">{inputError}</p>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setInputError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask Novi anything…"
                className="flex-1 px-4 py-2.5 bg-neutral-50 rounded-xl text-sm
                           border border-neutral-200 focus:border-purple-300
                           focus:ring-2 focus:ring-purple-100 outline-none
                           placeholder:text-neutral-400 transition-all"
              />
              <button
                onClick={() => handleSend()}
                disabled={!inputValue.trim()}
                className="p-2.5 bg-purple-500 text-white rounded-xl
                           hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all touch-target flex-shrink-0"
                aria-label="Send"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9h12M9 3l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
