/**
 * Faire Simulated Adapter — P4.2 Commerce Expansion
 *
 * Simulates the Faire API (wholesale marketplace).
 * All methods log clearly that they're in simulation mode.
 * Swap in real Faire API calls when credentials are available.
 *
 * @param {Object} credentials — { brandId, accessToken, brandName }
 */

const SIM_MODE = true;

function log(method, detail = "") {
  console.log(`[faire] 🏪 SIMULATION — ${method}${detail ? ": " + detail : ""}`);
}

function faireOrderNum(n) {
  return `FR${String(n).padStart(6, "0")}`;
}

// ── Pre-built mock catalog ─────────────────────────────────────────────

const MOCK_PRODUCTS = [
  {
    productId: "faire_prod_5001",
    title: "Artisan Soap Collection — Wholesale 24-Pack Display",
    variants: [
      { variantId: 50001, sku: "FAIRE-SOAP-24-LAV", barcode: "faire50001", title: "24-Pack — Lavender", inventoryItemId: 60001, inventoryQuantity: 45 },
      { variantId: 50002, sku: "FAIRE-SOAP-24-CIT", barcode: "faire50002", title: "24-Pack — Citrus Burst", inventoryItemId: 60002, inventoryQuantity: 38 },
    ],
  },
  {
    productId: "faire_prod_5002",
    title: "Handmade Greeting Card Assortment — 50-Pack Retail Bundle",
    variants: [
      { variantId: 50003, sku: "FAIRE-CRD-50-FLR", barcode: "faire50003", title: "50-Pack — Floral", inventoryItemId: 60003, inventoryQuantity: 25 },
      { variantId: 50004, sku: "FAIRE-CRD-50-ABS", barcode: "faire50004", title: "50-Pack — Abstract Art", inventoryItemId: 60004, inventoryQuantity: 20 },
    ],
  },
  {
    productId: "faire_prod_5003",
    title: "Small-Batch Hot Sauce — Wholesale Case (12 bottles)",
    variants: [
      { variantId: 50005, sku: "FAIRE-HOT-MILD-12", barcode: "faire50005", title: "Case of 12 — Mild Habanero", inventoryItemId: 60005, inventoryQuantity: 15 },
      { variantId: 50006, sku: "FAIRE-HOT-GHST-12", barcode: "faire50006", title: "Case of 12 — Ghost Pepper", inventoryItemId: 60006, inventoryQuantity: 10 },
    ],
  },
  {
    productId: "faire_prod_5004",
    title: "Knit Throw Blanket — Wholesale 6-Pack Assorted Colors",
    variants: [
      { variantId: 50007, sku: "FAIRE-BLKT-6-ASST", barcode: "faire50007", title: "6-Pack — Assorted", inventoryItemId: 60007, inventoryQuantity: 12 },
    ],
  },
];

// Wholesale orders are larger — retailers buying in bulk
const MOCK_ORDERS = [
  {
    orderId: "faire_ord_9001",
    orderNumber: faireOrderNum(1),
    customerName: "The Local Market — Portland, OR",
    lineItems: [
      { variantId: 50001, sku: "FAIRE-SOAP-24-LAV", title: "Artisan Soap Collection — Wholesale 24-Pack Display", variantTitle: "24-Pack — Lavender", quantity: 6, fulfillableQuantity: 6 },
      { variantId: 50002, sku: "FAIRE-SOAP-24-CIT", title: "Artisan Soap Collection — Wholesale 24-Pack Display", variantTitle: "24-Pack — Citrus Burst", quantity: 4, fulfillableQuantity: 4 },
    ],
  },
  {
    orderId: "faire_ord_9002",
    orderNumber: faireOrderNum(2),
    customerName: "Greenleaf Boutique — Austin, TX",
    lineItems: [
      { variantId: 50003, sku: "FAIRE-CRD-50-FLR", title: "Handmade Greeting Card Assortment — 50-Pack Retail Bundle", variantTitle: "50-Pack — Floral", quantity: 3, fulfillableQuantity: 3 },
      { variantId: 50007, sku: "FAIRE-BLKT-6-ASST", title: "Knit Throw Blanket — Wholesale 6-Pack Assorted Colors", variantTitle: "6-Pack — Assorted", quantity: 2, fulfillableQuantity: 2 },
    ],
  },
  {
    orderId: "faire_ord_9003",
    orderNumber: faireOrderNum(3),
    customerName: "Spice & Soul Kitchen — Nashville, TN",
    lineItems: [
      { variantId: 50005, sku: "FAIRE-HOT-MILD-12", title: "Small-Batch Hot Sauce — Wholesale Case (12 bottles)", variantTitle: "Case of 12 — Mild Habanero", quantity: 8, fulfillableQuantity: 8 },
    ],
  },
];

// ── Public API ──────────────────────────────────────────────────────────

export async function syncOrders(credentials = {}) {
  log("syncOrders", `brand=${credentials.brandName || "unknown"}`);
  await new Promise((r) => setTimeout(r, 250));
  return MOCK_ORDERS;
}

export async function syncProducts(credentials = {}) {
  log("syncProducts", `brand=${credentials.brandName || "unknown"}`);
  await new Promise((r) => setTimeout(r, 160));
  return MOCK_PRODUCTS;
}

export async function getOrder(credentials = {}, orderId) {
  log("getOrder", `orderId=${orderId}`);
  await new Promise((r) => setTimeout(r, 85));
  return MOCK_ORDERS.find((o) => o.orderId === orderId) || null;
}

export function getStatus() {
  return {
    configured: SIM_MODE,
    mode: "simulated",
    canWrite: false,
    provider: "faire",
    label: "Faire",
    description: "Wholesale marketplace — simulated mode",
  };
}
