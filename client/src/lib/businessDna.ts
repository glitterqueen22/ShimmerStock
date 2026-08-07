/**
 * Business DNA — terminology, demo data, and workflow presets per business type.
 *
 * CODE CALCULATES. NOVI EXPLAINS.
 * This module provides static config only — no API calls, no AI calls.
 * Demo data is clearly labeled; it never triggers real external actions.
 */

// ── Types ────────────────────────────────────────────────────────────

export type BusinessTypeId =
  | "craft_supplies"
  | "ecommerce_brand"
  | "made_to_order"
  | "freshies";

export interface BusinessTerms {
  product: string;
  products: string;
  inventory: string;
  supplier: string;
  purchasing: string;
  warehouse: string;
  production: string;
  batch: string;
  recipe: string;
  order: string;
  customer: string;
  fulfillment: string;
  sku: string;
  variant: string;
  kit: string;
  location: string;
  bin: string;
  reorderPoint: string;
}

export interface DemoOrder {
  id: number;
  order_number: number;
  customer_name: string;
  customer_email: string;
  status: "pending" | "processing" | "packed" | "shipped" | "delivered" | "issue";
  item_count: number;
  total: number;
  created_at: string;
  items: Array<{ name: string; qty: number; sku: string }>;
  issue?: string;
}

export interface DemoProduct {
  id: number;
  name: string;
  sku: string;
  category: string;
  stock_count: number;
  reorder_point: number;
  unit: string;
  supplier: string;
  cost: number;
  price: number;
  bin?: string;
  location?: string;
  status: "healthy" | "low" | "critical" | "out";
}

export interface DemoInsight {
  engine: string;
  severity: "urgent" | "warning" | "info" | "celebration";
  title: string;
  summary: string;
  reasoning: string;
  recommended_action: string;
  action_label: string;
  action_link: string;
  confidence: "high" | "medium" | "low";
  is_demo: true;
}

export interface BusinessDnaProfile {
  id: BusinessTypeId;
  name: string;
  icon: string;
  tagline: string;
  description: string;
  terms: BusinessTerms;
  defaultEngines: string[];
  priorityEngines: string[];
  demoLabel: string;
  products: DemoProduct[];
  orders: DemoOrder[];
  insights: DemoInsight[];
  goldenPathDescription: string;
}

// ── Shared term defaults ──────────────────────────────────────────────

const BASE_TERMS: BusinessTerms = {
  product: "Product",
  products: "Products",
  inventory: "Inventory",
  supplier: "Supplier",
  purchasing: "Purchasing",
  warehouse: "Warehouse",
  production: "Production",
  batch: "Batch",
  recipe: "Formula",
  order: "Order",
  customer: "Customer",
  fulfillment: "Fulfillment",
  sku: "SKU",
  variant: "Variant",
  kit: "Kit",
  location: "Location",
  bin: "Bin",
  reorderPoint: "Reorder Point",
};

// ── Craft & Maker Supplies ────────────────────────────────────────────

const CRAFT_PRODUCTS: DemoProduct[] = [
  { id: 1, name: "White Aroma Beads (1 lb)", sku: "AB-WHT-1LB", category: "Aroma Beads", stock_count: 24, reorder_point: 30, unit: "lbs", supplier: "Bulk Fragrance Co.", cost: 3.20, price: 6.99, bin: "A-01", location: "Main Warehouse", status: "low" },
  { id: 2, name: "Vanilla Cupcake Fragrance Oil (1 oz)", sku: "FO-VC-1OZ", category: "Fragrance Oils", stock_count: 48, reorder_point: 20, unit: "bottles", supplier: "Peak Candle Supplies", cost: 2.10, price: 5.49, bin: "B-03", location: "Main Warehouse", status: "healthy" },
  { id: 3, name: "Strawberry Fields FO (1 oz)", sku: "FO-SF-1OZ", category: "Fragrance Oils", stock_count: 6, reorder_point: 20, unit: "bottles", supplier: "Peak Candle Supplies", cost: 2.10, price: 5.49, bin: "B-04", location: "Main Warehouse", status: "critical" },
  { id: 4, name: "Red Chunky Glitter (1 oz)", sku: "GL-RED-CHUNK-1OZ", category: "Glitter", stock_count: 110, reorder_point: 40, unit: "jars", supplier: "Craft Supply Depot", cost: 0.85, price: 2.99, bin: "C-02", location: "Main Warehouse", status: "healthy" },
  { id: 5, name: "Silver Holographic Glitter (1 oz)", sku: "GL-SIL-HOLO-1OZ", category: "Glitter", stock_count: 34, reorder_point: 40, unit: "jars", supplier: "Craft Supply Depot", cost: 0.85, price: 2.99, bin: "C-03", location: "Main Warehouse", status: "low" },
  { id: 6, name: "Cow Print Freshie Mold", sku: "MOLD-COW-01", category: "Molds", stock_count: 18, reorder_point: 10, unit: "units", supplier: "Silicone Molds Direct", cost: 4.50, price: 12.99, bin: "D-01", location: "Production Area", status: "healthy" },
  { id: 7, name: "Ghost Freshie Mold", sku: "MOLD-GHOST-01", category: "Molds", stock_count: 8, reorder_point: 10, unit: "units", supplier: "Silicone Molds Direct", cost: 4.50, price: 12.99, bin: "D-02", location: "Production Area", status: "low" },
  { id: 8, name: "Comfort Colors 1717 (S) — White", sku: "CC-1717-S-WHT", category: "Blanks", stock_count: 42, reorder_point: 24, unit: "shirts", supplier: "Printful Wholesale", cost: 6.80, price: 18.99, bin: "E-01", location: "Receiving Dock", status: "healthy" },
  { id: 9, name: "Comfort Colors 1717 (M) — White", sku: "CC-1717-M-WHT", category: "Blanks", stock_count: 11, reorder_point: 24, unit: "shirts", supplier: "Printful Wholesale", cost: 6.80, price: 18.99, bin: "E-01", location: "Receiving Dock", status: "low" },
  { id: 10, name: "Comfort Colors 1717 (L) — White", sku: "CC-1717-L-WHT", category: "Blanks", stock_count: 0, reorder_point: 24, unit: "shirts", supplier: "Printful Wholesale", cost: 6.80, price: 18.99, bin: "E-01", location: "Receiving Dock", status: "out" },
  { id: 11, name: "Rose Garden Aroma Beads Kit", sku: "KIT-ROSE-BEADS", category: "Kits", stock_count: 15, reorder_point: 10, unit: "kits", supplier: "In-House", cost: 8.40, price: 22.99, bin: "F-01", location: "Main Warehouse", status: "healthy" },
  { id: 12, name: "Black Permanent Vinyl (12\" × 5ft)", sku: "VIN-BLK-12-5FT", category: "Vinyl", stock_count: 29, reorder_point: 15, unit: "rolls", supplier: "Siser Direct", cost: 7.20, price: 16.99, bin: "G-01", location: "Main Warehouse", status: "healthy" },
  { id: 13, name: "White HTV (12\" × 5ft)", sku: "HTV-WHT-12-5FT", category: "Vinyl", stock_count: 3, reorder_point: 15, unit: "rolls", supplier: "Siser Direct", cost: 7.20, price: 16.99, bin: "G-02", location: "Main Warehouse", status: "critical" },
  { id: 14, name: "Freshie Cardstock Backing Cards (50pk)", sku: "CARD-FRESHIE-50", category: "Packaging", stock_count: 140, reorder_point: 50, unit: "packs", supplier: "The Packaging Studio", cost: 3.10, price: 7.99, bin: "H-01", location: "Main Warehouse", status: "healthy" },
  { id: 15, name: "Poly Mailers 6x9 (100pk)", sku: "MAILER-6X9-100", category: "Packaging", stock_count: 62, reorder_point: 40, unit: "packs", supplier: "ULINE", cost: 12.50, price: 0, bin: "H-02", location: "Shipping Area", status: "healthy" },
];

const CRAFT_ORDERS: DemoOrder[] = [
  {
    id: 101, order_number: 1041, customer_name: "Taylor Morrison", customer_email: "taylor.m@email.com",
    status: "issue", item_count: 3, total: 34.47, created_at: "2026-08-05T09:12:00Z",
    items: [{ name: "Vanilla Cupcake FO (1 oz)", qty: 2, sku: "FO-VC-1OZ" }, { name: "White Aroma Beads (1 lb)", qty: 1, sku: "AB-WHT-1LB" }],
    issue: "White Aroma Beads (1 lb) is below reorder point — fulfillment may be delayed.",
  },
  {
    id: 102, order_number: 1042, customer_name: "Jordan Bell", customer_email: "jbell@example.com",
    status: "processing", item_count: 2, total: 19.98, created_at: "2026-08-06T11:22:00Z",
    items: [{ name: "Comfort Colors 1717 (L) White", qty: 1, sku: "CC-1717-L-WHT" }, { name: "HTV White 12x5ft", qty: 1, sku: "HTV-WHT-12-5FT" }],
    issue: "CC 1717 (L) White is out of stock.",
  },
  {
    id: 103, order_number: 1043, customer_name: "Morgan Davis", customer_email: "m.davis@mail.com",
    status: "packed", item_count: 4, total: 46.96, created_at: "2026-08-06T13:05:00Z",
    items: [{ name: "Red Chunky Glitter (1 oz)", qty: 2, sku: "GL-RED-CHUNK-1OZ" }, { name: "Black Permanent Vinyl (12x5ft)", qty: 1, sku: "VIN-BLK-12-5FT" }, { name: "Ghost Freshie Mold", qty: 1, sku: "MOLD-GHOST-01" }],
  },
  {
    id: 104, order_number: 1044, customer_name: "Casey Lin", customer_email: "casey.lin@web.net",
    status: "shipped", item_count: 1, total: 22.99, created_at: "2026-08-04T08:00:00Z",
    items: [{ name: "Rose Garden Aroma Beads Kit", qty: 1, sku: "KIT-ROSE-BEADS" }],
  },
  {
    id: 105, order_number: 1045, customer_name: "Riley Thompson", customer_email: "riley.t@email.com",
    status: "pending", item_count: 5, total: 58.45, created_at: "2026-08-07T07:30:00Z",
    items: [{ name: "Strawberry Fields FO (1 oz)", qty: 3, sku: "FO-SF-1OZ" }, { name: "Silver Holographic Glitter (1 oz)", qty: 2, sku: "GL-SIL-HOLO-1OZ" }],
    issue: "Strawberry Fields FO only 6 in stock; order needs 3.",
  },
];

const CRAFT_INSIGHTS: DemoInsight[] = [
  {
    engine: "inventory", severity: "warning", is_demo: true,
    title: "White Aroma Beads may run out before next delivery",
    summary: "You have 24 lbs in stock with a reorder point of 30. Based on recent order volume, you could run out in 3–4 days.",
    reasoning: "Order #1041 needs 1 lb. Current stock: 24 lbs. Reorder point: 30 lbs. No open PO found.",
    recommended_action: "Create a purchase order for Bulk Fragrance Co. now to arrive before stock runs critical.",
    action_label: "Draft PO", action_link: "/purchasing", confidence: "high",
  },
  {
    engine: "orders", severity: "urgent", is_demo: true,
    title: "2 orders are blocked by missing stock",
    summary: "Orders #1041 and #1045 cannot be fully packed because of stock shortages on 3 SKUs.",
    reasoning: "Order #1041: AB-WHT-1LB below reorder. Order #1045: FO-SF-1OZ (need 3, have 6 — barely enough but risky). CC-1717-L-WHT is out of stock for Order #1042.",
    recommended_action: "Review stock gaps and create purchase orders or contact customers to manage expectations.",
    action_label: "Review blocked orders", action_link: "/orders", confidence: "high",
  },
  {
    engine: "purchasing", severity: "warning", is_demo: true,
    title: "3 SKUs need purchase orders this week",
    summary: "White Aroma Beads, Strawberry Fields FO, and Comfort Colors 1717 (L) White are all below reorder thresholds with no open POs.",
    reasoning: "Deterministic reorder check: stock_count < reorder_point AND no pending PO for supplier.",
    recommended_action: "I've prepared a draft PO summary. Review before sending.",
    action_label: "Review draft POs", action_link: "/purchasing", confidence: "high",
  },
  {
    engine: "fulfillment", severity: "info", is_demo: true,
    title: "9 orders moving normally — 2 need your attention",
    summary: "Most fulfillment is on track. Orders #1041 and #1045 have stock issues that may delay shipping.",
    reasoning: "Fulfillment queue shows 11 open orders. 9 can proceed. 2 are blocked by inventory.",
    recommended_action: "Clear the inventory blocks, then fulfillment can proceed for all 11.",
    action_label: "View fulfillment queue", action_link: "/fulfillment", confidence: "high",
  },
  {
    engine: "hq", severity: "celebration", is_demo: true,
    title: "You shipped 4 orders yesterday — great momentum",
    summary: "Yesterday's fulfillment was your strongest day this week.",
    reasoning: "Audit log shows 4 shipment events on 2026-08-06.",
    recommended_action: "Keep the pace — clear today's 2 blocked orders and you'll match it.",
    action_label: "View activity", action_link: "/timeline", confidence: "high",
  },
];

// ── E-commerce Brand ──────────────────────────────────────────────────

const ECOMM_PRODUCTS: DemoProduct[] = [
  { id: 201, name: "Essential Tee — Black (S)", sku: "ET-BLK-S", category: "Apparel", stock_count: 55, reorder_point: 20, unit: "units", supplier: "Wholesale Garments Co.", cost: 8.00, price: 29.99, bin: "A-01", location: "Warehouse 1", status: "healthy" },
  { id: 202, name: "Essential Tee — Black (M)", sku: "ET-BLK-M", category: "Apparel", stock_count: 18, reorder_point: 20, unit: "units", supplier: "Wholesale Garments Co.", cost: 8.00, price: 29.99, bin: "A-01", location: "Warehouse 1", status: "low" },
  { id: 203, name: "Essential Tee — Black (L)", sku: "ET-BLK-L", category: "Apparel", stock_count: 0, reorder_point: 20, unit: "units", supplier: "Wholesale Garments Co.", cost: 8.00, price: 29.99, bin: "A-01", location: "Warehouse 1", status: "out" },
  { id: 204, name: "Essential Tee — White (S)", sku: "ET-WHT-S", category: "Apparel", stock_count: 64, reorder_point: 20, unit: "units", supplier: "Wholesale Garments Co.", cost: 8.00, price: 29.99, bin: "A-02", location: "Warehouse 1", status: "healthy" },
  { id: 205, name: "Signature Hoodie — Navy (M)", sku: "SH-NVY-M", category: "Apparel", stock_count: 22, reorder_point: 15, unit: "units", supplier: "Wholesale Garments Co.", cost: 18.00, price: 59.99, bin: "B-01", location: "Warehouse 1", status: "healthy" },
  { id: 206, name: "Signature Hoodie — Navy (L)", sku: "SH-NVY-L", category: "Apparel", stock_count: 7, reorder_point: 15, unit: "units", supplier: "Wholesale Garments Co.", cost: 18.00, price: 59.99, bin: "B-01", location: "Warehouse 1", status: "critical" },
  { id: 207, name: "Sticker Bundle Pack", sku: "STICKER-BUNDLE-5", category: "Accessories", stock_count: 180, reorder_point: 50, unit: "packs", supplier: "Sticker Mule", cost: 3.50, price: 9.99, bin: "C-01", location: "Warehouse 2", status: "healthy" },
  { id: 208, name: "Canvas Tote Bag", sku: "TOTE-NAT-LG", category: "Accessories", stock_count: 44, reorder_point: 20, unit: "units", supplier: "Eco Bag Co.", cost: 5.20, price: 18.99, bin: "C-02", location: "Warehouse 2", status: "healthy" },
  { id: 209, name: "Starter Bundle (Tee + Tote)", sku: "BUNDLE-STARTER", category: "Bundles", stock_count: 12, reorder_point: 10, unit: "bundles", supplier: "In-House", cost: 16.00, price: 44.99, bin: "D-01", location: "Warehouse 1", status: "healthy" },
  { id: 210, name: "Holiday Gift Set", sku: "BUNDLE-HOLIDAY", category: "Bundles", stock_count: 3, reorder_point: 10, unit: "bundles", supplier: "In-House", cost: 28.00, price: 79.99, bin: "D-02", location: "Warehouse 1", status: "critical" },
];

const ECOMM_ORDERS: DemoOrder[] = [
  {
    id: 201, order_number: 2081, customer_name: "Alex Rivera", customer_email: "alex.r@gmail.com",
    status: "processing", item_count: 2, total: 59.98, created_at: "2026-08-07T08:11:00Z",
    items: [{ name: "Essential Tee — Black (L)", qty: 2, sku: "ET-BLK-L" }],
    issue: "ET-BLK-L is out of stock. Order cannot be fulfilled.",
  },
  {
    id: 202, order_number: 2082, customer_name: "Sam Chen", customer_email: "sam.chen@work.com",
    status: "packed", item_count: 1, total: 44.99, created_at: "2026-08-06T15:45:00Z",
    items: [{ name: "Starter Bundle (Tee + Tote)", qty: 1, sku: "BUNDLE-STARTER" }],
  },
  {
    id: 203, order_number: 2083, customer_name: "Jamie Wells", customer_email: "jwells@mail.net",
    status: "shipped", item_count: 3, total: 99.97, created_at: "2026-08-05T10:20:00Z",
    items: [{ name: "Signature Hoodie — Navy (M)", qty: 1, sku: "SH-NVY-M" }, { name: "Sticker Bundle Pack", qty: 2, sku: "STICKER-BUNDLE-5" }],
  },
  {
    id: 204, order_number: 2084, customer_name: "Dana Park", customer_email: "d.park@email.com",
    status: "issue", item_count: 2, total: 139.98, created_at: "2026-08-04T12:30:00Z",
    items: [{ name: "Holiday Gift Set", qty: 2, sku: "BUNDLE-HOLIDAY" }],
    issue: "Holiday Gift Set: only 3 in stock, needs 2 — barely available but risky.",
  },
  {
    id: 205, order_number: 2085, customer_name: "Morgan Yu", customer_email: "morgan.y@example.com",
    status: "pending", item_count: 1, total: 79.99, created_at: "2026-08-07T09:05:00Z",
    items: [{ name: "Holiday Gift Set", qty: 1, sku: "BUNDLE-HOLIDAY" }],
  },
];

const ECOMM_INSIGHTS: DemoInsight[] = [
  {
    engine: "inventory", severity: "urgent", is_demo: true,
    title: "Essential Tee Black (L) is out of stock with active orders",
    summary: "Order #2081 needs 2 units of ET-BLK-L. Current stock: 0. No open PO exists.",
    reasoning: "stock_count = 0, order pending fulfillment. Customer has not been notified.",
    recommended_action: "Create a PO for Wholesale Garments Co. and contact customer Alex Rivera about delay.",
    action_label: "Draft PO", action_link: "/purchasing", confidence: "high",
  },
  {
    engine: "orders", severity: "warning", is_demo: true,
    title: "Holiday Gift Set may be oversold — 3 in stock, 3 ordered",
    summary: "Orders #2084 (2 units) and #2085 (1 unit) consume your entire Holiday Gift Set stock.",
    reasoning: "Total demand: 3 units. Stock: 3. No buffer. Any damage or return leaves you short.",
    recommended_action: "Review fulfillment priority — first-come-first-served or pause new orders?",
    action_label: "Review orders", action_link: "/orders", confidence: "medium",
  },
  {
    engine: "fulfillment", severity: "info", is_demo: true,
    title: "8 orders on track — 1 blocked by out-of-stock",
    summary: "Your fulfillment queue is mostly healthy. Order #2081 is the only blocker right now.",
    reasoning: "9 open orders. 8 have all stock available. 1 is blocked by ET-BLK-L out of stock.",
    recommended_action: "Clear the PO for ET-BLK-L and fulfillment resumes at full speed.",
    action_label: "View fulfillment queue", action_link: "/fulfillment", confidence: "high",
  },
];

// ── Made-to-Order preset ──────────────────────────────────────────────

const MTO_TERMS: Partial<BusinessTerms> = {
  product: "Item",
  products: "Items",
  production: "Production Schedule",
  batch: "Job",
  recipe: "Spec Sheet",
  fulfillment: "Delivery",
  kit: "Bundle",
};

const MTO_INSIGHTS: DemoInsight[] = [
  {
    engine: "production", severity: "warning", is_demo: true,
    title: "3 custom jobs waiting on materials",
    summary: "Three active production jobs are stalled because incoming materials haven't arrived yet.",
    reasoning: "Jobs #J-12, #J-13, #J-14 are in 'awaiting materials' status. Expected delivery: 2 days.",
    recommended_action: "Contact supplier to confirm delivery date, or find substitute material.",
    action_label: "View production jobs", action_link: "/production", confidence: "high",
  },
];

// ── Freshies preset ───────────────────────────────────────────────────

const FRESHIES_TERMS: Partial<BusinessTerms> = {
  product: "Freshie",
  products: "Freshies",
  production: "Batch Production",
  batch: "Pour Batch",
  recipe: "Formula",
  supplier: "Fragrance Supplier",
  inventory: "Materials",
  kit: "Freshie Bundle",
  bin: "Formula Shelf",
};

const FRESHIES_INSIGHTS: DemoInsight[] = [
  {
    engine: "production", severity: "warning", is_demo: true,
    title: "Aroma bead batch can't start — fragrance oil low",
    summary: "Formula 26 (Vanilla Cupcake) requires 4.2 kg fragrance oil. You have 3.1 kg available.",
    reasoning: "formula.required_fo = 4.2kg. stock.vanilla_cupcake_fo = 3.1kg. Deficit: 1.1 kg.",
    recommended_action: "Order 2 kg Vanilla Cupcake FO from Peak Candle Supplies before starting next batch.",
    action_label: "Draft PO", action_link: "/purchasing", confidence: "high",
  },
  {
    engine: "inventory", severity: "info", is_demo: true,
    title: "Cow mold stock is healthy for upcoming production run",
    summary: "You have 18 Cow Print molds — enough for 3 full batches at standard run size.",
    reasoning: "standard_run_size = 6 molds. stock = 18. Available runs = 3.",
    recommended_action: "No action needed. Proceed with production when fragrance oil arrives.",
    action_label: "View inventory", action_link: "/products", confidence: "high",
  },
];

// ── Master Profile Map ────────────────────────────────────────────────

export const BUSINESS_DNA: Record<BusinessTypeId, BusinessDnaProfile> = {
  craft_supplies: {
    id: "craft_supplies",
    name: "Craft & Maker Supplies",
    icon: "✂️",
    tagline: "Supplies that fuel other makers.",
    description: "Bins, weights, supplier lead times, kits, wholesale, and the complexity of stocking hundreds of variants.",
    terms: { ...BASE_TERMS },
    defaultEngines: ["inventory", "orders", "purchasing", "production", "warehouse", "fulfillment", "customers"],
    priorityEngines: ["inventory", "purchasing", "orders"],
    demoLabel: "DEMO WORKSPACE — Craft & Maker Supplies",
    products: CRAFT_PRODUCTS,
    orders: CRAFT_ORDERS,
    insights: CRAFT_INSIGHTS,
    goldenPathDescription: "Order received → Inventory reserved → Picking list generated → Packed → Shipped → Customer notified → Novi flags exceptions.",
  },
  ecommerce_brand: {
    id: "ecommerce_brand",
    name: "E-commerce Brand",
    icon: "🛍️",
    tagline: "Direct-to-consumer, at scale.",
    description: "Catalog, orders, multi-location fulfillment, customer care, and a growing product line.",
    terms: { ...BASE_TERMS },
    defaultEngines: ["orders", "inventory", "fulfillment", "customers", "purchasing", "warehouse", "team"],
    priorityEngines: ["orders", "fulfillment", "customers"],
    demoLabel: "DEMO WORKSPACE — E-commerce Brand",
    products: ECOMM_PRODUCTS,
    orders: ECOMM_ORDERS,
    insights: ECOMM_INSIGHTS,
    goldenPathDescription: "Order arrives → Inventory confirmed → Pick list created → Packed → Label printed → Shipped → Customer care notified.",
  },
  made_to_order: {
    id: "made_to_order",
    name: "Made-to-Order",
    icon: "🔧",
    tagline: "Every order is unique.",
    description: "Custom jobs, spec sheets, materials procurement, production scheduling, and bespoke customer communication.",
    terms: { ...BASE_TERMS, ...MTO_TERMS },
    defaultEngines: ["orders", "production", "purchasing", "customers", "fulfillment"],
    priorityEngines: ["production", "orders", "purchasing"],
    demoLabel: "DEMO WORKSPACE — Made-to-Order",
    products: [],
    orders: [],
    insights: MTO_INSIGHTS,
    goldenPathDescription: "Custom order received → Spec sheet created → Materials sourced → Job scheduled → Produced → Delivered → Customer approved.",
  },
  freshies: {
    id: "freshies",
    name: "Freshies",
    icon: "🌸",
    tagline: "Car fresheners, made in batches with love.",
    description: "Aroma beads, fragrance oils, molds, formulas, batch production, and a passionate maker community.",
    terms: { ...BASE_TERMS, ...FRESHIES_TERMS },
    defaultEngines: ["production", "inventory", "orders", "purchasing", "fulfillment"],
    priorityEngines: ["production", "inventory", "orders"],
    demoLabel: "DEMO WORKSPACE — Freshies",
    products: [],
    orders: [],
    insights: FRESHIES_INSIGHTS,
    goldenPathDescription: "Batch formula activated → Aroma bead stock confirmed → Fragrance oil measured → Production run completed → Freshies labeled → Orders filled.",
  },
};

// ── Helper functions ─────────────────────────────────────────────────

/** Get the DNA profile for a given business type, defaulting to craft_supplies. */
export function getBusinessDna(typeId: BusinessTypeId | string | null | undefined): BusinessDnaProfile {
  return BUSINESS_DNA[(typeId as BusinessTypeId)] ?? BUSINESS_DNA.craft_supplies;
}

/** Merge base terms with business-type-specific overrides. */
export function getTerms(typeId: BusinessTypeId | string | null | undefined): BusinessTerms {
  return getBusinessDna(typeId).terms;
}

/** Get demo insights for a specific engine and business type. */
export function getDemoInsights(
  typeId: BusinessTypeId | string | null | undefined,
  engine?: string,
): DemoInsight[] {
  const dna = getBusinessDna(typeId);
  if (!engine) return dna.insights;
  return dna.insights.filter((i) => i.engine === engine || i.engine === "hq");
}

/** Get the severity color class for an insight severity. */
export function insightSeverityClass(severity: DemoInsight["severity"]): {
  bg: string; border: string; badge: string; icon: string;
} {
  switch (severity) {
    case "urgent":      return { bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-700", icon: "🔴" };
    case "warning":     return { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-700", icon: "⚠️" };
    case "celebration": return { bg: "bg-violet-50", border: "border-violet-200", badge: "bg-violet-100 text-violet-700", icon: "🎉" };
    default:            return { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700", icon: "ℹ️" };
  }
}

/** All four business types in display order. */
export const BUSINESS_TYPES: Array<{ id: BusinessTypeId; name: string; icon: string; tagline: string }> = [
  { id: "craft_supplies", name: "Craft & Maker Supplies", icon: "✂️", tagline: "Bins, weights, kits, and supplier lead times" },
  { id: "ecommerce_brand", name: "E-commerce Brand", icon: "🛍️", tagline: "Catalog, orders, fulfillment, and customer care" },
  { id: "made_to_order", name: "Made-to-Order", icon: "🔧", tagline: "Custom jobs, spec sheets, and production scheduling" },
  { id: "freshies", name: "Freshies", icon: "🌸", tagline: "Formulas, aroma beads, fragrance oils, and batch production" },
];
