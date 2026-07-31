/**
 * Etsy Simulated Adapter — P4.2 Commerce Expansion
 *
 * Simulates the Etsy API (handmade/vintage marketplace).
 * All methods log clearly that they're in simulation mode.
 * Swap in real Etsy Open API v3 calls when credentials are available.
 *
 * @param {Object} credentials — { shopId, accessToken, shopName }
 */

const SIM_MODE = true;

function log(method, detail = "") {
  console.log(`[etsy] 🔶 SIMULATION — ${method}${detail ? ": " + detail : ""}`);
}

/**
 * Generate a simulated order number in Etsy format.
 */
function etsyOrderNum(n) {
  return 3000000000 + n;
}

// ── Pre-built mock catalog ─────────────────────────────────────────────

const MOCK_PRODUCTS = [
  {
    productId: "etsy_prod_1001",
    title: "Handmade Ceramic Mug — Speckled Stoneware",
    variants: [
      { variantId: 10001, sku: "ETSY-MUG-8OZ", barcode: "etsy10001", title: "8oz — Midnight Blue", inventoryItemId: 20001, inventoryQuantity: 14 },
      { variantId: 10002, sku: "ETSY-MUG-12OZ", barcode: "etsy10002", title: "12oz — Sage Green", inventoryItemId: 20002, inventoryQuantity: 9 },
    ],
  },
  {
    productId: "etsy_prod_1002",
    title: "Personalized Leather Journal — Monogrammed",
    variants: [
      { variantId: 10003, sku: "ETSY-JRN-A5", barcode: "etsy10003", title: "A5 — Brown", inventoryItemId: 20003, inventoryQuantity: 5 },
      { variantId: 10004, sku: "ETSY-JRN-A6", barcode: "etsy10004", title: "A6 — Black", inventoryItemId: 20004, inventoryQuantity: 8 },
    ],
  },
  {
    productId: "etsy_prod_1003",
    title: "Beeswax Candle Set — Hand-Poured Trio",
    variants: [
      { variantId: 10005, sku: "ETSY-CND-3PK", barcode: "etsy10005", title: "3-Pack — Natural", inventoryItemId: 20005, inventoryQuantity: 22 },
    ],
  },
  {
    productId: "etsy_prod_1004",
    title: "Macramé Plant Hanger — Boho Decor",
    variants: [
      { variantId: 10006, sku: "ETSY-MAC-36IN", barcode: "etsy10006", title: '36" — Natural Cotton', inventoryItemId: 20006, inventoryQuantity: 7 },
    ],
  },
  {
    productId: "etsy_prod_1005",
    title: "Custom Pet Portrait — Digital Illustration",
    variants: [
      { variantId: 10007, sku: "ETSY-PET-DIG", barcode: "etsy10007", title: "Digital File — 8x10", inventoryItemId: 20007, inventoryQuantity: 999 },
    ],
  },
];

const MOCK_ORDERS = [
  {
    orderId: "etsy_ord_5001",
    orderNumber: etsyOrderNum(1),
    customerName: "Claire Thompson",
    lineItems: [
      { variantId: 10001, sku: "ETSY-MUG-8OZ", title: "Handmade Ceramic Mug — Speckled Stoneware", variantTitle: "8oz — Midnight Blue", quantity: 2, fulfillableQuantity: 2 },
    ],
  },
  {
    orderId: "etsy_ord_5002",
    orderNumber: etsyOrderNum(2),
    customerName: "Marcus Rivera",
    lineItems: [
      { variantId: 10003, sku: "ETSY-JRN-A5", title: "Personalized Leather Journal — Monogrammed", variantTitle: "A5 — Brown", quantity: 1, fulfillableQuantity: 1 },
    ],
  },
  {
    orderId: "etsy_ord_5003",
    orderNumber: etsyOrderNum(3),
    customerName: "Priya Sharma",
    lineItems: [
      { variantId: 10005, sku: "ETSY-CND-3PK", title: "Beeswax Candle Set — Hand-Poured Trio", variantTitle: "3-Pack — Natural", quantity: 3, fulfillableQuantity: 3 },
      { variantId: 10006, sku: "ETSY-MAC-36IN", title: "Macramé Plant Hanger — Boho Decor", variantTitle: '36" — Natural Cotton', quantity: 1, fulfillableQuantity: 1 },
    ],
  },
];

// ── Public API ──────────────────────────────────────────────────────────

export async function syncOrders(credentials = {}) {
  log("syncOrders", `shop=${credentials.shopName || "unknown"}`);
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 180));
  return MOCK_ORDERS;
}

export async function syncProducts(credentials = {}) {
  log("syncProducts", `shop=${credentials.shopName || "unknown"}`);
  await new Promise((r) => setTimeout(r, 120));
  return MOCK_PRODUCTS;
}

export async function getOrder(credentials = {}, orderId) {
  log("getOrder", `orderId=${orderId}`);
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_ORDERS.find((o) => o.orderId === orderId) || null;
}

export function getStatus() {
  return {
    configured: SIM_MODE,
    mode: "simulated",
    canWrite: false,
    provider: "etsy",
    label: "Etsy",
    description: "Handmade & vintage marketplace — simulated mode",
  };
}
