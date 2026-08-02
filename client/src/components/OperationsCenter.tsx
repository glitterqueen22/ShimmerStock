import { useState, useEffect } from 'react';
import { Button, Badge, Modal, useToast } from './ui';
import Novi from './Novi';

// ── Types ──────────────────────────────────────────────────────────

interface Operation {
  id: string;
  label: string;
  available: boolean;
  reason: string | null;
  icon: string;
}

interface OperationsData {
  orderId: number;
  orderStatus: string;
  holdReason: string | null;
  previousStatus: string | null;
  itemCount: number;
  hasBackorderedItems: boolean;
  availableOperations: Operation[];
}

interface OrderItem {
  id: number;
  sku: string;
  variant_title: string | null;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  product_id: number | null;
  product_name: string | null;
  item_status?: string | null;
}

interface ProductResult {
  id: number;
  name: string;
  sku: string;
  variant_id: number | null;
  variant_sku: string | null;
  variant_value: string | null;
  price: number | null;
}

// ── Internal API helper ────────────────────────────────────────────

function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem('shimmerstock_token');
  return fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  });
}

// ── Props ──────────────────────────────────────────────────────────

interface Props {
  orderId: number;
  orderNumber: number;
  customerName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Component ──────────────────────────────────────────────────────

export default function OperationsCenter({ orderId, orderNumber, customerName, open, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [opsData, setOpsData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sub-modals
  const [showHoldForm, setShowHoldForm] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [showCancelItemForm, setShowCancelItemForm] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<OrderItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelAction, setCancelAction] = useState<'refund' | 'store_credit' | 'no_action'>('no_action');
  const [showBackorderForm, setShowBackorderForm] = useState(false);
  const [backorderTarget, setBackorderTarget] = useState<OrderItem | null>(null);
  const [showSubstituteForm, setShowSubstituteForm] = useState(false);
  const [substituteTarget, setSubstituteTarget] = useState<OrderItem | null>(null);
  const [subSearch, setSubSearch] = useState('');
  const [subResults, setSubResults] = useState<ProductResult[]>([]);
  const [subSearching, setSubSearching] = useState(false);
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [showCreditForm, setShowCreditForm] = useState(false);

  // Order items
  const [items, setItems] = useState<OrderItem[]>([]);

  // Processing state
  const [processing, setProcessing] = useState(false);

  // ── Fetch operations data ────────────────────────────────────────

  useEffect(() => {
    if (!open || !orderId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api(`/api/fulfillment/orders/${orderId}/operations`).then(r => r.json()),
      api(`/api/fulfillment/orders/${orderId}/items`).then(r => r.json()).catch(() => []),
    ])
      .then(([ops, itemsData]) => {
        setOpsData(ops);
        setItems(Array.isArray(itemsData) ? itemsData : []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, orderId]);

  // ── Novi suggestion ──────────────────────────────────────────────

  const getNoviMessage = (): { message: string; expression: 'happy' | 'curious' | 'concerned' | 'celebrating' } => {
    if (!opsData) return { message: "💜 Let me look at this order...", expression: 'curious' };
    if (opsData.orderStatus === 'held')
      return { message: `💜 This order is on hold. Ready to release it?`, expression: 'concerned' };
    if (opsData.hasBackorderedItems)
      return { message: "💜 One or more items are backordered. Want to split and ship the rest?", expression: 'curious' };
    if (opsData.orderStatus === 'complete' || opsData.orderStatus === 'shipped')
      return { message: "💜 This order is complete! Nothing to do here. 🎉", expression: 'celebrating' };
    if (opsData.orderStatus === 'cancelled')
      return { message: "💜 This order has been cancelled.", expression: 'concerned' };
    return { message: "💜 Here's what you can do with this order...", expression: 'happy' };
  };

  // ── Operation handlers ───────────────────────────────────────────

  const handleHold = async () => {
    setProcessing(true);
    try {
      const res = await api(`/api/fulfillment/orders/${orderId}/hold`, {
        method: 'POST',
        body: JSON.stringify({ reason: holdReason }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(`⏸️ Order #${orderNumber} placed on hold`, 'info');
        setShowHoldForm(false);
        setHoldReason('');
        onSuccess();
      } else {
        toast(data.error || 'Failed to hold order', 'error');
      }
    } catch { toast('Failed to hold order', 'error'); }
    finally { setProcessing(false); }
  };

  const handleReleaseHold = async () => {
    setProcessing(true);
    try {
      const res = await api(`/api/fulfillment/orders/${orderId}/release-hold`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast(`▶️ Order #${orderNumber} hold released`, 'success');
        onSuccess();
      } else {
        toast(data.error || 'Failed to release hold', 'error');
      }
    } catch { toast('Failed to release hold', 'error'); }
    finally { setProcessing(false); }
  };

  const handleCancelItem = async () => {
    if (!cancelTarget) return;
    setProcessing(true);
    try {
      const res = await api(`/api/fulfillment/orders/${orderId}/cancel-item`, {
        method: 'POST',
        body: JSON.stringify({ orderItemId: cancelTarget.id, reason: cancelReason, action: cancelAction }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(`❌ Item cancelled`, 'info');
        setShowCancelItemForm(false);
        setCancelTarget(null);
        setCancelReason('');
        onSuccess();
      } else {
        toast(data.error || 'Failed to cancel item', 'error');
      }
    } catch { toast('Failed to cancel item', 'error'); }
    finally { setProcessing(false); }
  };

  const handleBackorder = async () => {
    if (!backorderTarget) return;
    setProcessing(true);
    try {
      const res = await api(`/api/fulfillment/orders/${orderId}/backorder-item`, {
        method: 'POST',
        body: JSON.stringify({ orderItemId: backorderTarget.id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(`📦 Item backordered`, 'info');
        setShowBackorderForm(false);
        setBackorderTarget(null);
        onSuccess();
      } else {
        toast(data.error || 'Failed to backorder item', 'error');
      }
    } catch { toast('Failed to backorder item', 'error'); }
    finally { setProcessing(false); }
  };

  const handleSubstituteSearch = async (query: string) => {
    setSubSearch(query);
    if (query.length < 2) { setSubResults([]); return; }
    setSubSearching(true);
    try {
      const res = await api(`/api/products/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSubResults(Array.isArray(data) ? data.slice(0, 10) : []);
    } catch { setSubResults([]); }
    finally { setSubSearching(false); }
  };

  const handleSubstitute = async (replacement: ProductResult) => {
    if (!substituteTarget) return;
    setProcessing(true);
    try {
      const res = await api(`/api/fulfillment/orders/${orderId}/substitute-item`, {
        method: 'POST',
        body: JSON.stringify({
          orderItemId: substituteTarget.id,
          replacementProductId: replacement.id,
          replacementVariantId: replacement.variant_id,
          reason: `Substituted with ${replacement.name}`,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(`🔄 Item substituted with ${replacement.name}`, 'success');
        setShowSubstituteForm(false);
        setSubstituteTarget(null);
        setSubSearch('');
        setSubResults([]);
        onSuccess();
      } else {
        toast(data.error || 'Failed to substitute item', 'error');
      }
    } catch { toast('Failed to substitute item', 'error'); }
    finally { setProcessing(false); }
  };

  // ── Action dispatcher ────────────────────────────────────────────

  const handleOperationClick = (op: Operation) => {
    if (!op.available) return;
    switch (op.id) {
      case 'hold':
        setShowHoldForm(true);
        break;
      case 'release_hold':
        handleReleaseHold();
        break;
      case 'cancel_item':
        setShowCancelItemForm(true);
        break;
      case 'backorder':
        setShowBackorderForm(true);
        break;
      case 'substitute':
        setShowSubstituteForm(true);
        break;
      case 'split':
        // SplitShipmentWizard is available in the parent — signal
        onClose();
        toast('Use the Split Shipment wizard from the Fulfillment page', 'info');
        break;
      case 'merge':
        onClose();
        toast('Use the Combine Orders feature from the Orders list', 'info');
        break;
      case 'store_credit':
        setShowCreditForm(true);
        break;
      case 'refund':
        setShowRefundForm(true);
        break;
    }
  };

  // ── Operation card colors ────────────────────────────────────────

  const opCardStyle = (available: boolean) =>
    `rounded-xl p-4 border-2 transition-all cursor-pointer ${
      available
        ? 'border-rose-200 bg-white hover:border-rose-400 hover:shadow-md card-lift'
        : 'border-neutral-100 bg-neutral-50/50 opacity-60 cursor-not-allowed'
    }`;

  // ── Format helpers ───────────────────────────────────────────────

  const fmtCurrency = (v: number | null | undefined) => v != null ? `$${v.toFixed(2)}` : '—';
  const fmtStatus = (s: string): "success" | "warning" | "danger" | "info" => {
    const m: Record<string, "success" | "warning" | "danger" | "info"> = {
      pending: 'warning', picking: 'info', complete: 'success', cancelled: 'danger',
      held: 'warning', shipped: 'success', partial: 'info', combined: 'info',
    };
    return m[s] || 'info';
  };

  if (!open) return null;

  const noviSuggestion = getNoviMessage();

  return (
    <Modal open={open} onClose={onClose} title="" size="lg">
      <div className="space-y-4" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#121212] font-[family-name:var(--font-heading)]">
              ⚡ Operations Center
            </h2>
            <p className="text-sm text-rose-400">
              Order #{orderNumber} — {customerName}
              {opsData && (
                <span className="ml-2">
                  <Badge status={fmtStatus(opsData.orderStatus)}>{opsData.orderStatus}</Badge>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Novi Suggestion Bar */}
        <div className="flex items-start gap-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-3 border border-purple-200">
          <Novi expression={noviSuggestion.expression} size="sm" animated={false} />
          <p className="text-sm text-purple-800 pt-1">{noviSuggestion.message}</p>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-2 border-rose-300 border-t-rose-500 rounded-full mx-auto mb-3" />
            <p className="text-sm text-rose-400">Loading operations...</p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
            Error: {error}
          </div>
        )}

        {/* Operation Cards Grid */}
        {!loading && opsData && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {opsData.availableOperations.map(op => (
                <button
                  key={op.id}
                  className={opCardStyle(op.available)}
                  onClick={() => handleOperationClick(op)}
                  disabled={!op.available || processing}
                  title={op.reason || undefined}
                >
                  <div className="text-2xl mb-1">{op.icon}</div>
                  <p className="text-sm font-semibold text-[#121212]">{op.label}</p>
                  {!op.available && op.reason && (
                    <p className="text-xs text-neutral-400 mt-1">{op.reason}</p>
                  )}
                </button>
              ))}
            </div>

            {/* Order Items Quick View */}
            {items.length > 0 && (
              <div className="bg-rose-50/50 rounded-xl p-3 border border-rose-100">
                <h3 className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">
                  📦 Items ({items.length})
                </h3>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm border border-rose-50">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate">{item.product_name || item.sku}</span>
                        {item.variant_title && <span className="text-rose-400 ml-1">— {item.variant_title}</span>}
                        <span className="text-xs text-neutral-400 ml-1">× {item.quantity}</span>
                      </div>
                      <span className="font-semibold ml-2">{fmtCurrency(item.line_total)}</span>
                      {item.item_status && item.item_status !== 'active' && (
                        <Badge>{item.item_status}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Sub-Modals ──────────────────────────────────────────── */}

      {/* Hold Order Form */}
      {showHoldForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-5 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold">⏸️ Hold Order #{orderNumber}</h3>
            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1">Reason for hold</label>
              <textarea value={holdReason} onChange={e => setHoldReason(e.target.value)}
                placeholder="e.g. Waiting for customer confirmation..."
                className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm" rows={3} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => { setShowHoldForm(false); setHoldReason(''); }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleHold} loading={processing}>
                Hold Order
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Item Form */}
      {showCancelItemForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-5 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold">❌ Cancel Item</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {items.filter(i => !i.item_status || i.item_status === 'active').map(item => (
                <button key={item.id}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${cancelTarget?.id === item.id ? 'border-rose-400 bg-rose-50' : 'border-rose-100 bg-white hover:bg-rose-50'}`}
                  onClick={() => setCancelTarget(item)}>
                  <span className="font-medium">{item.product_name || item.sku}</span>
                  {item.variant_title && <span className="text-rose-400 ml-1">— {item.variant_title}</span>}
                  <span className="text-xs text-neutral-400 ml-1">× {item.quantity}</span>
                  <span className="float-right">{fmtCurrency(item.line_total)}</span>
                </button>
              ))}
            </div>
            {cancelTarget && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-rose-400 mb-1">Reason</label>
                  <input type="text" value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                    placeholder="e.g. Out of stock, customer request..." className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-rose-400 mb-1">Refund Action</label>
                  <div className="flex gap-2">
                    {(['no_action', 'refund', 'store_credit'] as const).map(a => (
                      <button key={a} onClick={() => setCancelAction(a)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold ${cancelAction === a ? 'bg-rose-500 text-white' : 'bg-rose-50 text-rose-400'}`}>
                        {a === 'no_action' ? 'No Refund' : a === 'refund' ? 'Refund' : 'Store Credit'}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => { setShowCancelItemForm(false); setCancelTarget(null); }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleCancelItem} loading={processing} disabled={!cancelTarget}>
                Cancel Item
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Backorder Item Form */}
      {showBackorderForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-5 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold">📦 Backorder Item</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {items.filter(i => !i.item_status || i.item_status === 'active').map(item => (
                <button key={item.id}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${backorderTarget?.id === item.id ? 'border-rose-400 bg-rose-50' : 'border-rose-100 bg-white hover:bg-rose-50'}`}
                  onClick={() => setBackorderTarget(item)}>
                  <span className="font-medium">{item.product_name || item.sku}</span>
                  {item.variant_title && <span className="text-rose-400 ml-1">— {item.variant_title}</span>}
                  <span className="text-xs text-neutral-400 ml-1">× {item.quantity}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => { setShowBackorderForm(false); setBackorderTarget(null); }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleBackorder} loading={processing} disabled={!backorderTarget}>
                Mark Backordered
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Substitute Item Form */}
      {showSubstituteForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-5 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold">🔄 Substitute Item</h3>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {items.filter(i => !i.item_status || i.item_status === 'active').map(item => (
                <button key={item.id}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${substituteTarget?.id === item.id ? 'border-rose-400 bg-rose-50' : 'border-rose-100 bg-white hover:bg-rose-50'}`}
                  onClick={() => setSubstituteTarget(item)}>
                  <span className="font-medium">{item.product_name || item.sku}</span>
                  {item.variant_title && <span className="text-rose-400 ml-1">— {item.variant_title}</span>}
                  <span className="text-xs text-neutral-400 ml-1">× {item.quantity}</span>
                </button>
              ))}
            </div>
            {substituteTarget && (
              <div>
                <label className="block text-xs font-semibold text-rose-400 mb-1">Search Replacement</label>
                <input type="text" value={subSearch} onChange={e => handleSubstituteSearch(e.target.value)}
                  placeholder="Search by product name or SKU..." className="w-full border border-rose-200 rounded-lg px-3 py-2 text-sm" />
                {subSearching && <p className="text-xs text-rose-400 mt-1">Searching...</p>}
                {subResults.length > 0 && (
                  <div className="mt-1 bg-white border border-rose-100 rounded-lg max-h-32 overflow-y-auto">
                    {subResults.map(p => (
                      <button key={p.variant_id || p.id} onClick={() => handleSubstitute(p)}
                        className="w-full text-left px-3 py-2 hover:bg-rose-50 text-sm border-b border-rose-50 last:border-0">
                        <span className="font-medium">{p.name}</span>
                        {p.variant_value && <span className="text-rose-400"> — {p.variant_value}</span>}
                        <span className="text-xs text-neutral-400 ml-1">SKU: {p.variant_sku || p.sku}</span>
                        <span className="float-right text-rose-500">{p.price ? `$${p.price.toFixed(2)}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => { setShowSubstituteForm(false); setSubstituteTarget(null); setSubSearch(''); setSubResults([]); }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Store Credit Note — simplified for now */}
      {showCreditForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-5 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold">💳 Issue Store Credit</h3>
            <p className="text-sm text-rose-400">
              Store credit can be issued by cancelling an item and selecting "Store Credit" as the refund action.
              Use the Cancel Item operation.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShowCreditForm(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Note — simplified for now */}
      {showRefundForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-5 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold">💰 Refund</h3>
            <p className="text-sm text-rose-400">
              Refunds can be processed by cancelling items and selecting "Refund" as the refund action.
              Use the Cancel Item operation.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShowRefundForm(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
