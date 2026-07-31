import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiGet, apiPost, apiPut, apiDelete } from "../lib/api";
import { PageHeader, Button, Badge, Tabs, Skeleton, EmptyState, ErrorBanner, ProgressBar, Modal, ConfirmModal, useToast } from "../components/ui";

// ── Types ───────────────────────────────────────────────────────────

interface ProductCore {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  stock_count: number;
  created_at: string;
  updated_at: string;
}

interface InventoryData {
  currentStock: number;
  totalIn: number;
  totalOut: number;
  lastMovementDate: string | null;
  recentMovements: { id: number; type: string; quantity: number; created_at: string }[];
}

interface CommerceData {
  orderCount: number;
  unitsSold: number;
  revenue: number | null;
  revenueNote: string;
}

interface BomRef {
  id?: number;
  bom_id?: number;
  name?: string;
  bom_name?: string;
  output_quantity?: number;
  output_unit?: string;
  quantity_per_batch?: number;
  unit?: string;
  output_product_name?: string;
  is_active?: number;
}

interface BatchRef {
  id: number;
  status: string;
  batch_size: number;
  created_at: string;
  completed_at: string | null;
  bom_name: string;
  output_product_name: string;
}

interface ProductionData {
  bomsAsOutput: BomRef[];
  bomsAsInput: BomRef[];
  recentBatches: BatchRef[];
  totalManufactured: number;
}

interface SupplierLink {
  id: number;
  name: string;
  unit_cost: number | null;
  quoted_lead_time_days: number | null;
  min_order_qty: number;
  supplier_sku: string | null;
  is_preferred: number;
  unit_type: string;
}

interface LastPO {
  id: number;
  status: string;
  order_date: string | null;
  expected_delivery: string | null;
  received_date: string | null;
  quantity: number;
  unit_cost: number | null;
  supplier_name: string;
}

interface ReorderRec {
  recommended: boolean;
  urgency: string;
  reorderPoint: number;
  reorderQuantity: number;
  daysRemaining: number;
  leadTimeDays: number;
  preferredSupplier: string | null;
  preferredSupplierId: number | null;
}

interface ThresholdData {
  id: number;
  product_id: number;
  reorder_point: number;
  reorder_quantity: number;
  unit_type: string;
}

interface PurchasingData {
  suppliers: SupplierLink[];
  lastPO: LastPO | null;
  threshold: ThresholdData | null;
  reorderRecommendation: ReorderRec | null;
}

interface ProfitabilityData {
  costPerUnit: number | null;
  revenuePerUnit: number | null;
  margin: number | null;
  note: string;
}

interface ActivityEntry {
  id: number;
  action_type: string;
  entity_type: string;
  new_value: string | null;
  previous_value: string | null;
  source: string;
  created_at: string;
  user_display_name: string | null;
}

interface ProductHQData {
  product: ProductCore;
  inventory: InventoryData;
  commerce: CommerceData;
  production: ProductionData;
  purchasing: PurchasingData;
  profitability: ProfitabilityData;
  recentActivity: ActivityEntry[];
}

interface Variant {
  id: number;
  product_id: number;
  business_id: number;
  sku: string;
  barcode: string | null;
  variant_type: string;
  variant_value: string;
  price: number | null;
  cost: number | null;
  stock_count: number;
  weight_oz: number | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface Movement {
  id: number;
  product_id: number;
  business_id: number;
  type: string;
  quantity: number;
  created_at: string;
  user_id: number | null;
  user_name: string | null;
  user_display_name: string | null;
}

// ── Constants ────────────────────────────────────────────────────────

type TabKey = "overview" | "inventory" | "production" | "purchasing" | "timeline" | "variants" | "movements";
const TABS: { id: TabKey; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "inventory", label: "Inventory", icon: "📦" },
  { id: "production", label: "Production", icon: "🏭" },
  { id: "purchasing", label: "Purchasing", icon: "🛒" },
  { id: "timeline", label: "Timeline", icon: "⏱️" },
  { id: "variants", label: "Variants", icon: "🔀" },
  { id: "movements", label: "Movement History", icon: "📋" },
];

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

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Status mapping for Badge component ───────────────────────────────

function mapStatus(status: string): "success" | "warning" | "danger" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "info"> = {
    draft: "info",
    in_progress: "info",
    completed: "success",
    cancelled: "danger",
    ordered: "warning",
    received: "success",
    pending: "info",
  };
  return map[status] || "info";
}

// ── Page Component ──────────────────────────────────────────────────

export default function ProductHQ() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ProductHQData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("overview");

  useEffect(() => { fetchData(); }, [id]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const json = await apiGet<ProductHQData>(`/api/products/${id}/hq`);
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load product data");
    } finally {
      setLoading(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Product HQ"
          breadcrumbs={[
            { label: "HQ", href: "/" },
            { label: "Products", href: "/products" },
            { label: "Loading..." },
          ]}
        />
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-6">
          <div className="flex items-center gap-4 animate-pulse">
            <div className="w-16 h-16 bg-rose-100 rounded-xl" />
            <div className="space-y-2 flex-1">
              <div className="h-6 bg-rose-100 rounded w-48" />
              <div className="h-4 bg-rose-100 rounded w-32" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (<Skeleton key={i} variant="block" className="h-24 rounded-2xl" />))}
        </div>
        <Skeleton variant="card" />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Product HQ"
          breadcrumbs={[
            { label: "HQ", href: "/" },
            { label: "Products", href: "/products" },
          ]}
        />
        <ErrorBanner message={error || "Unknown error"} onRetry={fetchData} />
      </div>
    );
  }

  const p = data.product;
  const stockLevel = p.stock_count <= 0 ? "critical" : p.stock_count <= 5 ? "warning" : "ok";

  // ── KPI cards ──────────────────────────────────────────────────────

  const kpiCards = [
    { icon: "📦", label: "Stock", value: fmtNum(p.stock_count),
      color: stockLevel === "critical" ? "text-red-600" : stockLevel === "warning" ? "text-amber-600" : "text-emerald-600" },
    { icon: "🛒", label: "Units Sold", value: fmtNum(data.commerce.unitsSold), color: "text-blue-600" },
    { icon: "💰", label: "Cost/Unit", value: fmtCurrency(data.profitability.costPerUnit), color: "text-purple-600" },
    { icon: "🏭", label: "Manufactured", value: fmtNum(data.production.totalManufactured), color: "text-amber-600" },
    { icon: "📋", label: "Orders", value: fmtNum(data.commerce.orderCount), color: "text-green-600" },
    { icon: "🚚", label: "Suppliers", value: fmtNum(data.purchasing.suppliers.length), color: "text-indigo-600" },
  ];

  const tabConfig = TABS.map(t => ({ id: t.id, label: `${t.icon} ${t.label}` }));

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <PageHeader
        title={p.name}
        breadcrumbs={[
          { label: "HQ", href: "/" },
          { label: "Products", href: "/products" },
          { label: p.name },
        ]}
        actions={
          <Button variant="secondary" onClick={() => navigate("/products")}>
            ← Back to Products
          </Button>
        }
      />

      {/* ── Header Card ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-rose-200 to-rose-300 flex items-center justify-center text-3xl flex-shrink-0">📦</div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-[#121212] font-[family-name:var(--font-heading)] truncate">{p.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-sm text-rose-400 font-mono">SKU: {p.sku}</span>
              {p.barcode && <span className="text-sm text-rose-400 font-mono">• Barcode: {p.barcode}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge status={stockLevel === "critical" ? "danger" : stockLevel === "warning" ? "warning" : "success"}>
                {stockLevel === "critical" ? "Out of Stock" : stockLevel === "warning" ? "Low Stock" : "In Stock"}
              </Badge>
              <span className="text-xs text-rose-400">Updated {timeAgo(p.updated_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Stats Bar ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((kpi, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 card-lift">
            <span className="text-2xl">{kpi.icon}</span>
            <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-rose-400 font-medium mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <Tabs tabs={tabConfig} active={activeTab} onChange={setActiveTab} />

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      <div className="space-y-4">
        {activeTab === "overview" && <OverviewTab data={data} />}
        {activeTab === "inventory" && <InventoryTab data={data} />}
        {activeTab === "production" && <ProductionTab data={data} navigate={navigate} />}
        {activeTab === "purchasing" && <PurchasingTab data={data} navigate={navigate} />}
        {activeTab === "timeline" && <TimelineTab data={data} />}
        {activeTab === "variants" && <VariantsTab productId={p.id} />}
        {activeTab === "movements" && <MovementHistoryTab productId={p.id} />}
      </div>
    </div>
  );
}

// ── Overview Tab ────────────────────────────────────────────────────

function OverviewTab({ data }: { data: ProductHQData }) {
  const p = data.product;
  const rec = data.purchasing.reorderRecommendation;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-5">
        <h3 className="text-sm font-semibold text-[#121212] mb-3 flex items-center gap-2"><span>📦</span> Inventory</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center"><span className="text-sm text-rose-400">Current Stock</span><span className="text-lg font-bold text-[#121212]">{fmtNum(p.stock_count)}</span></div>
          <div className="flex justify-between items-center"><span className="text-sm text-rose-400">Total In</span><span className="text-sm font-semibold text-emerald-600">+{fmtNum(data.inventory.totalIn)}</span></div>
          <div className="flex justify-between items-center"><span className="text-sm text-rose-400">Total Out</span><span className="text-sm font-semibold text-red-500">-{fmtNum(data.inventory.totalOut)}</span></div>
          {data.inventory.lastMovementDate && <div className="flex justify-between items-center"><span className="text-sm text-rose-400">Last Movement</span><span className="text-sm text-[#121212]">{timeAgo(data.inventory.lastMovementDate)}</span></div>}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-5">
        <h3 className="text-sm font-semibold text-[#121212] mb-3 flex items-center gap-2"><span>💰</span> Sales & Profitability</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center"><span className="text-sm text-rose-400">Units Sold</span><span className="text-lg font-bold text-[#121212]">{fmtNum(data.commerce.unitsSold)}</span></div>
          <div className="flex justify-between items-center"><span className="text-sm text-rose-400">Orders</span><span className="text-sm font-semibold text-[#121212]">{fmtNum(data.commerce.orderCount)}</span></div>
          {data.profitability.costPerUnit != null ? (
            <div className="flex justify-between items-center"><span className="text-sm text-rose-400">Cost per Unit</span><span className="text-sm font-semibold text-purple-600">{fmtCurrency(data.profitability.costPerUnit)}</span></div>
          ) : (
            <p className="text-xs text-rose-400 italic">{data.profitability.note}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-5">
        <h3 className="text-sm font-semibold text-[#121212] mb-3 flex items-center gap-2"><span>🚚</span> Suppliers</h3>
        {data.purchasing.suppliers.length === 0 ? (
          <EmptyState icon="🚚" title="No suppliers" description="Link a supplier in Purchasing to track costs." />
        ) : (
          <div className="space-y-2">
            {data.purchasing.suppliers.slice(0, 3).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant={s.is_preferred ? "outline" : "dot"} status={s.is_preferred ? "success" : undefined}>
                    {s.is_preferred ? "★" : ""}
                  </Badge>
                  <span className="text-sm text-[#121212]">{s.name}</span>
                </div>
                <span className="text-sm text-rose-400">{s.unit_cost != null ? fmtCurrency(s.unit_cost) : "—"}</span>
              </div>
            ))}
            {data.purchasing.suppliers.length > 3 && <p className="text-xs text-rose-400">+{data.purchasing.suppliers.length - 3} more</p>}
          </div>
        )}
      </div>

      {rec && rec.recommended && (
        <div className={`rounded-2xl shadow-sm border p-5 ${rec.urgency === "now" ? "bg-red-50 border-red-200" : rec.urgency === "soon" ? "bg-amber-50 border-amber-200" : "bg-white border-rose-100"}`}>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <span>🔔</span> <Badge urgency={rec.urgency}>Reorder Recommended</Badge>
          </h3>
          <div className="space-y-2 text-sm">
            <p>Reorder <strong>{rec.reorderQuantity}</strong> units at reorder point <strong>{rec.reorderPoint}</strong></p>
            {rec.preferredSupplier && <p>Preferred supplier: <strong>{rec.preferredSupplier}</strong></p>}
            <p>Lead time: <strong>{rec.leadTimeDays}d</strong> • Days remaining: <strong>{rec.daysRemaining}d</strong></p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-5">
        <h3 className="text-sm font-semibold text-[#121212] mb-3 flex items-center gap-2"><span>🏭</span> Recent Production</h3>
        {data.production.recentBatches.length === 0 ? (
          <EmptyState icon="🏭" title="No production runs" description="Create a BOM to get started." />
        ) : (
          <div className="space-y-2">
            {data.production.recentBatches.slice(0, 3).map((b) => (
              <div key={b.id} className="flex items-center justify-between py-1.5">
                <div>
                  <span className="text-sm text-[#121212]">{b.bom_name}</span>
                  <Badge status={mapStatus(b.status)} className="ml-2">{b.status}</Badge>
                </div>
                <span className="text-sm text-rose-400">{timeAgo(b.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inventory Tab ───────────────────────────────────────────────────

function InventoryTab({ data }: { data: ProductHQData }) {
  const stockPercent = data.product.stock_count <= 0 ? 0 :
    Math.min(100, Math.max(0, (data.product.stock_count / Math.max(data.product.stock_count + 10, 1)) * 100));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-5">
        <h3 className="text-sm font-semibold text-[#121212] mb-4 flex items-center gap-2"><span>📊</span> Stock Level</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <ProgressBar
              value={stockPercent}
              color={data.product.stock_count <= 0 ? "red" : data.product.stock_count <= 5 ? "orange" : "green"}
              size="lg"
            />
          </div>
          <span className="text-2xl font-bold text-[#121212]">{fmtNum(data.product.stock_count)}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-rose-100">
          <h3 className="text-sm font-semibold text-[#121212] flex items-center gap-2"><span>🔄</span> Movement History</h3>
        </div>
        {data.inventory.recentMovements.length === 0 ? (
          <EmptyState icon="🔄" title="No movements yet" description="Scan barcodes or create orders to track stock changes." />
        ) : (
          <div className="divide-y divide-rose-50">
            {data.inventory.recentMovements.map((m) => (
              <div key={m.id} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${m.type === "in" ? "text-emerald-600" : "text-red-500"}`}>
                    {m.type === "in" ? "+" : "-"}{m.quantity}
                  </span>
                  <Badge status={m.type === "in" ? "success" : "danger"}>{m.type}</Badge>
                </div>
                <span className="text-sm text-rose-400">{timeAgo(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4">
          <span className="text-2xl">📥</span>
          <p className="text-xl font-bold text-emerald-600 mt-1">+{fmtNum(data.inventory.totalIn)}</p>
          <p className="text-xs text-rose-400">Total In</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4">
          <span className="text-2xl">📤</span>
          <p className="text-xl font-bold text-red-500 mt-1">-{fmtNum(data.inventory.totalOut)}</p>
          <p className="text-xs text-rose-400">Total Out</p>
        </div>
      </div>
    </div>
  );
}

// ── Production Tab ──────────────────────────────────────────────────

function ProductionTab({ data, navigate }: { data: ProductHQData; navigate: (path: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#121212] flex items-center gap-2"><span>📋</span> BOMs (as Output)</h3>
          <Button variant="primary" size="sm" onClick={() => navigate("/production")}>+ Create Batch</Button>
        </div>
        {data.production.bomsAsOutput.length === 0 ? (
          <EmptyState icon="📋" title="No BOMs produce this product" description="Create a BOM to get started"
            action={{ label: "Create a BOM", onClick: () => navigate("/production") }} />
        ) : (
          <div className="divide-y divide-rose-50">
            {data.production.bomsAsOutput.map((bom) => (
              <div key={bom.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-[#121212]">{bom.name}</span>
                  <span className="ml-2 text-xs text-rose-400">{bom.output_quantity} {bom.output_unit || "unit(s)"} per batch</span>
                </div>
                <Badge status={bom.is_active ? "success" : "info"}>{bom.is_active ? "Active" : "Inactive"}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.production.bomsAsInput.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-rose-100">
            <h3 className="text-sm font-semibold text-[#121212] flex items-center gap-2"><span>🧩</span> Used as Material In</h3>
          </div>
          <div className="divide-y divide-rose-50">
            {data.production.bomsAsInput.map((bom, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-[#121212]">{bom.bom_name}</span>
                  <span className="ml-2 text-xs text-rose-400">→ {bom.output_product_name}</span>
                </div>
                <span className="text-xs text-rose-400">{bom.quantity_per_batch} {bom.unit || "unit(s)"} per batch</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-rose-100">
          <h3 className="text-sm font-semibold text-[#121212] flex items-center gap-2"><span>🏭</span> Recent Batches</h3>
        </div>
        {data.production.recentBatches.length === 0 ? (
          <EmptyState icon="🏭" title="No batches yet" description="Production batches appear here when you run a BOM." />
        ) : (
          <div className="divide-y divide-rose-50">
            {data.production.recentBatches.map((b) => (
              <div key={b.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-[#121212]">{b.bom_name}</span>
                  <span className="ml-2 text-xs text-rose-400">x{b.batch_size}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge status={mapStatus(b.status)}>{b.status}</Badge>
                  <span className="text-sm text-rose-400">{timeAgo(b.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 text-center">
        <span className="text-3xl">🏭</span>
        <p className="text-2xl font-bold text-amber-600 mt-1">{fmtNum(data.production.totalManufactured)}</p>
        <p className="text-xs text-rose-400">Total Manufactured</p>
      </div>
    </div>
  );
}

// ── Purchasing Tab ──────────────────────────────────────────────────

function PurchasingTab({ data, navigate }: { data: ProductHQData; navigate: (path: string) => void }) {
  return (
    <div className="space-y-4">
      {data.purchasing.reorderRecommendation && (
        <div className={`rounded-2xl shadow-sm border p-5 ${data.purchasing.reorderRecommendation.urgency === "now" ? "bg-red-50 border-red-200" : data.purchasing.reorderRecommendation.urgency === "soon" ? "bg-amber-50 border-amber-200" : "bg-white border-rose-100"}`}>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span>{data.purchasing.reorderRecommendation.recommended ? "🔔" : "✅"}</span>
            <Badge urgency={data.purchasing.reorderRecommendation.urgency}>
              {data.purchasing.reorderRecommendation.recommended ? "Reorder Recommended" : "Stock Level OK"}
            </Badge>
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-rose-400">Current Stock</span><span className="font-semibold">{fmtNum(data.product.stock_count)}</span></div>
            <div className="flex justify-between"><span className="text-rose-400">Reorder Point</span><span className="font-semibold">{fmtNum(data.purchasing.reorderRecommendation.reorderPoint)}</span></div>
            <div className="flex justify-between"><span className="text-rose-400">Reorder Quantity</span><span className="font-semibold">{fmtNum(data.purchasing.reorderRecommendation.reorderQuantity)}</span></div>
            <div className="flex justify-between"><span className="text-rose-400">Days Remaining</span><span className={`font-semibold ${data.purchasing.reorderRecommendation.daysRemaining <= 7 ? "text-red-600" : "text-[#121212]"}`}>{data.purchasing.reorderRecommendation.daysRemaining === 999 ? "∞" : fmtNum(data.purchasing.reorderRecommendation.daysRemaining)}</span></div>
            <div className="flex justify-between"><span className="text-rose-400">Lead Time</span><span className="font-semibold">{fmtNum(data.purchasing.reorderRecommendation.leadTimeDays)}d</span></div>
            {data.purchasing.reorderRecommendation.preferredSupplier && <div className="flex justify-between"><span className="text-rose-400">Preferred Supplier</span><span className="font-semibold">{data.purchasing.reorderRecommendation.preferredSupplier}</span></div>}
          </div>
          {data.purchasing.reorderRecommendation.recommended && (
            <Button variant="primary" onClick={() => navigate("/purchasing")} className="mt-4 w-full">Create Purchase Order</Button>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#121212] flex items-center gap-2"><span>🚚</span> Linked Suppliers</h3>
          <Button variant="primary" size="sm" onClick={() => navigate("/purchasing")}>+ Add Supplier</Button>
        </div>
        {data.purchasing.suppliers.length === 0 ? (
          <EmptyState icon="🚚" title="No suppliers linked" description="Link a supplier to track costs and lead times"
            action={{ label: "Link a Supplier", onClick: () => navigate("/purchasing") }} />
        ) : (
          <div className="divide-y divide-rose-50">
            {data.purchasing.suppliers.map((s) => (
              <div key={s.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {s.is_preferred ? <span className="text-amber-500 text-sm">★</span> : null}
                    <span className="text-sm font-medium text-[#121212]">{s.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-[#121212]">{s.unit_cost != null ? fmtCurrency(s.unit_cost) : "—"}</span>
                </div>
                <div className="flex gap-3 mt-1 text-xs text-rose-400">
                  {s.supplier_sku && <span>SKU: {s.supplier_sku}</span>}
                  {s.quoted_lead_time_days != null && <span>Lead: {s.quoted_lead_time_days}d</span>}
                  <span>Min Qty: {s.min_order_qty}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.purchasing.lastPO && (
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-5">
          <h3 className="text-sm font-semibold text-[#121212] mb-3 flex items-center gap-2"><span>📋</span> Last Purchase Order</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-rose-400">PO #</span><span className="font-semibold">{data.purchasing.lastPO.id}</span></div>
            <div className="flex justify-between"><span className="text-rose-400">Supplier</span><span className="font-semibold">{data.purchasing.lastPO.supplier_name}</span></div>
            <div className="flex justify-between"><span className="text-rose-400">Quantity</span><span className="font-semibold">{fmtNum(data.purchasing.lastPO.quantity)}</span></div>
            <div className="flex justify-between"><span className="text-rose-400">Status</span><Badge status={mapStatus(data.purchasing.lastPO.status)}>{data.purchasing.lastPO.status}</Badge></div>
            {data.purchasing.lastPO.order_date && <div className="flex justify-between"><span className="text-rose-400">Order Date</span><span className="font-semibold">{timeAgo(data.purchasing.lastPO.order_date)}</span></div>}
          </div>
        </div>
      )}

      {data.purchasing.threshold && (
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-5">
          <h3 className="text-sm font-semibold text-[#121212] mb-3 flex items-center gap-2"><span>⚙️</span> Inventory Threshold</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-rose-400">Reorder Point</span><span className="font-semibold">{fmtNum(data.purchasing.threshold.reorder_point)}</span></div>
            <div className="flex justify-between"><span className="text-rose-400">Reorder Quantity</span><span className="font-semibold">{fmtNum(data.purchasing.threshold.reorder_quantity)}</span></div>
            <div className="flex justify-between"><span className="text-rose-400">Unit Type</span><span className="font-semibold">{data.purchasing.threshold.unit_type}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline Tab ────────────────────────────────────────────────────

function TimelineTab({ data }: { data: ProductHQData }) {
  function formatActivity(entry: ActivityEntry): string {
    const user = entry.user_display_name || "System";
    const type = entry.action_type || "";
    if (type === "product.created") return `${user} created this product`;
    if (type === "product.updated") return `${user} updated this product`;
    if (type === "product.deleted") return `${user} deleted this product`;
    if (type === "scan.in") return `${user} scanned in`;
    if (type === "scan.out") return `${user} scanned out`;
    if (type === "inventory.decremented") return `${user} — inventory decremented (order)`;
    if (type.startsWith("production.")) return `${user} — ${type.replace("production.", "")}`;
    if (type.startsWith("purchasing.")) return `${user} — ${type.replace("purchasing.", "")}`;
    return `${user} — ${type}`;
  }

  function activityIcon(type: string): string {
    if (type.startsWith("product.")) return "📝";
    if (type.startsWith("scan.")) return "📷";
    if (type.startsWith("inventory.")) return "📦";
    if (type.startsWith("production.")) return "🏭";
    if (type.startsWith("purchasing.")) return "🛒";
    return "🔧";
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-rose-100">
        <h3 className="text-sm font-semibold text-[#121212] flex items-center gap-2"><span>⏱️</span> Recent Activity</h3>
      </div>
      {data.recentActivity.length === 0 ? (
        <EmptyState icon="⏱️" title="No recent activity" description="Actions on this product will appear here." />
      ) : (
        <div className="divide-y divide-rose-50">
          {data.recentActivity.map((entry) => (
            <div key={entry.id} className="px-5 py-3 flex items-start gap-3">
              <span className="text-lg flex-shrink-0 mt-0.5">{activityIcon(entry.action_type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#121212]">{formatActivity(entry)}</p>
                <p className="text-xs text-rose-400 mt-0.5">{entry.source} • {timeAgo(entry.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Variants Tab ────────────────────────────────────────────────────

function VariantsTab({ productId }: { productId: number }) {
  const { toast } = useToast();
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Variant | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formSku, setFormSku] = useState("");
  const [formBarcode, setFormBarcode] = useState("");
  const [formType, setFormType] = useState("size");
  const [formValue, setFormValue] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formCost, setFormCost] = useState("");
  const [formStock, setFormStock] = useState("0");
  const [formWeight, setFormWeight] = useState("");

  const fetchVariants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Variant[]>(`/api/products/${productId}/variants`);
      setVariants(data);
    } catch (err: any) {
      setError(err.message || "Failed to load variants");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { fetchVariants(); }, [fetchVariants]);

  function openCreateModal() {
    setEditingVariant(null);
    setFormSku("");
    setFormBarcode("");
    setFormType("size");
    setFormValue("");
    setFormPrice("");
    setFormCost("");
    setFormStock("0");
    setFormWeight("");
    setModalOpen(true);
  }

  function openEditModal(v: Variant) {
    setEditingVariant(v);
    setFormSku(v.sku);
    setFormBarcode(v.barcode || "");
    setFormType(v.variant_type);
    setFormValue(v.variant_value);
    setFormPrice(v.price != null ? String(v.price) : "");
    setFormCost(v.cost != null ? String(v.cost) : "");
    setFormStock(String(v.stock_count));
    setFormWeight(v.weight_oz != null ? String(v.weight_oz) : "");
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formSku.trim() || !formType || !formValue.trim()) {
      toast("SKU, variant type, and value are required", "warning");
      return;
    }
    setSaving(true);
    try {
      const body = {
        sku: formSku.trim(),
        barcode: formBarcode.trim() || undefined,
        variantType: formType,
        variantValue: formValue.trim(),
        price: formPrice ? parseFloat(formPrice) : undefined,
        cost: formCost ? parseFloat(formCost) : undefined,
        stockCount: parseInt(formStock) || 0,
        weightOz: formWeight ? parseFloat(formWeight) : undefined,
      };

      if (editingVariant) {
        await apiPut(`/api/variants/${editingVariant.id}`, body);
        toast("Variant updated", "success");
      } else {
        await apiPost(`/api/products/${productId}/variants`, body);
        toast("Variant created", "success");
      }

      setModalOpen(false);
      fetchVariants();
    } catch (err: any) {
      toast(err.message || "Failed to save variant", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/variants/${deleteTarget.id}`);
      toast("Variant deleted", "success");
      setDeleteTarget(null);
      fetchVariants();
    } catch (err: any) {
      toast(err.message || "Failed to delete variant", "error");
    } finally {
      setDeleting(false);
    }
  }

  function variantTypeBadgeStatus(type: string): "info" | "success" | "warning" | "danger" {
    switch (type) {
      case "size": return "info";
      case "color": return "warning";
      case "material": return "success";
      default: return "info";
    }
  }

  if (loading) {
    return <Skeleton variant="card" />;
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={fetchVariants} />;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#121212] flex items-center gap-2">
            <span>🔀</span> Variants
            <Badge status="info">{variants.length}</Badge>
          </h3>
          <Button variant="primary" size="sm" onClick={openCreateModal}>+ Add Variant</Button>
        </div>

        {variants.length === 0 ? (
          <EmptyState icon="🔀" title="No variants yet" description="Add variants like sizes, colors, or materials."
            action={{ label: "Add Variant", onClick: openCreateModal }} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rose-100 bg-rose-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">SKU</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Barcode</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Type</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Value</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Price</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Cost</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Stock</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Status</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50">
                {variants.map((v) => (
                  <tr key={v.id} className="hover:bg-rose-50/30 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-[#121212]">{v.sku}</td>
                    <td className="px-5 py-3 font-mono text-xs text-rose-400">{v.barcode || "—"}</td>
                    <td className="px-5 py-3">
                      <Badge status={variantTypeBadgeStatus(v.variant_type)}>{v.variant_type}</Badge>
                    </td>
                    <td className="px-5 py-3 text-[#121212] font-medium">{v.variant_value}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-[#121212]">{fmtCurrency(v.price)}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-[#121212]">{fmtCurrency(v.cost)}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-[#121212]">{fmtNum(v.stock_count)}</td>
                    <td className="px-5 py-3 text-center">
                      <Badge status={v.is_active ? "success" : "danger"}>{v.is_active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEditModal(v)} className="p-1.5 rounded-lg hover:bg-rose-100 transition-colors text-sm" title="Edit variant">✏️</button>
                        <button onClick={() => setDeleteTarget(v)} className="p-1.5 rounded-lg hover:bg-rose-100 transition-colors text-sm" title="Delete variant">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Variant Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingVariant ? "Edit Variant" : "Add Variant"} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1">SKU *</label>
              <input
                type="text"
                value={formSku}
                onChange={e => setFormSku(e.target.value)}
                className="w-full px-3 py-2 border border-rose-200 rounded-lg text-sm focus:outline-none focus:border-rose-400"
                placeholder="e.g. TSHIRT-BLK-L"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1">Barcode</label>
              <input
                type="text"
                value={formBarcode}
                onChange={e => setFormBarcode(e.target.value)}
                className="w-full px-3 py-2 border border-rose-200 rounded-lg text-sm focus:outline-none focus:border-rose-400"
                placeholder="e.g. 1234567890123"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1">Variant Type *</label>
              <select
                value={formType}
                onChange={e => setFormType(e.target.value)}
                className="w-full px-3 py-2 border border-rose-200 rounded-lg text-sm focus:outline-none focus:border-rose-400 bg-white"
              >
                <option value="size">Size</option>
                <option value="color">Color</option>
                <option value="material">Material</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1">Value *</label>
              <input
                type="text"
                value={formValue}
                onChange={e => setFormValue(e.target.value)}
                className="w-full px-3 py-2 border border-rose-200 rounded-lg text-sm focus:outline-none focus:border-rose-400"
                placeholder="e.g. Large, Red, Cotton"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1">Price</label>
              <input
                type="number"
                step="0.01"
                value={formPrice}
                onChange={e => setFormPrice(e.target.value)}
                className="w-full px-3 py-2 border border-rose-200 rounded-lg text-sm focus:outline-none focus:border-rose-400"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1">Cost</label>
              <input
                type="number"
                step="0.01"
                value={formCost}
                onChange={e => setFormCost(e.target.value)}
                className="w-full px-3 py-2 border border-rose-200 rounded-lg text-sm focus:outline-none focus:border-rose-400"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1">Starting Stock</label>
              <input
                type="number"
                value={formStock}
                onChange={e => setFormStock(e.target.value)}
                className="w-full px-3 py-2 border border-rose-200 rounded-lg text-sm focus:outline-none focus:border-rose-400"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1">Weight (oz)</label>
              <input
                type="number"
                step="0.1"
                value={formWeight}
                onChange={e => setFormWeight(e.target.value)}
                className="w-full px-3 py-2 border border-rose-200 rounded-lg text-sm focus:outline-none focus:border-rose-400"
                placeholder="0.0"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {editingVariant ? "Save Changes" : "Create Variant"}
          </Button>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Variant"
        message={`Are you sure you want to delete the variant "${deleteTarget?.sku}" (${deleteTarget?.variant_type}: ${deleteTarget?.variant_value})? This will soft-deactivate it.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
      />
    </div>
  );
}

// ── Movement History Tab ────────────────────────────────────────────

function MovementHistoryTab({ productId }: { productId: number }) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const limit = 20;

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (typeFilter !== "all") {
        params.set("type", typeFilter);
      }

      const data = await apiGet<{ movements: Movement[]; total: number }>(
        `/api/products/${productId}/movements?${params.toString()}`
      );
      setMovements(data.movements);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message || "Failed to load movement history");
    } finally {
      setLoading(false);
    }
  }, [productId, offset, typeFilter]);

  useEffect(() => { fetchMovements(); }, [fetchMovements]);

  useEffect(() => { setOffset(0); }, [typeFilter]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + limit, total);

  function movementTypeBadge(type: string): { status: "success" | "danger" | "info"; label: string } {
    switch (type) {
      case "in": return { status: "success", label: "In" };
      case "out": return { status: "danger", label: "Out" };
      case "order": return { status: "info", label: "Order" };
      default: return { status: "info", label: type };
    }
  }

  if (loading && movements.length === 0) {
    return <Skeleton variant="card" />;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-rose-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#121212] flex items-center gap-2">
            <span>📋</span> Movement History
            <Badge status="info">{total}</Badge>
          </h3>

          <div className="flex items-center gap-2">
            <label className="text-xs text-rose-400">Filter:</label>
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); }}
              className="px-3 py-1.5 border border-rose-200 rounded-lg text-xs focus:outline-none focus:border-rose-400 bg-white"
            >
              <option value="all">All Types</option>
              <option value="in">In</option>
              <option value="out">Out</option>
              <option value="order">Order</option>
            </select>
          </div>
        </div>

        {error && <ErrorBanner message={error} onRetry={fetchMovements} />}

        {!error && movements.length === 0 && !loading ? (
          <EmptyState icon="📋" title="No movement history" description="Stock movements will appear here once you start scanning or processing orders." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rose-100 bg-rose-50/50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Date</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Type</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Quantity</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">User</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-rose-400 uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-50">
                  {movements.map((m) => {
                    const badge = movementTypeBadge(m.type);
                    const displayUser = m.user_display_name || m.user_name || "—";
                    return (
                      <tr key={m.id} className="hover:bg-rose-50/30 transition-colors">
                        <td className="px-5 py-3 text-xs text-[#121212] whitespace-nowrap">{fmtDate(m.created_at)}</td>
                        <td className="px-5 py-3">
                          <Badge status={badge.status}>{badge.label}</Badge>
                        </td>
                        <td className={`px-5 py-3 text-right font-mono text-xs font-semibold ${m.type === "in" ? "text-emerald-600" : "text-red-500"}`}>
                          {m.type === "in" ? "+" : "-"}{m.quantity}
                        </td>
                        <td className="px-5 py-3 text-xs text-[#121212]">{displayUser}</td>
                        <td className="px-5 py-3 text-xs text-rose-400">—</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-5 py-3 border-t border-rose-100 flex items-center justify-between">
              <span className="text-xs text-rose-400">
                {total > 0 ? `Showing ${showingFrom}–${showingTo} of ${total} movements` : "No movements"}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  ← Previous
                </Button>
                <span className="text-xs text-rose-400 min-w-[4rem] text-center">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={offset + limit >= total}
                  onClick={() => setOffset(offset + limit)}
                >
                  Next →
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
