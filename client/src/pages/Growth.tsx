import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api";
import { PageHeader, Tabs, Badge, Skeleton, EmptyState, ErrorBanner, Button } from "../components/ui";

// ── Types ───────────────────────────────────────────────────────────

interface DemandForecastItem {
  productId: number;
  productName: string;
  sku: string;
  currentStock: number;
  weeklyDemandHistory: { week: string; quantity: number }[];
  projection30: number;
  projection60: number;
  projection90: number;
  avgWeeklyDemand: number;
  confidence: "low" | "medium" | "high";
  trend: "up" | "down" | "flat";
  basis: string;
}

interface StockoutAlert {
  productId: number;
  productName: string;
  sku: string;
  currentStock: number;
  avgWeeklyDemand: number;
  depletionDate: string;
  weeksUntilDepletion: number;
  supplierName: string;
  leadTimeDays: number;
  recommendedOrderQty: number;
  urgency: "critical" | "warning";
  basis: string;
}

interface SeasonalityItem {
  productId: number;
  productName: string;
  sku: string;
  peakMonth: { month: string; label: string; quantity: number };
  slowMonth: { month: string; label: string; quantity: number };
  seasonalIndex: Record<string, number>;
  avgMonthlySales: number;
  monthsOfData: number;
  basis: string;
}

interface Recommendation {
  id: string;
  type: string;
  icon: string;
  what: string;
  why: string;
  action: string;
  impact: "high" | "medium" | "low";
  relatedIds?: number[];
}

interface ProductionSuggestion {
  productId: number;
  productName: string;
  sku: string;
  currentStock: number;
  projectedDemand30: number;
  projectedDemand60: number;
  batchSize: number;
  bomId: number;
  suggestedBatches: number;
  basis: string;
}

interface GrowthSummary {
  totalOrders: number;
  activeProducts: number;
  revenue30d: number;
  supplyRiskCount: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

function confidenceColor(confidence: string): string {
  if (confidence === "high") return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (confidence === "medium") return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-red-500 bg-red-50 border-red-200";
}

function trendIcon(trend: string): string {
  if (trend === "up") return "📈";
  if (trend === "down") return "📉";
  return "➡️";
}

function impactBadge(impact: string): string {
  if (impact === "high") return "bg-red-100 text-red-700 border-red-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

function money(val: number | null): string {
  if (val == null) return "—";
  return `$${val.toFixed(2)}`;
}

// ── Simple Bar Chart (CSS) ──────────────────────────────────────────

function MiniBarChart({ data, maxValue, label }: { data: { label: string; value: number }[]; maxValue?: number; label?: string }) {
  const max = maxValue ?? Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-neutral-500 font-medium mb-2">{label}</p>}
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 w-16 text-right shrink-0">{d.label}</span>
          <div className="flex-1 h-5 bg-neutral-100 rounded-sm overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-400 to-rose-300 rounded-sm transition-all duration-500 flex items-center px-1.5"
              style={{ width: `${Math.max((d.value / max) * 100, 2)}%` }}
            >
              <span className="text-xs text-white font-medium">{d.value}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Mini Heatmap (month grid) ────────────────────────────────────────

function MiniHeatmap({ index }: { index: Record<string, number> }) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthKeys = Object.keys(index);
  const min = Math.min(...Object.values(index), 0.5);
  const max = Math.max(...Object.values(index), 1.5);
  const range = max - min || 1;

  return (
    <div className="grid grid-cols-6 gap-1">
      {months.map((m, i) => {
        const key = monthKeys.find(k => k.endsWith(`-${String(i + 1).padStart(2, "0")}`));
        const val = key ? index[key] : null;
        const intensity = val !== null ? (val - min) / range : 0;
        const bg = val !== null
          ? `rgba(244, 63, 94, ${0.15 + intensity * 0.7})`
          : "rgba(0,0,0,0.03)";
        return (
          <div
            key={m}
            className="text-center py-1.5 rounded text-xs font-medium"
            style={{ backgroundColor: bg }}
            title={val !== null ? `${m}: ${(val * 100).toFixed(0)}% of avg` : "No data"}
          >
            <span className={val !== null && val > 1.2 ? "text-rose-700" : val !== null && val < 0.8 ? "text-rose-300" : "text-neutral-500"}>
              {val !== null ? (val * 100).toFixed(0) + "%" : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Growth Page ─────────────────────────────────────────────────────

export default function Growth() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("demand");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Data states
  const [demandData, setDemandData] = useState<DemandForecastItem[]>([]);
  const [stockoutAlerts, setStockoutAlerts] = useState<StockoutAlert[]>([]);
  const [seasonality, setSeasonality] = useState<SeasonalityItem[]>([]);
  const [supplierRecs, setSupplierRecs] = useState<Recommendation[]>([]);
  const [bundleRecs, setBundleRecs] = useState<Recommendation[]>([]);
  const [marketingRecs, setMarketingRecs] = useState<Recommendation[]>([]);
  const [productionSugs, setProductionSugs] = useState<ProductionSuggestion[]>([]);
  const [summary, setSummary] = useState<GrowthSummary | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [demandRes, stockoutRes, seasonRes, supplierRes, bundleRes, mktRes, prodRes, sumRes] =
        await Promise.allSettled([
          apiGet<any>("/api/growth/forecast/demand"),
          apiGet<any>("/api/growth/forecast/inventory"),
          apiGet<any>("/api/growth/seasonality"),
          apiGet<any>("/api/growth/recommendations/suppliers"),
          apiGet<any>("/api/growth/recommendations/bundles"),
          apiGet<any>("/api/growth/recommendations/marketing"),
          apiGet<any>("/api/growth/forecast/production"),
          apiGet<any>("/api/growth/summary"),
        ]);

      if (demandRes.status === "fulfilled") setDemandData(demandRes.value.forecast || []);
      if (stockoutRes.status === "fulfilled") setStockoutAlerts(stockoutRes.value.alerts || []);
      if (seasonRes.status === "fulfilled") setSeasonality(seasonRes.value.seasonality || []);
      if (supplierRes.status === "fulfilled") setSupplierRecs(supplierRes.value.recommendations || []);
      if (bundleRes.status === "fulfilled") setBundleRecs(bundleRes.value.recommendations || []);
      if (mktRes.status === "fulfilled") setMarketingRecs(mktRes.value.recommendations || []);
      if (prodRes.status === "fulfilled") setProductionSugs(prodRes.value.suggestions || []);
      if (sumRes.status === "fulfilled") setSummary(sumRes.value);

    } catch (err: any) {
      setError(err.message || "Failed to load growth intelligence");
    }
    setLoading(false);
  }

  const allRecs = [...supplierRecs, ...bundleRecs, ...marketingRecs];

  const tabs = [
    { id: "demand", label: "📈 Demand Forecast", count: stockoutAlerts.length > 0 ? stockoutAlerts.length : undefined },
    { id: "seasonality", label: "📅 Seasonality" },
    { id: "recommendations", label: "💡 Recommendations", count: allRecs.length > 0 ? allRecs.length : undefined },
    { id: "opportunities", label: "🎯 Opportunities" },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="Growth Intelligence" subtitle="Loading forecasts and recommendations…" icon="📈" />
        <div className="space-y-4 mt-6">
          <Skeleton height="48px" />
          <Skeleton height="200px" />
          <Skeleton height="200px" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Growth Intelligence" subtitle="Forecasting & Recommendations" icon="📈" />
        <ErrorBanner message={error} onRetry={loadAll} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Growth Intelligence"
        subtitle={
          summary
            ? `${summary.activeProducts} products · ${money(summary.revenue30d)} last 30d · ${summary.totalOrders} orders`
            : "Forecasting & Recommendations"
        }
        icon="📈"
      />

      {/* ── Quick stats bar ──────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-rose-100 p-4 text-center">
            <p className="text-2xl font-bold text-rose-600">{summary.activeProducts}</p>
            <p className="text-xs text-neutral-500 mt-0.5">Active Products</p>
          </div>
          <div className="bg-white rounded-xl border border-rose-100 p-4 text-center">
            <p className="text-2xl font-bold text-rose-600">{money(summary.revenue30d)}</p>
            <p className="text-xs text-neutral-500 mt-0.5">Revenue (30d)</p>
          </div>
          <div className="bg-white rounded-xl border border-rose-100 p-4 text-center">
            <p className="text-2xl font-bold text-rose-600">{summary.totalOrders}</p>
            <p className="text-xs text-neutral-500 mt-0.5">Total Orders</p>
          </div>
          <div className={`bg-white rounded-xl border p-4 text-center ${summary.supplyRiskCount > 0 ? "border-red-200" : "border-rose-100"}`}>
            <p className={`text-2xl font-bold ${summary.supplyRiskCount > 0 ? "text-red-500" : "text-emerald-500"}`}>
              {summary.supplyRiskCount}
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">Supply Risks</p>
          </div>
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-6" />

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB 1: Demand Forecast                                */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === "demand" && (
        <div className="space-y-6">
          {/* Stockout alerts */}
          {stockoutAlerts.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-neutral-800 mb-3">
                ⚠️ Stockout Risk Alerts ({stockoutAlerts.length})
              </h3>
              <div className="space-y-3">
                {stockoutAlerts.map((alert) => (
                  <div
                    key={`alert-${alert.productId}`}
                    className={`bg-white rounded-xl border-2 p-4 ${
                      alert.urgency === "critical" ? "border-red-300 bg-red-50/30" : "border-amber-200 bg-amber-50/20"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border mr-2 ${
                          alert.urgency === "critical"
                            ? "bg-red-100 text-red-700 border-red-300"
                            : "bg-amber-100 text-amber-700 border-amber-200"
                        }`}>
                          {alert.urgency === "critical" ? "🔴 Critical" : "🟡 Warning"}
                        </span>
                        <span className="font-semibold text-neutral-800">{alert.productName}</span>
                      </div>
                      <span className="text-xs text-neutral-400">{alert.sku}</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                      <div>
                        <span className="text-neutral-400">Current Stock</span>
                        <p className="font-semibold text-neutral-800">{alert.currentStock}</p>
                      </div>
                      <div>
                        <span className="text-neutral-400">Weekly Demand</span>
                        <p className="font-semibold text-neutral-800">{alert.avgWeeklyDemand}/wk</p>
                      </div>
                      <div>
                        <span className="text-neutral-400">Depletion Date</span>
                        <p className="font-semibold text-red-600">{alert.depletionDate}</p>
                      </div>
                      <div>
                        <span className="text-neutral-400">Reorder Qty</span>
                        <p className="font-semibold text-rose-600">{alert.recommendedOrderQty} units</p>
                      </div>
                    </div>

                    <div className="bg-white/70 rounded-lg p-3 text-sm space-y-1">
                      <p className="text-neutral-600">📊 <strong>Why:</strong> {alert.basis}</p>
                      <p className="text-rose-600">
                        🎯 <strong>Action:</strong> Order {alert.recommendedOrderQty} from {alert.supplierName}
                        {alert.leadTimeDays ? ` (${alert.leadTimeDays}-day lead time)` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Demand forecast table */}
          <div>
            <h3 className="text-lg font-semibold text-neutral-800 mb-3">
              📈 Product Demand Projections ({demandData.length} products)
            </h3>
            {demandData.length === 0 ? (
              <EmptyState
                title="No demand data yet"
                description="Demand forecasts will appear here once you have order history."
                icon="📈"
              />
            ) : (
              <div className="bg-white rounded-xl border border-rose-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-rose-50/50 text-left border-b border-rose-100">
                        <th className="px-4 py-3 font-semibold text-neutral-600">Product</th>
                        <th className="px-4 py-3 font-semibold text-neutral-600 text-right">Stock</th>
                        <th className="px-4 py-3 font-semibold text-neutral-600 text-right">Avg/Wk</th>
                        <th className="px-4 py-3 font-semibold text-neutral-600 text-right">30-Day</th>
                        <th className="px-4 py-3 font-semibold text-neutral-600 text-right">60-Day</th>
                        <th className="px-4 py-3 font-semibold text-neutral-600 text-right">90-Day</th>
                        <th className="px-4 py-3 font-semibold text-neutral-600 text-center">Trend</th>
                        <th className="px-4 py-3 font-semibold text-neutral-600 text-center">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-50">
                      {demandData.map((item) => (
                        <tr key={item.productId} className="hover:bg-rose-50/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-neutral-800">{item.productName}</p>
                            <p className="text-xs text-neutral-400">{item.sku}</p>
                          </td>
                          <td className={`px-4 py-3 text-right font-medium ${
                            item.currentStock < item.projection30 ? "text-red-600" : "text-neutral-700"
                          }`}>
                            {item.currentStock}
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-600">{item.avgWeeklyDemand}</td>
                          <td className="px-4 py-3 text-right font-medium text-neutral-800">{item.projection30}</td>
                          <td className="px-4 py-3 text-right text-neutral-600">{item.projection60}</td>
                          <td className="px-4 py-3 text-right text-neutral-600">{item.projection90}</td>
                          <td className="px-4 py-3 text-center text-lg">{trendIcon(item.trend)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${confidenceColor(item.confidence)}`}>
                              {item.confidence}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Production suggestions */}
          {productionSugs.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-neutral-800 mb-3">🏭 Production Planning</h3>
              <div className="space-y-3">
                {productionSugs.map((sug) => (
                  <div key={`prod-${sug.productId}`} className="bg-white rounded-xl border border-amber-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-semibold text-neutral-800">{sug.productName}</span>
                      <Badge engine="production" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                      <div><span className="text-neutral-400">Stock</span><p className="font-semibold">{sug.currentStock}</p></div>
                      <div><span className="text-neutral-400">30d Demand</span><p className="font-semibold text-rose-600">{sug.projectedDemand30}</p></div>
                      <div><span className="text-neutral-400">Batch Size</span><p className="font-semibold">{sug.batchSize}</p></div>
                      <div><span className="text-neutral-400">Suggested</span><p className="font-semibold text-amber-600">{sug.suggestedBatches} batch(es)</p></div>
                    </div>
                    <p className="text-sm text-neutral-500 bg-amber-50/50 rounded-lg p-2">
                      📊 <strong>Why:</strong> {sug.basis}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB 2: Seasonality                                    */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === "seasonality" && (
        <div className="space-y-6">
          {seasonality.length === 0 ? (
            <EmptyState
              title="Not enough data"
              description="Seasonality analysis requires at least 3 months of order history."
              icon="📅"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {seasonality.map((item) => (
                <div key={`season-${item.productId}`} className="bg-white rounded-xl border border-rose-100 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-neutral-800">{item.productName}</h4>
                      <p className="text-xs text-neutral-400">{item.sku}</p>
                    </div>
                    <span className="text-xs text-neutral-400">{item.monthsOfData}mo data</span>
                  </div>

                  <MiniHeatmap index={item.seasonalIndex} />

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-emerald-50 rounded-lg p-2">
                      <span className="text-xs text-emerald-500">Peak Month</span>
                      <p className="font-semibold text-emerald-700">{item.peakMonth.label} ({item.peakMonth.quantity} units)</p>
                    </div>
                    <div className="bg-rose-50 rounded-lg p-2">
                      <span className="text-xs text-rose-400">Slow Month</span>
                      <p className="font-semibold text-rose-700">{item.slowMonth.label} ({item.slowMonth.quantity} units)</p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-neutral-400 italic">{item.basis}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB 3: Recommendations                                 */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === "recommendations" && (
        <div className="space-y-6">
          {/* Tabs for recommendation types */}
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { key: "all", label: "All", count: allRecs.length },
              { key: "bundle", label: "🎁 Bundles", count: bundleRecs.length },
              { key: "supplier", label: "📦 Suppliers", count: supplierRecs.length },
              { key: "marketing", label: "📢 Marketing", count: marketingRecs.length },
            ].map((btn) => (
              <button
                key={btn.key}
                onClick={() => {
                  // Filter by type — we handle via a sub-filter state
                  const el = document.querySelector(`[data-rec-type="${btn.key}"]`);
                  if (el) (el as HTMLElement).click();
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-rose-200 bg-white hover:bg-rose-50 text-neutral-600 hover:text-rose-600 transition-all"
              >
                {btn.label} {btn.count > 0 && `(${btn.count})`}
              </button>
            ))}
          </div>

          {allRecs.length === 0 ? (
            <EmptyState
              title="No recommendations yet"
              description="Recommendations will appear as we analyze your sales and supplier data."
              icon="💡"
            />
          ) : (
            <div className="space-y-4">
              {allRecs.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-white rounded-xl border border-rose-100 p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">{rec.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${impactBadge(rec.impact)}`}>
                          {rec.impact} impact
                        </span>
                        <span className="text-xs text-neutral-400 uppercase font-medium">{rec.type}</span>
                      </div>

                      <h4 className="font-semibold text-neutral-800 text-lg mb-2">{rec.what}</h4>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2">
                          <span className="text-neutral-400 shrink-0 pt-0.5">📊</span>
                          <p className="text-neutral-600"><strong>Why:</strong> {rec.why}</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-rose-400 shrink-0 pt-0.5">🎯</span>
                          <p className="text-rose-600"><strong>Action:</strong> {rec.action}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB 4: Opportunities (link to existing)                */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === "opportunities" && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">💡</div>
          <h3 className="text-xl font-semibold text-neutral-800 mb-2">Opportunity Center</h3>
          <p className="text-neutral-500 mb-6 max-w-md mx-auto">
            The Opportunity Center detects bundles, pricing opportunities, reorder alerts, waste reduction, and more across all engines.
          </p>
          <Button onClick={() => navigate("/opportunities")} className="px-6">
            🎯 Open Opportunity Center
          </Button>
        </div>
      )}
    </div>
  );
}
