import { useState, useEffect } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../lib/api";
import { PageHeader, Button, Badge, Tabs, Modal, ConfirmModal, Skeleton, EmptyState, ErrorBanner, SearchBar, useToast } from "../components/ui";
import Novi from "../components/Novi";
import NoviEngineInsight from "../components/novi/NoviEngineInsight";
import { getDemoInsights } from "../lib/businessDna";
import { useTerms } from "../context/IndustryContext";

// ── Types ───────────────────────────────────────────────────────────

interface Product {
  id: number; name: string; sku: string; barcode: string | null; stock_count: number;
}

interface BomItem {
  id: number; bom_id: number; input_product_id: number;
  quantity_per_batch: number; unit: string; sort_order: number;
  input_product_name: string; input_product_sku: string;
  input_stock_count: number; input_barcode: string | null;
  neededForBatch?: number; available?: number; sufficient?: boolean;
}

interface Bom {
  id: number; business_id: number; name: string;
  output_product_id: number; output_quantity: number; output_unit: string;
  is_active: number; created_at: string;
  output_product_name: string; output_product_sku: string;
  output_stock_count: number; items: BomItem[];
}

interface Reservation {
  id: number; business_id: number; batch_id: number;
  product_id: number; quantity_reserved: number; status: string;
  created_at: string; product_name: string; product_sku: string;
}

interface BatchMovement {
  id: number; batch_id: number; product_id: number;
  direction: "consumed" | "produced";
  planned_quantity: number; actual_quantity: number; unit: string;
  product_name: string; product_sku: string;
}

interface Batch {
  id: number; business_id: number; bom_id: number;
  batch_size: number;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
  started_at: string | null; completed_at: string | null;
  reserved_at: string | null; cancelled_at: string | null; cancelled_reason: string | null;
  created_by_name: string | null; created_at: string;
  bom_name: string; output_product_name: string; output_product_sku: string;
  movements?: BatchMovement[]; bomItems?: BomItem[];
  reservations?: Reservation[];
  hasReservations?: boolean; reservedCount?: number; consumedCount?: number;
}

interface PendingBatch extends Batch {
  output_stock_count: number; output_quantity: number; output_unit: string;
  shortages: Shortage[]; canExecute: boolean;
}

interface Shortage {
  productId: number; productName: string; sku: string;
  needed: number; available: number; shortfall: number; unit: string;
}

interface PendingResponse { pending: PendingBatch[]; total: number; canExecuteCount: number; summary: string; }

interface ReserveResult {
  batchId: number; reserved: { productId: number; productName: string; sku: string; needed: number; reserved: number; unit: string }[];
  shortages: Shortage[]; canExecute: boolean; summary: string;
}

interface RequirementsResponse {
  batches: { batchId: number; bomName: string; outputProductName: string; batchSize: number;
    canExecute: boolean; items: { productName: string; sku: string; needed: number; available: number; sufficient: boolean; shortfall: number; unit: string }[];
    shortages: { productName: string; sku: string; needed: number; available: number; shortfall: number; unit: string }[];
    shortageCount: number;
  }[];
  totalBatches: number; executableBatches: number; summary: string;
}

// ── Status mapping ──────────────────────────────────────────────────

function mapStatus(status: string): "success" | "warning" | "danger" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "info"> = {
    draft: "info", in_progress: "info", completed: "success", cancelled: "danger",
  };
  return map[status] || "info";
}

// ── Page Component ───────────────────────────────────────────────────

export default function Production() {
  const { toast } = useToast();
  const [tab, setTab] = useState<string>("pending");
  const [boms, setBoms] = useState<Bom[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [pending, setPending] = useState<PendingResponse | null>(null);
  const [requirements, setRequirements] = useState<RequirementsResponse | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Search ─────────────────────────────────────────────────────────
  const [bomSearch, setBomSearch] = useState("");
  const [batchSearch, setBatchSearch] = useState("");

  // ── BOM editor state ───────────────────────────────────────────────
  const [showBomEditor, setShowBomEditor] = useState(false);
  const [editingBom, setEditingBom] = useState<Bom | null>(null);
  const [bomName, setBomName] = useState("");
  const [bomOutputId, setBomOutputId] = useState<number | null>(null);
  const [bomOutputQty, setBomOutputQty] = useState(1);
  const [bomOutputUnit, setBomOutputUnit] = useState("unit");
  const [bomItems, setBomItems] = useState<Array<{ inputProductId: number; quantityPerBatch: number; unit: string }>>([]);

  // ── Batch detail state ─────────────────────────────────────────────
  const [detailBatch, setDetailBatch] = useState<Batch | null>(null);

  // ── Add item state ─────────────────────────────────────────────────
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemProductId, setAddItemProductId] = useState<number | null>(null);
  const [addItemQty, setAddItemQty] = useState(1);
  const [addItemUnit, setAddItemUnit] = useState("unit");

  // ── Create Batch Modal ─────────────────────────────────────────────
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [createBatchTargetBom, setCreateBatchTargetBom] = useState<Bom | null>(null);
  const [createBatchSize, setCreateBatchSize] = useState(1);
  const [createBatchNotes, setCreateBatchNotes] = useState("");

  // ── Confirm modals ─────────────────────────────────────────────────
  const [confirmDeleteBom, setConfirmDeleteBom] = useState<Bom | null>(null);
  const [confirmReserveBatch, setConfirmReserveBatch] = useState<number | null>(null);
  const [confirmExecuteBatch, setConfirmExecuteBatch] = useState<number | null>(null);
  const [confirmUndoBatch, setConfirmUndoBatch] = useState<Batch | null>(null);

  // ── Cancel reason modal ────────────────────────────────────────────
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // ── Reserve result display ─────────────────────────────────────────
  const [reserveResult, setReserveResult] = useState<ReserveResult | null>(null);
  const [showReserveResult, setShowReserveResult] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [bomsData, batchesData, pendingData, productsData, reqData] = await Promise.all([
        apiGet<Bom[]>("/api/production/boms"),
        apiGet<Batch[]>("/api/production/batches"),
        apiGet<PendingResponse>("/api/production/pending"),
        apiGet<Product[]>("/api/products"),
        apiGet<RequirementsResponse>("/api/production/requirements"),
      ]);
      setBoms(bomsData);
      setBatches(batchesData);
      setPending(pendingData);
      setProducts(productsData);
      setRequirements(reqData);
    } catch (err: any) {
      setError(err.message || "Failed to load production data");
    } finally {
      setLoading(false);
    }
  }

  // ── BOM CRUD ───────────────────────────────────────────────────────

  function openCreateBom() { /* same as before */ setEditingBom(null); setBomName(""); setBomOutputId(null); setBomOutputQty(1); setBomOutputUnit("unit"); setBomItems([]); setShowBomEditor(true); }

  function openEditBom(bom: Bom) {
    setEditingBom(bom); setBomName(bom.name); setBomOutputId(bom.output_product_id);
    setBomOutputQty(bom.output_quantity); setBomOutputUnit(bom.output_unit);
    setBomItems(bom.items.map(i => ({ inputProductId: i.input_product_id, quantityPerBatch: i.quantity_per_batch, unit: i.unit })));
    setShowBomEditor(true);
  }

  async function saveBom() {
    if (!bomName.trim() || !bomOutputId) return;
    try {
      if (editingBom) {
        await apiPut(`/api/production/boms/${editingBom.id}`, { name: bomName, outputProductId: bomOutputId, outputQuantity: bomOutputQty, outputUnit: bomOutputUnit });
        toast("BOM updated", "success");
      } else {
        await apiPost("/api/production/boms", { name: bomName, outputProductId: bomOutputId, outputQuantity: bomOutputQty, outputUnit: bomOutputUnit,
          items: bomItems.map(i => ({ inputProductId: i.inputProductId, quantityPerBatch: i.quantityPerBatch, unit: i.unit })) });
        toast("BOM created", "success");
      }
      setShowBomEditor(false); await fetchAll();
    } catch (err: any) { toast(err.message || "Failed to save BOM", "error"); }
  }

  async function deleteBom(id: number) {
    try { await apiDelete(`/api/production/boms/${id}`); toast("BOM deleted", "success"); setConfirmDeleteBom(null); await fetchAll(); }
    catch (err: any) { toast(err.message || "Failed to delete BOM", "error"); }
  }

  function addBomItemLocally() {
    if (!addItemProductId) return;
    setBomItems([...bomItems, { inputProductId: addItemProductId, quantityPerBatch: addItemQty, unit: addItemUnit }]);
    setAddItemProductId(null); setAddItemQty(1); setAddItemUnit("unit"); setShowAddItem(false);
  }

  function removeBomItemLocally(idx: number) { setBomItems(bomItems.filter((_, i) => i !== idx)); }

  // ── Batch Actions ──────────────────────────────────────────────────

  function openCreateBatchModal(bom: Bom) { setCreateBatchTargetBom(bom); setCreateBatchSize(1); setCreateBatchNotes(""); setShowCreateBatch(true); }

  async function createBatch() {
    if (!createBatchTargetBom) return;
    try {
      await apiPost("/api/production/batches", { bomId: createBatchTargetBom.id, batchSize: createBatchSize, notes: createBatchNotes || null });
      toast("Batch created", "success"); setShowCreateBatch(false); await fetchAll();
    } catch (err: any) { toast(err.message || "Failed to create batch", "error"); }
  }

  // ── V3.3: Reserve → Execute flow ──────────────────────────────────

  async function reserveBatch(batchId: number) {
    try {
      const result = await apiPost<ReserveResult>(`/api/production/batches/${batchId}/reserve`);
      setReserveResult(result);
      setShowReserveResult(true);
      setConfirmReserveBatch(null);
      toast(result.summary, result.canExecute ? "success" : "warning");
    } catch (err: any) { toast(err.message || "Failed to reserve inventory", "error"); }
  }

  async function executeBatchAfterReserve(batchId: number) {
    try {
      const result = await apiPost(`/api/production/batches/${batchId}/execute`);
      toast(`Batch completed! Produced ${result.outputQuantity} ${result.outputUnit} of ${result.outputProductName}`, "success");
      setConfirmExecuteBatch(null); setShowReserveResult(false); setReserveResult(null);
      await fetchAll(); setDetailBatch(null);
    } catch (err: any) { toast(err.message || "Failed to execute batch", "error"); }
  }

  async function executeBatch(batchId: number) {
    try {
      const result = await apiPost(`/api/production/batches/${batchId}/execute`);
      toast(`Batch completed! Produced ${result.outputQuantity} ${result.outputUnit} of ${result.outputProductName}`, "success");
      setConfirmExecuteBatch(null); await fetchAll(); setDetailBatch(null);
    } catch (err: any) { toast(err.message || "Failed to execute batch", "error"); }
  }

  // ── V3.3: Cancel with reason ───────────────────────────────────────

  function openCancelWithReason(batchId: number) {
    setCancelTargetId(batchId); setCancelReason(""); setShowCancelReason(true);
  }

  async function confirmCancelWithReason() {
    if (!cancelTargetId) return;
    try {
      const result = await apiPost(`/api/production/batches/${cancelTargetId}/cancel`, { reason: cancelReason || undefined });
      if (result.reversals) {
        toast(`Batch cancelled — ${result.reversals.length} inventory changes reversed`, "success");
      } else {
        toast(result.message || "Batch cancelled", "success");
      }
      setShowCancelReason(false); setCancelTargetId(null);
      await fetchAll(); setDetailBatch(null);
    } catch (err: any) { toast(err.message || "Failed to cancel batch", "error"); }
  }

  // ── V3.3: Undo completed batch ─────────────────────────────────────

  async function undoBatch(batchId: number) {
    try {
      const result = await apiPost(`/api/production/batches/${batchId}/undo`);
      toast(`Batch undone — ${result.reversals.length} inventory changes reversed`, "success");
      setConfirmUndoBatch(null); await fetchAll(); setDetailBatch(null);
    } catch (err: any) { toast(err.message || "Failed to undo batch", "error"); }
  }

  async function showBatchDetail(batchId: number) {
    try {
      const batch = await apiGet<Batch>(`/api/production/batches/${batchId}`);
      setDetailBatch(batch);
    } catch (err: any) { toast(err.message || "Failed to load batch detail", "error"); }
  }

  function getProductName(id: number) {
    return products.find(p => p.id === id)?.name || `Product #${id}`;
  }

  // ── Filtered lists ─────────────────────────────────────────────────

  const filteredBoms = boms.filter(b => !bomSearch || b.name.toLowerCase().includes(bomSearch.toLowerCase()));
  const filteredBatches = batches.filter(b => !batchSearch || b.bom_name.toLowerCase().includes(batchSearch.toLowerCase()));

  // ── Tab config ─────────────────────────────────────────────────────

  const tabConfig = [
    { id: "pending", label: "📋 Pending", count: pending?.total ?? 0 },
    { id: "boms", label: "📐 BOMs", count: boms.length },
    { id: "batches", label: "🏭 Batches", count: batches.length },
    { id: "requirements", label: "📊 Requirements", count: requirements?.totalBatches ?? 0 },
  ];

  // ── Loading / Error states ─────────────────────────────────────────

  if (loading) {
    return (<div className="space-y-6"><PageHeader title="Production" novi={<Novi size="sm" accessory="production" />} /><div className="space-y-4"><Skeleton variant="card" /><Skeleton variant="card" /><Skeleton variant="card" /></div></div>);
  }
  if (error) {
    return (<div className="space-y-6"><PageHeader title="Production" novi={<Novi size="sm" accessory="production" />} /><ErrorBanner message={error} onRetry={fetchAll} /></div>);
  }

  // ── Render ─────────────────────────────────────────────────────────

  const noviInsights = getDemoInsights("craft_supplies", "production");
  const terms = useTerms();

  return (
    <div className="space-y-6">
      <PageHeader title={terms.production} novi={<Novi size="sm" accessory="production" />} actions={<Button onClick={openCreateBom}>+ New BOM</Button>} />

      <NoviEngineInsight insights={noviInsights} />

      <Tabs tabs={tabConfig} active={tab} onChange={setTab} />

      {/* ── PENDING TAB ──────────────────────────────────────────────── */}
      {tab === "pending" && (
        <div className="space-y-4">
          {pending && pending.summary && (
            <div className="bg-rose-50 rounded-xl px-4 py-3 text-sm text-rose-600 font-medium">{pending.summary}</div>
          )}
          {(!pending || pending.pending.length === 0) ? (
            <EmptyState icon="✅" title="Nothing to manufacture" description="Create a BOM and start a batch to begin production" />
          ) : (
            pending.pending.map((batch) => (
              <div key={batch.id} className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
                <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#121212]">{batch.bom_name}</p>
                    <p className="text-xs text-rose-400">
                      Produces: {batch.output_product_name} ({batch.output_quantity * batch.batch_size} {batch.output_unit})
                    </p>
                  </div>
                  <Badge status={mapStatus(batch.status)}>{batch.status}</Badge>
                </div>

                {batch.shortages.length > 0 && (
                  <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
                    <p className="text-xs font-semibold text-amber-600 mb-2">⚠️ Missing Materials</p>
                    {batch.shortages.map((s, i) => (
                      <p key={i} className="text-xs text-amber-700">
                        {s.productName} ({s.sku}): need {s.needed} {s.unit}, have {s.available} — short {s.shortfall} {s.unit}
                      </p>
                    ))}
                  </div>
                )}

                {batch.bomItems && batch.bomItems.length > 0 && (
                  <div className="px-5 py-3 border-b border-rose-50">
                    <p className="text-xs text-rose-400 font-medium mb-2">Components</p>
                    {batch.bomItems.map((item, i) => {
                      const needed = item.quantity_per_batch * batch.batch_size;
                      const ok = (item.input_stock_count || 0) >= needed;
                      return (
                        <p key={i} className={`text-xs ${ok ? "text-gray-600" : "text-amber-600"}`}>
                          {item.input_product_name}: {needed} {item.unit} {ok ? "✓" : `(have ${item.input_stock_count})`}
                        </p>
                      );
                    })}
                  </div>
                )}

                <div className="px-5 py-3 flex gap-2">
                  {!batch.canExecute && (
                    <Button variant="secondary" onClick={() => setConfirmReserveBatch(batch.id)}>
                      🔒 Reserve & Check
                    </Button>
                  )}
                  {batch.canExecute && (
                    <Button variant="primary" onClick={() => setConfirmExecuteBatch(batch.id)}>
                      ▶ Execute
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => showBatchDetail(batch.id)}>Details</Button>
                  <Button variant="danger" size="sm" onClick={() => openCancelWithReason(batch.id)}>Cancel</Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── BOMS TAB ─────────────────────────────────────────────────── */}
      {tab === "boms" && (
        <div className="space-y-4">
          {boms.length > 0 && <SearchBar value={bomSearch} onChange={setBomSearch} placeholder="Search BOMs..." />}
          {filteredBoms.length === 0 && !bomSearch ? (
            <EmptyState icon="📐" title="No BOMs yet" description="Create a Bill of Materials to define what goes into your products" action={{ label: "+ Create First BOM", onClick: openCreateBom }} />
          ) : filteredBoms.length === 0 ? (
            <EmptyState icon="🔍" title="No BOMs match your search" description="Try a different search term" />
          ) : (
            filteredBoms.map((bom) => (
              <div key={bom.id} className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
                <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#121212]">{bom.name}</p>
                    <p className="text-xs text-rose-400 mt-0.5">
                      → {bom.output_product_name} ({bom.output_quantity} {bom.output_unit} per batch){bom.is_active ? "" : " · Inactive"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="primary" size="sm" onClick={() => openCreateBatchModal(bom)}>+ Batch</Button>
                    <Button variant="secondary" size="sm" onClick={() => openEditBom(bom)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirmDeleteBom(bom)}>Del</Button>
                  </div>
                </div>
                {bom.items.length > 0 && (
                  <div className="px-5 py-3">
                    <p className="text-xs text-rose-400 font-medium mb-2">Components</p>
                    {bom.items.map((item, i) => (
                      <p key={i} className="text-xs text-gray-600 flex justify-between">
                        <span>{item.input_product_name} ({item.input_product_sku})</span>
                        <span className="font-mono">{item.quantity_per_batch} {item.unit}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── BATCHES TAB ──────────────────────────────────────────────── */}
      {tab === "batches" && (
        <div className="space-y-4">
          {batches.length > 0 && <SearchBar value={batchSearch} onChange={setBatchSearch} placeholder="Search batches..." />}
          {filteredBatches.length === 0 && !batchSearch ? (
            <EmptyState icon="🏭" title="No batches yet" description="Create a batch from a BOM to start manufacturing" />
          ) : filteredBatches.length === 0 ? (
            <EmptyState icon="🔍" title="No batches match your search" description="Try a different search term" />
          ) : (
            filteredBatches.map((batch) => (
              <div key={batch.id} className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#121212]">{batch.bom_name}</p>
                      <Badge status={mapStatus(batch.status)}>{batch.status}</Badge>
                    </div>
                    <p className="text-xs text-rose-400 mt-0.5">
                      → {batch.output_product_name} · Batch ×{batch.batch_size}
                      {batch.created_by_name && ` · by ${batch.created_by_name}`}
                    </p>
                    {batch.notes && <p className="text-xs text-gray-500 mt-1 italic">{batch.notes}</p>}
                    {batch.reserved_at && <p className="text-xs text-blue-500 mt-0.5">Reserved: {new Date(batch.reserved_at).toLocaleString()}</p>}
                    {batch.completed_at && <p className="text-xs text-green-500 mt-0.5">Completed: {new Date(batch.completed_at).toLocaleString()}</p>}
                    {batch.cancelled_at && <p className="text-xs text-red-500 mt-0.5">Cancelled: {new Date(batch.cancelled_at).toLocaleString()}{batch.cancelled_reason ? ` — ${batch.cancelled_reason}` : ""}</p>}
                  </div>
                  <div className="flex gap-1">
                    {batch.status === "draft" && (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => setConfirmReserveBatch(batch.id)}>🔒 Reserve</Button>
                        <Button variant="primary" size="sm" onClick={() => setConfirmExecuteBatch(batch.id)}>▶ Execute</Button>
                        <Button variant="danger" size="sm" onClick={() => openCancelWithReason(batch.id)}>Cancel</Button>
                      </>
                    )}
                    {batch.status === "completed" && (
                      <Button variant="danger" size="sm" onClick={() => setConfirmUndoBatch(batch)}>↩ Undo</Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => showBatchDetail(batch.id)}>Details</Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── REQUIREMENTS TAB ─────────────────────────────────────────── */}
      {tab === "requirements" && (
        <div className="space-y-4">
          {requirements && (
            <div className="bg-rose-50 rounded-xl px-4 py-3 text-sm text-rose-600 font-medium">{requirements.summary}</div>
          )}
          {(!requirements || requirements.batches.length === 0) ? (
            <EmptyState icon="📊" title="No pending production" description="All batches are processed or none are created yet" />
          ) : (
            requirements.batches.map((batch) => (
              <div key={batch.batchId} className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
                <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#121212]">{batch.bomName}</p>
                    <p className="text-xs text-rose-400">
                      {batch.outputProductName} · Batch ×{batch.batchSize}
                    </p>
                  </div>
                  <Badge status={batch.canExecute ? "success" : "warning"}>
                    {batch.canExecute ? "Ready" : `${batch.shortageCount} shortage(s)`}
                  </Badge>
                </div>
                <div className="px-5 py-3">
                  <p className="text-xs text-rose-400 font-medium mb-2">Material Requirements</p>
                  {batch.items.map((item, i) => (
                    <div key={i} className={`flex items-center justify-between text-xs py-1 px-2 rounded ${item.sufficient ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                      <span>{item.productName} ({item.sku})</span>
                      <span className="font-mono">
                        {item.needed} {item.unit} needed / {item.available} available
                        {!item.sufficient && ` (short ${item.shortfall})`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Batch Detail Modal ───────────────────────────────────────── */}
      <Modal open={!!detailBatch} onClose={() => setDetailBatch(null)} title={detailBatch ? `Batch #${detailBatch.id}` : ""} size="md">
        {detailBatch && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Badge status={mapStatus(detailBatch.status)}>{detailBatch.status}</Badge>
              {detailBatch.reserved_at && <Badge status="info">🔒 Reserved</Badge>}
            </div>
            <div className="space-y-2 text-sm mb-4">
              <p><span className="text-rose-400">BOM:</span> {detailBatch.bom_name}</p>
              <p><span className="text-rose-400">Product:</span> {detailBatch.output_product_name} ({detailBatch.output_product_sku})</p>
              <p><span className="text-rose-400">Batch size:</span> ×{detailBatch.batch_size}</p>
              {detailBatch.notes && <p><span className="text-rose-400">Notes:</span> {detailBatch.notes}</p>}
              {detailBatch.created_by_name && <p><span className="text-rose-400">Created by:</span> {detailBatch.created_by_name}</p>}
              {detailBatch.reserved_at && <p><span className="text-rose-400">Reserved:</span> {new Date(detailBatch.reserved_at).toLocaleString()}</p>}
              {detailBatch.started_at && <p><span className="text-rose-400">Started:</span> {new Date(detailBatch.started_at).toLocaleString()}</p>}
              {detailBatch.completed_at && <p><span className="text-rose-400">Completed:</span> {new Date(detailBatch.completed_at).toLocaleString()}</p>}
              {detailBatch.cancelled_at && <p><span className="text-rose-400">Cancelled:</span> {new Date(detailBatch.cancelled_at).toLocaleString()}{detailBatch.cancelled_reason ? ` — ${detailBatch.cancelled_reason}` : ""}</p>}
            </div>

            {/* Reservations (V3.3) */}
            {detailBatch.reservations && detailBatch.reservations.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-blue-500 mb-2">🔒 Reservations ({detailBatch.reservedCount} active, {detailBatch.consumedCount} consumed)</p>
                <div className="space-y-1">
                  {detailBatch.reservations.map((r, i) => (
                    <div key={i} className={`text-xs px-3 py-1.5 rounded-lg flex justify-between ${
                      r.status === "reserved" ? "bg-blue-50 text-blue-700" :
                      r.status === "consumed" ? "bg-gray-50 text-gray-500" :
                      "bg-amber-50 text-amber-700"
                    }`}>
                      <span>{r.product_name} ({r.product_sku})</span>
                      <span className="font-mono">{r.quantity_reserved} · {r.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Movements */}
            {detailBatch.movements && detailBatch.movements.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-rose-500 mb-2">📊 Movements</p>
                <div className="space-y-1">
                  {detailBatch.movements.map((m, i) => (
                    <div key={i} className={`flex items-center justify-between text-xs px-3 py-1.5 rounded-lg ${
                      m.direction === "consumed" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
                    }`}>
                      <span>{m.product_name} ({m.product_sku})</span>
                      <span className="font-mono font-semibold">
                        {m.direction === "consumed" ? "−" : "+"}{m.actual_quantity} {m.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BOM Items with availability (V3.3) */}
            {detailBatch.bomItems && detailBatch.bomItems.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-rose-500 mb-2">📐 Components & Availability</p>
                <div className="space-y-1">
                  {detailBatch.bomItems.map((item, i) => (
                    <div key={i} className={`flex items-center justify-between text-xs px-3 py-1.5 rounded-lg ${item.sufficient ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                      <span>{item.input_product_name} ({item.input_product_sku})</span>
                      <span className="font-mono">
                        need {item.neededForBatch} {item.unit} / have {item.available}
                        {item.sufficient ? " ✓" : " ✗"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              {detailBatch.status === "draft" && (
                <>
                  <Button variant="secondary" onClick={() => { setDetailBatch(null); setConfirmReserveBatch(detailBatch.id); }}>
                    🔒 Reserve
                  </Button>
                  <Button variant="primary" onClick={() => { setDetailBatch(null); setConfirmExecuteBatch(detailBatch.id); }}>
                    ▶ Execute
                  </Button>
                </>
              )}
              {detailBatch.status === "completed" && (
                <Button variant="danger" onClick={() => { setDetailBatch(null); setConfirmUndoBatch(detailBatch); }}>
                  ↩ Undo & Reverse
                </Button>
              )}
              <Button variant="secondary" onClick={() => setDetailBatch(null)}>Close</Button>
            </div>
          </>
        )}
      </Modal>

      {/* ── BOM Editor Modal ─────────────────────────────────────────── */}
      <Modal open={showBomEditor} onClose={() => setShowBomEditor(false)} title={editingBom ? "Edit BOM" : "Create BOM"} size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-rose-500 mb-1">BOM Name</label>
            <input type="text" value={bomName} onChange={(e) => setBomName(e.target.value)}
              className="touch-target w-full px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50"
              placeholder="e.g. 4oz Glitter Jar" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-rose-500 mb-1">Output Product</label>
            <select value={bomOutputId ?? ""} onChange={(e) => setBomOutputId(parseInt(e.target.value) || null)}
              className="touch-target w-full px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50">
              <option value="">Select product…</option>
              {products.map((p) => (<option key={p.id} value={p.id}>{p.name} ({p.sku}) — stock: {p.stock_count}</option>))}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-rose-500 mb-1">Output Qty</label>
              <input type="number" step="any" min="0.01" value={bomOutputQty} onChange={(e) => setBomOutputQty(parseFloat(e.target.value) || 1)}
                className="touch-target w-full px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-rose-500 mb-1">Unit</label>
              <input type="text" value={bomOutputUnit} onChange={(e) => setBomOutputUnit(e.target.value)}
                className="touch-target w-full px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" placeholder="unit, jar, box…" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-rose-500">Components</label>
              <Button variant="secondary" size="sm" onClick={() => setShowAddItem(true)}>+ Add</Button>
            </div>
            {bomItems.length === 0 ? (
              <p className="text-xs text-rose-300 italic">No components yet — add ingredients/raw materials</p>
            ) : (
              <div className="space-y-1">
                {bomItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-rose-50/50 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-700">{getProductName(item.inputProductId)} — {item.quantityPerBatch} {item.unit}</span>
                    <button onClick={() => removeBomItemLocally(i)} className="text-red-400 hover:text-red-600 text-xs font-bold">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="secondary" onClick={() => setShowBomEditor(false)} className="flex-1">Cancel</Button>
          <Button variant="primary" onClick={saveBom} disabled={!bomName.trim() || !bomOutputId} className="flex-1">
            {editingBom ? "Update BOM" : "Create BOM"}
          </Button>
        </div>
      </Modal>

      {/* ── Add Item Sub-Modal ────────────────────────────────────────── */}
      <Modal open={showAddItem} onClose={() => setShowAddItem(false)} title="Add Component" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-rose-500 mb-1">Product</label>
            <select value={addItemProductId ?? ""} onChange={(e) => setAddItemProductId(parseInt(e.target.value) || null)}
              className="touch-target w-full px-3 py-2 border border-rose-200 rounded-lg text-xs focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none bg-rose-50/50">
              <option value="">Select…</option>
              {products.map((p) => (<option key={p.id} value={p.id}>{p.name} ({p.sku})</option>))}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-rose-500 mb-1">Qty/Batch</label>
              <input type="number" step="any" min="0.01" value={addItemQty} onChange={(e) => setAddItemQty(parseFloat(e.target.value) || 1)}
                className="touch-target w-full px-3 py-2 border border-rose-200 rounded-lg text-xs focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none bg-rose-50/50" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-rose-500 mb-1">Unit</label>
              <input type="text" value={addItemUnit} onChange={(e) => setAddItemUnit(e.target.value)}
                className="touch-target w-full px-3 py-2 border border-rose-200 rounded-lg text-xs focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none bg-rose-50/50" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="secondary" size="sm" onClick={() => setShowAddItem(false)}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={addBomItemLocally} disabled={!addItemProductId}>Add</Button>
        </div>
      </Modal>

      {/* ── Create Batch Modal ────────────────────────────────────────── */}
      <Modal open={showCreateBatch} onClose={() => setShowCreateBatch(false)} title="Create Batch" size="sm">
        {createBatchTargetBom && (
          <div className="space-y-4">
            <p className="text-sm text-rose-400">BOM: <strong className="text-[#121212]">{createBatchTargetBom.name}</strong>{" → "}{createBatchTargetBom.output_product_name}</p>
            <div>
              <label className="block text-sm font-semibold text-rose-500 mb-1">Batch Size (multiplier)</label>
              <input type="number" step="any" min="0.01" value={createBatchSize} onChange={(e) => setCreateBatchSize(parseFloat(e.target.value) || 1)}
                className="touch-target w-full px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" />
              <p className="text-xs text-rose-300 mt-1">Produces {createBatchTargetBom.output_quantity * createBatchSize} {createBatchTargetBom.output_unit} per batch</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-rose-500 mb-1">Notes (optional)</label>
              <input type="text" value={createBatchNotes} onChange={(e) => setCreateBatchNotes(e.target.value)}
                className="touch-target w-full px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50" placeholder="e.g. Urgent order for customer..." />
            </div>
          </div>
        )}
        <div className="flex gap-3 mt-6">
          <Button variant="secondary" onClick={() => setShowCreateBatch(false)}>Cancel</Button>
          <Button variant="primary" onClick={createBatch}>Create Batch</Button>
        </div>
      </Modal>

      {/* ── Reserve Result Modal ──────────────────────────────────────── */}
      <Modal open={showReserveResult} onClose={() => { setShowReserveResult(false); setReserveResult(null); }} title="🔒 Reservation Result" size="md">
        {reserveResult && (
          <>
            <div className={`rounded-xl px-4 py-3 mb-4 text-sm font-medium ${reserveResult.canExecute ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              {reserveResult.summary}
            </div>

            {reserveResult.reserved.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-blue-500 mb-2">✅ Reserved</p>
                <div className="space-y-1">
                  {reserveResult.reserved.map((r, i) => (
                    <div key={i} className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg flex justify-between">
                      <span>{r.productName} ({r.sku})</span>
                      <span className="font-mono">{r.reserved} / {r.needed} {r.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reserveResult.shortages.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-amber-500 mb-2">⚠️ Shortages</p>
                <div className="space-y-1">
                  {reserveResult.shortages.map((s, i) => (
                    <div key={i} className="text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg flex justify-between">
                      <span>{s.productName} ({s.sku})</span>
                      <span className="font-mono">need {s.needed} / have {s.available} (short {s.shortfall} {s.unit})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              {reserveResult.canExecute && (
                <Button variant="primary" onClick={() => executeBatchAfterReserve(reserveResult.batchId)}>
                  ▶ Execute Now
                </Button>
              )}
              <Button variant="secondary" onClick={() => { setShowReserveResult(false); setReserveResult(null); }}>Close</Button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Cancel Reason Modal ───────────────────────────────────────── */}
      <Modal open={showCancelReason} onClose={() => setShowCancelReason(false)} title="Cancel Batch" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Are you sure you want to cancel this batch?</p>
          <div>
            <label className="block text-sm font-semibold text-rose-500 mb-1">Reason (optional)</label>
            <input type="text" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              className="touch-target w-full px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50"
              placeholder="e.g. Ingredients unavailable, order cancelled..." />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="secondary" onClick={() => setShowCancelReason(false)}>Keep Batch</Button>
          <Button variant="danger" onClick={confirmCancelWithReason}>Cancel Batch</Button>
        </div>
      </Modal>

      {/* ── Confirm Modals ────────────────────────────────────────────── */}
      <ConfirmModal open={!!confirmDeleteBom} onClose={() => setConfirmDeleteBom(null)} onConfirm={() => { if (confirmDeleteBom) { return deleteBom(confirmDeleteBom.id); } }}
        title="Delete BOM" message="Delete this BOM? This cannot be undone." confirmLabel="Delete" />

      <ConfirmModal open={!!confirmReserveBatch} onClose={() => setConfirmReserveBatch(null)}
        onConfirm={() => { if (confirmReserveBatch) { return reserveBatch(confirmReserveBatch); } }}
        title="Reserve Inventory" message="Check availability and reserve materials for this batch? You can still cancel reservations if needed." confirmLabel="Reserve" confirmVariant="primary" />

      <ConfirmModal open={!!confirmExecuteBatch} onClose={() => setConfirmExecuteBatch(null)}
        onConfirm={() => { if (confirmExecuteBatch) { return executeBatch(confirmExecuteBatch); } }}
        title="Execute Batch" message="Execute this batch? This will consume raw materials and produce finished goods. Make sure inventory is reserved first!" confirmLabel="Execute" confirmVariant="primary" />

      <ConfirmModal open={!!confirmUndoBatch} onClose={() => setConfirmUndoBatch(null)}
        onConfirm={() => { if (confirmUndoBatch) { return undoBatch(confirmUndoBatch.id); } }}
        title="Undo Batch" message={`Undo batch "${confirmUndoBatch?.bom_name}"? ⚠️ This will REVERSE all inventory changes — finished goods will be removed from stock and raw materials will be restored.`}
        confirmLabel="Undo & Reverse" />
    </div>
  );
}
