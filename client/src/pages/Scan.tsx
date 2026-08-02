import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { apiGet, apiFetch } from "../lib/api";
import { PageHeader, Button, useToast } from "../components/ui";

// ── Types ───────────────────────────────────────────────────────────

interface ProductInfo {
  id: number;
  name: string;
  sku: string;
  barcode: string;
}

interface ScanResult {
  success: boolean;
  product: ProductInfo;
  new_stock: number;
  previous_stock: number;
  mode: "in" | "out";
  quantity: number;
  error?: string;
}

interface Movement {
  id: number;
  type: "in" | "out";
  quantity: number;
  created_at: string;
  product_id: number;
  product_name: string;
  sku: string;
  barcode: string;
  stock_count: number;
}

// ── Page Component ──────────────────────────────────────────────────

export default function Scan() {
  const { toast } = useToast();
  const [mode, setMode] = useState<"in" | "out">("in");
  const [barcodeInput, setBarcodeInput] = useState("");
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cameraDivId = "barcode-camera-viewfinder";
  const [movements, setMovements] = useState<Movement[]>([]);
  const [manualBarcode, setManualBarcode] = useState("");
  const processingRef = useRef(false);

  // ── Process a barcode scan ────────────────────────────────────────

  const processScan = useCallback(
    async (barcode: string) => {
      if (processingRef.current) return;
      if (!barcode || !barcode.trim()) return;
      barcode = barcode.trim();
      processingRef.current = true;
      try {
        const res = await apiFetch("/api/scan", {
          method: "POST", body: JSON.stringify({ barcode, mode }), headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (data.success) {
          const result = data as ScanResult;
          const arrow = result.mode === "in" ? "+1" : "-1";
          toast(`${result.product.name} — ${arrow} → ${result.new_stock} in stock`, "success");
          fetchMovements();
        } else {
          toast(data.error || "Scan failed", "error");
        }
      } catch (err: any) { toast(err.message || "Network error", "error"); }
      finally { processingRef.current = false; }
    },
    [mode, toast],
  );

  const fetchMovements = useCallback(async () => {
    try { const data = await apiGet("/api/movements?limit=20"); setMovements(data); }
    catch { /* silent */ }
  }, []);

  useEffect(() => { fetchMovements(); }, [fetchMovements]);

  useEffect(() => {
    const handleWindowClick = () => { if (!cameraOpen && barcodeRef.current) barcodeRef.current.focus(); };
    window.addEventListener("click", handleWindowClick);
    if (barcodeRef.current) barcodeRef.current.focus();
    return () => window.removeEventListener("click", handleWindowClick);
  }, [cameraOpen]);

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); const value = barcodeInput.trim(); if (value) { processScan(value); setBarcodeInput(""); } }
  };

  // ── Camera scanner ────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraOpen(true);
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode(cameraDivId);
        scannerRef.current = scanner;
        await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.5 },
          (decodedText) => { processScan(decodedText); scanner.pause(true); setTimeout(() => { scanner.resume(); }, 1500); },
          () => { /* silent */ });
      } catch (err: any) { setCameraError(err.message || "Could not start camera"); setCameraOpen(false); }
    }, 200);
  }, [processScan]);

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setCameraOpen(false);
    setCameraError(null);
    setTimeout(() => barcodeRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      if (scanner) {
        void scanner.stop().catch(() => {});
        void Promise.resolve(scanner.clear()).catch(() => {});
      }
    };
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) { processScan(manualBarcode.trim()); setManualBarcode(""); }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    if (isToday) return time;
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader title="Scan" />

      <input ref={barcodeRef} type="text" value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} onKeyDown={handleBarcodeKeyDown}
        className="absolute opacity-0 w-0 h-0 pointer-events-none" tabIndex={-1} aria-hidden="true" autoComplete="off" />

      {/* ── Mode Toggle ─────────────────────────────────────────────┤ */}
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 card-lift">
        <p className="text-sm font-semibold text-rose-400 uppercase tracking-wider mb-3">Scan Mode</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setMode("in")}
            className={`touch-target flex flex-col items-center justify-center gap-1.5 px-6 py-5 rounded-2xl text-lg font-bold transition-all duration-300 border ${
              mode === "in" ? "bg-emerald-500 border-emerald-600 text-white shadow-lg shadow-emerald-200/40 scale-[1.02]" : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"}`}>
            <span className="text-3xl">📥</span> Stock In
          </button>
          <button onClick={() => setMode("out")}
            className={`touch-target flex flex-col items-center justify-center gap-1.5 px-6 py-5 rounded-2xl text-lg font-bold transition-all duration-300 border ${
              mode === "out" ? "bg-amber-500 border-amber-600 text-white shadow-lg shadow-amber-200/20 scale-[1.02]" : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"}`}>
            <span className="text-3xl">📤</span> Stock Out
          </button>
        </div>
      </div>

      {/* ── Camera Scanner ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 card-lift">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-rose-400 uppercase tracking-wider">Camera Scanner</p>
          {!cameraOpen ? (
            <Button variant="primary" onClick={startCamera}><span className="text-lg mr-1">📷</span> Scan with Camera</Button>
          ) : (
            <Button variant="danger" onClick={stopCamera}><span className="text-lg mr-1">✕</span> Close Camera</Button>
          )}
        </div>
        {cameraError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-3">{cameraError}</div>
        )}
        {cameraOpen && (
          <div className="rounded-xl overflow-hidden border border-rose-300 shadow-lg shadow-rose-200/30">
            <div id={cameraDivId} className="w-full" style={{ minHeight: 280 }} />
          </div>
        )}
      </div>

      {/* ── Scan History ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden card-lift">
        <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">Scan History</h2>
          <span className="text-xs text-rose-300">Last 20 scans</span>
        </div>
        {movements.length === 0 ? (
          <div className="p-8 text-center"><p className="text-rose-300 text-sm">No scans yet — scan a barcode to get started</p></div>
        ) : (
          <div className="divide-y divide-rose-50 max-h-[500px] overflow-y-auto">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-rose-50/50 transition-all duration-300">
                <span className={`flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full text-white text-sm font-bold ${
                  m.type === "in" ? "bg-emerald-500" : "bg-amber-500"}`}>{m.type === "in" ? "IN" : "OUT"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#121212] truncate">{m.product_name}</p>
                  <p className="text-xs text-rose-400 font-mono">{m.barcode}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-[#121212]">{m.stock_count}</p>
                  <p className="text-xs text-rose-400">in stock</p>
                </div>
                <div className="text-right flex-shrink-0 w-20"><p className="text-xs text-rose-400">{formatTime(m.created_at)}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Manual Entry ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-4 card-lift">
        <p className="text-sm font-semibold text-rose-400 uppercase tracking-wider mb-3">Manual Entry</p>
        <form onSubmit={handleManualSubmit} className="flex gap-3">
          <input type="text" value={manualBarcode} onChange={(e) => setManualBarcode(e.target.value)}
            placeholder="Type barcode and press Enter..."
            className="flex-1 px-4 py-3 border border-rose-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 outline-none transition-all duration-300 bg-rose-50/50" />
          <Button variant="primary" type="submit" disabled={!manualBarcode.trim()}>Scan</Button>
        </form>
      </div>
    </div>
  );
}
