/**
 * WooCommerce Simulated Adapter — P4.2 Commerce Expansion
 *
 * Simulates the WooCommerce REST API (WordPress-based store).
 * All methods log clearly that they're in simulation mode.
 * Swap in real WooCommerce REST API calls when credentials are available.
 *
 * @param {Object} credentials — { storeUrl, consumerKey, consumerSecret }
 */

const SIM_MODE = true;

function log(method, detail = "") {
  console.log(`[woocommerce] 🛒 SIMULATION — ${method}${detail ? ": " + detail : ""}`);
}

// ── Pre-built mock catalog ─────────────────────────────────────────────

const MOCK_PRODUCTS = [
  {
    productId: "wc_prod_4001",
    title: "Artisan Cold Brew Coffee Concentrate — 32oz",
    variants: [
      { variantId: 40001, sku: "WC-COLD-32-O", barcode: "wc40001", title: "32oz — Original Blend", inventoryItemId: 50001, inventoryQuantity: 38 },
      { variantId: 40002, sku: "WC-COLD-32-V", barcode: "wc40002", title: "32oz — Vanilla", inventoryItemId: 50002, inventoryQuantity: 21 },
    ],
  },
  {
    productId: "wc_prod_4002",
    title: "Reusable Silicone Food Storage Bags — 5-Pack",
    variants: [
      { variantId: 40003, sku: "WC-BAGS-5PK-CLR", barcode: "wc40003", title: "5-Pack — Clear", inventoryItemId: 50003, inventoryQuantity: 56 },
      { variantId: 40004, sku: "WC-BAGS-5PK-PST", barcode: "wc40004", title: "5-Pack — Pastel", inventoryItemId: 50004, inventoryQuantity: 44 },
    ],
  },
  {
    productId: "wc_prod_4003",
    title: "Natural Soy Wax Candle — Wood Wick, 9oz",
    variants: [
      { variantId: 40005, sku: "WC-CNDL-CEDAR", barcode: "wc40005", title: "Cedar & Pine", inventoryItemId: 50005, inventoryQuantity: 12 },
      { variantId: 40006, sku: "WC-CNDL-VAN", barcode: "wc40006", title: "Vanilla Bean", inventoryItemId: 50006, inventoryQuantity: 8 },
      { variantId: 40007, sku: "WC-CNDL-LAV", barcode: "wc40007", title: "Lavender Fields", inventoryItemId: 50007, inventoryQuantity: 16 },
    ],
  },
  {
    productId: "wc_prod_4004",
    title: "Organic Cotton Tote Bag — Farmers Market Essential",
    variants: [
      { variantId: 40008, sku: "WC-TOTE-NAT", barcode: "wc40008", title: "Natural — 15x16\"", inventoryItemId: 50008, inventoryQuantity: 30 },
    ],
  },
];

const MOCK_ORDERS = [
  {
    orderId: "wc_ord_8001",
    orderNumber: 8001,
    customerName: "Emily Watson",
    lineItems: [
      { variantId: 40001, sku: "WC-COLD-32-O", title: "Artisan Cold Brew Coffee Concentrate — 32oz", variantTitle: "32oz — Original Blend", quantity: 2, fulfillableQuantity: 2 },
    ],
  },
  {
    orderId: "wc_ord_8002",
    orderNumber: 8002,
    customerName: "Tom Baker",
    lineItems: [
      { variantId: 40008, sku: "WC-TOTE-NAT", title: "Organic Cotton Tote Bag — Farmers Market Essential", variantTitle: 'Natural — 15x16"', quantity: 4, fulfillableQuantity: 4 },
      { variantId: 40003, sku: "WC-BAGS-5PK-CLR", title: "Reusable Silicone Food Storage Bags — 5-Pack", variantTitle: "5-Pack — Clear", quantity: 1, fulfillableQuantity: 1 },
    ],
  },
  {
    orderId: "wc_ord_8003",
    orderNumber: 8003,
    customerName: "Rachel Green",
    lineItems: [
      { variantId: 40005, sku: "WC-CNDL-CEDAR", title: "Natural Soy Wax Candle — Wood Wick, 9oz", variantTitle: "Cedar & Pine", quantity: 3, fulfillableQuantity: 3 },
      { variantId: 40006, sku: "WC-CNDL-VAN", title: "Natural Soy Wax Candle — Wood Wick, 9oz", variantTitle: "Vanilla Bean", quantity: 2, fulfillableQuantity: 2 },
    ],
  },
];

// ── Public API ──────────────────────────────────────────────────────────

export async function syncOrders(credentials = {}) {
  log("syncOrders", `store=${credentials.storeUrl || "unknown"}`);
  await new Promise((r) => setTimeout(r, 190));
  return MOCK_ORDERS;
}

export async function syncProducts(credentials = {}) {
  log("syncProducts", `store=${credentials.storeUrl || "unknown"}`);
  await new Promise((r) => setTimeout(r, 140));
  return MOCK_PRODUCTS;
}

export async function getOrder(credentials = {}, orderId) {
  log("getOrder", `orderId=${orderId}`);
  await new Promise((r) => setTimeout(r, 75));
  return MOCK_ORDERS.find((o) => o.orderId === orderId) || null;
}

export function getStatus() {
  return {
    configured: SIM_MODE,
    mode: "simulated",
    canWrite: false,
    provider: "woocommerce",
    label: "WooCommerce",
    description: "WordPress-based store — simulated mode",
  };
}
