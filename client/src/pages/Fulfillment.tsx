import { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs, Button, Badge, EmptyState, ErrorBanner, PageHeader, useToast, Modal } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import Novi from '../components/Novi';
import PrintModal, { type PrintData } from './PrintableLabel';
import SplitShipmentWizard from '../components/SplitShipmentWizard';
import OperationsCenter from '../components/OperationsCenter';

// ── Types ────────────────────────────────────────────────────────
interface PendingOrder {
  id: number;
  order_number: number;
  customer_name: string;
  customer_email: string | null;
  shipping_address: string | null;
  source: string;
  status: string;
  total_amount: number;
  created_at: string;
  items_summary: string;
  total_qty?: number;
  scanned_qty?: number;
  fully_picked?: number;
}

interface Shipment {
  id: number;
  order_id: number;
  carrier: string;
  tracking_number: string | null;
  package_type: string | null;
  weight_oz: number | null;
  cost: number | null;
  status: string;
  shipped_at: string;
  delivered_at: string | null;
  estimated_delivery: string | null;
  order_number: number;
  customer_name: string;
  customer_email: string | null;
  shipping_address: string | null;
}

interface PackagingInfo {
  orderId: number;
  orderNumber: number;
  customerName: string;
  items: PackagingItem[];
  boxSuggestion: string;
  totalWeightOz: number;
  estimatedVolume: number;
  packagingInstructions: string[];
  verifications: PackVerification[];
}

interface PackagingItem {
  id: number;
  sku: string;
  variant_title: string | null;
  quantity: number;
  product_id: number | null;
  product_name: string | null;
  weight_oz: number | null;
  price: number | null;
}

interface PackVerification {
  id: number;
  order_id: number;
  photo_url: string | null;
  verified_by: number | null;
  items_checked: string;
  notes: string | null;
  created_at: string;
}

interface Combination {
  address: string;
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

interface Analytics {
  avgDaysToShip: number;
  totalShipments: number;
  totalCost: number;
  avgCost: number;
  onTimeRate: number;
  onTimeDelivered: number;
  totalDelivered: number;
  carrierPerformance: CarrierPerf[];
  ordersPerDay: { day: string; count: number }[];
}

interface CarrierPerf {
  carrier: string;
  shipment_count: number;
  avg_cost: number;
  avg_days: number;
  exceptions: number;
}

interface Summary {
  pendingCount: number;
  activeShipments: number;
  oldestPending: (PendingOrder & { ageDays: number }) | null;
  combinationOpportunities: number;
  potentialSavings: number;
  analytics: { avgDaysToShip: number; onTimeRate: number; avgCost: number };
}

// ── Template Types ───────────────────────────────────────────────
interface FulfillmentTemplate {
  id: number;
  type: string;
  name: string;
  config: TemplateConfig;
  is_default: number;
  created_at: string;
}

export interface TemplateConfig {
  logo?: string;
  primaryColor?: string;
  accentColor?: string;
  font?: string;
  showThankYou?: boolean;
  thankYouMessage?: string;
  showSocialMedia?: boolean;
  socialHandles?: string;
  showQrCode?: boolean;
  showProductPhotos?: boolean;
  showOrderNotes?: boolean;
  showGiftMessage?: boolean;
  showBarcode?: boolean;
  showWarehouseLocation?: boolean;
  showPickListInfo?: boolean;
  showPackedBy?: boolean;
  customFields?: { label: string; value: string }[];
  labelSize?: string;
  [key: string]: any;
}

// ── Unboxing Types ───────────────────────────────────────────────
interface UnboxingRule {
  id: number;
  name: string;
  condition_type: string;
  condition_value: string;
  action_type: string;
  action_config: Record<string, any>;
  is_active: number;
  priority: number;
  created_at: string;
}

interface UnboxingSuggestion {
  id: number;
  name: string;
  condition_type: string;
  condition_value: string;
  action_type: string;
  action_config: Record<string, any>;
  priority: number;
  reason: string;
}

// ── Packing Recipe Types (Fulfillment 1.2) ────────────────────────
interface PackingRecipe {
  id: number;
  business_id: number;
  name: string;
  product_id: number | null;
  order_type: string;
  box_size: string | null;
  packing_materials: string[];
  inserts: PackingInsert[];
  labels: PackingLabels | null;
  special_instructions: string | null;
  priority: number;
  is_active: number;
  created_at: string;
}

interface PackingInsert {
  type: string;
  details: string;
  quantity: number;
}

interface PackingLabels {
  type: string;
  quantity: number;
}

const CARRIER_COLORS: Record<string, string> = {
  UPS: 'bg-amber-100 text-amber-700',
  USPS: 'bg-blue-100 text-blue-700',
  FedEx: 'bg-purple-100 text-purple-700',
  DHL: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<string, string> = {
  on_time: 'bg-green-100 text-green-700',
  at_risk: 'bg-yellow-100 text-yellow-700',
  late: 'bg-red-100 text-red-700',
  label_created: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-amber-100 text-amber-700',
  out_for_delivery: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  exception: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  label_created: 'Label Created',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
};

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  shipping_label: 'Shipping Label',
  packing_slip: 'Packing Slip',
  invoice: 'Invoice',
  warehouse_label: 'Warehouse Label',
};

const LABEL_SIZES = ['4x6 thermal', '8.5x11 printable', '2x1', '2x2', 'Avery sheet', 'Custom'];

const FONTS = ['Inter', 'Roboto', 'Open Sans', 'Lora', 'Montserrat', 'Playfair Display', 'Poppins', 'Georgia'];

const CONDITION_TYPES = [
  { value: 'order_value', label: 'Order Value' },
  { value: 'product_type', label: 'Product Type' },
  { value: 'customer_type', label: 'Customer Type' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'custom', label: 'Custom' },
];

const ACTION_TYPES = [
  { value: 'thank_you_card', label: 'Thank You Card' },
  { value: 'free_sample', label: 'Free Sample' },
  { value: 'coupon', label: 'Coupon' },
  { value: 'seasonal_insert', label: 'Seasonal Insert' },
  { value: 'wholesale_instructions', label: 'Wholesale Instructions' },
  { value: 'custom_note', label: 'Custom Note' },
  { value: 'sticker', label: 'Sticker' },
  { value: 'gift_wrap', label: 'Gift Wrap' },
];

function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem('shimmerstock_token');
  return fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  });
}

function getAgeDays(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt + 'Z').getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function getShipmentAge(shippedAt: string): number {
  const ms = Date.now() - new Date(shippedAt + 'Z').getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function getShipmentRisk(shippedAt: string, status: string): string {
  if (status === 'out_for_delivery') return 'on_time';
  const days = getShipmentAge(shippedAt);
  if (days > 7) return 'late';
  if (days > 4) return 'at_risk';
  return 'on_time';
}

export function defaultTemplateConfig(type: string): TemplateConfig {
  const base: TemplateConfig = {
    primaryColor: '#e11d48',
    accentColor: '#fda4af',
    font: 'Inter',
    showThankYou: true,
    thankYouMessage: 'Thank you for your order!',
    showSocialMedia: false,
    socialHandles: '',
    showQrCode: false,
    showProductPhotos: false,
    showOrderNotes: true,
    showGiftMessage: false,
    showBarcode: false,
    showWarehouseLocation: false,
    showPickListInfo: false,
    showPackedBy: false,
  };
  if (type === 'shipping_label') {
    base.labelSize = '4x6 thermal';
  }
  return base;
}

// ── Template Preview Component ──────────────────────────────────
function TemplatePreview({ type, config }: { type: string; config: TemplateConfig }) {
  return (
    <div
      className="border border-neutral-200 rounded-lg overflow-hidden bg-white"
      style={{ fontFamily: config.font || 'Inter', minHeight: type === 'shipping_label' ? '200px' : '400px' }}
    >
      {/* Header with brand colors */}
      <div className="p-4 border-b" style={{ backgroundColor: config.primaryColor + '10', borderColor: config.accentColor + '40' }}>
        <div className="flex items-center justify-between">
          <div>
            {config.logo ? (
              <img src={config.logo} alt="Logo" className="h-8 object-contain" />
            ) : (
              <div className="h-8 w-32 rounded" style={{ backgroundColor: config.primaryColor, opacity: 0.3 }} />
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold" style={{ color: config.primaryColor }}>
              {TEMPLATE_TYPE_LABELS[type] || type}
            </p>
            <p className="text-[10px] text-neutral-400">Order #SAMPLE-1234</p>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="p-4 space-y-3">
        {type === 'packing_slip' || type === 'invoice' ? (
          <>
            <div className="flex justify-between text-sm">
              <div>
                <p className="font-semibold text-neutral-800">Ship To:</p>
                <p className="text-neutral-500 text-xs">Jane Customer</p>
                <p className="text-neutral-500 text-xs">123 Main St, Anytown, USA</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-neutral-400">Date: {new Date().toLocaleDateString()}</p>
                {config.showQrCode && (
                  <div className="mt-1 w-12 h-12 bg-neutral-200 rounded flex items-center justify-center text-[8px] text-neutral-400">
                    QR
                  </div>
                )}
              </div>
            </div>

            {/* Items table */}
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead style={{ backgroundColor: config.primaryColor + '15' }}>
                  <tr>
                    <th className="px-2 py-1.5 text-left text-neutral-600">Item</th>
                    <th className="px-2 py-1.5 text-center text-neutral-600">Qty</th>
                    <th className="px-2 py-1.5 text-right text-neutral-600">Price</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="px-2 py-1.5 text-neutral-700">
                      {config.showProductPhotos ? '🖼️ ' : ''}Sample Product - Variant
                    </td>
                    <td className="px-2 py-1.5 text-center text-neutral-600">2</td>
                    <td className="px-2 py-1.5 text-right text-neutral-700">$24.99</td>
                  </tr>
                  <tr className="border-t">
                    <td className="px-2 py-1.5 text-neutral-700">
                      {config.showProductPhotos ? '🖼️ ' : ''}Another Item
                    </td>
                    <td className="px-2 py-1.5 text-center text-neutral-600">1</td>
                    <td className="px-2 py-1.5 text-right text-neutral-700">$12.50</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Optional fields */}
            {config.showOrderNotes && (
              <div className="bg-neutral-50 rounded p-2 text-xs text-neutral-500">
                <span className="font-medium">Order Notes:</span> Sample internal note
              </div>
            )}

            {config.showGiftMessage && (
              <div className="bg-pink-50 rounded p-2 text-xs text-pink-600 italic">
                "Happy Birthday! Hope you love it! 🎁"
              </div>
            )}

            {config.showPickListInfo && (
              <div className="text-xs text-neutral-500">
                <p><strong>Bin:</strong> A-12-3</p>
                <p><strong>Pick:</strong> Shelf B, Row 4</p>
              </div>
            )}

            {/* Thank you message */}
            {config.showThankYou && (
              <div
                className="text-center p-2 rounded mt-2 text-xs font-medium"
                style={{ backgroundColor: config.accentColor + '30', color: config.primaryColor }}
              >
                {config.thankYouMessage || 'Thank you for your order!'}
              </div>
            )}

            {/* Social */}
            {config.showSocialMedia && (
              <div className="text-center text-xs text-neutral-500">
                Follow us @ {config.socialHandles || 'yourbrand'}
              </div>
            )}

            {/* Barcode */}
            {config.showBarcode && (
              <div className="flex justify-center mt-2">
                <div className="h-12 w-40 bg-neutral-200 rounded flex items-center justify-center text-[10px] text-neutral-400">
                  BARCODE
                </div>
              </div>
            )}

            {/* Packed by */}
            {config.showPackedBy && (
              <p className="text-xs text-neutral-400 text-right mt-2">Packed by: Team Member</p>
            )}
          </>
        ) : type === 'shipping_label' ? (
          <div className="space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-sm text-neutral-800">To:</p>
                <p className="text-xs text-neutral-700">Jane Customer</p>
                <p className="text-xs text-neutral-500">123 Main St</p>
                <p className="text-xs text-neutral-500">Anytown, ST 12345</p>
              </div>
              {config.logo ? (
                <img src={config.logo} alt="Logo" className="h-6 object-contain" />
              ) : (
                <div className="h-6 w-16 rounded" style={{ backgroundColor: config.primaryColor, opacity: 0.2 }} />
              )}
            </div>
            <div className="flex justify-between items-end mt-2">
              <div>
                <p className="text-[10px] text-neutral-400">From:</p>
                <p className="text-xs text-neutral-500">Your Business</p>
                <p className="text-xs text-neutral-500">456 Commerce Dr</p>
              </div>
              <div className="text-right">
                {config.showBarcode && (
                  <div className="h-10 w-32 bg-neutral-200 rounded flex items-center justify-center text-[10px] text-neutral-400">
                    BARCODE
                  </div>
                )}
                <p className="text-[10px] text-neutral-400 mt-1">Order #SAMPLE-1234</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between">
              <div>
                <p className="font-semibold text-sm text-neutral-800">Product Name</p>
                <p className="text-xs text-neutral-500">SKU: ABC-123</p>
                {config.showWarehouseLocation && (
                  <p className="text-xs text-neutral-500">Bin: A-12-3</p>
                )}
              </div>
              {config.showBarcode && (
                <div className="h-10 w-24 bg-neutral-200 rounded flex items-center justify-center text-[10px] text-neutral-400">
                  BARCODE
                </div>
              )}
            </div>
            {config.showProductPhotos && (
              <div className="h-16 w-16 bg-neutral-200 rounded flex items-center justify-center text-xs text-neutral-400">
                Photo
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Fulfillment() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab data states
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [packaging, setPackaging] = useState<PackagingInfo | null>(null);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  // Ship modal
  const [shipModal, setShipModal] = useState<{ order: PendingOrder } | null>(null);
  const [shipForm, setShipForm] = useState({ carrier: 'UPS', trackingNumber: '', packageType: '', weightOz: '', cost: '' });
  const [shipping, setShipping] = useState(false);

  // Bulk ship
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [bulkCarrier, setBulkCarrier] = useState('UPS');

  // Packaging selection
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // Split shipment wizard
  const [splitWizardOpen, setSplitWizardOpen] = useState(false);
  const [splitOrderId, setSplitOrderId] = useState<number | null>(null);
  const [splitOrderNumber, setSplitOrderNumber] = useState<number>(0);
  const [opsOrderId, setOpsOrderId] = useState<number | null>(null);
  const [opsOrderNumber, setOpsOrderNumber] = useState<number>(0);
  const [opsCustomerName, setOpsCustomerName] = useState<string>("");
  // Pack verification state
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [packNotes, setPackNotes] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [packPhoto, setPackPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Documents Tab State ─────────────────────────────────────────
  const [templates, setTemplates] = useState<FulfillmentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<FulfillmentTemplate | null>(null);
  const [templateTypeFilter, setTemplateTypeFilter] = useState<string>('');
  const [editingTemplate, setEditingTemplate] = useState<Partial<FulfillmentTemplate> & { config: TemplateConfig }>({
    type: 'packing_slip',
    name: '',
    config: defaultTemplateConfig('packing_slip'),
  });
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // ── Unboxing Tab State ──────────────────────────────────────────
  const [unboxingRules, setUnboxingRules] = useState<UnboxingRule[]>([]);
  const [unboxingSuggestions, setUnboxingSuggestions] = useState<UnboxingSuggestion[]>([]);
  const [showUnboxingForm, setShowUnboxingForm] = useState(false);
  const [editingUnboxingRule, setEditingUnboxingRule] = useState<Partial<UnboxingRule> & { action_config: Record<string, any> }>({
    name: '',
    condition_type: 'order_value',
    condition_value: '',
    action_type: 'thank_you_card',
    action_config: {},
    is_active: 1,
    priority: 0,
  });
  const [savingUnboxingRule, setSavingUnboxingRule] = useState(false);
  const [suggestionOrderId, setSuggestionOrderId] = useState<number | null>(null);

  // ── Packing Recipes (Fulfillment 1.2) ────────────────────────────
  const [recipes, setRecipes] = useState<PackingRecipe[]>([]);
  const [orderRecipes, setOrderRecipes] = useState<Record<number, PackingRecipe[]>>({});
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Partial<PackingRecipe> & { packing_materials: string[]; inserts: PackingInsert[]; labels: PackingLabels | null }>({
    name: '',
    product_id: null,
    order_type: 'any',
    box_size: '',
    packing_materials: [],
    inserts: [],
    labels: null,
    special_instructions: '',
    priority: 1,
    is_active: 1,
  });
  const [savingRecipe, setSavingRecipe] = useState(false);

  // ── Print State ────────────────────────────────────────────────
  const [printData, setPrintData] = useState<PrintData | null>(null);
  const [printLoading, setPrintLoading] = useState(false); void printLoading;

  // ── Fetch all data ──────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, shipmentsRes, combosRes, analyticsRes, summaryRes] = await Promise.all([
        api('/api/fulfillment/pending'),
        api('/api/fulfillment/in-transit'),
        api('/api/fulfillment/combine'),
        api('/api/fulfillment/analytics'),
        api('/api/fulfillment/summary'),
      ]);

      if (!pendingRes.ok || !shipmentsRes.ok) throw new Error('Failed to fetch data');

      setPendingOrders(await pendingRes.json());
      setShipments(await shipmentsRes.json());
      setCombinations(combosRes.ok ? await combosRes.json() : []);
      setAnalytics(analyticsRes.ok ? await analyticsRes.json() : null);
      setSummary(summaryRes.ok ? await summaryRes.json() : null);
    } catch (err: any) {
      setError(err.message || 'Failed to load fulfillment data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Templates fetching ──────────────────────────────────────────
  const fetchTemplates = useCallback(async () => {
    try {
      const url = templateTypeFilter
        ? `/api/fulfillment/templates?type=${encodeURIComponent(templateTypeFilter)}`
        : '/api/fulfillment/templates';
      const res = await api(url);
      if (res.ok) {
        setTemplates(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch templates', err);
    }
  }, [templateTypeFilter]);

  useEffect(() => {
    if (tab === 'documents') fetchTemplates();
  }, [tab, fetchTemplates]);

  // ── Unboxing rules fetching ─────────────────────────────────────
  const fetchUnboxingRules = useCallback(async () => {
    try {
      const res = await api('/api/fulfillment/unboxing-rules');
      if (res.ok) setUnboxingRules(await res.json());
    } catch (err) {
      console.error('Failed to fetch unboxing rules', err);
    }
  }, []);

  useEffect(() => {
    if (tab === 'unboxing') fetchUnboxingRules();
  }, [tab, fetchUnboxingRules]);

  // ── Packing recipes fetching ─────────────────────────────────────
  const fetchRecipes = useCallback(async () => {
    try {
      const res = await api('/api/fulfillment/packing-recipes');
      if (res.ok) setRecipes(await res.json());
    } catch (err) {
      console.error('Failed to fetch packing recipes', err);
    }
  }, []);

  useEffect(() => {
    if (tab === 'recipes') fetchRecipes();
  }, [tab, fetchRecipes]);

  // ── Recipe for an order ──────────────────────────────────────────
  const fetchOrderRecipes = async (orderId: number) => {
    try {
      const res = await api(`/api/fulfillment/packing-recipes/for-order/${orderId}`);
      if (res.ok) {
        const data = await res.json();
        setOrderRecipes(prev => ({ ...prev, [orderId]: data }));
      }
    } catch (err) {
      console.error('Failed to fetch order recipes', err);
    }
  };

  // ── Ship single order ───────────────────────────────────────────
  const handleShip = async () => {
    if (!shipModal) return;
    setShipping(true);
    try {
      const res = await api('/api/fulfillment/ship', {
        method: 'POST',
        body: JSON.stringify({
          orderId: shipModal.order.id,
          carrier: shipForm.carrier,
          trackingNumber: shipForm.trackingNumber || undefined,
          packageType: shipForm.packageType || undefined,
          weightOz: shipForm.weightOz ? parseFloat(shipForm.weightOz) : undefined,
          cost: shipForm.cost ? parseFloat(shipForm.cost) : undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to ship');
      toast.success?.(`Order #${shipModal.order.order_number} shipped via ${shipForm.carrier}!`);
      setShipModal(null);
      setShipForm({ carrier: 'UPS', trackingNumber: '', packageType: '', weightOz: '', cost: '' });
      fetchAll();
    } catch (err: any) {
      toast.error?.(err.message || 'Failed to create shipment');
    } finally {
      setShipping(false);
    }
  };

  // ── Bulk ship ───────────────────────────────────────────────────
  const handleBulkShip = async () => {
    if (selectedOrders.size === 0) return;
    setShipping(true);
    try {
      const res = await api('/api/fulfillment/bulk-ship', {
        method: 'POST',
        body: JSON.stringify({ orderIds: Array.from(selectedOrders), carrier: bulkCarrier }),
      });
      if (!res.ok) throw new Error('Failed to bulk ship');
      toast.success?.(`${selectedOrders.size} orders shipped via ${bulkCarrier}!`);
      setSelectedOrders(new Set());
      fetchAll();
    } catch (err: any) {
      toast.error?.(err.message || 'Failed to bulk ship');
    } finally {
      setShipping(false);
    }
  };

  // ── Print label/slip ───────────────────────────────────────────
  const handlePrint = async (shipmentId: number, type: string) => {
    setPrintLoading(true);
    try {
      const res = await api(`/api/fulfillment/shipments/${shipmentId}/print?type=${encodeURIComponent(type)}`);
      if (!res.ok) throw new Error('Failed to load print data');
      const data = await res.json();
      setPrintData(data);
    } catch (err: any) {
      toast.error?.(err.message || 'Failed to load print data');
    } finally {
      setPrintLoading(false);
    }
  };

  // ── Pack verification ────────────────────────────────────────
  const verifyPack = async () => {
    if (!selectedOrderId || checkedItems.size === 0) return;
    setVerifying(true);
    try {
      const res = await api('/api/fulfillment/pack-verify', {
        method: 'POST',
        body: JSON.stringify({
          orderId: selectedOrderId,
          itemsChecked: Array.from(checkedItems),
          photoUrl: packPhoto || '',
          notes: packNotes,
        }),
      });
      if (res.ok) {
        toast.success?.("Pack verification saved!");
        setCheckedItems(new Set());
        setPackNotes('');
        setPackPhoto(null);
        // Refresh packaging data
        if (selectedOrderId) loadPackaging(selectedOrderId);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error?.(data.error || 'Verification failed');
      }
    } catch (err: any) {
      toast.error?.(err.message || 'Network error');
    } finally {
      setVerifying(false);
    }
  };

  // ── Load packaging ──────────────────────────────────────────────
  const loadPackaging = async (orderId: number) => {
    setSelectedOrderId(orderId);
    setCheckedItems(new Set());
    setPackNotes('');
    setPackPhoto(null);
    try {
      const res = await api(`/api/fulfillment/packaging/${orderId}`);
      if (res.ok) setPackaging(await res.json());
      else setPackaging(null);
    } catch {
      setPackaging(null);
    }
    // Also fetch unboxing suggestions and recipes
    fetchUnboxingSuggestions(orderId);
    fetchOrderRecipes(orderId);
  };

  const toggleSelect = (orderId: number) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // ── Template CRUD ──────────────────────────────────────────────
  const openTemplateEditor = (template?: FulfillmentTemplate) => {
    if (template) {
      setEditingTemplate({
        id: template.id,
        type: template.type,
        name: template.name,
        config: { ...template.config },
        is_default: template.is_default,
      });
    } else {
      setEditingTemplate({
        type: 'packing_slip',
        name: '',
        config: defaultTemplateConfig('packing_slip'),
        is_default: 0,
      });
    }
    setShowTemplateEditor(true);
  };

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    try {
      const body: any = {
        type: editingTemplate.type,
        name: editingTemplate.name,
        config: editingTemplate.config,
        isDefault: editingTemplate.is_default || false,
      };
      let res: Response;
      if (editingTemplate.id) {
        res = await api(`/api/fulfillment/templates/${editingTemplate.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        res = await api('/api/fulfillment/templates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) throw new Error('Failed to save template');
      toast.success?.(editingTemplate.id ? 'Template updated!' : 'Template created!');
      setShowTemplateEditor(false);
      fetchTemplates();
    } catch (err: any) {
      toast.error?.(err.message || 'Failed to save');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('Delete this template?')) return;
    try {
      await api(`/api/fulfillment/templates/${id}`, { method: 'DELETE' });
      toast.success?.('Template deleted');
      fetchTemplates();
    } catch (err: any) {
      toast.error?.(err.message || 'Failed to delete');
    }
  };

  const handleDuplicateTemplate = async (id: number) => {
    try {
      await api(`/api/fulfillment/templates/${id}/duplicate`, { method: 'POST' });
      toast.success?.('Template duplicated');
      fetchTemplates();
    } catch (err: any) {
      toast.error?.(err.message || 'Failed to duplicate');
    }
  };

  // ── Unboxing Rule CRUD ──────────────────────────────────────────
  const openUnboxingForm = (rule?: UnboxingRule) => {
    if (rule) {
      setEditingUnboxingRule({
        id: rule.id,
        name: rule.name,
        condition_type: rule.condition_type,
        condition_value: rule.condition_value,
        action_type: rule.action_type,
        action_config: { ...rule.action_config },
        is_active: rule.is_active,
        priority: rule.priority,
      });
    } else {
      setEditingUnboxingRule({
        name: '',
        condition_type: 'order_value',
        condition_value: '',
        action_type: 'thank_you_card',
        action_config: {},
        is_active: 1,
        priority: 0,
      });
    }
    setShowUnboxingForm(true);
  };

  const handleSaveUnboxingRule = async () => {
    setSavingUnboxingRule(true);
    try {
      const body = {
        name: editingUnboxingRule.name,
        conditionType: editingUnboxingRule.condition_type,
        conditionValue: editingUnboxingRule.condition_value,
        actionType: editingUnboxingRule.action_type,
        actionConfig: editingUnboxingRule.action_config,
        isActive: editingUnboxingRule.is_active,
        priority: editingUnboxingRule.priority,
      };
      let res: Response;
      if (editingUnboxingRule.id) {
        res = await api(`/api/fulfillment/unboxing-rules/${editingUnboxingRule.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        res = await api('/api/fulfillment/unboxing-rules', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) throw new Error('Failed to save rule');
      toast.success?.(editingUnboxingRule.id ? 'Rule updated!' : 'Rule created!');
      setShowUnboxingForm(false);
      fetchUnboxingRules();
    } catch (err: any) {
      toast.error?.(err.message || 'Failed to save rule');
    } finally {
      setSavingUnboxingRule(false);
    }
  };

  const handleDeleteUnboxingRule = async (id: number) => {
    if (!confirm('Delete this unboxing rule?')) return;
    try {
      await api(`/api/fulfillment/unboxing-rules/${id}`, { method: 'DELETE' });
      toast.success?.('Rule deleted');
      fetchUnboxingRules();
    } catch (err: any) {
      toast.error?.(err.message || 'Failed to delete');
    }
  };

  const fetchUnboxingSuggestions = async (orderId: number) => {
    setSuggestionOrderId(orderId);
    try {
      const res = await api(`/api/fulfillment/unboxing-suggestions/${orderId}`);
      if (res.ok) setUnboxingSuggestions(await res.json());
      else setUnboxingSuggestions([]);
    } catch {
      setUnboxingSuggestions([]);
    }
  };

  // ── Packing Recipe CRUD ──────────────────────────────────────────
  const openRecipeForm = (recipe?: PackingRecipe) => {
    if (recipe) {
      setEditingRecipe({
        id: recipe.id,
        name: recipe.name,
        product_id: recipe.product_id,
        order_type: recipe.order_type,
        box_size: recipe.box_size || '',
        packing_materials: [...recipe.packing_materials],
        inserts: recipe.inserts.map(i => ({ ...i })),
        labels: recipe.labels ? { ...recipe.labels } : null,
        special_instructions: recipe.special_instructions || '',
        priority: recipe.priority,
        is_active: recipe.is_active,
      });
    } else {
      setEditingRecipe({
        name: '',
        product_id: null,
        order_type: 'any',
        box_size: '',
        packing_materials: [],
        inserts: [],
        labels: null,
        special_instructions: '',
        priority: 1,
        is_active: 1,
      });
    }
    setShowRecipeForm(true);
  };

  const handleSaveRecipe = async () => {
    setSavingRecipe(true);
    try {
      const body: any = {
        name: editingRecipe.name,
        productId: editingRecipe.product_id ?? null,
        orderType: editingRecipe.order_type,
        boxSize: editingRecipe.box_size || null,
        packingMaterials: editingRecipe.packing_materials,
        inserts: editingRecipe.inserts,
        labels: editingRecipe.labels,
        specialInstructions: editingRecipe.special_instructions || null,
        priority: editingRecipe.priority,
        isActive: editingRecipe.is_active,
      };
      let res: Response;
      if (editingRecipe.id) {
        res = await api(`/api/fulfillment/packing-recipes/${editingRecipe.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        res = await api('/api/fulfillment/packing-recipes', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) throw new Error('Failed to save recipe');
      toast.success?.(editingRecipe.id ? 'Recipe updated!' : 'Recipe created!');
      setShowRecipeForm(false);
      fetchRecipes();
    } catch (err: any) {
      toast.error?.(err.message || 'Failed to save recipe');
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleDeleteRecipe = async (id: number) => {
    if (!confirm('Delete this packing recipe?')) return;
    try {
      await api(`/api/fulfillment/packing-recipes/${id}`, { method: 'DELETE' });
      toast.success?.('Recipe deleted');
      fetchRecipes();
    } catch (err: any) {
      toast.error?.(err.message || 'Failed to delete');
    }
  };

  const handleToggleRecipeActive = async (recipe: PackingRecipe) => {
    try {
      await api(`/api/fulfillment/packing-recipes/${recipe.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !recipe.is_active }),
      });
      fetchRecipes();
    } catch (err: any) {
      toast.error?.(err.message || 'Failed to toggle');
    }
  };

  // ── Novi message ────────────────────────────────────────────────
  const noviMessage = summary
    ? (() => {
        const parts: string[] = [];
        if (summary.pendingCount > 0) parts.push(`${summary.pendingCount} orders ready to ship`);
        if (summary.oldestPending && summary.oldestPending.ageDays > 0) {
          parts.push(`the oldest has been waiting ${summary.oldestPending.ageDays} days`);
        }
        if (summary.combinationOpportunities > 0 && summary.potentialSavings > 0) {
          parts.push(`You could save $${summary.potentialSavings.toFixed(2)} by combining orders to the same address`);
        }
        if (summary.activeShipments > 0) {
          parts.push(`${summary.activeShipments} shipments in transit`);
        }
        return parts.join('. ') + '.';
      })()
    : '';

  // ── RENDER ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Novi expression="thinking" size="lg" animated />
        <p className="text-rose-400 ml-4 text-lg">Loading fulfillment…</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Fulfillment HQ"
        subtitle="How do I get products to customers quickly, accurately, and cost-effectively?"
      />

      {/* Novi Summary */}
      {summary && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-rose-100 flex items-start gap-4">
          <Novi expression="focused" size="sm" animated />
          <div>
            <p className="text-sm font-medium text-rose-700 mb-1">Novi says:</p>
            <p className="text-sm text-neutral-600 leading-relaxed">{noviMessage}</p>
            {summary.pendingCount === 0 && (
              <p className="text-sm text-green-600 mt-2">All caught up! 🎉 Everything is shipped.</p>
            )}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-rose-100">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Avg Time to Ship</p>
            <p className="text-2xl font-bold text-neutral-800">{analytics.avgDaysToShip} <span className="text-sm font-normal text-neutral-500">days</span></p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-rose-100">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">On-Time Rate</p>
            <p className="text-2xl font-bold text-green-600">{analytics.onTimeRate}%</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-rose-100">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Total Shipments</p>
            <p className="text-2xl font-bold text-neutral-800">{analytics.totalShipments}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-rose-100">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Avg Cost/Shipment</p>
            <p className="text-2xl font-bold text-neutral-800">${analytics.avgCost.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'pending', label: 'Ready to Ship', count: pendingOrders.length },
          { id: 'transit', label: 'In Transit', count: shipments.length },
          { id: 'packaging', label: 'Packaging' },
          { id: 'documents', label: 'Documents', count: templates.length },
          { id: 'unboxing', label: 'Unboxing' },
          { id: 'recipes', label: 'Recipes', count: recipes.length },
          { id: 'analytics', label: 'Analytics' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ═════════════════════════════════════════════════════════════
          TAB: Ready to Ship
          ═════════════════════════════════════════════════════════════ */}
      {tab === 'pending' && (
        <div className="space-y-4">
          {error && <ErrorBanner message={error} />}
          {pendingOrders.length === 0 ? (
            <EmptyState icon="📦" title="All caught up!" description="No orders are waiting to be shipped." action={<Button onClick={fetchAll}>Refresh</Button>} />
          ) : (
            <>
              {selectedOrders.size > 0 && (
                <div className="bg-rose-50 rounded-xl p-4 flex items-center justify-between">
                  <span className="text-sm text-rose-700 font-medium">{selectedOrders.size} order{selectedOrders.size > 1 ? 's' : ''} selected</span>
                  <div className="flex items-center gap-3">
                    <select className="border border-rose-300 rounded-lg px-3 py-1.5 text-sm" value={bulkCarrier} onChange={e => setBulkCarrier(e.target.value)}>
                      <option>UPS</option><option>USPS</option><option>FedEx</option><option>DHL</option>
                    </select>
                    <Button onClick={handleBulkShip} disabled={shipping} size="sm">{shipping ? 'Shipping…' : `Ship ${selectedOrders.size} Orders`}</Button>
                    <button className="text-sm text-neutral-500 hover:text-neutral-700" onClick={() => setSelectedOrders(new Set())}>Clear</button>
                  </div>
                </div>
              )}
              <div className="bg-white rounded-xl shadow-sm border border-rose-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-rose-100 text-left">
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider w-10">
                          <input type="checkbox" checked={selectedOrders.size === pendingOrders.length && pendingOrders.length > 0}
                            onChange={() => setSelectedOrders(selectedOrders.size === pendingOrders.length ? new Set() : new Set(pendingOrders.map(o => o.id)))}
                            className="rounded border-neutral-300" />
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Order</th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Customer</th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Items</th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Source</th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Age</th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total</th>
                        <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-50">
                      {pendingOrders.map(order => {
                        const age = getAgeDays(order.created_at);
                        return (
                          <tr key={order.id} className="hover:bg-rose-50/50 transition-colors">
                            <td className="px-4 py-3"><input type="checkbox" checked={selectedOrders.has(order.id)} onChange={() => toggleSelect(order.id)} className="rounded border-neutral-300" /></td>
                            <td className="px-4 py-3"><span className="font-mono text-sm font-medium text-neutral-800">#{order.order_number}</span></td>
                            <td className="px-4 py-3"><p className="text-sm font-medium text-neutral-800">{order.customer_name}</p>{order.shipping_address && <p className="text-xs text-neutral-500 truncate max-w-[180px]">{order.shipping_address}</p>}</td>
                            <td className="px-4 py-3"><p className="text-xs text-neutral-600 max-w-[220px] truncate">{order.items_summary}</p></td>
                            <td className="px-4 py-3"><Badge>{order.source}</Badge></td>
                            <td className="px-4 py-3"><span className={`text-xs ${age >= 2 ? 'text-amber-600 font-semibold' : age >= 1 ? 'text-amber-500' : 'text-neutral-600'}`}>{age} day{age !== 1 ? 's' : ''}</span></td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-neutral-800">${order.total_amount?.toFixed(2) || '0.00'}</span>
                              {order.total_qty !== undefined && order.total_qty > 0 && (
                                <p className={`text-xs mt-0.5 ${order.fully_picked ? 'text-green-600' : order.status === 'picking' ? 'text-amber-600' : 'text-neutral-500'}`}>
                                  {order.scanned_qty || 0}/{order.total_qty} picked
                                  {order.fully_picked ? ' ✅' : ''}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button size="sm"
                                disabled={order.total_qty !== undefined && order.total_qty > 0 && !order.fully_picked}
                                onClick={() => { setShipModal({ order }); setShipForm({ carrier: 'UPS', trackingNumber: '', packageType: '', weightOz: '', cost: '' }); }}>
                                {order.fully_picked ? 'Ready to Ship' : order.status === 'picking' ? 'Picking...' : 'Ship Now'}
                              </Button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setOpsOrderId(order.id); setOpsOrderNumber(order.order_number); setOpsCustomerName(order.customer_name); }}
                                className="ml-1 text-xs px-2 py-1 rounded-lg border border-purple-200 text-purple-500 hover:bg-purple-50 transition-colors"
                                title="Operations Center"
                              >
                                ⚡ Ops
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          TAB: In Transit
          ═════════════════════════════════════════════════════════════ */}
      {tab === 'transit' && (
        <div className="space-y-4">
          {shipments.length === 0 ? (
            <EmptyState icon="🚚" title="No active shipments" description="All shipments have been delivered." />
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-rose-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-rose-100 text-left">
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Tracking #</th>
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Order</th>
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Carrier</th>
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Days in Transit</th>
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Customer</th>
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Risk</th>
                      <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Print</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-50">
                    {shipments.map(s => {
                      const risk = getShipmentRisk(s.shipped_at, s.status);
                      return (
                        <tr key={s.id} className="hover:bg-rose-50/50 transition-colors">
                          <td className="px-4 py-3"><span className="font-mono text-sm text-neutral-700">{s.tracking_number || '—'}</span></td>
                          <td className="px-4 py-3"><span className="font-mono text-sm font-medium">#{s.order_number}</span></td>
                          <td className="px-4 py-3"><Badge className={CARRIER_COLORS[s.carrier] || 'bg-neutral-100'}>{s.carrier}</Badge></td>
                          <td className="px-4 py-3"><Badge className={STATUS_COLORS[s.status] || 'bg-neutral-100'}>{STATUS_LABELS[s.status] || s.status}</Badge></td>
                          <td className="px-4 py-3"><span className="text-sm text-neutral-600">{getShipmentAge(s.shipped_at)} days</span></td>
                          <td className="px-4 py-3"><p className="text-sm text-neutral-800">{s.customer_name}</p></td>
                          <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[risk]}`}>{risk === 'on_time' ? '🟢 On Time' : risk === 'at_risk' ? '🟡 At Risk' : '🔴 Late'}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handlePrint(s.id, 'shipping_label')}
                                className="p-1.5 text-neutral-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                                title="Print Shipping Label"
                              >
                                🖨️
                              </button>
                              <button
                                onClick={() => handlePrint(s.id, 'packing_slip')}
                                className="p-1.5 text-neutral-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors text-xs"
                                title="Print Packing Slip"
                              >
                                📋
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          TAB: Packaging
          ═════════════════════════════════════════════════════════════ */}
      {tab === 'packaging' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-3">
              <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Select an Order</h3>
              <div className="bg-white rounded-xl shadow-sm border border-rose-100 divide-y divide-rose-50 max-h-[400px] overflow-y-auto">
                {pendingOrders.map(order => (
                  <button key={order.id} onClick={() => { loadPackaging(order.id); fetchUnboxingSuggestions(order.id); }}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-rose-50 ${selectedOrderId === order.id ? 'bg-rose-50 border-l-4 border-rose-400' : ''}`}>
                    <p className="text-sm font-medium text-neutral-800">#{order.order_number} — {order.customer_name}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{order.items_summary}</p>
                  </button>
                ))}
                {pendingOrders.length === 0 && <p className="px-4 py-8 text-center text-sm text-neutral-500">No pending orders to pack</p>}
              </div>
              {/* Unboxing suggestions */}
              {unboxingSuggestions.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-rose-100 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide flex items-center gap-2">🎁 Unboxing Checklist</h3>
                  {unboxingSuggestions.map(s => (
                    <div key={s.id} className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                      <p className="text-xs font-medium text-purple-800">{s.name}</p>
                      <p className="text-xs text-purple-600 mt-0.5">{s.reason}</p>
                      <Badge className="mt-1 text-[10px] bg-purple-100 text-purple-700">{s.action_type.replace(/_/g, ' ')}</Badge>
                    </div>
                  ))}
                </div>
              )}
              {/* Packing Recipes */}
              {selectedOrderId && orderRecipes[selectedOrderId] && orderRecipes[selectedOrderId].length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-rose-100 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide flex items-center gap-2">📦 Packing Recipe</h3>
                  {orderRecipes[selectedOrderId].map(r => (
                    <div key={r.id} className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <p className="text-xs font-medium text-blue-800">{r.name}</p>
                      {r.box_size && <p className="text-xs text-blue-600 mt-0.5">Box: {r.box_size}</p>}
                      {r.packing_materials.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {r.packing_materials.map((m, i) => (
                            <span key={i} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{m}</span>
                          ))}
                        </div>
                      )}
                      {r.inserts.length > 0 && (
                        <div className="mt-1">
                          {r.inserts.map((ins, i) => (
                            <p key={i} className="text-[10px] text-blue-600">+ {ins.quantity}x {ins.type.replace(/_/g, ' ')}{ins.details ? ` (${ins.details})` : ''}</p>
                          ))}
                        </div>
                      )}
                      {r.special_instructions && (
                        <p className="text-[10px] text-blue-500 mt-1 italic">{r.special_instructions}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {combinations.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-rose-100 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide flex items-center gap-2">💡 Combine & Save</h3>
                  {combinations.map((combo, i) => (
                    <div key={i} className="bg-green-50 rounded-lg p-3 border border-green-100">
                      <p className="text-xs font-medium text-green-800">{combo.customerName}</p>
                      <p className="text-xs text-green-700 mt-1">Orders {combo.orderNumbers.join(', #')} → same address</p>
                      <p className="text-sm font-semibold text-green-700 mt-1">Save ${combo.estimatedSavings.toFixed(2)} ({combo.savingsPercent}%)</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="lg:col-span-2">
              {packaging ? (
                <div className="bg-white rounded-xl shadow-sm border border-rose-100 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div><h3 className="text-lg font-semibold text-neutral-800">Order #{packaging.orderNumber} — {packaging.customerName}</h3><p className="text-sm text-neutral-500">{packaging.items.length} item types</p></div>
                    <Novi expression="happy" size="sm" animated />
                  </div>
                  <div className="bg-rose-50 rounded-xl p-4 border border-rose-200">
                    <p className="text-xs text-rose-500 uppercase tracking-wide font-semibold">Recommended Box</p>
                    <p className="text-xl font-bold text-rose-700 mt-1">{packaging.boxSuggestion}</p>
                    <p className="text-sm text-rose-600 mt-1">Total weight: {packaging.totalWeightOz} oz | Est. volume: {packaging.estimatedVolume} in³</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-700 mb-2">Pack Verification Checklist</h4>
                    <div className="divide-y divide-rose-50 border border-rose-100 rounded-lg">
                      {packaging.items.map(item => (
                        <div key={item.id} className="px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <input type="checkbox" className="rounded border-neutral-300" checked={checkedItems.has(item.id)} onChange={() => { setCheckedItems(prev => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; }); }} />
                            <div><p className="text-sm font-medium text-neutral-800">{item.product_name || item.sku}</p><p className="text-xs text-neutral-500">{item.variant_title || ''} — Qty: {item.quantity} × ${item.price?.toFixed(2) || '—'}</p></div>
                          </div>
                          <span className="text-xs text-neutral-400">{item.weight_oz ? `${item.weight_oz}oz` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Pack verification submit */}
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-neutral-700 mb-1">Packer Notes</label>
                      <input type="text" className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="Optional notes..." value={packNotes} onChange={e => setPackNotes(e.target.value)} />
                    </div>
                    <Button size="sm" onClick={verifyPack} disabled={checkedItems.size === 0 || verifying}>
                      {verifying ? 'Verifying...' : `✓ Verify Pack (${checkedItems.size})`}
                    </Button>
                  </div>
                  {packaging.packagingInstructions.length > 0 && (
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">⚠️ Special Handling</p>
                      {packaging.packagingInstructions.map((inst, i) => <p key={i} className="text-sm text-amber-700">• {inst}</p>)}
                    </div>
                  )}
                  <div className="border-2 border-dashed border-neutral-200 rounded-xl p-6 text-center hover:border-rose-300 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => setPackPhoto(reader.result as string); reader.readAsDataURL(file); } }} />
                    {packPhoto ? (
                      <div className="space-y-2">
                        <img src={packPhoto} alt="Pack photo preview" className="max-h-32 mx-auto rounded-lg" />
                        <p className="text-xs text-green-600 font-medium">✓ Photo attached</p>
                        <button type="button" className="text-xs text-neutral-400 underline" onClick={(e) => { e.stopPropagation(); setPackPhoto(null); }}>Remove</button>
                      </div>
                    ) : (
                      <>
                        <p className="text-2xl mb-2">📸</p><p className="text-sm text-neutral-500">Drop a photo here for pack verification</p><p className="text-xs text-neutral-400 mt-1">or click to upload</p>
                      </>
                    )}
                  </div>
                  {packaging.verifications.length > 0 && (
                    <div><h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Verification History</h4>
                      {packaging.verifications.map(v => <div key={v.id} className="text-xs text-neutral-500">Verified {new Date(v.created_at + 'Z').toLocaleString()}{v.notes ? ` — ${v.notes}` : ''}</div>)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-rose-100 p-12 text-center">
                  <Novi expression="curious" size="lg" animated />
                  <p className="text-neutral-500 mt-4">Select an order from the list to see packaging recommendations</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          TAB: Documents (Template Designer)
          ═════════════════════════════════════════════════════════════ */}
      {tab === 'documents' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <select
                className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                value={templateTypeFilter}
                onChange={e => setTemplateTypeFilter(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="shipping_label">Shipping Labels</option>
                <option value="packing_slip">Packing Slips</option>
                <option value="invoice">Invoices</option>
                <option value="warehouse_label">Warehouse Labels</option>
              </select>
              <Button size="sm" variant="ghost" onClick={fetchTemplates}>Refresh</Button>
            </div>
            <Button size="sm" onClick={() => openTemplateEditor()}>
              + New Template
            </Button>
          </div>

          {/* Template List */}
          {templates.length === 0 ? (
            <EmptyState
              icon="📄"
              title="No templates yet"
              description="Create your first document template to customize packing slips, invoices, and labels."
              action={<Button onClick={() => openTemplateEditor()}>Create Template</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {templates.map(t => (
                <div key={t.id} className={`bg-white rounded-xl shadow-sm border p-4 ${t.is_default ? 'border-rose-300 ring-1 ring-rose-100' : 'border-rose-100'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-neutral-800">{t.name}</h3>
                        {t.is_default === 1 && <Badge className="bg-rose-100 text-rose-700 text-[10px]">Default</Badge>}
                      </div>
                      <Badge className="mt-1 text-[10px]">{TEMPLATE_TYPE_LABELS[t.type] || t.type}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDuplicateTemplate(t.id)} className="p-1 text-neutral-400 hover:text-neutral-600 text-xs" title="Duplicate">📋</button>
                      <button onClick={() => openTemplateEditor(t)} className="p-1 text-neutral-400 hover:text-neutral-600 text-xs" title="Edit">✏️</button>
                      <button onClick={() => handleDeleteTemplate(t.id)} className="p-1 text-neutral-400 hover:text-red-500 text-xs" title="Delete">🗑️</button>
                    </div>
                  </div>
                  {/* Mini preview */}
                  <TemplatePreview type={t.type} config={t.config} />
                </div>
              ))}
            </div>
          )}

          {/* Template Editor Modal */}
          {showTemplateEditor && (
            <Modal onClose={() => setShowTemplateEditor(false)} title={editingTemplate.id ? `Edit: ${editingTemplate.name}` : 'New Template'} size="lg">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 max-h-[70vh]">
                {/* Form */}
                <div className="lg:col-span-3 space-y-4 overflow-y-auto pr-2">
                  {/* Basic info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Template Type</label>
                      <select
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                        value={editingTemplate.type}
                        onChange={e => {
                          setEditingTemplate(prev => ({
                            ...prev,
                            type: e.target.value,
                            config: { ...prev.config, ...defaultTemplateConfig(e.target.value) },
                          }));
                        }}
                      >
                        {Object.entries(TEMPLATE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Template Name</label>
                      <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Retail Packing Slip"
                        value={editingTemplate.name}
                        onChange={e => setEditingTemplate(prev => ({ ...prev, name: e.target.value }))} />
                    </div>
                  </div>

                  {/* Branding */}
                  <fieldset className="border border-neutral-200 rounded-lg p-4 space-y-3">
                    <legend className="text-xs font-semibold text-neutral-600 px-1">Branding</legend>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Logo URL</label>
                      <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="https://..."
                        value={editingTemplate.config.logo || ''}
                        onChange={e => setEditingTemplate(prev => ({ ...prev, config: { ...prev.config, logo: e.target.value } }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Primary Color</label>
                        <div className="flex items-center gap-2">
                          <input type="color" className="w-8 h-8 rounded border cursor-pointer"
                            value={editingTemplate.config.primaryColor || '#e11d48'}
                            onChange={e => setEditingTemplate(prev => ({ ...prev, config: { ...prev.config, primaryColor: e.target.value } }))} />
                          <input className="flex-1 border border-neutral-300 rounded px-2 py-1 text-xs font-mono"
                            value={editingTemplate.config.primaryColor || ''}
                            onChange={e => setEditingTemplate(prev => ({ ...prev, config: { ...prev.config, primaryColor: e.target.value } }))} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Accent Color</label>
                        <div className="flex items-center gap-2">
                          <input type="color" className="w-8 h-8 rounded border cursor-pointer"
                            value={editingTemplate.config.accentColor || '#fda4af'}
                            onChange={e => setEditingTemplate(prev => ({ ...prev, config: { ...prev.config, accentColor: e.target.value } }))} />
                          <input className="flex-1 border border-neutral-300 rounded px-2 py-1 text-xs font-mono"
                            value={editingTemplate.config.accentColor || ''}
                            onChange={e => setEditingTemplate(prev => ({ ...prev, config: { ...prev.config, accentColor: e.target.value } }))} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Font</label>
                      <select className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                        value={editingTemplate.config.font || 'Inter'}
                        onChange={e => setEditingTemplate(prev => ({ ...prev, config: { ...prev.config, font: e.target.value } }))}>
                        {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                  </fieldset>

                  {/* Toggle Fields */}
                  <fieldset className="border border-neutral-200 rounded-lg p-4 space-y-2">
                    <legend className="text-xs font-semibold text-neutral-600 px-1">Fields to Include</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'showThankYou', label: 'Thank You Message' },
                        { key: 'showSocialMedia', label: 'Social Media Handles' },
                        { key: 'showQrCode', label: 'QR Code' },
                        { key: 'showProductPhotos', label: 'Product Photos' },
                        { key: 'showOrderNotes', label: 'Order Notes' },
                        { key: 'showGiftMessage', label: 'Gift Messages' },
                        { key: 'showBarcode', label: 'Barcode' },
                        { key: 'showWarehouseLocation', label: 'Warehouse Location' },
                        { key: 'showPickListInfo', label: 'Pick List Info' },
                        { key: 'showPackedBy', label: '"Packed by" Name' },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                          <input type="checkbox" className="rounded border-neutral-300"
                            checked={!!(editingTemplate.config as any)[key]}
                            onChange={e => setEditingTemplate(prev => ({ ...prev, config: { ...prev.config, [key]: e.target.checked } }))} />
                          {label}
                        </label>
                      ))}
                    </div>
                    {editingTemplate.config.showThankYou && (
                      <div className="pt-2">
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Thank You Message</label>
                        <textarea className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" rows={2}
                          value={editingTemplate.config.thankYouMessage || ''}
                          onChange={e => setEditingTemplate(prev => ({ ...prev, config: { ...prev.config, thankYouMessage: e.target.value } }))} />
                      </div>
                    )}
                    {editingTemplate.config.showSocialMedia && (
                      <div className="pt-2">
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Social Handles</label>
                        <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="@yourbrand"
                          value={editingTemplate.config.socialHandles || ''}
                          onChange={e => setEditingTemplate(prev => ({ ...prev, config: { ...prev.config, socialHandles: e.target.value } }))} />
                      </div>
                    )}
                    {editingTemplate.type === 'shipping_label' && (
                      <div className="pt-2">
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Label Size</label>
                        <select className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                          value={editingTemplate.config.labelSize || '4x6 thermal'}
                          onChange={e => setEditingTemplate(prev => ({ ...prev, config: { ...prev.config, labelSize: e.target.value } }))}>
                          {LABEL_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                  </fieldset>

                  {/* Default toggle */}
                  <label className="flex items-center gap-2 text-sm text-neutral-700">
                    <input type="checkbox" className="rounded border-neutral-300"
                      checked={!!editingTemplate.is_default}
                      onChange={e => setEditingTemplate(prev => ({ ...prev, is_default: e.target.checked ? 1 : 0 }))} />
                    Set as default for this template type
                  </label>

                  {/* Save button */}
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="ghost" onClick={() => setShowTemplateEditor(false)}>Cancel</Button>
                    <Button onClick={handleSaveTemplate} disabled={savingTemplate || !editingTemplate.name.trim()}>
                      {savingTemplate ? 'Saving…' : editingTemplate.id ? 'Update Template' : 'Create Template'}
                    </Button>
                  </div>
                </div>

                {/* Preview */}
                <div className="lg:col-span-2">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Preview</p>
                  <TemplatePreview type={editingTemplate.type || 'packing_slip'} config={editingTemplate.config} />
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          TAB: Unboxing
          ═════════════════════════════════════════════════════════════ */}
      {tab === 'unboxing' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Unboxing Experience Rules</h3>
            <Button size="sm" onClick={() => openUnboxingForm()}>+ Add Rule</Button>
          </div>

          {unboxingRules.length === 0 ? (
            <EmptyState
              icon="🎁"
              title="No unboxing rules yet"
              description="Create rules to automatically add thank-you cards, free samples, coupons, and more based on order conditions."
              action={<Button onClick={() => openUnboxingForm()}>Create First Rule</Button>}
            />
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-rose-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-rose-100 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Condition</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Action</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-50">
                  {unboxingRules.map(rule => (
                    <tr key={rule.id} className="hover:bg-rose-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-neutral-500">{rule.priority}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-neutral-800">{rule.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Badge className="text-[10px] bg-blue-100 text-blue-700">{rule.condition_type.replace(/_/g, ' ')}</Badge>
                          <span className="text-xs text-neutral-500">→ {rule.condition_value}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="text-[10px] bg-purple-100 text-purple-700">{rule.action_type.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${rule.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openUnboxingForm(rule)} className="p-1 text-neutral-400 hover:text-neutral-600 text-xs" title="Edit">✏️</button>
                          <button onClick={() => handleDeleteUnboxingRule(rule.id)} className="p-1 text-neutral-400 hover:text-red-500 text-xs" title="Delete">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Unboxing Rule Editor Modal */}
          {showUnboxingForm && (
            <Modal onClose={() => setShowUnboxingForm(false)} title={editingUnboxingRule.id ? 'Edit Unboxing Rule' : 'New Unboxing Rule'}>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">Rule Name *</label>
                  <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Big Order Thank You"
                    value={editingUnboxingRule.name}
                    onChange={e => setEditingUnboxingRule(prev => ({ ...prev, name: e.target.value }))} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">Condition Type *</label>
                    <select className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                      value={editingUnboxingRule.condition_type}
                      onChange={e => setEditingUnboxingRule(prev => ({ ...prev, condition_type: e.target.value, condition_value: '' }))}>
                      {CONDITION_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">Condition Value *</label>
                    {editingUnboxingRule.condition_type === 'order_value' ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm">$</span>
                        <input className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm" type="number" placeholder="100"
                          value={editingUnboxingRule.condition_value}
                          onChange={e => setEditingUnboxingRule(prev => ({ ...prev, condition_value: e.target.value }))} />
                      </div>
                    ) : editingUnboxingRule.condition_type === 'product_type' ? (
                      <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. fragrance"
                        value={editingUnboxingRule.condition_value}
                        onChange={e => setEditingUnboxingRule(prev => ({ ...prev, condition_value: e.target.value }))} />
                    ) : editingUnboxingRule.condition_type === 'customer_type' ? (
                      <select className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                        value={editingUnboxingRule.condition_value}
                        onChange={e => setEditingUnboxingRule(prev => ({ ...prev, condition_value: e.target.value }))}>
                        <option value="">Select...</option>
                        <option value="first_time">First-time Customer</option>
                        <option value="returning">Returning Customer</option>
                        <option value="wholesale">Wholesale Order</option>
                      </select>
                    ) : editingUnboxingRule.condition_type === 'seasonal' ? (
                      <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="11-1-12-31 (Nov-Dec)"
                        value={editingUnboxingRule.condition_value}
                        onChange={e => setEditingUnboxingRule(prev => ({ ...prev, condition_value: e.target.value }))} />
                    ) : (
                      <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="Custom condition"
                        value={editingUnboxingRule.condition_value}
                        onChange={e => setEditingUnboxingRule(prev => ({ ...prev, condition_value: e.target.value }))} />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">Action Type *</label>
                    <select className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                      value={editingUnboxingRule.action_type}
                      onChange={e => setEditingUnboxingRule(prev => ({ ...prev, action_type: e.target.value, action_config: {} }))}>
                      {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">Priority</label>
                    <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" type="number" placeholder="0"
                      value={editingUnboxingRule.priority || 0}
                      onChange={e => setEditingUnboxingRule(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>

                {/* Action config based on type */}
                {editingUnboxingRule.action_type === 'thank_you_card' || editingUnboxingRule.action_type === 'custom_note' ? (
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">Message</label>
                    <textarea className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" rows={3}
                      placeholder="Thanks for your order!"
                      value={editingUnboxingRule.action_config.message || ''}
                      onChange={e => setEditingUnboxingRule(prev => ({ ...prev, action_config: { ...prev.action_config, message: e.target.value } }))} />
                  </div>
                ) : editingUnboxingRule.action_type === 'coupon' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Coupon Amount</label>
                      <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" type="number" placeholder="10"
                        value={editingUnboxingRule.action_config.amount || ''}
                        onChange={e => setEditingUnboxingRule(prev => ({ ...prev, action_config: { ...prev.action_config, amount: e.target.value } }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Type</label>
                      <select className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                        value={editingUnboxingRule.action_config.couponType || 'percentage'}
                        onChange={e => setEditingUnboxingRule(prev => ({ ...prev, action_config: { ...prev.action_config, couponType: e.target.value } }))}>
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed Amount</option>
                      </select>
                    </div>
                  </div>
                ) : editingUnboxingRule.action_type === 'free_sample' ? (
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Sample Description</label>
                    <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. New Lavender Scent Sample"
                      value={editingUnboxingRule.action_config.sampleDescription || ''}
                      onChange={e => setEditingUnboxingRule(prev => ({ ...prev, action_config: { ...prev.action_config, sampleDescription: e.target.value } }))} />
                  </div>
                ) : editingUnboxingRule.action_type === 'seasonal_insert' ? (
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Card Description</label>
                    <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Holiday postcard"
                      value={editingUnboxingRule.action_config.cardDescription || ''}
                      onChange={e => setEditingUnboxingRule(prev => ({ ...prev, action_config: { ...prev.action_config, cardDescription: e.target.value } }))} />
                  </div>
                ) : editingUnboxingRule.action_type === 'sticker' ? (
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Sticker Description</label>
                    <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Brand logo sticker"
                      value={editingUnboxingRule.action_config.stickerDescription || ''}
                      onChange={e => setEditingUnboxingRule(prev => ({ ...prev, action_config: { ...prev.action_config, stickerDescription: e.target.value } }))} />
                  </div>
                ) : null}

                {/* Active toggle */}
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" className="rounded border-neutral-300"
                    checked={!!editingUnboxingRule.is_active}
                    onChange={e => setEditingUnboxingRule(prev => ({ ...prev, is_active: e.target.checked ? 1 : 0 }))} />
                  Rule is active
                </label>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowUnboxingForm(false)}>Cancel</Button>
                  <Button onClick={handleSaveUnboxingRule} disabled={savingUnboxingRule || !editingUnboxingRule.name.trim() || !editingUnboxingRule.condition_value.trim()}>
                    {savingUnboxingRule ? 'Saving…' : editingUnboxingRule.id ? 'Update Rule' : 'Create Rule'}
                  </Button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}
      {/* ═════════════════════════════════════════════════════════════
          TAB: Recipes (Fulfillment 1.2)
          ═════════════════════════════════════════════════════════════ */}
      {tab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Packing Recipes</h3>
            <Button size="sm" onClick={() => openRecipeForm()}>+ Add Recipe</Button>
          </div>

          {recipes.length === 0 ? (
            <EmptyState
              icon="📦"
              title="No packing recipes yet"
              description="Create recipes to automatically suggest box sizes, packing materials, and inserts for each order type."
              action={<Button onClick={() => openRecipeForm()}>Create First Recipe</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {recipes.map(recipe => (
                <div key={recipe.id} className={`bg-white rounded-xl shadow-sm border p-4 ${recipe.is_active ? 'border-rose-100' : 'border-neutral-200 opacity-60'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-neutral-800">{recipe.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={`text-[10px] ${recipe.order_type === 'retail' ? 'bg-green-100 text-green-700' : recipe.order_type === 'wholesale' ? 'bg-amber-100 text-amber-700' : recipe.order_type === 'sample' ? 'bg-purple-100 text-purple-700' : 'bg-neutral-100 text-neutral-600'}`}>
                          {recipe.order_type === 'any' ? 'Any Order' : recipe.order_type}
                        </Badge>
                        {recipe.product_id ? (
                          <Badge className="text-[10px] bg-blue-100 text-blue-700">Product Specific</Badge>
                        ) : (
                          <Badge className="text-[10px] bg-neutral-100 text-neutral-600">All Products</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleToggleRecipeActive(recipe)} className={`p-1 text-xs ${recipe.is_active ? 'text-green-500 hover:text-green-700' : 'text-neutral-400 hover:text-neutral-600'}`} title={recipe.is_active ? 'Active - click to deactivate' : 'Inactive - click to activate'}>
                        {recipe.is_active ? '\u{1F7E2}' : '\u{26AA}'}
                      </button>
                      <button onClick={() => openRecipeForm(recipe)} className="p-1 text-neutral-400 hover:text-neutral-600 text-xs" title="Edit">{'\u270F\uFE0F'}</button>
                      <button onClick={() => handleDeleteRecipe(recipe.id)} className="p-1 text-neutral-400 hover:text-red-500 text-xs" title="Delete">{'\uD83D\uDDD1\uFE0F'}</button>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    {recipe.box_size && (
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400">{'\uD83D\uDCCF'}</span>
                        <span className="text-neutral-700 font-medium">Box: {recipe.box_size}</span>
                      </div>
                    )}
                    {recipe.packing_materials.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-neutral-400 mt-0.5">{'\uD83E\uDDFB'}</span>
                        <div className="flex flex-wrap gap-1">
                          {recipe.packing_materials.map((m, i) => (
                            <span key={i} className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">{m}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {recipe.inserts.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-neutral-400 mt-0.5">{'\uD83D\uDC8C'}</span>
                        <div>
                          {recipe.inserts.map((ins, i) => (
                            <p key={i} className="text-xs text-neutral-600">{ins.quantity}x {ins.type.replace(/_/g, ' ')}{ins.details ? ` \u2014 ${ins.details}` : ''}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {recipe.labels && (
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400">{'\uD83C\uDFF7\uFE0F'}</span>
                        <span className="text-xs text-neutral-600">{recipe.labels.quantity}x {recipe.labels.type.replace(/_/g, ' ')} label{recipe.labels.quantity > 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {recipe.special_instructions && (
                      <div className="flex items-start gap-2">
                        <span className="text-neutral-400">{'\uD83D\uDCDD'}</span>
                        <span className="text-xs text-neutral-500 italic">{recipe.special_instructions}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400">
                    <span>Priority: {recipe.priority}</span>
                    <span>{recipe.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recipe Editor Modal */}
          {showRecipeForm && (
            <Modal onClose={() => setShowRecipeForm(false)} title={editingRecipe.id ? `Edit: ${editingRecipe.name}` : 'New Packing Recipe'}>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">Recipe Name *</label>
                    <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Standard Retail"
                      value={editingRecipe.name}
                      onChange={e => setEditingRecipe(prev => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">Order Type</label>
                    <select className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                      value={editingRecipe.order_type}
                      onChange={e => setEditingRecipe(prev => ({ ...prev, order_type: e.target.value }))}>
                      <option value="any">Any Order</option>
                      <option value="retail">Retail</option>
                      <option value="wholesale">Wholesale</option>
                      <option value="sample">Sample</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">Box Size</label>
                    <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder='e.g. 10x8x4'
                      value={editingRecipe.box_size || ''}
                      onChange={e => setEditingRecipe(prev => ({ ...prev, box_size: e.target.value }))} />
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['6x4x3', '10x8x4', '12x10x6', '14x10x8', '18x12x12'].map(s => (
                        <button key={s} className={`text-[10px] px-1.5 py-0.5 rounded border ${editingRecipe.box_size === s ? 'bg-rose-100 border-rose-300 text-rose-700' : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'}`}
                          onClick={() => setEditingRecipe(prev => ({ ...prev, box_size: s }))}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">Priority (lower = first)</label>
                    <input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" type="number" min="0" placeholder="1"
                      value={editingRecipe.priority ?? 1}
                      onChange={e => setEditingRecipe(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">Packing Materials</label>
                  <div className="flex flex-wrap gap-1.5">
                    {['bubble wrap', 'tissue paper', 'air pillows', 'kraft paper', 'foam inserts', 'corrugated insert', 'peanuts'].map(m => {
                      const selected = editingRecipe.packing_materials.includes(m);
                      return (
                        <button key={m} className={`text-xs px-2 py-1 rounded-full border transition-colors ${selected ? 'bg-rose-100 border-rose-300 text-rose-700' : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'}`}
                          onClick={() => {
                            setEditingRecipe(prev => ({
                              ...prev,
                              packing_materials: selected
                                ? prev.packing_materials.filter(x => x !== m)
                                : [...prev.packing_materials, m]
                            }));
                          }}>{m}</button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-neutral-600">Inserts</label>
                    <button className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                      onClick={() => setEditingRecipe(prev => ({
                        ...prev,
                        inserts: [...prev.inserts, { type: 'thank_you_card', details: '', quantity: 1 }]
                      }))}>+ Add Insert</button>
                  </div>
                  {editingRecipe.inserts.length === 0 ? (
                    <p className="text-xs text-neutral-400 italic">No inserts - click "+ Add Insert" to add one</p>
                  ) : (
                    <div className="space-y-2">
                      {editingRecipe.inserts.map((ins, i) => (
                        <div key={i} className="flex items-center gap-2 bg-neutral-50 rounded-lg p-2 border border-neutral-200">
                          <select className="text-xs border border-neutral-300 rounded px-1.5 py-1 flex-1"
                            value={ins.type}
                            onChange={e => {
                              const updated = [...editingRecipe.inserts];
                              updated[i] = { ...updated[i], type: e.target.value };
                              setEditingRecipe(prev => ({ ...prev, inserts: updated }));
                            }}>
                            <option value="thank_you_card">Thank You Card</option>
                            <option value="coupon">Coupon</option>
                            <option value="free_sample">Free Sample</option>
                            <option value="seasonal_insert">Seasonal Insert</option>
                            <option value="sticker">Sticker</option>
                            <option value="care_card">Care Card</option>
                            <option value="catalog">Catalog</option>
                          </select>
                          <input className="text-xs border border-neutral-300 rounded px-1.5 py-1 w-24" placeholder="Details"
                            value={ins.details}
                            onChange={e => {
                              const updated = [...editingRecipe.inserts];
                              updated[i] = { ...updated[i], details: e.target.value };
                              setEditingRecipe(prev => ({ ...prev, inserts: updated }));
                            }} />
                          <input className="text-xs border border-neutral-300 rounded px-1.5 py-1 w-12" type="number" min="1"
                            value={ins.quantity}
                            onChange={e => {
                              const updated = [...editingRecipe.inserts];
                              updated[i] = { ...updated[i], quantity: parseInt(e.target.value) || 1 };
                              setEditingRecipe(prev => ({ ...prev, inserts: updated }));
                            }} />
                          <button className="text-xs text-red-400 hover:text-red-600" onClick={() => {
                            setEditingRecipe(prev => ({ ...prev, inserts: prev.inserts.filter((_, idx) => idx !== i) }));
                          }}>{'\u2715'}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">Labels (optional)</label>
                  <div className="flex items-center gap-2">
                    <select className="text-sm border border-neutral-300 rounded-lg px-2 py-1.5"
                      value={editingRecipe.labels?.type || ''}
                      onChange={e => {
                        if (!e.target.value) { setEditingRecipe(prev => ({ ...prev, labels: null })); return; }
                        setEditingRecipe(prev => ({ ...prev, labels: { type: e.target.value, quantity: prev.labels?.quantity || 1 } }));
                      }}>
                      <option value="">None</option>
                      <option value="fragile">Fragile</option>
                      <option value="this_side_up">This Side Up</option>
                      <option value="handle_with_care">Handle With Care</option>
                      <option value="perishable">Perishable</option>
                    </select>
                    {editingRecipe.labels && (
                      <>
                        <span className="text-xs text-neutral-500">{'\u00D7'}</span>
                        <input className="text-sm border border-neutral-300 rounded-lg px-2 py-1.5 w-16" type="number" min="1"
                          value={editingRecipe.labels.quantity}
                          onChange={e => setEditingRecipe(prev => ({
                            ...prev,
                            labels: { ...prev.labels!, quantity: parseInt(e.target.value) || 1 }
                          }))} />
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">Special Instructions</label>
                  <textarea className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" rows={2}
                    placeholder="e.g. Stack boxes on pallets for wholesale shipments"
                    value={editingRecipe.special_instructions || ''}
                    onChange={e => setEditingRecipe(prev => ({ ...prev, special_instructions: e.target.value }))} />
                </div>

                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" className="rounded border-neutral-300"
                    checked={!!editingRecipe.is_active}
                    onChange={e => setEditingRecipe(prev => ({ ...prev, is_active: e.target.checked ? 1 : 0 }))} />
                  Recipe is active
                </label>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setShowRecipeForm(false)}>Cancel</Button>
                  <Button onClick={handleSaveRecipe} disabled={savingRecipe || !editingRecipe.name.trim()}>
                    {savingRecipe ? 'Saving...' : editingRecipe.id ? 'Update Recipe' : 'Create Recipe'}
                  </Button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          TAB: Analytics
          ═════════════════════════════════════════════════════════════ */}
      {tab === 'analytics' && analytics && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-rose-100 p-6">
            <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-4">Carrier Performance</h3>
            {analytics.carrierPerformance.length === 0 ? (
              <p className="text-sm text-neutral-500">No shipment data yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {analytics.carrierPerformance.map(cp => (
                  <div key={cp.carrier} className="border border-rose-100 rounded-lg p-4">
                    <Badge className={CARRIER_COLORS[cp.carrier] || 'bg-neutral-100'}>{cp.carrier}</Badge>
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-neutral-500">{cp.shipment_count} shipments</p>
                      <p className="text-xs text-neutral-500">Avg {cp.avg_days.toFixed(1)} days transit</p>
                      <p className="text-xs text-neutral-500">Avg ${cp.avg_cost.toFixed(2)}/shipment</p>
                      {cp.exceptions > 0 && <p className="text-xs text-red-500 font-medium">{cp.exceptions} exceptions</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {analytics.ordersPerDay.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-rose-100 p-6">
              <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-4">Shipments — Last 30 Days</h3>
              <div className="flex items-end gap-1 h-32">
                {analytics.ordersPerDay.map((d, i) => {
                  const max = Math.max(...analytics.ordersPerDay.map(x => x.count), 1);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-end justify-end group relative">
                      <div className="w-full bg-rose-300 hover:bg-rose-400 rounded-t transition-colors min-h-[2px]" style={{ height: `${Math.max((d.count / max) * 100, 2)}%` }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-rose-100"><p className="text-xs text-neutral-500 uppercase tracking-wide">Total Shipping Cost</p><p className="text-2xl font-bold text-neutral-800 mt-1">${analytics.totalCost.toFixed(2)}</p><p className="text-xs text-neutral-400 mt-1">Across {analytics.totalShipments} shipments</p></div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-rose-100"><p className="text-xs text-neutral-500 uppercase tracking-wide">Avg Cost / Shipment</p><p className="text-2xl font-bold text-neutral-800 mt-1">${analytics.avgCost.toFixed(2)}</p></div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-rose-100"><p className="text-xs text-neutral-500 uppercase tracking-wide">On-Time Deliveries</p><p className="text-2xl font-bold text-green-600 mt-1">{analytics.onTimeRate}%</p><p className="text-xs text-neutral-400 mt-1">{analytics.onTimeDelivered}/{analytics.totalDelivered} delivered</p></div>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {printData && (
        <PrintModal data={printData} onClose={() => setPrintData(null)} />
      )}

      {/* Ship Modal */}
      {shipModal && (
        <Modal onClose={() => setShipModal(null)} title={`Ship Order #${shipModal.order.order_number}`}>
          <div className="space-y-4">
            <div><p className="text-sm text-neutral-600 mb-3"><span className="font-medium">{shipModal.order.customer_name}</span>{shipModal.order.shipping_address && <span className="block text-xs text-neutral-400 mt-0.5">{shipModal.order.shipping_address}</span>}</p></div>
            <div><label className="block text-xs font-semibold text-neutral-600 mb-1">Carrier *</label><select className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" value={shipForm.carrier} onChange={e => setShipForm({ ...shipForm, carrier: e.target.value })}><option>UPS</option><option>USPS</option><option>FedEx</option><option>DHL</option></select></div>
            <div><label className="block text-xs font-semibold text-neutral-600 mb-1">Tracking Number</label><input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 1Z999AA10123456784" value={shipForm.trackingNumber} onChange={e => setShipForm({ ...shipForm, trackingNumber: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-neutral-600 mb-1">Package Type</label><input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Small Box" value={shipForm.packageType} onChange={e => setShipForm({ ...shipForm, packageType: e.target.value })} /></div>
              <div><label className="block text-xs font-semibold text-neutral-600 mb-1">Weight (oz)</label><input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" type="number" placeholder="0" value={shipForm.weightOz} onChange={e => setShipForm({ ...shipForm, weightOz: e.target.value })} /></div>
            </div>
            <div><label className="block text-xs font-semibold text-neutral-600 mb-1">Shipping Cost ($)</label><input className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" type="number" step="0.01" placeholder="0.00" value={shipForm.cost} onChange={e => setShipForm({ ...shipForm, cost: e.target.value })} /></div>
            <div className="flex justify-end gap-3 pt-2"><Button variant="ghost" onClick={() => setShipModal(null)}>Cancel</Button><Button onClick={handleShip} disabled={shipping}>{shipping ? 'Shipping…' : 'Confirm Shipment'}</Button></div>
          </div>
        </Modal>
      )}
      {/* Split Shipment Wizard */}
      {splitWizardOpen && splitOrderId && (
        <SplitShipmentWizard
          orderId={splitOrderId}
          orderNumber={splitOrderNumber}
          open={splitWizardOpen}
          onClose={() => setSplitWizardOpen(false)}
          onSuccess={() => { setSplitWizardOpen(false); fetchAll(); }}
        />
      )}

      {/* ── V2: Operations Center ────────────────────────────────── */}
      <OperationsCenter
        orderId={opsOrderId || 0}
        orderNumber={opsOrderNumber}
        customerName={opsCustomerName}
        open={opsOrderId !== null}
        onClose={() => setOpsOrderId(null)}
        onSuccess={() => { setOpsOrderId(null); fetchAll(); }}
      />
    </div>
  );
}
