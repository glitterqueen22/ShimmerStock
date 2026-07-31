import { useState, useEffect, useCallback } from "react";
import { apiGet } from "../lib/api";
import { PageHeader, Skeleton, EmptyState, ErrorBanner } from "../components/ui";

interface AuditEntry {
  id: number;
  action_type: string;
  entity_type: string;
  entity_id: number | null;
  previous_value: string | null;
  new_value: string | null;
  source: string;
  device_info: string | null;
  reason: string | null;
  created_at: string;
  user_display_name: string | null;
  username: string | null;
}

interface AuditResponse {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
  entityTypes: string[];
}

function getActionColor(actionType: string): string {
  if (actionType.includes(".created") || actionType === "auth.login") return "bg-green-50 text-green-800 border-green-200";
  if (actionType.includes(".updated") || actionType === "auth.password_changed") return "bg-amber-50 text-amber-800 border-amber-200";
  if (actionType.includes(".deleted") || actionType.includes(".decremented") || actionType === "scan.out") return "bg-red-50 text-red-800 border-red-200";
  if (actionType.includes("scan.")) return "bg-blue-50 text-blue-800 border-blue-200";
  if (actionType.includes(".imported") || actionType.includes(".verified") || actionType.includes(".mismatch")) return "bg-indigo-50 text-indigo-800 border-indigo-200";
  if (actionType.includes("settings.")) return "bg-purple-50 text-purple-800 border-purple-200";
  if (actionType.includes("auth.")) return "bg-gray-50 text-gray-700 border-gray-200";
  if (actionType.includes(".reset")) return "bg-orange-50 text-orange-800 border-orange-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function truncateValue(value: string | null, maxLen: number = 80): string {
  if (!value) return "—";
  try {
    const obj = JSON.parse(value);
    const str = JSON.stringify(obj);
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + "…";
  } catch {
    if (value.length <= maxLen) return value;
    return value.slice(0, maxLen) + "…";
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

export default function AuditLog() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const fetchAuditLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (entityFilter) params.set("entity_type", entityFilter);
      params.set("limit", String(pageSize));
      params.set("offset", String(page * pageSize));

      const result = await apiGet<AuditResponse>(`/api/audit-log?${params.toString()}`);
      setData(result);
    } catch (err: any) {
      setError(err.message || "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [entityFilter, page]);

  useEffect(() => {
    fetchAuditLog();
  }, [fetchAuditLog]);

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Every inventory and data change is recorded here — append-only, immutable."
      />

      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium text-gray-600">Filter by entity:</label>
        <select
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value);
            setPage(0);
          }}
          className="px-3 py-2 rounded-lg border border-rose-200 text-sm bg-white
                     focus:border-rose-400 focus:ring-1 focus:ring-rose-400 outline-none"
        >
          <option value="">All types</option>
          {(data?.entityTypes || []).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <button
          onClick={fetchAuditLog}
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
      {error && <ErrorBanner message={error} onRetry={fetchAuditLog} />}

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
          icon="📭"
          title="No audit entries"
          description="Audit entries will appear as actions are performed"
        />
      )}

      {/* Table */}
      {!loading && data && data.entries.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-rose-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-rose-50 text-left">
                  <th className="px-4 py-3 font-semibold text-rose-800">Time</th>
                  <th className="px-4 py-3 font-semibold text-rose-800">User</th>
                  <th className="px-4 py-3 font-semibold text-rose-800">Action</th>
                  <th className="px-4 py-3 font-semibold text-rose-800">Entity</th>
                  <th className="px-4 py-3 font-semibold text-rose-800">Previous</th>
                  <th className="px-4 py-3 font-semibold text-rose-800">New</th>
                  <th className="px-4 py-3 font-semibold text-rose-800">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50">
                {data.entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`border-l-4 ${getActionColor(entry.action_type)} hover:bg-gray-50/50 transition-colors`}
                  >
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap font-mono text-xs">
                      {formatTimestamp(entry.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-800 whitespace-nowrap">
                      {entry.user_display_name ? (
                        <span title={`@${entry.username}`}>
                          {entry.user_display_name}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">system</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getActionColor(entry.action_type)}`}>
                        {entry.action_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {entry.entity_type}
                      {entry.entity_id ? ` #${entry.entity_id}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs max-w-[200px] truncate">
                      {truncateValue(entry.previous_value)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 font-mono text-xs max-w-[200px] truncate">
                      {truncateValue(entry.new_value)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border
                        ${entry.source === "scanner" ? "bg-blue-50 text-blue-700 border-blue-200" : ""}
                        ${entry.source === "shopify" ? "bg-purple-50 text-purple-700 border-purple-200" : ""}
                        ${entry.source === "manual" ? "bg-gray-100 text-gray-600 border-gray-200" : ""}
                        ${entry.source === "system" ? "bg-teal-50 text-teal-700 border-teal-200" : ""}
                      `}>
                        {entry.source}
                      </span>
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
