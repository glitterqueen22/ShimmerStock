import { useState, useEffect } from "react";
import { useIndustry } from "../context/IndustryContext";
import { useAuth } from "../contexts/AuthContext";
import { PageHeader, Button, Badge, Skeleton, ErrorBanner, useToast } from "../components/ui";
import { apiFetch } from "../lib/api";

// ── Types ────────────────────────────────────────────────────────────
interface IndustryProfile {
  id: string;
  name: string;
  icon: string;
  terminology: Record<string, string>;
  defaultEngines: string[];
  workflowOrder: string[];
  defaultUnits: string[];
  createdAt: string;
}

// ── Default labels for diff display ──────────────────────────────────
const DEFAULT_LABELS: Record<string, string> = {
  production: "Production",
  purchasing: "Purchasing",
  inventory: "Inventory",
  warehouse: "Warehouse",
  commerce: "Commerce",
  orders: "Orders",
  products: "Products",
  calculation: "Calculation",
  shipping: "Shipping",
  customer_service: "Customer Service",
  marketing: "Marketing",
  affiliates: "Affiliates",
  supplier: "Supplier",
};

export default function Settings() {
  const { user } = useAuth();
  const { industry, labels, loading: industryLoading, refresh } = useIndustry();
  const { toast } = useToast();

  const [industries, setIndustries] = useState<IndustryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedIndustryId, setSelectedIndustryId] = useState<string | null>(
    industry?.id || null
  );
  const [previewIndustry, setPreviewIndustry] = useState<IndustryProfile | null>(null);

  // ── Fetch industries ───────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/api/industry")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load industries");
        return res.json();
      })
      .then((data) => {
        setIndustries(data.industries || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // ── Sync selected with current industry ────────────────────────────
  useEffect(() => {
    if (industry) {
      setSelectedIndustryId(industry.id);
    }
  }, [industry]);

  // ── Preview on hover/select ────────────────────────────────────────
  function handleSelect(industryId: string | null) {
    setSelectedIndustryId(industryId);
    if (industryId === null) {
      setPreviewIndustry(null);
    } else {
      const found = industries.find((i) => i.id === industryId);
      setPreviewIndustry(found || null);
    }
  }

  // ── Save ───────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    try {
      const res = await apiFetch("/api/business/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          industryConfigId: selectedIndustryId,
          settings: {},
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save settings");
      }

      await refresh();
      toast("Industry settings updated!", "success");
    } catch (err: any) {
      toast(err.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────
  if (loading || industryLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" icon="⚙️" />
        <div className="space-y-4">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" icon="⚙️" />
        <ErrorBanner message={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  // ── Build terminology diff ─────────────────────────────────────────
  const currentTerminology = industry?.terminology || {};
  const previewTerminology = previewIndustry?.terminology || {};
  const allTermKeys = Array.from(
    new Set([
      ...Object.keys(currentTerminology),
      ...Object.keys(previewTerminology),
      ...Object.keys(DEFAULT_LABELS),
    ])
  ).sort();

  function getDiff(key: string): "changed" | "added" | "removed" | "same" {
    const current = currentTerminology[key] || DEFAULT_LABELS[key] || key;
    const preview = previewTerminology[key] || DEFAULT_LABELS[key] || key;
    if (!previewIndustry) return "same";
    if (currentTerminology[key] && !previewTerminology[key]) return "removed";
    if (!currentTerminology[key] && previewTerminology[key]) return "added";
    if (current !== preview) return "changed";
    return "same";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        icon="⚙️"
        subtitle="Configure your business profile and industry adaptation"
      />

      {/* ── Industry Profile Section ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-rose-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🏭</span>
          <div>
            <h2 className="text-lg font-semibold text-neutral-800">
              Industry Profile
            </h2>
            <p className="text-sm text-neutral-500">
              Choose your industry to adapt ShimmerStock's language and workflows
            </p>
          </div>
        </div>

        {/* Current selection */}
        <div className="mb-6 p-4 bg-rose-50/50 rounded-lg border border-rose-100">
          <p className="text-sm text-rose-600 font-medium mb-1">Current Profile</p>
          <p className="text-lg font-semibold text-neutral-800">
            {industry ? (
              <>
                <span className="mr-2">{industry.icon}</span>
                {industry.name}
              </>
            ) : (
              "Generic / Default"
            )}
          </p>
        </div>

        {/* Industry cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {/* Generic option */}
          <button
            onClick={() => handleSelect(null)}
            className={`p-4 rounded-xl border-2 text-left transition-all duration-200
              ${selectedIndustryId === null
                ? "border-rose-400 bg-rose-50 shadow-sm shadow-rose-200/30"
                : "border-neutral-200 hover:border-rose-200 hover:bg-rose-50/30"
              }`}
          >
            <span className="text-2xl block mb-1">🌐</span>
            <span className="text-sm font-semibold text-neutral-700">Generic</span>
            <span className="text-xs text-neutral-400 block mt-0.5">Default labels</span>
          </button>

          {industries.map((ind) => (
            <button
              key={ind.id}
              onClick={() => handleSelect(ind.id)}
              className={`p-4 rounded-xl border-2 text-left transition-all duration-200
                ${selectedIndustryId === ind.id
                  ? "border-rose-400 bg-rose-50 shadow-sm shadow-rose-200/30"
                  : "border-neutral-200 hover:border-rose-200 hover:bg-rose-50/30"
                }`}
            >
              <span className="text-2xl block mb-1">{ind.icon}</span>
              <span className="text-sm font-semibold text-neutral-700">{ind.name}</span>
              <span className="text-xs text-neutral-400 block mt-0.5">
                {ind.defaultEngines.length} engines
              </span>
            </button>
          ))}
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-rose-500 hover:bg-rose-600 text-white"
          >
            {saving ? "Saving…" : "Save Settings"}
          </Button>
          {selectedIndustryId !== (industry?.id || null) && (
            <span className="text-sm text-amber-600">Unsaved changes</span>
          )}
        </div>
      </div>

      {/* ── Terminology Preview (if an industry is selected) ──────────── */}
      {previewIndustry && previewIndustry.id !== industry?.id && (
        <div className="bg-white rounded-xl border border-rose-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">📝</span>
            <div>
              <h2 className="text-lg font-semibold text-neutral-800">
                Terminology Changes
              </h2>
              <p className="text-sm text-neutral-500">
                Preview how labels will change with{" "}
                <strong>{previewIndustry.name}</strong>
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-2 px-3 text-neutral-500 font-medium">Engine</th>
                  <th className="text-left py-2 px-3 text-neutral-500 font-medium">
                    Current ({industry?.name || "Generic"})
                  </th>
                  <th className="text-left py-2 px-3 text-neutral-500 font-medium">
                    New ({previewIndustry.name})
                  </th>
                </tr>
              </thead>
              <tbody>
                {allTermKeys
                  .filter((key) => {
                    const diff = getDiff(key);
                    return diff !== "same" || previewTerminology[key];
                  })
                  .map((key) => {
                    const diff = getDiff(key);
                    const currentLabel = currentTerminology[key] || DEFAULT_LABELS[key] || key;
                    const previewLabel = previewTerminology[key] || DEFAULT_LABELS[key] || key;

                    return (
                      <tr key={key} className="border-b border-neutral-100">
                        <td className="py-2 px-3 font-medium text-neutral-700 capitalize">
                          {key.replace(/_/g, " ")}
                        </td>
                        <td className="py-2 px-3 text-neutral-600">{currentLabel}</td>
                        <td className="py-2 px-3">
                          <span
                            className={
                              diff === "changed"
                                ? "text-rose-600 font-medium"
                                : diff === "added"
                                ? "text-emerald-600 font-medium"
                                : diff === "removed"
                                ? "text-neutral-400 line-through"
                                : "text-neutral-600"
                            }
                          >
                            {previewLabel}
                          </span>
                          {diff === "changed" && (
                            <Badge engine="system" className="ml-2 text-xs">
                              changed
                            </Badge>
                          )}
                          {diff === "added" && (
                            <Badge engine="system" className="ml-2 text-xs">
                              new
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Current Labels (read-only) ────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-rose-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🏷️</span>
          <div>
            <h2 className="text-lg font-semibold text-neutral-800">
              Active Labels
            </h2>
            <p className="text-sm text-neutral-500">
              Current engine labels for your business
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => {
              const isAdapted = industry?.terminology?.[key];
              return (
                <div
                  key={key}
                  className={`p-3 rounded-lg border ${
                    isAdapted
                      ? "border-rose-200 bg-rose-50/50"
                      : "border-neutral-100 bg-neutral-50/50"
                  }`}
                >
                  <p className="text-xs text-neutral-400 capitalize">
                    {key.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm font-semibold text-neutral-700">{value}</p>
                  {isAdapted && (
                    <span className="text-xs text-rose-500">adapted</span>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* ── Business Info ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-rose-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🏢</span>
          <div>
            <h2 className="text-lg font-semibold text-neutral-800">Business</h2>
            <p className="text-sm text-neutral-500">Account details</p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-neutral-400">Business:</span>{" "}
            <span className="text-neutral-700 font-medium">
              {user?.business_name || "N/A"}
            </span>
          </p>
          <p>
            <span className="text-neutral-400">Your Role:</span>{" "}
            <span className="text-neutral-700 font-medium capitalize">
              {user?.business_role || user?.role || "N/A"}
            </span>
          </p>
          <p>
            <span className="text-neutral-400">Username:</span>{" "}
            <span className="text-neutral-700 font-medium">
              {user?.username || "N/A"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
