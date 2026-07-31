import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";

// ── Types ────────────────────────────────────────────────────────────
interface IndustryConfig {
  id: string;
  name: string;
  icon: string;
  terminology: Record<string, string>;
  defaultEngines: string[];
  workflowOrder: string[];
  defaultUnits: string[];
}

interface Labels {
  [engineName: string]: string;
}

interface IndustryContextType {
  /** Current industry config (null = generic/default) */
  industry: IndustryConfig | null;
  /** All engine labels adapted for current industry */
  labels: Labels;
  /** Get the adapted label for an engine name */
  getLabel: (engineName: string) => string;
  /** Get the icon for an engine name */
  getIcon: (engineName: string) => string;
  /** Whether settings are loaded */
  loading: boolean;
  /** Refresh settings from server */
  refresh: () => Promise<void>;
}

const IndustryContext = createContext<IndustryContextType | null>(null);

// ── Default labels (same as server-side) ─────────────────────────────
const DEFAULT_LABELS: Labels = {
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
  novi: "Novi",
  timeline: "Timeline",
  opportunities: "Opportunities",
  audit: "Audit Log",
  sync: "Sync Log",
  settings: "Settings",
  fulfillment: "Fulfillment",
  team: "Team",
  studio: "Studio",
  partners: "Partners",
  growth: "Growth",
  brand_setup: "Brand Setup",
};

const DEFAULT_ICONS: Record<string, string> = {
  production: "🏭",
  purchasing: "📦",
  inventory: "📦",
  warehouse: "🏗️",
  commerce: "📋",
  orders: "📋",
  products: "📦",
  calculation: "🧮",
  shipping: "🚚",
  customer_service: "💬",
  marketing: "📢",
  affiliates: "🤝",
  supplier: "📦",
  novi: "✨",
  timeline: "📅",
  opportunities: "💡",
  audit: "🔍",
  sync: "🔄",
  settings: "⚙️",
  fulfillment: "📦",
  team: "👥",
  studio: "🎨",
  partners: "🤝",
  growth: "📈",
  brand_setup: "🎨",
};

export function IndustryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [industry, setIndustry] = useState<IndustryConfig | null>(null);
  const [labels, setLabels] = useState<Labels>(DEFAULT_LABELS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setIndustry(null);
      setLabels(DEFAULT_LABELS);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem("shimmerstock_token");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/business/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        // If 403 (no settings.read perm), just use defaults
        setIndustry(null);
        setLabels(DEFAULT_LABELS);
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (data.industryConfigId) {
        // Fetch full industry config
        const industryRes = await fetch(`/api/industry/${data.industryConfigId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (industryRes.ok) {
          const industryData = await industryRes.json();
          setIndustry(industryData);

          // Build labels: defaults overlaid with industry terminology
          const mergedLabels = { ...DEFAULT_LABELS };
          if (industryData.terminology) {
            for (const [key, value] of Object.entries(industryData.terminology)) {
              if (typeof value === "string") {
                mergedLabels[key] = value;
              }
            }
          }
          setLabels(mergedLabels);
        } else {
          setIndustry(null);
          setLabels(data.labels || DEFAULT_LABELS);
        }
      } else {
        setIndustry(null);
        setLabels(data.labels || DEFAULT_LABELS);
      }
    } catch {
      setIndustry(null);
      setLabels(DEFAULT_LABELS);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const getLabel = useCallback(
    (engineName: string): string => {
      return labels[engineName] || DEFAULT_LABELS[engineName] || engineName;
    },
    [labels]
  );

  const getIcon = useCallback(
    (engineName: string): string => {
      return DEFAULT_ICONS[engineName] || "📦";
    },
    []
  );

  return (
    <IndustryContext.Provider
      value={{
        industry,
        labels,
        getLabel,
        getIcon,
        loading,
        refresh: fetchSettings,
      }}
    >
      {children}
    </IndustryContext.Provider>
  );
}

export function useIndustry() {
  const ctx = useContext(IndustryContext);
  if (!ctx) {
    throw new Error("useIndustry must be used within an IndustryProvider");
  }
  return ctx;
}
