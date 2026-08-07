/**
 * ShopifyPilotReadiness — all 14 connection states with READ-ONLY EARLY ACCESS labeling.
 *
 * This component never triggers any real Shopify action.
 * Actual app installation only happens after branch review, merge, deploy,
 * and pilot-readiness report approval.
 */
import { useState } from "react";
import Novi from "./Novi";

export type ShopifyConnectionState =
  | "disconnected"
  | "ready_to_connect"
  | "oauth_starting"
  | "connecting"
  | "readonly_connected"
  | "initial_sync"
  | "synced"
  | "reconciliation_required"
  | "reconciliation_complete"
  | "token_revoked"
  | "connection_error"
  | "reconnecting"
  | "disconnecting"
  | "no_write_mode";

interface PilotReadinessItem {
  id: string;
  label: string;
  description: string;
  status: "complete" | "pending" | "blocked";
}

interface ShopifyPilotReadinessProps {
  connectionState?: ShopifyConnectionState;
  shopDomain?: string | null;
  lastSyncedAt?: string | null;
  syncError?: string | null;
  scopes?: string[];
  /** Show full pilot checklist (for Settings / Commerce page) */
  showChecklist?: boolean;
}

const STATE_CONFIG: Record<ShopifyConnectionState, {
  title: string;
  description: string;
  icon: string;
  color: string; // Tailwind border + bg prefix
  noviMessage: string;
  actionLabel?: string;
}> = {
  disconnected: {
    title: "Not connected",
    description: "No Shopify store is connected. ShimmerStock is running in standalone mode.",
    icon: "🔌",
    color: "neutral",
    noviMessage: "When you're ready to connect your Shopify store, I'll guide you through the read-only setup. Nothing gets written to your store until you explicitly approve it.",
  },
  ready_to_connect: {
    title: "Ready to connect",
    description: "Your ShimmerStock workspace is prepared for a Shopify read-only connection.",
    icon: "✅",
    color: "green",
    noviMessage: "Everything is in place. Start the connection when you're ready — it's read-only, so nothing on your store will change.",
    actionLabel: "Connect Shopify",
  },
  oauth_starting: {
    title: "Starting connection",
    description: "Redirecting to Shopify to authorize read-only access.",
    icon: "🔄",
    color: "blue",
    noviMessage: "You're being redirected to Shopify. You'll authorize four read-only scopes. ShimmerStock will not request any write permissions.",
  },
  connecting: {
    title: "Connecting...",
    description: "ShimmerStock is verifying the connection and confirming read-only scope.",
    icon: "⏳",
    color: "blue",
    noviMessage: "Almost there — I'm verifying the connection and making sure no write scopes were granted. This usually takes a few seconds.",
  },
  readonly_connected: {
    title: "Read-only connected",
    description: "Connected to Shopify in read-only mode. ShimmerStock can read orders, products, inventory, and locations.",
    icon: "🔒",
    color: "green",
    noviMessage: "Connected. I can see your Shopify store data — orders, products, inventory, and locations. ShimmerStock will never write to your store without your explicit approval.",
  },
  initial_sync: {
    title: "Initial import in progress",
    description: "Importing your Shopify data for the first time. This may take a few minutes.",
    icon: "📥",
    color: "blue",
    noviMessage: "I'm importing your orders, products, inventory, and locations from Shopify. No changes are being made to your store.",
  },
  synced: {
    title: "Synced",
    description: "Your Shopify data is up to date in ShimmerStock.",
    icon: "✅",
    color: "green",
    noviMessage: "Everything is in sync. Your Shopify orders, products, and inventory are reflected here.",
  },
  reconciliation_required: {
    title: "Reconciliation needed",
    description: "ShimmerStock data has drifted from Shopify. A reconciliation pass is recommended.",
    icon: "⚠️",
    color: "amber",
    noviMessage: "I noticed some differences between what I have and what Shopify is showing. A reconciliation pass will re-align everything — no store changes needed.",
    actionLabel: "Start Reconciliation",
  },
  reconciliation_complete: {
    title: "Reconciliation complete",
    description: "ShimmerStock data is reconciled with Shopify.",
    icon: "✅",
    color: "green",
    noviMessage: "Reconciliation finished. Data is aligned.",
  },
  token_revoked: {
    title: "Access revoked",
    description: "The Shopify authorization token has been revoked. Reconnect to restore read-only access.",
    icon: "🔑",
    color: "red",
    noviMessage: "Shopify revoked the access token — this usually means the app was uninstalled from your store or permissions changed. You'll need to reconnect.",
    actionLabel: "Reconnect",
  },
  connection_error: {
    title: "Connection error",
    description: "ShimmerStock encountered an error communicating with Shopify.",
    icon: "❌",
    color: "red",
    noviMessage: "Something went wrong with the Shopify connection. I've logged the details. Check the sync log for more information.",
    actionLabel: "View Sync Log",
  },
  reconnecting: {
    title: "Reconnecting...",
    description: "Re-establishing the read-only connection with Shopify.",
    icon: "🔄",
    color: "blue",
    noviMessage: "Re-establishing read-only access. This will not change anything on your store.",
  },
  disconnecting: {
    title: "Disconnecting...",
    description: "Removing ShimmerStock's read-only access from Shopify.",
    icon: "🔌",
    color: "neutral",
    noviMessage: "Disconnecting. Your Shopify store remains completely unchanged — I only remove my own access token.",
  },
  no_write_mode: {
    title: "Read-only mode enforced",
    description: "Write operations are blocked. ShimmerStock is operating in read-only mode.",
    icon: "🚫",
    color: "violet",
    noviMessage: "Write mode is intentionally disabled. ShimmerStock will never modify your Shopify store in this phase.",
  },
};

const PILOT_CHECKLIST: PilotReadinessItem[] = [
  { id: "app_version", label: "App version and configuration verified", description: "ShimmerStock Read-Only Pilot app is on the latest version", status: "pending" },
  { id: "scopes", label: "Exact four read-only scopes confirmed", description: "read_orders, read_products, read_inventory, read_locations — no write scopes", status: "pending" },
  { id: "staging_healthy", label: "Private staging environment is healthy", description: "All P0 checks pass on the staging environment", status: "pending" },
  { id: "fake_data_mapped", label: "Fake-data workspaces mapped to separate businesses", description: "Craft Supplies test store → Business A; E-commerce test store → Business B", status: "pending" },
  { id: "tenant_separation", label: "Tenant-separation tests green", description: "No data leakage between tenants in test runs", status: "pending" },
  { id: "zero_write_tests", label: "Zero-write tests green", description: "All write endpoints and mutations are rejected in read-only mode", status: "pending" },
  { id: "oauth_tests", label: "OAuth / replay / scope tests green", description: "Token handling, state replay, scope enforcement all pass", status: "pending" },
  { id: "disconnect_documented", label: "Disconnect and rollback documented", description: "Step-by-step guide for revoking and recovering from a connection", status: "pending" },
  { id: "owner_approval", label: "Owner approval received", description: "Owner has reviewed pilot readiness report and approved actual installation", status: "pending" },
];

const SCOPES_APPROVED = ["read_orders", "read_products", "read_inventory", "read_locations"];

export default function ShopifyPilotReadiness({
  connectionState = "disconnected",
  shopDomain,
  lastSyncedAt,
  syncError,
  scopes = [],
  showChecklist = false,
}: ShopifyPilotReadinessProps) {
  const [checklistExpanded, setChecklistExpanded] = useState(false);
  const config = STATE_CONFIG[connectionState];

  const colorMap: Record<string, { bg: string; border: string; badge: string }> = {
    neutral: { bg: "bg-neutral-50", border: "border-neutral-200", badge: "bg-neutral-100 text-neutral-700" },
    green:   { bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700" },
    blue:    { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700" },
    amber:   { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-700" },
    red:     { bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-700" },
    violet:  { bg: "bg-violet-50", border: "border-violet-200", badge: "bg-violet-100 text-violet-700" },
  };
  const colors = colorMap[config.color] ?? colorMap.neutral;

  // Determine if any unapproved scopes are present
  const unapprovedScopes = scopes.filter(s => !SCOPES_APPROVED.includes(s));

  return (
    <div className="space-y-4">
      {/* READ-ONLY EARLY ACCESS banner — always visible */}
      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden>🔒</span>
          <div>
            <p className="text-sm font-bold text-violet-800 uppercase tracking-wide">Read-Only Early Access</p>
            <p className="text-sm text-violet-700 mt-1">ShimmerStock will not:</p>
            <ul className="mt-1 text-xs text-violet-600 space-y-0.5 list-disc list-inside">
              <li>Publish products or edit Shopify product listings</li>
              <li>Change inventory quantities in Shopify</li>
              <li>Fulfill or cancel orders</li>
              <li>Issue refunds or contact customers</li>
              <li>Modify themes or store content</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Connection state card */}
      <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-5`}>
        <div className="flex items-start gap-4">
          <Novi
            expression={
              connectionState === "readonly_connected" || connectionState === "synced" ? "happy"
              : connectionState === "token_revoked" || connectionState === "connection_error" ? "concerned"
              : connectionState === "reconnecting" || connectionState === "connecting" ? "thinking"
              : "calm"
            }
            size="md"
            animated={connectionState === "connecting" || connectionState === "initial_sync" || connectionState === "reconnecting"}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg" aria-hidden>{config.icon}</span>
              <h3 className="text-base font-semibold text-neutral-900">{config.title}</h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${colors.badge}`}>
                {connectionState.replace(/_/g, " ")}
              </span>
            </div>

            <p className="text-sm text-neutral-700 mt-1.5">{config.description}</p>

            {/* Novi message */}
            <div className="mt-3 px-3 py-2.5 rounded-xl bg-white/70 border border-violet-100">
              <p className="text-xs font-semibold text-violet-500 mb-1">Novi says</p>
              <p className="text-sm text-neutral-700 italic">{config.noviMessage}</p>
            </div>

            {/* Shop details when connected */}
            {shopDomain && (
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-500">
                <span>🏪 {shopDomain}</span>
                {lastSyncedAt && <span>🕐 Last synced {new Date(lastSyncedAt).toLocaleString()}</span>}
              </div>
            )}

            {/* Scopes list */}
            {scopes.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-neutral-500 mb-1.5">Authorized scopes:</p>
                <div className="flex flex-wrap gap-1.5">
                  {scopes.map(scope => (
                    <span key={scope} className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium
                      ${SCOPES_APPROVED.includes(scope) ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {scope}
                    </span>
                  ))}
                  {unapprovedScopes.length > 0 && (
                    <span className="text-xs text-red-600 font-semibold">⚠️ Unapproved write scopes detected</span>
                  )}
                </div>
              </div>
            )}

            {/* Error details */}
            {syncError && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs text-red-700 font-medium">Error: {syncError}</p>
              </div>
            )}

            {/* Action button */}
            {config.actionLabel && (
              <button
                className="mt-3 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50"
                disabled={connectionState === "connecting" || connectionState === "oauth_starting" || connectionState === "reconnecting"}
              >
                {config.actionLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pilot readiness checklist */}
      {showChecklist && (
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <button
            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-neutral-50 transition-colors"
            onClick={() => setChecklistExpanded(e => !e)}
          >
            <div>
              <span className="text-sm font-bold text-neutral-800">Pilot Readiness Checklist</span>
              <span className="ml-2 text-xs text-neutral-400">
                {PILOT_CHECKLIST.filter(i => i.status === "complete").length}/{PILOT_CHECKLIST.length} complete
              </span>
            </div>
            <span className="text-neutral-400 text-sm">{checklistExpanded ? "▲" : "▼"}</span>
          </button>

          {checklistExpanded && (
            <div className="border-t border-neutral-100 divide-y divide-neutral-50">
              {PILOT_CHECKLIST.map(item => (
                <div key={item.id} className="px-5 py-3 flex items-start gap-3">
                  <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5
                    ${item.status === "complete" ? "bg-emerald-500 text-white" : item.status === "blocked" ? "bg-red-500 text-white" : "bg-neutral-200 text-neutral-500"}`}>
                    {item.status === "complete" ? "✓" : item.status === "blocked" ? "!" : "○"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900">{item.label}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{item.description}</p>
                  </div>
                </div>
              ))}
              <div className="px-5 py-4 bg-amber-50">
                <p className="text-xs text-amber-700 font-medium">
                  ⚠️ Actual app installation and development-store connections occur only after this branch is reviewed, merged, deployed, and the pilot-readiness report is approved by the owner.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
