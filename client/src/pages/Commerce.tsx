import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, Button } from "../components/ui";
import Novi from "../components/Novi";
import ShopifyConnect from "../components/ShopifyConnect";
import ShopifyPilotReadiness from "../components/ShopifyPilotReadiness";
import type { ShopifyStatus } from "../components/ShopifyConnect";

/**
 * Non-Shopify commerce channels.
 * isSimulated: true means not yet connected to a live API — these are planned integrations.
 * maturityLabel: displayed in the UI to clearly communicate readiness.
 * An actionable Connect button is NEVER shown for simulated channels.
 */
const PLANNED_CHANNELS = [
  { slug: "etsy",        label: "Etsy",         icon: "🧶", description: "Handmade & vintage marketplace",  isSimulated: true, maturityLabel: "Planned" as const },
  { slug: "amazon",      label: "Amazon",        icon: "📦", description: "FBA/FBM marketplace",            isSimulated: true, maturityLabel: "Planned" as const },
  { slug: "tiktok-shop", label: "TikTok Shop",   icon: "🎵", description: "Social commerce marketplace",   isSimulated: true, maturityLabel: "Planned" as const },
  { slug: "woocommerce", label: "WooCommerce",   icon: "🛒", description: "WordPress-based store",         isSimulated: true, maturityLabel: "Planned" as const },
  { slug: "faire",       label: "Faire",         icon: "🏪", description: "Wholesale marketplace",         isSimulated: true, maturityLabel: "Planned" as const },
];

export default function Commerce() {
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);

  const handleConnected = useCallback((_: ShopifyStatus) => {
    setConnected(true);
  }, []);

  const handleDisconnected = useCallback(() => {
    setConnected(false);
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Commerce"
        description="Shopify read-only connection — Early Access"
        novi={<Novi size="sm" accessory="marketing" />}
        actions={
          connected && (
            <Button variant="secondary" onClick={() => navigate("/orders")}>
              View Orders →
            </Button>
          )
        }
      />

      {/* Pilot readiness states — always shown in Early Access */}
      <ShopifyPilotReadiness
        connectionState={connected ? "readonly_connected" : "disconnected"}
        showChecklist={!connected}
      />

      <ShopifyConnect
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onSyncComplete={() => {}}
      />

      {connected && (
        <div className="text-center pt-4">
          <Button variant="primary" onClick={() => navigate("/orders")} size="lg">
            Go to Orders Dashboard
          </Button>
        </div>
      )}

      {/* Planned integrations — isSimulated channels with maturityLabel shown clearly.
          No Connect button is shown for any simulated channel in a real workspace. */}
      <div className="mt-6">
        <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-widest mb-3 px-1">
          Coming Soon
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PLANNED_CHANNELS.filter(ch => ch.isSimulated).map(ch => (
            <div
              key={ch.slug}
              className="flex items-start gap-3 p-4 rounded-xl border border-neutral-200 bg-neutral-50 opacity-70"
              aria-label={`${ch.label} — ${ch.maturityLabel}`}
            >
              <span className="text-2xl" role="img" aria-hidden>{ch.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-700">{ch.label}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-200 text-neutral-500 uppercase tracking-wide">
                    {ch.maturityLabel}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5 truncate">{ch.description}</p>
                <p className="text-[11px] text-neutral-400 mt-1 italic">
                  Not yet available — no connection required
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}