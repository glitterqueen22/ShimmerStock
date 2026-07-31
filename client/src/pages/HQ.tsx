import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api";
import { PageHeader, Skeleton, ErrorBanner, Badge, Button } from "../components/ui";

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

function getUrgency(stockCount: number): { level: "now" | "soon" | "ok"; color: string; bg: string } {
  if (stockCount === 0) return { level: "now", color: "text-red-600", bg: "bg-red-50 border-red-200" };
  if (stockCount <= 2) return { level: "now", color: "text-red-600", bg: "bg-red-50 border-red-200" };
  if (stockCount <= 5) return { level: "soon", color: "text-amber-600", bg: "bg-amber-50 border-amber-200" };
  return { level: "ok", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" };
}

// ── Page Component ──────────────────────────────────────────────────

export default function HQ() {
  const navigate = useNavigate();
  const [data, setData] = useState<HQData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    data.needsAttention.unfulfilledOrders.length;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <PageHeader title="HQ Dashboard" description="Your business at a glance" />
        {totalAttention > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 text-xs font-semibold rounded-full border border-red-200 mt-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {totalAttention} need{totalAttention !== 1 ? "" : "s"} attention
          </span>
        )}
      </div>

      {/* ── Quick Stats Row ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-rose-100 p-4">
          <p className="text-xs font-medium text-rose-400 uppercase tracking-wide">📋 Orders today</p>
          <p className="text-3xl font-bold text-neutral-900 mt-1">{data.whatHappened.todayStats.orders}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-rose-100 p-4">
          <p className="text-xs font-medium text-rose-400 uppercase tracking-wide">🏭 Production</p>
          <p className="text-3xl font-bold text-neutral-900 mt-1">{data.whatHappened.todayStats.production}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-rose-100 p-4">
          <p className="text-xs font-medium text-rose-400 uppercase tracking-wide">📷 Scans</p>
          <p className="text-3xl font-bold text-neutral-900 mt-1">{data.whatHappened.todayStats.scans}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-rose-100 p-4">
          <p className="text-xs font-medium text-rose-400 uppercase tracking-wide">📦 POs</p>
          <p className="text-3xl font-bold text-neutral-900 mt-1">{data.whatHappened.todayStats.purchases}</p>
        </div>
      </div>

      {/* ── Four-Question Grid ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. What Happened */}
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">
              📋 What Happened
            </h2>
            <button
              onClick={() => navigate("/timeline")}
              className="text-xs font-medium text-rose-500 hover:text-rose-600 transition-all duration-300"
            >
              Full timeline →
            </button>
          </div>
          {data.whatHappened.recentActivity.length === 0 ? (
            <div className="p-8 text-center">
              <span className="text-3xl block mb-2">✨</span>
              <p className="text-rose-300 text-sm">No recent activity yet</p>
            </div>
          ) : (
            <div className="divide-y divide-rose-50 max-h-[360px] overflow-y-auto">
              {data.whatHappened.recentActivity.map((event) => {
                const engineName = event.engine?.name || "system";
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 px-5 py-3 hover:bg-rose-50/50 transition-all duration-300"
                  >
                    <span className="text-lg flex-shrink-0 mt-0.5">{event.engine?.icon || "🔧"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-neutral-900 truncate">{event.description}</p>
                      <p className="text-xs text-rose-400 mt-0.5">{timeAgo(event.timeAgo)}</p>
                    </div>
                    <Badge engine={engineName}>{event.engine?.label || "System"}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. What Needs Attention */}
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="px-5 py-4 border-b border-rose-100">
            <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">
              ⚠️ What Needs Attention
            </h2>
          </div>
          {totalAttention === 0 ? (
            <div className="p-8 text-center">
              <span className="text-4xl block mb-3">✨</span>
              <p className="text-emerald-700 font-semibold text-base">
                Everything looks good!
              </p>
              <p className="text-rose-300 text-sm mt-1">No urgent items right now</p>
            </div>
          ) : (
            <div className="divide-y divide-rose-50 max-h-[360px] overflow-y-auto">
              {/* Low Stock — red urgency */}
              {data.needsAttention.lowStock.map((item) => {
                const urgency = getUrgency(item.stock_count);
                return (
                  <button
                    key={`stock-${item.id}`}
                    onClick={() => navigate("/products")}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-rose-50/50 transition-all duration-300 text-left"
                  >
                    <span
                      className={`flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-white text-sm font-bold ${item.stock_count === 0 ? "bg-red-500" : "bg-amber-500"}`}
                    >
                      {item.stock_count}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate">{item.name}</p>
                      <p className="text-xs text-rose-400">{item.sku} · low stock</p>
                    </div>
                    <Badge urgency="now">🔴 now</Badge>
                  </button>
                );
              })}

              {/* Pending Batches */}
              {data.needsAttention.pendingBatches.map((batch) => (
                <button
                  key={`batch-${batch.id}`}
                  onClick={() => navigate("/production")}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-rose-50/50 transition-all duration-300 text-left"
                >
                  <span className="flex-shrink-0 text-xl">🏭</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{batch.bom_name}</p>
                    <p className="text-xs text-rose-400">
                      Draft · {batch.output_quantity} {batch.output_unit || "units"} per run
                    </p>
                  </div>
                  <Badge engine="production">{batch.status}</Badge>
                </button>
              ))}

              {/* Overdue POs */}
              {data.needsAttention.overduePOs.map((po) => (
                <button
                  key={`po-${po.id}`}
                  onClick={() => navigate("/purchasing")}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-rose-50/50 transition-all duration-300 text-left"
                >
                  <span className="flex-shrink-0 text-xl">📦</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">
                      PO #{po.id} · {po.supplier_name}
                    </p>
                    <p className="text-xs text-rose-400">
                      Overdue · expected {po.expected_delivery}
                    </p>
                  </div>
                  <Badge urgency="now">🔴 overdue</Badge>
                </button>
              ))}

              {/* Unfulfilled Orders */}
              {data.needsAttention.unfulfilledOrders.map((order) => (
                <button
                  key={`order-${order.id}`}
                  onClick={() => navigate("/orders")}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-rose-50/50 transition-all duration-300 text-left"
                >
                  <span className="flex-shrink-0 text-xl">📋</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">
                      {order.order_number ? `Order #${order.order_number}` : `Order #${order.id}`}
                    </p>
                    <p className="text-xs text-rose-400">
                      {order.customer_name || "Customer"} · {order.item_count} items · {order.scanned_items}/{order.item_count} scanned
                    </p>
                  </div>
                  <Badge engine="commerce">pending</Badge>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. What To Do Next */}
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="px-5 py-4 border-b border-rose-100">
            <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">
              ✅ What To Do Next
            </h2>
          </div>
          {data.whatToDoNext.length === 0 ? (
            <div className="p-8 text-center">
              <span className="text-4xl block mb-3">🎉</span>
              <p className="text-emerald-700 font-semibold text-base">
                No pending actions — great job!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-rose-50">
              {data.whatToDoNext.map((rec, i) => {
                return (
                  <button
                    key={i}
                    onClick={() => navigate(rec.link)}
                    className="w-full flex items-start gap-3 px-5 py-4 hover:bg-rose-50/50 transition-all duration-300 text-left group"
                  >
                    <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-rose-100 text-rose-600 text-sm font-bold">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 group-hover:text-rose-600 transition-colors">
                        {rec.action}
                      </p>
                      <p className="text-xs text-rose-400 mt-0.5 line-clamp-2">{rec.reason}</p>
                    </div>
                    <Badge engine={rec.engine}>{rec.engine}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. Opportunities */}
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="px-5 py-4 border-b border-rose-100">
            <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">
              💡 Opportunities
            </h2>
          </div>
          {data.opportunities.length === 0 ? (
            <div className="p-8 text-center">
              <span className="text-4xl block mb-3">🌱</span>
              <p className="text-rose-300 text-sm">
                We'll find opportunities as your business grows
              </p>
            </div>
          ) : (
            <div className="divide-y divide-rose-50">
              {data.opportunities.map((opp, i) => {
                return (
                  <button
                    key={i}
                    onClick={() => navigate("/opportunities")}
                    className="w-full flex items-start gap-3 px-5 py-4 hover:bg-rose-50/50 transition-all duration-300 text-left"
                  >
                    <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-rose-100 to-rose-200 text-rose-600 text-sm">
                      💡
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-neutral-900">{opp.title}</p>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                          {opp.impact}
                        </span>
                      </div>
                      <p className="text-xs text-rose-400 mt-1">{opp.explanation}</p>
                    </div>
                    <Badge engine={opp.engine}>{opp.engine}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
