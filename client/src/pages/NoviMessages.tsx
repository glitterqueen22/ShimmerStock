import { useState, useEffect } from "react";
import { apiGet } from "../lib/api";
import NoviMessageCenter from "../components/NoviMessageCenter";

// ── Types ───────────────────────────────────────────────────────────

interface SummaryResponse {
  unread_count: number;
  urgent_count: number;
  celebration_count: number;
  latest_message: any | null;
}

// ── Page ────────────────────────────────────────────────────────────

export default function NoviMessages() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ totalMessages: number; results: any[] } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Fetch summary on mount ────────────────────────────────────────

  useEffect(() => {
    fetchSummary();
  }, []);

  async function fetchSummary() {
    try {
      const data = await apiGet<SummaryResponse>("/api/novi/messages/summary");
      setSummary(data);
    } catch {
      // Summary is non-critical
    }
  }

  // ── Manual scan ───────────────────────────────────────────────────

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const token = localStorage.getItem("shimmerstock_token");
      const res = await fetch("/api/novi/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      setScanResult(data);
      // Refresh the message list
      fetchSummary();
      setRefreshKey((k) => k + 1);
    } catch {
      // Silently fail
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header with scan button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#121212]">✨ Message Center</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Alerts, opportunities, and celebrations from Novi
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="px-4 py-2 text-sm font-medium bg-purple-500 text-white rounded-xl
                     hover:bg-purple-600 transition-colors disabled:opacity-50
                     flex items-center gap-2 shadow-sm"
        >
          {scanning ? (
            <>
              <span className="animate-spin">⚡</span> Scanning...
            </>
          ) : (
            <>
              🔍 Run Scan
            </>
          )}
        </button>
      </div>

      {/* Summary Stats Bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-rose-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-[#121212]">
            {summary?.unread_count ?? "—"}
          </p>
          <p className="text-xs text-rose-400 font-medium uppercase tracking-wide">
            Unread
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-rose-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-red-500">
            {summary?.urgent_count ?? "—"}
          </p>
          <p className="text-xs text-rose-400 font-medium uppercase tracking-wide">
            Urgent
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-rose-100 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-purple-500">
            {summary?.celebration_count ?? "—"}
          </p>
          <p className="text-xs text-rose-400 font-medium uppercase tracking-wide">
            Celebrations
          </p>
        </div>
      </div>

      {/* Scan results feedback */}
      {scanResult && (
        <div className={`rounded-2xl p-4 border ${
          scanResult.totalMessages > 0
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-blue-50 border-blue-200 text-blue-800"
        }`}>
          <p className="text-sm font-medium">
            {scanResult.totalMessages > 0
              ? `✅ Found ${scanResult.totalMessages} new item(s) across ${scanResult.results.length} checks.`
              : `✅ Scan complete — no new issues found.`}
          </p>
          {scanResult.totalMessages > 0 && (
            <button
              onClick={() => {
                setScanResult(null);
                setRefreshKey((k) => k + 1);
              }}
              className="mt-2 text-xs font-medium underline"
            >
              View messages below
            </button>
          )}
        </div>
      )}

      {/* Message Center */}
      <NoviMessageCenter embedded={false} refreshKey={refreshKey} />
    </div>
  );
}
