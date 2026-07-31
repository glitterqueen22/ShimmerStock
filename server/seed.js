/**
 * ShimmerStock GGE Seed Script
 * ============================
 * Populates the database with a realistic Glitzy Glitter Express product catalog.
 *
 * Usage:
 *   bun run server/seed.js          — idempotent seed (skips existing by SKU)
 *   bun run server/seed.js --reset  — drop+recreate before seeding
 */

import { initDb } from "./db.js";
import * as store from "./store.js";
import { hashPassword } from "./auth.js";
import { Database } from "bun:sqlite";
import path from "path";

const DB_PATH = path.join(import.meta.dirname, "..", "shimmerstock.db");
const RESET = process.argv.includes("--reset");

if (RESET) {
  console.log("🧹 --reset flag detected. Dropping and recreating database...");
  const fs = await import("fs");
  try {
    fs.unlinkSync(DB_PATH);
    // Also remove WAL/SHM
    try { fs.unlinkSync(DB_PATH + "-wal"); } catch {}
    try { fs.unlinkSync(DB_PATH + "-shm"); } catch {}
    console.log("  Database files removed.");
  } catch (e) {
    // File might not exist yet — that's fine
  }
}

// Initialize fresh database
const db = initDb();

// ── Ensure GGE business exists ────────────────────────────────────────

let ggeBusiness = db.query("SELECT id FROM businesses WHERE slug = ?").get("glitzy-glitter-express");
if (!ggeBusiness) {
  const result = db.run(
    "INSERT INTO businesses (name, slug) VALUES (?, ?)",
    ["Glitzy Glitter Express", "glitzy-glitter-express"]
  );
  ggeBusiness = { id: result.lastInsertRowid };
  console.log("  Created business: Glitzy Glitter Express");
} else {
  console.log(`  Business exists: Glitzy Glitter Express (id=${ggeBusiness.id})`);
}

const BIZ = ggeBusiness.id;

// ── Helper: idempotent insert ─────────────────────────────────────────

function upsertProduct(name, sku, barcode = null, stockCount = 0) {
  const existing = db.query("SELECT id FROM products WHERE sku = ? AND business_id = ?").get(sku, BIZ);
  if (existing) return existing.id;
  const r = db.run(
    "INSERT INTO products (name, sku, barcode, stock_count, business_id) VALUES (?, ?, ?, ?, ?)",
    [name, sku, barcode, stockCount, BIZ]
  );
  return r.lastInsertRowid;
}

function upsertVariant(productId, { sku, barcode, variantType, variantValue, price, cost, stockCount, weightOz }) {
  const existing = db.query("SELECT id FROM product_variants WHERE sku = ? AND business_id = ?").get(sku, BIZ);
  if (existing) return existing.id;
  const r = db.run(
    `INSERT INTO product_variants (product_id, business_id, sku, barcode, variant_type, variant_value, price, cost, stock_count, weight_oz)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [productId, BIZ, sku, barcode ?? null, variantType, variantValue, price ?? null, cost ?? null, stockCount ?? 0, weightOz ?? null]
  );
  return r.lastInsertRowid;
}

function upsertSupplier(name, contactName = null, email = null, phone = null, website = null, notes = null) {
  const existing = db.query("SELECT id FROM suppliers WHERE name = ? AND business_id = ?").get(name, BIZ);
  if (existing) return existing.id;
  const r = db.run(
    "INSERT INTO suppliers (business_id, name, contact_name, email, phone, website, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [BIZ, name, contactName, email, phone, website, notes]
  );
  return r.lastInsertRowid;
}

function upsertSupplierProduct(supplierId, productId, opts = {}) {
  const existing = db.query(
    "SELECT id FROM supplier_products WHERE supplier_id = ? AND product_id = ?"
  ).get(supplierId, productId);
  if (existing) return existing.id;
  const r = db.run(
    `INSERT INTO supplier_products (supplier_id, product_id, supplier_sku, unit_cost, unit_type, min_order_qty, quoted_lead_time_days, is_preferred)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [supplierId, productId, opts.supplierSku ?? null, opts.unitCost ?? null, opts.unitType ?? "unit",
     opts.minOrderQty ?? 1, opts.quotedLeadTimeDays ?? null, opts.isPreferred ? 1 : 0]
  );
  return r.lastInsertRowid;
}

function upsertUser(username, displayName, role, passwordPlain) {
  const existing = db.query("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    // Ensure user_businesses link exists
    db.run("INSERT OR IGNORE INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, ?, ?, 1)",
      [existing.id, BIZ, role]);
    return existing.id;
  }
  const hash = Bun.password.hashSync(passwordPlain);
  const r = db.run(
    "INSERT INTO users (username, password_hash, display_name, role, password_changed_at) VALUES (?, ?, ?, ?, NULL)",
    [username, hash, displayName, role]
  );
  const userId = r.lastInsertRowid;
  db.run("INSERT OR IGNORE INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, ?, ?, 1)",
    [userId, BIZ, role]);
  return userId;
}

function upsertBom(name, outputProductId, outputQuantity = 1, outputUnit = "unit") {
  const existing = db.query("SELECT id FROM boms WHERE name = ? AND business_id = ?").get(name, BIZ);
  if (existing) return existing.id;
  const r = db.run(
    "INSERT INTO boms (business_id, name, output_product_id, output_quantity, output_unit) VALUES (?, ?, ?, ?, ?)",
    [BIZ, name, outputProductId, outputQuantity, outputUnit]
  );
  return r.lastInsertRowid;
}

function addBomItemIfMissing(bomId, inputProductId, quantityPerBatch, unit = "unit", sortOrder = 0) {
  const existing = db.query(
    "SELECT id FROM bom_items WHERE bom_id = ? AND input_product_id = ?"
  ).get(bomId, inputProductId);
  if (existing) return;
  db.run(
    "INSERT INTO bom_items (bom_id, input_product_id, quantity_per_batch, unit, sort_order) VALUES (?, ?, ?, ?, ?)",
    [bomId, inputProductId, quantityPerBatch, unit, sortOrder]
  );
}

function upsertThreshold(productId, reorderPoint, reorderQuantity, unitType = "unit") {
  const existing = db.query("SELECT id FROM inventory_thresholds WHERE product_id = ? AND business_id = ?").get(productId, BIZ);
  if (existing) return;
  db.run(
    `INSERT INTO inventory_thresholds (business_id, product_id, reorder_point, reorder_quantity, unit_type, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [BIZ, productId, reorderPoint, reorderQuantity, unitType]
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════════════

console.log("\n📦 Seeding GGE product catalog...\n");

// ── SUPPLIERS ─────────────────────────────────────────────────────────

console.log("  Suppliers...");
const sparkleSupply = upsertSupplier(
  "SparkleSupply Inc",
  "Jennifer Sparks",
  "jennifer@sparklesupply.example.com",
  "555-0101",
  "sparklesupply.example.com",
  "Primary supplier for polypropylene and biodegradable glitter"
);

const fragranceHouse = upsertSupplier(
  "FragranceHouse Ltd",
  "Michael Chen",
  "michael@fragrancehouse.example.com",
  "555-0102",
  "fragrancehouse.example.com",
  "Preferred supplier for fragrance oils — excellent quality and lead times"
);

const candleWickPro = upsertSupplier(
  "CandleWick Pro",
  "Robert Torres",
  "robert@candlewickpro.example.com",
  "555-0103",
  "candlewickpro.example.com",
  "Wax, wicks, jars, and candle-making supplies"
);

const packageItCo = upsertSupplier(
  "PackageIt Co",
  "Amanda Lee",
  "amanda@packageit.example.com",
  "555-0104",
  "packageit.example.com",
  "Packaging and containers — jars, bottles, boxes, shakers"
);

console.log(`    4 suppliers seeded`);

// ── GLITTER PRODUCTS ──────────────────────────────────────────────────

console.log("  Glitter products...");

// 1. Ultra Fine Glitter
const ultraFineId = upsertProduct("Ultra Fine Glitter", "GLT-UF", null, 250);
const uf2oz = upsertVariant(ultraFineId, { sku: "GLT-UF-2-SLV", barcode: "890010000001", variantType: "size+color", variantValue: "2oz Silver", price: 5.99, cost: 1.80, stockCount: 50, weightOz: 2 });
const uf4oz = upsertVariant(ultraFineId, { sku: "GLT-UF-4-SLV", barcode: "890010000002", variantType: "size+color", variantValue: "4oz Silver", price: 9.99, cost: 3.20, stockCount: 40, weightOz: 4 });
const uf8oz = upsertVariant(ultraFineId, { sku: "GLT-UF-8-SLV", barcode: "890010000003", variantType: "size+color", variantValue: "8oz Silver", price: 17.99, cost: 5.80, stockCount: 30, weightOz: 8 });
upsertVariant(ultraFineId, { sku: "GLT-UF-2-RGD", barcode: "890010000004", variantType: "size+color", variantValue: "2oz Rose Gold", price: 6.49, cost: 2.00, stockCount: 45, weightOz: 2 });
upsertVariant(ultraFineId, { sku: "GLT-UF-4-RGD", barcode: "890010000005", variantType: "size+color", variantValue: "4oz Rose Gold", price: 10.99, cost: 3.60, stockCount: 35, weightOz: 4 });
upsertVariant(ultraFineId, { sku: "GLT-UF-2-HOL", barcode: "890010000006", variantType: "size+color", variantValue: "2oz Holographic", price: 7.49, cost: 2.40, stockCount: 55, weightOz: 2 });
// Link to supplier
upsertSupplierProduct(sparkleSupply, ultraFineId, { supplierSku: "SPK-UF", unitCost: 1.80, unitType: "oz", minOrderQty: 16, quotedLeadTimeDays: 5, isPreferred: true });
upsertThreshold(ultraFineId, 60, 100, "units");

// 2. Chunky Glitter Mix
const chunkyId = upsertProduct("Chunky Glitter Mix", "GLT-CHUNKY", null, 120);
upsertVariant(chunkyId, { sku: "GLT-CH-2", barcode: "890010000010", variantType: "size", variantValue: "2oz", price: 6.99, cost: 2.20, stockCount: 35, weightOz: 2 });
upsertVariant(chunkyId, { sku: "GLT-CH-4", barcode: "890010000011", variantType: "size", variantValue: "4oz", price: 11.99, cost: 3.90, stockCount: 25, weightOz: 4 });
upsertSupplierProduct(sparkleSupply, chunkyId, { supplierSku: "SPK-CHUNK", unitCost: 2.20, unitType: "oz", minOrderQty: 12, quotedLeadTimeDays: 5, isPreferred: true });
upsertThreshold(chunkyId, 30, 50, "units");

// 3. Biodegradable Glitter
const bioId = upsertProduct("Biodegradable Glitter", "GLT-BIO", null, 200);
upsertVariant(bioId, { sku: "GLT-BIO-2-GLD", barcode: "890010000020", variantType: "size+color", variantValue: "2oz Gold", price: 7.99, cost: 2.80, stockCount: 40, weightOz: 2 });
upsertVariant(bioId, { sku: "GLT-BIO-4-GLD", barcode: "890010000021", variantType: "size+color", variantValue: "4oz Gold", price: 13.99, cost: 5.00, stockCount: 30, weightOz: 4 });
upsertVariant(bioId, { sku: "GLT-BIO-8-GLD", barcode: "890010000022", variantType: "size+color", variantValue: "8oz Gold", price: 24.99, cost: 9.00, stockCount: 20, weightOz: 8 });
upsertVariant(bioId, { sku: "GLT-BIO-2-COP", barcode: "890010000023", variantType: "size+color", variantValue: "2oz Copper", price: 7.99, cost: 2.80, stockCount: 35, weightOz: 2 });
upsertVariant(bioId, { sku: "GLT-BIO-2-EM", barcode: "890010000024", variantType: "size+color", variantValue: "2oz Emerald", price: 8.49, cost: 3.00, stockCount: 30, weightOz: 2 });
upsertSupplierProduct(sparkleSupply, bioId, { supplierSku: "SPK-BIO", unitCost: 2.80, unitType: "oz", minOrderQty: 20, quotedLeadTimeDays: 7, isPreferred: true });
upsertThreshold(bioId, 50, 80, "units");

// 4. Neon Glitter Set
const neonId = upsertProduct("Neon Glitter Set", "GLT-NEON-SET", null, 80);
upsertVariant(neonId, { sku: "GLT-NEON-6", barcode: "890010000030", variantType: "set", variantValue: "6-Color Set", price: 24.99, cost: 9.00, stockCount: 25, weightOz: 12 });
upsertVariant(neonId, { sku: "GLT-NEON-12", barcode: "890010000031", variantType: "set", variantValue: "12-Color Set", price: 44.99, cost: 17.00, stockCount: 15, weightOz: 24 });
upsertSupplierProduct(sparkleSupply, neonId, { supplierSku: "SPK-NEONSET", unitCost: 9.00, unitType: "set", minOrderQty: 6, quotedLeadTimeDays: 5, isPreferred: true });
upsertThreshold(neonId, 15, 20, "units");

// 5. Cosmetic Glitter (FDA-approved)
const cosmeticId = upsertProduct("Cosmetic Glitter", "GLT-COSMETIC", null, 100);
upsertVariant(cosmeticId, { sku: "GLT-COS-5G", barcode: "890010000040", variantType: "size", variantValue: "5g", price: 8.99, cost: 2.50, stockCount: 40, weightOz: 0.18 });
upsertVariant(cosmeticId, { sku: "GLT-COS-15G", barcode: "890010000041", variantType: "size", variantValue: "15g", price: 19.99, cost: 6.50, stockCount: 25, weightOz: 0.53 });
upsertSupplierProduct(sparkleSupply, cosmeticId, { supplierSku: "SPK-COSMETIC", unitCost: 2.50, unitType: "5g", minOrderQty: 10, quotedLeadTimeDays: 7, isPreferred: true });
upsertThreshold(cosmeticId, 30, 50, "units");

// 6. Mixing Base / Suspension Liquid
const baseId = upsertProduct("Mixing Base Suspension Liquid", "GLT-MIXBASE", null, 200);
upsertVariant(baseId, { sku: "GLT-MB-4", barcode: "890010000050", variantType: "size", variantValue: "4oz", price: 4.99, cost: 1.20, stockCount: 60, weightOz: 4 });
upsertVariant(baseId, { sku: "GLT-MB-8", barcode: "890010000051", variantType: "size", variantValue: "8oz", price: 7.99, cost: 2.10, stockCount: 50, weightOz: 8 });
upsertVariant(baseId, { sku: "GLT-MB-16", barcode: "890010000052", variantType: "size", variantValue: "16oz", price: 12.99, cost: 3.80, stockCount: 30, weightOz: 16 });
upsertSupplierProduct(sparkleSupply, baseId, { supplierSku: "SPK-MIXBASE", unitCost: 1.20, unitType: "4oz", minOrderQty: 24, quotedLeadTimeDays: 5, isPreferred: true });
upsertThreshold(baseId, 50, 100, "units");

console.log(`    6 glitter products with variants`);

// ── FRAGRANCE OILS ────────────────────────────────────────────────────

console.log("  Fragrance oils...");

const lavId = upsertProduct("Lavender Fragrance Oil", "FO-LAVENDER", null, 150);
upsertVariant(lavId, { sku: "FO-LAV-1", barcode: "890010000100", variantType: "size", variantValue: "1oz", price: 5.99, cost: 1.50, stockCount: 40, weightOz: 1 });
upsertVariant(lavId, { sku: "FO-LAV-4", barcode: "890010000101", variantType: "size", variantValue: "4oz", price: 16.99, cost: 5.00, stockCount: 30, weightOz: 4 });
upsertVariant(lavId, { sku: "FO-LAV-16", barcode: "890010000102", variantType: "size", variantValue: "16oz", price: 49.99, cost: 16.00, stockCount: 20, weightOz: 16 });
upsertSupplierProduct(fragranceHouse, lavId, { supplierSku: "FH-LAV", unitCost: 1.50, unitType: "oz", minOrderQty: 8, quotedLeadTimeDays: 3, isPreferred: true });
upsertThreshold(lavId, 30, 50, "units");

const vanId = upsertProduct("Vanilla Bean Fragrance Oil", "FO-VANILLA", null, 130);
upsertVariant(vanId, { sku: "FO-VAN-1", barcode: "890010000110", variantType: "size", variantValue: "1oz", price: 6.49, cost: 1.80, stockCount: 35, weightOz: 1 });
upsertVariant(vanId, { sku: "FO-VAN-4", barcode: "890010000111", variantType: "size", variantValue: "4oz", price: 18.99, cost: 6.00, stockCount: 25, weightOz: 4 });
upsertVariant(vanId, { sku: "FO-VAN-16", barcode: "890010000112", variantType: "size", variantValue: "16oz", price: 54.99, cost: 19.00, stockCount: 15, weightOz: 16 });
upsertSupplierProduct(fragranceHouse, vanId, { supplierSku: "FH-VAN", unitCost: 1.80, unitType: "oz", minOrderQty: 8, quotedLeadTimeDays: 3, isPreferred: true });
upsertThreshold(vanId, 25, 40, "units");

const sandId = upsertProduct("Sandalwood Fragrance Oil", "FO-SANDALWOOD", null, 90);
upsertVariant(sandId, { sku: "FO-SAND-1", barcode: "890010000120", variantType: "size", variantValue: "1oz", price: 7.99, cost: 2.50, stockCount: 25, weightOz: 1 });
upsertVariant(sandId, { sku: "FO-SAND-4", barcode: "890010000121", variantType: "size", variantValue: "4oz", price: 22.99, cost: 8.00, stockCount: 20, weightOz: 4 });
upsertVariant(sandId, { sku: "FO-SAND-16", barcode: "890010000122", variantType: "size", variantValue: "16oz", price: 64.99, cost: 24.00, stockCount: 10, weightOz: 16 });
upsertSupplierProduct(fragranceHouse, sandId, { supplierSku: "FH-SAND", unitCost: 2.50, unitType: "oz", minOrderQty: 8, quotedLeadTimeDays: 5, isPreferred: true });
upsertThreshold(sandId, 20, 30, "units");

// Seasonal fragrance oils
const pumpId = upsertProduct("Pumpkin Spice Fragrance Oil", "FO-PUMPKIN", null, 60);
upsertVariant(pumpId, { sku: "FO-PUMP-1", barcode: "890010000130", variantType: "size", variantValue: "1oz", price: 6.99, cost: 2.00, stockCount: 20, weightOz: 1 });
upsertVariant(pumpId, { sku: "FO-PUMP-4", barcode: "890010000131", variantType: "size", variantValue: "4oz", price: 19.99, cost: 6.50, stockCount: 10, weightOz: 4 });
upsertSupplierProduct(fragranceHouse, pumpId, { supplierSku: "FH-PUMP", unitCost: 2.00, unitType: "oz", minOrderQty: 8, quotedLeadTimeDays: 4 });

const pepId = upsertProduct("Peppermint Fragrance Oil", "FO-PEPPERMINT", null, 70);
upsertVariant(pepId, { sku: "FO-PEP-1", barcode: "890010000140", variantType: "size", variantValue: "1oz", price: 5.99, cost: 1.50, stockCount: 25, weightOz: 1 });
upsertVariant(pepId, { sku: "FO-PEP-4", barcode: "890010000141", variantType: "size", variantValue: "4oz", price: 16.99, cost: 5.00, stockCount: 15, weightOz: 4 });
upsertSupplierProduct(fragranceHouse, pepId, { supplierSku: "FH-PEP", unitCost: 1.50, unitType: "oz", minOrderQty: 8, quotedLeadTimeDays: 4 });

const linenId = upsertProduct("Fresh Linen Fragrance Oil", "FO-LINEN", null, 65);
upsertVariant(linenId, { sku: "FO-LIN-1", barcode: "890010000150", variantType: "size", variantValue: "1oz", price: 6.49, cost: 1.80, stockCount: 20, weightOz: 1 });
upsertVariant(linenId, { sku: "FO-LIN-4", barcode: "890010000151", variantType: "size", variantValue: "4oz", price: 18.99, cost: 6.00, stockCount: 10, weightOz: 4 });
upsertSupplierProduct(fragranceHouse, linenId, { supplierSku: "FH-LIN", unitCost: 1.80, unitType: "oz", minOrderQty: 8, quotedLeadTimeDays: 4 });

console.log(`    6 fragrance oils with variants`);

// ── CANDLE-MAKING SUPPLIES ────────────────────────────────────────────

console.log("  Candle-making supplies...");

const waxId = upsertProduct("Soy Wax", "CND-WAX", null, 300);
upsertVariant(waxId, { sku: "CND-WAX-1LB", barcode: "890010000200", variantType: "weight", variantValue: "1 lb", price: 8.99, cost: 3.50, stockCount: 50, weightOz: 16 });
upsertVariant(waxId, { sku: "CND-WAX-5LB", barcode: "890010000201", variantType: "weight", variantValue: "5 lb", price: 34.99, cost: 15.00, stockCount: 30, weightOz: 80 });
upsertVariant(waxId, { sku: "CND-WAX-25LB", barcode: "890010000202", variantType: "weight", variantValue: "25 lb", price: 129.99, cost: 60.00, stockCount: 15, weightOz: 400 });
upsertSupplierProduct(candleWickPro, waxId, { supplierSku: "CWP-SOY", unitCost: 3.50, unitType: "lb", minOrderQty: 10, quotedLeadTimeDays: 3, isPreferred: true });
upsertThreshold(waxId, 30, 50, "units");

const wickId = upsertProduct("Candle Wicks (Pre-Tabbed)", "CND-WICK", null, 500);
upsertVariant(wickId, { sku: "CND-WICK-SM", barcode: "890010000210", variantType: "size", variantValue: "Small (CD-4)", price: 4.99, cost: 0.80, stockCount: 200, weightOz: 0.1 });
upsertVariant(wickId, { sku: "CND-WICK-MD", barcode: "890010000211", variantType: "size", variantValue: "Medium (CD-8)", price: 4.99, cost: 0.85, stockCount: 150, weightOz: 0.1 });
upsertVariant(wickId, { sku: "CND-WICK-LG", barcode: "890010000212", variantType: "size", variantValue: "Large (CD-12)", price: 5.49, cost: 0.90, stockCount: 100, weightOz: 0.1 });
upsertSupplierProduct(candleWickPro, wickId, { supplierSku: "CWP-WICKS", unitCost: 0.80, unitType: "pack-10", minOrderQty: 20, quotedLeadTimeDays: 3, isPreferred: true });
upsertThreshold(wickId, 150, 300, "units");

const jarId = upsertProduct("Glass Candle Jars", "CND-JAR", null, 180);
upsertVariant(jarId, { sku: "CND-JAR-8C", barcode: "890010000220", variantType: "size+finish", variantValue: "8oz Clear", price: 3.49, cost: 1.20, stockCount: 60, weightOz: 10 });
upsertVariant(jarId, { sku: "CND-JAR-8F", barcode: "890010000221", variantType: "size+finish", variantValue: "8oz Frosted", price: 3.99, cost: 1.40, stockCount: 50, weightOz: 10 });
upsertVariant(jarId, { sku: "CND-JAR-16C", barcode: "890010000222", variantType: "size+finish", variantValue: "16oz Clear", price: 4.99, cost: 1.80, stockCount: 40, weightOz: 18 });
upsertVariant(jarId, { sku: "CND-JAR-16F", barcode: "890010000223", variantType: "size+finish", variantValue: "16oz Frosted", price: 5.49, cost: 2.00, stockCount: 30, weightOz: 18 });
upsertSupplierProduct(candleWickPro, jarId, { supplierSku: "CWP-JARS", unitCost: 1.20, unitType: "each", minOrderQty: 12, quotedLeadTimeDays: 5, isPreferred: true });
upsertThreshold(jarId, 50, 80, "units");

const toolId = upsertProduct("Wick Centering Tools", "CND-TOOL-WCT", null, 75);
upsertVariant(toolId, { sku: "CND-TOOL-WCT-STD", barcode: "890010000230", variantType: "default", variantValue: "Standard", price: 2.99, cost: 0.75, stockCount: 75, weightOz: 1 });
upsertSupplierProduct(candleWickPro, toolId, { supplierSku: "CWP-TOOLS", unitCost: 0.75, unitType: "each", minOrderQty: 25, quotedLeadTimeDays: 5 });

console.log(`    4 candle-making supplies with variants`);

// ── PACKAGING ─────────────────────────────────────────────────────────

console.log("  Packaging...");

const shakerId = upsertProduct("Glitter Shaker Jars", "PKG-SHAKER", null, 200);
upsertVariant(shakerId, { sku: "PKG-SHK-2", barcode: "890010000300", variantType: "size", variantValue: "2oz", price: 1.49, cost: 0.40, stockCount: 80, weightOz: 3 });
upsertVariant(shakerId, { sku: "PKG-SHK-4", barcode: "890010000301", variantType: "size", variantValue: "4oz", price: 1.99, cost: 0.55, stockCount: 70, weightOz: 5 });
upsertVariant(shakerId, { sku: "PKG-SHK-8", barcode: "890010000302", variantType: "size", variantValue: "8oz", price: 2.99, cost: 0.90, stockCount: 50, weightOz: 9 });
upsertSupplierProduct(packageItCo, shakerId, { supplierSku: "PKG-SHAKER", unitCost: 0.40, unitType: "each", minOrderQty: 50, quotedLeadTimeDays: 7, isPreferred: true });
upsertThreshold(shakerId, 60, 100, "units");

const rollerId = upsertProduct("Glass Roller Bottles", "PKG-ROLLER", null, 160);
upsertVariant(rollerId, { sku: "PKG-ROL-10A", barcode: "890010000310", variantType: "size+color", variantValue: "10ml Amber", price: 1.99, cost: 0.60, stockCount: 50, weightOz: 1.5 });
upsertVariant(rollerId, { sku: "PKG-ROL-10B", barcode: "890010000311", variantType: "size+color", variantValue: "10ml Blue", price: 1.99, cost: 0.60, stockCount: 45, weightOz: 1.5 });
upsertVariant(rollerId, { sku: "PKG-ROL-30A", barcode: "890010000312", variantType: "size+color", variantValue: "30ml Amber", price: 2.99, cost: 0.90, stockCount: 35, weightOz: 3 });
upsertVariant(rollerId, { sku: "PKG-ROL-30B", barcode: "890010000313", variantType: "size+color", variantValue: "30ml Blue", price: 2.99, cost: 0.90, stockCount: 30, weightOz: 3 });
upsertSupplierProduct(packageItCo, rollerId, { supplierSku: "PKG-ROLLER", unitCost: 0.60, unitType: "each", minOrderQty: 48, quotedLeadTimeDays: 7, isPreferred: true });

const boxId = upsertProduct("Kraft Gift Boxes", "PKG-KRAFTBOX", null, 120);
upsertVariant(boxId, { sku: "PKG-BOX-SM", barcode: "890010000320", variantType: "size", variantValue: "Small (4x4x2)", price: 1.49, cost: 0.35, stockCount: 50, weightOz: 2 });
upsertVariant(boxId, { sku: "PKG-BOX-MD", barcode: "890010000321", variantType: "size", variantValue: "Medium (6x6x3)", price: 2.49, cost: 0.65, stockCount: 40, weightOz: 4 });
upsertSupplierProduct(packageItCo, boxId, { supplierSku: "PKG-BOXES", unitCost: 0.35, unitType: "each", minOrderQty: 25, quotedLeadTimeDays: 5, isPreferred: true });

console.log(`    3 packaging products with variants`);

// ── BOMs / RECIPES ────────────────────────────────────────────────────

console.log("\n  BOMs / Recipes...");

// First, create the "finished goods" output products for BOMs
const candleProductId = upsertProduct("Lavender Soy Candle - 8oz", "CND-LAV-8", "890010000500", 0);
const kitProductId = upsertProduct("Glitter Sample Kit", "GLT-SAMPLE-KIT", "890010000501", 0);
const sprayProductId = upsertProduct("Room Spray - 4oz", "SPRAY-4OZ", "890010000502", 0);
const vanCandleId = upsertProduct("Vanilla Bean Soy Candle - 8oz", "CND-VAN-8", "890010000503", 0);

// BOM 1: "8oz Lavender Soy Candle"
const bomCandleId = upsertBom("8oz Lavender Soy Candle", candleProductId, 1, "unit");
addBomItemIfMissing(bomCandleId, waxId, 7, "oz", 1);
addBomItemIfMissing(bomCandleId, lavId, 0.5, "oz", 2);
addBomItemIfMissing(bomCandleId, wickId, 1, "each", 3);
addBomItemIfMissing(bomCandleId, jarId, 1, "each", 4);
console.log(`    BOM: 8oz Lavender Soy Candle (4 components)`);

// BOM 2: "Glitter Sample Kit"
const bomKitId = upsertBom("Glitter Sample Kit", kitProductId, 1, "kit");
addBomItemIfMissing(bomKitId, ultraFineId, 12, "oz", 1);  // 6 x 2oz
addBomItemIfMissing(bomKitId, chunkyId, 4, "oz", 2);      // 2 x 2oz
addBomItemIfMissing(bomKitId, shakerId, 8, "each", 3);    // 8 shaker jars
addBomItemIfMissing(bomKitId, boxId, 1, "each", 4);        // 1 gift box
console.log(`    BOM: Glitter Sample Kit (4 components)`);

// BOM 3: "Room Spray 4oz"
const bomSprayId = upsertBom("Room Spray 4oz", sprayProductId, 1, "unit");
addBomItemIfMissing(bomSprayId, lavId, 0.25, "oz", 1);
addBomItemIfMissing(bomSprayId, baseId, 3.75, "oz", 2);
addBomItemIfMissing(bomSprayId, rollerId, 1, "each", 3);
console.log(`    BOM: Room Spray 4oz (3 components)`);

// BOM 4: "8oz Vanilla Soy Candle"
const bomVanCandleId = upsertBom("8oz Vanilla Soy Candle", vanCandleId, 1, "unit");
addBomItemIfMissing(bomVanCandleId, waxId, 7, "oz", 1);
addBomItemIfMissing(bomVanCandleId, vanId, 0.5, "oz", 2);
addBomItemIfMissing(bomVanCandleId, wickId, 1, "each", 3);
addBomItemIfMissing(bomVanCandleId, jarId, 1, "each", 4);
console.log(`    BOM: 8oz Vanilla Soy Candle (4 components)`);

// ── USERS / EMPLOYEES ─────────────────────────────────────────────────

console.log("\n  Users / Employees...");

upsertUser("gge_owner", "Sarah Chen", "owner", "gge2024");
upsertUser("gge_admin", "Mark Rivera", "admin", "gge2024");
upsertUser("gge_warehouse", "Jose Martinez", "warehouse", "gge2024");
upsertUser("gge_production", "Lisa Thompson", "manufacturing", "gge2024");
upsertUser("gge_cs", "Emily Davis", "customer_service", "gge2024");
upsertUser("gge_viewer", "Tom Anderson", "viewer", "gge2024");

console.log(`    6 users seeded (all passwords: gge2024, force change on first login)`);


// ── MANUAL ORDERS ─────────────────────────────────────────────────────

console.log("\n  Manual Orders...");

// Get the owner user ID for created_by
const ownerUser = db.query("SELECT id FROM users WHERE username = ?").get("gge_owner");
const ownerId = ownerUser ? ownerUser.id : null;

function upsertManualOrder(source, orderNumber, customerName, customerEmail, items) {
  const existing = db.query("SELECT id FROM orders WHERE order_number = ? AND business_id = ?").get(orderNumber, BIZ);
  if (existing) return;
  
  let totalAmount = 0;
  for (const item of items) {
    totalAmount += (item.unitPrice || 0) * (item.quantity || 1);
  }
  
  const r = db.run(
    `INSERT INTO orders (shopify_order_id, order_number, customer_name, customer_email, source, status, notes, total_amount, created_by, business_id, imported_at)
     VALUES (NULL, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NULL)`,
    [orderNumber, customerName, customerEmail || null, source, null, totalAmount, ownerId, BIZ]
  );
  const orderId = r.lastInsertRowid;
  
  for (const item of items) {
    const qty = item.quantity || 1;
    const price = item.unitPrice || 0;
    db.run(
      "INSERT INTO order_items (order_id, product_id, variant_id, sku, variant_title, quantity, unit_price, line_total, business_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [orderId, item.productId || null, item.variantId || null, item.sku || "UNKNOWN", item.variantTitle || null, qty, price, price * qty, BIZ]
    );
  }
  
  return orderId;
}

// Look up some product/variant IDs
function findProduct(sku) {
  return db.query("SELECT id FROM products WHERE sku = ? AND business_id = ?").get(sku, BIZ);
}
function findVariant(variantSku) {
  return db.query("SELECT id FROM product_variants WHERE sku = ? AND business_id = ?").get(variantSku, BIZ);
}

// Phone order from a regular customer
const mo_uf2oz = findVariant("GLT-UF-2-SLV");
const mo_bio4oz = findVariant("GLT-BIO-4-GLD");
const mo_ufProduct = findProduct("GLT-UF");
const mo_bioProduct = findProduct("GLT-BIO");

upsertManualOrder("phone", 1001, "Jessica Williams", "jessica@example.com", [
  { productId: mo_ufProduct?.id, variantId: mo_uf2oz?.id, sku: "GLT-UF-2-SLV", variantTitle: "2oz Silver", quantity: 3, unitPrice: 5.99 },
  { productId: mo_bioProduct?.id, variantId: mo_bio4oz?.id, sku: "GLT-BIO-4-GLD", variantTitle: "4oz Gold", quantity: 2, unitPrice: 13.99 },
]);

// Wholesale order for a boutique
const mo_neonSet = findProduct("GLT-NEON-SET");
const mo_neonVariant = findVariant("GLT-NEON-6");
const mo_chunkyProduct = findProduct("GLT-CHUNKY");
const mo_chunkyVar = findVariant("GLT-CH-2");

upsertManualOrder("wholesale", 1002, "Bella's Boutique", "orders@bellasboutique.example.com", [
  { productId: mo_neonSet?.id, variantId: mo_neonVariant?.id, sku: "GLT-NEON-6", variantTitle: "6-Color Set", quantity: 12, unitPrice: 19.99 },
  { productId: mo_chunkyProduct?.id, variantId: mo_chunkyVar?.id, sku: "GLT-CH-2", variantTitle: "2oz", quantity: 24, unitPrice: 5.49 },
]);

// Invoice order for a returning wholesale client
const mo_lavVariant = findVariant("FO-LAV-4");
const mo_lavProduct = findProduct("FO-LAVENDER");

upsertManualOrder("invoice", 1003, "Craft Corner Collective", "billing@craftcorner.example.com", [
  { productId: mo_lavProduct?.id, variantId: mo_lavVariant?.id, sku: "FO-LAV-4", variantTitle: "4oz", quantity: 8, unitPrice: 14.99 },
  { productId: mo_bioProduct?.id, variantId: findVariant("GLT-BIO-2-EM")?.id, sku: "GLT-BIO-2-EM", variantTitle: "2oz Emerald", quantity: 15, unitPrice: 7.49 },
]);

// Walk-in order
const mo_waxProduct = findProduct("CND-WAX");
const mo_waxVar = findVariant("CND-WAX-1LB");

upsertManualOrder("walkin", 1004, "David Park", "david.park@example.com", [
  { productId: mo_waxProduct?.id, variantId: mo_waxVar?.id, sku: "CND-WAX-1LB", variantTitle: "1 lb", quantity: 2, unitPrice: 8.99 },
]);

// Replacement order
const mo_bio2Cop = findVariant("GLT-BIO-2-COP");
upsertManualOrder("replacement", 1005, "Amanda Torres", "amanda.t@example.com", [
  { productId: mo_bioProduct?.id, variantId: mo_bio2Cop?.id, sku: "GLT-BIO-2-COP", variantTitle: "2oz Copper", quantity: 1, unitPrice: 0 },
]);

const manualOrderCount = db.query("SELECT COUNT(*) as c FROM orders WHERE business_id = ? AND order_number >= 1000").get(BIZ).c;
console.log(`    ${manualOrderCount} manual orders seeded`);

// ── V3.2: PURCHASE ORDERS FOR RECEIVING ─────────────────────────────────

console.log("\n  Purchase Orders (V3.2 Receiving)...");

// Helper: idempotent PO creation
function upsertPO(supplierId, status, expectedDelivery, notes, carrier, tracking, actualDelivery) {
  // Check by a combination of supplier + expected_delivery to roughly detect duplicates
  const existing = db.query(
    "SELECT id FROM purchase_orders WHERE supplier_id = ? AND expected_delivery = ? AND business_id = ?"
  ).get(supplierId, expectedDelivery, BIZ);
  if (existing) return existing.id;

  const r = db.run(
    `INSERT INTO purchase_orders (business_id, supplier_id, status, expected_delivery, notes, carrier, tracking_number, actual_delivery_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [BIZ, supplierId, status, expectedDelivery, notes || null, carrier || null, tracking || null, actualDelivery || null, ownerId]
  );
  return r.lastInsertRowid;
}

function upsertPOItem(poId, productId, quantity, unitCost, receivedQty, damagedQty, backorderedQty) {
  const existing = db.query(
    "SELECT id FROM po_items WHERE po_id = ? AND product_id = ?"
  ).get(poId, productId);
  if (existing) return existing.id;

  const totalCost = (unitCost || 0) * quantity;
  const r = db.run(
    `INSERT INTO po_items (po_id, product_id, quantity, unit_cost, total_cost, received_quantity, quantity_damaged, quantity_backordered)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [poId, productId, quantity, unitCost, totalCost, receivedQty || 0, damagedQty || 0, backorderedQty || 0]
  );
  return r.lastInsertRowid;
}

// Get supplier IDs (using actual names from the seed)
const sparkleSupplyV32 = db.query("SELECT id FROM suppliers WHERE name = 'SparkleSupply Inc' AND business_id = ?").get(BIZ);
const fragranceHouseV32 = db.query("SELECT id FROM suppliers WHERE name = 'FragranceHouse Ltd' AND business_id = ?").get(BIZ);
const candleWickProV32 = db.query("SELECT id FROM suppliers WHERE name = 'CandleWick Pro' AND business_id = ?").get(BIZ);

// Product IDs for PO items
const poUltraFineId = db.query("SELECT id FROM products WHERE sku = 'GLT-UF' AND business_id = ?").get(BIZ);
const poBioId = db.query("SELECT id FROM products WHERE sku = 'GLT-BIO' AND business_id = ?").get(BIZ);
const poLavId = db.query("SELECT id FROM products WHERE sku = 'FO-LAVENDER' AND business_id = ?").get(BIZ);
const poWaxId = db.query("SELECT id FROM products WHERE sku = 'CND-WAX' AND business_id = ?").get(BIZ);
const poJarId = db.query("SELECT id FROM products WHERE sku = 'CND-JAR' AND business_id = ?").get(BIZ);

// PO 1: Ordered, expected delivery = today+3 days
const threeDaysFromNow = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
if (sparkleSupplyV32) {
  const po1Id = upsertPO(sparkleSupplyV32.id, "ordered", threeDaysFromNow, "Regular glitter restock", "UPS", "1Z999AA10123456784", null);
  if (poUltraFineId) upsertPOItem(po1Id, poUltraFineId.id, 32, 1.80, 0, 0, 0);
  if (poBioId) upsertPOItem(po1Id, poBioId.id, 40, 2.80, 0, 0, 0);
  console.log(`    PO #${po1Id}: ordered, expected ${threeDaysFromNow} (Sparkle Supply Co.)`);
}

// PO 2: Ordered, expected delivery = yesterday (overdue)
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
if (fragranceHouseV32) {
  const po2Id = upsertPO(fragranceHouseV32.id, "ordered", yesterday, "Fragrance oil restock — running low", "FedEx", "789012345678", null);
  if (poLavId) upsertPOItem(po2Id, poLavId.id, 16, 1.50, 0, 0, 0);
  console.log(`    PO #${po2Id}: ordered, expected ${yesterday} (OVERDUE — Fragrance House)`);
}

// PO 3: Partial received (some received, some backordered)
const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
const fiveDaysFromNow = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
if (candleWickProV32) {
  const po3Id = upsertPO(candleWickProV32.id, "partial", fiveDaysFromNow, "Partial delivery — wax arrived, jars backordered", "UPS", "1Z555XY99887766543", null);

  // Item 1: Fully received wax
  if (poWaxId) {
    const itemId = upsertPOItem(po3Id, poWaxId.id, 20, 3.50, 20, 0, 0);
    // Add receiving event for the received wax
    db.run(
      `INSERT INTO receiving_events (business_id, po_id, po_item_id, product_id, quantity_received, quantity_damaged, quantity_backordered, bin_location, notes, received_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [BIZ, po3Id, itemId, poWaxId.id, 20, 0, 0, "A-12", "First shipment arrived", ownerId]
    );
  }

  // Item 2: Partially received jars, some backordered
  if (poJarId) {
    const itemId = upsertPOItem(po3Id, poJarId.id, 48, 1.20, 12, 2, 34);
    // Add receiving event for partial jars
    db.run(
      `INSERT INTO receiving_events (business_id, po_id, po_item_id, product_id, quantity_received, quantity_damaged, quantity_backordered, bin_location, notes, received_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [BIZ, po3Id, itemId, poJarId.id, 12, 2, 34, "B-05", "12 good, 2 damaged in transit, 34 backordered — ETA next week", ownerId]
    );
  }

  // Update actual_delivery_date for this partial
  db.run("UPDATE purchase_orders SET actual_delivery_date = ? WHERE id = ?", [twoDaysAgo, po3Id]);

  console.log(`    PO #${po3Id}: partial (20 wax received, 12/48 jars received + 2 damaged + 34 backordered)`);
}

// ── Supplier Notes ───────────────────────────────────────────────────────

if (sparkleSupplyV32) {
  const noteCount = db.query("SELECT COUNT(*) as c FROM supplier_notes WHERE supplier_id = ? AND business_id = ?").get(sparkleSupplyV32.id, BIZ).c;
  if (noteCount === 0) {
    db.run(
      "INSERT INTO supplier_notes (business_id, supplier_id, po_id, note, created_by) VALUES (?, ?, ?, ?, ?)",
      [BIZ, sparkleSupplyV32.id, null, "Reliable supplier — always on time. Prefer UPS shipping.", ownerId]
    );
    db.run(
      "INSERT INTO supplier_notes (business_id, supplier_id, po_id, note, created_by) VALUES (?, ?, ?, ?, ?)",
      [BIZ, sparkleSupplyV32.id, null, "Ask about bulk discount on Ultra Fine — order > 48oz might qualify.", ownerId]
    );
    console.log(`    2 supplier notes added (Sparkle Supply Co.)`);
  }
}

if (fragranceHouseV32) {
  const noteCount = db.query("SELECT COUNT(*) as c FROM supplier_notes WHERE supplier_id = ? AND business_id = ?").get(fragranceHouseV32.id, BIZ).c;
  if (noteCount === 0) {
    db.run(
      "INSERT INTO supplier_notes (business_id, supplier_id, po_id, note, created_by) VALUES (?, ?, ?, ?, ?)",
      [BIZ, fragranceHouseV32.id, null, "Fragrance House can be slow during holiday season — plan ahead. Contact: Jen (ext. 42)", ownerId]
    );
    console.log(`    1 supplier note added (Fragrance House)`);
  }
}

console.log("  V3.2 PO receiving seed complete");

// ── V3.3: MANUFACTURING VALIDATION SEED ──────────────────────────────

console.log("\n  V3.3 Manufacturing Validation Seed...");

// Get product IDs for our existing components
const bomWaxId = db.query("SELECT id FROM products WHERE sku = 'CND-WAX' AND business_id = ?").get(BIZ).id;
const bomLavId = db.query("SELECT id FROM products WHERE sku = 'FO-LAVENDER' AND business_id = ?").get(BIZ).id;
const bomWickId = db.query("SELECT id FROM products WHERE sku = 'CND-WICK' AND business_id = ?").get(BIZ).id;
const bomJarId = db.query("SELECT id FROM products WHERE sku = 'CND-JAR' AND business_id = ?").get(BIZ).id;
const bomVanId = db.query("SELECT id FROM products WHERE sku = 'FO-VANILLA' AND business_id = ?").get(BIZ).id;

// Get the BOM IDs (already seeded)
const bomLavCandle = db.query("SELECT id FROM boms WHERE name = '8oz Lavender Soy Candle' AND business_id = ?").get(BIZ);
const bomVanCandle = db.query("SELECT id FROM boms WHERE name = '8oz Vanilla Soy Candle' AND business_id = ?").get(BIZ);

// Get production user (Lisa Thompson) for created_by
const prodUser = db.query("SELECT id FROM users WHERE username = 'gge_production'").get();
const prodUserId = prodUser ? prodUser.id : ownerId;

function upsertBatch(bomId, batchSize, status, notes, reservedAt, completedAt, cancelledAt, cancelledReason) {
    const existing = db.query(
        "SELECT id FROM production_batches WHERE bom_id = ? AND batch_size = ? AND notes = ? AND business_id = ?"
    ).get(bomId, batchSize, notes || '', BIZ);
    if (existing) return existing.id;

    const r = db.run(
        `INSERT INTO production_batches (business_id, bom_id, batch_size, status, notes, reserved_at, completed_at, cancelled_at, cancelled_reason, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [BIZ, bomId, batchSize, status, notes || null, reservedAt || null, completedAt || null, cancelledAt || null, cancelledReason || null, prodUserId]
    );
    return r.lastInsertRowid;
}

// Ensure sufficient stock for at least one candle batch execution
// The Lavender Candle BOM needs: wax(7oz), lavender oil(0.5oz), wick(1), jar(1)
// We have wax=300 (items), lavender=150 (items), wick=500, jar=180
// But stock_count is on product, not ounces... Let me ensure stock is sufficient
// Make sure these products have ample stock for testing
db.run("UPDATE products SET stock_count = MAX(stock_count, 30) WHERE id IN (?, ?, ?, ?)",
    [bomWaxId, bomLavId, bomWickId, bomJarId]);

if (bomLavCandle) {
    // Pending batch ready to execute
    const pendingBatchId = upsertBatch(bomLavCandle.id, 3, "draft", "Test: Pending 3-candle manufacturing batch", null, null, null, null);
    console.log(`    Batch #${pendingBatchId}: PENDING 3x Lavender Candle (ready to test reserve → execute)`);

    // Completed batch with movements (for undo test)
    const now = new Date();
    const fiveMinAgo = new Date(now - 300000).toISOString();
    const completedBatchId = upsertBatch(bomLavCandle.id, 2, "completed", "Test: Completed 2-candle batch (for undo test)", fiveMinAgo, fiveMinAgo, null, null);

    // Manually create movements for the completed batch (simulate execution)
    const completedBatch = db.query("SELECT id FROM production_batches WHERE id = ?").get(completedBatchId);
    if (completedBatch) {
        const existingMovements = db.query("SELECT COUNT(*) as c FROM batch_movements WHERE batch_id = ?").get(completedBatchId).c;
        if (existingMovements === 0) {
            // Simulate: consumed 14oz wax, 1oz lavender oil, 2 wicks, 2 jars
            db.run("INSERT INTO batch_movements (batch_id, product_id, direction, planned_quantity, actual_quantity, unit) VALUES (?, ?, 'consumed', ?, ?, 'oz')",
                [completedBatchId, bomWaxId, 14, 14]);
            db.run("INSERT INTO batch_movements (batch_id, product_id, direction, planned_quantity, actual_quantity, unit) VALUES (?, ?, 'consumed', ?, ?, 'oz')",
                [completedBatchId, bomLavId, 1, 1]);
            db.run("INSERT INTO batch_movements (batch_id, product_id, direction, planned_quantity, actual_quantity, unit) VALUES (?, ?, 'consumed', ?, ?, 'each')",
                [completedBatchId, bomWickId, 2, 2]);
            db.run("INSERT INTO batch_movements (batch_id, product_id, direction, planned_quantity, actual_quantity, unit) VALUES (?, ?, 'consumed', ?, ?, 'each')",
                [completedBatchId, bomJarId, 2, 2]);
            // Produced 2 candles
            const candleOutputId = db.query("SELECT output_product_id FROM boms WHERE id = ?").get(bomLavCandle.id).output_product_id;
            db.run("INSERT INTO batch_movements (batch_id, product_id, direction, planned_quantity, actual_quantity, unit) VALUES (?, ?, 'produced', ?, ?, 'unit')",
                [completedBatchId, candleOutputId, 2, 2]);
            console.log(`    Batch #${completedBatchId}: COMPLETED 2x Lavender Candle (5 movements — ready for undo test)`);
        }
    }
}

if (bomVanCandle) {
    // Pending batch that can also test stock shortages
    const pendingBatch2Id = upsertBatch(bomVanCandle.id, 5, "draft", "Test: Pending 5-candle batch for requirements check", null, null, null, null);
    console.log(`    Batch #${pendingBatch2Id}: PENDING 5x Vanilla Candle`);
}

console.log("  V3.3 manufacturing seed complete");

// ── V3.4: WAREHOUSE SEED ─────────────────────────────────────────────

console.log("\n  V3.4 Warehouse Seed...");

// Create 5 bins
function upsertBin(name, zone) {
  const existing = db.query("SELECT id FROM warehouse_bins WHERE name = ? AND business_id = ?").get(name, BIZ);
  if (existing) return existing.id;
  const r = db.run(
    "INSERT INTO warehouse_bins (business_id, name, zone) VALUES (?, ?, ?)",
    [BIZ, name, zone]
  );
  return r.lastInsertRowid;
}

const binA01 = upsertBin("A-01", "Receiving");
const binA02 = upsertBin("A-02", "Storage");
const binA03 = upsertBin("A-03", "Storage");
const binB01 = upsertBin("B-01", "Picking");
const binB02 = upsertBin("B-02", "Shipping");
console.log(`    5 bins created (A-01, A-02, A-03, B-01, B-02)`);

// Distribute existing product inventory across bins
function upsertBinContent(binId, productId, quantity) {
  const existing = db.query(
    "SELECT id FROM bin_contents WHERE bin_id = ? AND product_id = ? AND variant_id IS NULL AND business_id = ?"
  ).get(binId, productId, BIZ);
  if (existing) {
    db.run("UPDATE bin_contents SET quantity = quantity + ? WHERE id = ?", [quantity, existing.id]);
  } else {
    db.run(
      "INSERT INTO bin_contents (business_id, bin_id, product_id, variant_id, quantity) VALUES (?, ?, ?, NULL, ?)",
      [BIZ, binId, productId, quantity]
    );
  }
}

// Get product IDs
const allProducts = db.query("SELECT id, sku, stock_count FROM products WHERE business_id = ?").all(BIZ);
const productMap = {};
for (const p of allProducts) productMap[p.sku] = p;

// Distribute: some in Receiving, most in Storage, some in Picking/Shipping
const distProducts = [
  { sku: "GLT-UF", qty: 100, binId: binA01 },
  { sku: "GLT-UF", qty: 100, binId: binA02 },
  { sku: "GLT-UF", qty: 50, binId: binA03 },
  { sku: "GLT-BIO", qty: 80, binId: binA01 },
  { sku: "GLT-BIO", qty: 80, binId: binA02 },
  { sku: "GLT-BIO", qty: 40, binId: binA03 },
  { sku: "FO-LAVENDER", qty: 60, binId: binA02 },
  { sku: "FO-LAVENDER", qty: 50, binId: binA03 },
  { sku: "FO-LAVENDER", qty: 40, binId: binB01 },
  { sku: "FO-VANILLA", qty: 50, binId: binA02 },
  { sku: "FO-VANILLA", qty: 40, binId: binA03 },
  { sku: "FO-VANILLA", qty: 40, binId: binB01 },
  { sku: "CND-WAX", qty: 120, binId: binA01 },
  { sku: "CND-WAX", qty: 120, binId: binA02 },
  { sku: "CND-WAX", qty: 60, binId: binA03 },
  { sku: "CND-WICK", qty: 200, binId: binA02 },
  { sku: "CND-WICK", qty: 150, binId: binA03 },
  { sku: "CND-WICK", qty: 150, binId: binB01 },
  { sku: "CND-JAR", qty: 70, binId: binA02 },
  { sku: "CND-JAR", qty: 60, binId: binA03 },
  { sku: "CND-JAR", qty: 50, binId: binB01 },
  { sku: "PKG-SHAKER", qty: 80, binId: binA02 },
  { sku: "PKG-SHAKER", qty: 70, binId: binA03 },
  { sku: "PKG-SHAKER", qty: 50, binId: binB02 },
  { sku: "GLT-CHUNKY", qty: 50, binId: binA02 },
  { sku: "GLT-CHUNKY", qty: 40, binId: binA03 },
  { sku: "GLT-CHUNKY", qty: 30, binId: binB01 },
  { sku: "GLT-NEON-SET", qty: 30, binId: binA02 },
  { sku: "GLT-NEON-SET", qty: 30, binId: binA03 },
  { sku: "GLT-NEON-SET", qty: 20, binId: binB01 },
  { sku: "GLT-COSMETIC", qty: 40, binId: binA02 },
  { sku: "GLT-COSMETIC", qty: 35, binId: binA03 },
  { sku: "GLT-COSMETIC", qty: 25, binId: binB01 },
  { sku: "GLT-MIXBASE", qty: 80, binId: binA02 },
  { sku: "GLT-MIXBASE", qty: 70, binId: binA03 },
  { sku: "GLT-MIXBASE", qty: 50, binId: binB01 },
  { sku: "FO-SANDALWOOD", qty: 35, binId: binA02 },
  { sku: "FO-SANDALWOOD", qty: 30, binId: binA03 },
  { sku: "FO-SANDALWOOD", qty: 25, binId: binB01 },
  { sku: "PKG-ROLLER", qty: 60, binId: binA02 },
  { sku: "PKG-ROLLER", qty: 55, binId: binA03 },
  { sku: "PKG-ROLLER", qty: 45, binId: binB02 },
  { sku: "PKG-KRAFTBOX", qty: 50, binId: binA02 },
  { sku: "PKG-KRAFTBOX", qty: 40, binId: binA03 },
  { sku: "PKG-KRAFTBOX", qty: 30, binId: binB02 },
];

for (const d of distProducts) {
  const prod = productMap[d.sku];
  if (prod) {
    upsertBinContent(d.binId, prod.id, d.qty);
  }
}

// Also distribute finished goods (candles, kits, sprays) to Picking bins
const candleProduct = db.query("SELECT id FROM products WHERE sku = 'CND-LAV-8' AND business_id = ?").get(BIZ);
const kitProduct = db.query("SELECT id FROM products WHERE sku = 'GLT-SAMPLE-KIT' AND business_id = ?").get(BIZ);
const sprayProduct = db.query("SELECT id FROM products WHERE sku = 'SPRAY-4OZ' AND business_id = ?").get(BIZ);
const vanCandleProduct = db.query("SELECT id FROM products WHERE sku = 'CND-VAN-8' AND business_id = ?").get(BIZ);

if (candleProduct) upsertBinContent(binB01, candleProduct.id, 15);
if (kitProduct) upsertBinContent(binB01, kitProduct.id, 10);
if (sprayProduct) upsertBinContent(binB01, sprayProduct.id, 12);
if (vanCandleProduct) upsertBinContent(binB01, vanCandleProduct.id, 10);

db.run("UPDATE products SET bin_location = 'B-01' WHERE sku IN ('CND-LAV-8', 'GLT-SAMPLE-KIT', 'SPRAY-4OZ', 'CND-VAN-8') AND business_id = ?", [BIZ]);

console.log(`    ${distProducts.length + 4} bin content entries created`);

// Create 2 warehouse transfers
const transferCount = db.query("SELECT COUNT(*) as c FROM warehouse_transfers WHERE business_id = ?").get(BIZ).c;
if (transferCount === 0) {
  const ownerUser = db.query("SELECT id FROM users WHERE username = ?").get("gge_owner");
  const ownerId = ownerUser ? ownerUser.id : null;

  // Transfer 1: Receive Ultra Fine Glitter into A-01
  const ufProduct = db.query("SELECT id FROM products WHERE sku = 'GLT-UF' AND business_id = ?").get(BIZ);
  if (ufProduct) {
    db.run(
      `INSERT INTO warehouse_transfers (business_id, from_bin_id, to_bin_id, product_id, variant_id, quantity, transfer_type, reference_type, reference_id, notes, created_by)
       VALUES (?, NULL, ?, ?, NULL, 100, 'receive', 'purchase_order', 1, 'Initial stock receive for Ultra Fine Glitter', ?)`,
      [BIZ, binA01, ufProduct.id, ownerId]
    );
  }

  // Transfer 2: Move Soy Wax from A-01 to A-02
  const waxProduct = db.query("SELECT id FROM products WHERE sku = 'CND-WAX' AND business_id = ?").get(BIZ);
  if (waxProduct) {
    db.run(
      `INSERT INTO warehouse_transfers (business_id, from_bin_id, to_bin_id, product_id, variant_id, quantity, transfer_type, reference_type, reference_id, notes, created_by)
       VALUES (?, ?, ?, ?, NULL, 50, 'move', NULL, NULL, 'Reorganizing storage — moving wax to main storage', ?)`,
      [BIZ, binA01, binA02, waxProduct.id, ownerId]
    );
  }

  console.log("    2 warehouse transfers seeded (1 receive, 1 move)");
}

console.log("  V3.4 warehouse seed complete");

// ── V3.5: CUSTOMER SERVICE SEED ────────────────────────────────────────

console.log("\n  V3.5 Customer Service Seed...");

// Get user IDs
const csUser = db.query("SELECT id FROM users WHERE username = ?").get("gge_cs");
const csUserId = csUser ? csUser.id : ownerId;

// Get orders for CS data (first order = phone order #1001, second = wholesale #1002)
const order1001 = db.query("SELECT id, customer_email, customer_name FROM orders WHERE order_number = 1001 AND business_id = ?").get(BIZ);
const order1002 = db.query("SELECT id, customer_email, customer_name FROM orders WHERE order_number = 1002 AND business_id = ?").get(BIZ);
const order1004 = db.query("SELECT id, customer_email, customer_name FROM orders WHERE order_number = 1004 AND business_id = ?").get(BIZ);

// Create a return request (pending, for order #1004 - walk-in)
if (order1004) {
  const existingRR = db.query("SELECT COUNT(*) as c FROM returns_refunds WHERE order_id = ? AND business_id = ?").get(order1004.id, BIZ).c;
  if (existingRR === 0) {
    db.run(
      `INSERT INTO returns_refunds (business_id, order_id, order_item_id, type, status, amount, reason, notes)
       VALUES (?, ?, NULL, 'refund', 'pending', 8.99, 'Customer said item arrived damaged — requesting refund', 'Check packaging quality')`,
      [BIZ, order1004.id]
    );
    // Update order cs_status
    db.run("UPDATE orders SET cs_status = 'inquiry' WHERE id = ?", [order1004.id]);
    console.log(`    Return request created for order #1004 (pending refund)`);
  }
}

// Create a replacement request (approved) for order #1001
if (order1001) {
  const existingRR2 = db.query("SELECT COUNT(*) as c FROM returns_refunds WHERE order_id = ? AND business_id = ? AND type = 'replacement'").get(order1001.id, BIZ).c;
  if (existingRR2 === 0) {
    // Get an order item from order 1001
    const oi = db.query("SELECT id FROM order_items WHERE order_id = ? LIMIT 1").get(order1001.id);
    db.run(
      `INSERT INTO returns_refunds (business_id, order_id, order_item_id, type, status, amount, reason, notes, approved_by)
       VALUES (?, ?, ?, 'replacement', 'approved', 0, 'Wrong size received', 'Customer wanted 4oz and received 2oz', ?)`,
      [BIZ, order1001.id, oi ? oi.id : null, ownerId]
    );
    // Create the actual replacement order
    const repItems = db.query(
      "SELECT product_id, variant_id, sku, variant_title, quantity, unit_price FROM order_items WHERE order_id = ?"
    ).all(order1001.id);

    if (repItems.length > 0) {
      const repOrderNum = db.query("SELECT COALESCE(MAX(order_number), 999) + 1 AS next_num FROM orders WHERE business_id = ? AND order_number >= 1000").get(BIZ).next_num;
      const repResult = db.run(
        `INSERT INTO orders (shopify_order_id, order_number, customer_name, customer_email, shipping_address, source, status, notes, total_amount, created_by, business_id, cs_status)
         VALUES (NULL, ?, ?, ?, NULL, 'replacement', 'pending', ?, 0, ?, ?, 'none')`,
        [repOrderNum, order1001.customer_name, order1001.customer_email, `Replacement for order #1001`, ownerId, BIZ]
      );
      const repOrderId = repResult.lastInsertRowid;

      for (const item of repItems.slice(0, 1)) {
        db.run(
          `INSERT INTO order_items (order_id, product_id, variant_id, sku, variant_title, quantity, unit_price, line_total, business_id)
           VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
          [repOrderId, item.product_id, item.variant_id, item.sku, item.variant_title, item.quantity, BIZ]
        );
      }

      // Link replacement order to return
      db.run("UPDATE returns_refunds SET replacement_order_id = ? WHERE order_id = ? AND type = 'replacement' AND business_id = ?",
        [repOrderId, order1001.id, BIZ]);

      console.log(`    Replacement request created for order #1001 (approved, replacement order #${repOrderNum})`);
    }

    db.run("UPDATE orders SET cs_status = 'dispute' WHERE id = ?", [order1001.id]);
  }
}

// Customer notes
const noteCount = db.query("SELECT COUNT(*) as c FROM customer_notes WHERE business_id = ?").get(BIZ).c;
if (noteCount === 0) {
  // Note 1: For Jessica Williams (order 1001 customer)
  if (order1001) {
    db.run(
      `INSERT INTO customer_notes (business_id, customer_email, order_id, note, note_type, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [BIZ, order1001.customer_email, order1001.id, "Jessica called — said she loves the rose gold but received the wrong size. Willing to do replacement.", "follow_up", csUserId]
    );
  }

  // Note 2: For Bella's Boutique (order 1002 customer)
  if (order1002) {
    db.run(
      `INSERT INTO customer_notes (business_id, customer_email, order_id, note, note_type, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [BIZ, order1002.customer_email, order1002.id, "Great wholesale client — always pays on time. Mentioned interest in exclusive holiday bundle.", "compliment", csUserId]
    );
  }

  // Note 3: General note for Bella's Boutique (no order attached)
  if (order1002) {
    db.run(
      `INSERT INTO customer_notes (business_id, customer_email, order_id, note, note_type, created_by)
       VALUES (?, ?, NULL, ?, ?, ?)`,
      [BIZ, order1002.customer_email, "Bella prefers email communication. Do not call in the mornings (EST).", "general", csUserId]
    );
  }

  console.log(`    3 customer notes seeded across 2 customers`);
}

// Packing proof for order #1005 (replacement order — already "shipped")
const order1005 = db.query("SELECT id FROM orders WHERE order_number = 1005 AND business_id = ?").get(BIZ);
if (order1005) {
  const ppCount = db.query("SELECT COUNT(*) as c FROM packing_proof WHERE order_id = ? AND business_id = ?").get(order1005.id, BIZ).c;
  if (ppCount === 0) {
    db.run(
      `INSERT INTO packing_proof (business_id, order_id, proof_type, data, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [BIZ, order1005.id, "checklist", JSON.stringify({
        notes: "Checked replacement item before shipping. All OK.",
        weightCheck: "2.5oz",
        checklist: ["Item matches SKU", "No visible damage", "Correct quantity", "Bubble wrapped"],
      }), csUserId]
    );

    // Update order as packed
    db.run("UPDATE orders SET packed_at = datetime('now'), packed_by = ? WHERE id = ?", [csUserId, order1005.id]);

    console.log(`    1 packing proof record created for order #1005`);
  }
}

// Ensure one order has a full timeline (created + scanned) — order #1002 (wholesale)
if (order1002) {
  const scanCount = db.query("SELECT COUNT(*) as c FROM order_scans WHERE order_id = ?").get(order1002.id).c;
  if (scanCount === 0) {
    // Get the items and scan them all
    const items = db.query("SELECT id, product_id, sku, quantity FROM order_items WHERE order_id = ?").all(order1002.id);
    for (const item of items) {
      for (let s = 0; s < item.quantity; s++) {
        // Find the product's barcode
        const prod = db.query("SELECT barcode FROM products WHERE id = ? AND business_id = ?").get(item.product_id, BIZ);
        db.run(
          "INSERT INTO order_scans (order_id, order_item_id, product_id, barcode, user_id, business_id) VALUES (?, ?, ?, ?, ?, ?)",
          [order1002.id, item.id, item.product_id, prod?.barcode || item.sku, ownerId, BIZ]
        );
        db.run("UPDATE order_items SET scanned_quantity = scanned_quantity + 1 WHERE id = ?", [item.id]);
      }
    }
    // Mark as picking then complete
    db.run("UPDATE orders SET status = 'complete' WHERE id = ?", [order1002.id]);
    console.log(`    Order #1002 now has full scan history (${items.length} items x quantities scanned)`);
  }
}

// Also add scans to order #1001 for richer timeline
if (order1001) {
  const scanCount = db.query("SELECT COUNT(*) as c FROM order_scans WHERE order_id = ?").get(order1001.id).c;
  if (scanCount === 0) {
    const items = db.query("SELECT id, product_id, sku, quantity FROM order_items WHERE order_id = ?").all(order1001.id);
    for (const item of items) {
      const scanQty = Math.floor(item.quantity / 2); // half scanned — partial fulfillment
      for (let s = 0; s < scanQty; s++) {
        const prod = db.query("SELECT barcode FROM products WHERE id = ? AND business_id = ?").get(item.product_id, BIZ);
        db.run(
          "INSERT INTO order_scans (order_id, order_item_id, product_id, barcode, user_id, business_id) VALUES (?, ?, ?, ?, ?, ?)",
          [order1001.id, item.id, item.product_id, prod?.barcode || item.sku, ownerId, BIZ]
        );
        db.run("UPDATE order_items SET scanned_quantity = scanned_quantity + 1 WHERE id = ?", [item.id]);
      }
    }
    db.run("UPDATE orders SET status = 'picking' WHERE id = ?", [order1001.id]);
    console.log(`    Order #1001 now has partial scan history`);
  }
}

console.log("  V3.5 customer service seed complete");

// ── V3.6: AFFILIATE VALIDATION ──────────────────────────────────────────

console.log("\n  Affiliates (V3.6)...");

function upsertAffiliate(name, email, discountCode, discountType, discountValue, commissionRate, notes, active) {
  const existing = db.query("SELECT id FROM affiliates WHERE discount_code = ? AND business_id = ?").get(discountCode, BIZ);
  if (existing) return existing.id;
  const result = db.run(
    `INSERT INTO affiliates (business_id, name, email, discount_code, discount_type, discount_value, commission_rate, notes, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [BIZ, name, email, discountCode, discountType, discountValue, commissionRate, notes, active ? 1 : 0]
  );
  return result.lastInsertRowid;
}

// 3 affiliates with different discount codes and types
const aff1 = upsertAffiliate("Jessica M.", "jessica.m@example.com", "GLITTERVIP10", "percentage", 10, 5, "Top influencer partner — has a beauty blog with 50K followers", 1);
console.log(`    Affiliate created: GLITTERVIP10 (Jessica M.) — 10% off, 5% commission`);

const aff2 = upsertAffiliate("Sarah's Friends", "sarah@example.com", "SARAHFRIEND", "percentage", 15, 8, "Sarah's personal referral code for friends and family", 1);
console.log(`    Affiliate created: SARAHFRIEND (Sarah's Friends) — 15% off, 8% commission`);

const aff3 = upsertAffiliate("Sparkly Partners", "partners@sparkly.example.com", "SPARKLE20", "fixed_amount", 5, 10, "Partner program — fixed $5 discount, 10% commission for wholesale content creators", 1);
console.log(`    Affiliate created: SPARKLE20 (Sparkly Partners) — $5 off, 10% commission`);

// Map orders to referrals
const refOrder1 = db.query("SELECT id, order_number, customer_name, total_amount FROM orders WHERE order_number = 1001 AND business_id = ?").get(BIZ);
const refOrder2 = db.query("SELECT id, order_number, customer_name, total_amount FROM orders WHERE order_number = 1002 AND business_id = ?").get(BIZ);

if (refOrder1 && aff1) {
  const existing = db.query("SELECT COUNT(*) as c FROM affiliate_referrals WHERE order_id = ? AND affiliate_id = ?").get(refOrder1.id, aff1).c;
  if (existing === 0) {
    const orderTotal = refOrder1.total_amount || 29.99;
    const discountAmt = Math.round(orderTotal * 0.10 * 100) / 100; // 10%
    const commission = Math.round(orderTotal * 0.05 * 100) / 100; // 5%
    db.run(
      `INSERT INTO affiliate_referrals (business_id, affiliate_id, order_id, discount_amount, commission_earned, store_credit_issued, status)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`,
      [BIZ, aff1, refOrder1.id, discountAmt, commission, commission]
    );
    db.run("UPDATE affiliates SET total_referrals = total_referrals + 1, total_revenue_generated = total_revenue_generated + ?, store_credit_balance = store_credit_balance + ? WHERE id = ?", [orderTotal, commission, aff1]);
    console.log(`    Referral: Order #${refOrder1.order_number} → GLITTERVIP10 (${discountAmt} discount, ${commission} commission)`);
  }
}

if (refOrder2 && aff3) {
  const existing = db.query("SELECT COUNT(*) as c FROM affiliate_referrals WHERE order_id = ? AND affiliate_id = ?").get(refOrder2.id, aff3).c;
  if (existing === 0) {
    const orderTotal = refOrder2.total_amount || 371.64;
    const discountAmt = 5.00; // fixed $5
    const commission = Math.round(orderTotal * 0.10 * 100) / 100; // 10%
    db.run(
      `INSERT INTO affiliate_referrals (business_id, affiliate_id, order_id, discount_amount, commission_earned, store_credit_issued, status)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`,
      [BIZ, aff3, refOrder2.id, discountAmt, commission, commission]
    );
    db.run("UPDATE affiliates SET total_referrals = total_referrals + 1, total_revenue_generated = total_revenue_generated + ?, store_credit_balance = store_credit_balance + ? WHERE id = ?", [orderTotal, commission, aff3]);
    console.log(`    Referral: Order #${refOrder2.order_number} → SPARKLE20 (${discountAmt} discount, ${commission} commission)`);
  }
}

// Issue store credit to Sarah's Friends
if (aff2) {
  const aff2Data = db.query("SELECT store_credit_balance FROM affiliates WHERE id = ?").get(aff2);
  if (aff2Data && aff2Data.store_credit_balance < 25) {
    db.run("UPDATE affiliates SET store_credit_balance = 25.00 WHERE id = ?", [aff2]);
    console.log(`    Store credit: $25.00 issued to SARAHFRIEND (Sarah's Friends)`);
  }
}

console.log("  V3.6 affiliate seed complete");

// ── P4.4: AFFILIATE HQ SEED — Challenges, Assets, Training, Payouts ────

console.log("\n  P4.4 Affiliate HQ Seed...");

// Get affiliate IDs
const affData1 = db.query("SELECT id FROM affiliates WHERE discount_code = ? AND business_id = ?").get("GLITTERVIP10", BIZ);
const affData2 = db.query("SELECT id FROM affiliates WHERE discount_code = ? AND business_id = ?").get("SARAHFRIEND", BIZ);
const affData3 = db.query("SELECT id FROM affiliates WHERE discount_code = ? AND business_id = ?").get("SPARKLE20", BIZ);

// ── 1 CHALLENGE ─────────────────────────────────────────────────────
const challengeCount = db.query("SELECT COUNT(*) as c FROM affiliate_challenges WHERE business_id = ?").get(BIZ).c;
if (challengeCount === 0) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const challengeResult = db.run(
    `INSERT INTO affiliate_challenges (business_id, title, description, target_type, target_value, reward_type, reward_amount, starts_at, ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      BIZ,
      "Summer Referral Sprint",
      "Get 5 referrals this month to earn a $50 bonus! Each referral counts — no minimum order size. Top referrer gets an additional $100 bonus at the end of the month.",
      "referrals",
      5,
      "store_credit",
      50,
      monthStart,
      monthEnd,
    ]
  );
  const challengeId = challengeResult.lastInsertRowid;
  console.log(`    Challenge: "Summer Referral Sprint" (target: 5 referrals, reward: $50)`);

  // Add progress for our affiliates
  if (affData1) {
    db.run(
      "INSERT OR IGNORE INTO affiliate_challenge_progress (challenge_id, affiliate_id, current_value) VALUES (?, ?, ?)",
      [challengeId, affData1.id, 1]
    );
    console.log(`      Progress: GLITTERVIP10 → 1/5 referrals`);
  }
  if (affData2) {
    db.run(
      "INSERT OR IGNORE INTO affiliate_challenge_progress (challenge_id, affiliate_id, current_value) VALUES (?, ?, ?)",
      [challengeId, affData2.id, 0]
    );
  }
  if (affData3) {
    db.run(
      "INSERT OR IGNORE INTO affiliate_challenge_progress (challenge_id, affiliate_id, current_value, completed_at) VALUES (?, ?, ?, datetime('now'))",
      [challengeId, affData3.id, 5]
    );
    console.log(`      Progress: SPARKLE20 → 5/5 referrals (COMPLETED!)`);
  }
}

// ── 2 MARKETING ASSETS ──────────────────────────────────────────────
const assetCount = db.query("SELECT COUNT(*) as c FROM affiliate_assets WHERE business_id = ?").get(BIZ).c;
if (assetCount === 0) {
  db.run(
    `INSERT INTO affiliate_assets (business_id, title, type, url) VALUES (?, ?, ?, ?)`,
    [BIZ, "Spring Collection Banner (728x90)", "banner", "https://placehold.co/728x90/f472b6/ffffff?text=Spring+Sparkle+Collection"]
  );
  db.run(
    `INSERT INTO affiliate_assets (business_id, title, type, url) VALUES (?, ?, ?, ?)`,
    [BIZ, "Holiday Gift Guide Social Post", "social_post", "https://placehold.co/1080x1080/f472b6/ffffff?text=Holiday+Gift+Guide"]
  );
  db.run(
    `INSERT INTO affiliate_assets (business_id, title, type, url) VALUES (?, ?, ?, ?)`,
    [BIZ, "Glitzy Glitter Express Logo Pack", "product_photo", "https://placehold.co/800x800/f472b6/ffffff?text=GGE+Logo+Pack"]
  );
  db.run("UPDATE affiliate_assets SET download_count = 12 WHERE title = ? AND business_id = ?", ["Spring Collection Banner (728x90)", BIZ]);
  db.run("UPDATE affiliate_assets SET download_count = 8 WHERE title = ? AND business_id = ?", ["Holiday Gift Guide Social Post", BIZ]);
  console.log("    3 marketing assets seeded (with download counts)");
}

// ── 2 TRAINING MODULES ──────────────────────────────────────────────
const trainingCount = db.query("SELECT COUNT(*) as c FROM affiliate_training WHERE business_id = ?").get(BIZ).c;
if (trainingCount === 0) {
  db.run(
    `INSERT INTO affiliate_training (business_id, title, content, order_index) VALUES (?, ?, ?, ?)`,
    [BIZ, "Getting Started as a Glitzy Glitter Express Affiliate",
     `## Welcome to the GGE Affiliate Program!

We're so excited to have you on board. Here's everything you need to know to start earning.

### Your Discount Code
Your unique discount code is your key to earning. Share it on social media, in your blog posts, with friends, and anywhere your audience hangs out.

### How You Earn
- **Commission**: You earn a percentage of every order that uses your code
- **Store Credit**: Your commissions accumulate as store credit
- **Payouts**: Request a payout anytime — we'll send your earnings via store credit, PayPal, or bank transfer

### Best Practices
1. **Be authentic** — Share products you genuinely love
2. **Use visuals** — Photos and videos convert better than text alone
3. **Track your links** — Use your dashboard to see what's working
4. **Stay consistent** — Regular posting builds trust

### Marketing Assets
Check the Assets tab for banners, social posts, and product photos you can use right away.

### Questions?
Reach out to our affiliate team anytime. We're here to help you succeed!`,
     0]
  );
  db.run(
    `INSERT INTO affiliate_training (business_id, title, content, order_index) VALUES (?, ?, ?, ?)`,
    [BIZ, "Maximizing Your Glitter Sales",
     `## Tips for Selling More Glitter

Glitter products are visual and emotional — here's how to make the most of that.

### Know Your Audience
- **Crafters** love variety packs and color collections
- **Beauty enthusiasts** want cosmetic-grade, skin-safe options
- **Event planners** buy in bulk — highlight wholesale pricing
- **Eco-conscious shoppers** prefer biodegradable glitter

### Content Ideas That Convert
- **Before/after photos** of craft projects using our glitter
- **Video tutorials** — "How I made this sparkle tumbler"
- **Color swatches** — Show off the holographic and neon sets
- **Seasonal content** — Holiday glitter, wedding season, festival looks

### The Numbers
- Customers who see glitter in action (video) are 3x more likely to buy
- Bundle deals get 40% higher average order value
- Our best-performing affiliates post 2-3 times per week

### Pro Tip
Tag @glitzyglitterexpress in your posts — we reshare our top affiliates' content to our main audience!`,
     1]
  );
  console.log("    2 training modules seeded (markdown content)");
}

// ── 1 PAYOUT ────────────────────────────────────────────────────────
const payoutCount = db.query("SELECT COUNT(*) as c FROM affiliate_payouts ap JOIN affiliates a ON ap.affiliate_id = a.id WHERE a.business_id = ?").get(BIZ).c;
if (payoutCount === 0 && affData1) {
  db.run(
    `INSERT INTO affiliate_payouts (affiliate_id, amount, method, status, notes, paid_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', '-7 days'))`,
    [affData1.id, 25.00, "store_credit", "paid", "Monthly payout for June referrals"]
  );
  console.log(`    Payout: $25.00 paid to GLITTERVIP10 (store credit)`);
}

console.log("  P4.4 Affiliate HQ seed complete");

// ── P4.3: CUSTOMER HUB SEED — Email Templates, Approvals, Customer Tags ─

console.log("\n  P4.3 Customer Hub Seed...");

// Email templates
const templateCount = db.query("SELECT COUNT(*) as c FROM email_templates WHERE business_id = ?").get(BIZ).c;
if (templateCount === 0) {
  const templates = [
    {
      name: "Refund Confirmation",
      subject: "Refund confirmation for Order #{{order_number}}",
      body: `Hi {{customer_name}},

Thank you so much for reaching out to us — I'm sorry to hear that your order didn't meet expectations. That's not the experience we want for anyone shopping with Glitzy Glitter Express, and I want to make this right for you.

I've gone ahead and processed your refund for Order #{{order_number}}. You should see {{refund_amount}} back on your payment method within 3–5 business days.

If there's anything else I can do for you, please don't hesitate to reply — I'm here to help.

Warmly,
Glitzy Glitter Express Team`,
    },
    {
      name: "Replacement Order Confirmation",
      subject: "Replacement order for Order #{{order_number}}",
      body: `Hi {{customer_name}},

Thank you for letting us know about the issue with your order — I really appreciate you giving us the chance to make things right.

I've set up a replacement for Order #{{order_number}}, and it'll be heading your way shortly. You'll receive a separate confirmation with tracking details as soon as it ships.

We take quality seriously, so I've also shared your feedback with our team to help prevent this from happening again.

Thanks for your patience, and please reach out anytime.

Warmly,
Glitzy Glitter Express Team`,
    },
    {
      name: "Shipping Update",
      subject: "Your order has shipped! 🚚 Order #{{order_number}}",
      body: `Hi {{customer_name}},

Great news — your order is on its way!

Order #{{order_number}} has been carefully packed and shipped via {{carrier}}. Your tracking number is {{tracking_number}}.

You can track your package here: {{tracking_url}}

Thank you for shopping with Glitzy Glitter Express! We hope you love everything.

Warmly,
Glitzy Glitter Express Team`,
    },
    {
      name: "Customer Follow-Up",
      subject: "How's everything with your order? ✨",
      body: `Hi {{customer_name}},

Just checking in to make sure everything's going wonderfully with your recent order #{{order_number}}!

We want you to be completely happy with your purchase. If anything isn't right or if you have questions, simply reply to this message — I'm here for you.

Thanks for choosing Glitzy Glitter Express — we appreciate you!

Warmly,
Glitzy Glitter Express Team`,
    },
    {
      name: "Store Credit Issued",
      subject: "Store credit for your Glitzy Glitter Express order",
      body: `Hi {{customer_name}},

I wanted to let you know that we've issued {{credit_amount}} in store credit to your account as a thank you for your patience with Order #{{order_number}}.

Your store credit code is: {{credit_code}}

You can use this on any future order at glitzyglitterexpress.com. It never expires!

Thanks again for being an amazing customer.

Warmly,
Glitzy Glitter Express Team`,
    },
  ];

  for (const t of templates) {
    db.run(
      "INSERT INTO email_templates (business_id, name, subject, body) VALUES (?, ?, ?, ?)",
      [BIZ, t.name, t.subject, t.body]
    );
  }
  console.log(`    ${templates.length} email templates seeded`);
}

// Sample approval requests
const approvalCount = db.query("SELECT COUNT(*) as c FROM approvals WHERE business_id = ?").get(BIZ).c;
if (approvalCount === 0) {
  // Pending: Large store credit request
  db.run(
    `INSERT INTO approvals (business_id, type, request_data, requested_by) VALUES (?, 'large_credit', ?, ?)`,
    [BIZ, JSON.stringify({
      order_id: 1004,
      customer_email: 'david.park@example.com',
      requested_amount: 50.00,
      reason: 'Customer had significant quality issue with wax — offering store credit above standard limit',
      notes: 'David has been a loyal walk-in customer for 6+ months',
    }), ownerId]
  );

  // Pending: Replacement approval for wholesale
  db.run(
    `INSERT INTO approvals (business_id, type, request_data, requested_by) VALUES (?, 'replacement_approval', ?, ?)`,
    [BIZ, JSON.stringify({
      order_id: 1002,
      customer_email: 'orders@bellasboutique.example.com',
      item_count: 3,
      reason: 'Bella\'s Boutique reported 3 damaged neon sets in wholesale shipment',
    }), csUserId]
  );

  console.log("    2 sample approvals seeded (pending)");
}

// Customer tags
const tagCount = db.query("SELECT COUNT(*) as c FROM customer_tags WHERE business_id = ?").get(BIZ).c;
if (tagCount === 0) {
  db.run("INSERT OR IGNORE INTO customer_tags (business_id, customer_email, tag) VALUES (?, ?, ?)", [BIZ, "orders@bellasboutique.example.com", "wholesale"]);
  db.run("INSERT OR IGNORE INTO customer_tags (business_id, customer_email, tag) VALUES (?, ?, ?)", [BIZ, "orders@bellasboutique.example.com", "vip"]);
  db.run("INSERT OR IGNORE INTO customer_tags (business_id, customer_email, tag) VALUES (?, ?, ?)", [BIZ, "billing@craftcorner.example.com", "wholesale"]);
  db.run("INSERT OR IGNORE INTO customer_tags (business_id, customer_email, tag) VALUES (?, ?, ?)", [BIZ, "jessica@example.com", "vip"]);
  db.run("INSERT OR IGNORE INTO customer_tags (business_id, customer_email, tag) VALUES (?, ?, ?)", [BIZ, "david.park@example.com", "problematic"]);
  console.log("    5 customer tags seeded");
}

console.log("  P4.3 customer hub seed complete");

	// ── P4.5: STUDIO SEED ────────────────────────────────────────────────

	console.log("\n  P4.5 Studio Seed...");

	// Ensure business_settings row exists with brand info
	db.run(
		`INSERT OR IGNORE INTO business_settings (business_id, settings, brand_colors, brand_logo_url, brand_font)
		 VALUES (?, '{}', ?, ?, ?)`,
		[BIZ, JSON.stringify(["#f43f5e", "#fbbfca", "#fff5f6"]), null, "Poppins"]
	);
	// Update brand if row exists
	db.run(
		`UPDATE business_settings SET brand_colors = ?, brand_font = ?
		 WHERE business_id = ? AND brand_colors = '[]'`,
		[JSON.stringify(["#f43f5e", "#fbbfca", "#fff5f6"]), "Poppins", BIZ]
	);

	// Default template: Social Post
	const socialLayout = JSON.stringify({
		width: 1080,
		height: 1080,
		sections: [
			{ type: "image", y: 0, height: "60%", placeholder: true },
			{ type: "text", y: "60%", height: "20%", content: "headline", style: "heading" },
			{ type: "text", y: "80%", height: "10%", content: "subtitle", style: "body" },
			{ type: "text", y: "90%", height: "10%", content: "cta", style: "button" },
		],
	});
	db.run(
		`INSERT OR IGNORE INTO studio_templates (business_id, name, type, layout)
		 VALUES (?, 'Glitzy Social Post', 'social_post', ?)`,
		[BIZ, socialLayout]
	);

	// Default template: Email Banner
	const emailLayout = JSON.stringify({
		width: 600,
		height: 200,
		sections: [
			{ type: "text", y: 0, height: "40%", content: "headline", style: "heading", align: "center" },
			{ type: "text", y: "40%", height: "30%", content: "subtitle", style: "body", align: "center" },
			{ type: "text", y: "70%", height: "30%", content: "cta", style: "button", align: "center" },
		],
	});
	db.run(
		`INSERT OR IGNORE INTO studio_templates (business_id, name, type, layout)
		 VALUES (?, 'Email Campaign Header', 'email_banner', ?)`,
		[BIZ, emailLayout]
	);

	// Default template: Product Graphic
	const productLayout = JSON.stringify({
		width: 800,
		height: 800,
		sections: [
			{ type: "image", y: 0, height: "65%", placeholder: true },
			{ type: "text", y: "65%", height: "10%", content: "headline", style: "heading" },
			{ type: "text", y: "75%", height: "10%", content: "subtitle", style: "body" },
			{ type: "text", y: "85%", height: "15%", content: "cta", style: "button" },
		],
	});
	db.run(
		`INSERT OR IGNORE INTO studio_templates (business_id, name, type, layout)
		 VALUES (?, 'Product Showcase', 'product_graphics', ?)`,
		[BIZ, productLayout]
	);

	// Sample saved asset: social post for a candle product
	const studioCandleProduct = db.query("SELECT id, name FROM products WHERE sku = 'CND-LAV-8' AND business_id = ?").get(BIZ);
	if (studioCandleProduct) {
		const sampleHtml = '<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Poppins,-apple-system,sans-serif}</style></head><body style="width:1080px;height:1080px;background:#fff5f6;position:relative;overflow:hidden;"><div style="position:absolute;top:0;left:0;width:100%;height:60%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fbbfca33,#f43f5e22);border:2px dashed #f43f5e44;border-radius:12px;margin:8px;width:calc(100%-16px);"><div style="text-align:center;color:#f43f5e88;"><div style="font-size:36px;">📸</div><div style="font-size:12px;margin-top:4px;">Product Image</div></div></div><div style="position:absolute;top:60%;left:0;width:100%;height:20%;display:flex;align-items:center;justify-content:center;padding:16px;"><span style="font-size:28px;font-weight:700;color:#1f2937;">' + studioCandleProduct.name + '</span></div><div style="position:absolute;top:80%;left:0;width:100%;height:10%;display:flex;align-items:center;justify-content:center;padding:16px;"><span style="font-size:18px;color:#1f2937;opacity:0.8;">$18.99</span></div><div style="position:absolute;top:90%;left:0;width:100%;height:10%;display:flex;align-items:center;justify-content:center;padding:16px;"><span style="font-size:16px;font-weight:600;color:#fff;background:#f43f5e;padding:10px 24px;border-radius:8px;display:inline-block;">Shop Now</span></div></body></html>';

		db.run(
			`INSERT OR IGNORE INTO studio_assets (business_id, product_id, type, title, html_content)
			 VALUES (?, ?, 'social_post', ?, ?)`,
			[BIZ, studioCandleProduct.id, studioCandleProduct.name + ' — Social Post', sampleHtml]
		);
	}

	const studioTemplateCount = db.query("SELECT COUNT(*) as c FROM studio_templates WHERE business_id = ?").get(BIZ).c;
	const studioAssetCount = db.query("SELECT COUNT(*) as c FROM studio_assets WHERE business_id = ?").get(BIZ).c;
	console.log(`    ${studioTemplateCount} templates seeded`);
	console.log(`    ${studioAssetCount} saved assets seeded`);
	console.log("  P4.5 studio seed complete");

	// ── V3.8: TIMELINE SEED — Complete Operating Loop ────────────────────

console.log("\n  V3.8 Daily Business Replay™ Seed...");

const todayStr = new Date().toISOString().split("T")[0];
const timelineBiz = BIZ;

// Get existing candle BOM and its output product
const bomLavCandleV38 = db.query("SELECT id, output_product_id FROM boms WHERE name = '8oz Lavender Soy Candle' AND business_id = ?").get(timelineBiz);
if (!bomLavCandleV38) {
  console.log("    ⚠️ Lavender candle BOM not found — skipping V3.8 seed");
} else {
  const outputProductId = bomLavCandleV38.output_product_id;
  
  // Get the output product info
  const outProd = db.query("SELECT id, name, sku, stock_count FROM products WHERE id = ? AND business_id = ?").get(outputProductId, timelineBiz);
  if (!outProd) {
    console.log("    ⚠️ Output product not found — skipping V3.8 seed");
  } else {
    const prodUser = db.query("SELECT id FROM users WHERE username = 'gge_production'").get();
    const prodUserId = prodUser ? prodUser.id : 1;

    // ── 1. Order created today (Commerce) ─────────────────────────────
    const orderNumber = 2000;
    const existingOrder = db.query("SELECT id FROM orders WHERE order_number = ? AND business_id = ?").get(orderNumber, timelineBiz);
    let orderId;
    if (!existingOrder) {
      const r = db.run(
        `INSERT INTO orders (shopify_order_id, order_number, customer_name, customer_email, source, status, notes, total_amount, created_by, business_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [null, orderNumber, "Timeline Test Customer", "timeline@example.com", "phone", "pending", "V3.8 seed order for timeline demo", 24.99, prodUserId, timelineBiz, `${todayStr}T08:15:00`]
      );
      orderId = r.lastInsertRowid;

      // Order items
      db.run(
        `INSERT INTO order_items (order_id, product_id, variant_id, sku, variant_title, quantity, unit_price, line_total, scanned_quantity, business_id)
         VALUES (?, ?, NULL, ?, ?, 1, ?, ?, 0, ?)`,
        [orderId, outProd.id, outProd.sku, "8oz", 24.99, 24.99, timelineBiz]
      );
      console.log(`    Order #${orderNumber}: created for "${outProd.name}" (Commerce)`);
    } else {
      orderId = existingOrder.id;
      console.log(`    Order #${orderNumber}: already exists (skipping)`);
    }

    // ── 2. Production batch started & completed today (Production) ──
    const batchCountV38 = db.query(
      "SELECT COUNT(*) as c FROM production_batches WHERE bom_id = ? AND business_id = ? AND notes LIKE ?"
    ).get(bomLavCandleV38.id, timelineBiz, "V3.8 timeline seed%").c;

    let batchId;
    if (batchCountV38 === 0) {
      const br = db.run(
        `INSERT INTO production_batches (business_id, bom_id, batch_size, status, notes, started_at, completed_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [timelineBiz, bomLavCandleV38.id, 2, "completed", "V3.8 timeline seed batch", `${todayStr}T09:00:00`, `${todayStr}T11:30:00`, prodUserId, `${todayStr}T08:45:00`]
      );
      batchId = br.lastInsertRowid;

      // Batch movements (consumed & produced)
      db.run(
        `INSERT INTO batch_movements (batch_id, product_id, direction, planned_quantity, actual_quantity, unit)
         VALUES (?, ?, 'produced', ?, ?, ?)`,
        [batchId, outProd.id, 2, 2, 'unit']
      );
      console.log(`    Batch #${batchId}: 2x "${outProd.name}" produced (Production)`);
    } else {
      batchId = db.query(
        "SELECT id FROM production_batches WHERE bom_id = ? AND business_id = ? AND notes LIKE ? LIMIT 1"
      ).get(bomLavCandleV38.id, timelineBiz, "V3.8 timeline seed%").id;
      console.log(`    Production batch already exists (skipping)`);
    }

    // ── 3. Inventory movement — produced goods added (Warehouse) ─────
    const movCountV38 = db.query(
      "SELECT COUNT(*) as c FROM inventory_movements WHERE product_id = ? AND created_at LIKE ? AND type = 'in'"
    ).get(outProd.id, `${todayStr}%`).c;
    if (movCountV38 === 0) {
      db.run(
        `INSERT INTO inventory_movements (product_id, type, quantity, created_at, user_id, business_id)
         VALUES (?, 'in', 2, ?, ?, ?)`,
        [outProd.id, `${todayStr}T11:35:00`, prodUserId, timelineBiz]
      );
      // Update product stock
      db.run("UPDATE products SET stock_count = stock_count + 2 WHERE id = ?", [outProd.id]);
      console.log(`    Inventory: +2 "${outProd.name}" (Warehouse)`);
    } else {
      console.log(`    Inventory movement already exists (skipping)`);
    }

    // ── 4. Inventory movement — order fulfillment (Warehouse) ────────
    const movOrderV38 = db.query(
      "SELECT COUNT(*) as c FROM inventory_movements WHERE product_id = ? AND created_at LIKE ? AND type = 'order'"
    ).get(outProd.id, `${todayStr}%`).c;
    if (movOrderV38 === 0) {
      db.run(
        `INSERT INTO inventory_movements (product_id, type, quantity, created_at, user_id, business_id)
         VALUES (?, 'order', 1, ?, ?, ?)`,
        [outProd.id, `${todayStr}T14:00:00`, prodUserId, timelineBiz]
      );
      console.log(`    Inventory: -1 "${outProd.name}" for order fulfillment (Warehouse)`);
    } else {
      console.log(`    Order fulfillment movement already exists (skipping)`);
    }

    // ── 5. Order scan — item picked (Warehouse → Shipping) ───────────
    if (orderId) {
      const scanCountV38 = db.query(
        "SELECT COUNT(*) as c FROM order_scans WHERE order_id = ? AND created_at LIKE ?"
      ).get(orderId, `${todayStr}%`).c;
      if (scanCountV38 === 0) {
        db.run(
          `INSERT INTO order_scans (order_id, order_item_id, product_id, barcode, created_at, user_id, business_id)
           VALUES (?, (SELECT id FROM order_items WHERE order_id = ? LIMIT 1), ?, ?, ?, ?, ?)`,
          [orderId, orderId, outProd.id, outProd.sku, `${todayStr}T14:05:00`, prodUserId, timelineBiz]
        );
        // Update order status to complete
        db.run("UPDATE orders SET status = 'complete' WHERE id = ?", [orderId]);
        // Update scanned_quantity on order item
        db.run("UPDATE order_items SET scanned_quantity = 1 WHERE order_id = ?", [orderId]);
        console.log(`    Pick scan: "${outProd.name}" picked for Order #${orderNumber} (Shipping)`);
      } else {
        console.log(`    Pick scan already exists (skipping)`);
      }
    }

    // ── 6. Customer note — order shipped (Customer Service) ──────────
    const noteCountV38 = db.query(
      "SELECT COUNT(*) as c FROM customer_notes WHERE customer_email = ? AND created_at LIKE ? AND note LIKE ?"
    ).get("timeline@example.com", `${todayStr}%`, "V3.8%").c;
    if (noteCountV38 === 0) {
      db.run(
        `INSERT INTO customer_notes (business_id, customer_email, order_id, note, note_type, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [timelineBiz, "timeline@example.com", orderId || null, "V3.8 timeline: Order shipped via USPS Priority. Tracking: 9400 1000 0000 0000 0000 00", "shipping", prodUserId, `${todayStr}T14:30:00`]
      );
      console.log(`    Customer note: shipped (Customer Service)`);
    } else {
      console.log(`    Customer note already exists (skipping)`);
    }

    console.log("  V3.8 timeline seed complete ✅");
  }
}

// ── SUMMARY ───────────────────────────────────────────────────────────

// ── P4.1: ADAPTIVE HQ — Industry Configuration Profiles ──────────────

console.log("\n  P4.1: Industry Configuration Profiles...");

const industryConfigs = [
  {
    id: 'pet-store',
    name: 'Pet Store',
    icon: '🐾',
    terminology: JSON.stringify({
      product: "Pet Supply",
      products: "Pet Supplies",
      inventory: "Stock Room",
      production: "Grooming",
      warehouse: "Storage",
      supplier: "Pet Supplier",
      purchasing: "Restocking",
      orders: "Pet Orders",
      calculation: "Measure Calc"
    }),
    default_engines: JSON.stringify(["inventory", "commerce", "production", "warehouse", "purchasing"]),
    workflow_order: JSON.stringify(["commerce", "production", "warehouse", "inventory", "customer_service"]),
    default_units: JSON.stringify(["unit", "lb", "oz", "pack"])
  },
  {
    id: 'fragrance-supplier',
    name: 'Fragrance Supplier',
    icon: '🌸',
    terminology: JSON.stringify({
      product: "Fragrance",
      products: "Fragrances",
      production: "Blending",
      inventory: "Oil Inventory",
      supplier: "Oil Supplier",
      purchasing: "Sourcing",
      warehouse: "Oil Storage",
      calculation: "Formula Calc"
    }),
    default_engines: JSON.stringify(["production", "inventory", "calculation", "commerce", "purchasing"]),
    workflow_order: JSON.stringify(["commerce", "production", "warehouse", "inventory", "customer_service"]),
    default_units: JSON.stringify(["ml", "oz", "g", "kg"])
  },
  {
    id: 'bakery',
    name: 'Bakery',
    icon: '🥖',
    terminology: JSON.stringify({
      product: "Baked Good",
      products: "Baked Goods",
      production: "Baking",
      inventory: "Fresh Stock",
      warehouse: "Display Case",
      supplier: "Ingredient Supplier",
      purchasing: "Sourcing",
      calculation: "Recipe Calc"
    }),
    default_engines: JSON.stringify(["production", "inventory", "calculation", "commerce", "purchasing"]),
    workflow_order: JSON.stringify(["commerce", "production", "warehouse", "inventory", "customer_service"]),
    default_units: JSON.stringify(["dozen", "lb", "oz", "g", "kg"])
  },
  {
    id: 'coffee-roaster',
    name: 'Coffee Roaster',
    icon: '☕',
    terminology: JSON.stringify({
      product: "Coffee",
      products: "Coffees",
      production: "Roasting",
      inventory: "Bean Inventory",
      supplier: "Green Bean Supplier",
      purchasing: "Sourcing",
      warehouse: "Bean Storage",
      calculation: "Roast Calc"
    }),
    default_engines: JSON.stringify(["production", "inventory", "commerce", "purchasing"]),
    workflow_order: JSON.stringify(["commerce", "production", "warehouse", "inventory", "customer_service"]),
    default_units: JSON.stringify(["lb", "oz", "g", "kg"])
  },
  {
    id: 'boutique',
    name: 'Boutique',
    icon: '👗',
    terminology: JSON.stringify({
      product: "Item",
      products: "Items",
      production: "Curating",
      inventory: "Stockroom",
      warehouse: "Back Room",
      supplier: "Vendor",
      purchasing: "Buying",
      orders: "Client Orders"
    }),
    default_engines: JSON.stringify(["inventory", "commerce", "warehouse", "purchasing"]),
    workflow_order: JSON.stringify(["commerce", "warehouse", "inventory", "customer_service"]),
    default_units: JSON.stringify(["unit", "piece"])
  },
  {
    id: 'cosmetics',
    name: 'Cosmetics',
    icon: '💄',
    terminology: JSON.stringify({
      product: "Product",
      products: "Products",
      production: "Formulating",
      inventory: "Batch Inventory",
      supplier: "Ingredient Supplier",
      purchasing: "Sourcing",
      warehouse: "Batch Storage",
      calculation: "Formulation Calc"
    }),
    default_engines: JSON.stringify(["production", "inventory", "calculation", "commerce", "purchasing"]),
    workflow_order: JSON.stringify(["commerce", "production", "warehouse", "inventory", "customer_service"]),
    default_units: JSON.stringify(["ml", "oz", "g", "kg", "unit"])
  },
  {
    id: 'candle-maker',
    name: 'Candle Maker',
    icon: '🕯️',
    terminology: JSON.stringify({
      product: "Candle",
      products: "Candles",
      production: "Pouring",
      inventory: "Cured Stock",
      supplier: "Wax Supplier",
      purchasing: "Sourcing",
      warehouse: "Curing Rack",
      calculation: "Pour Calc"
    }),
    default_engines: JSON.stringify(["production", "inventory", "calculation", "commerce", "purchasing"]),
    workflow_order: JSON.stringify(["commerce", "production", "warehouse", "inventory", "customer_service"]),
    default_units: JSON.stringify(["oz", "lb", "g", "unit"])
  },
  {
    id: 'artisan-food',
    name: 'Artisan Food',
    icon: '🍯',
    terminology: JSON.stringify({
      product: "Food Item",
      products: "Food Items",
      production: "Crafting",
      inventory: "Pantry Stock",
      supplier: "Ingredient Supplier",
      purchasing: "Sourcing",
      warehouse: "Storage",
      calculation: "Batch Calc"
    }),
    default_engines: JSON.stringify(["production", "inventory", "commerce", "purchasing", "calculation"]),
    workflow_order: JSON.stringify(["commerce", "production", "inventory", "customer_service"]),
    default_units: JSON.stringify(["oz", "lb", "g", "unit"])
  },
  {
    id: 'home-decor',
    name: 'Home Décor',
    icon: '🏠',
    terminology: JSON.stringify({
      product: "Decor Item",
      products: "Decor Items",
      inventory: "Showroom Stock",
      supplier: "Artisan",
      purchasing: "Curating",
      warehouse: "Stock Room"
    }),
    default_engines: JSON.stringify(["inventory", "commerce", "warehouse", "purchasing"]),
    workflow_order: JSON.stringify(["commerce", "inventory", "warehouse", "customer_service"]),
    default_units: JSON.stringify(["unit", "piece"])
  },
  {
    id: 'stationery',
    name: 'Stationery',
    icon: '📝',
    terminology: JSON.stringify({
      product: "Design",
      products: "Designs",
      production: "Printing",
      inventory: "Paper Stock",
      supplier: "Paper Supplier",
      purchasing: "Sourcing",
      warehouse: "Flat Storage",
      calculation: "Print Calc"
    }),
    default_engines: JSON.stringify(["production", "inventory", "commerce", "purchasing", "calculation"]),
    workflow_order: JSON.stringify(["commerce", "production", "inventory", "customer_service"]),
    default_units: JSON.stringify(["unit", "piece", "sheet"])
  },
  {
    id: 'general-product',
    name: 'Product Business',
    icon: '📦',
    terminology: JSON.stringify({
      product: "Product",
      products: "Products",
      production: "Production",
      inventory: "Stock",
      supplier: "Supplier",
      purchasing: "Purchasing",
      warehouse: "Warehouse",
      calculation: "Calculator"
    }),
    default_engines: JSON.stringify(["inventory", "commerce"]),
    workflow_order: JSON.stringify(["commerce", "inventory", "customer_service"]),
    default_units: JSON.stringify(["unit", "piece"])
  },
];

// Upsert each industry config
for (const ic of industryConfigs) {
  const existing = db.query("SELECT id FROM industry_configs WHERE id = ?").get(ic.id);
  if (existing) {
    db.run(
      `UPDATE industry_configs 
       SET name = ?, icon = ?, terminology = ?, default_engines = ?, workflow_order = ?, default_units = ?
       WHERE id = ?`,
      [ic.name, ic.icon, ic.terminology, ic.default_engines, ic.workflow_order, ic.default_units, ic.id]
    );
  } else {
    db.run(
      `INSERT INTO industry_configs (id, name, icon, terminology, default_engines, workflow_order, default_units)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ic.id, ic.name, ic.icon, ic.terminology, ic.default_engines, ic.workflow_order, ic.default_units]
    );
  }
}

const industryCount = db.query("SELECT COUNT(*) as c FROM industry_configs").get().c;
console.log(`    ${industryCount} industry profiles seeded`);


	// ── FULFILLMENT SHIPMENTS SEED ──────────────────────────────────────

	console.log("\n  Fulfillment Shipments...");
	const shippedOrders = db.query(
		"SELECT id, order_number FROM orders WHERE business_id = ? AND order_number BETWEEN 1001 AND 1003"
	).all(BIZ);

	if (shippedOrders.length > 0) {
		const existingShipments = db.query(
			"SELECT COUNT(*) as c FROM fulfillment_shipments WHERE business_id = ?"
		).get(BIZ);

		if (existingShipments.c === 0) {
			for (let i = 0; i < Math.min(shippedOrders.length, 3); i++) {
				const order = shippedOrders[i];
				const carriers = ["UPS", "USPS", "FedEx"];
				const carrier = carriers[i % 3];
				const tracking = "1Z" + String(order.order_number) + "AA" + (1000000000 + i * 12345);
				const daysAgo = 3 + i * 2;
				const shipDate = new Date(Date.now() - daysAgo * 86400000).toISOString().replace("T", " ").slice(0, 19);
				const status = i === 0 ? "delivered" : i === 1 ? "out_for_delivery" : "in_transit";
				const deliveredAt = i === 0
					? new Date(Date.now() - (daysAgo - 1) * 86400000).toISOString().replace("T", " ").slice(0, 19)
					: null;

				db.run(
					"INSERT INTO fulfillment_shipments (order_id, carrier, tracking_number, package_type, weight_oz, cost, status, shipped_at, delivered_at, business_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
					[order.id, carrier, tracking, "Small Box (8x6x4\")", 12, 6.99 + i * 1.5, status, shipDate, deliveredAt, BIZ]
				);
				db.run("UPDATE orders SET status = 'fulfilled' WHERE id = ?", [order.id]);
				console.log("    Order #" + order.order_number + " -> shipped via " + carrier + " (" + status + ")");
			}
		}
	}

	const shipmentCount = db.query(
		"SELECT COUNT(*) as c FROM fulfillment_shipments WHERE business_id = ?"
	).get(BIZ).c;
	console.log("    " + shipmentCount + " shipments seeded");
	// ── Fulfillment HQ 1.1: Seed Templates & Unboxing Rules ────────
	const ftCount = db.query("SELECT COUNT(*) as c FROM fulfillment_templates WHERE business_id = ?").get(BIZ).c;
	if (ftCount === 0) {
		db.run(
			"INSERT INTO fulfillment_templates (business_id, type, name, config, is_default) VALUES (?, ?, ?, ?, ?)",
			[BIZ, 'packing_slip', 'Retail Packing Slip',
				JSON.stringify({
					primaryColor: '#e11d48', accentColor: '#fda4af', font: 'Inter',
					showThankYou: true, thankYouMessage: 'Thank you for shopping with Glitzy Glitter Express! ✨',
					showSocialMedia: true, socialHandles: '@glitzyglitterexpress',
					showQrCode: false, showProductPhotos: false, showOrderNotes: true,
					showGiftMessage: true, showBarcode: false, showWarehouseLocation: false,
					showPickListInfo: false, showPackedBy: true,
				}), 1]
		);
		db.run(
			"INSERT INTO fulfillment_templates (business_id, type, name, config, is_default) VALUES (?, ?, ?, ?, ?)",
			[BIZ, 'packing_slip', 'Wholesale Packing Slip',
				JSON.stringify({
					primaryColor: '#1e293b', accentColor: '#94a3b8', font: 'Inter',
					showThankYou: true, thankYouMessage: 'Thank you for your wholesale order!',
					showSocialMedia: false, showQrCode: false, showProductPhotos: false,
					showOrderNotes: true, showGiftMessage: false, showBarcode: true,
					showWarehouseLocation: true, showPickListInfo: true, showPackedBy: false,
				}), 0]
		);
		db.run(
			"INSERT INTO fulfillment_templates (business_id, type, name, config, is_default) VALUES (?, ?, ?, ?, ?)",
			[BIZ, 'shipping_label', 'Default Shipping Label',
				JSON.stringify({
					primaryColor: '#1e293b', accentColor: '#cbd5e1', font: 'Inter',
					labelSize: '4x6 thermal', showBarcode: true, showQrCode: false,
				}), 1]
		);
		console.log("    3 fulfillment templates seeded (2 packing slips, 1 shipping label)");
	}

	const unboxingRuleCount = db.query("SELECT COUNT(*) as c FROM fulfillment_unboxing_rules WHERE business_id = ?").get(BIZ).c;
	if (unboxingRuleCount === 0) {
		db.run(
			"INSERT INTO fulfillment_unboxing_rules (business_id, name, condition_type, condition_value, action_type, action_config, is_active, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			[BIZ, 'Big Order Thank You', 'order_value', '100', 'thank_you_card',
				JSON.stringify({ message: 'Thanks for your big order! We truly appreciate your support! 💖' }), 1, 10]
		);
		db.run(
			"INSERT INTO fulfillment_unboxing_rules (business_id, name, condition_type, condition_value, action_type, action_config, is_active, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			[BIZ, 'First-Time Customer Coupon', 'customer_type', 'first_time', 'coupon',
				JSON.stringify({ amount: '15', couponType: 'percentage' }), 1, 5]
		);
		console.log("    2 unboxing rules seeded");
	}

	// ── Packing Recipes (Fulfillment 1.2) ──────────────────────────
	const recipeCount = db.query("SELECT COUNT(*) as c FROM packing_recipes WHERE business_id = ?").get(BIZ).c;
	if (recipeCount === 0) {
		db.run(
			"INSERT INTO packing_recipes (business_id, name, product_id, order_type, box_size, packing_materials, inserts, labels, special_instructions, priority, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			[BIZ, 'Standard Retail', null, 'retail', '10x8x4',
				JSON.stringify(['bubble wrap', 'tissue paper']),
				JSON.stringify([{type: 'thank_you_card', details: 'Thank you for supporting our small business! 💖', quantity: 1}, {type: 'sticker', details: 'Brand logo sticker', quantity: 1}]),
				null, null, 1, 1]
		);
		db.run(
			"INSERT INTO packing_recipes (business_id, name, product_id, order_type, box_size, packing_materials, inserts, labels, special_instructions, priority, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			[BIZ, 'Wholesale Bulk', null, 'wholesale', '12x10x6',
				JSON.stringify(['kraft paper', 'air pillows']),
				JSON.stringify([{type: 'catalog', details: 'Current product catalog', quantity: 1}]),
				null, 'Stack boxes on pallets for wholesale shipments', 1, 1]
		);
		db.run(
			"INSERT INTO packing_recipes (business_id, name, product_id, order_type, box_size, packing_materials, inserts, labels, special_instructions, priority, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			[BIZ, 'Sample Kit', null, 'sample', '6x4x3',
				JSON.stringify(['tissue paper']),
				JSON.stringify([{type: 'thank_you_card', details: 'Hope you love your samples!', quantity: 1}, {type: 'coupon', details: '10% off your first full-size order', quantity: 1}]),
				null, null, 1, 1]
		);
		console.log("    3 packing recipes seeded");
	}

  // ── Partner HQ 3.0 Seed ───────────────────────────────────────────
  // Seed 2 programs, application form, and content protection
  const progCount = db.query("SELECT COUNT(*) as c FROM partner_programs WHERE business_id = ?").get(BIZ).c;
  if (progCount === 0) {
    // Default Affiliate Program
    db.run(`INSERT INTO partner_programs (business_id, name, slug, type, description, brand_color, is_active, default_commission_type, default_commission_rate, approval_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [BIZ, "Affiliate Program", "affiliate-program", "affiliate", "Earn commissions by sharing your unique discount code. Our standard affiliate program with competitive rates.", "#6366f1", 1, "percentage", 5, "auto"]);
    
    // Brand Rep Program
    db.run(`INSERT INTO partner_programs (business_id, name, slug, type, description, brand_color, is_active, default_commission_type, default_commission_rate, approval_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [BIZ, "Brand Rep Program", "brand-rep-program", "brand_rep", "Represent our brand on social media and earn rewards. Exclusive perks for passionate brand advocates.", "#ec4899", 1, "percentage", 8, "manual"]);
    
    console.log("    2 partner programs seeded");
  }
  
  // Seed application form for Brand Rep Program
  const brandRepProg = db.query("SELECT id FROM partner_programs WHERE business_id = ? AND slug = ?").get(BIZ, "brand-rep-program");
  if (brandRepProg) {
    const formCount = db.query("SELECT COUNT(*) as c FROM partner_application_forms WHERE program_id = ?").get(brandRepProg.id).c;
    if (formCount === 0) {
      const fields = JSON.stringify([
        {label: "Full Name", type: "text", required: true},
        {label: "Email Address", type: "email", required: true},
        {label: "Social Media URL", type: "url", required: true},
        {label: "Why do you love our brand?", type: "textarea", required: true}
      ]);
      db.run(`INSERT INTO partner_application_forms (program_id, business_id, is_active, title, description, fields)
        VALUES (?, ?, 1, ?, ?, ?)`,
        [brandRepProg.id, BIZ, "Brand Rep Application", "Apply to become an official brand representative!", fields]);
      console.log("    1 application form seeded for Brand Rep Program");
    }
  }
  
  // Seed content protection for both programs
  for (const prog of db.query("SELECT id FROM partner_programs WHERE business_id = ?", [BIZ]).all()) {
    const cpCount = db.query("SELECT COUNT(*) as c FROM partner_content_protection WHERE program_id = ? AND business_id = ?").get(prog.id, BIZ).c;
    if (cpCount === 0) {
      db.run(`INSERT INTO partner_content_protection (program_id, business_id, watermark_enabled, watermark_text, watermark_position, download_logging_enabled, viewer_overlay_enabled, viewer_overlay_message)
        VALUES (?, ?, 1, ?, ?, 1, 0, ?)`,
        [prog.id, BIZ, "ShimmerStock Partner", "bottom-right", "For authorized partners only"]);
    }
  }
  console.log("    Content protection seeded for all programs");
  
  // Add existing affiliates to the Affiliate Program
  const affProg = db.query("SELECT id FROM partner_programs WHERE business_id = ? AND slug = ?").get(BIZ, "affiliate-program");
  if (affProg) {
    const existingAffs = db.query("SELECT id FROM affiliates WHERE business_id = ?", [BIZ]).all();
    for (const aff of existingAffs) {
      db.run("INSERT OR IGNORE INTO partner_program_members (program_id, partner_id, status) VALUES (?, ?, ?)",
        [affProg.id, aff.id, "active"]);
    }
    const memberCount = db.query("SELECT COUNT(*) as c FROM partner_program_members WHERE program_id = ?").get(affProg.id).c;
    console.log(`    ${memberCount} existing affiliates added to Affiliate Program`);
  }

const productCount = db.query("SELECT COUNT(*) as c FROM products WHERE business_id = ?").get(BIZ).c;

  // ── Affiliate Attribution Engine Seed ──────────────────────────────

  console.log("\n  Affiliate Attribution Engine Seed...");

  // Default attribution rules for business
  const existingRules = db.query("SELECT COUNT(*) as c FROM affiliate_attribution_rules WHERE business_id = ? AND program_id IS NULL").get(BIZ).c;
  if (existingRules === 0) {
    db.run(
      `INSERT INTO affiliate_attribution_rules (business_id, program_id, cookie_duration_hours, attribution_model, coupon_overrides_referral, allow_self_referrals, require_fulfillment, require_return_window, return_window_days, repeat_customer_orders_qualify)
       VALUES (?, NULL, 720, 'last_click', 1, 0, 0, 0, 30, 1)`,
      [BIZ]
    );
    console.log("    Default attribution rules seeded (720hr cookie, last-click, coupon overrides, no self-referrals)");
  }

  // Default commission config
  const existingConfig = db.query("SELECT COUNT(*) as c FROM affiliate_commission_config WHERE business_id = ? AND program_id IS NULL").get(BIZ).c;
  if (existingConfig === 0) {
    db.run(
      `INSERT INTO affiliate_commission_config (business_id, program_id, exclude_shipping, exclude_taxes, exclude_discounts, exclude_gift_cards, exclude_tips, excluded_product_ids, excluded_collection_ids, minimum_order_amount_cents)
       VALUES (?, NULL, 1, 1, 1, 1, 1, NULL, NULL, NULL)`,
      [BIZ]
    );
    console.log("    Default commission config seeded (exclude shipping, tax, discounts)");
  }

  // Per-program rules for the Affiliate Program
  const affProgram = db.query("SELECT id FROM partner_programs WHERE business_id = ? AND slug = ?").get(BIZ, "affiliate-program");
  if (affProgram) {
    const progRules = db.query("SELECT COUNT(*) as c FROM affiliate_attribution_rules WHERE program_id = ?").get(affProgram.id).c;
    if (progRules === 0) {
      db.run(
        `INSERT INTO affiliate_attribution_rules (business_id, program_id, cookie_duration_hours, attribution_model, coupon_overrides_referral, allow_self_referrals, require_fulfillment, require_return_window, return_window_days, repeat_customer_orders_qualify)
         VALUES (?, ?, 720, 'last_click', 1, 0, 0, 0, 30, 1)`,
        [BIZ, affProgram.id]
      );
      console.log("    Affiliate Program attribution rules seeded");
    }

    const progConfig = db.query("SELECT COUNT(*) as c FROM affiliate_commission_config WHERE program_id = ?").get(affProgram.id).c;
    if (progConfig === 0) {
      db.run(
        `INSERT INTO affiliate_commission_config (business_id, program_id, exclude_shipping, exclude_taxes, exclude_discounts, exclude_gift_cards, exclude_tips, excluded_product_ids, excluded_collection_ids, minimum_order_amount_cents)
         VALUES (?, ?, 1, 1, 1, 1, 1, NULL, NULL, NULL)`,
        [BIZ, affProgram.id]
      );
      console.log("    Affiliate Program commission config seeded");
    }
  }


const variantCount = db.query("SELECT COUNT(*) as c FROM product_variants WHERE business_id = ?").get(BIZ).c;
const supplierCount = db.query("SELECT COUNT(*) as c FROM suppliers WHERE business_id = ?").get(BIZ).c;
const bomCount = db.query("SELECT COUNT(*) as c FROM boms WHERE business_id = ?").get(BIZ).c;
const batchCount = db.query("SELECT COUNT(*) as c FROM production_batches WHERE business_id = ?").get(BIZ).c;
const thresholdCount = db.query("SELECT COUNT(*) as c FROM inventory_thresholds WHERE business_id = ?").get(BIZ).c;
const userCount = db.query("SELECT COUNT(*) as c FROM users u JOIN user_businesses ub ON u.id = ub.user_id WHERE ub.business_id = ?").get(BIZ).c;

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  ✨ GGE Seed Complete!");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  📦 ${productCount} products`);
console.log(`  🏷️  ${variantCount} variants`);
console.log(`  🚚 ${supplierCount} suppliers`);
console.log(`  📋 ${bomCount} BOMs/recipes`);
console.log(`  🏭 ${batchCount} production batches`);
console.log(`  ⚠️  ${thresholdCount} inventory thresholds`);
console.log(`  👥 ${userCount} users`);
console.log("═══════════════════════════════════════════════════════════");
console.log("  🔐 Login: gge_owner / gge2024");
console.log("  🌐 Store: glitzyglitterexpress.com");
console.log("═══════════════════════════════════════════════════════════\n");

// Close the database connection
db.close();
