import { useState, useEffect } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../lib/api";
import { PageHeader, Button, Badge, Tabs, Modal, ConfirmModal, ProgressBar, Skeleton, EmptyState, ErrorBanner, useToast } from "../components/ui";

// ── Types ───────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  sku: string;
  stock_count: number;
}

interface Supplier {
  id: number;
  business_id: number;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
}

interface SupplierProduct {
  id: number;
  supplier_id: number;
  product_id: number;
  supplier_sku: string | null;
  unit_cost: number | null;
  unit_type: string;
  min_order_qty: number;
  quoted_lead_time_days: number | null;
  is_preferred: number;
  last_order_date: string | null;
  last_order_cost: number | null;
  product_name: string;
  product_sku: string;
  stock_count: number;
  barcode: string | null;
}

interface POItem {
  id: number;
  po_id: number;
  product_id: number;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  received_quantity: number;
  quantity_damaged: number;
  quantity_backordered: number;
  notes?: string | null;
  product_name: string;
  product_sku: string;
}

interface PurchaseOrder {
  id: number;
  business_id: number;
  supplier_id: number;
  status: string;
  order_date: string | null;
  expected_delivery: string | null;
  received_date: string | null;
  notes: string | null;
  created_by: number;
  created_at: string;
  supplier_name: string;
  items?: POItem[];
}

interface Recommendation {
  product_id: number;
  product_name: string;
  sku: string;
  current_stock: number;
  daily_velocity: number;
  days_remaining: number;
  reorder_qty: number;
  reorder_point: number;
  supplier_id: number | null;
  supplier_name: string | null;
  unit_cost: number | null;
  lead_time_days: number;
  min_order_qty: number;
  unit_type: string;
  urgency: "now" | "soon" | "ok";
  explanation: string;
}

interface SupplierPerformance {
  supplier: Supplier & { products: SupplierProduct[] };
  totalPOs: number;
  avgActualLeadTime: number | null;
  avgQuotedLeadTime: number | null;
  leadTimeDelta: number | null;
  recentPOs: Array<{
    id: number;
    status: string;
    order_date: string | null;
    expected_delivery: string | null;
    received_date: string | null;
    item_count: number;
  }>;
}

interface Delivery {
  id: number;
  business_id: number;
  supplier_id: number;
  status: string;
  expected_delivery: string | null;
  received_date: string | null;
  actual_delivery_date: string | null;
  carrier: string | null;
  tracking_number: string | null;
  notes: string | null;
  supplier_name: string;
  item_count: number;
  total_ordered: number;
  total_received: number;
}

interface ReceivingEvent {
  id: number;
  po_item_id: number;
  product_id: number;
  quantity_received: number;
  quantity_damaged: number;
  quantity_backordered: number;
  bin_location: string | null;
  notes: string | null;
  product_name: string;
  product_sku: string;
  received_by_name: string | null;
  created_at: string;
}

// ── Main Component ───────────────────────────────────────────────────

export default function Purchasing() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("recommendations");

  // Recommendations
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(true);

  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierPerformance | null>(null);
  const [loadingSupplierDetail, setLoadingSupplierDetail] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkSupplierId, setLinkSupplierId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [savingLink, setSavingLink] = useState(false);

  // Orders
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [loadingPO, setLoadingPO] = useState(false);
  const [createPOModal, setCreatePOModal] = useState(false);
  const [savingPO, setSavingPO] = useState(false);

  // Pre-selected supplier for PO modal (replaces setTimeout hack)
  const [preselectedSupplierId, setPreselectedSupplierId] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);

  // Confirm dialogs
  const [confirmDeleteSupplier, setConfirmDeleteSupplier] = useState<number | null>(null);
  const [confirmReceivePO, setConfirmReceivePO] = useState<number | null>(null);

  // V3.2: Receiving
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(true);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receivingPOId, setReceivingPOId] = useState<number | null>(null);
  const [receivingPOItems, setReceivingPOItems] = useState<POItem[]>([]);
  const [receivingQty, setReceivingQty] = useState<Record<number, { rcvd: number; dmg: number; back: number; bin: string; note: string }>>({});
  const [savingReceive, setSavingReceive] = useState(false);
  const [receiveHistory, setReceiveHistory] = useState<ReceivingEvent[]>([]);
  const [viewHistoryPOId, setViewHistoryPOId] = useState<number | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────

  function loadRecommendations() {
    setLoadingRecs(true);
    apiGet<Recommendation[]>("/api/purchasing/recommendations")
      .then(setRecommendations)
      .catch(() => setError("Failed to load recommendations"))
      .finally(() => setLoadingRecs(false));
  }

  function loadSuppliers() {
    setLoadingSuppliers(true);
    apiGet<Supplier[]>("/api/purchasing/suppliers")
      .then(setSuppliers)
      .catch(() => setError("Failed to load suppliers"))
      .finally(() => setLoadingSuppliers(false));
  }

  function loadOrders() {
    setLoadingOrders(true);
    apiGet<PurchaseOrder[]>("/api/purchasing/orders")
      .then(setOrders)
      .catch(() => setError("Failed to load orders"))
      .finally(() => setLoadingOrders(false));
  }

  function loadProducts() {
    apiGet<Product[]>("/api/products").then(setProducts).catch(() => {});
  }

  function loadDeliveries() {
    setLoadingDeliveries(true);
    apiGet<Delivery[]>("/api/purchasing/deliveries/expected")
      .then(setDeliveries)
      .catch(() => {})
      .finally(() => setLoadingDeliveries(false));
  }

  useEffect(() => { loadRecommendations(); loadSuppliers(); loadOrders(); loadProducts(); loadDeliveries(); }, []);

  // ── Supplier CRUD ──────────────────────────────────────────────────

  function openAddSupplier() { setEditingSupplier(null); setSupplierModalOpen(true); }
  function openEditSupplier(s: Supplier) { setEditingSupplier(s); setSupplierModalOpen(true); }

  async function handleSaveSupplier(e: React.FormEvent) {
    e.preventDefault();
    setSavingSupplier(true);
    setError(null);
    try {
      const form = e.target as HTMLFormElement;
      const data: Record<string, string> = {};
      for (const el of form.elements) {
        const input = el as HTMLInputElement;
        if (input.name) data[input.name] = input.value;
      }
      if (editingSupplier) {
        await apiPut(`/api/purchasing/suppliers/${editingSupplier.id}`, data);
        toast("Supplier updated", "success");
      } else {
        await apiPost("/api/purchasing/suppliers", data);
        toast("Supplier created", "success");
      }
      setSupplierModalOpen(false);
      loadSuppliers();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSavingSupplier(false);
    }
  }

  async function handleDeleteSupplier(id: number) {
    try {
      await apiDelete(`/api/purchasing/suppliers/${id}`);
      setSelectedSupplier(null);
      loadSuppliers();
      toast("Supplier deleted", "success");
      setConfirmDeleteSupplier(null);
    } catch (err: any) {
      toast(err.message, "error");
    }
  }

  async function viewSupplier(id: number) {
    setLoadingSupplierDetail(true);
    try {
      const perf = await apiGet<SupplierPerformance>(`/api/purchasing/suppliers/${id}`);
      setSelectedSupplier(perf);
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setLoadingSupplierDetail(false);
    }
  }

  // ── Link Product ───────────────────────────────────────────────────

  function openLinkProduct(supplierId: number) {
    setLinkSupplierId(supplierId);
    setLinkModalOpen(true);
  }

  async function handleLinkProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!linkSupplierId) return;
    setSavingLink(true);
    setError(null);
    try {
      const form = e.target as HTMLFormElement;
      const data: Record<string, any> = {};
      for (const el of form.elements) {
        const input = el as HTMLInputElement;
        if (input.name) data[input.name] = input.type === "number" ? (input.value ? Number(input.value) : null) : input.value;
      }
      data.isPreferred = (form.elements.namedItem("isPreferred") as HTMLInputElement)?.checked || false;
      await apiPost(`/api/purchasing/suppliers/${linkSupplierId}/products`, data);
      toast("Product linked to supplier", "success");
      setLinkModalOpen(false);
      if (selectedSupplier) viewSupplier(selectedSupplier.supplier.id);
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSavingLink(false);
    }
  }

  // ── Purchase Orders ────────────────────────────────────────────────

  async function handleCreatePO(e: React.FormEvent) {
    e.preventDefault();
    setSavingPO(true);
    setError(null);
    try {
      const form = e.target as HTMLFormElement;
      const supplierId = Number((form.elements.namedItem("supplierId") as HTMLSelectElement).value);
      const notes = (form.elements.namedItem("notes") as HTMLInputElement).value;
      const expectedDelivery = (form.elements.namedItem("expectedDelivery") as HTMLInputElement).value;

      const checkboxes = form.querySelectorAll<HTMLInputElement>("input[name='rec_items']:checked");
      const items = Array.from(checkboxes).map(cb => {
        const rec = recommendations.find(r => r.product_id === Number(cb.value));
        return rec ? { productId: rec.product_id, quantity: rec.reorder_qty, unitCost: rec.unit_cost } : null;
      }).filter(Boolean);

      const res = await apiPost<{ id: number }>("/api/purchasing/orders", {
        supplierId,
        notes: notes || null,
        expectedDelivery: expectedDelivery || null,
        items: items.length > 0 ? items : undefined,
      });

      toast("Purchase order created", "success");
      setCreatePOModal(false);
      setPreselectedSupplierId(null);
      loadOrders();
      loadRecommendations();
      viewPO(res.id);
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSavingPO(false);
    }
  }

  async function viewPO(id: number) {
    setLoadingPO(true);
    try {
      const po = await apiGet<PurchaseOrder>(`/api/purchasing/orders/${id}`);
      setSelectedPO(po);
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setLoadingPO(false);
    }
  }

  async function handleOrderPO(id: number) {
    try {
      await apiPost(`/api/purchasing/orders/${id}/order`, {});
      toast("Order marked as sent", "success");
      loadOrders();
      if (selectedPO && selectedPO.id === id) viewPO(id);
    } catch (err: any) {
      toast(err.message, "error");
    }
  }

  async function handleReceivePO(id: number) {
    setSavingReceive(true);
    try {
      const items = Object.entries(receivingQty).map(([poItemId, q]) => ({
        poItemId: Number(poItemId),
        qtyReceived: q.rcvd,
        qtyDamaged: q.dmg,
        qtyBackordered: q.back,
        binLocation: q.bin || null,
        notes: q.note || null,
      })).filter(it => it.qtyReceived + it.qtyDamaged + it.qtyBackordered > 0);

      if (items.length === 0) { toast("No items to receive", "error"); setSavingReceive(false); return; }

      await apiPost(`/api/purchasing/receive/${id}`, { items });
      toast("PO received — inventory updated", "success");
      loadOrders();
      loadDeliveries();
      loadRecommendations();
      setReceiveModalOpen(false);
      setReceivingPOId(null);
      setReceivingQty({});
      if (selectedPO && selectedPO.id === id) viewPO(id);
      setConfirmReceivePO(null);
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSavingReceive(false);
    }
  }

  async function openReceiveModal(poId: number) {
    setReceivingPOId(poId);
    try {
      const po = await apiGet<PurchaseOrder>(`/api/purchasing/orders/${poId}`);
      setReceivingPOItems(po.items || []);
      const qty: Record<number, any> = {};
      for (const item of (po.items || [])) {
        const outstanding = (item.quantity || 0) - ((item.received_quantity || 0) + (item.quantity_damaged || 0) + (item.quantity_backordered || 0));
        qty[item.id] = { rcvd: outstanding > 0 ? outstanding : 0, dmg: 0, back: 0, bin: "", note: "" };
      }
      setReceivingQty(qty);
      setReceiveModalOpen(true);
    } catch (err: any) {
      toast(err.message, "error");
    }
  }

  async function loadReceiveHistory(poId: number) {
    setViewHistoryPOId(poId);
    try {
      const history = await apiGet<ReceivingEvent[]>(`/api/purchasing/receive/${poId}/history`);
      setReceiveHistory(history);
    } catch { setReceiveHistory([]); }
  }


  function openCreatePOFromRec(rec?: Recommendation) {
    setPreselectedSupplierId(rec?.supplier_id ?? null);
    setCreatePOModal(true);
  }

  // ── Tab config ─────────────────────────────────────────────────────

  const tabConfig = [
    { id: "recommendations", label: "🔍 Recommendations" },
    { id: "suppliers", label: "🏢 Suppliers" },
    { id: "orders", label: "📋 Orders" },
    { id: "receiving", label: "📥 Receiving" },
  ];

  // ── Map status for Badge ───────────────────────────────────────────

  function mapStatus(status: string): "success" | "warning" | "danger" | "info" {
    const map: Record<string, "success" | "warning" | "danger" | "info"> = {
      draft: "info",
      ordered: "info",
      received: "success",
      cancelled: "danger",
    };
    return map[status] || "info";
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title="📦 Purchasing" description="Suppliers, purchase orders & reorder intelligence" />

      {error && <ErrorBanner message={error} onRetry={() => setError(null)} />}

      <Tabs tabs={tabConfig} active={activeTab} onChange={setActiveTab} />

      {/* ── RECOMMENDATIONS TAB ────────────────────────────────────── */}
      {activeTab === "recommendations" && (
        <div className="space-y-4">
          {loadingRecs ? (
            <div className="space-y-4">
              <Skeleton variant="card" />
              <Skeleton variant="card" />
              <Skeleton variant="card" />
            </div>
          ) : recommendations.length === 0 ? (
            <EmptyState icon="✅" title="All stocked up!" description="No products need reordering right now." />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-rose-400">{recommendations.length} recommendation(s)</p>
                <Button variant="primary" onClick={() => openCreatePOFromRec()}>+ Create PO</Button>
              </div>
              {recommendations.map(rec => (
                <div key={rec.product_id}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-rose-100 hover:shadow-md hover:border-rose-200 transition-all duration-300 card-lift">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-bold text-[#121212] font-[family-name:var(--font-heading)]">{rec.product_name}</h3>
                        <span className="text-xs text-rose-400 font-mono">{rec.sku}</span>
                        <Badge urgency={rec.urgency}>{rec.urgency === "now" ? "Reorder Now" : rec.urgency === "soon" ? "Reorder Soon" : "OK"}</Badge>
                      </div>
                      <p className="text-sm text-rose-500 mt-2 leading-relaxed">{rec.explanation}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                        <div className="bg-rose-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-rose-400">Current Stock</p>
                          <p className="text-lg font-bold text-[#121212]">{rec.current_stock}</p>
                        </div>
                        <div className="bg-rose-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-rose-400">Daily Velocity</p>
                          <p className="text-lg font-bold text-[#121212]">{rec.daily_velocity}</p>
                        </div>
                        <div className="bg-rose-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-rose-400">Days Remaining</p>
                          <p className="text-lg font-bold text-[#121212]">{rec.days_remaining}</p>
                        </div>
                        <div className="bg-rose-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-rose-400">Reorder Qty</p>
                          <p className="text-lg font-bold text-rose-600">{rec.reorder_qty}</p>
                        </div>
                      </div>
                      {rec.supplier_name && (
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          <span className="text-rose-400">Supplier:</span>
                          <span className="font-semibold text-[#121212]">{rec.supplier_name}</span>
                          {rec.unit_cost != null && <span className="text-rose-400">@ ${rec.unit_cost}/{rec.unit_type}</span>}
                        </div>
                      )}
                    </div>
                    <Button variant="primary" onClick={() => openCreatePOFromRec(rec)}>Create PO</Button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── SUPPLIERS TAB ──────────────────────────────────────────── */}
      {activeTab === "suppliers" && (
        <div className="flex gap-6">
          <div className={`flex-1 space-y-3 ${selectedSupplier ? "hidden sm:block sm:w-64" : ""}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-rose-400">{suppliers.length} supplier(s)</p>
              <Button variant="primary" onClick={openAddSupplier}>+ Add Supplier</Button>
            </div>
            {selectedSupplier && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedSupplier(null)} className="sm:hidden mb-2">
                ← Back to list
              </Button>
            )}
            {loadingSuppliers ? (
              <div className="space-y-3">
                <Skeleton variant="card" />
                <Skeleton variant="card" />
              </div>
            ) : suppliers.length === 0 ? (
              <EmptyState icon="🏢" title="No suppliers yet" description="Add your first supplier to track costs and lead times"
                action={{ label: "Add Supplier", onClick: openAddSupplier }} />
            ) : (
              suppliers.map(s => (
                <div key={s.id} onClick={() => viewSupplier(s.id)}
                  className={`bg-white rounded-2xl p-4 shadow-sm border cursor-pointer transition-all duration-200 hover:shadow-md hover:border-rose-200 card-lift
                    ${selectedSupplier?.supplier.id === s.id ? "border-rose-400 ring-2 ring-rose-200" : "border-rose-100"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-[#121212]">{s.name}</h3>
                      {s.contact_name && <p className="text-xs text-rose-400">{s.contact_name}</p>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); openEditSupplier(s); }} className="text-rose-400 hover:text-rose-600 text-sm px-2">✏️</button>
                  </div>
                </div>
              ))
            )}
          </div>

          {selectedSupplier && (
            <div className="flex-1 bg-white rounded-2xl p-5 shadow-sm border border-rose-100 space-y-4 max-h-[600px] overflow-y-auto">
              {loadingSupplierDetail ? (
                <div className="space-y-3">
                  <Skeleton variant="card" />
                  <Skeleton variant="card" />
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-[#121212] font-[family-name:var(--font-heading)]">{selectedSupplier.supplier.name}</h2>
                      {selectedSupplier.supplier.contact_name && <p className="text-sm text-rose-500">{selectedSupplier.supplier.contact_name}</p>}
                      {selectedSupplier.supplier.email && <p className="text-sm text-rose-400">📧 {selectedSupplier.supplier.email}</p>}
                      {selectedSupplier.supplier.phone && <p className="text-sm text-rose-400">📞 {selectedSupplier.supplier.phone}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEditSupplier(selectedSupplier.supplier)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => setConfirmDeleteSupplier(selectedSupplier.supplier.id)}>Delete</Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-rose-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-rose-400">Total POs</p>
                      <p className="text-lg font-bold text-[#121212]">{selectedSupplier.totalPOs}</p>
                    </div>
                    <div className="bg-rose-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-rose-400">Avg Lead Time</p>
                      <p className="text-lg font-bold text-[#121212]">{selectedSupplier.avgActualLeadTime != null ? `${selectedSupplier.avgActualLeadTime}d` : "—"}</p>
                    </div>
                    <div className="bg-rose-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-rose-400">Quoted Avg</p>
                      <p className="text-lg font-bold text-[#121212]">{selectedSupplier.avgQuotedLeadTime != null ? `${selectedSupplier.avgQuotedLeadTime}d` : "—"}</p>
                    </div>
                  </div>
                  {selectedSupplier.leadTimeDelta != null && (
                    <p className={`text-sm ${selectedSupplier.leadTimeDelta > 0 ? "text-red-500" : "text-green-500"}`}>
                      {selectedSupplier.leadTimeDelta > 0 ? "⚠️" : "✅"} Actual lead time is {Math.abs(selectedSupplier.leadTimeDelta)} days
                      {selectedSupplier.leadTimeDelta > 0 ? " slower" : " faster"} than quoted.
                    </p>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-[#121212]">Products ({selectedSupplier.supplier.products.length})</h3>
                      <Button variant="primary" size="sm" onClick={() => openLinkProduct(selectedSupplier.supplier.id)}>+ Link</Button>
                    </div>
                    {selectedSupplier.supplier.products.length === 0 ? (
                      <p className="text-sm text-rose-400">No products linked yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedSupplier.supplier.products.map(sp => (
                          <div key={sp.id} className="flex items-center justify-between bg-rose-50/50 rounded-xl p-3">
                            <div>
                              <p className="font-semibold text-[#121212] text-sm">{sp.product_name}</p>
                              <p className="text-xs text-rose-400">{sp.product_sku}</p>
                              {sp.supplier_sku && <p className="text-xs text-rose-300">Supplier SKU: {sp.supplier_sku}</p>}
                            </div>
                            <div className="text-right">
                              {sp.unit_cost != null && <p className="text-sm font-bold text-[#121212]">${sp.unit_cost}/{sp.unit_type}</p>}
                              {sp.quoted_lead_time_days != null && <p className="text-xs text-rose-400">{sp.quoted_lead_time_days}d lead</p>}
                              {sp.is_preferred ? <span className="text-xs text-rose-500">⭐ Preferred</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedSupplier.recentPOs.length > 0 && (
                    <div>
                      <h3 className="font-bold text-[#121212] mb-2">Recent Orders</h3>
                      <div className="space-y-1">
                        {selectedSupplier.recentPOs.slice(0, 5).map(po => (
                          <div key={po.id} className="flex items-center justify-between text-sm py-1">
                            <span>PO #{po.id} — {po.item_count} items</span>
                            <Badge status={mapStatus(po.status)}>{po.status}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ORDERS TAB ─────────────────────────────────────────────── */}
      {activeTab === "orders" && (
        <div className="flex gap-6">
          <div className={`flex-1 space-y-3 ${selectedPO ? "hidden sm:block sm:w-64" : ""}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-rose-400">{orders.length} order(s)</p>
              <Button variant="primary" onClick={() => openCreatePOFromRec()}>+ New PO</Button>
            </div>
            {selectedPO && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedPO(null)} className="sm:hidden mb-2">
                ← Back to list
              </Button>
            )}
            {loadingOrders ? (
              <div className="space-y-3">
                <Skeleton variant="card" />
                <Skeleton variant="card" />
              </div>
            ) : orders.length === 0 ? (
              <EmptyState icon="📋" title="No purchase orders yet" description="Create your first purchase order from the recommendations tab" />
            ) : (
              orders.map(po => (
                <div key={po.id} onClick={() => viewPO(po.id)}
                  className={`bg-white rounded-2xl p-4 shadow-sm border cursor-pointer transition-all duration-200 hover:shadow-md hover:border-rose-200 card-lift
                    ${selectedPO?.id === po.id ? "border-rose-400 ring-2 ring-rose-200" : "border-rose-100"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-[#121212]">PO #{po.id}</p>
                      <p className="text-xs text-rose-400">{po.supplier_name}</p>
                    </div>
                    <Badge status={mapStatus(po.status)}>{po.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>

          {selectedPO && (
            <div className="flex-1 bg-white rounded-2xl p-5 shadow-sm border border-rose-100 space-y-4">
              {loadingPO ? (
                <div className="space-y-3">
                  <Skeleton variant="card" />
                  <Skeleton variant="card" />
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-[#121212] font-[family-name:var(--font-heading)]">PO #{selectedPO.id}</h2>
                      <p className="text-sm text-rose-500">{selectedPO.supplier_name}</p>
                      <div className="mt-1"><Badge status={mapStatus(selectedPO.status)}>{selectedPO.status}</Badge></div>
                    </div>
                    <div className="flex gap-2">
                      {selectedPO.status === "draft" && <Button variant="primary" size="sm" onClick={() => handleOrderPO(selectedPO.id)}>Mark Ordered</Button>}
                      {selectedPO.status === "ordered" && <Button variant="primary" size="sm" onClick={() => setConfirmReceivePO(selectedPO.id)} loading={savingReceive}>Receive</Button>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {selectedPO.order_date && <div><span className="text-rose-400">Order Date:</span> {selectedPO.order_date}</div>}
                    {selectedPO.expected_delivery && <div><span className="text-rose-400">Expected:</span> {selectedPO.expected_delivery}</div>}
                    {selectedPO.received_date && <div><span className="text-rose-400">Received:</span> {selectedPO.received_date}</div>}
                    {selectedPO.notes && <div className="col-span-2"><span className="text-rose-400">Notes:</span> {selectedPO.notes}</div>}
                  </div>
                  <div>
                    <h3 className="font-bold text-[#121212] mb-2">Line Items</h3>
                    {!selectedPO.items || selectedPO.items.length === 0 ? (
                      <p className="text-sm text-rose-400">No items.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedPO.items.map(item => (
                          <div key={item.id} className="flex items-center justify-between bg-rose-50/50 rounded-xl p-3">
                            <div>
                              <p className="font-semibold text-[#121212] text-sm">{item.product_name}</p>
                              <p className="text-xs text-rose-400">{item.product_sku}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-[#121212]">{item.quantity} × {item.unit_cost != null ? `$${item.unit_cost}` : "—"}</p>
                              {item.total_cost != null && <p className="text-xs text-rose-500">Total: ${item.total_cost}</p>}
                              {item.received_quantity > 0 && <p className="text-xs text-green-600">Received: {item.received_quantity}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── RECEIVING TAB (V3.2) ──────────────────────────────────── */}
      {activeTab === "receiving" && (
        <div className="space-y-4">
          {loadingDeliveries ? (
            <div className="space-y-3"><Skeleton variant="card"/><Skeleton variant="card"/></div>
          ) : deliveries.length === 0 ? (
            <EmptyState icon="📥" title="No expected deliveries" description="All POs have been received or none are on order." />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-rose-400">{deliveries.length} delivery(s) expected</p>
              </div>
              {deliveries.map(d => {
                const isOverdue = d.expected_delivery && d.expected_delivery < new Date().toISOString().split('T')[0];
                const pct = d.total_ordered > 0 ? Math.round((d.total_received / d.total_ordered) * 100) : 0;
                return (
                  <div key={d.id} className="bg-white rounded-2xl p-5 shadow-sm border border-rose-100 hover:shadow-md transition-all duration-300 card-lift">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-[#121212]">{d.supplier_name}</h3>
                          <Badge status={mapStatus(d.status)}>{d.status}</Badge>
                          {isOverdue && <Badge status="danger">Overdue</Badge>}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-sm">
                          <div><span className="text-rose-400">Expected:</span> <span className="font-semibold">{d.expected_delivery || "—"}</span></div>
                          <div><span className="text-rose-400">Items:</span> <span className="font-semibold">{d.item_count}</span></div>
                          <div><span className="text-rose-400">Ordered:</span> <span className="font-semibold">{d.total_ordered}</span></div>
                          <div><span className="text-rose-400">Received:</span> <span className="font-semibold">{d.total_received}</span></div>
                        </div>
                        <ProgressBar value={pct} className="mt-2" />
                        {d.carrier && <p className="text-xs text-rose-400 mt-1">{d.carrier}{d.tracking_number ? ` • ${d.tracking_number}` : ""}</p>}
                        {d.notes && <p className="text-xs text-rose-500 mt-1 italic">{d.notes}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="primary" size="sm" onClick={() => openReceiveModal(d.id)}>Receive</Button>
                        <Button variant="ghost" size="sm" onClick={() => { loadReceiveHistory(d.id); }}>History</Button>
                      </div>
                    </div>
                    {/* Inline history */}
                    {viewHistoryPOId === d.id && (
                      <div className="mt-4 pt-4 border-t border-rose-100">
                        <h4 className="text-sm font-bold text-[#121212] mb-2">Receiving History</h4>
                        {receiveHistory.length === 0 ? (
                          <p className="text-sm text-rose-400">No receiving events yet.</p>
                        ) : (
                          <div className="space-y-1 max-h-[200px] overflow-y-auto">
                            {receiveHistory.map(ev => (
                              <div key={ev.id} className="text-sm flex justify-between py-1">
                                <span>{ev.product_name} — <span className="text-green-600">+{ev.quantity_received}</span>
                                  {ev.quantity_damaged > 0 && <span className="text-orange-500"> / {ev.quantity_damaged} damaged</span>}
                                  {ev.quantity_backordered > 0 && <span className="text-rose-500"> / {ev.quantity_backordered} backordered</span>}
                                </span>
                                <span className="text-rose-400 text-xs">{ev.created_at?.split('T')[0]}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── Supplier Form Modal ────────────────────────────────────── */}
      <Modal open={supplierModalOpen} onClose={() => setSupplierModalOpen(false)}
        title={editingSupplier ? "Edit Supplier" : "Add Supplier"} size="md">
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-rose-500 mb-1">Name *</label>
            <input name="name" defaultValue={editingSupplier?.name || ""} required
              className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-rose-500 mb-1">Contact Name</label>
            <input name="contactName" defaultValue={editingSupplier?.contact_name || ""}
              className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-rose-500 mb-1">Email</label>
              <input name="email" type="email" defaultValue={editingSupplier?.email || ""}
                className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-rose-500 mb-1">Phone</label>
              <input name="phone" defaultValue={editingSupplier?.phone || ""}
                className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-rose-500 mb-1">Website</label>
            <input name="website" defaultValue={editingSupplier?.website || ""}
              className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-rose-500 mb-1">Notes</label>
            <textarea name="notes" defaultValue={editingSupplier?.notes || ""} rows={3}
              className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setSupplierModalOpen(false)} className="flex-1">Cancel</Button>
            <Button variant="primary" type="submit" loading={savingSupplier} className="flex-1">
              {editingSupplier ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Link Product Modal ─────────────────────────────────────── */}
      <Modal open={linkModalOpen} onClose={() => setLinkModalOpen(false)} title="Link Product to Supplier" size="md">
        <form onSubmit={handleLinkProduct} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-rose-500 mb-1">Product *</label>
            <select name="productId" required
              className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50">
              <option value="">Select a product...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-rose-500 mb-1">Supplier SKU</label>
              <input name="supplierSku"
                className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-rose-500 mb-1">Unit Cost</label>
              <input name="unitCost" type="number" step="0.01"
                className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-rose-500 mb-1">Unit Type</label>
              <input name="unitType" defaultValue="unit"
                className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-rose-500 mb-1">Min Order</label>
              <input name="minOrderQty" type="number" defaultValue={1}
                className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-rose-500 mb-1">Lead Time (days)</label>
              <input name="quotedLeadTimeDays" type="number"
                className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" name="isPreferred" className="rounded border-rose-300 text-rose-500 focus:ring-rose-300" />
            <span className="text-sm text-rose-500">Set as preferred supplier for this product</span>
          </label>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setLinkModalOpen(false)} className="flex-1">Cancel</Button>
            <Button variant="primary" type="submit" loading={savingLink} className="flex-1">Link</Button>
          </div>
        </form>
      </Modal>

      {/* ── Create PO Modal ────────────────────────────────────────── */}
      <Modal open={createPOModal} onClose={() => { setCreatePOModal(false); setPreselectedSupplierId(null); }} title="Create Purchase Order" size="md">
        <form onSubmit={handleCreatePO} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-rose-500 mb-1">Supplier *</label>
            <select name="supplierId" required defaultValue={preselectedSupplierId ?? ""}
              className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50">
              <option value="">Select supplier...</option>
              {suppliers.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-rose-500 mb-1">Expected Delivery</label>
              <input name="expectedDelivery" type="date"
                className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-rose-500 mb-1">Notes</label>
              <input name="notes"
                className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
            </div>
          </div>
          {recommendations.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-rose-500 mb-2">Add from recommendations:</p>
              <div className="max-h-[200px] overflow-y-auto space-y-1 bg-rose-50/30 rounded-xl p-2">
                {recommendations.map(rec => (
                  <label key={rec.product_id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-rose-50 cursor-pointer">
                    <input type="checkbox" name="rec_items" value={rec.product_id} className="rounded border-rose-300 text-rose-500 focus:ring-rose-300" />
                    <span className="text-sm text-[#121212] flex-1">{rec.product_name}</span>
                    <span className="text-xs text-rose-400">{rec.reorder_qty} {rec.unit_type}</span>
                    {rec.supplier_name && <span className="text-xs text-rose-300">{rec.supplier_name}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => { setCreatePOModal(false); setPreselectedSupplierId(null); }} className="flex-1">Cancel</Button>
            <Button variant="primary" type="submit" loading={savingPO} className="flex-1">Create PO</Button>
          </div>
        </form>
      </Modal>

      {/* ── Receive Modal (V3.2) ─────────────────────────────────────── */}
      <Modal open={receiveModalOpen} onClose={() => { setReceiveModalOpen(false); setReceivingPOId(null); setReceivingQty({}); }} title="Receive Purchase Order" size="lg">
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {receivingPOItems.map(item => {
            const q = receivingQty[item.id] || { rcvd: 0, dmg: 0, back: 0, bin: "", note: "" };
            const outstanding = (item.quantity || 0) - ((item.received_quantity || 0) + (item.quantity_damaged || 0) + (item.quantity_backordered || 0));
            return (
              <div key={item.id} className="bg-rose-50/50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-bold text-[#121212] text-sm">{item.product_name}</p>
                    <p className="text-xs text-rose-400">{item.product_sku} • Ordered: {item.quantity} • Outstanding: {Math.max(0, outstanding)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-rose-400">Received</label>
                    <input type="number" min="0" value={q.rcvd} onChange={e => setReceivingQty(prev => ({...prev, [item.id]: {...q, rcvd: Number(e.target.value)}}))}
                      className="touch-target w-full px-3 py-2 border border-rose-200 rounded-xl text-sm focus:border-rose-400 outline-none bg-white" />
                  </div>
                  <div>
                    <label className="text-xs text-rose-400">Damaged</label>
                    <input type="number" min="0" value={q.dmg} onChange={e => setReceivingQty(prev => ({...prev, [item.id]: {...q, dmg: Number(e.target.value)}}))}
                      className="touch-target w-full px-3 py-2 border border-rose-200 rounded-xl text-sm focus:border-rose-400 outline-none bg-white" />
                  </div>
                  <div>
                    <label className="text-xs text-rose-400">Backordered</label>
                    <input type="number" min="0" value={q.back} onChange={e => setReceivingQty(prev => ({...prev, [item.id]: {...q, back: Number(e.target.value)}}))}
                      className="touch-target w-full px-3 py-2 border border-rose-200 rounded-xl text-sm focus:border-rose-400 outline-none bg-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-rose-400">Bin Location</label>
                    <input type="text" value={q.bin} onChange={e => setReceivingQty(prev => ({...prev, [item.id]: {...q, bin: e.target.value}}))}
                      className="touch-target w-full px-3 py-2 border border-rose-200 rounded-xl text-sm focus:border-rose-400 outline-none bg-white" placeholder="e.g. A-12" />
                  </div>
                  <div>
                    <label className="text-xs text-rose-400">Note</label>
                    <input type="text" value={q.note} onChange={e => setReceivingQty(prev => ({...prev, [item.id]: {...q, note: e.target.value}}))}
                      className="touch-target w-full px-3 py-2 border border-rose-200 rounded-xl text-sm focus:border-rose-400 outline-none bg-white" placeholder="Optional" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 mt-4">
          <Button variant="secondary" onClick={() => { setReceiveModalOpen(false); setReceivingPOId(null); setReceivingQty({}); }} className="flex-1">Cancel</Button>
          <Button variant="primary" onClick={() => receivingPOId && handleReceivePO(receivingPOId)} loading={savingReceive} className="flex-1">Receive Items</Button>
        </div>
      </Modal>

      {/* ── Confirm Modals ──────────────────────────────────────────── */}
      <ConfirmModal
        open={!!confirmDeleteSupplier}
        onClose={() => setConfirmDeleteSupplier(null)}
        onConfirm={() => { if (confirmDeleteSupplier) { return handleDeleteSupplier(confirmDeleteSupplier); } }}
        title="Delete Supplier"
        message="Delete this supplier and all product links?"
        confirmLabel="Delete"
      />

      <ConfirmModal
        open={!!confirmReceivePO}
        onClose={() => setConfirmReceivePO(null)}
        onConfirm={() => { if (confirmReceivePO) { return handleReceivePO(confirmReceivePO); } }}
        title="Receive PO"
        message="Mark this PO as received? This will increment inventory for all items."
        confirmLabel="Receive"
        confirmVariant="primary"
      />
    </div>
  );
}
