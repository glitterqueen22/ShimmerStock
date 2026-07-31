/**
 * Amazon Simulated Adapter — P4.2 Commerce Expansion
 *
 * Simulates Amazon SP-API (FBA/FBM orders).
 * All methods log clearly that they're in simulation mode.
 * Swap in real SP-API calls when credentials are available.
 *
 * @param {Object} credentials — { sellerId, accessToken, refreshToken, marketplaceId }
 */

const SIM_MODE = true;

function log(method, detail = "") {
  console.log(`[amazon] 📦 SIMULATION — ${method}${detail ? ": " + detail : ""}`);
}

function amznOrderNum(n) {
  return `113-${String(n).padStart(7, "0")}-${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
}

// ── Pre-built mock catalog ─────────────────────────────────────────────

const MOCK_PRODUCTS = [
  {
    productId: "amzn_prod_B09X1A2B3C",
    title: "Premium Yoga Mat — Extra Thick 6mm Non-Slip",
    variants: [
      { variantId: 20001, sku: "AMZN-YOGA-6MM-BLK", barcode: "amzn20001", title: "6mm — Black", inventoryItemId: 30001, inventoryQuantity: 45 },
      { variantId: 20002, sku: "AMZN-YOGA-6MM-PUR", barcode: "amzn20002", title: "6mm — Purple", inventoryItemId: 30002, inventoryQuantity: 32 },
      { variantId: 20003, sku: "AMZN-YOGA-8MM-BLK", barcode: "amzn20003", title: "8mm — Black", inventoryItemId: 30003, inventoryQuantity: 18 },
    ],
  },
  {
    productId: "amzn_prod_B09Y4C5D6E",
    title: "Stainless Steel Water Bottle — 32oz Insulated",
    variants: [
      { variantId: 20004, sku: "AMZN-BTL-32-MAT", barcode: "amzn20004", title: "32oz — Matte Black", inventoryItemId: 30004, inventoryQuantity: 67 },
      { variantId: 20005, sku: "AMZN-BTL-32-WHT", barcode: "amzn20005", title: "32oz — White", inventoryItemId: 30005, inventoryQuantity: 41 },
    ],
  },
  {
    productId: "amzn_prod_B08Z7F8G9H",
    title: "Organic Dog Treats — Grain-Free Training Bites",
    variants: [
      { variantId: 20006, sku: "AMZN-DOG-CHK-1LB", barcode: "amzn20006", title: "1lb — Chicken Recipe", inventoryItemId: 30006, inventoryQuantity: 89 },
      { variantId: 20007, sku: "AMZN-DOG-BF-1LB", barcode: "amzn20007", title: "1lb — Beef Recipe", inventoryItemId: 30007, inventoryQuantity: 55 },
    ],
  },
  {
    productId: "amzn_prod_B07A1B2C3D",
    title: "LED Desk Lamp — Eye-Caring with USB Charging Port",
    variants: [
      { variantId: 20008, sku: "AMZN-LAMP-LED-BLK", barcode: "amzn20008", title: "Standard — Black", inventoryItemId: 30008, inventoryQuantity: 23 },
    ],
  },
  {
    productId: "amzn_prod_B06E4F5G6H",
    title: "Bamboo Cutting Board Set — 3-Piece Organic",
    variants: [
      { variantId: 20009, sku: "AMZN-BRD-3PK-BAM", barcode: "amzn20009", title: "3-Piece Set — Bamboo", inventoryItemId: 30009, inventoryQuantity: 15 },
    ],
  },
];

const MOCK_ORDERS = [
  {
    orderId: "amzn_ord_6001",
    orderNumber: amznOrderNum(1),
    customerName: "David Chen",
    lineItems: [
      { variantId: 20001, sku: "AMZN-YOGA-6MM-BLK", title: "Premium Yoga Mat — Extra Thick 6mm Non-Slip", variantTitle: "6mm — Black", quantity: 1, fulfillableQuantity: 1 },
    ],
  },
  {
    orderId: "amzn_ord_6002",
    orderNumber: amznOrderNum(2),
    customerName: "Sarah Williams",
    lineItems: [
      { variantId: 20004, sku: "AMZN-BTL-32-MAT", title: "Stainless Steel Water Bottle — 32oz Insulated", variantTitle: "32oz — Matte Black", quantity: 2, fulfillableQuantity: 2 },
      { variantId: 20008, sku: "AMZN-LAMP-LED-BLK", title: "LED Desk Lamp — Eye-Caring with USB Charging Port", variantTitle: "Standard — Black", quantity: 1, fulfillableQuantity: 1 },
    ],
  },
  {
    orderId: "amzn_ord_6003",
    orderNumber: amznOrderNum(3),
    customerName: "Lisa Park",
    lineItems: [
      { variantId: 20006, sku: "AMZN-DOG-CHK-1LB", title: "Organic Dog Treats — Grain-Free Training Bites", variantTitle: "1lb — Chicken Recipe", quantity: 4, fulfillableQuantity: 4 },
    ],
  },
  {
    orderId: "amzn_ord_6004",
    orderNumber: amznOrderNum(4),
    customerName: "James Rodriguez",
    lineItems: [
      { variantId: 20009, sku: "AMZN-BRD-3PK-BAM", title: "Bamboo Cutting Board Set — 3-Piece Organic", variantTitle: "3-Piece Set — Bamboo", quantity: 1, fulfillableQuantity: 1 },
      { variantId: 20005, sku: "AMZN-BTL-32-WHT", title: "Stainless Steel Water Bottle — 32oz Insulated", variantTitle: "32oz — White", quantity: 1, fulfillableQuantity: 1 },
    ],
  },
];

// ── Public API ──────────────────────────────────────────────────────────

export async function syncOrders(credentials = {}) {
  log("syncOrders", `seller=${credentials.sellerId || "unknown"}`);
  await new Promise((r) => setTimeout(r, 220));
  return MOCK_ORDERS;
}

export async function syncProducts(credentials = {}) {
  log("syncProducts", `seller=${credentials.sellerId || "unknown"}`);
  await new Promise((r) => setTimeout(r, 150));
  return MOCK_PRODUCTS;
}

export async function getOrder(credentials = {}, orderId) {
  log("getOrder", `orderId=${orderId}`);
  await new Promise((r) => setTimeout(r, 90));
  return MOCK_ORDERS.find((o) => o.orderId === orderId) || null;
}

export function getStatus() {
  return {
    configured: SIM_MODE,
    mode: "simulated",
    canWrite: false,
    provider: "amazon",
    label: "Amazon",
    description: "FBA/FBM marketplace — simulated mode",
  };
}
