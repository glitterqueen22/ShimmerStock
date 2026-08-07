import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiPost } from "../lib/api";
import { Button } from "../components/ui";
import Novi from "../components/Novi";
import DemoWorkspacePreview from "../components/DemoWorkspacePreview";
import type { NoviExpression } from "../components/Novi";

// ── Types ───────────────────────────────────────────────────────────

interface Channel {
  id: string;
  name: string;
}

interface Capabilities {
  manufacturing: boolean;
  warehouse: boolean;
  team: boolean;
  shipping: boolean;
  affiliates: boolean;
  marketing: boolean;
}

interface BusinessType {
  id: string;
  name: string;
  icon: string;
}

interface Analysis {
  businessType?: BusinessType;
  channels?: Channel[];
  teamSize?: number;
  capabilities?: Capabilities;
  products?: string[];
}

interface IndustryProfileData {
  id: string;
  name: string;
  icon: string;
  terminology: Record<string, string>;
  defaultEngines: string[];
  workflowOrder: string[];
  defaultUnits: string[];
  confidence: "detected" | "manual";
}

interface AvailableIndustry {
  id: string;
  name: string;
  icon: string;
  terminology: Record<string, string>;
  defaultEngines: string[];
  workflowOrder: string[];
  defaultUnits: string[];
}

interface OnboardingProposal {
  businessType: string;
  industryProfile: IndustryProfileData | null;
  availableIndustries: AvailableIndustry[];
  recommendedHQs: string[];
  optionalHQs: string[];
  summary: string;
}

interface NoviResponse {
  phase: string;
  noviMessage: string;
  noviExpression: NoviExpression;
  analysis?: Analysis;
  businessType?: string;
  industryProfile?: IndustryProfileData | null;
  availableIndustries?: AvailableIndustry[];
  recommendedHQs?: string[];
  optionalHQs?: string[];
  summary?: string;
  applied?: any;
}

// ── Terminology keys to preview ─────────────────────────────────────

const TERM_KEYS = ["product", "products", "production", "inventory", "supplier", "purchasing", "warehouse", "calculation"];

const DEFAULT_LABELS: Record<string, string> = {
  product: "Product",
  products: "Products",
  production: "Production",
  inventory: "Stock",
  supplier: "Supplier",
  purchasing: "Purchasing",
  warehouse: "Warehouse",
  calculation: "Calculator",
};

// ── HQ Display Names ────────────────────────────────────────────────

const HQ_DISPLAY: Record<string, { label: string; icon: string; description: string }> = {
  commerce: { label: "Commerce", icon: "📋", description: "Track sales across all your channels" },
  inventory: { label: "Inventory", icon: "📦", description: "Know exactly what's in stock" },
  production: { label: "Production HQ", icon: "🏭", description: "Manage recipes, batches, and manufacturing" },
  warehouse: { label: "Warehouse HQ", icon: "🏗️", description: "Bins, receiving, picking, packing, shipping" },
  fulfillment: { label: "Fulfillment HQ", icon: "🚚", description: "Shipping rates, carriers, and delivery tracking" },
  team: { label: "Team HQ", icon: "👥", description: "Roles, permissions, and team management" },
  affiliate: { label: "Affiliate HQ", icon: "🏆", description: "Ambassador program and referral tracking" },
  studio: { label: "Studio", icon: "🎨", description: "Creative workspace for product assets" },
  growth: { label: "Growth HQ", icon: "📈", description: "Forecasting, seasonality, and growth insights" },
  purchasing: { label: "Purchasing", icon: "🛒", description: "Supplier management and reorder intelligence" },
  customer_service: { label: "Customer Service", icon: "💬", description: "Returns, refunds, and customer history" },
};

// ── Main Component ──────────────────────────────────────────────────

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [phase, setPhase] = useState<string>("greeting");
  const [messages, setMessages] = useState<Array<{ sender: "novi" | "user"; text: string; expression?: NoviExpression }>>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, setAnalysis] = useState<Analysis>({});
  const [proposal, setProposal] = useState<OnboardingProposal | null>(null);
  const [selectedHQs, setSelectedHQs] = useState<string[]>([]);
  const [selectedIndustryId, setSelectedIndustryId] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [showDemoPreview, setShowDemoPreview] = useState(false);
  // Novi refinement state
  const [refinementInput, setRefinementInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  const displayName = user?.display_name || "there";

  // ── Start onboarding on mount ────────────────────────────────────

  useEffect(() => {
    startOnboarding();
  }, []);

  const startOnboarding = async () => {
    try {
      setIsLoading(true);
      const data: NoviResponse = await apiPost("/api/onboarding/start");
      setMessages([{ sender: "novi", text: data.noviMessage, expression: data.noviExpression }]);
      setPhase(data.phase);
    } catch (err) {
      console.error("Failed to start onboarding:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Scroll to bottom ─────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Focus input when phase changes ───────────────────────────────

  useEffect(() => {
    if (phase === "greeting" || phase === "clarification") {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [phase]);

  // ── Handle sending a response ────────────────────────────────────

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    // Add user message
    setMessages(prev => [...prev, { sender: "user", text }]);
    setInputValue("");
    setIsLoading(true);

    try {
      const data: NoviResponse = await apiPost("/api/onboarding/respond", { message: text });

      // Small delay so Novi "thinks"
      await new Promise(r => setTimeout(r, 600));

      setMessages(prev => [...prev, { sender: "novi", text: data.noviMessage, expression: data.noviExpression }]);
      setPhase(data.phase);

      if (data.analysis) {
        setAnalysis(data.analysis);
      }

      // If we moved to proposal phase, auto-generate proposal
      if (data.phase === "proposal") {
        await new Promise(r => setTimeout(r, 800));
        await generateProposal();
      }
    } catch (err) {
      console.error("Failed to send response:", err);
      setMessages(prev => [...prev, { sender: "novi", text: "Hmm, I ran into a little snag. Could you try again?", expression: "concerned" }]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Generate proposal ────────────────────────────────────────────

  const generateProposal = async () => {
    try {
      const data: NoviResponse = await apiPost("/api/onboarding/propose");

      setMessages(prev => [...prev, { sender: "novi", text: data.noviMessage, expression: data.noviExpression }]);

      const p: OnboardingProposal = {
        businessType: data.businessType || "",
        industryProfile: data.industryProfile || null,
        availableIndustries: data.availableIndustries || [],
        recommendedHQs: data.recommendedHQs || [],
        optionalHQs: data.optionalHQs || [],
        summary: data.summary || "",
      };

      setProposal(p);
      setSelectedHQs([...p.recommendedHQs]);
      setSelectedIndustryId(p.industryProfile?.id || null);
    } catch (err) {
      console.error("Failed to generate proposal:", err);
    }
  };

  // ── Toggle HQ selection ──────────────────────────────────────────

  const toggleHQ = (hq: string) => {
    setSelectedHQs(prev =>
      prev.includes(hq) ? prev.filter(h => h !== hq) : [...prev, hq]
    );
  };

  // ── Handle industry card click ────────────────────────────────────

  const handleIndustrySelect = (industryId: string | null) => {
    setSelectedIndustryId(industryId);
  };

  // ── Get preview industry terminology ──────────────────────────────

  const getSelectedIndustryPreview = (): AvailableIndustry | null => {
    if (!selectedIndustryId || !proposal) return null;
    return proposal.availableIndustries.find(i => i.id === selectedIndustryId) || null;
  };

  const getDetectedIndustry = (): IndustryProfileData | null => {
    return proposal?.industryProfile || null;
  };

  // ── Apply configuration ──────────────────────────────────────────

  const applyConfig = async () => {
    if (allDone) {
      navigate("/bestie");
      return;
    }

    setIsLoading(true);
    try {
      const data: NoviResponse = await apiPost("/api/onboarding/apply", {
        hqs: selectedHQs,
        industryProfile: selectedIndustryId,
      });

      setMessages(prev => [...prev, { sender: "novi", text: data.noviMessage, expression: "celebrating" }]);
      setAllDone(true);
    } catch (err) {
      console.error("Failed to apply config:", err);
      setMessages(prev => [...prev, { sender: "novi", text: "Something went wrong while setting things up. Let's try that again?", expression: "concerned" }]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Novi refinement: re-detect industry from additional description

  const handleRefinementSend = async () => {
    const text = refinementInput.trim();
    if (!text || isRefining) return;

    setRefinementInput("");
    setIsRefining(true);
    setMessages(prev => [...prev, { sender: "user", text }]);

    try {
      // Send to /respond to re-run detection
      const respData: NoviResponse = await apiPost("/api/onboarding/respond", { message: text });

      await new Promise(r => setTimeout(r, 600));
      setMessages(prev => [...prev, { sender: "novi", text: respData.noviMessage, expression: respData.noviExpression }]);

      if (respData.analysis) {
        setAnalysis(respData.analysis);
      }

      // Re-generate proposal with potentially updated detection
      await new Promise(r => setTimeout(r, 400));
      await generateProposal();
    } catch (err) {
      console.error("Failed to refine:", err);
      setMessages(prev => [...prev, { sender: "novi", text: "Hmm, I couldn't refine that. Let's keep going with what we have!", expression: "concerned" }]);
    } finally {
      setIsRefining(false);
    }
  };

  // ── Handle Enter key ─────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
         style={{
           background: "linear-gradient(135deg, #fdf2f5 0%, #ffdae1 50%, #f7e8ec 100%)",
           backgroundAttachment: "fixed",
         }}>
      <div className="w-full max-w-2xl mx-auto">

        {/* ── Novi Header ─────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="inline-block">
            <Novi
              expression={allDone ? "celebrating" : phase === "proposal" ? "happy" : isLoading ? "thinking" : "calm"}
              size="lg"
              animated
            />
          </div>
          <h1 className="text-2xl font-heading font-semibold text-rose-700 mt-3">
            {allDone ? "All Set!" : "Setting Up Your Workspace"}
          </h1>
          <p className="text-rose-400 text-sm mt-1">
            {allDone ? "Your business is ready to go" : "Novi will guide you through it"}
          </p>
        </div>

        {/* ── Chat Messages ───────────────────────────────────────── */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100 p-6 mb-6 max-h-[420px] overflow-y-auto">
          {messages.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="text-rose-300 text-center">
                <Novi expression="thinking" size="md" animated />
                <p className="mt-3 text-sm">Novi is getting ready...</p>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex mb-4 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.sender === "novi" && (
                <div className="flex-shrink-0 mr-2 mt-1">
                  <Novi expression={msg.expression || "calm"} size="sm" animated={false} />
                </div>
              )}
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-rose-500 text-white rounded-br-md"
                    : "bg-rose-50 text-rose-800 rounded-bl-md border border-rose-100"
                }`}
              >
                {/* Support simple markdown: **bold** and newlines */}
                {msg.text.split("\n").map((line, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
                      if (part.startsWith("**") && part.endsWith("**")) {
                        return <strong key={j}>{part.slice(2, -2)}</strong>;
                      }
                      return part;
                    })}
                  </span>
                ))}
              </div>
              {msg.sender === "user" && (
                <div className="flex-shrink-0 ml-2 mt-1 w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center text-white text-xs font-semibold">
                  {displayName[0]?.toUpperCase()}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="flex-shrink-0 mr-2 mt-1">
                <Novi expression="thinking" size="sm" animated />
              </div>
              <div className="bg-rose-50 text-rose-400 px-4 py-3 rounded-2xl rounded-bl-md border border-rose-100 text-sm">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Demo Workspace Preview ──────────────────────────── */}
        {showDemoPreview && !allDone && (
          <div className="mb-6">
            <DemoWorkspacePreview
              businessType={selectedIndustryId as any ?? "craft_supplies"}
              onContinueSetup={() => setShowDemoPreview(false)}
              onBack={() => setShowDemoPreview(false)}
              onSkip={() => setShowDemoPreview(false)}
            />
          </div>
        )}

        {/* ── Proposal (Phase: proposal) ──────────────────────────── */}
        {phase === "proposal" && proposal && !allDone && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100 p-6 mb-6 animate-slideUp space-y-6">
            <h2 className="text-lg font-heading font-semibold text-rose-700">
              Your Workspace
            </h2>

            {/* ── Industry Profile Section ─────────────────────────── */}
            {proposal.availableIndustries.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-3">
                  Industry Profile
                </p>

                {/* Detected industry highlight */}
                {getDetectedIndustry() && (
                  <div className="mb-3 p-3 rounded-xl bg-rose-50/70 border border-rose-150 flex items-center gap-3">
                    <span className="text-2xl">{getDetectedIndustry()!.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-rose-800">{getDetectedIndustry()!.name}</p>
                      <p className="text-xs text-rose-500">We detected this based on your description</p>
                    </div>
                  </div>
                )}

                {/* Industry card grid */}
                <div className="grid grid-cols-4 gap-2">
                  {/* Generic option */}
                  <button
                    onClick={() => handleIndustrySelect(null)}
                    className={`p-2 rounded-lg border-2 text-center text-xs transition-all
                      ${selectedIndustryId === null
                        ? "border-rose-400 bg-rose-50 shadow-sm"
                        : proposal.industryProfile?.id === selectedIndustryId
                        ? "border-dashed border-rose-300 bg-white hover:border-rose-400"
                        : "border-neutral-200 hover:border-rose-200 hover:bg-rose-50/30"
                      }`}
                  >
                    <span className="text-lg block">🌐</span>
                    <span className="font-semibold text-neutral-700">Generic</span>
                  </button>

                  {proposal.availableIndustries.map((ind) => {
                    const isDetected = proposal.industryProfile?.id === ind.id;
                    const isSelected = selectedIndustryId === ind.id;
                    const isDetectedButNotSelected = isDetected && !isSelected;
                    return (
                      <button
                        key={ind.id}
                        onClick={() => handleIndustrySelect(ind.id)}
                        className={`p-2 rounded-lg border-2 text-center text-xs transition-all
                          ${isSelected
                            ? "border-rose-400 bg-rose-50 shadow-sm"
                            : isDetectedButNotSelected
                            ? "border-dashed border-rose-300 bg-white hover:border-rose-400"
                            : "border-neutral-200 hover:border-rose-200 hover:bg-rose-50/30"
                          }`}
                      >
                        <span className="text-lg block">{ind.icon}</span>
                        <span className="font-semibold text-neutral-700">{ind.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Terminology Preview ──────────────────────────────── */}
            {getSelectedIndustryPreview() && selectedIndustryId !== (proposal.industryProfile?.id || null) && (
              <div className="bg-rose-50/50 rounded-lg p-3 border border-rose-100">
                <p className="text-xs font-semibold text-rose-400 mb-2">
                  Terminology Preview — {getSelectedIndustryPreview()?.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  {TERM_KEYS.filter(key => {
                    const preview = getSelectedIndustryPreview();
                    if (!preview) return false;
                    const newLabel = preview.terminology[key];
                    const defaultLabel = DEFAULT_LABELS[key] || key;
                    return newLabel && newLabel !== defaultLabel;
                  }).slice(0, 4).map(key => {
                    const preview = getSelectedIndustryPreview()!;
                    const newLabel = preview.terminology[key] || DEFAULT_LABELS[key] || key;
                    const defaultLabel = DEFAULT_LABELS[key] || key;
                    return (
                      <span key={key} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-white border border-rose-200">
                        <span className="text-neutral-400">{defaultLabel}</span>
                        <span className="text-rose-400">→</span>
                        <span className="font-semibold text-rose-700">{newLabel}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Novi Refinement Input ────────────────────────────── */}
            <div className="border-t border-rose-100 pt-3">
              <p className="text-xs text-rose-400 mb-2">
                Not quite right? Tell Novi more about what you make and she'll find a better fit.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={refinementInput}
                  onChange={e => setRefinementInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleRefinementSend();
                  }}
                  placeholder="I actually make handmade soaps and bath bombs..."
                  disabled={isRefining}
                  className="flex-1 text-xs rounded-lg border border-rose-200 bg-rose-50/50 px-3 py-2 text-rose-800 placeholder-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent disabled:opacity-50"
                />
                <button
                  onClick={handleRefinementSend}
                  disabled={!refinementInput.trim() || isRefining}
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-rose-100 text-rose-600 hover:bg-rose-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRefining ? "Thinking…" : "Tell Novi"}
                </button>
              </div>
            </div>

            {/* ── HQ Section ───────────────────────────────────────── */}
            {proposal.recommendedHQs.length > 0 && (
              <div className="border-t border-rose-100 pt-4">
                <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">Recommended</p>
                <div className="space-y-2">
                  {proposal.recommendedHQs.map(hq => {
                    const info = HQ_DISPLAY[hq] || { label: hq, icon: "📦", description: "" };
                    return (
                      <label
                        key={hq}
                        className="flex items-center gap-3 p-3 rounded-xl bg-rose-50 border border-rose-100 cursor-pointer hover:bg-rose-100 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedHQs.includes(hq)}
                          onChange={() => toggleHQ(hq)}
                          className="w-4 h-4 accent-rose-500 rounded"
                        />
                        <span className="text-xl">{info.icon}</span>
                        <div>
                          <p className="text-sm font-semibold text-rose-800">{info.label}</p>
                          <p className="text-xs text-rose-500">{info.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {proposal.optionalHQs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Optional — add anytime</p>
                <div className="space-y-2">
                  {proposal.optionalHQs.map(hq => {
                    const info = HQ_DISPLAY[hq] || { label: hq, icon: "📦", description: "" };
                    return (
                      <label
                        key={hq}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          selectedHQs.includes(hq)
                            ? "bg-rose-50 border-rose-200"
                            : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedHQs.includes(hq)}
                          onChange={() => toggleHQ(hq)}
                          className="w-4 h-4 accent-rose-500 rounded"
                        />
                        <span className="text-xl">{info.icon}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-700">{info.label}</p>
                          <p className="text-xs text-gray-500">{info.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              onClick={applyConfig}
              loading={isLoading}
              className="w-full"
            >
              ✨ Apply & Set Up Workspace
            </Button>
            <button
              onClick={() => setShowDemoPreview(true)}
              className="w-full text-sm text-violet-500 hover:text-violet-700 transition-colors py-2 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 font-medium"
            >
              👀 Preview Demo Workspace first
            </button>
          </div>
        )}

        {/* ── Confirmation (Phase: complete) ──────────────────────── */}
        {allDone && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100 p-8 text-center mb-6 animate-scaleIn">
            <div className="inline-block mb-4">
              <Novi expression="celebrating" size="lg" animated />
            </div>
            <h2 className="text-xl font-heading font-semibold text-rose-700 mb-2">
              Your workspace is ready! 🎉
            </h2>
            <p className="text-rose-500 text-sm mb-6 max-w-md mx-auto">
              I've set everything up based on how you described your business.
              You can always adjust settings later — ShimmerStock grows with you.
            </p>
            <div className="space-y-3">
              <Button
                onClick={() => navigate("/bestie")}
                className="w-full"
              >
                Go to Dashboard
              </Button>
              <button
                onClick={() => navigate("/settings")}
                className="text-sm text-rose-400 hover:text-rose-600 transition-colors underline underline-offset-2"
              >
                Fine-tune settings
              </button>
            </div>
          </div>
        )}

        {/* ── Input Area ──────────────────────────────────────────── */}
        {(phase === "greeting" || phase === "clarification") && !allDone && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100 p-4">
            <div className="flex gap-3 items-end">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  phase === "greeting"
                    ? "I make handmade soy candles and sell them on Shopify..."
                    : "That's right! I also sell at local markets on weekends..."
                }
                rows={2}
                disabled={isLoading}
                className="flex-1 resize-none rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-800 placeholder-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent disabled:opacity-50"
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                loading={isLoading}
                className="flex-shrink-0"
              >
                Send
              </Button>
            </div>
            <p className="text-xs text-rose-300 mt-2 text-center">
              Press Enter to send · Be natural, just like talking to a friend
            </p>
          </div>
        )}

        {/* ── Progress Dots ───────────────────────────────────────── */}
        {!allDone && (
          <div className="flex justify-center gap-2 mt-6">
            {["greeting", "clarification", "proposal", "complete"].map((p, i) => (
              <div
                key={p}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  phase === p
                    ? "bg-rose-500 scale-125"
                    : ["greeting", "clarification", "proposal", "complete"].indexOf(phase) > i
                    ? "bg-rose-300"
                    : "bg-rose-200"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
