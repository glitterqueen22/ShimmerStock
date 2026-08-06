import { useState, useEffect } from 'react';
import { Button, Modal, Badge, useToast } from './ui';
import Novi from './Novi';

// ── Types ──────────────────────────────────────────────────────────
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

interface SplitSuggestion {
  suggestSplit: boolean;
  backorderedItems: OrderItem[];
  readyItems: OrderItem[];
  message: string;
}


type HandleRemaining = 'hold' | 'notify' | 'refund' | 'store_credit' | 'wait';

// ── Internal API helper (same pattern as Fulfillment.tsx) ─────────
function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem('shimmerstock_token');
  return fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  });
}

interface Props {
  orderId: number;
  orderNumber: number;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'select' | 'handle' | 'confirm';

export default function SplitShipmentWizard({ orderId, orderNumber, open, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('select');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [handleRemaining, setHandleRemaining] = useState<HandleRemaining>('hold');
  const [error, setError] = useState<string | null>(null);

  // Load order items with stock info when modal opens
  useEffect(() => {
    if (!open || !orderId) return;
    setStep('select');
    setSelectedItems(new Set());
    setHandleRemaining('hold');
    setError(null);
    setLoading(true);
    api(`/api/fulfillment/orders/${orderId}/split-suggestion`)
      .then(res => res.ok ? res.json() : null)
      .then((data: SplitSuggestion | null) => {
        if (data) {
          const allItems = [...(data.readyItems || []), ...(data.backorderedItems || [])];
          setItems(allItems);
          // Pre-check items that are in stock
          const inStockIds = new Set((data.readyItems || []).map((i: OrderItem) => i.id));
          setSelectedItems(inStockIds);
        }
      })
      .catch(err => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [open, orderId]);

  // Compute which items are backordered (stock < qty)
  
  // API-based stock check: compare item quantity with products
  const [itemStock, setItemStock] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!open || items.length === 0) return;
    // Load stock counts for each item's product
    const loadStock = async () => {
      const stock: Record<number, number> = {};
      for (const item of items) {
        if (item.product_id) {
          try {
            const res = await api(`/api/products/${item.product_id}`);
            if (res.ok) {
              const product = await res.json();
              stock[item.id] = product.stock_count ?? 0;
            }
          } catch {}
        }
      }
      setItemStock(stock);
    };
    loadStock();
  }, [open, items]);

  const isBackordered = (item: OrderItem) => {
    return (itemStock[item.id] ?? 999) < item.quantity;
  };

  const toggleItem = (itemId: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const readyCount = items.filter(i => selectedItems.has(i.id)).reduce((s, i) => s + i.quantity, 0);
  const remainingCount = items.filter(i => !selectedItems.has(i.id)).reduce((s, i) => s + i.quantity, 0);

  const handleCreateSplit = async () => {
    if (selectedItems.size === 0) {
      setError('Select at least one item to ship.');
      return;
    }
    if (selectedItems.size === items.length) {
      setError('All items are selected. No split needed — just ship the order normally.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api('/api/fulfillment/split-shipment', {
        method: 'POST',
        body: JSON.stringify({
          orderId,
          shipments: [{
            items: Array.from(selectedItems).map(id => ({
              orderItemId: id,
              quantity: items.find(i => i.id === id)?.quantity || 1,
            })),
          }],
          handleRemaining,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(data.error || 'Failed to create split shipment');
      }

      const data = await res.json();
      toast(`Shipment split created! ${data.shipments?.length || 0} shipment(s) ready.`, "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create split');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step === 'select') {
      if (selectedItems.size === 0) {
        setError('Please select at least one item to ship today.');
        return;
      }
      if (selectedItems.size === items.length) {
        // All items selected — handleRemaining makes less sense, go direct to confirm
        setHandleRemaining('hold');
        setStep('confirm');
        return;
      }
      setError(null);
      setStep('handle');
    } else if (step === 'handle') {
      setError(null);
      setStep('confirm');
    }
  };

  const handleBack = () => {
    setError(null);
    if (step === 'handle') setStep('select');
    else if (step === 'confirm') setStep('handle');
  };

  if (!open) return null;

  // ── Novi messages per step ──────────────────────────────────────
  const noviMessages: Record<Step, string> = {
    select: '💜 Which items are ready to ship today?',
    handle: 'Would you like me to handle the remaining items?',
    confirm: readyCount > 0
      ? `Shipping ${readyCount} items now. ${remainingCount > 0 ? `${remainingCount} items will be ${handleRemaining === 'hold' ? 'held for later' : handleRemaining === 'refund' ? 'refunded' : handleRemaining === 'store_credit' ? 'credited' : handleRemaining === 'notify' ? 'communicated to the customer' : 'waiting'}.` : ''}`
      : 'Confirm your split shipment.',
  };

  const handleRemainingLabels: Record<HandleRemaining, { label: string; desc: string }> = {
    notify: { label: '📧 Notify the customer', desc: 'Email them that part of their order is delayed' },
    hold: { label: '📦 Hold remaining items', desc: 'Ship them when back in stock' },
    refund: { label: '💵 Refund unavailable items', desc: 'Customer gets refunded for what can\'t ship' },
    store_credit: { label: '🎟️ Create store credit', desc: 'Customer gets store credit for unavailable items' },
    wait: { label: '⏳ Wait until everything is available', desc: 'Cancel the split — ship all together later' },
  };

  return (
    <Modal open onClose={onClose} title={`Split Shipment — Order #${orderNumber}`} size="lg">
      <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
        {/* Novi header */}
        <div className="bg-rose-50 rounded-xl p-4 border border-rose-100 flex items-start gap-3">
          <Novi expression="focused" size="sm" animated />
          <div>
            <p className="text-sm font-medium text-rose-700 mb-1">Novi says:</p>
            <p className="text-sm text-neutral-600">{noviMessages[step]}</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {(['select', 'handle', 'confirm'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors
                ${step === s ? 'bg-rose-500 text-white' : i < ['select', 'handle', 'confirm'].indexOf(step) ? 'bg-green-500 text-white' : 'bg-neutral-200 text-neutral-500'}`}>
                {i < ['select', 'handle', 'confirm'].indexOf(step) ? '✓' : i + 1}
              </div>
              <span className={`text-xs font-medium ${step === s ? 'text-rose-700' : 'text-neutral-400'}`}>
                {s === 'select' ? 'Select Items' : s === 'handle' ? 'Handle Rest' : 'Confirm'}
              </span>
              {i < 2 && <div className="w-8 h-px bg-neutral-300" />}
            </div>
          ))}
        </div>

        {/* Step 1: Select Items */}
        {step === 'select' && (
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-8">
                <Novi expression="thinking" size="lg" animated />
                <p className="text-neutral-400 mt-2">Loading items…</p>
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-8">No items found for this order.</p>
            ) : (
              <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 overflow-hidden">
                {items.map(item => {
                  const backordered = isBackordered(item);
                  return (
                    <label
                      key={item.id}
                      className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-rose-50/50 ${
                        selectedItems.has(item.id) ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="rounded border-neutral-300"
                        checked={selectedItems.has(item.id)}
                        onChange={() => toggleItem(item.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-neutral-800 truncate">
                            {item.product_name || item.sku}
                          </p>
                          {backordered && (
                            <Badge className="text-[10px] bg-red-100 text-red-700">Backordered</Badge>
                          )}
                        </div>
                        <p className="text-xs text-neutral-500">
                          {item.variant_title ? `${item.variant_title} · ` : ''}
                          Qty: {item.quantity} · {itemStock[item.id] !== undefined ? `${itemStock[item.id]} in stock` : '—'}
                        </p>
                      </div>
                      {item.unit_price && (
                        <span className="text-sm text-neutral-600">${(item.unit_price * item.quantity).toFixed(2)}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {/* Summary pill */}
            {items.length > 0 && (
              <div className="flex items-center gap-3 text-sm text-neutral-600">
                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">
                  {selectedItems.size} ready · {readyCount} qty
                </span>
                {remainingCount > 0 && (
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-medium">
                    {remainingCount} qty remaining
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Handle Remaining */}
        {step === 'handle' && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">
              <strong>{remainingCount} items</strong> won't ship today. What should happen to them?
            </p>
            <div className="space-y-2">
              {(Object.entries(handleRemainingLabels) as [HandleRemaining, { label: string; desc: string }][]).map(([key, { label, desc }]) => (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    handleRemaining === key
                      ? 'border-rose-300 bg-rose-50 ring-1 ring-rose-200'
                      : 'border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="handleRemaining"
                    className="mt-0.5"
                    checked={handleRemaining === key}
                    onChange={() => setHandleRemaining(key)}
                  />
                  <div>
                    <p className="text-sm font-medium text-neutral-800">{label}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-green-50 rounded-xl p-4 border border-green-100">
              <p className="text-sm font-medium text-green-800 mb-2">📦 Shipment Summary</p>
              <div className="space-y-1 text-sm text-green-700">
                <p>• <strong>{readyCount} items</strong> will ship now</p>
                <p>• Shipment 1 will be ready for the warehouse</p>
                {remainingCount > 0 && (
                  <p>• {remainingCount} items — {handleRemainingLabels[handleRemaining].label.toLowerCase()}</p>
                )}
              </div>
            </div>
            <p className="text-xs text-neutral-500 text-center">
              Novi will track the remaining items and let you know when they're back in stock.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-between items-center pt-3 border-t border-neutral-100">
          <div>
            {step !== 'select' && (
              <Button variant="ghost" size="sm" onClick={handleBack}>
                ← Back
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            {step === 'confirm' ? (
              <Button size="sm" onClick={handleCreateSplit} disabled={loading}>
                {loading ? 'Creating…' : '✓ Create Shipment'}
              </Button>
            ) : (
              <Button size="sm" onClick={handleNext}>
                Next →
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
