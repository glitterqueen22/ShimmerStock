import { useState, useEffect, useRef, useCallback } from "react";
import { apiGet, apiPost, apiDelete } from "../lib/api";
import { PageHeader, Button, Tabs, ConfirmModal, Skeleton, EmptyState, ErrorBanner, useToast, SearchBar } from "../components/ui";

// ── Types ───────────────────────────────────────────────────────────

interface FormulaInput {
  key: string;
  label: string;
  type: string;
  unit?: string;
  default?: number;
  min?: number;
  max?: number;
}

interface Formula {
  id: number;
  business_id: number;
  name: string;
  description: string | null;
  category: string;
  template_id: string | null;
  inputs: FormulaInput[];
  output_expression: string;
  output_label: string;
  output_unit: string | null;
  is_public: number;
  created_at: string;
}

interface ExecuteResult {
  formulaId: number;
  formulaName: string;
  inputs: Record<string, number>;
  result: number;
  outputLabel: string;
  outputUnit: string | null;
}

interface ValidationResult {
  valid: boolean;
  errors: { message: string; variable?: string }[];
  variablesUsed: string[];
}

// ── Category helpers ─────────────────────────────────────────────────

const categoryColors: Record<string, string> = {
  craft: "bg-pink-100 text-pink-700 border-pink-200",
  pricing: "bg-green-100 text-green-700 border-green-200",
  production: "bg-blue-100 text-blue-700 border-blue-200",
  custom: "bg-purple-100 text-purple-700 border-purple-200",
};

const categoryIcons: Record<string, string> = {
  craft: "🎨",
  pricing: "💰",
  production: "🏭",
  custom: "⚙️",
};

const CATEGORIES = ["craft", "pricing", "production", "custom"];

function getCategoryColor(cat: string) {
  return categoryColors[cat] || categoryColors.custom;
}

function getCategoryIcon(cat: string) {
  return categoryIcons[cat] || "⚙️";
}

// ── Component ───────────────────────────────────────────────────────

export default function Calculation() {
  const { toast } = useToast();
  const [tab, setTab] = useState<string>("formulas");
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [templates, setTemplates] = useState<Formula[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculator view
  const [selectedFormula, setSelectedFormula] = useState<Formula | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Search
  const [formulaSearch, setFormulaSearch] = useState("");

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<Formula | null>(null);

  // ── Builder state ──────────────────────────────────────────────────

  const [builderInputs, setBuilderInputs] = useState<FormulaInput[]>([
    { key: "volume", label: "Volume", type: "number", unit: "oz", default: 4, min: 0, max: undefined },
    { key: "density", label: "Density", type: "number", unit: "oz/fl_oz", default: 0.8, min: 0, max: undefined },
    { key: "molds", label: "Number of molds", type: "number", unit: "", default: 12, min: 0, max: undefined },
    { key: "waste", label: "Waste percentage", type: "number", unit: "%", default: 5, min: 0, max: 100 },
  ]);
  const [builderExpression, setBuilderExpression] = useState("(volume * density * molds) * (1 + waste/100)");
  const [builderOutputLabel, setBuilderOutputLabel] = useState("Total weight");
  const [builderOutputUnit, setBuilderOutputUnit] = useState("oz");
  const [builderName, setBuilderName] = useState("");
  const [builderDescription, setBuilderDescription] = useState("");
  const [builderCategory, setBuilderCategory] = useState("craft");
  const [builderIsTemplate, setBuilderIsTemplate] = useState(false);
  const [saving, setSaving] = useState(false);

  const exprRef = useRef<HTMLTextAreaElement>(null);

  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [previewResult, setPreviewResult] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [unknownVars, setUnknownVars] = useState<Set<string>>(new Set());

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [formulasData, templatesData] = await Promise.all([
        apiGet<Formula[]>("/api/calc/formulas"),
        apiGet<Formula[]>("/api/calc/templates"),
      ]);
      setFormulas(formulasData);
      setTemplates(templatesData);
    } catch (err: any) {
      setError(err.message || "Failed to load calculators");
    } finally {
      setLoading(false);
    }
  }

  function openCalculator(formula: Formula) {
    setSelectedFormula(formula);
    setResult(null);
    setCalcError(null);
    const defaults: Record<string, string> = {};
    for (const input of formula.inputs) {
      defaults[input.key] = input.default !== undefined ? String(input.default) : "";
    }
    setInputValues(defaults);
  }

  function updateInput(key: string, value: string) {
    setInputValues((prev) => ({ ...prev, [key]: value }));
    setResult(null);
    setCalcError(null);
  }

  async function handleCalculate() {
    if (!selectedFormula) return;
    setCalculating(true);
    setCalcError(null);
    setResult(null);
    try {
      const numericInputs: Record<string, number> = {};
      for (const input of selectedFormula.inputs) {
        const val = parseFloat(inputValues[input.key]);
        if (isNaN(val)) throw new Error(`"${input.label}" must be a number`);
        numericInputs[input.key] = val;
      }
      const data = await apiPost<ExecuteResult>("/api/calc/execute", {
        formulaId: selectedFormula.id,
        inputs: numericInputs,
      });
      setResult(data);
    } catch (err: any) {
      setCalcError(err.message || "Calculation failed");
    } finally {
      setCalculating(false);
    }
  }

  async function handleInstantiate(template: Formula) {
    try {
      const formula = await apiPost<Formula>(`/api/calc/templates/${template.template_id}/instantiate`);
      setFormulas((prev) => [formula, ...prev]);
      toast(`"${formula.name}" added to your formulas!`, "success");
    } catch (err: any) {
      toast(err.message || "Failed to add template", "error");
    }
  }

  async function handleDelete(formula: Formula) {
    try {
      await apiDelete(`/api/calc/formulas/${formula.id}`);
      setFormulas((prev) => prev.filter((f) => f.id !== formula.id));
      if (selectedFormula?.id === formula.id) {
        setSelectedFormula(null);
        setResult(null);
      }
      toast("Formula deleted", "success");
      setConfirmDelete(null);
    } catch (err: any) {
      toast(err.message || "Failed to delete", "error");
    }
  }

  function formatNumber(n: number): string {
    if (Number.isInteger(n)) return n.toString();
    return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }

  // ── Builder helpers ────────────────────────────────────────────────

  function labelToKey(label: string): string {
    const cleaned = label.replace(/[^a-zA-Z0-9 ]/g, "");
    const parts = cleaned.split(/\s+/);
    if (parts.length === 1) return parts[0].toLowerCase();
    return parts
      .map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
      .join("");
  }

  function addInput() {
    const newLabel = `Input ${builderInputs.length + 1}`;
    const newKey = labelToKey(newLabel);
    setBuilderInputs((prev) => [
      ...prev,
      { key: newKey, label: newLabel, type: "number", unit: "", default: 0, min: undefined, max: undefined },
    ]);
  }

  function removeInput(idx: number) {
    setBuilderInputs((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateBuilderInput(idx: number, field: keyof FormulaInput, value: any) {
    setBuilderInputs((prev) =>
      prev.map((inp, i) => {
        if (i !== idx) return inp;
        const updated = { ...inp, [field]: value };
        if (field === "label") {
          const oldAutoKey = labelToKey(inp.label);
          if (inp.key === oldAutoKey || inp.key === "" || !inp.key) {
            updated.key = labelToKey(value);
          }
        }
        return updated;
      })
    );
  }

  function insertVariable(variable: string) {
    const textarea = exprRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = builderExpression.substring(0, start);
    const after = builderExpression.substring(end);
    const newExpr = before + variable + after;
    setBuilderExpression(newExpr);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = start + variable.length;
      textarea.selectionEnd = start + variable.length;
    }, 0);
  }

  const highlightExpression = useCallback((expr: string) => {
    if (!expr.trim()) {
      setUnknownVars(new Set());
      return;
    }
    const knownKeys = new Set(builderInputs.map((i) => i.key).filter(Boolean));
    const identRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
    const matches = expr.matchAll(identRegex);
    const unknown = new Set<string>();
    for (const m of matches) {
      if (!knownKeys.has(m[0])) {
        unknown.add(m[0]);
      }
    }
    setUnknownVars(unknown);
  }, [builderInputs]);

  useEffect(() => {
    highlightExpression(builderExpression);
  }, [builderExpression, highlightExpression]);

  function renderHighlightedExpression() {
    if (!builderExpression.trim()) return null;
    const identRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
    const parts: { text: string; isUnknown: boolean }[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    while ((match = identRegex.exec(builderExpression)) !== null) {
      if (match.index > lastIdx) {
        parts.push({ text: builderExpression.substring(lastIdx, match.index), isUnknown: false });
      }
      parts.push({ text: match[0], isUnknown: unknownVars.has(match[0]) });
      lastIdx = identRegex.lastIndex;
    }
    if (lastIdx < builderExpression.length) {
      parts.push({ text: builderExpression.substring(lastIdx), isUnknown: false });
    }
    return parts;
  }

  function handleDragStart(idx: number) { setDragIdx(idx); }
  function handleDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDragOverIdx(idx); }
  function handleDragLeave() { setDragOverIdx(null); }

  function handleDrop(idx: number) {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null); setDragOverIdx(null); return;
    }
    setBuilderInputs((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(dragIdx, 1);
      updated.splice(idx, 0, moved);
      return updated;
    });
    setDragIdx(null); setDragOverIdx(null);
  }

  function initPreview() {
    const defaults: Record<string, string> = {};
    for (const inp of builderInputs) {
      defaults[inp.key] = inp.default !== undefined ? String(inp.default) : "";
    }
    setPreviewValues(defaults);
    setPreviewResult(null);
    setPreviewError(null);
  }

  async function handlePreviewCalculate() {
    if (!builderExpression.trim()) {
      setPreviewError("Expression is required");
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewResult(null);
    try {
      const numericInputs: Record<string, number> = {};
      for (const inp of builderInputs) {
        const val = parseFloat(previewValues[inp.key]);
        if (isNaN(val)) throw new Error(`"${inp.label}" must be a number`);
        numericInputs[inp.key] = val;
      }
      const token = localStorage.getItem("shimmerstock_token");
      const res = await fetch("/api/calc/formulas/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ expression: builderExpression, inputs: builderInputs }),
      });
      const vData = await res.json();
      if (vData.valid) {
        try {
          const scope: Record<string, number> = { ...numericInputs };
          const fn = new Function(...Object.keys(scope), `return (${builderExpression});`);
          const computed = fn(...Object.values(scope));
          setPreviewResult(typeof computed === "number" ? Math.round(computed * 1e10) / 1e10 : computed);
        } catch {
          setPreviewError("Computation error");
        }
      } else {
        setPreviewError(vData.errors.map((e: any) => e.message).join("; "));
      }
    } catch (err: any) {
      setPreviewError(err.message || "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSave() {
    if (!builderName.trim()) { toast("Formula name is required", "error"); return; }
    if (!builderExpression.trim()) { toast("Expression is required", "error"); return; }
    if (builderInputs.length === 0) { toast("At least one input is required", "error"); return; }
    if (!builderOutputLabel.trim()) { toast("Output label is required", "error"); return; }

    setSaving(true);
    try {
      const vRes = await apiPost<ValidationResult>("/api/calc/formulas/validate", {
        expression: builderExpression,
        inputs: builderInputs,
      });
      if (!vRes.valid) {
        toast("Validation failed: " + vRes.errors.map((e) => e.message).join("; "), "error");
        setSaving(false);
        return;
      }

      const formula = await apiPost<Formula>("/api/calc/formulas", {
        name: builderName.trim(),
        description: builderDescription.trim() || null,
        category: builderCategory,
        inputs: builderInputs,
        outputExpression: builderExpression,
        outputLabel: builderOutputLabel.trim(),
        outputUnit: builderOutputUnit.trim() || null,
        isPublic: builderIsTemplate,
      });

      setFormulas((prev) => [formula, ...prev]);
      toast(`"${formula.name}" created!` + (builderIsTemplate ? " 🎉 Published as template!" : ""), "success");

      setBuilderName("");
      setBuilderDescription("");
      setBuilderExpression("");
      setBuilderOutputLabel("");
      setBuilderOutputUnit("");
      setBuilderInputs([]);
      setBuilderCategory("craft");
      setBuilderIsTemplate(false);
    } catch (err: any) {
      toast(err.message || "Failed to save formula", "error");
    } finally {
      setSaving(false);
    }
  }

  // ── Filtered formulas ─────────────────────────────────────────────

  const filteredFormulas = formulas.filter(f =>
    !formulaSearch || f.name.toLowerCase().includes(formulaSearch.toLowerCase())
  );

  // ── Tab config ─────────────────────────────────────────────────────

  const tabConfig = [
    { id: "formulas", label: "📐 My Formulas" },
    { id: "templates", label: "📚 Templates" },
    { id: "builder", label: "🔨 Builder" },
  ];

  // ── Loading / Error ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="🧮 Calculator" description="Define formulas, fill inputs, get instant results" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="🧮 Calculator" />
        <ErrorBanner message={error} onRetry={loadData} />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title="🧮 Calculator" description="Define formulas, fill inputs, get instant results" />

      {/* Tabs */}
      <Tabs tabs={tabConfig} active={tab} onChange={setTab} />

      {/* Templates Tab */}
      {tab === "templates" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="card-lift rounded-2xl bg-white border border-rose-100 p-5
                         hover:shadow-lg hover:border-rose-200 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{getCategoryIcon(t.category)}</span>
                <span className={`text-xs px-2 py-1 rounded-full border font-medium ${getCategoryColor(t.category)}`}>
                  {t.category}
                </span>
              </div>
              <h3 className="font-bold text-[#121212] text-lg font-[family-name:var(--font-heading)]">{t.name}</h3>
              {t.description && <p className="text-gray-500 text-sm mt-1 line-clamp-2">{t.description}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.inputs.slice(0, 4).map((inp) => (
                  <span key={inp.key} className="text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full border border-rose-100">
                    {inp.label}{inp.unit ? ` (${inp.unit})` : ""}
                  </span>
                ))}
                {t.inputs.length > 4 && <span className="text-xs text-rose-400">+{t.inputs.length - 4} more</span>}
              </div>
              <Button variant="primary" onClick={() => handleInstantiate(t)} className="mt-4 w-full">
                ➕ Add to My Formulas
              </Button>
            </div>
          ))}
          {templates.length === 0 && (
            <div className="col-span-full">
              <EmptyState icon="🧮" title="No templates available" description="Templates help you get started quickly — check back soon!" />
            </div>
          )}
        </div>
      )}

      {/* My Formulas Tab */}
      {tab === "formulas" && !selectedFormula && (
        <div className="space-y-4">
          {formulas.length > 0 && (
            <SearchBar value={formulaSearch} onChange={setFormulaSearch} placeholder="Search formulas..." />
          )}
          {filteredFormulas.length === 0 && formulaSearch ? (
            <EmptyState icon="🔍" title="No matching formulas" description="Try a different search term" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredFormulas.map((f) => (
                <div
                  key={f.id}
                  className="card-lift rounded-2xl bg-white border border-rose-100 p-5 cursor-pointer
                             hover:shadow-lg hover:border-rose-200 transition-all duration-300"
                  onClick={() => openCalculator(f)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-2xl">{getCategoryIcon(f.category)}</span>
                    <span className={`text-xs px-2 py-1 rounded-full border font-medium ${getCategoryColor(f.category)}`}>
                      {f.category}
                    </span>
                  </div>
                  <h3 className="font-bold text-[#121212] text-lg font-[family-name:var(--font-heading)]">{f.name}</h3>
                  {f.description && <p className="text-gray-500 text-sm mt-1 line-clamp-2">{f.description}</p>}
                  <div className="mt-3 flex items-center gap-2 text-sm text-rose-400">
                    <span>→ {f.output_label}</span>
                    {f.output_unit && <span className="text-rose-300">({f.output_unit})</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {f.inputs.slice(0, 3).map((inp) => (
                      <span key={inp.key} className="text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full border border-rose-100">
                        {inp.label}
                      </span>
                    ))}
                    {f.inputs.length > 3 && <span className="text-xs text-rose-400">+{f.inputs.length - 3} inputs</span>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); openCalculator(f); }}
                    >
                      ✏️ Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(f); }}
                    >
                      🗑 Delete
                    </Button>
                  </div>
                </div>
              ))}
              {filteredFormulas.length === 0 && !formulaSearch && (
                <div className="col-span-full">
                  <EmptyState
                    icon="📐"
                    title="No formulas yet"
                    description='Switch to the Templates tab to add pre-built calculators, or use the Builder to create your own!'
                    action={{ label: "Browse Templates", onClick: () => setTab("templates") }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Calculator View */}
      {tab === "formulas" && selectedFormula && (
        <div className="card-lift rounded-2xl bg-white border border-rose-100 p-6 max-w-2xl">
          <Button variant="ghost" onClick={() => { setSelectedFormula(null); setResult(null); setCalcError(null); }}>
            ← Back to formulas
          </Button>

          <div className="flex items-center gap-3 mb-2 mt-2">
            <span className="text-3xl">{getCategoryIcon(selectedFormula.category)}</span>
            <div>
              <h2 className="text-xl font-bold font-[family-name:var(--font-heading)] text-[#121212]">{selectedFormula.name}</h2>
              {selectedFormula.description && <p className="text-gray-500 text-sm">{selectedFormula.description}</p>}
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {selectedFormula.inputs.map((inp) => (
              <div key={inp.key}>
                <label className="block text-sm font-semibold text-rose-500 mb-1.5">
                  {inp.label}
                  {inp.unit ? <span className="text-rose-300 ml-1">({inp.unit})</span> : ""}
                </label>
                <input
                  type="number"
                  step="any"
                  value={inputValues[inp.key] ?? ""}
                  onChange={(e) => updateInput(inp.key, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCalculate(); }}
                  min={inp.min}
                  max={inp.max}
                  placeholder={inp.default !== undefined ? `Default: ${inp.default}` : "Enter value…"}
                  className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none transition-all duration-300 bg-rose-50/50 placeholder:text-rose-300"
                />
              </div>
            ))}
          </div>

          <Button variant="primary" loading={calculating} onClick={handleCalculate} className="mt-6 w-full">
            {calculating ? "Calculating…" : "✨ Calculate"}
          </Button>

          {calcError && <ErrorBanner message={calcError} className="mt-4" />}

          {result && (
            <div className="mt-6 p-6 bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-200 rounded-2xl text-center">
              <p className="text-sm text-rose-400 font-medium uppercase tracking-wide">{result.outputLabel}</p>
              <p className="text-5xl font-bold text-[#121212] mt-2 font-[family-name:var(--font-heading)]">{formatNumber(result.result)}</p>
              {result.outputUnit && <p className="text-lg text-rose-400 mt-1">{result.outputUnit}</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Builder Tab ─────────────────────────────────────────── */}
      {tab === "builder" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Inputs + Output */}
          <div className="lg:col-span-1 space-y-4">
            <div className="card-lift rounded-2xl bg-white border border-rose-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold font-[family-name:var(--font-heading)] text-[#121212] text-lg">📥 Inputs</h3>
                <Button variant="primary" size="sm" onClick={addInput}>+ Add</Button>
              </div>
              {builderInputs.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">No inputs yet. Click "Add" to define your first input.</p>
              )}
              <div className="space-y-3">
                {builderInputs.map((inp, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragLeave={handleDragLeave}
                    onDrop={() => handleDrop(idx)}
                    className={`rounded-xl border p-3 transition-all duration-200 ${
                      dragOverIdx === idx ? "border-rose-400 bg-rose-50 shadow-md" :
                      dragIdx === idx ? "border-rose-300 bg-rose-50/50 opacity-60" :
                      "border-rose-100 bg-rose-50/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-rose-400 font-semibold flex items-center gap-1">
                        <span className="cursor-grab">⋮⋮</span> Input {idx + 1}
                      </span>
                      <button onClick={() => removeInput(idx)} className="text-rose-400 hover:text-rose-600 transition-colors text-sm leading-none" title="Remove input">×</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-rose-400 font-medium mb-0.5">Label</label>
                        <input type="text" value={inp.label} onChange={(e) => updateBuilderInput(idx, "label", e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-rose-200 rounded-lg text-xs focus:border-rose-400 focus:ring-1 focus:ring-rose-200 outline-none bg-white" placeholder="Volume" />
                      </div>
                      <div>
                        <label className="block text-xs text-rose-400 font-medium mb-0.5">Key</label>
                        <input type="text" value={inp.key} onChange={(e) => updateBuilderInput(idx, "key", e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                          className="w-full px-2.5 py-1.5 border border-rose-200 rounded-lg text-xs focus:border-rose-400 focus:ring-1 focus:ring-rose-200 outline-none bg-white font-mono" placeholder="volume" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div>
                        <label className="block text-xs text-rose-400 font-medium mb-0.5">Unit</label>
                        <input type="text" value={inp.unit || ""} onChange={(e) => updateBuilderInput(idx, "unit", e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-rose-200 rounded-lg text-xs focus:border-rose-400 focus:ring-1 focus:ring-rose-200 outline-none bg-white" placeholder="oz" />
                      </div>
                      <div>
                        <label className="block text-xs text-rose-400 font-medium mb-0.5">Default</label>
                        <input type="number" step="any" value={inp.default ?? ""}
                          onChange={(e) => updateBuilderInput(idx, "default", e.target.value === "" ? undefined : parseFloat(e.target.value))}
                          className="w-full px-2.5 py-1.5 border border-rose-200 rounded-lg text-xs focus:border-rose-400 focus:ring-1 focus:ring-rose-200 outline-none bg-white" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs text-rose-400 font-medium mb-0.5">Min</label>
                        <input type="number" step="any" value={inp.min ?? ""}
                          onChange={(e) => updateBuilderInput(idx, "min", e.target.value === "" ? undefined : parseFloat(e.target.value))}
                          className="w-full px-2.5 py-1.5 border border-rose-200 rounded-lg text-xs focus:border-rose-400 focus:ring-1 focus:ring-rose-200 outline-none bg-white" placeholder="—" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-lift rounded-2xl bg-white border border-rose-100 p-5">
              <h3 className="font-bold font-[family-name:var(--font-heading)] text-[#121212] text-lg mb-4">📤 Output</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-rose-500 font-semibold mb-1">Output Label</label>
                  <input type="text" value={builderOutputLabel} onChange={(e) => setBuilderOutputLabel(e.target.value)}
                    className="touch-target w-full px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none bg-rose-50/50" placeholder="Total Weight Needed" />
                </div>
                <div>
                  <label className="block text-sm text-rose-500 font-semibold mb-1">Output Unit</label>
                  <input type="text" value={builderOutputUnit} onChange={(e) => setBuilderOutputUnit(e.target.value)}
                    className="touch-target w-full px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none bg-rose-50/50" placeholder="oz" />
                </div>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card-lift rounded-2xl bg-white border border-rose-100 p-5">
              <h3 className="font-bold font-[family-name:var(--font-heading)] text-[#121212] text-lg mb-4">✏️ Expression</h3>
              {builderInputs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className="text-xs text-rose-400 mr-1 self-center">Insert:</span>
                  {builderInputs.map((inp) => (
                    <button key={inp.key} onClick={() => insertVariable(inp.key)}
                      className="px-2.5 py-1 text-xs bg-rose-100 text-rose-700 rounded-full hover:bg-rose-200 hover:text-rose-800 transition-all font-mono font-medium cursor-pointer active:scale-95"
                      title={`Insert ${inp.key} at cursor`}>{inp.key}</button>
                  ))}
                </div>
              )}
              <textarea ref={exprRef} value={builderExpression} onChange={(e) => setBuilderExpression(e.target.value)}
                className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none bg-rose-50/50 font-mono min-h-[80px] resize-y"
                placeholder="(volume * density * molds) * (1 + waste/100)" rows={3} />
              {builderExpression.trim() && (
                <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-400 mb-1 font-medium">Preview:</p>
                  <p className="text-sm font-mono break-all">
                    {renderHighlightedExpression()?.map((part, i) =>
                      part.isUnknown ? (
                        <span key={i} className="text-red-500 bg-red-50 px-0.5 rounded underline decoration-wavy decoration-red-400">{part.text}</span>
                      ) : (<span key={i}>{part.text}</span>)
                    )}
                  </p>
                  {unknownVars.size > 0 && (
                    <p className="text-xs text-red-400 mt-1.5">
                      ⚠️ Unknown variables:{" "}
                      {Array.from(unknownVars).map((v, i) => (<span key={v}><code className="bg-red-50 px-1 rounded">{v}</code>{i < unknownVars.size - 1 ? ", " : ""}</span>))}
                    </p>
                  )}
                  {unknownVars.size === 0 && builderInputs.length > 0 && <p className="text-xs text-success mt-1.5">✅ All variables defined</p>}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="text-xs text-rose-400 mr-1 self-center">Operators:</span>
                {["+", "-", "*", "/", "%", "(", ")"].map((op) => (
                  <span key={op} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded font-mono">{op}</span>
                ))}
              </div>
            </div>

            <div className="card-lift rounded-2xl bg-white border border-rose-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold font-[family-name:var(--font-heading)] text-[#121212] text-lg">🧪 Test Formula</h3>
                <Button variant="secondary" size="sm" onClick={initPreview}>Reset Defaults</Button>
              </div>
              {builderInputs.length === 0 && <p className="text-gray-400 text-sm">Add inputs above to test the formula.</p>}
              {builderInputs.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {builderInputs.map((inp) => (
                    <div key={inp.key}>
                      <label className="block text-xs text-rose-500 font-semibold mb-1">{inp.label}{inp.unit ? <span className="text-rose-300 ml-0.5">({inp.unit})</span> : ""}</label>
                      <input type="number" step="any" value={previewValues[inp.key] ?? ""}
                        onChange={(e) => { setPreviewValues((prev) => ({ ...prev, [inp.key]: e.target.value })); setPreviewResult(null); setPreviewError(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") handlePreviewCalculate(); }}
                        className="touch-target w-full px-3 py-2 border border-rose-200 rounded-lg text-sm focus:border-rose-400 focus:ring-1 focus:ring-rose-200 outline-none bg-rose-50/50"
                        placeholder={inp.default !== undefined ? String(inp.default) : "0"} />
                    </div>
                  ))}
                </div>
              )}
              <Button variant="primary" loading={previewLoading} onClick={handlePreviewCalculate} disabled={builderInputs.length === 0} className="w-full">
                {previewLoading ? "Calculating…" : "🔍 Calculate Preview"}
              </Button>
              {previewError && <ErrorBanner message={previewError} className="mt-3" />}
              {previewResult !== null && (
                <div className="mt-4 p-4 bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-200 rounded-xl text-center">
                  <p className="text-xs text-rose-400 font-medium uppercase tracking-wide">{builderOutputLabel || "Result"}</p>
                  <p className="text-3xl font-bold text-[#121212] mt-1 font-[family-name:var(--font-heading)]">{formatNumber(previewResult)}</p>
                  {builderOutputUnit && <p className="text-sm text-rose-400 mt-0.5">{builderOutputUnit}</p>}
                </div>
              )}
            </div>

            <div className="card-lift rounded-2xl bg-white border border-rose-100 p-5">
              <h3 className="font-bold font-[family-name:var(--font-heading)] text-[#121212] text-lg mb-4">💾 Save Formula</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-rose-500 font-semibold mb-1">Name <span className="text-red-400">*</span></label>
                  <input type="text" value={builderName} onChange={(e) => setBuilderName(e.target.value)}
                    className="touch-target w-full px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none bg-rose-50/50" placeholder="My Custom Calculator" />
                </div>
                <div>
                  <label className="block text-sm text-rose-500 font-semibold mb-1">Description</label>
                  <textarea value={builderDescription} onChange={(e) => setBuilderDescription(e.target.value)}
                    className="touch-target w-full px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none bg-rose-50/50 resize-y min-h-[60px]" placeholder="Describe what this calculator does..." rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-rose-500 font-semibold mb-1">Category</label>
                    <select value={builderCategory} onChange={(e) => setBuilderCategory(e.target.value)}
                      className="touch-target w-full px-4 py-2.5 border border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none bg-rose-50/50">
                      {CATEGORIES.map((c) => (<option key={c} value={c}>{getCategoryIcon(c)} {c.charAt(0).toUpperCase() + c.slice(1)}</option>))}
                    </select>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={builderIsTemplate} onChange={(e) => setBuilderIsTemplate(e.target.checked)}
                        className="w-4 h-4 rounded border-rose-300 text-rose-500 focus:ring-rose-300" />
                      <span className="text-sm text-rose-500 font-semibold">🌐 Save as Template</span>
                    </label>
                  </div>
                </div>
              </div>
              <Button variant="primary" loading={saving} onClick={handleSave} className="mt-5 w-full">
                {saving ? "Saving…" : "💾 Save & Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Modal ─────────────────────────────────────── */}
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { if (confirmDelete) { return handleDelete(confirmDelete); } }}
        title="Delete Formula"
        message={`Delete "${confirmDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
