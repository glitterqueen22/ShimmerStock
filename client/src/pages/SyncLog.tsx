import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost } from "../lib/api";
import { PageHeader, Skeleton, EmptyState, ErrorBanner } from "../components/ui";

interface SyncEntry {
  id: number;
  business_id: number;
  idempotency_key: string;
  action: string;
  shopify_order_id: string | null;
  shopify_product_id: string | null;
  provider: string;
  external_id: string | null;
  entity_type: string | null;
  entity_id: number | null;
  status: string;
  details: string | null;
  error_message: string | null;
  created_at: string;
}

interface StatusCount {
  status: string;
  count: number;
}

interface SyncLogResponse {
  entries: SyncEntry[];
  total: number;
  limit: number;
  offset: number;
  statusFilter: string;
  statusCounts: StatusCount[];
}

// ── Status helpers ──────────────────────────────────────────────────────

function getStatusBadge(status: string) {
  switch (status) {
    case "success":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
          ✅ Success
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
          ❌ Failed
        </span>
      );
    case "dry_run":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          🔍 Dry Run
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
          ⏳ Pending
        </span>
      );
    case "skipped":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          ⏭️ Skipped
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
          {status}
        </span>
      );
  }
}

function getStatusRowStyle(status: string): string {
  switch (status) {
    case "success":
      return "border-l-4 border-green-400";
    case "failed":
      return "border-l-4 border-red-400";
    case "dry_run":
      return "border-l-4 border-amber-400";
    case "pending":
      return "border-l-4 border-gray-300";
    case "skipped":
      return "border-l-4 border-blue-400";
    default:
      return "border-l-4 border-gray-200";
  }
}


function getActionBadge(action: string) {
  switch (action) {
    case "import_order":
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium border bg-indigo-50 text-indigo-700 border-indigo-200">
          📋 Import Order
        </span>
      );
    case "import_product":
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200">
          📦 Import Product
        </span>
      );
    case "push_inventory":
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium border bg-teal-50 text-teal-700 border-teal-200">
          📤 Push Inventory
        </span>
      );
    default:
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-600 border-gray-200">
          {action}
        </span>
      );
  }
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}


function providerBadge(provider: string) {
  const icons: Record<string, string> = {
    shopify: "🛍️",
    etsy: "🧶",
    amazon: "📦",
    woocommerce: "🛒",
    tiktok: "🎵",
    square: "⬜",
  };
  const names: Record<string, string> = {
    shopify: "Shopify",
    etsy: "Etsy",
    amazon: "Amazon",
    woocommerce: "WooCommerce",
    tiktok: "TikTok Shop",
    square: "Square",
  };

  const icon = icons[provider.toLowerCase()] || "🔗";
  const name = names[provider.toLowerCase()] || provider;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-violet-50 text-violet-700 border-violet-200">
      {icon} {name}
    </span>
  );
}

function providerId(entry: SyncEntry): string {
  if (!entry.external_id) return "—";
  // Determine if it looks like an order or product based on action
  if (entry.action === "import_order") return `#${entry.external_id}`;
  if (entry.action === "import_product" || entry.action === "push_inventory") return `#${entry.external_id}`;
  return `#${entry.external_id}`;
}

function entityLabel(entry: SyncEntry): string {
  if (!entry.entity_type) return "—";
  const typeMap: Record<string, string> = {
    order: "Order",
    order_item: "Order Item",
    product: "Product",
    inventory_level: "Inventory Level",
  };
  const label = typeMap[entry.entity_type] || entry.entity_type;
  return entry.entity_id ? `${label} #${entry.entity_id}` : label;
}

// ── Status count summary badge ──────────────────────────────────────────

function StatusCountBadge({ status, count }: { status: string; count: number }) {
  const colors: Record<string, string> = {
    success: "bg-green-50 text-green-700 border-green-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    dry_run: "bg-amber-50 text-amber-700 border-amber-200",
    pending: "bg-gray-100 text-gray-600 border-gray-200",
    skipped: "bg-blue-50 text-blue-700 border-blue-200",
  };

  const labels: Record<string, string> = {
    success: "✅ Success",
    failed: "❌ Failed",
    dry_run: "🔍 Dry Run",
    pending: "⏳ Pending",
    skipped: "⏭️ Skipped",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border ${
        colors[status] || "bg-gray-50 text-gray-600 border-gray-200"
      }`}
    >
      {labels[status] || status}
      <span className="font-bold">{count}</span>
    </span>
  );
}

// ── Page Component ──────────────────────────────────────────────────────

export default function SyncLog() {
  const [data, setData] = useState<SyncLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [retrying, setRetrying] = useState<number | null>(null);
  const pageSize = 50;

  const fetchSyncLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", String(pageSize));
      params.set("offset", String(page * pageSize));

      const result = await apiGet<SyncLogResponse>(
        `/api/shopify/sync-log?${params.toString()}`
      );
      setData(result);
    } catch (err: any) {
      setError(err.message || "Failed to load sync log");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    fetchSyncLog();
  }, [fetchSyncLog]);

  const handleRetry = async (entryId: number) => {
    setRetrying(entryId);
    try {
      await apiPost(`/api/shopify/sync-log/${entryId}/retry`);
      fetchSyncLog();
    } catch (err: any) {
      setError(err.message || "Retry failed");
    } finally {
      setRetrying(null);
    }
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  // Build status counts map from API response
  const statusCountMap: Record<string, number> = {};
  if (data?.statusCounts) {
    for (const sc of data.statusCounts) {
      statusCountMap[sc.status] = sc.count;
    }
  }

  return (
    <div>
      <PageHeader
        title="Sync Log"
        description="Every Shopify sync action is recorded here — idempotent, append-only."
      />

      {/* Status summary counts */}
      {data && data.statusCounts && data.statusCounts.length > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-500 mr-1">Status:</span>
          {data.statusCounts.map((sc) => (
            <button
              key={sc.status}
              onClick={() => {
                setStatusFilter(statusFilter === sc.status ? "" : sc.status);
                setPage(0);
              }}
              className={`transition-all duration-200 ${
                statusFilter === sc.status ? "ring-2 ring-rose-400 scale-105" : ""
              }`}
            >
              <StatusCountBadge status={sc.status} count={sc.count} />
            </button>
          ))}
          {statusFilter && (
            <button
              onClick={() => {
                setStatusFilter("");
                setPage(0);
              }}
              className="text-xs text-rose-500 hover:text-rose-700 font-medium ml-1"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium text-gray-600">Filter by status:</label>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="px-3 py-2 rounded-lg border border-rose-200 text-sm bg-white
                     focus:border-rose-400 focus:ring-1 focus:ring-rose-400 outline-none"
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="dry_run">Dry Run</option>
          <option value="pending">Pending</option>
          <option value="skipped">Skipped</option>
        </select>

        <button
          onClick={fetchSyncLog}
          className="touch-target px-4 py-2 bg-rose-500 text-white rounded-xl text-sm font-medium
                     hover:bg-rose-600 transition-all duration-300"
        >
          🔄 Refresh
        </button>

        {data && (
          <span className="text-sm text-gray-400 ml-auto">
            {data.total} total entries
          </span>
        )}
      </div>

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchSyncLog} />}

      {/* Loading */}
      {loading && (
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="table-row" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && data && data.entries.length === 0 && (
        <EmptyState
          icon="📡"
          title="No sync activity"
          description="Import orders or products to see entries here."
        />
      )}

      {/* Table */}
      {!loading && data && data.entries.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-rose-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-rose-50 text-left">
                  <th className="px-4 py-3 font-semibold text-rose-800">Date</th>
                  <th className="px-4 py-3 font-semibold text-rose-800">Action</th>
                  <th className="px-4 py-3 font-semibold text-rose-800">Provider</th>
                  <th className="px-4 py-3 font-semibold text-rose-800">Entity</th>
                  <th className="px-4 py-3 font-semibold text-rose-800">Status</th>
                  <th className="px-4 py-3 font-semibold text-rose-800">Error</th>
                  <th className="px-4 py-3 font-semibold text-rose-800 w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50">
                {data.entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`${getStatusRowStyle(entry.status)} hover:bg-gray-50/50 transition-colors`}
                  >
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap font-mono text-xs">
                      {formatTimestamp(entry.created_at)}
                    </td>
                    <td className="px-4 py-2.5">{getActionBadge(entry.action)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-1">
                        {providerBadge(entry.provider)}
                        <span className="text-gray-500 font-mono text-xs">{providerId(entry)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                      {entityLabel(entry)}
                    </td>
                    <td className="px-4 py-2.5">{getStatusBadge(entry.status)}</td>
                    <td className="px-4 py-2.5 text-red-500 text-xs max-w-[180px] truncate">
                      {entry.error_message || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.status === "failed" && (
                        <button
                          onClick={() => handleRetry(entry.id)}
                          disabled={retrying === entry.id}
                          className="touch-target px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200
                                     rounded-lg text-xs font-medium hover:bg-amber-100
                                     disabled:opacity-50 transition-all duration-200"
                        >
                          {retrying === entry.id ? "Retrying…" : "↻ Retry"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="touch-target px-4 py-2 rounded-xl text-sm font-medium border border-rose-200
                           text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all duration-300"
              >
                ← Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="touch-target px-4 py-2 rounded-xl text-sm font-medium border border-rose-200
                           text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all duration-300"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
