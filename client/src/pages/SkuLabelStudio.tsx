import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Novi from "../components/Novi";
import { Button, ErrorBanner, PageHeader, Skeleton, useToast } from "../components/ui";
import { apiGet, apiPost, apiPut } from "../lib/api";

type StudioItem = {
  id: number;
  product_id: number;
  product_name: string;
  variant_value: string;
  sku: string | null;
  barcode: string | null;
  internal_barcode: string | null;
  proposedSku?: string | null;
  status?: "novi_generated" | "already_existed" | "needs_review";
  missingSku: boolean;
  missingBarcode: boolean;
  duplicateSku: boolean;
  duplicateBarcode: boolean;
  needsReview: boolean;
  ready: boolean;
  stock_count: number;
  price: number | null;
};

type StudioData = {
  audit: {
    total: number;
    missingSkus: number;
    missingBarcodes: number;
    duplicateSkus: number;
    duplicateBarcodes: number;
    ready: number;
    needsReview: number;
    items: StudioItem[];
  };
  recommendation: { recognized: boolean; message: string; settings: StudioSettings };
  settings: StudioSettings;
  shopifyMode: "readonly" | "writeback";
  shopDomain: string | null;
};

type StudioSettings = {
  skuPattern: string;
  separator: string;
  letterCase: "upper" | "lower";
  numberStart: number;
  numberPadding: number;
  preserveExisting: boolean;
  writebackEnabled?: boolean;
  preferredLabelSize: string;
  labelFields: string[];
};

type ScanResult = {
  status: "found" | "ambiguous" | "not_found";
  match?: StudioItem & { product_name: string; variant_value: string; stock_count: number };
  matches?: Array<StudioItem & { product_name: string; variant_value: string; stock_count: number }>;
};

const LABEL_SIZES: Record<string, { label: string; width: number; height: number }> = {
  "2x1": { label: "2 x 1 inch", width: 2, height: 1 },
  "2.25x1.25": { label: "2.25 x 1.25 inch", width: 2.25, height: 1.25 },
  "3x2": { label: "3 x 2 inch", width: 3, height: 2 },
  "4x2": { label: "4 x 2 inch", width: 4, height: 2 },
};

const STATUS_STYLES: Record<string, string> = {
  novi_generated: "bg-purple-50 text-purple-700 border-purple-200",
  already_existed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  needs_review: "bg-amber-50 text-amber-800 border-amber-200",
};

export default function SkuLabelStudio() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const scanRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<StudioData | null>(null);
  const [items, setItems] = useState<StudioItem[]>([]);
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customize, setCustomize] = useState(false);
  const [stage, setStage] = useState<"welcome" | "review" | "save" | "print" | "complete" | "scan">("welcome");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [resultSummary, setResultSummary] = useState<{ skus: number; barcodes: number; preserved: number } | null>(null);
  const [printQuantity, setPrintQuantity] = useState(1);
  const [testPrinted, setTestPrinted] = useState(false);
  const [customText, setCustomText] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await apiGet<StudioData>("/api/sku-label-studio");
      setData(response);
      setSettings(response.settings);
      setItems(response.audit.items);
      setSelected(new Set(response.audit.items.filter(item => !item.needsReview).map(item => item.id)));
      setError(null);
    } catch (loadError: any) {
      setError(loadError.message || "I couldn't check your catalog just yet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function prepareRecommendation() {
    if (!data || !settings) return;
    setWorking(true);
    try {
      const preview = await apiPost<{ items: StudioItem[]; settings: StudioSettings }>("/api/sku-label-studio/preview", settings);
      setItems(preview.items);
      setSettings(preview.settings);
      setSelected(new Set(preview.items.filter(item => !item.needsReview).map(item => item.id)));
      setStage("review");
    } catch (prepareError: any) {
      toast(prepareError.message, "error");
    } finally {
      setWorking(false);
    }
  }

  function updateItem(id: number, field: "proposedSku" | "barcode", value: string) {
    setItems(current => current.map(item => item.id === id ? { ...item, [field]: value, needsReview: false, status: "novi_generated" } : item));
    setSelected(current => new Set(current).add(id));
  }

  async function materializeInternalBarcodes(chosen: StudioItem[]) {
    const next = [...items];
    for (const item of chosen) {
      if (!item.barcode && !item.internal_barcode) {
        const response = await apiPost<{ barcode: string }>(`/api/sku-label-studio/internal-barcodes/${item.id}`);
        const index = next.findIndex(candidate => candidate.id === item.id);
        next[index] = { ...next[index], internal_barcode: response.barcode, barcode: response.barcode };
      }
    }
    setItems(next);
    return next.filter(item => selected.has(item.id));
  }

  async function save(destination: "local" | "shopify" | "print") {
    if (!settings) return;
    const chosen = items.filter(item => selected.has(item.id));
    if (chosen.length === 0) return toast("Choose at least one ready item.", "warning");
    setWorking(true);
    try {
      const prepared = await materializeInternalBarcodes(chosen);
      const payloadItems = prepared.map(item => ({
        variantId: item.id,
        sku: item.proposedSku ?? item.sku,
        barcode: item.barcode ?? item.internal_barcode,
        generateInternalBarcode: !item.barcode && !item.internal_barcode,
        replaceSku: Boolean(item.sku && item.proposedSku !== item.sku),
        replaceBarcode: false,
      }));
      if (destination === "shopify") {
        if (data?.shopifyMode !== "writeback") {
          if (!data?.shopDomain) throw new Error("Connect Shopify before requesting Product Editing permission.");
          const auth = await apiGet<{ authUrl: string }>(`/api/shopify/auth?shop=${encodeURIComponent(data.shopDomain)}&format=json&capability=product_writeback`);
          window.location.href = auth.authUrl;
          return;
        }
        const writeSettings = { ...settings, writebackEnabled: true };
        await apiPut("/api/sku-label-studio/settings", writeSettings);
        const preview = await apiPost<{ id: string }>("/api/sku-label-studio/shopify-preview", { items: payloadItems, accepted: true });
        if (!window.confirm("Update only these approved SKUs and barcodes in Shopify? Nothing else in your store will change.")) return;
        const result = await apiPost<{ updated: number; failed: number }>("/api/sku-label-studio/shopify-writeback", {
          previewId: preview.id,
          confirmation: "UPDATE SHOPIFY",
        });
        if (result.failed) toast(`${result.updated} updated and ${result.failed} need review.`, "warning");
      } else {
        await apiPost("/api/sku-label-studio/save-local", { items: payloadItems, settings });
      }
      const createdSkus = chosen.filter(item => item.missingSku).length;
      const createdBarcodes = chosen.filter(item => item.missingBarcode).length;
      const preserved = chosen.filter(item => Boolean(item.barcode) && !item.missingBarcode).length;
      setResultSummary({ skus: createdSkus, barcodes: createdBarcodes, preserved });
      setStage(destination === "print" ? "print" : "complete");
      await load();
    } catch (saveError: any) {
      toast(saveError.message || "Nothing was saved.", "error");
    } finally {
      setWorking(false);
    }
  }

  async function printLabels(isTest: boolean) {
    if (!settings) return;
    const printable = items.filter(item => selected.has(item.id) && (item.barcode || item.internal_barcode));
    if (printable.length === 0) return toast("Save at least one barcode before printing.", "warning");
    try {
      let templates = await apiGet<any[]>("/api/sku-label-studio/templates");
      let templateId = templates[0]?.id;
      if (!templateId) {
        const template = await apiPost<{ id: number }>("/api/sku-label-studio/templates", {
          name: `Novi ${LABEL_SIZES[settings.preferredLabelSize].label}`,
          size: settings.preferredLabelSize,
          fields: settings.labelFields,
          customText,
          isDefault: true,
        });
        templateId = template.id;
      } else {
        await apiPut(`/api/sku-label-studio/templates/${templateId}`, {
          name: `Novi ${LABEL_SIZES[settings.preferredLabelSize].label}`,
          size: settings.preferredLabelSize,
          fields: settings.labelFields,
          customText,
          isDefault: true,
        });
      }
      const printItems = (isTest ? printable.slice(0, 1) : printable).map(item => ({ variantId: item.id, quantity: isTest ? 1 : printQuantity }));
      await apiPost("/api/sku-label-studio/print-jobs", { templateId, items: printItems, isTest });
      window.print();
      if (isTest) setTestPrinted(true);
    } catch (printError: any) {
      toast(printError.message, "error");
    }
  }

  async function scan(event: React.FormEvent) {
    event.preventDefault();
    if (!scanValue.trim()) return;
    try {
      setScanResult(await apiPost<ScanResult>("/api/sku-label-studio/scan", { value: scanValue.trim() }));
    } catch (scanError: any) {
      setScanResult({ status: scanError.message.includes("Ambiguous") ? "ambiguous" : "not_found", matches: [] });
    }
    setScanValue("");
    requestAnimationFrame(() => scanRef.current?.focus());
  }

  if (loading) return <div className="space-y-4"><Skeleton variant="text" /><Skeleton variant="card" /><Skeleton variant="table-row" /></div>;
  if (error || !data || !settings) return <ErrorBanner message={error || "Catalog check unavailable"} onRetry={load} />;

  const reviewReady = items.filter(item => !item.needsReview).length;
  const examples = items.filter(item => item.proposedSku && item.proposedSku !== item.sku).slice(0, 5);
  const labelSize = LABEL_SIZES[settings.preferredLabelSize] || LABEL_SIZES["2x1"];
  const printable = items.filter(item => selected.has(item.id) && (item.barcode || item.internal_barcode));

  return (
    <div className="space-y-5 sku-label-studio">
      <PageHeader title="Novi SKU & Label Studio" description="A clean, scan-ready catalog without the busywork" novi={<Novi size="sm" expression="focused" accessory="warehouse" />} actions={<Button variant="secondary" onClick={() => { setStage("scan"); setTimeout(() => scanRef.current?.focus(), 0); }}>Scan Something</Button>} />

      {stage === "welcome" && (
        <section className="bg-white border border-purple-100 rounded-lg overflow-hidden shadow-sm">
          <div className="p-5 sm:p-7 bg-gradient-to-r from-purple-50 via-white to-emerald-50 flex flex-col sm:flex-row gap-5 items-start">
            <Novi size="lg" expression={data.audit.missingSkus || data.audit.missingBarcodes ? "curious" : "proud"} accessory="warehouse" />
            <div className="flex-1">
              <h2 className="text-xl font-bold text-neutral-900">Your catalog check is ready.</h2>
              <p className="mt-1 text-neutral-600">I found {data.audit.total} variants. I won't change anything until you approve it.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                <Summary value={data.audit.missingSkus} label="missing SKUs" tone="purple" />
                <Summary value={data.audit.missingBarcodes} label="need barcodes" tone="amber" />
                <Summary value={data.audit.ready} label="already label-ready" tone="green" />
              </div>
              <p className="mt-5 font-medium text-neutral-800">Want me to set up the rest?</p>
              <div className="flex flex-wrap gap-3 mt-3">
                <Button size="lg" loading={working} onClick={prepareRecommendation}>Yes, set them up</Button>
                <Button size="lg" variant="outline" onClick={() => setStage("review")}>Review first</Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {(stage === "review" || stage === "save") && (
        <>
          <section className="bg-white border border-purple-100 rounded-lg p-5 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-purple-600">Novi Quick Setup</p>
                <h2 className="text-lg font-bold text-neutral-900 mt-1">{data.recommendation.message}</h2>
                <p className="text-sm text-neutral-600 mt-1">Good existing identifiers stay exactly as they are. I'll focus your attention on exceptions.</p>
              </div>
              <div className="flex gap-2"><Button onClick={prepareRecommendation}>Use Novi's recommendation</Button><Button variant="outline" onClick={() => setCustomize(value => !value)}>Customize</Button></div>
            </div>
            {examples.length > 0 && <div className="flex flex-wrap gap-2 mt-4">{examples.map(item => <code key={item.id} className="px-3 py-1.5 bg-purple-50 text-purple-800 rounded-md text-xs">{item.proposedSku}</code>)}</div>}
            {customize && (
              <div className="grid sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-neutral-100">
                <label className="sm:col-span-2 text-sm font-medium">SKU pattern<input value={settings.skuPattern} onChange={event => setSettings({ ...settings, skuPattern: event.target.value })} className="mt-1 w-full border border-neutral-300 rounded-md px-3 py-2 font-mono" /></label>
                <label className="text-sm font-medium">Separator<select value={settings.separator} onChange={event => setSettings({ ...settings, separator: event.target.value })} className="mt-1 w-full border border-neutral-300 rounded-md px-3 py-2"><option value="-">Dash</option><option value="_">Underscore</option><option value=".">Dot</option></select></label>
                <label className="text-sm font-medium">Letter style<select value={settings.letterCase} onChange={event => setSettings({ ...settings, letterCase: event.target.value as "upper" | "lower" })} className="mt-1 w-full border border-neutral-300 rounded-md px-3 py-2"><option value="upper">UPPERCASE</option><option value="lower">lowercase</option></select></label>
                <fieldset className="sm:col-span-4"><legend className="text-sm font-semibold">Label fields</legend><div className="flex flex-wrap gap-3 mt-2">{["product", "variant", "sku", "barcode", "price", "bin", "business"].map(field => <label key={field} className="text-sm flex items-center gap-1.5"><input type="checkbox" checked={settings.labelFields.includes(field)} onChange={event => setSettings({ ...settings, labelFields: event.target.checked ? [...settings.labelFields, field] : settings.labelFields.filter(value => value !== field) })} />{field[0].toUpperCase() + field.slice(1)}</label>)}</div></fieldset>
                <label className="sm:col-span-4 text-sm font-medium">Short custom text<input value={customText} maxLength={80} onChange={event => setCustomText(event.target.value)} placeholder="Optional message" className="mt-1 w-full border border-neutral-300 rounded-md px-3 py-2" /></label>
              </div>
            )}
          </section>

          <section className="bg-white border border-neutral-200 rounded-lg overflow-hidden shadow-sm">
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100">
              <div><h2 className="font-bold text-neutral-900">{items.length} variants <span className="text-emerald-600">{reviewReady} ready</span> <span className="text-amber-700">{items.length - reviewReady} need review</span></h2><p className="text-sm text-neutral-500">Internal barcodes are for your labels and operations. They are not retail UPCs or GTINs.</p></div>
              <Button onClick={() => setStage("save")}>Approve {selected.size} Ready Items</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-500"><tr><th className="p-3 text-left">Use</th><th className="p-3 text-left">Product</th><th className="p-3 text-left">Variant</th><th className="p-3 text-left">SKU</th><th className="p-3 text-left">Barcode</th><th className="p-3 text-left">Status</th></tr></thead>
                <tbody className="divide-y divide-neutral-100">{items.map(item => <tr key={item.id} className={item.needsReview ? "bg-amber-50/40" : ""}>
                  <td className="p-3"><input type="checkbox" checked={selected.has(item.id)} onChange={event => setSelected(current => { const next = new Set(current); event.target.checked ? next.add(item.id) : next.delete(item.id); return next; })} aria-label={`Select ${item.product_name} ${item.variant_value}`} /></td>
                  <td className="p-3 text-sm font-semibold text-neutral-900">{item.product_name}</td><td className="p-3 text-sm text-neutral-600">{item.variant_value}</td>
                  <td className="p-3"><input value={item.proposedSku ?? item.sku ?? ""} onChange={event => updateItem(item.id, "proposedSku", event.target.value)} className="w-48 px-2 py-1.5 border border-neutral-300 rounded font-mono text-xs" /></td>
                  <td className="p-3"><input value={item.barcode ?? item.internal_barcode ?? "Internal barcode on save"} onChange={event => updateItem(item.id, "barcode", event.target.value)} className="w-48 px-2 py-1.5 border border-neutral-300 rounded font-mono text-xs" aria-label={`Barcode for ${item.product_name}`} /></td>
                  <td className="p-3"><span className={`inline-flex px-2 py-1 rounded border text-xs font-semibold ${STATUS_STYLES[item.needsReview ? "needs_review" : item.status || "already_existed"]}`}>{item.needsReview ? "Needs review" : item.status === "novi_generated" ? "Novi generated" : "Already existed"}</span></td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>

          {stage === "save" && <section className="bg-neutral-900 text-white rounded-lg p-6"><div className="max-w-3xl"><p className="text-emerald-300 text-sm font-bold uppercase">One last decision</p><h2 className="text-2xl font-bold mt-1">Where should I save these?</h2><p className="text-neutral-300 mt-2">Nothing goes back to Shopify unless you choose it and confirm the exact preview.</p><div className="grid md:grid-cols-3 gap-3 mt-5"><SaveChoice title="ShimmerStock only" text="No Shopify changes." onClick={() => save("local")} disabled={working} /><SaveChoice title="ShimmerStock + Shopify" text={data.shopifyMode === "writeback" ? "Update approved product identifiers too." : "Grant Product Editing permission first."} onClick={() => save("shopify")} disabled={working} /><SaveChoice title="Save now and print" text="Save locally, then print labels." onClick={() => save("print")} disabled={working} /></div></div></section>}
        </>
      )}

      {stage === "print" && <section className="bg-white border border-emerald-200 rounded-lg p-5 shadow-sm"><div className="flex flex-col lg:flex-row gap-6"><div className="flex-1"><p className="text-emerald-700 font-bold">Labels are ready. What are we printing?</p><h2 className="text-xl font-bold mt-1">Start with one test label.</h2><p className="text-neutral-600 mt-1">Let's make sure your printer sizing looks right before the full batch.</p><label className="block mt-5 text-sm font-semibold">Label size<select value={settings.preferredLabelSize} onChange={event => setSettings({ ...settings, preferredLabelSize: event.target.value })} className="mt-1 block w-full max-w-xs border rounded-md px-3 py-2">{Object.entries(LABEL_SIZES).map(([value, size]) => <option key={value} value={value}>{size.label}</option>)}</select></label><label className="block mt-4 text-sm font-semibold">Copies per item<input type="number" min="1" max="1000" value={printQuantity} onChange={event => setPrintQuantity(Math.max(1, Number(event.target.value)))} className="mt-1 block w-28 border rounded-md px-3 py-2" /></label><div className="flex flex-wrap gap-3 mt-5"><Button onClick={() => printLabels(true)}>Print one test label</Button>{testPrinted && <Button variant="secondary" onClick={() => printLabels(false)}>Looks good — Print {printable.length * printQuantity}</Button>}<Button variant="outline" onClick={() => setCustomize(true)}>Adjust size</Button></div></div><LabelPreview item={printable[0]} size={labelSize} fields={settings.labelFields} customText={customText} /></div></section>}

      {stage === "complete" && resultSummary && <section className="bg-white border border-emerald-200 rounded-lg p-7 text-center shadow-sm"><Novi size="lg" expression="celebrating" accessory="warehouse" /><h2 className="text-2xl font-bold text-neutral-900 mt-3">You're label-ready!</h2><p className="text-neutral-600 mt-2">{selected.size} variants checked · {resultSummary.skus} SKUs created · {resultSummary.barcodes} internal barcodes created · {resultSummary.preserved} retail barcodes preserved</p><p className="text-sm font-medium text-emerald-700 mt-3">Nothing was changed in Shopify without your approval.</p><div className="flex flex-wrap justify-center gap-3 mt-6"><Button onClick={() => setStage("print")}>Print Labels</Button><Button variant="secondary" onClick={() => setStage("scan")}>Scan a Product</Button><Button variant="outline" onClick={() => navigate("/products")}>View Products</Button><Button variant="ghost" onClick={() => navigate("/products")}>Done</Button></div></section>}

      {stage === "scan" && <section className="bg-white border border-purple-100 rounded-lg p-5 shadow-sm"><div className="flex items-start gap-4"><Novi size="md" expression="focused" accessory="warehouse" /><div className="flex-1"><h2 className="text-xl font-bold">Scan Something</h2><p className="text-sm text-neutral-600">USB and Bluetooth scanners work automatically when they type a code and press Enter.</p><form onSubmit={scan} className="flex gap-2 mt-4"><input ref={scanRef} value={scanValue} onChange={event => setScanValue(event.target.value)} placeholder="Scan or type a barcode or SKU" className="flex-1 min-w-0 border-2 border-purple-200 rounded-md px-4 py-3 font-mono focus:border-purple-500 outline-none" autoFocus /><Button type="submit">Find Item</Button></form>{scanResult?.status === "found" && scanResult.match && <ScanMatch item={scanResult.match} navigate={navigate} />}{scanResult?.status === "ambiguous" && <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-md"><p className="font-semibold text-amber-900">I found more than one legacy match, so I won't guess.</p><p className="text-sm text-amber-800">Choose the exact product from the matching records.</p></div>}{scanResult?.status === "not_found" && <p className="mt-4 text-sm text-neutral-600">I couldn't find that code in this workspace.</p>}</div></div></section>}

      <div className="print-label-sheet">{printable.flatMap(item => Array.from({ length: printQuantity }, (_, index) => <LabelPreview key={`${item.id}-${index}`} item={item} size={labelSize} fields={settings.labelFields} customText={customText} print />))}</div>
      <style>{`@media print { body * { visibility: hidden !important; } .print-label-sheet, .print-label-sheet * { visibility: visible !important; } .print-label-sheet { display: grid !important; position: absolute; inset: 0; gap: 0; } .thermal-label { break-after: page; } @page { size: ${labelSize.width}in ${labelSize.height}in; margin: 0; } } @media screen { .print-label-sheet { display: none; } }`}</style>
    </div>
  );
}

function Summary({ value, label, tone }: { value: number; label: string; tone: "purple" | "amber" | "green" }) {
  const colors = { purple: "bg-purple-50 text-purple-800", amber: "bg-amber-50 text-amber-800", green: "bg-emerald-50 text-emerald-800" };
  return <div className={`rounded-md px-4 py-3 ${colors[tone]}`}><strong className="text-2xl">{value}</strong><span className="block text-sm">{label}</span></div>;
}

function SaveChoice({ title, text, onClick, disabled }: { title: string; text: string; onClick: () => void; disabled: boolean }) {
  return <button disabled={disabled} onClick={onClick} className="text-left border border-neutral-700 hover:border-emerald-400 rounded-md p-4 disabled:opacity-50"><strong className="block text-white">{title}</strong><span className="block text-sm text-neutral-400 mt-1">{text}</span></button>;
}

function LabelPreview({ item, size, fields, customText, print = false }: { item?: StudioItem; size: { width: number; height: number }; fields: string[]; customText: string; print?: boolean }) {
  return <div className={print ? "thermal-label" : "bg-neutral-100 rounded-md p-5 flex items-center justify-center"}><div className="bg-white text-black overflow-hidden flex flex-col justify-between" style={{ width: `${size.width}in`, height: `${size.height}in`, padding: "0.08in", boxSizing: "border-box", border: print ? "none" : "1px solid #d4d4d4" }}><div className="min-w-0">{fields.includes("product") && <p style={{ fontSize: "9pt", fontWeight: 700, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item?.product_name || "Product name"}</p>}<p style={{ fontSize: "7pt", margin: 0 }}>{fields.includes("variant") ? item?.variant_value || "Variant" : ""}{fields.includes("sku") ? ` · ${item?.proposedSku || item?.sku || "SKU"}` : ""}{fields.includes("price") && item?.price != null ? ` · $${Number(item.price).toFixed(2)}` : ""}</p>{customText && <p style={{ fontSize: "6pt", margin: 0 }}>{customText}</p>}</div>{fields.includes("barcode") && item && (item.barcode || item.internal_barcode) ? <img src={`/api/sku-label-studio/barcodes/${item.id}.svg`} alt={`Code 128 barcode ${item.barcode || item.internal_barcode}`} style={{ width: "100%", maxHeight: "55%", objectFit: "contain" }} /> : <div style={{ height: "20%" }} />}</div></div>;
}

function ScanMatch({ item, navigate }: { item: StudioItem; navigate: ReturnType<typeof useNavigate> }) {
  return <div className="mt-5 border border-emerald-200 bg-emerald-50 rounded-lg p-5"><p className="text-emerald-800 font-medium">Found it — {item.product_name}, {item.variant_value}. You have {item.stock_count} available.</p><div className="grid sm:grid-cols-4 gap-3 mt-4"><div><span className="text-xs text-neutral-500">SKU</span><p className="font-mono text-sm">{item.sku || "Not set"}</p></div><div><span className="text-xs text-neutral-500">Available</span><p className="font-bold">{item.stock_count}</p></div><div><span className="text-xs text-neutral-500">Bin / location</span><p>Not assigned</p></div></div><div className="flex flex-wrap gap-2 mt-5"><Button onClick={() => navigate(`/products/${item.product_id}`)}>View Product</Button><Button variant="secondary" onClick={() => navigate("/scan")}>Adjust Inventory</Button><Button variant="secondary" onClick={() => navigate("/warehouse")}>Move Location</Button><Button variant="secondary" onClick={() => navigate("/production")}>Production</Button><Button variant="secondary" onClick={() => navigate("/fulfillment")}>Pack Order</Button></div></div>;
}