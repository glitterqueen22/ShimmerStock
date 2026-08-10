import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPut } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { PageHeader, Skeleton, ErrorBanner, Badge } from "../components/ui";
import Novi from "../components/Novi";
import { NoviHomepageAppearance } from "../components/novi/NoviArtwork";
import FirstDayChecklist from "../components/FirstDayChecklist";
import { useTerms } from "../context/IndustryContext";

// ── Types ───────────────────────────────────────────────────────────

interface EngineBadge {
  name: string;
  icon: string;
  label: string;
  color: string;
}

interface AuditEvent {
  id: number;
  engine: EngineBadge;
  description: string;
  timeAgo: string;
  actionType: string;
}

interface TodayStats {
  orders: number;
  production: number;
  scans: number;
  purchases: number;
}

interface LowStockItem {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  stock_count: number;
}

interface PendingBatch {
  id: number;
  bom_name: string;
  output_product_name: string;
  output_product_sku: string;
  output_quantity: number;
  output_unit: string;
  batch_size: number;
  status: string;
  created_at: string;
}

interface OverduePO {
  id: number;
  supplier_name: string;
  expected_delivery: string;
  item_count: number;
  status: string;
}

interface UnfulfilledOrder {
  id: number;
  order_number: number;
  customer_name: string;
  status: string;
  created_at: string;
  item_count: number;
  total_qty: number;
  scanned_items: number;
}

interface Recommendation {
  action: string;
  reason: string;
  engine: string;
  link: string;
  source: string;
}

interface Opportunity {
  title: string;
  impact: string;
  explanation: string;
  engine: string;
}

interface CommandException {
  key: string;
  count: number;
  title: string;
  detail: string;
  link: string;
  tone: "pink" | "purple" | "green" | "amber" | "red";
}

interface NoviMission {
  id: string;
  title: string;
  detail: string;
  link: string;
}

interface HQData {
  whatHappened: {
    recentActivity: AuditEvent[];
    todayStats: TodayStats;
  };
  needsAttention: {
    lowStock: LowStockItem[];
    pendingBatches: PendingBatch[];
    overduePOs: OverduePO[];
    unfulfilledOrders: UnfulfilledOrder[];
  };
  whatToDoNext: Recommendation[];
  opportunities: Opportunity[];
  commandCenter: {
    brief: {
      ordersToday: number;
      readyToPack: number;
      productionWaiting: number;
      lowStock: number;
      oldestCustomerWaitHours: number;
      message: string;
    };
    exceptions: CommandException[];
    missions: NoviMission[];
    preferences: {
      preferred_workflow: string | null;
      production_priority: string;
      packing_preference: string | null;
      updated_at: string | null;
    };
  };
}

// ── Time ago helper ─────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;

  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Urgency helpers ─────────────────────────────────────────────────

// ── Page Component ──────────────────────────────────────────────────

export default function HQ() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const terms = useTerms();
  const [data, setData] = useState<HQData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingMemory, setSavingMemory] = useState(false);

  useEffect(() => {
    fetchHQ();
  }, []);

  async function fetchHQ() {
    setLoading(true);
    setError(null);
    try {
      const json = await apiGet<HQData>("/api/hq/summary");
      setData(json);
    } catch (err: any) {
      setError(err.message || "Could not load HQ data");
    } finally {
      setLoading(false);
    }
  }

  async function updateNoviMemory(field: "preferred_workflow" | "production_priority", value: string) {
    if (!data) return;
    const nextPreferences = { ...data.commandCenter.preferences, [field]: value };
    setSavingMemory(true);
    setError(null);
    try {
      await apiPut("/api/hq/novi-preferences", {
        preferredWorkflow: nextPreferences.preferred_workflow,
        productionPriority: nextPreferences.production_priority,
        packingPreference: nextPreferences.packing_preference,
      });
      setData({ ...data, commandCenter: { ...data.commandCenter, preferences: nextPreferences } });
    } catch (err: any) {
      setError(err.message || "Could not save Novi preferences");
    } finally {
      setSavingMemory(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="HQ Dashboard" description="Your business at a glance" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} variant="card" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[1,2,3,4].map(i => <Skeleton key={i} variant="card" className="h-48" />)}
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="HQ Dashboard" description="Your business at a glance" />
        <ErrorBanner message={error || "Failed to load HQ"} onRetry={fetchHQ} />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  const totalAttention =
    data.needsAttention.lowStock.length +
    data.needsAttention.pendingBatches.length +
    data.needsAttention.overduePOs.length +
    data.needsAttention.unfulfilledOrders.length +
    data.commandCenter.exceptions
      .filter((exception) => exception.key === "identifiers")
      .reduce((total, exception) => total + exception.count, 0);
  const noviExpression = data.commandCenter.exceptions.length > 1 ? "protective" as const
    : data.commandCenter.exceptions.length ? "thinking" as const : "cozy" as const;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader title="Command Center" description={`Your ${terms.products.toLowerCase()} operations at a glance`} />
        {totalAttention > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-semibold rounded-full border border-red-200">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {totalAttention} need{totalAttention !== 1 ? "" : "s"} attention
          </span>
        )}
      </div>

      {/* ── SECTION 1: NOVI MORNING BRIEF ─────────────────────── */}
      <section aria-label="Novi Morning Brief" className="hq-reveal" style={{ animationDelay: "40ms" }}>
        <div className="rounded-2xl border border-pink-200 bg-gradient-to-br from-pink-50 via-white to-violet-50 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-pink-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-pink-600 uppercase tracking-widest">Novi Morning Brief</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-neutral-600 border border-pink-200">Live workspace</span>
            </div>
            <button onClick={() => navigate("/novi")} className="text-xs font-medium text-violet-500 hover:text-violet-700 transition-colors">
              Novi history →
            </button>
          </div>
          <NoviHomepageAppearance expression={noviExpression} className="p-5">
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-neutral-900 mb-3">
                {data.commandCenter.brief.message}
              </p>
              {data.commandCenter.exceptions.length ? (
                <div className="space-y-2.5">
                  {data.commandCenter.exceptions.map((exception) => (
                    <NoviExceptionCard key={exception.key} exception={exception} onNavigate={navigate} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-semibold text-emerald-900">No operational exceptions right now.</p>
                  <p className="text-xs text-emerald-700 mt-1">Novi checked orders, fulfillment, production, tracked inventory, customer wait time, and catalog identifiers.</p>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4" aria-label="Morning brief facts">
                {[
                  ["Orders today", data.commandCenter.brief.ordersToday],
                  ["Ready to pack", data.commandCenter.brief.readyToPack],
                  ["Production waiting", data.commandCenter.brief.productionWaiting],
                  ["Low stock", data.commandCenter.brief.lowStock],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                    <p className="text-lg font-bold text-neutral-900">{value}</p>
                    <p className="text-[11px] text-neutral-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>
            </NoviHomepageAppearance>
        </div>
      </section>

      <section aria-label="Novi Missions" className="hq-reveal" style={{ animationDelay: "110ms" }}>
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Novi Missions</h2>
            <p className="text-sm text-neutral-500 mt-1">Choose an outcome. Novi will hand you off to the module where you can review and approve the work.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.commandCenter.missions.map((mission) => (
            <button key={mission.id} onClick={() => navigate(mission.link)}
              className="text-left p-4 rounded-xl border border-neutral-200 bg-white hover:border-pink-300 hover:shadow-sm transition-all group">
              <span className="text-[10px] font-bold uppercase text-pink-600">Preview mission</span>
              <p className="text-sm font-semibold text-neutral-900 mt-1 group-hover:text-pink-700">{mission.title}</p>
              <p className="text-xs text-neutral-500 mt-1">{mission.detail}</p>
            </button>
          ))}
        </div>
      </section>

      {(user?.role === "owner" || user?.role === "admin" || user?.business_role === "owner" || user?.business_role === "admin") && (
        <section aria-label="What Novi remembers" className="border-y border-neutral-200 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-4 lg:items-end">
            <div>
              <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">What Novi remembers</h2>
              <p className="text-sm text-neutral-500 mt-1">These preferences belong only to this business and guide how Novi sorts work. They never approve or execute changes.</p>
            </div>
            <label className="text-xs font-semibold text-neutral-600">
              Default workflow
              <select value={data.commandCenter.preferences.preferred_workflow || "exceptions_first"}
                disabled={savingMemory}
                onChange={(event) => updateNoviMemory("preferred_workflow", event.target.value)}
                className="block mt-1 min-w-48 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900">
                <option value="exceptions_first">Exceptions first</option>
                <option value="orders_first">Orders first</option>
                <option value="production_first">Production first</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-neutral-600">
              Production priority
              <select value={data.commandCenter.preferences.production_priority}
                disabled={savingMemory}
                onChange={(event) => updateNoviMemory("production_priority", event.target.value)}
                className="block mt-1 min-w-48 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900">
                <option value="oldest_orders_first">Oldest orders first</option>
                <option value="shortages_first">Shortages first</option>
                <option value="best_sellers_first">Best sellers first</option>
              </select>
            </label>
          </div>
        </section>
      )}

      {/* ── SECTION 2: FIRST DAY CHECKLIST ───────────────────── */}
      <FirstDayChecklist
        businessId={user?.business_id}
        userId={user?.id}
      />

      {/* ── SECTION 3: TODAY ────────────────────────────────────── */}
      <section aria-label="Today's queues" className="hq-reveal" style={{ animationDelay: "180ms" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Today</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <TodayCard icon="📋" label={terms.order + 's'} count={data.whatHappened.todayStats.orders}
            attention={data.needsAttention.unfulfilledOrders.length} link="/orders" onNavigate={navigate} />
          <TodayCard icon="📦" label={terms.inventory} count={data.needsAttention.lowStock.length}
            attention={data.needsAttention.lowStock.filter(i => i.stock_count === 0).length} link="/products" onNavigate={navigate} />
          <TodayCard icon="🛒" label={terms.purchasing} count={data.whatHappened.todayStats.purchases}
            attention={data.needsAttention.overduePOs.length} link="/purchasing" onNavigate={navigate} />
          <TodayCard icon="🏭" label={terms.production} count={data.whatHappened.todayStats.production}
            attention={data.needsAttention.pendingBatches.length} link="/production" onNavigate={navigate} />
          <TodayCard icon="🚚" label={terms.fulfillment} count={data.needsAttention.unfulfilledOrders.length}
            attention={0} link="/fulfillment" onNavigate={navigate} />
          <TodayCard icon="💬" label="Customer Care" count={0}
            attention={0} link="/customers" onNavigate={navigate} />
        </div>
      </section>

      {/* ── SECTION 3: WHAT CHANGED + SNAPSHOT ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 hq-reveal" style={{ animationDelay: "250ms" }}>
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-100 flex items-center justify-between">
            <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">What Changed</h2>
            <button onClick={() => navigate("/timeline")} className="text-xs font-medium text-violet-500 hover:text-violet-700 transition-colors">
              Full timeline →
            </button>
          </div>
          {data.whatHappened.recentActivity.length === 0 ? (
            <div className="p-8 text-center">
              <Novi expression="curious" size="sm" />
              <p className="text-neutral-400 text-sm mt-3">Nothing yet — your first actions will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-50 max-h-72 overflow-y-auto">
              {data.whatHappened.recentActivity.map((event) => (
                <div key={event.id} className="flex items-start gap-3 px-5 py-3 hover:bg-neutral-50 transition-colors">
                  <span className="text-base flex-shrink-0 mt-0.5">{event.engine?.icon || "🔧"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-800 truncate">{event.description}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">{timeAgo(event.timeAgo)}</p>
                  </div>
                  <Badge engine={event.engine?.name || "system"}>{event.engine?.label || "System"}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-100">
            <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Business Snapshot</h2>
          </div>
          <div className="p-5 space-y-3">
            <SnapshotRow icon="📋" label="Orders today" value={String(data.whatHappened.todayStats.orders)} />
            <SnapshotRow icon="📦" label="Low-stock SKUs" value={String(data.needsAttention.lowStock.length)} alert={data.needsAttention.lowStock.length > 0} />
            <SnapshotRow icon="🛒" label="Pending POs" value={String(data.whatHappened.todayStats.purchases)} />
            <SnapshotRow icon="🏭" label="Production drafts" value={String(data.needsAttention.pendingBatches.length)} />
            <SnapshotRow icon="🚚" label="Unfulfilled orders" value={String(data.needsAttention.unfulfilledOrders.length)} alert={data.needsAttention.unfulfilledOrders.length > 0} />
            <SnapshotRow icon="📷" label="Scans today" value={String(data.whatHappened.todayStats.scans)} />
          </div>
        </div>
      </div>

      {/* ── SECTION 4: NEXT BEST ACTIONS ────────────────────────── */}
      {(data.whatToDoNext.length > 0 || data.opportunities.length > 0) && (
        <section aria-label="Next best actions" className="hq-reveal" style={{ animationDelay: "320ms" }}>
          <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">Next Best Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.whatToDoNext.slice(0, 3).map((rec, i) => (
              <button key={i} onClick={() => navigate(rec.link)}
                className="text-left p-4 rounded-2xl border border-neutral-100 bg-white hover:border-violet-200 hover:shadow-md transition-all group">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 group-hover:text-violet-700 transition-colors">{rec.action}</p>
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{rec.reason}</p>
                  </div>
                </div>
              </button>
            ))}
            {data.opportunities.slice(0, 3).map((opp, i) => (
              <button key={`opp-${i}`} onClick={() => navigate("/opportunities")}
                className="text-left p-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 hover:border-emerald-300 hover:shadow-md transition-all group">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm">💡</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 group-hover:text-emerald-700 transition-colors">{opp.title}</p>
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{opp.explanation}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function NoviExceptionCard({ exception, onNavigate }: { exception: CommandException; onNavigate: (path: string) => void }) {
  const colors = {
    pink: "bg-pink-50 border-pink-200",
    purple: "bg-violet-50 border-violet-200",
    green: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
    red: "bg-red-50 border-red-200",
  }[exception.tone];
  return (
    <div className={`rounded-xl border ${colors} p-3`}>
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-white border border-current/10 flex items-center justify-center text-xs font-bold">{exception.count}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-900 leading-tight">{exception.title}</p>
          <p className="text-xs text-neutral-600 mt-1">{exception.detail}</p>
        </div>
        <button onClick={() => onNavigate(exception.link)} className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-pink-700 transition-colors">Review</button>
      </div>
    </div>
  );
}

function TodayCard({ icon, label, count, attention, link, onNavigate }: {
  icon: string; label: string; count: number; attention: number; link: string; onNavigate: (p: string) => void;
}) {
  return (
    <button onClick={() => onNavigate(link)}
      className={`relative flex flex-col items-start p-4 rounded-2xl border transition-all hover:shadow-md hover:-translate-y-0.5 text-left w-full
        ${attention > 0 ? "bg-red-50 border-red-200" : "bg-white border-neutral-100"}`}>
      {attention > 0 && (
        <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
          {attention}
        </span>
      )}
      <span className="text-xl mb-1" aria-hidden>{icon}</span>
      <p className="text-lg font-bold text-neutral-900">{count}</p>
      <p className="text-xs text-neutral-500 font-medium">{label}</p>
    </button>
  );
}

function SnapshotRow({ icon, label, value, alert }: { icon: string; label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs text-neutral-500"><span aria-hidden>{icon}</span>{label}</span>
      <span className={`text-sm font-semibold ${alert ? "text-red-600" : "text-neutral-900"}`}>{value}</span>
    </div>
  );
}
