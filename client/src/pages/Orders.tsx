import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost, apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { PageHeader, Button, Badge, Skeleton, EmptyState, ErrorBanner, ProgressBar, Modal, ConfirmModal, useToast } from "../components/ui";
import Novi from "../components/Novi";
import OperationsCenter from "../components/OperationsCenter";
import NoviEngineInsight from "../components/novi/NoviEngineInsight";
import { getDemoInsights } from "../lib/businessDna";
import { useTerms } from "../context/IndustryContext";
// ── Types ─────────────────────────────────────────────────────────────

interface OrderSummary {
  id: number;
  shopify_order_id: string | null;
  order_number: number;
  customer_name: string;
  customer_email?: string;
  source: string;
  status: "pending" | "picking" | "complete" | "cancelled" | "combined";
  created_at: string;
  imported_at: string | null;
  item_count: number;
  total_qty: number;
  scanned_items: number;
  total_amount: number | null;
}

interface OrderItem {
  id: number;
  sku: string;
  variant_title: string | null;
  quantity: number;
  scanned_quantity: number;
  unit_price: number | null;
  line_total: number | null;
  variant_id: number | null;
  product_id: number | null;
  product_name: string | null;
  barcode: string | null;
}

interface OrderDetail {
  id: number;
  shopify_order_id: string | null;
  order_number: number;
  customer_name: string;
  customer_email: string | null;
  shipping_address: string | null;
  source: string;
  status: string;
  notes: string | null;
  total_amount: number | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  imported_at: string | null;
  items: OrderItem[];
}

interface CombineSuggestion {
  customerEmail: string;
  customerName: string;
  orderIds: number[];
  orderNumbers: number[];
  orderCount: number;
  combinedTotal: number;
  estimatedIndividualShipping: number;
  estimatedCombinedShipping: number;
  estimatedSavings: number;
  savingsPercent: number;
}

interface ScanResult {
  success: boolean;
  verified?: boolean;
  mismatch?: boolean;
  over?: boolean;
  error?: string;
  item?: OrderItem;
  remaining?: number;
  orderStatus?: string;
  barcode?: string;
}

interface SyncOrderDiff {
  order: { order_number: number; customer_name: string };
  already_imported?: boolean;
  items: SyncDiffItem[];
}

interface SyncDiffItem {
  sku: string;
  name: string;
  variant_title?: string;
  quantity: number;
  current_stock: number | null;
  would_become: number | null;
  matched: boolean;
  warning: string | null;
}

interface SyncResult {
  success: boolean;
  mode?: "readonly" | "full";
  imported: number;
  orders: any[];
  diffs?: SyncOrderDiff[];
  message?: string;
}

interface ProductSearchResult {
  id: number;
  name: string;
  sku: string;
  stock_count: number;
  variant_id: number | null;
  variant_sku: string | null;
  variant_value: string | null;
  price: number | null;
  cost: number | null;
  variant_stock: number | null;
}

const SOURCE_BADGES: Record<string, { label: string; color: "blue" | "purple" | "green" | "orange" | "pink" | "slate" | "amber" | "red" }> = {
  shopify: { label: "Shopify", color: "green" },
  manual: { label: "Manual", color: "slate" },
  phone: { label: "Phone", color: "blue" },
  wholesale: { label: "Wholesale", color: "purple" },
  walkin: { label: "Walk-in", color: "amber" },
  invoice: { label: "Invoice", color: "orange" },
  replacement: { label: "Replacement", color: "pink" },
  sample: { label: "Sample", color: "red" },
};

const SOURCE_OPTIONS = [
  { value: "", label: "All" },
  { value: "shopify", label: "Shopify" },
  { value: "manual", label: "Manual" },
  { value: "phone", label: "Phone" },
  { value: "wholesale", label: "Wholesale" },
  { value: "walkin", label: "Walk-in" },
  { value: "invoice", label: "Invoice" },
  { value: "replacement", label: "Replacement" },
  { value: "sample", label: "Sample" },
];

// ── Page Component ────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatCurrency(val: number | null | undefined) {
  if (val == null) return "—";
  return `$${val.toFixed(2)}`;
}

export default function Orders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  const [shopifyConfigured, setShopifyConfigured] = useState<boolean | null>(null);
  const [syncMode, setSyncMode] = useState<"readonly" | "full" | null>(null);
  const [switchingMode, setSwitchingMode] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // Filters
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEnableConfirm, setShowEnableConfirm] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  // New order form state
  const [newOrderStep, setNewOrderStep] = useState(1);
  const [newOrderSource, setNewOrderSource] = useState("manual");
  const [newOrderCustomer, setNewOrderCustomer] = useState({ name: "", email: "", notes: "" });
  const [newOrderItems, setNewOrderItems] = useState<{
    productId: number | null;
    variantId: number | null;
    sku: string;
    variantTitle: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Store credit for new orders
  const [availableCredit, setAvailableCredit] = useState<{ totalBalance: number; credits: any[] } | null>(null);
  const [applyCredit, setApplyCredit] = useState(false);
  const [, setCreditApplied] = useState<{ amount: number; code: string } | null>(null);
  const [, setCheckingCredit] = useState(false);

  // Edits in detail modal
  const [editCustomer, setEditCustomer] = useState({ name: "", email: "" });
  const [editingCustomer, setEditingCustomer] = useState(false);

  const [barcodeInput, setBarcodeInput] = useState("");
  const barcodeRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // ── V2: Combine Shipments ─────────────────────────────────────────
  const [combineSuggestions, setCombineSuggestions] = useState<CombineSuggestion[]>([]);
  const [showCombineModal, setShowCombineModal] = useState(false);
  const [selectedCombineSuggestion, setSelectedCombineSuggestion] = useState<CombineSuggestion | null>(null);
  const [combiningOrders, setCombiningOrders] = useState(false);
  const [combineDismissed, setCombineDismissed] = useState(false);

  // ── V2: Operations Center ─────────────────────────────────────────
  const [opsOrderId, setOpsOrderId] = useState<number | null>(null);
  const [opsOrderNumber, setOpsOrderNumber] = useState<number>(0);
  const [opsCustomerName, setOpsCustomerName] = useState<string>("");

  // ── P4.2: Provider Management ──────────────────────────────────────
  interface ProviderInfo {
    slug: string;
    label: string;
    icon: string;
    description: string;
    requiresSetup: boolean;
    connectionStatus: string;
    isActive: boolean;
    lastSyncedAt: string | null;
  }
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [showProviderConnect, setShowProviderConnect] = useState<string | null>(null);
  const [connectForm, setConnectForm] = useState<Record<string, string>>({});
  const [connectingProvider, setConnectingProvider] = useState(false);

  const fetchProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const data = await apiGet("/api/commerce/providers");
      setProviders(data);
    } catch { /* silent */ }
    finally { setProvidersLoading(false); }
  }, []);

  const handleProviderSync = async (provider: string) => {
    setSyncingProvider(provider);
    try {
      const data = await apiPost(`/api/commerce/providers/${provider}/sync`);
      if (data.success) {
        toast(`${data.ordersImported} orders imported from ${provider}`, "success");
        fetchProviders();
        fetchOrders();
      } else {
        toast(data.error || "Sync failed", "error");
      }
    } catch (err: any) { toast(err.message || "Sync failed", "error"); }
    finally { setSyncingProvider(null); }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const data = await apiPost("/api/commerce/sync-all");
      if (data.success) {
        const total = data.results.reduce((s: number, r: any) => s + (r.ordersImported || 0), 0);
        toast(`${total} total orders imported across ${data.results.length} providers`, "success");
        fetchProviders();
        fetchOrders();
      }
    } catch (err: any) { toast(err.message || "Sync failed", "error"); }
    finally { setSyncingAll(false); }
  };

  const handleConnectProvider = async (provider: string) => {
    setConnectingProvider(true);
    try {
      await apiPost(`/api/commerce/providers/${provider}/connect`, {
        credentials: connectForm,
        isActive: true,
      });
      toast(`Connected to ${provider}`, "success");
      setShowProviderConnect(null);
      setConnectForm({});
      fetchProviders();
    } catch (err: any) { toast(err.message || "Connection failed", "error"); }
    finally { setConnectingProvider(false); }
  };

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  const fetchShopifyStatus = useCallback(async () => {
    try {
      const data = await apiGet("/api/shopify/status");
      setShopifyConfigured(data.configured);
      setSyncMode(data.syncMode || "readonly");
    } catch { setShopifyConfigured(false); }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (sourceFilter) params.set("source", sourceFilter);
      if (searchQuery) params.set("search", searchQuery);
      const qs = params.toString();
      const data = await apiGet(`/api/orders${qs ? "?" + qs : ""}`);
      setOrders(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [sourceFilter, searchQuery]);

  const fetchCombineSuggestions = useCallback(async () => {
    if (combineDismissed) return;
    try {
      const data = await apiGet("/api/fulfillment/combine-suggestions");
      if (data && data.suggestions && data.suggestions.length > 0) {
        setCombineSuggestions(data.suggestions);
      } else {
        setCombineSuggestions([]);
      }
    } catch { setCombineSuggestions([]); }
  }, [combineDismissed]);

  const handleCombineOrders = async (suggestion: CombineSuggestion) => {
    setCombiningOrders(true);
    try {
      const data = await apiPost("/api/fulfillment/combine-shipments", {
        orderIds: suggestion.orderIds,
        savingsEstimate: suggestion.estimatedSavings,
      });
      if (data.success) {
        toast(`💜 Combined ${suggestion.orderCount} orders! Saved ${formatCurrency(suggestion.estimatedSavings)} in shipping`, "success");
        setShowCombineModal(false);
        setSelectedCombineSuggestion(null);
        setCombineSuggestions(prev => prev.filter(s => s.customerEmail !== suggestion.customerEmail));
        fetchOrders();
      } else {
        toast(data.error || "Failed to combine orders", "error");
      }
    } catch (err: any) { toast(err.message || "Failed to combine orders", "error"); }
    finally { setCombiningOrders(false); }
  };

  const fetchOrderDetail = useCallback(async (orderId: number) => {
    setDetailLoading(true);
    try {
      const data = await apiGet(`/api/orders/${orderId}`);
      setOrderDetail(data);
      setEditCustomer({ name: data.customer_name || "", email: data.customer_email || "" });
      setShowCelebration(data.status === "complete");
    } catch { /* silent */ }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => { fetchShopifyStatus().then(() => fetchOrders()); }, [fetchShopifyStatus, fetchOrders]);
  useEffect(() => { fetchCombineSuggestions(); }, [fetchCombineSuggestions]);

  // ── URL callback detection (shopify_connected=true) ────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("shopify_connected");
    const errorMsg = params.get("shopify_error");

    if (connected === "true") {
      const url = new URL(window.location.href);
      url.searchParams.delete("shopify_connected");
      url.searchParams.delete("shopify_error");
      window.history.replaceState({}, "", url.toString());
      fetchShopifyStatus().then(() => {
        fetchProviders();
        fetchOrders();
        toast("🎉 Shopify connected! Your store is now linked.", "success");
      });
    } else if (errorMsg) {
      toast(errorMsg, "error");
      const url = new URL(window.location.href);
      url.searchParams.delete("shopify_connected");
      url.searchParams.delete("shopify_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (selectedOrderId && barcodeRef.current) barcodeRef.current.focus();
    const handleClick = () => { if (selectedOrderId && barcodeRef.current) barcodeRef.current.focus(); };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [selectedOrderId]);

  // ── Actions ─────────────────────────────────────────────────────────

  const handleSync = async () => {
    setSyncing(true);
    setLastSyncResult(null);
    try {
      const data: SyncResult = await apiPost("/api/orders/sync");
      if (data.success) {
        if (data.diffs && data.diffs.length > 0) {
          toast("Sync complete — review the diff below", "info");
          setLastSyncResult(data);
          setShowDiff(true);
        } else {
          toast(`${data.imported} new orders imported`, "success");
        }
        fetchOrders();
      } else {
        toast("Sync failed", "error");
      }
    } catch (err: any) { toast(err.message || "Network error", "error"); }
    finally { setSyncing(false); }
  };

  const handleEnableSync = async () => {
    if (!isAdmin) return;
    setSwitchingMode(true);
    try {
      const data = await apiPost("/api/shopify/sync-mode", { mode: "full" });
      setSyncMode(data.mode);
      toast("Live Sync Active — inventory updates are now enabled", "success");
    } catch (err: any) { toast(err.message || "Could not enable sync", "error"); }
    finally { setSwitchingMode(false); }
  };

  const handleScanBarcode = async (barcode: string) => {
    if (processingRef.current || !selectedOrderId) return;
    if (!barcode || !barcode.trim()) return;
    barcode = barcode.trim();
    processingRef.current = true;
    try {
      const res = await apiFetch(`/api/orders/${selectedOrderId}/scan`, {
        method: "POST", body: JSON.stringify({ barcode }), headers: { "Content-Type": "application/json" },
      });
      const data: ScanResult = await res.json();
      if (data.success && data.verified) {
        toast(`${data.item?.product_name || data.item?.sku || "Item"} — ✅ Verified`, "success");
        if (data.orderStatus === "complete") {
          setShowCelebration(true);
          toast("🎉 Order Complete! All items have been verified", "success");
        }
        fetchOrderDetail(selectedOrderId);
      } else if (data.mismatch) {
        toast("❌ Wrong Item! This item is NOT in this order!", "error");
      } else if (data.over) {
        toast("Already Picked — this item is fully picked", "error");
      } else {
        toast(data.error || "Unknown error", "error");
      }
    } catch (err: any) { toast(err.message || "Could not reach server", "error"); }
    finally { processingRef.current = false; }
  };

  const handleReset = async () => {
    if (!selectedOrderId) return;
    try {
      await apiPost(`/api/orders/${selectedOrderId}/reset`);
      setShowCelebration(false);
      toast("Scan counts have been reset", "info");
      fetchOrderDetail(selectedOrderId);
    } catch (err: any) { toast(err.message || "Reset failed", "error"); }
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); const value = barcodeInput.trim(); if (value) { handleScanBarcode(value); setBarcodeInput(""); } }
  };

  const selectOrder = (orderId: number) => { setSelectedOrderId(orderId); setShowCelebration(false); fetchOrderDetail(orderId); };
  const backToList = () => { setSelectedOrderId(null); setOrderDetail(null); setShowCelebration(false); fetchOrders(); };


  function mapStatus(status: string): "success" | "warning" | "danger" | "info" {
    const map: Record<string, "success" | "warning" | "danger" | "info"> = {
      pending: "warning", picking: "info", complete: "success", cancelled: "danger", combined: "info",
    };
    return map[status] || "info";
  }

  // ── New Order Flow ──────────────────────────────────────────────────

  const resetNewOrder = () => {
    setNewOrderStep(1);
    setNewOrderSource("manual");
    setNewOrderCustomer({ name: "", email: "", notes: "" });
    setNewOrderItems([]);
    setProductSearch("");
    setProductResults([]);
    setOrderError(null);
    setAvailableCredit(null);
    setApplyCredit(false);
    setCreditApplied(null);
  };

  const openNewOrder = () => {
    resetNewOrder();
    setShowNewOrderModal(true);
  };

  const handleProductSearch = async (query: string) => {
    setProductSearch(query);
    if (query.length < 2) { setProductResults([]); return; }
    setSearchingProducts(true);
    try {
      const data = await apiPost("/api/orders/search-products", { query });
      setProductResults(data);
    } catch { setProductResults([]); }
    finally { setSearchingProducts(false); }
  };

  const addItemToOrder = (product: ProductSearchResult) => {
    setNewOrderItems(prev => [...prev, {
      productId: product.id,
      variantId: product.variant_id,
      sku: product.variant_sku || product.sku,
      variantTitle: product.variant_value || "Default",
      productName: product.name,
      quantity: 1,
      unitPrice: product.price || 0,
    }]);
    setProductSearch("");
    setProductResults([]);
  };

  const updateOrderItem = (index: number, field: string, value: any) => {
    setNewOrderItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removeOrderItem = (index: number) => {
    setNewOrderItems(prev => prev.filter((_, i) => i !== index));
  };

  // Check customer store credit when email is entered
  async function checkCustomerCredit(email: string) {
    if (!email || !email.includes('@')) {
      setAvailableCredit(null);
      setApplyCredit(false);
      setCreditApplied(null);
      return;
    }
    setCheckingCredit(true);
    try {
      const res = await apiGet(`/api/customers/credit?email=${encodeURIComponent(email)}`);
      if (res && res.totalBalance > 0) {
        setAvailableCredit(res);
      } else {
        setAvailableCredit(null);
        setApplyCredit(false);
        setCreditApplied(null);
      }
    } catch {
      setAvailableCredit(null);
    } finally {
      setCheckingCredit(false);
    }
  }

  const submitNewOrder = async () => {
    if (!newOrderCustomer.name.trim()) { setOrderError("Customer name is required"); return; }
    if (newOrderItems.length === 0) { setOrderError("Add at least one item"); return; }

    setSubmittingOrder(true);
    setOrderError(null);
    try {
      const data = await apiPost("/api/orders/manual", {
        source: newOrderSource,
        customerName: newOrderCustomer.name.trim(),
        customerEmail: newOrderCustomer.email.trim() || undefined,
        notes: newOrderCustomer.notes.trim() || undefined,
        items: newOrderItems.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          sku: item.sku,
          variantTitle: item.variantTitle,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      });
      if (data.success) {
        // Apply store credit if selected
        if (applyCredit && availableCredit && availableCredit.totalBalance > 0) {
          try {
            const orderTotal = newOrderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
            const creditAmount = Math.min(availableCredit.totalBalance, orderTotal);
            const creditRes = await apiPost("/api/orders/apply-credit", {
              orderId: data.order.id,
              amount: creditAmount,
            });
            toast(`Order #${data.order.order_number} created! ${formatCurrency(creditRes.applied)} store credit applied.`, "success");
          } catch (creditErr: any) {
            toast(`Order #${data.order.order_number} created! (Credit application failed: ${creditErr?.message || 'error'})`, "warning");
          }
        } else {
          toast(`Order #${data.order.order_number} created!`, "success");
        }
        setShowNewOrderModal(false);
        resetNewOrder();
        fetchOrders();
      }
    } catch (err: any) {
      setOrderError(err.message || "Failed to create order");
    }
    finally { setSubmittingOrder(false); }
  };

  // ── Detail Modal Actions ────────────────────────────────────────────

  const handleUpdateOrder = async (field: string, value: any) => {
    if (!orderDetail) return;
    try {
      await apiFetch(`/api/orders/${orderDetail.id}`, {
        method: "PUT", body: JSON.stringify({ [field]: value }), headers: { "Content-Type": "application/json" },
      });
      fetchOrderDetail(orderDetail.id);
      toast("Order updated", "success");
    } catch (err: any) { toast(err.message || "Update failed", "error"); }
  };

  const handleCancelOrder = async () => {
    if (!orderDetail) return;
    try {
      await apiPost(`/api/orders/${orderDetail.id}/cancel`);
      toast(`Order #${orderDetail.order_number} cancelled`, "info");
      setShowDetailModal(false);
      fetchOrders();
      setSelectedOrderId(null);
      setOrderDetail(null);
    } catch (err: any) { toast(err.message || "Cancel failed", "error"); }
  };

  const handleAddItemToOrder = async () => {
    if (!orderDetail || !productSearch) return;
    const result = productResults[0];
    if (!result) return;
    try {
      await apiFetch(`/api/orders/${orderDetail.id}/items`, {
        method: "POST", body: JSON.stringify({
          productId: result.id,
          variantId: result.variant_id,
          sku: result.variant_sku || result.sku,
          variantTitle: result.variant_value,
          quantity: 1,
          unitPrice: result.price || 0,
        }), headers: { "Content-Type": "application/json" },
      });
      setProductSearch("");
      setProductResults([]);
      fetchOrderDetail(orderDetail.id);
      toast("Item added", "success");
    } catch (err: any) { toast(err.message || "Failed to add item", "error"); }
  };

  const handleRemoveOrderItem = async (itemId: number) => {
    if (!orderDetail) return;
    try {
      await apiFetch(`/api/orders/${orderDetail.id}/items/${itemId}`, { method: "DELETE" });
      fetchOrderDetail(orderDetail.id);
      toast("Item removed", "info");
    } catch (err: any) { toast(err.message || "Failed to remove item", "error"); }
  };

  // ── Sync Mode Banner ─────────────────────────────────────────────────
  const SyncBanner = () => {
    if (!shopifyConfigured) return null;
    if (syncMode === "full") return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 flex items-center gap-3">
        <span className="text-lg">🟢</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-emerald-700">Live Sync Active</p>
          <p className="text-xs text-emerald-600">Inventory updates are enabled — each sync decrements stock and pushes to Shopify.</p>
        </div>
      </div>
    );
    return (
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl px-5 py-3 flex items-center gap-3">
        <span className="text-lg">🟡</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-700">Read-Only Mode</p>
          <p className="text-xs text-amber-600">Inventory sync is disabled. Review your data first before enabling.</p>
        </div>
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setShowEnableConfirm(true)} disabled={switchingMode}>Enable Inventory Sync</Button>}
      </div>
    );
  };

  // ── Sync Diff Panel ──────────────────────────────────────────────────
  const DiffPanel = () => {
    if (!showDiff || !lastSyncResult?.diffs) return null;
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden card-lift">
        <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/30 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">📋 Read-Only Sync Report — What WOULD Change</h2>
          <button onClick={() => setShowDiff(false)} className="text-amber-400 hover:text-amber-600 text-lg leading-none">×</button>
        </div>
        <div className="divide-y divide-rose-50 max-h-96 overflow-y-auto">
          {lastSyncResult.diffs.map((orderDiff, odx) => (
            <div key={odx} className="px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-[#121212]">Order #{orderDiff.order.order_number}</span>
                <span className="text-xs text-rose-400">{orderDiff.order.customer_name}</span>
                {orderDiff.already_imported && <span className="text-xs bg-rose-100 text-rose-500 px-2 py-0.5 rounded-full">Already Imported</span>}
              </div>
              <table className="w-full text-xs">
                <thead><tr className="text-rose-400 border-b border-rose-50"><th className="text-left py-1 font-medium">SKU / Product</th><th className="text-center py-1 font-medium">Qty</th><th className="text-center py-1 font-medium">Current</th><th className="text-center py-1 font-medium">Would Be</th><th className="text-center py-1 font-medium">Δ</th></tr></thead>
                <tbody>
                  {orderDiff.items.map((item, idx) => (
                    <tr key={idx} className={`border-b border-rose-50/50 ${!item.matched ? "bg-rose-50/50" : ""}`}>
                      <td className="py-1.5 pr-2"><span className="font-medium text-[#121212]">{item.name || item.sku}</span><span className="text-rose-400 ml-1 font-mono">{item.sku}</span>{item.warning && <span className="block text-rose-500 font-medium">⚠️ {item.warning}</span>}</td>
                      <td className="text-center py-1.5 font-semibold">{item.quantity}</td>
                      <td className="text-center py-1.5">{item.current_stock ?? "—"}</td>
                      <td className="text-center py-1.5 font-bold text-rose-600">{item.would_become ?? "—"}</td>
                      <td className="text-center py-1.5 font-bold text-rose-500">{item.matched && item.current_stock != null && item.would_become != null ? `-${item.current_stock - item.would_become}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Loading ──────────────────────────────────────────────────────────

  if (shopifyConfigured === null || loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Orders" novi={<Novi size="sm" accessory="marketing" />} />
        <Skeleton variant="card" />
      </div>
    );
  }

  // ── Pick list view ──────────────────────────────────────────────────

  if (selectedOrderId && orderDetail) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="secondary" onClick={backToList}>← Back</Button>
          <div className="flex-1"><h1 className="text-2xl font-bold text-[#121212] font-[family-name:var(--font-heading)]">Order #{orderDetail.order_number}</h1></div>
          {orderDetail.source !== "shopify" && (
            <Button variant="secondary" size="sm" onClick={() => { setShowDetailModal(true); setEditingCustomer(false); }}>
              ✏️ Edit
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleReset}>↺ Reset Scans</Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/customers?returnOrderId=${orderDetail.id}`)}>
            ↩ Return/Refund
          </Button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 card-lift flex items-center justify-between">
          <div>
            <p className="text-sm text-rose-400">Customer</p>
            <p className="text-lg font-bold text-[#121212]">{orderDetail.customer_name}</p>
            {orderDetail.customer_email && <p className="text-sm text-rose-400">{orderDetail.customer_email}</p>}
          </div>
          <div className="flex items-center gap-3">
            {orderDetail.source && SOURCE_BADGES[orderDetail.source] && (
              <Badge status="info">{SOURCE_BADGES[orderDetail.source].label}</Badge>
            )}
            <Badge status={mapStatus(orderDetail.status)}>{orderDetail.status}</Badge>
          </div>
        </div>

        <input ref={barcodeRef} type="text" value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} onKeyDown={handleBarcodeKeyDown}
          className="absolute opacity-0 w-0 h-0 pointer-events-none" tabIndex={-1} aria-hidden="true" autoComplete="off" />

        <div className="bg-white rounded-2xl shadow-sm border-2 border-rose-400 p-4 card-lift">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📷</span>
            <div><p className="text-sm font-semibold text-rose-600">Scanner Active — Scan items to verify</p><p className="text-xs text-rose-400">Click anywhere and scan a barcode • USB scanner or manual entry works</p></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
          <div className="px-5 py-4 border-b border-rose-100"><h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">📋 Pick List ({orderDetail.items.length} items)</h2></div>
          {detailLoading ? (
            <div className="p-8"><Skeleton variant="table-row" /><Skeleton variant="table-row" /><Skeleton variant="table-row" /></div>
          ) : (
            <div className="divide-y divide-rose-50">
              {orderDetail.items.map((item) => {
                const isComplete = item.scanned_quantity >= item.quantity;
                const progressPercent = item.quantity > 0 ? Math.min(100, Math.round((item.scanned_quantity / item.quantity) * 100)) : 0;
                return (
                  <div key={item.id} className={`px-5 py-4 transition-all duration-300 ${isComplete ? "bg-emerald-50/50" : "hover:bg-rose-50/50"}`}>
                    <div className="flex items-start gap-4">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg ${isComplete ? "bg-emerald-500 text-white" : "bg-rose-100 text-rose-400"}`}>
                        {isComplete ? "✅" : "📦"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#121212]">{item.product_name || item.sku || "Unknown Product"}</p>
                        <p className="text-xs text-rose-400">{item.variant_title && <span className="mr-2">Variant: {item.variant_title}</span>}<span className="font-mono">SKU: {item.sku}</span>{item.barcode && <span className="ml-2 font-mono text-rose-300">({item.barcode})</span>}</p>
                        <div className="mt-2">
                          <ProgressBar value={progressPercent} color={isComplete ? "green" : "red"} size="sm" />
                          <span className={`text-sm font-bold ${isComplete ? "text-emerald-700" : "text-rose-600"}`}>{item.scanned_quantity} / {item.quantity}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Celebration Modal */}
        <Modal open={showCelebration} onClose={() => setShowCelebration(false)} title="🎉 Order Complete!" size="sm">
          <div className="text-center">
            <div className="text-7xl mb-4">🎉</div>
            <p className="text-rose-500 mb-2">All {orderDetail.items.length} items verified for Order #{orderDetail.order_number}</p>
            <p className="text-sm text-rose-400 mb-6">Customer: {orderDetail.customer_name}</p>
            <div className="flex gap-3 justify-center">
              <Button variant="primary" onClick={backToList}>Back to Orders</Button>
              <Button variant="secondary" onClick={handleReset}>Reset & Re-pick</Button>
            </div>
          </div>
        </Modal>

        {/* Detail Edit Modal */}
        <Modal open={showDetailModal} onClose={() => setShowDetailModal(false)} title={`Order #${orderDetail.order_number}`} size="md">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-rose-400 mb-1">Customer Name</label>
                {editingCustomer ? (
                  <input type="text" value={editCustomer.name} onChange={e => setEditCustomer(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm" />
                ) : (
                  <p className="text-sm font-semibold">{orderDetail.customer_name || "—"}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-rose-400 mb-1">Email</label>
                {editingCustomer ? (
                  <input type="email" value={editCustomer.email} onChange={e => setEditCustomer(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm" />
                ) : (
                  <p className="text-sm">{orderDetail.customer_email || "—"}</p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1">Source</label>
              <p className="text-sm">{SOURCE_BADGES[orderDetail.source]?.label || orderDetail.source}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1">Notes</label>
              <p className="text-sm text-rose-500">{orderDetail.notes || "No notes"}</p>
            </div>
            {orderDetail.total_amount != null && (
              <div>
                <label className="block text-xs font-semibold text-rose-400 mb-1">Total</label>
                <p className="text-lg font-bold">{formatCurrency(orderDetail.total_amount)}</p>
              </div>
            )}
            {/* Store credit applied indicator */}
            {orderDetail.source !== "shopify" && orderDetail.customer_email && (
              <div className="mt-2">
                <AppliedCreditIndicator orderId={orderDetail.id} />
              </div>
            )}

            {/* Items */}
            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-2">Items ({orderDetail.items.length})</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {orderDetail.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-rose-50 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product_name || item.sku}</p>
                      <p className="text-xs text-rose-400">{item.variant_title} • SKU: {item.sku} • Qty: {item.quantity}</p>
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-sm font-semibold">{formatCurrency(item.line_total)}</p>
                      {orderDetail.source !== "shopify" && (
                        <button onClick={() => handleRemoveOrderItem(item.id)} className="text-xs text-rose-400 hover:text-rose-600">Remove</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add item for manual orders */}
            {orderDetail.source !== "shopify" && (
              <div>
                <label className="block text-xs font-semibold text-rose-400 mb-1">Add Item</label>
                <div className="flex gap-2">
                  <input type="text" value={productSearch} onChange={e => { setProductSearch(e.target.value); handleProductSearch(e.target.value); }}
                    placeholder="Search by name or SKU..." className="flex-1 border border-rose-200 rounded-lg px-3 py-2 text-sm" />
                  {productResults.length > 0 && (
                    <Button variant="primary" size="sm" onClick={handleAddItemToOrder}>Add</Button>
                  )}
                </div>
                {productResults.length > 0 && (
                  <div className="mt-1 bg-white border border-rose-100 rounded-lg max-h-32 overflow-y-auto">
                    {productResults.map(p => (
                      <button key={p.variant_id || p.id} onClick={() => { setProductResults([p]); }}
                        className="w-full text-left px-3 py-2 hover:bg-rose-50 text-sm">
                        {p.name} {p.variant_value && `(${p.variant_value})`} — {formatCurrency(p.price)} — Stock: {p.variant_stock ?? p.stock_count}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              {editingCustomer ? (
                <>
                  <Button variant="primary" size="sm" onClick={() => {
                    handleUpdateOrder("customer_name", editCustomer.name);
                    handleUpdateOrder("customer_email", editCustomer.email);
                    setEditingCustomer(false);
                  }}>Save</Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditingCustomer(false)}>Cancel</Button>
                </>
              ) : (
                orderDetail.source !== "shopify" && (
                  <Button variant="secondary" size="sm" onClick={() => setEditingCustomer(true)}>Edit Customer</Button>
                )
              )}
              {orderDetail.source !== "shopify" && orderDetail.status !== "cancelled" && (
                <Button variant="danger" size="sm" onClick={() => setShowCancelConfirm(true)}>Cancel Order</Button>
              )}
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ── Order list view ─────────────────────────────────────────────────

  const noviInsights = getDemoInsights("craft_supplies", "orders");
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const terms = useTerms();

  return (
    <div className="space-y-4">
      <PageHeader title={terms.order + 's'}
        novi={<Novi size="sm" accessory="marketing" />}
        actions={
          <div className="flex gap-2">
            <Button variant="primary" onClick={openNewOrder}>+ New Order</Button>
            {shopifyConfigured && (
              <Button variant="secondary" onClick={handleSync} loading={syncing}>
                {syncing ? "Syncing..." : syncMode === "readonly" ? "Import Orders" : "Sync Orders"}
              </Button>
            )}
          </div>
        }
      />

      <NoviEngineInsight insights={noviInsights} />

      <SyncBanner />
      <DiffPanel />

      {/* ── V2: Combine Suggestion Banner (Novi) ────────────────────── */}
      {combineSuggestions.length > 0 && !combineDismissed && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl shadow-md border-2 border-purple-200 p-4 card-lift animate-in">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <Novi expression="happy" size="sm" animated={true} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-purple-800 mb-1">
                💜 I noticed some orders from the same customer!
              </p>
              {combineSuggestions.map((s, i) => (
                <div key={i} className="flex items-center gap-3 mt-2 bg-white/80 rounded-xl p-3 border border-purple-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#121212]">
                      {s.customerName} placed {s.orderCount} orders
                    </p>
                    <p className="text-xs text-purple-500">
                      Orders #{s.orderNumbers.join(", #")} • Save <span className="text-emerald-600 font-bold">${s.estimatedSavings.toFixed(2)}</span> in shipping
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => { setSelectedCombineSuggestion(s); setShowCombineModal(true); }}
                  >
                    Combine & Save
                  </Button>
                  {combineSuggestions.length === 1 && (
                    <button
                      onClick={() => setCombineDismissed(true)}
                      className="text-xs text-purple-400 hover:text-purple-600 ml-1"
                    >
                      Not now
                    </button>
                  )}
                </div>
              ))}
              {combineSuggestions.length > 1 && (
                <button
                  onClick={() => setCombineDismissed(true)}
                  className="text-xs text-purple-400 hover:text-purple-600 mt-2"
                >
                  Dismiss all
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── P4.2: Provider Management Grid ─────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
        <div className="px-5 py-3 border-b border-rose-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">
            🏪 Sales Channels ({providers.filter(p => p.connectionStatus === "connected").length}/{providers.length} connected)
          </h2>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleSyncAll} loading={syncingAll}>
              {syncingAll ? "Syncing All..." : "Sync All"}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 p-4">
          {providersLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-rose-50/30 rounded-xl p-4 border border-rose-100">
                <Skeleton variant="card" />
              </div>
            ))
          ) : providers.map((provider) => {
            const isConnected = provider.connectionStatus === "connected";
            const isSyncing = syncingProvider === provider.slug;
            return (
              <div key={provider.slug}
                className={`rounded-xl p-4 border-2 transition-all ${isConnected
                  ? "border-emerald-200 bg-emerald-50/20"
                  : "border-rose-100 bg-white hover:border-rose-200"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{provider.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#121212] truncate">{provider.label}</p>
                    <p className="text-xs text-rose-400">{provider.description}</p>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isConnected ? "bg-emerald-500" : "bg-rose-300"}`}
                    title={isConnected ? "Connected" : "Not connected"} />
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {isConnected ? (
                    <Button variant="secondary" size="sm" onClick={() => handleProviderSync(provider.slug)} loading={isSyncing} className="flex-1">
                      {isSyncing ? "Syncing..." : "Sync"}
                    </Button>
                  ) : provider.slug === "shopify" ? (
                    <Button variant="secondary" size="sm" onClick={() => { setShowProviderConnect(provider.slug); setConnectForm({}); }} className="flex-1">
                      Connect via Shopify
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => { setShowProviderConnect(provider.slug); setConnectForm({}); }} className="flex-1">
                      Connect
                    </Button>
                  )}
                </div>
                {provider.lastSyncedAt && (
                  <p className="text-xs text-rose-300 mt-2 text-center">
                    Last sync: {new Date(provider.lastSyncedAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      {orders.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-1 flex-wrap">
            {SOURCE_OPTIONS.map(opt => (
              <button key={opt.value}
                onClick={() => setSourceFilter(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${sourceFilter === opt.value
                  ? "bg-rose-500 text-white shadow-sm"
                  : "bg-rose-50 text-rose-400 hover:bg-rose-100"}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex-1 max-w-xs ml-auto">
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search orders..." className="w-full border border-rose-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <EmptyState
          icon={shopifyConfigured ? "📋" : "✨"}
          title={shopifyConfigured ? "No Orders Yet" : "Connect your Shopify Store"}
          description={shopifyConfigured
            ? "Create your first manual order or sync from Shopify to get started."
            : "To sync orders and manage pick lists, connect ShimmerStock to your Shopify store."}
          action={!shopifyConfigured ? undefined : {
            label: "Create Manual Order",
            onClick: openNewOrder,
          }}
        />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
          <div className="px-5 py-4 border-b border-rose-100"><h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">Orders ({orders.length})</h2></div>
          <div className="divide-y divide-rose-50">
            {orders.map((order) => {
              const isComplete = order.scanned_items === order.item_count && order.item_count > 0;
              const inProgress = order.scanned_items > 0 && !isComplete;
              const badge = SOURCE_BADGES[order.source] || SOURCE_BADGES.manual;
              return (
                <button key={order.id} onClick={() => selectOrder(order.id)} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-rose-50/50 transition-all duration-300 text-left">
                  <div className="flex-shrink-0 w-14"><p className="text-xs text-rose-400">Order</p><p className="text-lg font-bold text-[#121212]">#{order.order_number}</p></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#121212] truncate">{order.customer_name}</p>
                    <p className="text-xs text-rose-400">
                      {order.item_count} items • {order.total_qty} units
                      {inProgress && <span className="ml-2 text-emerald-600 font-medium">({order.scanned_items}/{order.item_count} picked)</span>}
                      {order.total_amount != null && <span className="ml-2">{formatCurrency(order.total_amount)}</span>}
                    </p>
                  </div>
                  <Badge status={badge.color === "purple" ? "info" : badge.color === "green" ? "success" : badge.color === "red" ? "danger" : badge.color === "orange" ? "warning" : "info"}>
                    {badge.label}
                  </Badge>
                  {order.status === "combined" && (
                    <Badge status="info">Combined</Badge>
                  )}
                  <Badge status={mapStatus(order.status)}>{order.status}</Badge>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/customers?returnOrderId=${order.id}`); }}
                    className="text-xs px-2 py-1 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0"
                    title="Create return/refund for this order"
                  >
                    ↩ Return
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpsOrderId(order.id); setOpsOrderNumber(order.order_number); setOpsCustomerName(order.customer_name); }}
                    className="text-xs px-2 py-1 rounded-lg border border-purple-200 text-purple-500 hover:bg-purple-50 transition-colors flex-shrink-0"
                    title="Operations Center"
                  >
                    ⚡ Ops
                  </button>
                  <span className="text-rose-300 text-lg flex-shrink-0">→</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* New Order Modal */}
      <Modal open={showNewOrderModal} onClose={() => { setShowNewOrderModal(false); resetNewOrder(); }} title="New Order" size="lg">
        <div className="space-y-4">
          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-4">
            {[1, 2, 3, 4].map(step => (
              <div key={step} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${newOrderStep >= step ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-300"}`}>
                  {step}
                </div>
                {step < 4 && <div className={`w-8 h-0.5 ${newOrderStep > step ? "bg-rose-500" : "bg-rose-100"}`} />}
              </div>
            ))}
            <span className="text-xs text-rose-400 ml-2">
              {["Source", "Customer", "Items", "Review"][newOrderStep - 1]}
            </span>
          </div>

          {orderError && <ErrorBanner message={orderError} />}

          {/* Step 1: Source */}
          {newOrderStep === 1 && (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-rose-600">Order Source</label>
              <div className="grid grid-cols-3 gap-2">
                {SOURCE_OPTIONS.filter(o => o.value && o.value !== "shopify").map(opt => (
                  <button key={opt.value}
                    onClick={() => setNewOrderSource(opt.value)}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${newOrderSource === opt.value
                      ? "border-rose-500 bg-rose-50"
                      : "border-rose-100 hover:border-rose-200"}`}>
                    <p className="text-sm font-semibold">{opt.label}</p>
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <Button variant="primary" onClick={() => setNewOrderStep(2)}>Next →</Button>
              </div>
            </div>
          )}

          {/* Step 2: Customer */}
          {newOrderStep === 2 && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-rose-600 mb-1">Customer Name *</label>
                <input type="text" value={newOrderCustomer.name} onChange={e => setNewOrderCustomer(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Customer or company name" className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-rose-600 mb-1">Email</label>
                <input type="email" value={newOrderCustomer.email} onChange={e => setNewOrderCustomer(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="customer@example.com" className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-rose-600 mb-1">Notes</label>
                <textarea value={newOrderCustomer.notes} onChange={e => setNewOrderCustomer(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Order notes..." className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setNewOrderStep(1)}>← Back</Button>
                <Button variant="primary" onClick={() => { checkCustomerCredit(newOrderCustomer.email); setNewOrderStep(3); }} disabled={!newOrderCustomer.name.trim()}>Next →</Button>
              </div>
            </div>
          )}

          {/* Step 3: Items */}
          {newOrderStep === 3 && (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-rose-600">Search & Add Products</label>
              <div className="flex gap-2">
                <input type="text" value={productSearch} onChange={e => handleProductSearch(e.target.value)}
                  placeholder="Search by product name or SKU..." className="flex-1 border border-rose-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {searchingProducts && <Skeleton variant="table-row" />}
              {productResults.length > 0 && (
                <div className="bg-white border border-rose-100 rounded-lg max-h-48 overflow-y-auto">
                  {productResults.map(p => (
                    <button key={p.variant_id || p.id} onClick={() => addItemToOrder(p)}
                      className="w-full text-left px-3 py-2 hover:bg-rose-50 text-sm border-b border-rose-50 last:border-0">
                      <span className="font-medium">{p.name}</span>
                      {p.variant_value && <span className="text-rose-400"> — {p.variant_value}</span>}
                      <span className="text-xs text-rose-300 ml-2">SKU: {p.variant_sku || p.sku}</span>
                      <span className="float-right text-rose-500 font-medium">{formatCurrency(p.price)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Current items */}
              {newOrderItems.length > 0 && (
                <div className="space-y-2 mt-3">
                  <label className="block text-xs font-semibold text-rose-400">Items ({newOrderItems.length})</label>
                  {newOrderItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-rose-50 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.productName}</p>
                        <p className="text-xs text-rose-400">{item.variantTitle} — SKU: {item.sku}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="number" value={item.quantity} onChange={e => updateOrderItem(idx, "quantity", parseInt(e.target.value) || 1)}
                          className="w-16 border border-rose-200 rounded px-2 py-1 text-sm text-center" min={1} />
                        <input type="number" value={item.unitPrice} onChange={e => updateOrderItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                          className="w-20 border border-rose-200 rounded px-2 py-1 text-sm text-center" min={0} step="0.01" placeholder="Price" />
                        <span className="text-sm font-semibold w-16 text-right">{formatCurrency(item.unitPrice * item.quantity)}</span>
                        <button onClick={() => removeOrderItem(idx)} className="text-rose-400 hover:text-rose-600 text-lg">×</button>
                      </div>
                    </div>
                  ))}
                  <div className="text-right">
                    <span className="text-sm font-bold text-rose-600">
                      Total: {formatCurrency(newOrderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0))}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setNewOrderStep(2)}>← Back</Button>
                <Button variant="primary" onClick={() => setNewOrderStep(4)} disabled={newOrderItems.length === 0}>Next →</Button>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {newOrderStep === 4 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 bg-rose-50 rounded-xl p-4">
                <div>
                  <p className="text-xs text-rose-400">Source</p>
                  <p className="text-sm font-bold">{SOURCE_BADGES[newOrderSource]?.label || newOrderSource}</p>
                </div>
                <div>
                  <p className="text-xs text-rose-400">Customer</p>
                  <p className="text-sm font-bold">{newOrderCustomer.name || "—"}</p>
                  {newOrderCustomer.email && <p className="text-xs text-rose-400">{newOrderCustomer.email}</p>}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-rose-400 mb-2">Items ({newOrderItems.length})</p>
                {newOrderItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1 border-b border-rose-50 text-sm">
                    <span>{item.productName} — {item.variantTitle} × {item.quantity}</span>
                    <span className="font-medium">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
                {/* Store credit section */}
                {availableCredit && availableCredit.totalBalance > 0 && (
                  <div className="mt-3 bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-blue-800">💰 Available Store Credit</p>
                        <p className="text-xs text-blue-500">{formatCurrency(availableCredit.totalBalance)} available</p>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applyCredit}
                          onChange={(e) => setApplyCredit(e.target.checked)}
                          className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-blue-700 font-medium">Apply Credit</span>
                      </label>
                    </div>
                    {applyCredit && (
                      <p className="text-xs text-blue-500 mt-1">
                        {formatCurrency(Math.min(availableCredit.totalBalance, newOrderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)))} will be applied to this order
                      </p>
                    )}
                  </div>
                )}
                <div className="flex justify-between py-2 text-sm font-bold">
                  <span>Total</span>
                  <div className="text-right">
                    <span>{formatCurrency(newOrderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0))}</span>
                    {applyCredit && availableCredit && (
                      <p className="text-xs text-blue-600 font-normal">
                        − {formatCurrency(Math.min(availableCredit.totalBalance, newOrderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)))} credit
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setNewOrderStep(3)}>← Back</Button>
                <Button variant="primary" onClick={submitNewOrder} loading={submittingOrder}>
                  {submittingOrder ? "Creating..." : "Create Order"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Enable Sync Confirmation */}
      <ConfirmModal
        open={showEnableConfirm}
        onClose={() => setShowEnableConfirm(false)}
        onConfirm={() => { setShowEnableConfirm(false); handleEnableSync(); }}
        title="Enable Live Inventory Sync?"
        message="This will allow ShimmerStock to decrement inventory and push stock changes to Shopify. This cannot be undone automatically."
        confirmLabel="Yes, Enable Live Sync"
        confirmVariant="primary"
      />

      {/* Combine Order Confirmation Modal */}
      {selectedCombineSuggestion && (
        <Modal
          open={showCombineModal}
          onClose={() => { setShowCombineModal(false); setSelectedCombineSuggestion(null); }}
          title="💜 Combine Orders & Save on Shipping"
          size="md"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-purple-50 rounded-xl p-3">
              <Novi expression="happy" size="sm" animated={false} />
              <div>
                <p className="text-sm font-semibold text-purple-800">
                  {selectedCombineSuggestion.customerName} placed {selectedCombineSuggestion.orderCount} orders recently!
                </p>
                <p className="text-xs text-purple-500">
                  Combining them into one shipment saves you money and simplifies fulfillment.
                </p>
              </div>
            </div>

            <div className="bg-white border border-rose-100 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">Orders to Combine</h3>
              {selectedCombineSuggestion.orderNumbers.map((num, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-rose-400">📦</span>
                  <span className="font-medium">Order #{num}</span>
                  {i === 0 && <Badge status="success">Target</Badge>}
                  {i > 0 && <Badge status="warning">Merging →</Badge>}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-rose-50 rounded-xl p-3 text-center">
                <p className="text-xs text-rose-400">Individual Shipping</p>
                <p className="text-lg font-bold text-rose-600">${selectedCombineSuggestion.estimatedIndividualShipping.toFixed(2)}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-xs text-emerald-600">Combined Shipping</p>
                <p className="text-lg font-bold text-emerald-700">${selectedCombineSuggestion.estimatedCombinedShipping.toFixed(2)}</p>
              </div>
            </div>

            <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-200">
              <p className="text-sm text-emerald-700 font-bold">
                🎉 You'll save ${selectedCombineSuggestion.estimatedSavings.toFixed(2)} ({selectedCombineSuggestion.savingsPercent}% savings!)
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="secondary" size="sm" onClick={() => { setShowCombineModal(false); setSelectedCombineSuggestion(null); }}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleCombineOrders(selectedCombineSuggestion)}
                loading={combiningOrders}
              >
                {combiningOrders ? "Combining..." : `Combine & Save $${selectedCombineSuggestion.estimatedSavings.toFixed(2)}`}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel Order Confirmation */}
      <ConfirmModal
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={() => { setShowCancelConfirm(false); handleCancelOrder(); }}
        title="Cancel Order?"
        message={orderDetail ? `Are you sure you want to cancel order #${orderDetail.order_number}?` : "Are you sure?"}
        confirmLabel="Cancel Order"
        confirmVariant="danger"
      />

      {/* ── P4.2: Provider Connect Modal ──────────────────────────── */}
      <Modal
        open={showProviderConnect !== null && showProviderConnect !== "shopify"}
        onClose={() => { setShowProviderConnect(null); setConnectForm({}); }}
        title={`Connect to ${providers.find(p => p.slug === showProviderConnect)?.label || ""}`}
        size="sm"
      >
        {showProviderConnect && showProviderConnect !== "shopify" && (() => {
          const meta = providers.find(p => p.slug === showProviderConnect);
          return (
            <div className="space-y-3">
              <p className="text-sm text-rose-400">
                {meta?.description} — Connect to start syncing orders.
              </p>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-semibold text-rose-400 mb-1">Store Name</label>
                  <input type="text" value={connectForm.storeName || ""}
                    onChange={e => setConnectForm(prev => ({ ...prev, storeName: e.target.value }))}
                    placeholder="My Store" className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-rose-400 mb-1">API Key / Access Token</label>
                  <input type="password" value={connectForm.apiKey || ""}
                    onChange={e => setConnectForm(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="Enter credentials..." className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                {meta?.slug === "woocommerce" && (
                  <div>
                    <label className="block text-xs font-semibold text-rose-400 mb-1">Store URL</label>
                    <input type="text" value={connectForm.storeUrl || ""}
                      onChange={e => setConnectForm(prev => ({ ...prev, storeUrl: e.target.value }))}
                      placeholder="https://mystore.com" className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-600">⚠️ This provider is in <strong>simulated mode</strong>. Real API integration requires developer app registration with the platform.</p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" size="sm" onClick={() => { setShowProviderConnect(null); setConnectForm({}); }}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={() => handleConnectProvider(showProviderConnect!)} loading={connectingProvider}>
                  {connectingProvider ? "Connecting..." : "Connect"}
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Shopify OAuth Connect Modal ────────────────────────────── */}
      <Modal
        open={showProviderConnect === "shopify"}
        onClose={() => { setShowProviderConnect(null); setConnectForm({}); }}
        title="Connect to Shopify"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-purple-50 rounded-xl p-3">
            <Novi expression="curious" size="sm" animated={false} />
            <p className="text-sm text-purple-700">
              💜 You'll be redirected to Shopify to authorize. It only takes a minute!
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-rose-400 mb-1">
              Shopify Store Domain
            </label>
            <input
              type="text"
              value={connectForm.storeDomain || ""}
              onChange={e => setConnectForm(prev => ({ ...prev, storeDomain: e.target.value }))}
              placeholder="mystore.myshopify.com"
              className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && connectForm.storeDomain) {
                  window.location.href = `/api/shopify/auth?shop=${encodeURIComponent(connectForm.storeDomain.trim())}`;
                }
              }}
            />
            <p className="text-xs text-rose-400 mt-1">
              Enter your full <code className="bg-rose-50 px-1 rounded">.myshopify.com</code> domain
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => { setShowProviderConnect(null); setConnectForm({}); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!connectForm.storeDomain?.trim()}
              onClick={() => {
                if (connectForm.storeDomain?.trim()) {
                  window.location.href = `/api/shopify/auth?shop=${encodeURIComponent(connectForm.storeDomain.trim())}`;
                }
              }}
            >
              Connect Shopify
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── V2: Operations Center ────────────────────────────────── */}
      <OperationsCenter
        orderId={opsOrderId || 0}
        orderNumber={opsOrderNumber}
        customerName={opsCustomerName}
        open={opsOrderId !== null}
        onClose={() => setOpsOrderId(null)}
        onSuccess={() => { setOpsOrderId(null); fetchOrders(); if (selectedOrderId) fetchOrderDetail(selectedOrderId); }}
      />
    </div>
  );
}

// ── Applied Credit Indicator ──────────────────────────────────────────
function AppliedCreditIndicator({ orderId }: { orderId: number }) {
  const [data, setData] = useState<{ redemptions: any[]; totalApplied: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchCredit() {
      setLoading(true);
      try {
        const res = await apiGet(`/api/orders/${orderId}/store-credit`);
        if (!cancelled && res && res.totalApplied > 0) {
          setData(res);
        } else if (!cancelled) {
          setData(null);
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCredit();
    return () => { cancelled = true; };
  }, [orderId]);

  if (loading) return <p className="text-xs text-neutral-400">Loading credit info...</p>;
  if (!data || data.totalApplied <= 0) return null;

  return (
    <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
      <label className="block text-xs font-semibold text-blue-600 mb-1">Store Credit Applied</label>
      <p className="text-sm font-bold text-blue-700">− {formatCurrency(data.totalApplied)}</p>
      {data.redemptions.map((r: any) => (
        <p key={r.id} className="text-xs text-blue-500">
          Code {r.store_credit_code}: {formatCurrency(r.amount_applied)} on {formatDate(r.created_at)}
        </p>
      ))}
    </div>
  );
}
