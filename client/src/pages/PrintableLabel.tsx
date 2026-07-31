import { defaultTemplateConfig, type TemplateConfig } from './fulfillmentTypes';

// ── Print Data Types ──────────────────────────────────────────────
export interface PrintItem {
  id: number;
  sku: string;
  productName: string | null;
  variantTitle: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface PrintData {
  shipment: {
    id: number;
    carrier: string;
    trackingNumber: string | null;
    status: string;
    shippedAt: string;
    estimatedDelivery: string | null;
  };
  order: {
    id: number;
    orderNumber: number;
    customerName: string;
    customerEmail: string | null;
    shippingAddress: string | null;
    totalAmount: number;
    createdAt: string;
    items: PrintItem[];
  };
  fromAddress: { businessName: string; addressLine1: string };
  template: TemplateConfig | null;
  printType: string;
}

// ── Printable Shipping Label Component ──────────────────────────
function PrintableShippingLabel({ data }: { data: PrintData }) {
  const cfg = data.template || defaultTemplateConfig('shipping_label');

  return (
    <div className="print-only" style={{ fontFamily: cfg.font || 'Inter', width: '4in', height: '6in', padding: '0.25in', boxSizing: 'border-box' }}>
      <div style={{ border: `2px solid ${cfg.primaryColor || '#e11d48'}`, borderRadius: '8px', padding: '0.2in', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        {/* From */}
        <div style={{ marginBottom: '0.15in' }}>
          <p style={{ fontSize: '8pt', color: '#888', margin: 0 }}>From:</p>
          <p style={{ fontSize: '10pt', fontWeight: 600, color: '#333', margin: '2px 0' }}>{data.fromAddress.businessName}</p>
          {data.fromAddress.addressLine1 && <p style={{ fontSize: '9pt', color: '#555', margin: 0 }}>{data.fromAddress.addressLine1}</p>}
        </div>

        {/* To */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p style={{ fontSize: '9pt', color: '#888', margin: '0 0 2px' }}>Ship To:</p>
          <p style={{ fontSize: '14pt', fontWeight: 700, color: '#222', margin: '0 0 2px' }}>{data.order.customerName}</p>
          <p style={{ fontSize: '11pt', color: '#444', margin: 0, lineHeight: 1.4 }}>{data.order.shippingAddress || '\u2014'}</p>
        </div>

        {/* Bottom info */}
        <div style={{ borderTop: `1px solid ${(cfg.accentColor || '#fda4af')}40`, paddingTop: '0.12in', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            {cfg.showBarcode && (
              <div style={{ height: '0.4in', width: '1.6in', background: '#eee', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7pt', color: '#999' }}>
                |||||||||||||||||||
              </div>
            )}
            <p style={{ fontSize: '8pt', color: '#888', margin: '4px 0 0' }}>Order #{data.order.orderNumber}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            {data.shipment.trackingNumber && (
              <p style={{ fontSize: '7pt', color: '#999', margin: 0 }}>{data.shipment.carrier}: {data.shipment.trackingNumber}</p>
            )}
            <p style={{ fontSize: '8pt', color: cfg.primaryColor, fontWeight: 600, margin: '2px 0 0' }}>
              {new Date(data.order.createdAt + 'Z').toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Printable Packing Slip Component ─────────────────────────────
function PrintablePackingSlip({ data }: { data: PrintData }) {
  const cfg = data.template || defaultTemplateConfig('packing_slip');
  const items = data.order.items || [];
  const total = items.reduce((sum, i) => sum + (i.lineTotal || (i.unitPrice || 0) * i.quantity), 0);

  return (
    <div className="print-only" style={{ fontFamily: cfg.font || 'Inter', maxWidth: '7.5in', margin: '0 auto', padding: '0.3in' }}>
      {/* Header */}
      <div style={{ borderBottom: `3px solid ${cfg.primaryColor || '#e11d48'}`, paddingBottom: '0.15in', marginBottom: '0.2in', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          {cfg.logo ? (
            <img src={cfg.logo} alt="Logo" style={{ height: '0.5in', objectFit: 'contain' }} />
          ) : (
            <p style={{ fontSize: '16pt', fontWeight: 700, color: cfg.primaryColor, margin: 0 }}>{data.fromAddress.businessName}</p>
          )}
          <p style={{ fontSize: '9pt', color: '#888', margin: '4px 0 0' }}>Packing Slip</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '11pt', fontWeight: 700, color: '#333', margin: 0 }}>Order #{data.order.orderNumber}</p>
          <p style={{ fontSize: '8pt', color: '#888', margin: '2px 0 0' }}>{new Date(data.order.createdAt + 'Z').toLocaleDateString()}</p>
        </div>
      </div>

      {/* Addresses */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2in', gap: '0.3in' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '8pt', color: '#888', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase' }}>Ship To:</p>
          <p style={{ fontSize: '10pt', fontWeight: 600, color: '#333', margin: 0 }}>{data.order.customerName}</p>
          <p style={{ fontSize: '9pt', color: '#555', margin: '2px 0 0', lineHeight: 1.3 }}>{data.order.shippingAddress || '\u2014'}</p>
        </div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <p style={{ fontSize: '8pt', color: '#888', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase' }}>From:</p>
          <p style={{ fontSize: '10pt', fontWeight: 600, color: '#333', margin: 0 }}>{data.fromAddress.businessName}</p>
          {data.fromAddress.addressLine1 && <p style={{ fontSize: '9pt', color: '#555', margin: '2px 0 0' }}>{data.fromAddress.addressLine1}</p>}
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.2in' }}>
        <thead>
          <tr style={{ backgroundColor: cfg.primaryColor + '12', borderTop: `1px solid ${cfg.primaryColor}40`, borderBottom: `1px solid ${cfg.primaryColor}40` }}>
            <th style={{ padding: '6px 8px', fontSize: '8pt', textAlign: 'left', color: '#666', fontWeight: 600 }}>Item</th>
            <th style={{ padding: '6px 8px', fontSize: '8pt', textAlign: 'center', color: '#666', fontWeight: 600 }}>SKU</th>
            <th style={{ padding: '6px 8px', fontSize: '8pt', textAlign: 'center', color: '#666', fontWeight: 600 }}>Qty</th>
            <th style={{ padding: '6px 8px', fontSize: '8pt', textAlign: 'right', color: '#666', fontWeight: 600 }}>Price</th>
            <th style={{ padding: '6px 8px', fontSize: '8pt', textAlign: 'right', color: '#666', fontWeight: 600 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id || i} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '6px 8px', fontSize: '9pt', color: '#333' }}>
                {item.productName || item.sku}
                {item.variantTitle && <span style={{ color: '#888', fontSize: '8pt' }}> \u2014 {item.variantTitle}</span>}
              </td>
              <td style={{ padding: '6px 8px', fontSize: '8pt', color: '#888', textAlign: 'center', fontFamily: 'monospace' }}>{item.sku}</td>
              <td style={{ padding: '6px 8px', fontSize: '9pt', color: '#333', textAlign: 'center' }}>{item.quantity}</td>
              <td style={{ padding: '6px 8px', fontSize: '9pt', color: '#333', textAlign: 'right' }}>${(item.unitPrice || 0).toFixed(2)}</td>
              <td style={{ padding: '6px 8px', fontSize: '9pt', color: '#333', textAlign: 'right', fontWeight: 600 }}>${(item.lineTotal || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ textAlign: 'right', marginBottom: '0.2in', borderTop: `1px solid ${cfg.primaryColor}40`, paddingTop: '0.1in' }}>
        <p style={{ fontSize: '10pt', color: '#333', margin: 0 }}>Total Items: <strong>{items.reduce((s, i) => s + i.quantity, 0)}</strong></p>
        <p style={{ fontSize: '11pt', fontWeight: 700, color: cfg.primaryColor, margin: '4px 0 0' }}>Total: ${total.toFixed(2)}</p>
      </div>

      {/* Optional fields */}
      {cfg.showOrderNotes && (
        <div style={{ backgroundColor: '#f9f9f9', borderRadius: '4px', padding: '0.1in', marginBottom: '0.15in', fontSize: '8pt', color: '#888' }}>
          <span style={{ fontWeight: 600 }}>Order Notes:</span> \u2014
        </div>
      )}

      {cfg.showPickListInfo && (
        <div style={{ fontSize: '8pt', color: '#888', marginBottom: '0.15in' }}>
          <p style={{ margin: 0 }}><strong>Bin:</strong> \u2014</p>
        </div>
      )}

      {/* Thank you */}
      {cfg.showThankYou && (
        <div style={{ textAlign: 'center', padding: '0.12in', borderRadius: '6px', backgroundColor: (cfg.accentColor || '#fda4af') + '30', color: cfg.primaryColor, fontSize: '10pt', fontWeight: 600, marginBottom: '0.1in' }}>
          {cfg.thankYouMessage || 'Thank you for your order! \u2764\uFE0F'}
        </div>
      )}

      {cfg.showSocialMedia && (
        <div style={{ textAlign: 'center', fontSize: '8pt', color: '#888', marginBottom: '0.1in' }}>
          Follow us @ {cfg.socialHandles || 'yourbrand'}
        </div>
      )}

      {cfg.showBarcode && (
        <div style={{ textAlign: 'center', marginBottom: '0.1in' }}>
          <div style={{ display: 'inline-block', height: '0.4in', width: '2in', background: '#eee', borderRadius: '4px', fontSize: '7pt', color: '#999', lineHeight: '0.4in' }}>
            |||||||||||||||||||||||||||
          </div>
        </div>
      )}

      {cfg.showPackedBy && (
        <p style={{ fontSize: '7pt', color: '#aaa', textAlign: 'right', margin: 0 }}>Packed by: __</p>
      )}
    </div>
  );
}

// ── Print Modal ───────────────────────────────────────────────────
export default function PrintModal({ data, onClose }: { data: PrintData; onClose: () => void }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto pt-10 pb-10 noprint">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 my-auto z-10">
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 noprint-header">
          <h3 className="text-lg font-semibold text-neutral-800">
            {data.printType === 'shipping_label' ? '\uD83D\uDCE6 Shipping Label' : '\uD83D\uDCCB Packing Slip'}
            {' \u2014 Order #'}{data.order.orderNumber}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-rose-500 text-white rounded-lg text-sm font-medium hover:bg-rose-600 transition-colors"
            >
              \uD83D\uDD8C\uFE0F Print
            </button>
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-neutral-600 transition-colors text-lg"
            >
              \u2715
            </button>
          </div>
        </div>
        <div className="p-6 bg-white">
          {data.printType === 'shipping_label' ? (
            <PrintableShippingLabel data={data} />
          ) : (
            <PrintablePackingSlip data={data} />
          )}
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-neutral-200 noprint-footer">
          <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800">Close</button>
          <button onClick={handlePrint} className="px-4 py-2 bg-rose-500 text-white rounded-lg text-sm font-medium hover:bg-rose-600 transition-colors">
            \uD83D\uDD8C\uFE0F Print
          </button>
        </div>
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-only, .print-only * {
            visibility: visible !important;
          }
          .print-only {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          @page {
            size: ${data.printType === 'shipping_label' ? '4in 6in' : 'letter'};
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
