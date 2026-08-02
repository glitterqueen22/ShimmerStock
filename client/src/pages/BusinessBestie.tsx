import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost, apiPut } from "../lib/api";
import { Button, Badge, Skeleton, EmptyState, ErrorBanner, FilterBar, ProgressBar, useToast } from "../components/ui";
import Novi from "../components/Novi";

// ── Types ───────────────────────────────────────────────────────────

interface BriefItem {
  engine: string;
  icon: string;
  text: string;
  urgency?: string;
  action?: string;
  milestone?: boolean;
}

interface EngineBreakdown {
  score: number;
  label: string;
  weight: number;
}

interface HealthRecommendation {
  engine: string;
  text: string;
  impact: string;
}

interface HealthScore {
  score: number;
  label: string;
  breakdown: Record<string, EngineBreakdown>;
  recommendations?: HealthRecommendation[];
  trend?: "up" | "down" | "stable";
  lastUpdated?: string;
}

interface GoalProgress {
  title: string;
  target: number;
  current: number;
  unit: string;
  progress: number;
}

interface BusinessContext {
  ageDays: number;
  orderCount: number;
  phase: string;
  phaseText: string;
}

interface OnThisDayItem {
  title: string;
  description: string;
  occurred_at: string;
}

interface BriefData {
  greeting: string;
  personality: string;
  timestamp: string;
  whatHappened: BriefItem[];
  needsAttention: BriefItem[];
  whatToDo: BriefItem[];
  celebrations: BriefItem[];
  healthSummary: HealthScore;
  topOpportunities?: Array<{
    id: string;
    type: string;
    engine: string;
    icon: string;
    title: string;
    description: string;
    impact: string;
    action: string;
    actionLabel: string;
  }>;
  businessContext?: BusinessContext | null;
  onThisDay?: OnThisDayItem[];
  goalProgress?: GoalProgress[];
}

interface QAPair {
  question: string;
  answer: string;
  citedData?: any;
}

interface ExecSummary {
  today: {
    orders: number;
    revenue: number;
    shipments: number;
    issues: string[];
  };
  thisWeek: {
    orders: number;
    revenue: number;
    orderChange: string | null;
    revenueChange: string | null;
  };
  health: HealthScore;
  topAttention: { type: string; message: string; action: string } | null;
  recommendedAction: { type: string; message: string; action: string | null } | null;
}

interface CoachingTip {
  title: string;
  description: string;
  category: string;
}

interface WrappedData {
  year: number;
  totalOrders: number;
  totalRevenue: number;
  totalProductsSold: number;
  topProduct: { name: string; totalSold: number; revenue: number } | null;
  topChannel: { channel: string; orders: number; revenue: number } | null;
  topCustomer: { name: string; orders: number; revenue: number } | null;
  busiestMonth: string | null;
  busiestDay: string | null;
  orderGrowth: string | null;
  revenueGrowth: string | null;
  milestones: Array<{ title: string; description: string; occurred_at: string }>;
  highlights: string[];
}

interface Goal {
  id: number;
  title: string;
  target: number;
  current: number;
  unit: string;
  deadline: string | null;
  status: string;
  progress: number;
}

interface GoalsData {
  goals: Goal[];
}

const PERSONALITIES = [
  { key: "coach", label: "Coach", icon: "🌟", desc: "Supportive and encouraging — pushes you to reach your goals" },
  { key: "executive", label: "Executive", icon: "💼", desc: "Direct and strategic — focuses on the bottom line" },
  { key: "hype_girl", label: "Hype Girl", icon: "🔥", desc: "High energy and celebratory — hypes you up!" },
  { key: "analyst", label: "Analyst", icon: "📊", desc: "Data-driven and thorough — dives deep into the numbers" },
  { key: "ops_manager", label: "Ops Manager", icon: "✅", desc: "Practical and checklist-oriented — keeps you on track" },
];

const ENGINE_ICONS: Record<string, string> = {
  inventory: "📦",
  production: "🏭",
  purchasing: "🛒",
  commerce: "💰",
  operations: "⚙️",
  quality: "✨",
};

const ENGINE_LABELS: Record<string, string> = {
  inventory: "Inventory",
  production: "Production",
  purchasing: "Purchasing",
  commerce: "Commerce",
  operations: "Operations",
  quality: "Quality",
};

function healthColor(score: number): string {
  if (score >= 90) return "text-emerald-500";
  if (score >= 75) return "text-blue-500";
  if (score >= 60) return "text-amber-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

function healthBg(score: number): string {
  if (score >= 90) return "bg-emerald-50 border-emerald-200";
  if (score >= 75) return "bg-blue-50 border-blue-200";
  if (score >= 60) return "bg-amber-50 border-amber-200";
  if (score >= 40) return "bg-orange-50 border-orange-200";
  return "bg-red-50 border-red-200";
}

function healthBarColor(score: number): "green" | "blue" | "orange" | "red" | "purple" {
  if (score >= 90) return "green";
  if (score >= 75) return "blue";
  if (score >= 60) return "orange";
  if (score >= 40) return "orange";
  return "red";
}

function trendIcon(trend?: string): string {
  if (trend === "up") return "↗️";
  if (trend === "down") return "↘️";
  return "➡️";
}

function trendColor(trend?: string): string {
  if (trend === "up") return "text-emerald-500";
  if (trend === "down") return "text-red-400";
  return "text-neutral-400";
}

function unitLabel(unit: string): string {
  const labels: Record<string, string> = {
    orders: "orders",
    revenue: "revenue",
    products: "products",
    customers: "customers",
  };
  return labels[unit] || unit;
}

function formatRevenue(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

// ── Ask Bestie input ────────────────────────────────────────────────

function AskBestie({ onAsk, loading }: { onAsk: (q: string) => void; loading: boolean }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    onAsk(q);
    setInput("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-white rounded-2xl shadow-sm border border-rose-200 p-2 card-lift">
      <span className="pl-2 flex-shrink-0"><Novi expression="calm" size="sm" animated={false} /></span>
      <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)} disabled={loading}
        placeholder="Ask Novi anything..."
        className="flex-1 px-2 py-2 text-sm outline-none bg-transparent text-[#121212] placeholder:text-rose-300 disabled:opacity-50" />
      <Button variant="primary" type="submit" disabled={loading || !input.trim()}>
        {loading ? "..." : "Ask"}
      </Button>
    </form>
  );
}

// ── Goal creation modal ──────────────────────────────────────────────

function CreateGoalModal({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string, target: number, unit: string) => void }) {
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("orders");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !target) return;
    onCreate(title.trim(), parseFloat(target), unit);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-[#121212] mb-4 font-[family-name:var(--font-heading)]">✨ Set a Goal</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">What do you want to achieve?</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. 100 orders this month" className="w-full px-3 py-2 rounded-xl border border-rose-200 text-sm outline-none focus:border-rose-400" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-600 mb-1">Target</label>
              <input type="number" value={target} onChange={e => setTarget(e.target.value)}
                placeholder="100" min="1" className="w-full px-3 py-2 rounded-xl border border-rose-200 text-sm outline-none focus:border-rose-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Unit</label>
              <select value={unit} onChange={e => setUnit(e.target.value)}
                className="px-3 py-2 rounded-xl border border-rose-200 text-sm outline-none focus:border-rose-400 bg-white">
                <option value="orders">Orders</option>
                <option value="revenue">Revenue ($)</option>
                <option value="products">Products</option>
                <option value="customers">Customers</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={!title.trim() || !target}>Create Goal</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function BusinessBestie() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personality, setPersonality] = useState<string>(() => {
    return localStorage.getItem("bestie_personality") || "coach";
  });
  const [askLoading, setAskLoading] = useState(false);
  const [qaHistory, setQaHistory] = useState<QAPair[]>([]);
  const qaEndRef = useRef<HTMLDivElement>(null);

  // P4.7: Additional data
  const [execSummary, setExecSummary] = useState<ExecSummary | null>(null);
  const [coachingTips, setCoachingTips] = useState<CoachingTip[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [wrapped, setWrapped] = useState<WrappedData | null>(null);
  const [showWrapped, setShowWrapped] = useState(false);
  const [showCreateGoal, setShowCreateGoal] = useState(false);

  const fetchBrief = useCallback(async (pers: string) => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiGet<BriefData>(`/api/bestie/brief?personality=${pers}`);
      setData(json);
    } catch (err: any) {
      setError(err.message || "Could not load Novi's brief");
    } finally { setLoading(false); }
  }, []);

  const fetchExtraData = useCallback(async () => {
    try {
      const [summary, coaching, goalsData] = await Promise.all([
        apiGet<ExecSummary>("/api/novi/summary").catch(() => null),
        apiGet<{ tips: CoachingTip[] }>("/api/novi/coaching").catch(() => ({ tips: [] })),
        apiGet<GoalsData>("/api/novi/goals").catch(() => ({ goals: [] })),
      ]);
      if (summary) setExecSummary(summary);
      if (coaching) setCoachingTips(coaching.tips || []);
      if (goalsData) setGoals(goalsData.goals || []);
    } catch {}
  }, []);

  useEffect(() => { fetchBrief(personality); }, [personality, fetchBrief]);
  useEffect(() => { fetchExtraData(); }, [fetchExtraData]);

  const fetchWrapped = useCallback(async () => {
    try {
      const data = await apiGet<WrappedData>("/api/novi/wrapped");
      setWrapped(data);
      setShowWrapped(true);
    } catch {}
  }, []);

  function switchPersonality(pers: string) {
    setPersonality(pers);
    localStorage.setItem("bestie_personality", pers);
  }

  async function handleAsk(question: string) {
    setAskLoading(true);
    try {
      const json = await apiGet<any>(`/api/bestie/ask?q=${encodeURIComponent(question)}`);
      setQaHistory((prev) => [
        ...prev.slice(-9),
        { question, answer: json.answer, citedData: json.citedData },
      ]);
    } catch (err: any) {
      setQaHistory((prev) => [
        ...prev.slice(-9),
        { question, answer: `Sorry, I couldn't answer that: ${err.message}` },
      ]);
    } finally { setAskLoading(false); }
  }

  async function handleCreateGoal(title: string, target: number, unit: string) {
    setShowCreateGoal(false);
    try {
      const newGoal = await apiPost<Goal>("/api/novi/goals", { title, target, unit });
      setGoals(prev => [newGoal, ...prev]);
      toast("Goal created! Novi will track your progress ✨");
    } catch (err: any) {
      toast(err.message || "Failed to create goal");
    }
  }

  async function handleUpdateGoalProgress(goalId: number, newCurrent: number) {
    try {
      const updated = await apiPut<Goal>(`/api/novi/goals/${goalId}`, { current: newCurrent });
      setGoals(prev => prev.map(g => g.id === goalId ? { ...g, ...updated } : g));
      if (updated.status === "completed") {
        toast("🎉 Goal achieved! That's worth celebrating!");
      }
    } catch (err: any) {
      toast(err.message || "Failed to update goal");
    }
  }

  useEffect(() => { qaEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [qaHistory]);

  // ── Loading ──────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Novi expression="calm" size="lg" animated />
          <div>
            <h1 className="text-2xl font-bold text-[#121212] font-[family-name:var(--font-heading)]">Novi</h1>
          </div>
        </div>
        <div className="flex gap-1">
          {PERSONALITIES.map((p) => (
            <div key={p.key} className="px-3 py-1.5 rounded-full text-xs font-medium bg-rose-50 text-rose-300">{p.icon} {p.label}</div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
          <div className="space-y-5">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Novi expression="calm" size="lg" animated />
          <div>
            <h1 className="text-2xl font-bold text-[#121212] font-[family-name:var(--font-heading)]">Novi</h1>
          </div>
        </div>
        <ErrorBanner message={error} onRetry={() => fetchBrief(personality)} />
      </div>
    );
  }

  if (!data) return null;

  const totalAttention = data.needsAttention.length;
  const health = data.healthSummary;

  // Personality filter options
  const personalityFilters = PERSONALITIES.map(p => ({
    id: p.key, label: `${p.icon} ${p.label}`,
  }));

  // Check if wrapped has data
  return (
    <div className="space-y-6">
      {/* ── Header with greeting + personality selector ──────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3">
          <Novi expression="calm" size="lg" animated />
          <div>
            <h1 className="text-2xl font-bold text-[#121212] font-[family-name:var(--font-heading)]">Novi</h1>
            <p className="text-sm text-rose-400 mt-0.5">{data.greeting}</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <FilterBar
            filters={personalityFilters}
            active={[personality]}
            onChange={(ids) => { if (ids.length > 0) switchPersonality(ids[0]); }}
            multiSelect={false}
          />
        </div>
      </div>

      {/* ── P4.7: Business Context Banner ────────────────────────── */}
      {(data.businessContext || (data.onThisDay && data.onThisDay.length > 0)) && (
        <div className="bg-gradient-to-r from-rose-50 via-white to-rose-50 rounded-2xl shadow-sm border border-rose-100 p-4 card-lift">
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">💫</span>
            <div className="space-y-1">
              {data.businessContext && (
                <p className="text-sm text-[#121212]">
                  {data.businessContext.phaseText}{" "}
                  {data.businessContext.orderCount > 0 && (
                    <span>You've processed <strong>{data.businessContext.orderCount}</strong> order(s) so far.</span>
                  )}
                </p>
              )}
              {data.onThisDay && data.onThisDay.length > 0 && data.onThisDay.map((mem, i) => {
                const date = new Date(mem.occurred_at);
                const yearDiff = new Date().getFullYear() - date.getFullYear();
                const timeAgo = yearDiff > 0 ? `${yearDiff} year(s) ago` : "today";
                return (
                  <p key={i} className="text-sm text-rose-500 font-medium">
                    📅 On this day, {timeAgo}: {mem.title} — {mem.description}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT COLUMN (wider) */}
        <div className="lg:col-span-2 space-y-5">
          {/* P4.7: Executive Summary Card ────────────────────────── */}
          {execSummary && (
            <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
              <div className="px-5 py-4 border-b border-rose-100">
                <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">📊 At a Glance</h2>
              </div>
              <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-rose-400 uppercase font-medium">Today</p>
                  <p className="text-2xl font-bold text-[#121212]">{execSummary.today.orders}</p>
                  <p className="text-xs text-neutral-500">{execSummary.today.revenue > 0 ? formatRevenue(execSummary.today.revenue) : "—"} revenue</p>
                </div>
                <div>
                  <p className="text-xs text-rose-400 uppercase font-medium">Shipped</p>
                  <p className="text-2xl font-bold text-[#121212]">{execSummary.today.shipments}</p>
                  <p className="text-xs text-neutral-500">today</p>
                </div>
                <div>
                  <p className="text-xs text-rose-400 uppercase font-medium">This Week</p>
                  <p className="text-2xl font-bold text-[#121212]">{execSummary.thisWeek.orders}</p>
                  <p className="text-xs text-neutral-500">{execSummary.thisWeek.orderChange || "—"} vs last week</p>
                </div>
                <div>
                  <p className="text-xs text-rose-400 uppercase font-medium">Health</p>
                  <p className={`text-2xl font-bold ${healthColor(execSummary.health.score)}`}>{execSummary.health.score}</p>
                  <p className="text-xs text-neutral-500">{execSummary.health.label}</p>
                </div>
              </div>
              {execSummary.topAttention && (
                <div className="px-5 py-3 bg-rose-50 border-t border-rose-100 flex items-center gap-2">
                  <span className="text-sm">⚠️</span>
                  <p className="text-sm text-[#121212] flex-1">{execSummary.topAttention.message}</p>
                  {execSummary.topAttention.action && (
                    <Button variant="ghost" size="sm" onClick={() => navigate(execSummary.topAttention!.action)}>
                      View →
                    </Button>
                  )}
                </div>
              )}
              {execSummary.recommendedAction && (
                <div className="px-5 py-3 bg-emerald-50 border-t border-rose-100 flex items-center gap-2">
                  <span className="text-sm">💡</span>
                  <p className="text-sm text-[#121212] flex-1">{execSummary.recommendedAction.message}</p>
                  {execSummary.recommendedAction.action && (
                    <Button variant="ghost" size="sm" onClick={() => navigate(execSummary.recommendedAction!.action!)}>
                      Go →
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* What Happened */}
          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
            <div className="px-5 py-4 border-b border-rose-100">
              <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">📋 What Happened</h2>
            </div>
            {data.whatHappened.length === 0 ? (
              <EmptyState icon="✨" title="No activity yet today" description="Activity will appear here as you use ShimmerStock." />
            ) : (
              <div className="divide-y divide-rose-50 max-h-[400px] overflow-y-auto">
                {data.whatHappened.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-rose-50/50 transition-all duration-300">
                    <span className="text-lg flex-shrink-0 mt-0.5">{item.icon}</span>
                    <p className="text-sm text-[#121212] flex-1">{item.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* What Needs Attention */}
          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
            <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">⚠️ What Needs Attention</h2>
              {totalAttention > 0 && (
                <Badge status="danger">{totalAttention}</Badge>
              )}
            </div>
            {totalAttention === 0 ? (
              <EmptyState icon="✨" title="Everything looks good!" description="No urgent items right now" />
            ) : (
              <div className="divide-y divide-rose-50 max-h-[400px] overflow-y-auto">
                {data.needsAttention.map((item, i) => (
                  <div key={i}
                    className={`flex items-start gap-3 px-5 py-3 transition-all duration-300 ${
                      item.urgency === "critical" || item.urgency === "high" ? "bg-red-50 border-red-200" :
                      item.urgency === "medium" ? "bg-amber-50 border-amber-200" :
                      "bg-white"
                    }`}>
                    <span className="text-lg flex-shrink-0 mt-0.5">
                      {item.urgency === "critical" || item.urgency === "high" ? "🔴" : item.icon}
                    </span>
                    <p className="text-sm text-[#121212] flex-1">{item.text}</p>
                    {item.urgency && (
                      <Badge urgency={item.urgency}>{item.urgency}</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">
          {/* Health Score Card */}
          <div className={`rounded-2xl shadow-sm border p-5 card-lift ${healthBg(health.score)}`}>
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 text-rose-400">❤️ Business Health</h2>
            <div className="flex items-center gap-3 mb-1">
              <span className={`text-4xl font-bold ${healthColor(health.score)}`}>{health.score}</span>
              <div>
                <span className="text-sm font-medium text-[#121212] block">/100 — {health.label}</span>
                {health.trend && (
                  <span className={`text-xs font-medium ${trendColor(health.trend)}`}>
                    {trendIcon(health.trend)} {health.trend === "up" ? "Trending up" : health.trend === "down" ? "Trending down" : "Stable"}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-2 mt-3">
              {Object.entries(health.breakdown).map(([engine, eng]) => (
                <div key={engine}>
                  <ProgressBar
                    value={eng.score}
                    color={healthBarColor(eng.score)}
                    size="sm"
                    label={`${ENGINE_ICONS[engine] || "📊"} ${ENGINE_LABELS[engine] || engine}`}
                    showPercentage
                  />
                </div>
              ))}
            </div>
            {health.recommendations && health.recommendations.length > 0 && (
              <div className="mt-4 pt-3 border-t border-rose-100">
                <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">💡 Recommendations</p>
                <ul className="space-y-1.5">
                  {health.recommendations.slice(0, 3).map((rec, i) => (
                    <li key={i} className="text-xs text-[#121212] flex items-start gap-1.5">
                      <span className={`flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                        rec.impact === "high" ? "bg-red-400" : rec.impact === "medium" ? "bg-amber-400" : "bg-blue-400"
                      }`} />
                      {rec.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* P4.7: Goal Tracking */}
          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
            <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">🎯 Goals</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateGoal(true)}>+ New</Button>
            </div>
            {goals.length === 0 ? (
              <div className="p-5 text-center">
                <p className="text-sm text-rose-300 mb-3">No goals yet. Let Novi help you stay on track!</p>
                <Button variant="primary" size="sm" onClick={() => setShowCreateGoal(true)}>Set Your First Goal</Button>
              </div>
            ) : (
              <div className="divide-y divide-rose-50 max-h-[300px] overflow-y-auto">
                {goals.filter(g => g.status === "active").map((goal) => (
                  <div key={goal.id} className="px-5 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-[#121212]">{goal.title}</p>
                      <span className="text-xs font-bold text-rose-400">{goal.progress}%</span>
                    </div>
                    <ProgressBar value={goal.progress} color={goal.progress >= 100 ? "green" : "blue"} size="sm" showPercentage={false} />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-neutral-500">{goal.current} / {goal.target} {unitLabel(goal.unit)}</p>
                      <button
                        onClick={() => handleUpdateGoalProgress(goal.id, Math.min(goal.current + 1, goal.target))}
                        className="text-xs text-rose-500 hover:text-rose-700 font-medium transition-colors"
                        title="Increment progress">
                        +1
                      </button>
                    </div>
                  </div>
                ))}
                {goals.filter(g => g.status === "completed").slice(0, 3).map((goal) => (
                  <div key={goal.id} className="px-5 py-3">
                    <p className="text-sm text-emerald-600 flex items-center gap-2">
                      <span>✅</span>
                      <span className="line-through">{goal.title}</span>
                      <span className="text-xs text-emerald-400">Done!</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* P4.7: From Novi — Coaching Tips */}
          {coachingTips.length > 0 && (
            <div className="bg-gradient-to-br from-purple-50 to-rose-50 rounded-2xl shadow-sm border border-rose-100 p-5 card-lift">
              <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider mb-3">💡 From Novi</h2>
              <div className="space-y-3">
                {coachingTips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">
                      {tip.category === "growth" ? "📈" : tip.category === "operations" ? "⚙️" : tip.category === "goals" ? "🎯" : tip.category === "inventory" ? "📦" : tip.category === "leadership" ? "👥" : tip.category === "encouragement" ? "💪" : "✨"}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#121212]">{tip.title}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">{tip.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What To Do */}
          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
            <div className="px-5 py-4 border-b border-rose-100">
              <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">✅ What To Do</h2>
            </div>
            {data.whatToDo.length === 0 ? (
              <EmptyState icon="🎉" title="Nothing urgent — great job!" description="" />
            ) : (
              <div className="divide-y divide-rose-50 max-h-[360px] overflow-y-auto">
                {data.whatToDo.map((item, i) => (
                  <button key={i} onClick={() => item.action && navigate(item.action)}
                    className="w-full flex items-start gap-3 px-5 py-3 hover:bg-rose-50/50 transition-all duration-300 text-left group">
                    <span className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-100 text-rose-600 text-xs font-bold">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#121212] group-hover:text-rose-600 transition-colors line-clamp-2">{item.text}</p>
                      {item.action && <p className="text-xs text-rose-400 mt-0.5">Tap to go →</p>}
                    </div>
                    <span className="flex-shrink-0 text-lg">{item.icon}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Celebrations */}
          {data.celebrations.length > 0 && (
            <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-2xl shadow-sm border border-rose-200 p-5 card-lift">
              <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider mb-3">🎉 Celebrations</h2>
              {data.celebrations.map((item, i) => (
                <p key={i} className="text-sm text-rose-600 font-medium">
                  {item.text}{item.milestone && <span className="ml-1">🏆</span>}
                </p>
              ))}
            </div>
          )}

          {/* P4.7: Business Wrapped Button */}
          <div className="text-center">
            <button
              onClick={fetchWrapped}
              className="inline-flex items-center gap-2 text-xs font-medium text-rose-400 hover:text-rose-600 transition-colors">
              <span>🎁</span> {wrapped ? "Refresh Business Wrapped" : "See Your Business Wrapped"}
            </button>
          </div>
        </div>
      </div>

      {/* ── P4.7: Business Wrapped Modal ──────────────────────────── */}
      {showWrapped && wrapped && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowWrapped(false)}>
          <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <Novi expression="celebrating" size="lg" animated />
              <h2 className="text-xl font-bold text-[#121212] mt-3 font-[family-name:var(--font-heading)]">Your {wrapped.year} Wrapped 🎁</h2>
              <p className="text-sm text-rose-400 mt-1">A look back at what you've built</p>
            </div>

            {wrapped.totalOrders === 0 ? (
              <EmptyState icon="✨" title="No data for {wrapped.year} yet" description="Your journey is just beginning." />
            ) : (
              <div className="space-y-5">
                {/* Key stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center bg-rose-50 rounded-xl p-3">
                    <p className="text-2xl font-bold text-rose-500">{wrapped.totalOrders}</p>
                    <p className="text-xs text-rose-400 mt-1">Orders</p>
                  </div>
                  <div className="text-center bg-emerald-50 rounded-xl p-3">
                    <p className="text-2xl font-bold text-emerald-500">{formatRevenue(wrapped.totalRevenue)}</p>
                    <p className="text-xs text-emerald-500 mt-1">Revenue</p>
                  </div>
                  <div className="text-center bg-purple-50 rounded-xl p-3">
                    <p className="text-2xl font-bold text-purple-500">{wrapped.totalProductsSold}</p>
                    <p className="text-xs text-purple-500 mt-1">Products</p>
                  </div>
                </div>

                {/* Growth */}
                {(wrapped.orderGrowth || wrapped.revenueGrowth) && (
                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-blue-600">
                      {wrapped.revenueGrowth && <span>Revenue: <strong>{wrapped.revenueGrowth}</strong> vs last year. </span>}
                      {wrapped.orderGrowth && <span>Orders: <strong>{wrapped.orderGrowth}</strong> vs last year.</span>}
                    </p>
                  </div>
                )}

                {/* Top performers */}
                {wrapped.topProduct && (
                  <div className="flex items-start gap-3">
                    <span className="text-xl">⭐</span>
                    <div>
                      <p className="text-sm font-semibold text-[#121212]">Top Product</p>
                      <p className="text-sm text-neutral-600">{wrapped.topProduct.name} — {wrapped.topProduct.totalSold} sold (${wrapped.topProduct.revenue?.toFixed(2) || '0.00'})</p>
                    </div>
                  </div>
                )}
                {wrapped.topChannel && (
                  <div className="flex items-start gap-3">
                    <span className="text-xl">🏪</span>
                    <div>
                      <p className="text-sm font-semibold text-[#121212]">Top Channel</p>
                      <p className="text-sm text-neutral-600">{wrapped.topChannel.channel} — {wrapped.topChannel.orders} orders (${wrapped.topChannel.revenue?.toFixed(2) || '0.00'})</p>
                    </div>
                  </div>
                )}
                {wrapped.topCustomer && (
                  <div className="flex items-start gap-3">
                    <span className="text-xl">💖</span>
                    <div>
                      <p className="text-sm font-semibold text-[#121212]">Top Customer</p>
                      <p className="text-sm text-neutral-600">{wrapped.topCustomer.name} — {wrapped.topCustomer.orders} orders</p>
                    </div>
                  </div>
                )}
                {wrapped.busiestMonth && (
                  <div className="flex items-start gap-3">
                    <span className="text-xl">📅</span>
                    <div>
                      <p className="text-sm font-semibold text-[#121212]">Busiest Month</p>
                      <p className="text-sm text-neutral-600">{wrapped.busiestMonth}{wrapped.busiestDay ? ` (busiest day: ${wrapped.busiestDay})` : ""}</p>
                    </div>
                  </div>
                )}

                {/* Highlights */}
                {wrapped.highlights.length > 0 && (
                  <div className="bg-rose-50 rounded-xl p-4">
                    <p className="text-sm font-semibold text-rose-600 mb-2">You should be proud...</p>
                    {wrapped.highlights.map((h, i) => (
                      <p key={i} className="text-sm text-rose-500 mt-1">{h}</p>
                    ))}
                  </div>
                )}

                {/* Milestones */}
                {wrapped.milestones.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-[#121212] mb-2">🏆 Milestones</p>
                    {wrapped.milestones.map((m, i) => (
                      <p key={i} className="text-sm text-neutral-600">
                        <span className="text-xs text-rose-400">{new Date(m.occurred_at).toLocaleDateString()}</span> — {m.title}: {m.description}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 text-center">
              <Button variant="secondary" onClick={() => setShowWrapped(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Goal Creation Modal ────────────────────────────────────── */}
      {showCreateGoal && (
        <CreateGoalModal
          onClose={() => setShowCreateGoal(false)}
          onCreate={handleCreateGoal}
        />
      )}

      {/* ── Ask Bestie QA Section ────────────────────────────────── */}
      <div className="space-y-4">
        {qaHistory.length > 0 && (
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {qaHistory.map((qa, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-start gap-2 justify-end">
                  <div className="bg-rose-100 text-[#121212] rounded-2xl rounded-br-md px-4 py-2 max-w-[80%]">
                    <p className="text-sm">{qa.question}</p>
                  </div>
                  <span className="text-lg flex-shrink-0">👤</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 mt-1"><Novi expression="calm" size="sm" animated={false} /></span>
                  <div className="bg-white border border-rose-100 rounded-2xl rounded-bl-md px-4 py-2 max-w-[85%] shadow-sm">
                    <p className="text-sm text-[#121212] whitespace-pre-wrap">{qa.answer}</p>
                    {qa.citedData && qa.citedData.source && (
                      <p className="text-[10px] text-rose-400 mt-1.5 italic">Source: {qa.citedData.source} engine</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={qaEndRef} />
          </div>
        )}

        {qaHistory.length === 0 && (
          <div className="text-center py-2">
            <p className="text-xs text-rose-300">Try asking: "How's my business doing?" or "What needs reordering?"</p>
          </div>
        )}

        <AskBestie onAsk={handleAsk} loading={askLoading} />
      </div>
    </div>
  );
}
