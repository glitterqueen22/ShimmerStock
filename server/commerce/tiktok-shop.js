/**
 * TikTok Shop Simulated Adapter — P4.2 Commerce Expansion
 *
 * Simulates TikTok Shop API (social commerce orders).
 * All methods log clearly that they're in simulation mode.
 * Swap in real TikTok Shop API calls when credentials are available.
 *
 * @param {Object} credentials — { shopId, accessToken, shopName }
 */

const SIM_MODE = true;

function log(method, detail = "") {
  console.log(`[tiktok-shop] 🎵 SIMULATION — ${method}${detail ? ": " + detail : ""}`);
}

function tiktokOrderNum(n) {
  return `TT${String(Date.now()).slice(-6)}${String(n).padStart(4, "0")}`;
}

// ── Pre-built mock catalog ─────────────────────────────────────────────

const MOCK_PRODUCTS = [
  {
    productId: "tt_prod_3001",
    title: "Viral Glow Drops — Illuminating Face Serum ✨",
    variants: [
      { variantId: 30001, sku: "TT-GLOW-30ML", barcode: "tt30001", title: "30ml — Original", inventoryItemId: 40001, inventoryQuantity: 120 },
      { variantId: 30002, sku: "TT-GLOW-50ML", barcode: "tt30002", title: "50ml — Rose Gold", inventoryItemId: 40002, inventoryQuantity: 85 },
    ],
  },
  {
    productId: "tt_prod_3002",
    title: "Satisfying Slug Slime — Butter Texture ASMR",
    variants: [
      { variantId: 30003, sku: "TT-SLIME-LAV", barcode: "tt30003", title: "Lavender Scent — 200g", inventoryItemId: 40003, inventoryQuantity: 200 },
      { variantId: 30004, sku: "TT-SLIME-STRW", barcode: "tt30004", title: "Strawberry Scent — 200g", inventoryItemId: 40004, inventoryQuantity: 180 },
    ],
  },
  {
    productId: "tt_prod_3003",
    title: "Mini Waffle Maker — Dash-Style Heart Shape ❤️",
    variants: [
      { variantId: 30005, sku: "TT-WAFFLE-RED", barcode: "tt30005", title: "Heart — Red", inventoryItemId: 40005, inventoryQuantity: 34 },
    ],
  },
  {
    productId: "tt_prod_3004",
    title: "Oversized Hoodie Blanket — Wearable Sherpa",
    variants: [
      { variantId: 30006, sku: "TT-HOOD-GRY-SM", barcode: "tt30006", title: "S/M — Grey", inventoryItemId: 40006, inventoryQuantity: 27 },
      { variantId: 30007, sku: "TT-HOOD-GRY-LG", barcode: "tt30007", title: "L/XL — Grey", inventoryItemId: 40007, inventoryQuantity: 19 },
    ],
  },
];

const MOCK_ORDERS = [
  {
    orderId: "tt_ord_7001",
    orderNumber: tiktokOrderNum(1),
    customerName: "@glowup_jess",
    lineItems: [
      { variantId: 30001, sku: "TT-GLOW-30ML", title: "Viral Glow Drops — Illuminating Face Serum ✨", variantTitle: "30ml — Original", quantity: 3, fulfillableQuantity: 3 },
    ],
  },
  {
    orderId: "tt_ord_7002",
    orderNumber: tiktokOrderNum(2),
    customerName: "Madison K.",
    lineItems: [
      { variantId: 30006, sku: "TT-HOOD-GRY-SM", title: "Oversized Hoodie Blanket — Wearable Sherpa", variantTitle: "S/M — Grey", quantity: 1, fulfillableQuantity: 1 },
      { variantId: 30005, sku: "TT-WAFFLE-RED", title: "Mini Waffle Maker — Dash-Style Heart Shape ❤️", variantTitle: "Heart — Red", quantity: 1, fulfillableQuantity: 1 },
    ],
  },
  {
    orderId: "tt_ord_7003",
    orderNumber: tiktokOrderNum(3),
    customerName: "@craftymom_emma",
    lineItems: [
      { variantId: 30003, sku: "TT-SLIME-LAV", title: "Satisfying Slug Slime — Butter Texture ASMR", variantTitle: "Lavender Scent — 200g", quantity: 5, fulfillableQuantity: 5 },
    ],
  },
];

// ── Public API ──────────────────────────────────────────────────────────

export async function syncOrders(credentials = {}) {
  log("syncOrders", `shop=${credentials.shopName || "unknown"}`);
  await new Promise((r) => setTimeout(r, 200));
  return MOCK_ORDERS;
}

export async function syncProducts(credentials = {}) {
  log("syncProducts", `shop=${credentials.shopName || "unknown"}`);
  await new Promise((r) => setTimeout(r, 130));
  return MOCK_PRODUCTS;
}

export async function getOrder(credentials = {}, orderId) {
  log("getOrder", `orderId=${orderId}`);
  await new Promise((r) => setTimeout(r, 70));
  return MOCK_ORDERS.find((o) => o.orderId === orderId) || null;
}

export function getStatus() {
  return {
    configured: SIM_MODE,
    mode: "simulated",
    canWrite: false,
    provider: "tiktok-shop",
    label: "TikTok Shop",
    description: "Social commerce marketplace — simulated mode",
  };
}
