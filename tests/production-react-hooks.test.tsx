import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import React, { useMemo } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const requestedUrls: string[] = [];
let responses = new Map<string, unknown>();
let loadError: Error | null = null;
let responseGate: Promise<void> | null = null;

mock.module("../client/src/lib/api", () => ({
  apiGet: async (url: string) => {
    requestedUrls.push(url);
    if (responseGate) await responseGate;
    if (loadError) throw loadError;
    return responses.get(url);
  },
  apiPost: async () => ({}),
  apiPut: async () => ({}),
  apiDelete: async () => ({}),
}));

function TextComponent({ children }: { children?: React.ReactNode }) {
  return <div>{children}</div>;
}

mock.module("../client/src/components/Novi", () => ({
  default: () => <span>Novi</span>,
}));

mock.module("../client/src/context/IndustryContext", () => ({
  useTerms: () => useMemo(() => ({ production: "Production" }), []),
}));

mock.module("../client/src/components/ui", () => ({
  PageHeader: ({ title, actions }: any) => <header><h1>{title}</h1>{actions}</header>,
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Badge: TextComponent,
  Tabs: ({ tabs }: any) => <nav>{tabs.map((tab: any) => <span key={tab.id}>{tab.label}</span>)}</nav>,
  Modal: ({ open, children }: any) => open ? <div>{children}</div> : null,
  ConfirmModal: () => null,
  Skeleton: () => <div>Loading production</div>,
  EmptyState: ({ title, description, action }: any) => (
    <section><h2>{title}</h2><p>{description}</p>{action && <button onClick={action.onClick}>{action.label}</button>}</section>
  ),
  ErrorBanner: ({ message }: any) => <div role="alert">{message}</div>,
  SearchBar: () => null,
  useToast: () => ({ toast: () => {} }),
}));

const { default: Production } = await import("../client/src/pages/Production");

const emptyResponses = () => new Map<string, unknown>([
  ["/api/production/boms", []],
  ["/api/production/batches", []],
  ["/api/production/pending", { pending: [], total: 0, canExecuteCount: 0, summary: "" }],
  ["/api/products", []],
  ["/api/production/requirements", { batches: [], totalBatches: 0, executableBatches: 0, summary: "" }],
]);

async function renderProduction() {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(<Production />);
  });
  return renderer!;
}

function renderedText(renderer: ReactTestRenderer) {
  return JSON.stringify(renderer.toJSON());
}

beforeEach(() => {
  requestedUrls.length = 0;
  responses = emptyResponses();
  loadError = null;
  responseGate = null;
});

afterEach(() => {
  mock.restore();
});

describe("Production React hook ordering", () => {
  it("renders loading then a truthful empty state without changing hook order", async () => {
    let releaseResponses!: () => void;
    responseGate = new Promise(resolve => { releaseResponses = resolve; });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<Production />);
      await Promise.resolve();
    });
    expect(renderedText(renderer)).toContain("Loading production");

    await act(async () => {
      releaseResponses();
      await responseGate;
    });
    const text = renderedText(renderer);

    expect(text).toContain("Production");
    expect(text).toContain("No production batches yet");
    expect(text).toContain("Create First BOM");
    expect(text).not.toContain("Rendered more hooks");
    expect(requestedUrls).toEqual([
      "/api/production/boms",
      "/api/production/batches",
      "/api/production/pending",
      "/api/products",
      "/api/production/requirements",
    ]);
    expect(requestedUrls.every(url => !url.includes("business"))).toBe(true);
    await act(async () => renderer.unmount());
  });

  it("renders populated production data", async () => {
    responses = emptyResponses();
    responses.set("/api/production/boms", [{
      id: 7, business_id: 2, name: "Glitter Mix", output_product_id: 4,
      output_quantity: 1, output_unit: "jar", is_active: 1, created_at: "2026-08-09",
      output_product_name: "Finished Glitter", output_product_sku: "FG-1", output_stock_count: 0,
      items: [],
    }]);
    responses.set("/api/production/batches", [{
      id: 11, business_id: 2, bom_id: 7, batch_size: 2, status: "draft", notes: null,
      started_at: null, completed_at: null, reserved_at: null, cancelled_at: null,
      cancelled_reason: null, created_by_name: "Owner", created_at: "2026-08-09",
      bom_name: "Glitter Mix", output_product_name: "Finished Glitter", output_product_sku: "FG-1",
    }]);
    responses.set("/api/production/pending", {
      pending: [{
        id: 11, business_id: 2, bom_id: 7, batch_size: 2, status: "draft", notes: null,
        started_at: null, completed_at: null, reserved_at: null, cancelled_at: null,
        cancelled_reason: null, created_by_name: "Owner", created_at: "2026-08-09",
        bom_name: "Glitter Mix", output_product_name: "Finished Glitter", output_product_sku: "FG-1",
        output_stock_count: 0, output_quantity: 1, output_unit: "jar", shortages: [],
        canExecute: true, bomItems: [],
      }], total: 1, canExecuteCount: 1, summary: "1 batch ready",
    });

    const renderer = await renderProduction();
    const text = renderedText(renderer);
    expect(text).toContain("Production");
    expect(text).toContain("Glitter Mix");
    expect(text).toContain("Finished Glitter");
    await act(async () => renderer.unmount());
  });

  it("renders the error state without a hook-order failure", async () => {
    loadError = new Error("Production data unavailable");
    const renderer = await renderProduction();
    const text = renderedText(renderer);
    expect(text).toContain("Production");
    expect(text).toContain("Production data unavailable");
    expect(text).not.toContain("Rendered more hooks");
    await act(async () => renderer.unmount());
  });

  it("can navigate away and back without crashing", async () => {
    const renderer = await renderProduction();
    await act(async () => renderer.update(<div>Away</div>));
    expect(renderedText(renderer)).toContain("Away");
    await act(async () => renderer.update(<Production />));
    expect(renderedText(renderer)).toContain("No production batches yet");
    await act(async () => renderer.unmount());
  });

  it("keeps every Production hook above loading and error returns", () => {
    const source = readFileSync(new URL("../client/src/pages/Production.tsx", import.meta.url), "utf8");
    const loadingReturn = source.indexOf("if (loading)");
    const errorReturn = source.indexOf("if (error)");
    const termsHook = source.indexOf("const terms = useTerms()");

    expect(termsHook).toBeGreaterThan(source.indexOf("export default function Production"));
    expect(termsHook).toBeLessThan(loadingReturn);
    expect(loadingReturn).toBeLessThan(errorReturn);
    expect(source.slice(loadingReturn)).not.toMatch(/\buse(?:State|Effect|Memo|Callback|Context|Terms)\s*\(/);
  });
});

describe("Production tenant contract", () => {
  it("server Production endpoints use authenticated req.businessId", () => {
    const source = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
    const routeStart = source.indexOf('app.get("/api/production/boms"');
    const routeEnd = source.indexOf("// ──", routeStart + 20);
    const routeBlock = source.slice(routeStart, routeEnd === -1 ? routeStart + 5000 : routeEnd);

    expect(routeStart).toBeGreaterThan(-1);
    expect(routeBlock).toContain("req.businessId");
    expect(routeBlock).not.toMatch(/req\.(?:body|query)\.business/i);
  });
});
