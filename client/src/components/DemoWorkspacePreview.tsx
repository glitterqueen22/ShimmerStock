/**
 * DemoWorkspacePreview — polished snapshot for onboarding step 3.
 * Shows Command Center, Morning Brief, and sample inventory/orders.
 * Never writes data. Always labeled DEMO WORKSPACE — ILLUSTRATIVE DATA.
 */
import { useState } from "react";
import Novi from "./Novi";
import { BUSINESS_DNA, type BusinessTypeId, type DemoInsight, type DemoProduct, type DemoOrder } from "../lib/businessDna";

interface DemoWorkspacePreviewProps {
  businessType?: BusinessTypeId;
  onContinueSetup: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export default function DemoWorkspacePreview({
  businessType = "craft_supplies",
  onContinueSetup,
  onBack,
  onSkip,
}: DemoWorkspacePreviewProps) {
  const [previewTab, setPreviewTab] = useState<"command" | "inventory" | "orders">("command");
  const dna = BUSINESS_DNA[businessType] ?? BUSINESS_DNA.craft_supplies;
  const topInsights = dna.insights.slice(0, 3);
  const topProducts = dna.products.slice(0, 6);
  const topOrders = dna.orders.slice(0, 4);

  const urgentCount = topInsights.filter((i: DemoInsight) => i.severity === "urgent" || i.severity === "warning").length;

  return (
    <div className="rounded-2xl border-2 border-violet-300 bg-white shadow-xl overflow-hidden">
      {/* Demo header banner */}
      <div className="bg-violet-600 px-5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white text-xs font-bold uppercase tracking-widest">Demo Workspace</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-400 text-white border border-violet-300">
            Illustrative data — no live store connected
          </span>
        </div>
        <span className="text-violet-200 text-xs">{dna.name}</span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-neutral-100 bg-neutral-50">
        {[
          { id: "command" as const, label: "Command Center", icon: "🏠" },
          { id: "inventory" as const, label: dna.terms.inventory, icon: "📦" },
          { id: "orders" as const, label: dna.terms.order + "s", icon: "📋" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setPreviewTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2
              ${previewTab === tab.id
                ? "border-violet-500 text-violet-700 bg-white"
                : "border-transparent text-neutral-500 hover:text-neutral-700"}`}
          >
            <span aria-hidden>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 max-h-72 overflow-y-auto">
        {previewTab === "command" && (
          <div className="space-y-3">
            {/* Mini Morning Brief */}
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 flex gap-3">
              <Novi expression={urgentCount > 0 ? "thinking" : "happy"} size="sm" animated={false} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-violet-600 mb-1">Novi Morning Brief · Demo</p>
                <p className="text-sm text-neutral-800">
                  {urgentCount > 0
                    ? `${urgentCount} thing${urgentCount > 1 ? "s" : ""} need your attention today.`
                    : "Everything looks healthy. Here's what's on my radar."}
                </p>
                {topInsights[0] && (
                  <p className="text-xs text-neutral-500 mt-1 line-clamp-1">
                    ⚠️ {topInsights[0].title}
                  </p>
                )}
              </div>
            </div>

            {/* Mini today cards */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: "📋", label: dna.terms.order + "s", count: dna.orders.length, alert: dna.orders.filter((o: DemoOrder) => o.issue).length },
                { icon: "📦", label: dna.terms.inventory, count: dna.products.filter((p: DemoProduct) => p.status === "low" || p.status === "critical" || p.status === "out").length, alert: dna.products.filter((p: DemoProduct) => p.status === "critical" || p.status === "out").length },
                { icon: "🛒", label: dna.terms.purchasing, count: 3, alert: 0 },
              ].map((card, i) => (
                <div key={i} className={`rounded-xl border p-3 text-center ${card.alert > 0 ? "bg-red-50 border-red-200" : "bg-white border-neutral-100"}`}>
                  <p className="text-lg" aria-hidden>{card.icon}</p>
                  <p className="text-lg font-bold text-neutral-900">{card.count}</p>
                  <p className="text-[10px] text-neutral-500">{card.label}</p>
                </div>
              ))}
            </div>

            {/* Insight strip */}
            {topInsights.slice(0, 2).map((insight: DemoInsight, i: number) => {
              const color = insight.severity === "urgent" ? "red" : insight.severity === "warning" ? "amber" : "blue";
              return (
                <div key={i} className={`rounded-lg border border-${color}-200 bg-${color}-50 p-2.5`}>
                  <p className="text-xs font-semibold text-neutral-800">{insight.title}</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-1">{insight.summary}</p>
                </div>
              );
            })}
          </div>
        )}

        {previewTab === "inventory" && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wide mb-2">{dna.terms.products} — Demo</p>
            {topProducts.map((product: DemoProduct) => (
              <div key={product.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-neutral-100 bg-white hover:bg-neutral-50">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  product.status === "out" ? "bg-red-500" :
                  product.status === "critical" ? "bg-orange-500" :
                  product.status === "low" ? "bg-amber-400" : "bg-emerald-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-neutral-800 truncate">{product.name}</p>
                  <p className="text-[10px] text-neutral-400">{product.sku} · {product.bin}</p>
                </div>
                <span className="text-xs font-bold text-neutral-700">{product.stock_count} {product.unit}</span>
              </div>
            ))}
          </div>
        )}

        {previewTab === "orders" && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wide mb-2">{dna.terms.order}s — Demo</p>
            {topOrders.map((order: DemoOrder) => (
              <div key={order.id} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${order.issue ? "border-red-200 bg-red-50" : "border-neutral-100 bg-white"}`}>
                <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5
                  ${order.status === "shipped" || order.status === "delivered" ? "bg-emerald-500 text-white" :
                    order.status === "issue" ? "bg-red-500 text-white" :
                    order.status === "packed" ? "bg-blue-500 text-white" : "bg-amber-400 text-white"}`}>
                  {order.status === "shipped" ? "✓" : order.status === "issue" ? "!" : "⏳"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-neutral-800">#{order.order_number} · {order.customer_name}</p>
                  {order.issue && <p className="text-[10px] text-red-600 mt-0.5 line-clamp-1">{order.issue}</p>}
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  order.status === "shipped" ? "bg-emerald-100 text-emerald-700" :
                  order.status === "issue" ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-600"}`}>
                  {order.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA footer */}
      <div className="border-t border-neutral-100 px-5 py-4 bg-neutral-50 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors">← Back</button>
          <span className="text-neutral-300 text-xs">|</span>
          <button onClick={onSkip} className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors">Skip for now</button>
        </div>
        <button
          onClick={onContinueSetup}
          className="px-5 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
        >
          Continue Setup →
        </button>
      </div>
    </div>
  );
}
