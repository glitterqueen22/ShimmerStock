import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost } from "../lib/api";
import { Badge, Button, Skeleton, ErrorBanner, useToast, Modal, ConfirmModal } from "./ui";
import Novi from "./Novi";

// ── Types ─────────────────────────────────────────────────────────────

export interface ShopifyStatus {
  configured: boolean;
  connectionState: "disconnected" | "pending_validation" | "connected" | "failed";
  syncMode: "readonly" | "full";
  canWrite: boolean;
  shopDomain: string | null;
  shopName: string | null;
  shopOwner?: string | null;
  scopes: string | null;
  lastSyncedAt: string | null;
  syncStatus: string;
  syncError: string | null;
  isActive: boolean;
}

interface ShopifyConnectProps {
  /** Render in compact mode (for embedding in provider grids) */
  compact?: boolean;
  /** Called after a successful connection is detected */
  onConnected?: (status: ShopifyStatus) => void;
  /** Called after disconnect */
  onDisconnected?: () => void;
  /** Called when sync completes */
  onSyncComplete?: () => void;
}

// ── Helper ────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatScopes(scopes: string | null): string[] {
  if (!scopes) return [];
  return scopes.split(",").map((s) => s.trim()).filter(Boolean);
}

function scopeLabel(scope: string): string {
  const labels: Record<string, string> = {
    read_orders: "Read Orders",
    read_products: "Read Products",
    write_inventory: "Write Inventory",
    read_locations: "Read Locations",
    read_fulfillments: "Read Fulfillments",
    write_fulfillments: "Write Fulfillments",
    read_customers: "Read Customers",
    read_checkouts: "Read Checkouts",
  };
  return labels[scope] || scope.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function scopeColor(scope: string): "green" | "blue" | "purple" | "amber" | "slate" {
  if (scope.includes("write")) return "purple";
  if (scope.includes("read")) return "green";
  return "slate";
}

// ── Main Component ────────────────────────────────────────────────────

export default function ShopifyConnect({
  compact = false,
  onConnected,
  onDisconnected,
  onSyncComplete,
}: ShopifyConnectProps) {
  const { toast } = useToast();

  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connection form
  const [storeDomain, setStoreDomain] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  // Disconnect confirm
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // Celebration
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState("");
  // Mode toggle
  const [modeSwitching, setModeSwitching] = useState(false);
  const [showModeConfirm, setShowModeConfirm] = useState(false);

  // Safe Mode dismiss — persist across visits in localStorage
  const [safeModeDismissed, setSafeModeDismissed] = useState(() => {
    try { return localStorage.getItem("shimmerstock_safe_mode_dismissed") === "true"; }
    catch { return false; }
  });
  const dismissSafeMode = () => {
    setSafeModeDismissed(true);
    try { localStorage.setItem("shimmerstock_safe_mode_dismissed", "true"); }
    catch {}
  };

  // ── Fetch Status ──────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiGet<ShopifyStatus>("/api/shopify/status");
      setStatus(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to fetch Shopify status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ── URL Callback Detection ────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("shopify_connected");
    const errorCode = params.get("shopify_error");

    // Clear the params from URL immediately
    const url = new URL(window.location.href);
    url.searchParams.delete("shopify_connected");
    url.searchParams.delete("shopify_error");
    window.history.replaceState({}, "", url.toString());

    if (connected === "true") {
      setLoading(true);
      // Poll the status endpoint every 2 seconds until connectionState resolves
      let pollCount = 0;
      const maxPolls = 30; // 60 seconds max
      const pollInterval = setInterval(async () => {
        try {
          const data = await apiGet<ShopifyStatus>("/api/shopify/status");
          setStatus(data);
          pollCount++;

          if (data.connectionState === "connected") {
            clearInterval(pollInterval);
            setLoading(false);
            setSafeModeDismissed(false);
            try { localStorage.removeItem("shimmerstock_safe_mode_dismissed"); } catch {}
            const name = data.shopName || data.shopDomain || "your store";
            setCelebrationMessage(`You're connected! I can see ${name}. Would you like me to begin importing your products and orders now?`);
            setShowCelebration(true);
            onConnected?.(data);
          } else if (data.connectionState === "failed" || pollCount >= maxPolls) {
            clearInterval(pollInterval);
            setLoading(false);
            if (data.connectionState === "failed") {
              toast("Connection didn't complete. Let's try reconnecting your store.", "error");
            } else {
              toast("Connection is taking longer than expected. Please check the Commerce page in a moment.", "warning");
            }
          }
          // else: still pending_validation, keep polling
        } catch {
          pollCount++;
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            setLoading(false);
          }
        }
      }, 2000);

      return () => clearInterval(pollInterval);
    } else if (errorCode) {
      // Show a Novi-friendly message based on the error code
      const errorMessages: Record<string, string> = {
        validation_failed: "Shopify didn't confirm the connection. Let's try reconnecting your store.",
        connection_failed: "Something went wrong while connecting to Shopify. Let's give it another try.",
      };
      const message = errorMessages[errorCode] || "Couldn't connect to Shopify right now. Let's try again.";
      toast(message, "error");
    }
  }, []);

  // ── Sync polling ──────────────────────────────────────────────────

  useEffect(() => {
    if (!syncing) return;
    let interval: ReturnType<typeof setInterval>;
    let pollCount = 0;

    interval = setInterval(async () => {
      try {
        const data = await apiGet<ShopifyStatus>("/api/shopify/status");
        setStatus(data);
        pollCount++;

        if (data.syncStatus === "synced" || data.syncStatus === "error" || pollCount > 120) {
          // Stop polling
          setSyncing(false);
          setSyncProgress(null);
          if (data.syncStatus === "synced") {
            toast("Sync complete!", "success");
            onSyncComplete?.();
          } else if (data.syncError) {
            toast(data.syncError, "error");
          }
        } else {
          setSyncProgress(data.syncStatus === "syncing" ? "Syncing..." : "Preparing sync...");
        }
      } catch {
        // Keep polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [syncing, toast, onSyncComplete]);

  // ── Actions ───────────────────────────────────────────────────────

  const handleConnect = async () => {
    const domain = storeDomain.trim();
    if (!domain) {
      toast("Please enter your Shopify store domain", "error");
      return;
    }

    setConnecting(true);
    try {
      // Redirect to OAuth — pass token as query param so browser redirect works
      const token = localStorage.getItem("shimmerstock_token");
      const redirectUrl = `/api/shopify/auth?shop=${encodeURIComponent(domain)}&token=${encodeURIComponent(token || "")}`;
      window.location.href = redirectUrl;
      // Don't set connecting to false — we're leaving the page
    } catch (err: any) {
      toast(err.message || "Failed to initiate connection", "error");
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress("Starting sync...");
    try {
      const data = await apiPost("/api/commerce/providers/shopify/sync");
      if (data.success) {
        // Don't stop syncing yet — let the polling pick up the completion
        if (data.ordersImported !== undefined) {
          toast(`${data.ordersImported} orders imported`, "success");
        }
        // Refresh status
        fetchStatus();
      } else {
        setSyncing(false);
        setSyncProgress(null);
        toast(data.error || "Sync failed", "error");
      }
    } catch (err: any) {
      setSyncing(false);
      setSyncProgress(null);
      toast(err.message || "Sync failed", "error");
    }
  };

  const handleDisconnect = async () => {
    try {
      await apiPost("/api/shopify/disconnect");
      toast("Shopify disconnected", "info");
      setStatus(null);
      setShowDisconnectConfirm(false);
      onDisconnected?.();
      // Refetch
      fetchStatus();
    } catch (err: any) {
      toast(err.message || "Disconnect failed", "error");
    }
  };
  const handleSetMode = async (requestedMode: "readonly" | "full") => {
    setModeSwitching(true);
    try {
      const result = await apiPost<{ mode: "readonly" | "full"; canWrite: boolean }>("/api/shopify/sync-mode", { mode: requestedMode });
      // Use the server response as the source of truth — it reports the mode actually applied,
      // which may differ from the requested mode if server-side policy blocks full mode.
      const appliedMode = result?.mode;
      const appliedCanWrite = result?.canWrite === true;

      if (appliedMode === "full" && appliedCanWrite) {
        toast("Full Sync enabled — ShimmerStock can now write to Shopify", "success");
        dismissSafeMode();
      } else if (requestedMode === "full" && appliedMode !== "full") {
        // Full mode was requested but blocked by server policy — keep UI in Safe Mode.
        toast("Full Sync remains disabled. Shopify is still read-only.", "warning");
      } else {
        toast("Safe Mode enabled — read-only", "success");
      }

      fetchStatus();
    } catch (err: any) {
      toast(err.message || "Failed to update sync mode", "error");
      fetchStatus(); // refresh to reflect actual server state
    } finally {
      setModeSwitching(false);
      setShowModeConfirm(false);
    }
  };

  const handleReauthorize = () => {
    if (status?.shopDomain) {
      const token = localStorage.getItem("shimmerstock_token");
      window.location.href = `/api/shopify/auth?shop=${encodeURIComponent(status.shopDomain)}&token=${encodeURIComponent(token || "")}`;
    }
  };

  // ── Loading ──────────────────────────────────────────────────────

  if (loading) {
    if (compact) {
      return (
        <div className="rounded-xl p-4 border border-rose-100">
          <Skeleton variant="card" />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────

  if (error && !status) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-white p-5">
        <ErrorBanner message={error} onRetry={fetchStatus} />
      </div>
    );
  }

  const isConnected = status?.connectionState === "connected";
  const isFailed = status?.connectionState === "failed";
  const isPending = status?.connectionState === "pending_validation";
  const syncStatusBadge = (() => {
    if (!status?.syncStatus || status.syncStatus === "not_connected") return null;
    const map: Record<string, { label: string; color: "green" | "amber" | "blue" | "red" }> = {
      synced: { label: "Synced", color: "green" },
      syncing: { label: "Syncing...", color: "blue" },
      pending: { label: "Pending", color: "amber" },
      error: { label: "Error", color: "red" },
    };
    const m = map[status.syncStatus] || { label: status.syncStatus, color: "slate" as const };
    return <Badge status={m.color}>{m.label}</Badge>;
  })();

  // ── Compact Mode ─────────────────────────────────────────────────

  if (compact) {
    if (isConnected) {
      return (
        <div className="rounded-xl p-4 border-2 border-emerald-200 bg-emerald-50/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🛍️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#121212] truncate">
                ✅ {status!.shopName || status!.shopDomain}
              </p>
              <p className="text-xs text-emerald-600">Connected</p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
          </div>
          {status!.lastSyncedAt && (
            <p className="text-xs text-rose-300 mt-1 mb-2 text-center">
              Last sync: {formatDate(status!.lastSyncedAt)}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSync}
              loading={syncing}
              className="flex-1"
            >
              {syncing ? (syncProgress || "Syncing...") : "Sync"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDisconnectConfirm(true)}
              className="text-xs text-rose-400"
            >
              Disconnect
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl p-4 border border-rose-100 bg-white">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🛍️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#121212]">Shopify</p>
            <p className="text-xs text-rose-400">Not connected</p>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-rose-300 flex-shrink-0" />
        </div>
        <div className="mt-2 space-y-2">
          <input
            type="text"
            value={storeDomain}
            onChange={(e) => setStoreDomain(e.target.value)}
            placeholder="mystore.myshopify.com"
            className="w-full border border-rose-200 rounded-lg px-3 py-1.5 text-sm placeholder:text-rose-300"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConnect();
            }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleConnect}
            loading={connecting}
            className="w-full"
          >
            {connecting ? "Connecting..." : "Connect Shopify"}
          </Button>
        </div>
        <p className="text-xs text-rose-300 text-center mt-2">
          You'll be redirected to Shopify to authorize
        </p>
      </div>
    );
  }

  // ── Full Mode: Pending Validation ────────────────────────────────

  if (isPending) {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-amber-50 to-purple-50 rounded-2xl shadow-sm border border-amber-200 p-5 card-lift">
          <div className="flex items-start gap-4">
            <Novi expression="thinking" size="md" animated />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#121212] mb-1">
                🔄 Verifying your connection...
              </p>
              <p className="text-sm text-rose-500">
                Just making sure everything is set up correctly with Shopify. This should only take a moment.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-amber-600 font-medium">Verifying connection...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Full Mode: Connection Failed ──────────────────────────────────

  if (isFailed) {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl shadow-sm border-2 border-red-300 p-5 card-lift">
          <div className="flex items-start gap-4">
            <Novi expression="concerned" size="md" animated />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#121212] mb-1">
                ⚠️ Connection failed — reconnect required
              </p>
              <p className="text-sm text-rose-500 mb-1">
                Shopify didn't fully confirm the connection. This sometimes happens when permissions aren't fully granted.
              </p>
              {status?.syncError && (
                <p className="text-xs text-red-500 mt-1 font-mono bg-red-50 rounded px-2 py-1">
                  {status.syncError}
                </p>
              )}
              <div className="mt-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleReauthorize}
                >
                  Reconnect Shopify
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Full Mode: Not Connected ─────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="space-y-4">
        {/* Novi-guided setup */}
        <div className="bg-gradient-to-br from-purple-50 to-rose-50 rounded-2xl shadow-sm border border-rose-200 p-5 card-lift">
          <div className="flex items-start gap-4">
            <Novi expression="curious" size="md" animated accessory="marketing" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#121212] mb-1">
                💜 Let's connect your Shopify store!
              </p>
              <p className="text-sm text-rose-500">
                It's the fastest way to get your products, orders, and inventory flowing into ShimmerStock. What's your Shopify store domain?
              </p>
            </div>
          </div>
        </div>

        {/* Connection card */}
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
          <div className="px-5 py-4 border-b border-rose-100">
            <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">
              🛍️ Connect Your Shopify Store
            </h2>
          </div>
          <div className="p-6">
            <div className="max-w-md mx-auto space-y-4">
              <div>
                <label className="block text-sm font-semibold text-rose-600 mb-2">
                  Shopify Store Domain
                </label>
                <input
                  type="text"
                  value={storeDomain}
                  onChange={(e) => setStoreDomain(e.target.value)}
                  placeholder="mystore.myshopify.com"
                  className="w-full border-2 border-rose-200 rounded-xl px-4 py-3 text-sm focus:border-rose-400 focus:outline-none transition-colors placeholder:text-rose-300"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConnect();
                  }}
                />
                <p className="text-xs text-rose-400 mt-1.5">
                  Enter your full <code className="bg-rose-50 px-1 rounded">.myshopify.com</code> domain
                </p>
              </div>

              <Button
                variant="primary"
                onClick={handleConnect}
                loading={connecting}
                className="w-full"
                size="lg"
              >
                {connecting ? "Redirecting to Shopify..." : "Connect Shopify"}
              </Button>

              <p className="text-xs text-rose-300 text-center">
                You'll be redirected to Shopify to authorize this connection.
                Grant permissions and you'll be brought right back here.
              </p>
            </div>
          </div>
        </div>

        {/* What this enables */}
        <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
          <div className="px-5 py-4 border-b border-rose-100">
            <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">
              ✨ After connecting you can:
            </h2>
          </div>
          <div className="p-5 space-y-3">
            {[
              { icon: "📋", text: "Import your orders instantly" },
              { icon: "📦", text: "Sync your products automatically" },
              { icon: "🔄", text: "Push inventory updates back to Shopify" },
              { icon: "🔔", text: "Get real-time order notifications via webhooks" },
              { icon: "📊", text: "See your Shopify data alongside everything else" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-lg flex-shrink-0">{item.icon}</span>
                <p className="text-sm text-[#121212]">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Full Mode: Connected ─────────────────────────────────────────

  const scopes = formatScopes(status!.scopes);

  return (
    <div className="space-y-4">
      {/* Celebration Modal */}
      <Modal
        open={showCelebration}
        onClose={() => setShowCelebration(false)}
        title="🎉 Connected!"
        size="sm"
      >
        <div className="text-center space-y-4">
          <Novi expression="celebrating" size="lg" animated />
          <p className="text-sm text-[#121212] font-medium">{celebrationMessage}</p>
          <div className="flex gap-3 justify-center">
            <Button variant="secondary" onClick={() => setShowCelebration(false)}>
              Later
            </Button>
            <Button variant="primary" onClick={() => { setShowCelebration(false); handleSync(); }}>
              Yes, Import Now
            </Button>
          </div>
        </div>
      </Modal>

      {/* Novi success greeting */}
      <div className="bg-gradient-to-br from-emerald-50 to-purple-50 rounded-2xl shadow-sm border border-emerald-200 p-5 card-lift">
        <div className="flex items-start gap-4">
          <Novi expression="happy" size="md" animated accessory="marketing" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#121212] mb-1">
              💜 You're connected!
            </p>
            <p className="text-sm text-rose-500">
              I can see <strong>{status!.shopName || status!.shopDomain}</strong>. Your products, orders, and inventory are ready to flow into ShimmerStock.
            </p>
          </div>
        </div>
      </div>

      {/* Novi Safe Mode message */}
      {isConnected && status!.syncMode === "readonly" && !safeModeDismissed && (
        <div className="bg-gradient-to-br from-purple-100 to-purple-50 rounded-2xl shadow-sm border-2 border-purple-300 p-5 card-lift">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 text-4xl">💜</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-purple-800 mb-2">
                Safe Mode
              </p>
              <p className="text-sm text-purple-700 leading-relaxed">
                You're connected! Right now ShimmerStock is <strong>only reading</strong> information from Shopify. Nothing will be changed in your store until you explicitly enable Full Sync. Explore with confidence. ❤️
              </p>
            </div>
            <button
              onClick={dismissSafeMode}
              className="flex-shrink-0 text-purple-400 hover:text-purple-600 transition-colors p-1 rounded-full hover:bg-purple-100"
              aria-label="Dismiss"
              title="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Store Info Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 overflow-hidden card-lift">
        <div className="px-5 py-4 border-b border-emerald-100 bg-emerald-50/30 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-emerald-600 uppercase tracking-wider">
            ✅ Connected to Shopify
          </h2>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-600">Active</span>
          </span>
        </div>
        <div className="p-5 space-y-4">
          {/* Store details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-rose-400 uppercase font-medium mb-0.5">Store</p>
              <p className="text-sm font-bold text-[#121212]">{status!.shopName || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-rose-400 uppercase font-medium mb-0.5">Domain</p>
              <p className="text-sm font-mono text-[#121212]">{status!.shopDomain || "—"}</p>
            </div>
            {status!.shopOwner && (
              <div>
                <p className="text-xs text-rose-400 uppercase font-medium mb-0.5">Owner Email</p>
                <p className="text-sm text-[#121212]">{status!.shopOwner}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-rose-400 uppercase font-medium mb-2">Sync Mode</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Safe Mode Card */}
                <button
                  onClick={() => {
                    if (status!.syncMode !== "readonly") {
                      setShowModeConfirm(false);
                      handleSetMode("readonly");
                    }
                  }}
                  disabled={modeSwitching}
                  className={`text-left rounded-xl border-2 p-3 transition-all ${
                    status!.syncMode === "readonly"
                      ? "border-emerald-400 bg-emerald-50 shadow-sm"
                      : "border-rose-100 bg-white hover:border-rose-200 opacity-70 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${status!.syncMode === "readonly" ? "bg-emerald-500" : "bg-rose-300"}`} />
                    <span className={`text-xs font-bold ${status!.syncMode === "readonly" ? "text-emerald-700" : "text-rose-400"}`}>
                      Safe Mode
                    </span>
                    {status!.syncMode === "readonly" && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">Read Only</span>
                    )}
                  </div>
                  <ul className="space-y-1">
                    <li className="text-[11px] text-rose-400 flex items-center gap-1.5">
                      <span className="text-emerald-400">•</span> Import Products
                    </li>
                    <li className="text-[11px] text-rose-400 flex items-center gap-1.5">
                      <span className="text-emerald-400">•</span> Import Orders
                    </li>
                    <li className="text-[11px] text-rose-400 flex items-center gap-1.5">
                      <span className="text-emerald-400">•</span> Import Inventory
                    </li>
                  </ul>
                </button>

                {/* Full Sync Card — disabled when server reports canWrite === false (P0 policy) */}
                {status!.canWrite === false ? (
                  <div
                    className="text-left rounded-xl border-2 p-3 border-rose-100 bg-rose-50/40 opacity-50 cursor-not-allowed"
                    title="Write access is unavailable in the current configuration"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-300" />
                      <span className="text-xs font-bold text-rose-400">Full Sync</span>
                      <span className="text-[10px] bg-rose-100 text-rose-500 px-1.5 py-0.5 rounded-full font-semibold">Unavailable</span>
                    </div>
                    <p className="text-[11px] text-rose-400 leading-relaxed">
                      Write access is not enabled in the current configuration. Contact your administrator to activate Full Sync.
                    </p>
                  </div>
                ) : (
                <button
                  onClick={() => {
                    if (status!.syncMode !== "full") {
                      setShowModeConfirm(true);
                    }
                  }}
                  disabled={modeSwitching}
                  className={`text-left rounded-xl border-2 p-3 transition-all ${
                    status!.syncMode === "full"
                      ? "border-purple-400 bg-purple-50 shadow-sm"
                      : "border-rose-100 bg-white hover:border-purple-200 opacity-70 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${status!.syncMode === "full" ? "bg-purple-500" : "bg-rose-300"}`} />
                    <span className={`text-xs font-bold ${status!.syncMode === "full" ? "text-purple-700" : "text-rose-400"}`}>
                      Full Sync
                    </span>
                    {status!.syncMode === "full" && (
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-semibold">Read + Write</span>
                    )}
                  </div>
                  <ul className="space-y-1">
                    <li className="text-[11px] text-rose-400 flex items-center gap-1.5">
                      <span className="text-purple-400">•</span> Sync Inventory
                    </li>
                    <li className="text-[11px] text-rose-400 flex items-center gap-1.5">
                      <span className="text-purple-400">•</span> Sync SKUs
                    </li>
                    <li className="text-[11px] text-rose-400 flex items-center gap-1.5">
                      <span className="text-purple-400">•</span> Sync Products
                    </li>
                    <li className="text-[11px] text-rose-400 flex items-center gap-1.5">
                      <span className="text-purple-400">•</span> Sync Collections
                    </li>
                  </ul>
                </button>
                )}
              </div>
            </div>
          </div>

          {/* Sync status row */}
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-rose-50">
            <div className="flex items-center gap-2">
              <p className="text-xs text-rose-400">Sync Status:</p>
              {syncStatusBadge || <span className="text-xs text-rose-300">—</span>}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-rose-400">Last Synced:</p>
              <span className="text-xs font-medium text-[#121212]">{formatDate(status!.lastSyncedAt)}</span>
            </div>
            {syncing && syncProgress && (
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-rose-500 font-medium">{syncProgress}</span>
              </div>
            )}
          </div>

          {/* Error display */}
          {status!.syncError && status!.syncStatus === "error" && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs text-red-600 font-medium">Sync Error</p>
              <p className="text-sm text-red-700 mt-1">{status!.syncError}</p>
            </div>
          )}

          {/* Scopes */}
          {scopes.length > 0 && (
            <div className="pt-3 border-t border-rose-50">
              <p className="text-xs text-rose-400 uppercase font-medium mb-2">Granted Permissions</p>
              <div className="flex flex-wrap gap-1.5">
                {scopes.map((scope) => (
                  <Badge key={scope} status={scopeColor(scope)}>
                    {scopeLabel(scope)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-3 bg-rose-50/30 border-t border-rose-100 flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSync}
            loading={syncing}
          >
            {syncing ? (syncProgress || "Syncing...") : "Sync Now"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReauthorize}
          >
            Reauthorize
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDisconnectConfirm(true)}
            className="text-rose-400"
          >
            Disconnect
          </Button>
        </div>
      </div>


      {/* Mode Confirmation Modal */}
      <ConfirmModal
        open={showModeConfirm}
        onClose={() => setShowModeConfirm(false)}
        onConfirm={() => handleSetMode("full")}
        title="⚠️ Enable Full Sync?"
        message="This will allow ShimmerStock to write inventory changes back to your Shopify store. Your inventory counts will be synced both ways."
        confirmLabel="Yes, Enable Full Sync"
        confirmVariant="primary"
      />

      {/* Disconnect Confirmation */}
      <ConfirmModal
        open={showDisconnectConfirm}
        onClose={() => setShowDisconnectConfirm(false)}
        onConfirm={() => { setShowDisconnectConfirm(false); handleDisconnect(); }}
        title="Disconnect Shopify?"
        message={`This will disconnect ${status!.shopName || status!.shopDomain} from ShimmerStock. Your existing orders and data will remain, but you'll no longer receive new orders automatically.`}
        confirmLabel="Yes, Disconnect"
        confirmVariant="danger"
      />
    </div>
  );
}
