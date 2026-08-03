import { useState, useEffect, useCallback } from "react";
import Novi from "../components/Novi";
import { PageHeader, Button, Skeleton, EmptyState, ErrorBanner, useToast } from "../components/ui";

// ── Types ──────────────────────────────────────────────────────────────
interface StudioTemplate {
  id: number;
  business_id: number;
  name: string;
  type: string;
  layout: any;
  created_at: string;
}

interface StudioAsset {
  id: number;
  business_id: number;
  template_id: number | null;
  product_id: number | null;
  type: string;
  title: string;
  html_content: string;
  created_at: string;
  template_name?: string;
  product_name?: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  price: number | null;
}

interface BrandSettings {
  brandColors: string[];
  brandLogoUrl: string | null;
  brandFont: string;
}

const TYPE_LABELS: Record<string, string> = {
  product_graphics: "Product Graphics",
  social_post: "Social Post",
  email_banner: "Email Banner",
  launch_asset: "Launch Asset",
};

const TYPE_ICONS: Record<string, string> = {
  product_graphics: "📸",
  social_post: "📱",
  email_banner: "📧",
  launch_asset: "🚀",
};

const TYPE_SIZES: Record<string, string> = {
  product_graphics: "800×800",
  social_post: "1080×1080",
  email_banner: "600×200",
  launch_asset: "1200×630",
};

// ── API helpers ────────────────────────────────────────────────────────
function apiHeaders() {
  const token = localStorage.getItem("shimmerstock_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = "Bearer " + token;
  }
  return headers;
}

export default function Studio() {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("generate");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate tab state
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [headline, setHeadline] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [cta, setCta] = useState("Shop Now");
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Saved assets
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);

  // Brand settings
  const [brandSettings, setBrandSettings] = useState<BrandSettings | null>(null);
  const [brandColors, setBrandColors] = useState(["#f43f5e", "#fda4af", "#fff1f2"]);
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [brandFont, setBrandFont] = useState("Inter");
  const [savingBrand, setSavingBrand] = useState(false);

  // Template form
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateType, setNewTemplateType] = useState("social_post");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // ── Load data ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [templatesRes, productsRes, assetsRes, brandRes] = await Promise.all([
        fetch("/api/studio/templates", { headers: apiHeaders() }),
        fetch("/api/studio/products", { headers: apiHeaders() }),
        fetch("/api/studio/assets", { headers: apiHeaders() }),
        fetch("/api/studio/brand", { headers: apiHeaders() }),
      ]);

      if (!templatesRes.ok || !productsRes.ok || !assetsRes.ok || !brandRes.ok) {
        throw new Error("Failed to load studio data");
      }

      const templatesData = await templatesRes.json();
      const productsData = await productsRes.json();
      const assetsData = await assetsRes.json();
      const brandData = await brandRes.json();

      setTemplates(templatesData);
      setProducts(productsData);
      setAssets(assetsData);
      setBrandSettings(brandData);
      setBrandColors(brandData.brandColors?.length ? brandData.brandColors : ["#f43f5e", "#fda4af", "#fff1f2"]);
      setBrandLogoUrl(brandData.brandLogoUrl || "");
      setBrandFont(brandData.brandFont || "Inter");

      // Auto-select first template and product
      if (templatesData.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(templatesData[0].id);
      }
      if (productsData.length > 0 && !selectedProductId) {
        setSelectedProductId(productsData[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load studio data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const res = await fetch("/api/studio/assets", { headers: apiHeaders() });
      if (res.ok) setAssets(await res.json());
    } catch {}
    setAssetsLoading(false);
  }, []);

  // ── Generate asset ───────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          template_id: selectedTemplateId,
          product_id: selectedProductId,
          text_overrides: {
            headline: headline || undefined,
            subtitle: subtitle || undefined,
            cta: cta || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setGeneratedHtml(data.html);
      toast("Asset generated!", "success");
    } catch (err: any) {
      toast(err.message, "error");
    }
    setGenerating(false);
  }

  // ── Save asset ───────────────────────────────────────────────────────
  async function handleSaveAsset() {
    if (!generatedHtml) return;
    try {
      const selectedProduct = products.find((p) => p.id === selectedProductId);
      const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
      const assetType = selectedTemplate?.type || "social_post";
      const assetTitle = headline || selectedProduct?.name || "Untitled Asset";

      const res = await fetch("/api/studio/assets", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          template_id: selectedTemplateId,
          product_id: selectedProductId,
          type: assetType,
          title: assetTitle,
          html_content: generatedHtml,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      toast("Asset saved!", "success");
      loadAssets();
    } catch (err: any) {
      toast(err.message, "error");
    }
  }

  // ── Delete asset ─────────────────────────────────────────────────────
  async function handleDeleteAsset(id: number) {
    try {
      const res = await fetch(`/api/studio/assets/${id}`, {
        method: "DELETE",
        headers: apiHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete");
      setAssets((prev) => prev.filter((a) => a.id !== id));
      toast("Asset deleted", "success");
    } catch (err: any) {
      toast(err.message, "error");
    }
  }

  // ── Create template ──────────────────────────────────────────────────
  async function handleCreateTemplate() {
    if (!newTemplateName.trim()) return;
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/studio/templates", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          name: newTemplateName.trim(),
          type: newTemplateType,
          layout: {},
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create");
      }
      const created = await res.json();
      setTemplates((prev) => [created, ...prev]);
      setNewTemplateName("");
      setShowNewTemplate(false);
      toast("Template created!", "success");
    } catch (err: any) {
      toast(err.message, "error");
    }
    setSavingTemplate(false);
  }

  // ── Save brand settings ──────────────────────────────────────────────
  async function handleSaveBrand() {
    setSavingBrand(true);
    try {
      const res = await fetch("/api/studio/brand", {
        method: "PUT",
        headers: apiHeaders(),
        body: JSON.stringify({
          brandColors,
          brandLogoUrl: brandLogoUrl || null,
          brandFont,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setBrandSettings({ brandColors, brandLogoUrl: brandLogoUrl || null, brandFont });
      toast("Brand settings saved!", "success");
    } catch (err: any) {
      toast(err.message, "error");
    }
    setSavingBrand(false);
  }

  // ── Color input ──────────────────────────────────────────────────────
  function updateBrandColor(index: number, value: string) {
    const updated = [...brandColors];
    updated[index] = value;
    setBrandColors(updated);
  }

  // ── Render helpers ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeader title="Studio" icon="🎨" subtitle="Creative workspace for marketing assets" />
        <Skeleton lines={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeader title="Studio" icon="🎨" subtitle="Creative workspace for marketing assets" />
        <ErrorBanner message={error} onRetry={loadData} />
      </div>
    );
  }

  // Choose preview width based on type
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  return (
    <div className="max-w-6xl mx-auto">
      {/* Page Header with Novi */}
      <div className="flex items-center gap-4 mb-6">
        <Novi expression="happy" size="sm" accessory="marketing" />
        <div>
          <h1 className="text-2xl font-bold text-neutral-800 flex items-center gap-2">
            <span className="text-3xl">🎨</span> Studio
          </h1>
          <p className="text-sm text-neutral-500">Creative workspace for marketing assets</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-neutral-200">
        {[
          { key: "generate", label: "🎨 Generate" },
          { key: "templates", label: "📋 Templates" },
          { key: "assets", label: "💾 Saved Assets" },
          { key: "brand", label: "🎯 Brand" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-rose-500 text-rose-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Generate ─────────────────────────────────────────────── */}
      {activeTab === "generate" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Controls */}
          <div className="lg:col-span-1 space-y-4">
            {/* Template Selector */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Template</label>
              <select
                value={selectedTemplateId || ""}
                onChange={(e) => setSelectedTemplateId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {TYPE_ICONS[t.type]} {t.name} ({TYPE_LABELS[t.type]})
                  </option>
                ))}
              </select>
              {selectedTemplate && (
                <p className="text-xs text-neutral-400 mt-1">
                  {TYPE_SIZES[selectedTemplate.type]} template
                </p>
              )}
            </div>

            {/* Product Selector */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Product</label>
              <select
                value={selectedProductId || ""}
                onChange={(e) => setSelectedProductId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              >
                <option value="">No product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.price ? `($${p.price.toFixed(2)})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Text Overrides */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Headline</label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder={products.find((p) => p.id === selectedProductId)?.name || "Product headline"}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Subtitle / Price</label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="$19.99"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">CTA Text</label>
              <input
                type="text"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="Shop Now"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            <Button onClick={handleGenerate} loading={generating} variant="primary" className="w-full">
              ✨ Generate Asset
            </Button>
          </div>

          {/* Right: Preview */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-600">Preview</span>
                {generatedHtml && (
                  <Button onClick={handleSaveAsset} variant="secondary" size="sm">
                    💾 Save Asset
                  </Button>
                )}
              </div>
              <div className="p-4 flex items-center justify-center min-h-[400px] bg-neutral-50/50">
                {!generatedHtml && !generating && (
                  <EmptyState
                    icon="🎨"
                    title="Generate an Asset"
                    description="Select a template, pick a product, and click generate to see a preview."
                  />
                )}
                {generating && (
                  <div className="text-center">
                    <Novi expression="thinking" size="lg" animated />
                    <p className="text-neutral-500 mt-2">Generating your asset...</p>
                  </div>
                )}
                {generatedHtml && (
                  <div
                    className="shadow-lg rounded-lg overflow-hidden border border-neutral-200"
                    style={{ maxWidth: "100%" }}
                    dangerouslySetInnerHTML={{ __html: generatedHtml }}
                  />
                )}
              </div>
            </div>

            {/* Color palette indicator */}
            {brandSettings && (
              <div className="mt-4 flex items-center gap-2 text-xs text-neutral-400">
                <span>Brand colors:</span>
                {brandSettings.brandColors.map((c, i) => (
                  <span
                    key={i}
                    className="inline-block w-4 h-4 rounded-full border border-neutral-200"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Templates ────────────────────────────────────────────── */}
      {activeTab === "templates" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-neutral-800">Templates</h2>
            <Button onClick={() => setShowNewTemplate(!showNewTemplate)} variant="primary" size="sm">
              + New Template
            </Button>
          </div>

          {/* New Template Form */}
          {showNewTemplate && (
            <div className="mb-6 p-4 border border-rose-200 rounded-xl bg-rose-50/50">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Template name"
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
                <select
                  value={newTemplateType}
                  onChange={(e) => setNewTemplateType(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                >
                  {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <Button onClick={handleCreateTemplate} loading={savingTemplate} variant="primary" size="sm">
                  Create
                </Button>
              </div>
            </div>
          )}

          {templates.length === 0 ? (
            <EmptyState icon="📋" title="No Templates" description="Create your first template to start generating assets." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="p-4 border border-neutral-200 rounded-xl hover:border-rose-200 hover:shadow-sm transition-all bg-white"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{TYPE_ICONS[t.type]}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-neutral-800 truncate">{t.name}</h3>
                      <p className="text-xs text-neutral-400">{TYPE_LABELS[t.type]} · {TYPE_SIZES[t.type]}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Saved Assets ──────────────────────────────────────────── */}
      {activeTab === "assets" && (
        <div>
          <h2 className="text-lg font-semibold text-neutral-800 mb-4">Saved Assets</h2>
          {assetsLoading ? (
            <Skeleton lines={4} />
          ) : assets.length === 0 ? (
            <EmptyState
              icon="💾"
              title="No Saved Assets"
              description="Generate and save assets to build your creative library."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="border border-neutral-200 rounded-xl overflow-hidden bg-white hover:shadow-md transition-all group"
                >
                  {/* Thumbnail preview */}
                  <div className="h-36 bg-neutral-50 flex items-center justify-center overflow-hidden border-b border-neutral-100">
                    <div
                      className="transform scale-[0.3] origin-center"
                      dangerouslySetInnerHTML={{ __html: asset.html_content }}
                    />
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-neutral-800 truncate">{asset.title}</h3>
                        <p className="text-xs text-neutral-400">
                          {TYPE_LABELS[asset.type] || asset.type}
                          {asset.template_name && ` · ${asset.template_name}`}
                          {asset.product_name && ` · ${asset.product_name}`}
                        </p>
                        <p className="text-xs text-neutral-300 mt-0.5">
                          {new Date(asset.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteAsset(asset.id)}
                        className="text-neutral-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Brand Settings ────────────────────────────────────────── */}
      {activeTab === "brand" && (
        <div className="max-w-lg">
          <h2 className="text-lg font-semibold text-neutral-800 mb-4">Brand Settings</h2>
          <p className="text-sm text-neutral-500 mb-6">
            These settings are used when generating assets. Define your brand colors, logo, and preferred font.
          </p>

          <div className="space-y-5">
            {/* Brand Colors */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Brand Colors</label>
              <div className="flex gap-3 items-center flex-wrap">
                {brandColors.map((color, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => updateBrandColor(i, e.target.value)}
                      className="w-10 h-10 rounded-lg border border-neutral-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => updateBrandColor(i, e.target.value)}
                      className="w-24 rounded-lg border border-neutral-300 px-2 py-1 text-xs font-mono"
                    />
                    {i === 0 && <span className="text-xs text-neutral-400">Primary</span>}
                    {i === 1 && <span className="text-xs text-neutral-400">Secondary</span>}
                    {i === 2 && <span className="text-xs text-neutral-400">Background</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Logo URL */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Brand Logo URL</label>
              <input
                type="text"
                value={brandLogoUrl}
                onChange={(e) => setBrandLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            {/* Font */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Font</label>
              <select
                value={brandFont}
                onChange={(e) => setBrandFont(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              >
                <option value="Inter">Inter</option>
                <option value="Georgia">Georgia</option>
                <option value="Montserrat">Montserrat</option>
                <option value="Playfair Display">Playfair Display</option>
                <option value="Lato">Lato</option>
                <option value="Poppins">Poppins</option>
              </select>
            </div>

            <Button onClick={handleSaveBrand} loading={savingBrand} variant="primary">
              💾 Save Brand Settings
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
