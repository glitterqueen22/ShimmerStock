import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiPost, apiGet, apiPut } from "../lib/api";
import { Button } from "../components/ui";
import Novi from "../components/Novi";
import type { NoviExpression } from "../components/Novi";

// ── Types ───────────────────────────────────────────────────────────────

interface BrandKit {
  logo_url: string | null;
  brand_name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    background: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  style: string;
  tone: string;
  social_links: Record<string, string | null>;
  detected_industry: string | null;
  generated_at: string;
}

interface StylePreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    background: string;
  };
  fonts: { heading: string; body: string };
  tone: string;
  preview: { background: string; primary: string; text: string };
}

interface GeneratedTemplate {
  id: number;
  type: string;
  label: string;
  icon: string;
  name: string;
}

interface WebsiteData {
  pageTitle: string | null;
  metaDescription: string | null;
  socialLinks: Record<string, string>;
  detectedColors: { primary: string; secondary?: string; accent?: string } | null;
  industry: string | null;
  error: string | null;
}

type Phase = "discovery" | "preview" | "generating" | "editing";

// ── Icon map for template types ─────────────────────────────────────────

const TEMPLATE_ICONS: Record<string, string> = {
  packing_slip: "📦",
  invoice: "🧾",
  shipping_label: "🏷️",
  thank_you_card: "💌",
  return_slip: "↩️",
  email_header: "📧",
  email_signature: "✍️",
  quote_template: "📝",
};

// ── Component ───────────────────────────────────────────────────────────

export default function BrandSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Phase state
  const [phase, setPhase] = useState<Phase>("discovery");

  // Discovery
  const [logoUrl, setLogoUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [brandName, setBrandName] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<string>("");
  const [brandColors, setBrandColors] = useState({ primary: "", secondary: "", accent: "" });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showStyleSelector, setShowStyleSelector] = useState(false);

  // Results
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [websiteData, setWebsiteData] = useState<WebsiteData | null>(null);
  const [alternatives, setAlternatives] = useState<Array<{ id: string; name: string; icon: string; description: string }>>([]);
  const [styleInfo, setStyleInfo] = useState<{ id: string; name: string; icon: string; description: string } | null>(null);

  // Generation
  const [generatedTemplates, setGeneratedTemplates] = useState<GeneratedTemplate[]>([]);
  const [generatingProgress, setGeneratingProgress] = useState(0);

  // Editing
  const [selectedTemplate, setSelectedTemplate] = useState<GeneratedTemplate | null>(null);
  const [editInstruction, setEditInstruction] = useState("");
  const [editResponse, setEditResponse] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editMessages, setEditMessages] = useState<Array<{ sender: "novi" | "user"; text: string }>>([]);

  // Novi expression
  const [noviExpression, setNoviExpression] = useState<NoviExpression>("calm");

  const displayName = user?.display_name || "there";

  // ── Load styles on mount ─────────────────────────────────────────
  useEffect(() => {
    loadStyles();
  }, []);

  const loadStyles = async () => {
    try {
      const data = await apiGet("/api/brand-setup/styles");
      setStyles(data.styles || []);
    } catch (err) {
      console.error("Failed to load styles:", err);
    }
  };

  // ── Phase 1: Create Brand Kit ────────────────────────────────────
  const handleCreateBrandKit = async () => {
    setIsAnalyzing(true);
    setNoviExpression("thinking");

    try {
      const payload: any = {};

      if (logoUrl.trim()) payload.logoUrl = logoUrl.trim();
      if (websiteUrl.trim()) payload.websiteUrl = websiteUrl.trim();
      if (brandName.trim()) payload.brandName = brandName.trim();
      if (selectedStyle) payload.style = selectedStyle;
      if (brandColors.primary || brandColors.secondary || brandColors.accent) {
        payload.brandColors = {};
        if (brandColors.primary) payload.brandColors.primary = brandColors.primary;
        if (brandColors.secondary) payload.brandColors.secondary = brandColors.secondary;
        if (brandColors.accent) payload.brandColors.accent = brandColors.accent;
      }

      const data = await apiPost("/api/brand-setup/create-brand-kit", payload);

      setBrandKit(data.brandKit);
      setStyleInfo(data.styleInfo);
      setAlternatives(data.alternatives || []);

      // Also analyze website separately if provided
      if (websiteUrl.trim()) {
        try {
          const wData = await apiPost("/api/brand-setup/analyze-website", { websiteUrl: websiteUrl.trim() });
          setWebsiteData(wData);
        } catch {}
      }

      setNoviExpression("happy");
      setPhase("preview");
    } catch (err) {
      console.error("Failed to create brand kit:", err);
      setNoviExpression("concerned");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Phase 2: Generate All Templates ──────────────────────────────
  const handleGenerateAll = async () => {
    if (!brandKit) return;

    setPhase("generating");
    setGeneratingProgress(0);
    setNoviExpression("thinking");

    const templateTypes = [
      "packing_slip", "invoice", "shipping_label", "thank_you_card",
      "return_slip", "email_header", "email_signature", "quote_template",
    ];

    // Simulate progressive generation for visual feedback
    for (let i = 0; i < templateTypes.length; i++) {
      setGeneratingProgress(Math.round(((i) / templateTypes.length) * 100));
      await new Promise(r => setTimeout(r, 400));
    }

    try {
      const data = await apiPost("/api/brand-setup/generate-all", { brandKit });
      setGeneratedTemplates(data.templates || []);
      setGeneratingProgress(100);

      // Create celebration memory
      try {
        await apiPost("/api/brand-setup/create-memory", {
          eventType: "brand_setup",
          title: "Branded your business documents",
          description: `Novi created ${data.count} branded templates for ${brandKit.brand_name}`,
        });
      } catch {}

      setNoviExpression("celebrating");

      // Auto-transition to editing phase after short delay
      setTimeout(() => {
        setPhase("editing");
        if (data.templates && data.templates.length > 0) {
          setSelectedTemplate(data.templates[0]);
        }
      }, 1500);

    } catch (err) {
      console.error("Failed to generate templates:", err);
      setNoviExpression("concerned");
    }
  };

  // ── Phase 3: Try Alternative Style ───────────────────────────────
  const handleTryAlternative = async (styleId: string) => {
    setIsAnalyzing(true);
    setNoviExpression("thinking");

    try {
      const payload: any = { style: styleId };
      if (logoUrl.trim()) payload.logoUrl = logoUrl.trim();
      if (websiteUrl.trim()) payload.websiteUrl = websiteUrl.trim();
      if (brandName.trim()) payload.brandName = brandName.trim();

      const data = await apiPost("/api/brand-setup/create-brand-kit", payload);
      setBrandKit(data.brandKit);
      setStyleInfo(data.styleInfo);
      setAlternatives(data.alternatives || []);
      setNoviExpression("happy");
    } catch (err) {
      console.error("Failed to try alternative:", err);
      setNoviExpression("concerned");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Phase 4: Conversational Edit ─────────────────────────────────
  const handleSendEdit = async () => {
    const text = editInstruction.trim();
    if (!text || isEditing || !selectedTemplate) return;

    setEditMessages(prev => [...prev, { sender: "user", text }]);
    setEditInstruction("");
    setIsEditing(true);
    setNoviExpression("thinking");

    try {
      const data = await apiPut("/api/brand-setup/conversational-edit", {
        templateId: selectedTemplate.id,
        instruction: text,
        brandKit,
      });

      setEditMessages(prev => [...prev, { sender: "novi", text: data.message || data.changes }]);
      setEditResponse(data.message || data.changes);
      setNoviExpression("happy");
    } catch (err) {
      console.error("Edit failed:", err);
      setEditMessages(prev => [...prev, { sender: "novi", text: "Hmm, I had trouble with that change. Could you try rephrasing it?" }]);
      setNoviExpression("concerned");
    } finally {
      setIsEditing(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendEdit();
    }
  };

  // ── Scroll chat on new messages ──────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [editMessages]);

  // ── Render: Discovery Phase ──────────────────────────────────────
  if (phase === "discovery") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
           style={{
             background: "linear-gradient(135deg, #fdf2f5 0%, #ffdae1 50%, #f7e8ec 100%)",
             backgroundAttachment: "fixed",
           }}>
        <div className="w-full max-w-2xl mx-auto">

          {/* Novi Header */}
          <div className="text-center mb-6">
            <div className="inline-block">
              <Novi expression={noviExpression} size="lg" animated />
            </div>
            <h1 className="text-2xl font-heading font-semibold text-rose-700 mt-3">
              Brand Your Business
            </h1>
            <p className="text-rose-400 text-sm mt-1 max-w-md mx-auto">
              I'll design professional branded documents for your business — packing slips, invoices, thank-you cards, and more.
            </p>
          </div>

          {/* Discovery Form */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100 p-6 mb-6">
            {/* Logo URL */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-rose-700 mb-2">
                🖼️ Your Logo URL
              </label>
              <input
                type="url"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-800 placeholder-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
              />
              <p className="text-xs text-rose-300 mt-1">Paste a link to your logo image — I'll use it across all your documents.</p>
            </div>

            {/* Website URL */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-rose-700 mb-2">
                🌐 Your Website URL (optional)
              </label>
              <input
                type="url"
                value={websiteUrl}
                onChange={e => setWebsiteUrl(e.target.value)}
                placeholder="https://yourbusiness.com"
                className="w-full rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-800 placeholder-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
              />
              <p className="text-xs text-rose-300 mt-1">I'll scan your site for colors, social links, and brand details.</p>
            </div>

            {/* Brand Name */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-rose-700 mb-2">
                ✨ Your Business Name (optional)
              </label>
              <input
                type="text"
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                placeholder="My Awesome Business"
                className="w-full rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-800 placeholder-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
              />
            </div>

            {/* Custom Colors (optional) */}
            <div className="mb-5">
              <button
                onClick={() => setBrandColors(prev => prev.primary ? { primary: "", secondary: "", accent: "" } : { primary: "#e91e8c", secondary: "", accent: "" })}
                className="text-sm font-medium text-rose-500 hover:text-rose-700 transition-colors"
              >
                {brandColors.primary ? "−" : "+"} Have specific brand colors?
              </button>
              {brandColors.primary && (
                <div className="flex gap-3 mt-2">
                  <div>
                    <label className="block text-xs text-rose-400 mb-1">Primary</label>
                    <input
                      type="color"
                      value={brandColors.primary}
                      onChange={e => setBrandColors(prev => ({ ...prev, primary: e.target.value }))}
                      className="w-12 h-10 rounded-lg border border-rose-200 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-rose-400 mb-1">Secondary</label>
                    <input
                      type="color"
                      value={brandColors.secondary}
                      onChange={e => setBrandColors(prev => ({ ...prev, secondary: e.target.value }))}
                      className="w-12 h-10 rounded-lg border border-rose-200 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-rose-400 mb-1">Accent</label>
                    <input
                      type="color"
                      value={brandColors.accent}
                      onChange={e => setBrandColors(prev => ({ ...prev, accent: e.target.value }))}
                      className="w-12 h-10 rounded-lg border border-rose-200 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Skip to style selector */}
            <button
              onClick={() => setShowStyleSelector(!showStyleSelector)}
              className="text-sm font-medium text-rose-400 hover:text-rose-600 transition-colors mb-4"
            >
              {showStyleSelector ? "−" : "+"} Skip — just pick a style
            </button>

            {showStyleSelector && styles.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                {styles.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedStyle(s.id);
                      setShowStyleSelector(false);
                    }}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      selectedStyle === s.id
                        ? "border-rose-400 bg-rose-50 shadow-sm"
                        : "border-gray-200 bg-white hover:border-rose-200 hover:bg-rose-50/50"
                    }`}
                  >
                    <span className="text-xl block mb-1">{s.icon}</span>
                    <span className="text-xs font-semibold text-gray-700">{s.name}</span>
                    <div className="flex gap-1 mt-1">
                      <span className="w-4 h-4 rounded-full border border-gray-200" style={{ background: s.colors.primary }} />
                      <span className="w-4 h-4 rounded-full border border-gray-200" style={{ background: s.colors.secondary }} />
                      <span className="w-4 h-4 rounded-full border border-gray-200" style={{ background: s.colors.accent }} />
                    </div>
                  </button>
                ))}
              </div>
            )}

            <Button
              onClick={handleCreateBrandKit}
              loading={isAnalyzing}
              disabled={!logoUrl.trim() && !websiteUrl.trim() && !selectedStyle && !brandColors.primary}
              className="w-full"
            >
              ✨ Analyze & Create My Brand Kit
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Preview Phase ────────────────────────────────────────
  if (phase === "preview" && brandKit) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
           style={{
             background: "linear-gradient(135deg, #fdf2f5 0%, #ffdae1 50%, #f7e8ec 100%)",
             backgroundAttachment: "fixed",
           }}>
        <div className="w-full max-w-2xl mx-auto">

          {/* Novi Header */}
          <div className="text-center mb-6">
            <div className="inline-block">
              <Novi expression={noviExpression} size="lg" animated />
            </div>
            <h2 className="text-xl font-heading font-semibold text-rose-700 mt-3">
              Does this feel like your business?
            </h2>
            <p className="text-rose-400 text-sm mt-1">
              Here's what I found — you can adjust anything before generating.
            </p>
          </div>

          {/* Brand Kit Preview Card */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100 p-6 mb-6">
            {/* Brand Preview Banner */}
            <div
              className="rounded-xl p-6 mb-5 text-center"
              style={{ background: brandKit.colors.primary }}
            >
              {brandKit.logo_url ? (
                <img
                  src={brandKit.logo_url}
                  alt={brandKit.brand_name}
                  className="h-12 mx-auto mb-2 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <span className="text-4xl block mb-1" style={{ color: "#fff" }}>✨</span>
              )}
              <h3 className="text-xl font-bold" style={{ color: brandKit.colors.background, fontFamily: brandKit.fonts.heading }}>
                {brandKit.brand_name}
              </h3>
              {styleInfo && (
                <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium"
                      style={{ background: "rgba(255,255,255,0.2)", color: brandKit.colors.background }}>
                  {styleInfo.icon} {styleInfo.name} Style
                </span>
              )}
            </div>

            {/* Color Palette */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">Colors</p>
              <div className="flex gap-3">
                {[
                  { label: "Primary", color: brandKit.colors.primary },
                  { label: "Secondary", color: brandKit.colors.secondary },
                  { label: "Accent", color: brandKit.colors.accent },
                  { label: "Text", color: brandKit.colors.text },
                  { label: "Bg", color: brandKit.colors.background },
                ].map((c, i) => (
                  <div key={i} className="text-center">
                    <div
                      className="w-10 h-10 rounded-lg border border-gray-200 shadow-sm mx-auto"
                      style={{ background: c.color }}
                    />
                    <span className="text-[10px] text-gray-400 mt-1 block">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Font Preview */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">Fonts</p>
              <div className="p-4 rounded-lg bg-gray-50">
                <p className="text-lg font-semibold mb-1" style={{ fontFamily: brandKit.fonts.heading }}>
                  This is your headline font
                </p>
                <p className="text-sm" style={{ fontFamily: brandKit.fonts.body }}>
                  This is your body text — clean, readable, and on-brand.
                </p>
              </div>
            </div>

            {/* Detected Info */}
            {(websiteData?.pageTitle || websiteData?.industry || brandKit.social_links?.instagram) && (
              <div className="mb-4 p-4 rounded-lg bg-rose-50 border border-rose-100">
                <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">Detected</p>
                <div className="space-y-1 text-sm text-rose-700">
                  {websiteData?.pageTitle && (
                    <p>📄 Site: {websiteData.pageTitle}</p>
                  )}
                  {brandKit.detected_industry && (
                    <p>🏭 Industry: {brandKit.detected_industry}</p>
                  )}
                  {brandKit.social_links?.instagram && (
                    <p>📸 Instagram: {brandKit.social_links.instagram}</p>
                  )}
                </div>
              </div>
            )}

            {/* Alternatives */}
            {alternatives.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Not quite right? Try:
                </p>
                <div className="flex gap-2">
                  {alternatives.map((alt) => (
                    <button
                      key={alt.id}
                      onClick={() => handleTryAlternative(alt.id)}
                      disabled={isAnalyzing}
                      className="flex-1 p-3 rounded-xl border border-gray-200 bg-white hover:bg-rose-50 hover:border-rose-200 transition-all text-center disabled:opacity-50"
                    >
                      <span className="text-lg block">{alt.icon}</span>
                      <span className="text-xs font-semibold text-gray-600">{alt.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              <Button onClick={handleGenerateAll} className="w-full">
                🎨 Yes, Generate My Branded Documents
              </Button>
              <button
                onClick={() => setPhase("discovery")}
                className="w-full text-sm text-rose-400 hover:text-rose-600 transition-colors underline underline-offset-2"
              >
                ← Go back and adjust
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Generating Phase ─────────────────────────────────────
  if (phase === "generating") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
           style={{
             background: "linear-gradient(135deg, #fdf2f5 0%, #ffdae1 50%, #f7e8ec 100%)",
             backgroundAttachment: "fixed",
           }}>
        <div className="w-full max-w-lg mx-auto text-center">
          <div className="inline-block mb-4">
            <Novi
              expression={noviExpression === "celebrating" ? "celebrating" : "focused"}
              size="lg"
              animated
            />
          </div>

          {noviExpression === "celebrating" ? (
            <>
              <h2 className="text-2xl font-heading font-semibold text-rose-700 mb-2">
                All done! Your business looks amazing. 🎉
              </h2>
              <p className="text-rose-500 text-sm mb-6">
                I've created 8 branded documents for {brandKit?.brand_name || "your business"}.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-heading font-semibold text-rose-700 mb-2">
                Creating your branded documents...
              </h2>
              <p className="text-rose-400 text-sm mb-6">
                I'm designing professional templates with your brand colors and style.
              </p>
            </>
          )}

          {/* Progress bar */}
          <div className="w-full bg-rose-100 rounded-full h-3 mb-4">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-500"
              style={{ width: `${generatingProgress}%` }}
            />
          </div>

          {/* Template list */}
          <div className="text-left space-y-2">
            {[
              { type: "packing_slip", icon: "📦", label: "Packing Slip" },
              { type: "invoice", icon: "🧾", label: "Invoice" },
              { type: "shipping_label", icon: "🏷️", label: "Shipping Label" },
              { type: "thank_you_card", icon: "💌", label: "Thank-You Card" },
              { type: "return_slip", icon: "↩️", label: "Return Slip" },
              { type: "email_header", icon: "📧", label: "Email Header" },
              { type: "email_signature", icon: "✍️", label: "Email Signature" },
              { type: "quote_template", icon: "📝", label: "Quote Template" },
            ].map((t, i) => {
              const isDone = generatingProgress >= Math.round(((i + 1) / 8) * 100);
              return (
                <div
                  key={t.type}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                    isDone ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200 opacity-50"
                  }`}
                >
                  <span className="text-lg">{t.icon}</span>
                  <span className={`text-sm font-medium flex-1 ${isDone ? "text-green-700" : "text-gray-500"}`}>
                    {t.label}
                  </span>
                  {isDone && <span className="text-green-500">✅</span>}
                </div>
              );
            })}
          </div>

          {noviExpression === "celebrating" && (
            <Button onClick={() => { setPhase("editing"); if (generatedTemplates.length > 0) setSelectedTemplate(generatedTemplates[0]); }}
                    className="w-full mt-6">
              🎨 Fine-tune my documents →
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Editing Phase ────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col px-4 py-4"
         style={{
           background: "linear-gradient(135deg, #fdf2f5 0%, #ffdae1 50%, #f7e8ec 100%)",
           backgroundAttachment: "fixed",
         }}>
      <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate("/fulfillment")}
            className="text-rose-400 hover:text-rose-600 transition-colors"
          >
            ← Back to Fulfillment
          </button>
          <div className="flex-1" />
          <h1 className="text-xl font-heading font-semibold text-rose-700">
            🎨 Edit Your Branded Documents
          </h1>
          <div className="flex-1" />
          <button
            onClick={() => navigate("/fulfillment")}
            className="text-sm font-medium text-rose-500 hover:text-rose-600 transition-colors"
          >
            Done Editing
          </button>
        </div>

        {/* Two-column layout */}
        <div className="flex-1 flex gap-6 min-h-0">
          {/* Left: Template List */}
          <div className="w-64 flex-shrink-0 bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100 p-4 overflow-y-auto">
            <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-3">
              Your Templates
            </p>
            <div className="space-y-1">
              {(generatedTemplates.length > 0 ? generatedTemplates : [
                { id: 0, type: "packing_slip", label: "Packing Slip", icon: "📦", name: "Packing Slip" },
                { id: 1, type: "invoice", label: "Invoice", icon: "🧾", name: "Invoice" },
                { id: 2, type: "shipping_label", label: "Shipping Label", icon: "🏷️", name: "Shipping Label" },
                { id: 3, type: "thank_you_card", label: "Thank-You Card", icon: "💌", name: "Thank-You Card" },
                { id: 4, type: "return_slip", label: "Return Slip", icon: "↩️", name: "Return Slip" },
                { id: 5, type: "email_header", label: "Email Header", icon: "📧", name: "Email Header" },
                { id: 6, type: "email_signature", label: "Email Signature", icon: "✍️", name: "Email Signature" },
                { id: 7, type: "quote_template", label: "Quote Template", icon: "📝", name: "Quote Template" },
              ]).map((tpl) => (
                <button
                  key={`${tpl.type}-${tpl.id}`}
                  onClick={() => setSelectedTemplate(tpl)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedTemplate?.type === tpl.type
                      ? "bg-rose-100 text-rose-700 shadow-sm"
                      : "text-gray-600 hover:bg-rose-50 hover:text-rose-600"
                  }`}
                >
                  <span className="mr-2">{TEMPLATE_ICONS[tpl.type] || tpl.icon}</span>
                  {tpl.label}
                </button>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-rose-100">
              <a
                href="/fulfillment"
                className="text-xs text-rose-400 hover:text-rose-600 transition-colors underline underline-offset-2"
              >
                Open full Template Designer →
              </a>
            </div>
          </div>

          {/* Right: Preview + Chat */}
          <div className="flex-1 flex flex-col min-h-0 gap-4">
            {/* Template Preview */}
            <div className="flex-1 bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100 p-6 flex flex-col items-center justify-center min-h-[300px]">
              {selectedTemplate && brandKit ? (
                <div className="w-full max-w-md text-center">
                  <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-4">
                    Preview: {selectedTemplate.label}
                  </p>
                  <div
                    className="rounded-xl p-8 border-2 border-dashed border-rose-200"
                    style={{ background: brandKit.colors.background }}
                  >
                    {/* Logo */}
                    <div className="mb-4">
                      {brandKit.logo_url ? (
                        <img src={brandKit.logo_url} alt="" className="h-10 mx-auto object-contain" />
                      ) : (
                        <span className="text-3xl">✨</span>
                      )}
                    </div>

                    {/* Title */}
                    {selectedTemplate.type === "quote_template" && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                        <span className="text-6xl font-bold" style={{ color: brandKit.colors.primary }}>
                          QUOTE
                        </span>
                      </div>
                    )}

                    <h3 className="text-lg font-bold mb-2" style={{ color: brandKit.colors.text, fontFamily: brandKit.fonts.heading }}>
                      {brandKit.brand_name}
                    </h3>
                    <p className="text-sm mb-4" style={{ color: brandKit.colors.secondary, fontFamily: brandKit.fonts.body }}>
                      {selectedTemplate.type === "packing_slip" && "Thank you for your order!"}
                      {selectedTemplate.type === "invoice" && "Invoice — Payment Terms: Net 30"}
                      {selectedTemplate.type === "shipping_label" && "SHIP TO: Customer Address"}
                      {selectedTemplate.type === "thank_you_card" && "Thank you for supporting our business! Every order means the world to us."}
                      {selectedTemplate.type === "return_slip" && "Returns accepted within 30 days."}
                      {selectedTemplate.type === "email_header" && "Handcrafted by us, delivered to you."}
                      {selectedTemplate.type === "email_signature" && "Your Name · Your Title"}
                      {selectedTemplate.type === "quote_template" && "Quote — valid for 30 days"}
                    </p>

                    <div
                      className="w-full h-1 rounded-full mb-3"
                      style={{ background: brandKit.colors.accent }}
                    />

                    <p className="text-[10px]" style={{ color: brandKit.colors.secondary }}>
                      {brandKit.social_links?.website || "www.example.com"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <span className="text-4xl block mb-2">📄</span>
                  <p className="text-sm">Select a template to preview</p>
                </div>
              )}
            </div>

            {/* Chat Editor */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100 p-4">
              {/* Chat messages */}
              {editMessages.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto mb-3 space-y-3">
                  {editMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.sender === "novi" && (
                        <div className="flex-shrink-0 mr-2">
                          <Novi expression="happy" size="sm" animated={false} />
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                          msg.sender === "user"
                            ? "bg-rose-500 text-white rounded-br-md"
                            : "bg-rose-50 text-rose-800 rounded-bl-md border border-rose-100"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Input */}
              <div className="flex gap-2 items-end">
                <input
                  type="text"
                  value={editInstruction}
                  onChange={e => setEditInstruction(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  placeholder={
                    selectedTemplate
                      ? `Can you make the ${selectedTemplate.label.toLowerCase()} more...?`
                      : "Select a template first..."
                  }
                  disabled={isEditing || !selectedTemplate}
                  className="flex-1 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-800 placeholder-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent disabled:opacity-50"
                />
                <Button
                  onClick={handleSendEdit}
                  disabled={!editInstruction.trim() || isEditing || !selectedTemplate}
                  loading={isEditing}
                >
                  Send
                </Button>
              </div>
              <p className="text-xs text-rose-300 mt-2">
                Try: "use more pink", "make it more premium", "add my Instagram", "move logo to the top"
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
