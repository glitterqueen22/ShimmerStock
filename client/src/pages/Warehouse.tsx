import { useState, useEffect, useCallback } from 'react';
import { Tabs, Button, Modal, Badge, EmptyState, ErrorBanner, PageHeader, useToast } from '../components/ui';
import { RADIUS } from '../design/tokens';
import { MOTION } from '../design/motion';
import Novi from '../components/Novi';
import { apiFetch } from '../lib/api';

// ── Types ────────────────────────────────────────────────────────
interface Bin {
  id: number;
  name: string;
  zone: string | null;
  product_count: number;
  total_quantity: number;
  created_at: string;
}

interface BinContent {
  id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  product_name: string;
  sku: string;
  stock_count: number;
  variant_sku: string | null;
  variant_value: string | null;
}

interface Transfer {
  id: number;
  from_bin_id: number | null;
  to_bin_id: number;
  product_id: number | null;
  quantity: number;
  transfer_type: string;
  reference_type: string | null;
  reference_id: number | null;
  notes: string | null;
  from_bin_name: string | null;
  to_bin_name: string | null;
  product_name: string | null;
  sku: string | null;
  user_name: string | null;
  created_at: string;
}

interface PickListItem {
  order_item_id: number;
  product_id: number;
  sku: string;
  variant_title: string | null;
  ordered_qty: number;
  scanned_quantity: number;
  product_name: string;
  remaining: number;
  bins: { bin_id: number; bin_name: string; zone: string; available: number; pick_quantity: number }[];
  pickable: boolean;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  stock_count: number;
}

interface Order {
  id: number;
  order_number: number;
  customer_name: string;
  status: string;
  item_count: number;
  total_qty: number;
  scanned_items: number;
  total_amount: number;
}

// ── Zone color mapping ───────────────────────────────────────────
const ZONE_COLORS: Record<string, string> = {
  Receiving: 'bg-blue-100 text-blue-700 border-blue-200',
  Storage: 'bg-amber-100 text-amber-700 border-amber-200',
  Picking: 'bg-green-100 text-green-700 border-green-200',
  Shipping: 'bg-purple-100 text-purple-700 border-purple-200',
};

const TRANSFER_COLORS: Record<string, string> = {
  receive: 'bg-blue-100 text-blue-700',
  move: 'bg-amber-100 text-amber-700',
  pick: 'bg-green-100 text-green-700',
  cycle_count_adjustment: 'bg-purple-100 text-purple-700',
  ship: 'bg-rose-100 text-rose-700',
};

// ── API helper ────────────────────────────────────────────────────
function api(path: string, init?: RequestInit) {
  return apiFetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  }).then((r) => {
    if (!r.ok) return r.json().then((e) => { throw new Error(e.error || r.statusText); });
    return r.json();
  });
}

// ── Component ─────────────────────────────────────────────────────
export default function Warehouse() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('bins');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [bins, setBins] = useState<Bin[]>([]);
  const [selectedBin, setSelectedBin] = useState<Bin | null>(null);
  const [binContents, setBinContents] = useState<BinContent[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  // Receive form
  const [products, setProducts] = useState<Product[]>([]);
  const [receiveForm, setReceiveForm] = useState({ binId: '', productId: '', quantity: '1', referenceType: '', referenceId: '', notes: '' });

  // Move form
  const [moveForm, setMoveForm] = useState({ fromBinId: '', toBinId: '', productId: '', quantity: '1', notes: '' });

  // Pick & Pack
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [pickList, setPickList] = useState<PickListItem[]>([]);
  const [shipmentTabs, setShipmentTabs] = useState<any[]>([]);
  const [activeShipmentId, setActiveShipmentId] = useState<number | null>(null);

  // Barcode scan
  const [barcodeScanItem, setBarcodeScanItem] = useState<number | null>(null); // order_item_id
  const [scanValue, setScanValue] = useState('');
  const [scanning, setScanning] = useState(false);

  // Modals
  const [showAddBin, setShowAddBin] = useState(false);
  const [showBinDetail, setShowBinDetail] = useState(false);
  const [showCycleCount, setShowCycleCount] = useState(false);
  const [cycleForm, setCycleForm] = useState({ binId: '', productId: '', actualQuantity: '' });

  const [addBinForm, setAddBinForm] = useState({ name: '', zone: 'Storage' });
  const [saving, setSaving] = useState(false);

  // ── Load data ────────────────────────────────────────────────────
  const loadBins = useCallback(async () => {
    try {
      const data = await api('/api/warehouse/bins');
      setBins(data);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const loadTransfers = useCallback(async () => {
    try {
      const data = await api('/api/warehouse/transfers?limit=50');
      setTransfers(data);
    } catch (err: any) { /* non-critical */ }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const data = await api('/api/products');
      setProducts(data);
    } catch (err: any) { /* non-critical */ }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const data = await api('/api/orders');
      // Only show pending/picking orders
      setOrders(data.filter((o: Order) => o.status === 'pending' || o.status === 'picking'));
    } catch (err: any) { /* non-critical */ }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([loadBins(), loadTransfers(), loadProducts(), loadOrders()]);
    setLoading(false);
  }, [loadBins, loadTransfers, loadProducts, loadOrders]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Handlers ─────────────────────────────────────────────────────

  async function handleAddBin(e: React.FormEvent) {
    e.preventDefault();
    if (!addBinForm.name.trim()) return;
    setSaving(true);
    try {
      await api('/api/warehouse/bins', {
        method: 'POST',
        body: JSON.stringify({ name: addBinForm.name.trim(), zone: addBinForm.zone }),
      });
      setShowAddBin(false);
      setAddBinForm({ name: '', zone: 'Storage' });
      toast('Bin created', "success");
      await loadBins();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleViewBin(bin: Bin) {
    try {
      const data = await api(`/api/warehouse/bins/${bin.id}`);
      setSelectedBin(data);
      setBinContents(data.contents || []);
      setShowBinDetail(true);
    } catch (err: any) {
      toast(err.message, "error");
    }
  }

  async function handleReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!receiveForm.binId || !receiveForm.productId || !receiveForm.quantity) return;
    setSaving(true);
    try {
      await api('/api/warehouse/receive', {
        method: 'POST',
        body: JSON.stringify({
          binId: parseInt(receiveForm.binId),
          productId: parseInt(receiveForm.productId),
          quantity: parseFloat(receiveForm.quantity),
          referenceType: receiveForm.referenceType || null,
          referenceId: receiveForm.referenceId ? parseInt(receiveForm.referenceId) : null,
          notes: receiveForm.notes || null,
        }),
      });
      toast('Items received into bin', "success");
      setReceiveForm({ binId: '', productId: '', quantity: '1', referenceType: '', referenceId: '', notes: '' });
      await loadBins();
      await loadTransfers();
      await loadProducts();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(e: React.FormEvent) {
    e.preventDefault();
    if (!moveForm.fromBinId || !moveForm.toBinId || !moveForm.productId || !moveForm.quantity) return;
    setSaving(true);
    try {
      await api('/api/warehouse/move', {
        method: 'POST',
        body: JSON.stringify({
          fromBinId: parseInt(moveForm.fromBinId),
          toBinId: parseInt(moveForm.toBinId),
          productId: parseInt(moveForm.productId),
          quantity: parseFloat(moveForm.quantity),
          notes: moveForm.notes || null,
        }),
      });
      toast('Items moved between bins', "success");
      setMoveForm({ fromBinId: '', toBinId: '', productId: '', quantity: '1', notes: '' });
      await loadBins();
      await loadTransfers();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadPickList(order: Order) {
    setSelectedOrder(order);
    setActiveShipmentId(null);
    try {
      const data = await api(`/api/warehouse/pick-list/${order.id}`);
      setPickList(data);
      // Also load shipments for split orders
      const shipRes = await fetch(`/api/fulfillment/orders/${order.id}/shipments`, {
        credentials: 'same-origin'
      });
      if (shipRes.ok) {
        const shipments = await shipRes.json();
        setShipmentTabs(shipments || []);
        if (shipments && shipments.length > 0) {
          setActiveShipmentId(shipments[0].id);
        }
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  }

  async function handlePick(item: PickListItem, bin: PickListItem['bins'][0]) {
    setSaving(true);
    try {
      await api('/api/warehouse/pick', {
        method: 'POST',
        body: JSON.stringify({
          orderId: selectedOrder!.id,
          orderItemId: item.order_item_id,
          binId: bin.bin_id,
          productId: item.product_id,
          quantity: bin.pick_quantity,
        }),
      });
      toast(`Picked ${bin.pick_quantity}x ${item.product_name}`, "success");
      // Reload pick list
      await handleLoadPickList(selectedOrder!);
      await loadBins();
      await loadTransfers();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleShipOrder() {
    if (!selectedOrder) return;
    setSaving(true);
    try {
      await api(`/api/warehouse/ship/${selectedOrder.id}`, { method: 'POST' });
      toast(`Order #${selectedOrder.order_number} shipped!`, "success");
      setSelectedOrder(null);
      setPickList([]);
      await loadOrders();
      await loadTransfers();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleBarcodeScan(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder || !scanValue.trim()) return;
    setScanning(true);
    try {
      const result = await api(`/api/orders/${selectedOrder.id}/scan`, {
        method: 'POST',
        body: JSON.stringify({ barcode: scanValue.trim() }),
      });
      toast(`Scanned: ${result.productName || result.sku} (${result.scanned}/${result.total})`, "success");
      setScanValue('');
      setBarcodeScanItem(null);
      // Refresh pick list to show updated progress
      await handleLoadPickList(selectedOrder);
      await loadOrders();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setScanning(false);
    }
  }

  async function handleCycleCount(e: React.FormEvent) {
    e.preventDefault();
    if (!cycleForm.binId || !cycleForm.productId || cycleForm.actualQuantity === '') return;
    setSaving(true);
    try {
      const result = await api('/api/warehouse/cycle-count', {
        method: 'POST',
        body: JSON.stringify({
          binId: parseInt(cycleForm.binId),
          productId: parseInt(cycleForm.productId),
          actualQuantity: parseFloat(cycleForm.actualQuantity),
        }),
      });
      if (result.adjusted) {
        toast(`Adjusted by ${result.difference > 0 ? '+' : ''}${result.difference}`, "success");
      } else {
        toast('Count matches — no adjustment needed', "info");
      }
      setShowCycleCount(false);
      setCycleForm({ binId: '', productId: '', actualQuantity: '' });
      await loadBins();
      await loadTransfers();
      await loadProducts();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────
  const allPicked = pickList.length > 0 && pickList.every(i => i.remaining <= 0);
  const canShip = selectedOrder && allPicked && selectedOrder.status !== 'shipped';

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Warehouse HQ" novi={<Novi size="sm" accessory="warehouse" />} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-xl bg-neutral-100 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse HQ"
        novi={<Novi size="sm" accessory="warehouse" />}
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowAddBin(true)}>
            + Add Bin
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Tabs
        tabs={[
          { id: 'bins', label: 'Bins' },
          { id: 'receive', label: 'Receive' },
          { id: 'pick-pack', label: 'Pick & Pack' },
          { id: 'transfers', label: 'Transfers' },
        ]}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id)}
      />

      {/* ── Bins Tab ─────────────────────────────────────────────── */}
      {activeTab === 'bins' && (
        bins.length === 0 ? (
          <EmptyState
            icon="🏗️"
            title="No warehouse bins yet"
            description="Create your first bin to start organizing your inventory."
            action={{ label: 'Create Bin', onClick: () => setShowAddBin(true) }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bins.map((bin) => (
              <button
                key={bin.id}
                onClick={() => handleViewBin(bin)}
                className={`text-left p-5 rounded-xl border ${RADIUS.card} bg-white
                  hover:shadow-md hover:border-rose-200 transition-all duration-200 ${MOTION.hover}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-bold text-neutral-800">{bin.name}</span>
                  {bin.zone && (
                    <Badge className={ZONE_COLORS[bin.zone] || 'bg-neutral-100 text-neutral-600'}>
                      {bin.zone}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-4 text-sm text-neutral-500">
                  <span>{bin.product_count} products</span>
                  <span>{bin.total_quantity} total qty</span>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {/* ── Receive Tab ──────────────────────────────────────────── */}
      {activeTab === 'receive' && (
        <div className="max-w-lg">
          <form onSubmit={handleReceive} className="space-y-4 bg-white p-6 rounded-xl border border-neutral-200">
            <h3 className="text-lg font-semibold text-neutral-800">Receive Items into Bin</h3>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Bin</label>
              <select
                value={receiveForm.binId}
                onChange={(e) => setReceiveForm({ ...receiveForm, binId: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                required
              >
                <option value="">Select bin...</option>
                {bins.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.zone})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Product</label>
              <select
                value={receiveForm.productId}
                onChange={(e) => setReceiveForm({ ...receiveForm, productId: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                required
              >
                <option value="">Select product...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Quantity</label>
              <input
                type="number"
                value={receiveForm.quantity}
                onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                min="0.01"
                step="any"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Reference Type</label>
                <select
                  value={receiveForm.referenceType}
                  onChange={(e) => setReceiveForm({ ...receiveForm, referenceType: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                >
                  <option value="">None</option>
                  <option value="purchase_order">Purchase Order</option>
                  <option value="production_batch">Production Batch</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Reference ID</label>
                <input
                  type="number"
                  value={receiveForm.referenceId}
                  onChange={(e) => setReceiveForm({ ...receiveForm, referenceId: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Notes</label>
              <input
                type="text"
                value={receiveForm.notes}
                onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                placeholder="Optional..."
              />
            </div>

            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Receiving...' : 'Receive Items'}
            </Button>

            {/* Quick: Move between bins */}
            <hr className="my-4" />
            <h4 className="text-md font-semibold text-neutral-700">Move Between Bins</h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">From Bin</label>
                <select
                  value={moveForm.fromBinId}
                  onChange={(e) => setMoveForm({ ...moveForm, fromBinId: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                >
                  <option value="">Select...</option>
                  {bins.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">To Bin</label>
                <select
                  value={moveForm.toBinId}
                  onChange={(e) => setMoveForm({ ...moveForm, toBinId: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                >
                  <option value="">Select...</option>
                  {bins.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Product</label>
                <select
                  value={moveForm.productId}
                  onChange={(e) => setMoveForm({ ...moveForm, productId: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                >
                  <option value="">Select...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Quantity</label>
                <input
                  type="number"
                  value={moveForm.quantity}
                  onChange={(e) => setMoveForm({ ...moveForm, quantity: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                  min="1"
                />
              </div>
            </div>
            <Button type="button" variant="secondary" disabled={saving} onClick={handleMove}>
              {saving ? 'Moving...' : 'Move Items'}
            </Button>
          </form>
        </div>
      )}

      {/* ── Pick & Pack Tab ──────────────────────────────────────── */}
      {activeTab === 'pick-pack' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order selector */}
          <div className="lg:col-span-1 space-y-3">
            <h3 className="font-semibold text-neutral-800">Orders Ready to Pick</h3>
            {orders.length === 0 ? (
              <EmptyState icon="📋" title="No pending orders" description="Orders awaiting picking will appear here." />
            ) : (
              orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => handleLoadPickList(o)}
                  className={`w-full text-left p-4 rounded-xl border ${RADIUS.card} transition-all duration-200
                    ${selectedOrder?.id === o.id ? 'border-rose-400 bg-rose-50 shadow-sm' : 'border-neutral-200 bg-white hover:border-rose-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-800">#{o.order_number}</span>
                    <Badge className={o.status === 'picking' ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-600'}>
                      {o.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-neutral-500 mt-1">{o.customer_name}</p>
                  <p className="text-xs text-neutral-400">{o.item_count} items · {o.scanned_items}/{o.total_qty} scanned</p>
                </button>
              ))
            )}
          </div>

          {/* Pick list */}
          <div className="lg:col-span-2">
            {!selectedOrder ? (
              <EmptyState icon="👈" title="Select an order" description="Choose an order from the left to view its pick list." />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-neutral-800">Pick List — Order #{selectedOrder.order_number}</h3>
                    <p className="text-sm text-neutral-500">{selectedOrder.customer_name}</p>
                  </div>
                  <div className="flex gap-2">
                    {canShip && (
                      <Button variant="primary" size="sm" onClick={handleShipOrder} disabled={saving}>
                        🚀 Ship Order
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowCycleCount(true)}
                    >
                      🔄 Cycle Count
                    </Button>
                  </div>
                </div>

                {/* Shipment selector for split orders */}
                {shipmentTabs.length > 1 && (
                  <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
                    {shipmentTabs.map(st => (
                      <button
                        key={st.id}
                        onClick={() => setActiveShipmentId(st.id)}
                        className={`flex-1 text-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          activeShipmentId === st.id
                            ? 'bg-white text-rose-700 shadow-sm'
                            : 'text-neutral-500 hover:text-neutral-700'
                        }`}
                      >
                        📦 Shipment {st.shipment_number} ({st.items?.length || 0} items)
                      </button>
                    ))}
                  </div>
                )}

                {selectedOrder.status === 'shipped' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">
                    ✅ This order has been shipped.
                  </div>
                )}

                {pickList.map((item) => (
                  <div key={item.order_item_id} className={`p-4 rounded-xl border ${RADIUS.card} ${item.pickable ? 'bg-white border-neutral-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-semibold text-neutral-800">{item.product_name}</span>
                        <span className="text-sm text-neutral-400 ml-2">{item.sku}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Barcode scan trigger */}
                        {item.remaining > 0 && (
                          <button
                            type="button"
                            onClick={() => { setBarcodeScanItem(barcodeScanItem === item.order_item_id ? null : item.order_item_id); setScanValue(''); }}
                            className="p-1.5 text-neutral-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                            title="Scan barcode"
                          >
                            📱
                          </button>
                        )}
                        <Badge className={item.remaining <= 0 ? 'bg-green-100 text-green-700' : item.pickable ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}>
                          {item.remaining <= 0 ? 'Picked' : item.pickable ? `${item.remaining} to pick` : 'Not available'}
                        </Badge>
                      </div>
                    </div>

                    {/* Inline barcode input */}
                    {barcodeScanItem === item.order_item_id && (
                      <form onSubmit={handleBarcodeScan} className="mb-2 p-2 bg-rose-50 border border-rose-200 rounded-lg">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={scanValue}
                            onChange={(e) => setScanValue(e.target.value)}
                            placeholder="Scan or type barcode/SKU..."
                            className="flex-1 px-3 py-1.5 text-sm border border-rose-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500"
                            autoFocus
                          />
                          <Button type="submit" size="sm" disabled={scanning || !scanValue.trim()}>
                            {scanning ? '...' : 'Scan'}
                          </Button>
                          <button
                            type="button"
                            onClick={() => { setBarcodeScanItem(null); setScanValue(''); }}
                            className="text-neutral-400 hover:text-neutral-600 text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      </form>
                    )}

                    {item.bins.length > 0 && item.remaining > 0 && (
                      <div className="space-y-2 mt-2">
                        {item.bins.map((bin) => (
                          <div key={bin.bin_id} className="flex items-center justify-between p-2 bg-neutral-50 rounded-lg">
                            <div className="flex items-center gap-2">
                              <Badge className={ZONE_COLORS[bin.zone] || 'bg-neutral-100 text-neutral-600'}>{bin.bin_name}</Badge>
                              <span className="text-sm text-neutral-500">{bin.available} available</span>
                            </div>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={saving || bin.pick_quantity <= 0}
                              onClick={() => handlePick(item, bin)}
                            >
                              Pick {bin.pick_quantity}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {item.bins.length === 0 && item.remaining > 0 && (
                      <p className="text-sm text-red-500 mt-2">No bin has this product in stock.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Transfers Tab ────────────────────────────────────────── */}
      {activeTab === 'transfers' && (
        transfers.length === 0 ? (
          <EmptyState icon="📋" title="No transfers yet" description="Transfer history will appear here as items move through the warehouse." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500 font-medium">
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">From</th>
                  <th className="py-2 px-3">To</th>
                  <th className="py-2 px-3">Product</th>
                  <th className="py-2 px-3">Qty</th>
                  <th className="py-2 px-3">Notes</th>
                  <th className="py-2 px-3">User</th>
                  <th className="py-2 px-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-3">
                      <Badge className={TRANSFER_COLORS[t.transfer_type] || 'bg-neutral-100 text-neutral-600'}>
                        {t.transfer_type.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-neutral-500">{t.from_bin_name || '—'}</td>
                    <td className="py-2 px-3 text-neutral-500">{t.to_bin_name || '—'}</td>
                    <td className="py-2 px-3 text-neutral-700">{t.product_name || t.sku || '—'}</td>
                    <td className="py-2 px-3 text-neutral-700 font-medium">{t.quantity}</td>
                    <td className="py-2 px-3 text-neutral-400 text-xs max-w-[200px] truncate">{t.notes || '—'}</td>
                    <td className="py-2 px-3 text-neutral-400">{t.user_name || '—'}</td>
                    <td className="py-2 px-3 text-neutral-400 text-xs">{new Date(t.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Add Bin Modal ────────────────────────────────────────── */}
      <Modal open={showAddBin} onClose={() => setShowAddBin(false)} title="Create Warehouse Bin">
        <form onSubmit={handleAddBin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Bin Name</label>
            <input
              type="text"
              value={addBinForm.name}
              onChange={(e) => setAddBinForm({ ...addBinForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              placeholder="e.g., A-04, Shelf-7"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Zone</label>
            <select
              value={addBinForm.zone}
              onChange={(e) => setAddBinForm({ ...addBinForm, zone: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
            >
              <option value="Receiving">Receiving</option>
              <option value="Storage">Storage</option>
              <option value="Picking">Picking</option>
              <option value="Shipping">Shipping</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => setShowAddBin(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={saving || !addBinForm.name.trim()}>
              {saving ? 'Creating...' : 'Create Bin'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Bin Detail Modal ─────────────────────────────────────── */}
      <Modal open={showBinDetail} onClose={() => { setShowBinDetail(false); setSelectedBin(null); }} title={selectedBin?.name ? `Bin: ${selectedBin.name}` : 'Bin Details'}>
        {selectedBin && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge className={ZONE_COLORS[selectedBin.zone || ''] || 'bg-neutral-100 text-neutral-600'}>
                {selectedBin.zone || 'No zone'}
              </Badge>
              <span className="text-sm text-neutral-500">{binContents.length} products</span>
            </div>

            {binContents.length === 0 ? (
              <EmptyState icon="📦" title="Bin is empty" description="No products stored in this bin yet." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500 font-medium">
                    <th className="py-2 px-2">Product</th>
                    <th className="py-2 px-2">SKU</th>
                    <th className="py-2 px-2">Bin Qty</th>
                    <th className="py-2 px-2">Total Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {binContents.map((c) => (
                    <tr key={c.id} className="border-b border-neutral-100">
                      <td className="py-2 px-2 text-neutral-800 font-medium">{c.product_name}</td>
                      <td className="py-2 px-2 text-neutral-400">{c.sku}</td>
                      <td className="py-2 px-2 text-neutral-700">{c.quantity}</td>
                      <td className="py-2 px-2 text-neutral-500">{c.stock_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Modal>

      {/* ── Cycle Count Modal ────────────────────────────────────── */}
      <Modal open={showCycleCount} onClose={() => setShowCycleCount(false)} title="Cycle Count">
        <form onSubmit={handleCycleCount} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Bin</label>
            <select
              value={cycleForm.binId}
              onChange={(e) => setCycleForm({ ...cycleForm, binId: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              required
            >
              <option value="">Select bin...</option>
              {bins.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.zone})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Product</label>
            <select
              value={cycleForm.productId}
              onChange={(e) => setCycleForm({ ...cycleForm, productId: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              required
            >
              <option value="">Select product...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Actual Quantity Counted</label>
            <input
              type="number"
              value={cycleForm.actualQuantity}
              onChange={(e) => setCycleForm({ ...cycleForm, actualQuantity: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              min="0"
              step="any"
              required
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => setShowCycleCount(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Counting...' : 'Submit Count'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
