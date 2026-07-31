/**
 * P4.1 Adaptive HQ — Engine Label Lookup
 *
 * Maps generic engine names to industry-specific labels based on the
 * business's assigned industry_config. Falls back to defaults when no
 * industry is configured.
 */

// ── Default labels (used when no industry config is set) ──────────
const DEFAULT_LABELS = {
  production: "Production",
  purchasing: "Purchasing",
  inventory: "Inventory",
  warehouse: "Warehouse",
  commerce: "Commerce",
  orders: "Orders",
  products: "Products",
  calculation: "Calculation",
  shipping: "Shipping",
  customer_service: "Customer Service",
  marketing: "Marketing",
  affiliates: "Affiliates",
  supplier: "Supplier",
  novi: "Novi",
  timeline: "Timeline",
  opportunities: "Opportunities",
  audit: "Audit Log",
  sync: "Sync Log",
  settings: "Settings",
  fulfillment: "Fulfillment",
  team: "Team",
  studio: "Studio",
  partners: "Partners",
  growth: "Growth",
  brand_setup: "Brand Setup",
};

// ── Default icons ─────────────────────────────────────────────────
const DEFAULT_ICONS = {
  production: "🏭",
  purchasing: "📦",
  inventory: "📦",
  warehouse: "🏗️",
  commerce: "📋",
  orders: "📋",
  products: "📦",
  calculation: "🧮",
  shipping: "🚚",
  customer_service: "💬",
  marketing: "📢",
  affiliates: "🤝",
  supplier: "📦",
  novi: "✨",
  timeline: "📅",
  opportunities: "💡",
  audit: "🔍",
  sync: "🔄",
  settings: "⚙️",
  fulfillment: "📦",
  team: "👥",
  studio: "🎨",
  partners: "🤝",
  growth: "📈",
  brand_setup: "🎨",
};

// ── Cache per businessId to avoid repeated DB hits ────────────────
const cache = new Map();

/**
 * Get the industry config for a business (with caching).
 * Returns null if no industry is assigned.
 */
function getIndustryConfig(db, businessId) {
  const bizId = typeof businessId === "number" ? businessId : parseInt(businessId);
  if (!bizId) return null;

  const cached = cache.get(bizId);
  if (cached !== undefined) return cached;

  let config = null;
  try {
    const row = db
      .query(
        `SELECT ic.id, ic.name, ic.icon, ic.terminology, ic.default_engines, 
                ic.workflow_order, ic.default_units
         FROM business_settings bs
         JOIN industry_configs ic ON bs.industry_config_id = ic.id
         WHERE bs.business_id = ?`
      )
      .get(bizId);

    if (row) {
      config = {
        id: row.id,
        name: row.name,
        icon: row.icon,
        terminology: JSON.parse(row.terminology || "{}"),
        defaultEngines: JSON.parse(row.default_engines || "[]"),
        workflowOrder: JSON.parse(row.workflow_order || "[]"),
        defaultUnits: JSON.parse(row.default_units || "[]"),
      };
    }
  } catch {
    // If query fails, return null (no industry)
  }

  cache.set(bizId, config);
  return config;
}

/** Clear the cache for a given businessId (used after settings update). */
export function clearLabelCache(businessId) {
  cache.delete(typeof businessId === "number" ? businessId : parseInt(businessId));
}

/**
 * Get the industry-adapted label for an engine.
 *
 * @param {string} engineName - e.g. "production", "inventory", "warehouse"
 * @param {number|string} businessId
 * @param {object} db - database instance
 * @returns {string} - the adapted label (e.g. "Baking" for bakery production)
 */
export function getLabel(engineName, businessId, db) {
  const config = getIndustryConfig(db, businessId);
  const terminology = config?.terminology || {};
  return terminology[engineName] || DEFAULT_LABELS[engineName] || engineName;
}

/**
 * Get all labels for a business (useful for bulk lookups).
 */
export function getAllLabels(businessId, db) {
  const config = getIndustryConfig(db, businessId);
  const terminology = config?.terminology || {};
  const result = { ...DEFAULT_LABELS };
  for (const [key, value] of Object.entries(terminology)) {
    result[key] = value;
  }
  return result;
}

/**
 * Get the industry icon (currently using defaults — overridable in future).
 */
export function getIcon(engineName, businessId, db) {
  const config = getIndustryConfig(db, businessId);
  // For now, icons come from the config (emoji) or defaults
  // The industry_config.icon is the industry icon, not per-engine.
  return DEFAULT_ICONS[engineName] || "📦";
}

/**
 * Get the full industry config object for an API response.
 */
export function getIndustryConfigForApi(db, businessId) {
  return getIndustryConfig(db, businessId);
}
