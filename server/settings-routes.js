import { requireAuth } from "./auth.js";
import * as store from "./store.js";
import { getBusinessAccess } from "./plan-config.js";

const SUPPORT_CATEGORIES = new Set([
  "technical", "shopify", "billing", "inventory", "account", "feature", "feedback", "other",
]);

function cleanText(value, min, max) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length >= min && text.length <= max ? text : null;
}

function containsSensitiveMaterial(value) {
  return /authorization\s*:\s*(?:bearer|basic)|(?:password|access[_ -]?token|api[_ -]?key|encryption[_ -]?key|cookie|session)\s*[:=]|\b[0-9a-f]{64}\b|\bshp(?:at|ca|pa|ss)_[a-z0-9_-]{8,}|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bgh(?:p|o|u|s|r)_[a-z0-9]{20,}|\bgithub_pat_[a-z0-9_]{20,}|\bsk_(?:live|test)_[a-z0-9]{12,}|\bsk-[a-z0-9_-]{20,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bxox(?:b|p|a|r|s)-[a-z0-9-]{12,}/i.test(value);
}

function getSettingsOverview(db, businessId, user) {
  const business = db.query("SELECT id, name, slug, created_at FROM businesses WHERE id = ?").get(businessId);
  const identity = db.query(`
    SELECT sku_pattern, sku_separator, sku_case, preserve_existing, preferred_label_size,
      label_fields, writeback_enabled, auto_writeback_enabled, updated_at
    FROM product_identity_settings WHERE business_id = ?
  `).get(businessId) || {
    sku_pattern: "{PRODUCT}-{VARIANT}-{NUMBER}", sku_separator: "-", sku_case: "upper",
    preserve_existing: 1, preferred_label_size: "2x1",
    label_fields: '["product","variant","sku","barcode"]', writeback_enabled: 0,
    auto_writeback_enabled: 0, updated_at: null,
  };
  const novi = db.query(`
    SELECT preferred_workflow, production_priority, packing_preference, updated_at
    FROM novi_business_preferences WHERE business_id = ?
  `).get(businessId) || {
    preferred_workflow: "exceptions_first", production_priority: "oldest_orders_first",
    packing_preference: null, updated_at: null,
  };
  const shopify = db.query(`
    SELECT pc.shop_domain, pc.shop_name, pc.sync_status, pc.sync_mode, pc.scopes,
      pc.sync_error, pc.is_active, pc.access_token_encrypted,
      si.state AS latest_import_state, si.last_successful_import_at
    FROM provider_credentials pc
    LEFT JOIN shopify_import_sessions si ON si.id = (
      SELECT id FROM shopify_import_sessions WHERE business_id = pc.business_id ORDER BY id DESC LIMIT 1
    )
    WHERE pc.business_id = ? AND pc.provider = 'shopify'
    LIMIT 1
  `).get(businessId) || null;
  const shopifyConnected = shopify?.is_active === 1 && Boolean(shopify?.access_token_encrypted);
  const shopifyConnectionState = shopifyConnected ? "connected"
    : shopify?.sync_status === "pending" ? "pending_validation"
      : shopify?.sync_status === "failed" ? "failed" : "disconnected";
  return {
    account: { id: user.id, username: user.username, displayName: user.display_name, role: user.business_role || user.role },
    business,
    access: getBusinessAccess(db, businessId),
    integrations: {
      shopify: shopify ? {
        connected: shopifyConnected, connectionState: shopifyConnectionState,
        shopDomain: shopify.shop_domain, shopName: shopify.shop_name,
        connectionMode: shopify.sync_mode === "full" ? "product_writeback" : "read_only",
        syncStatus: shopify.sync_status, latestImportState: shopify.latest_import_state,
        lastSuccessfulImportAt: shopifyConnected ? shopify.last_successful_import_at : null,
        grantedScopes: String(shopify.scopes || "").split(",").map(scope => scope.trim()).filter(Boolean),
      } : { connected: false, connectionState: "disconnected" },
    },
    noviPreferences: {
      preferredWorkflow: novi.preferred_workflow, productionPriority: novi.production_priority,
      packingPreference: novi.packing_preference, updatedAt: novi.updated_at,
    },
    printingAndLabels: {
      skuPattern: identity.sku_pattern, skuSeparator: identity.sku_separator, skuCase: identity.sku_case,
      preserveExisting: Boolean(identity.preserve_existing), preferredLabelSize: identity.preferred_label_size,
      labelFields: JSON.parse(identity.label_fields), productWritebackEnabled: Boolean(identity.writeback_enabled),
      automaticWritebackEnabled: Boolean(identity.auto_writeback_enabled), updatedAt: identity.updated_at,
    },
  };
}

export function mountSettingsRoutes(app, db) {
  app.get("/api/settings/overview", requireAuth(db), (req, res) => {
    res.json(getSettingsOverview(db, req.businessId, req.user));
  });

  app.get("/api/settings/support-requests", requireAuth(db), (req, res) => {
    const requests = db.query(`
      SELECT id, reference, category, subject, status, safe_context, created_at, updated_at
      FROM support_requests WHERE business_id = ? AND created_by = ? ORDER BY id DESC LIMIT 25
    `).all(req.businessId, req.user.id).map(request => ({
      id: request.id, reference: request.reference, category: request.category, subject: request.subject,
      status: request.status, safeContext: JSON.parse(request.safe_context || "{}"),
      createdAt: request.created_at, updatedAt: request.updated_at,
    }));
    res.json({ requests });
  });

  app.post("/api/settings/support-requests", requireAuth(db), (req, res) => {
    const category = SUPPORT_CATEGORIES.has(req.body?.category) ? req.body.category : null;
    const subject = cleanText(req.body?.subject, 3, 120);
    const message = cleanText(req.body?.message, 10, 5000);
    if (!category || !subject || !message) {
      return res.status(400).json({ error: "Choose a category and provide a subject and message" });
    }
    if (containsSensitiveMaterial(`${subject}\n${message}`)) {
      return res.status(400).json({ error: "Remove passwords, tokens, keys, or authorization values before submitting" });
    }
    const safeContext = {
      currentRoute: cleanText(req.body?.safeContext?.currentRoute, 1, 200),
      importId: cleanText(String(req.body?.safeContext?.importId ?? ""), 1, 80),
      errorId: cleanText(String(req.body?.safeContext?.errorId ?? ""), 1, 80),
    };
    Object.keys(safeContext).forEach(key => safeContext[key] === null && delete safeContext[key]);
    const result = db.run(`
      INSERT INTO support_requests (business_id, created_by, category, subject, message, safe_context)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.businessId, req.user.id, category, subject, message, JSON.stringify(safeContext)]);
    const id = Number(result.lastInsertRowid);
    const reference = `SUP-${String(id).padStart(6, "0")}`;
    db.run("UPDATE support_requests SET reference = ? WHERE id = ? AND business_id = ?", [reference, id, req.businessId]);
    store.logAuditEntry(db, {
      businessId: req.businessId, userId: req.user.id,
      actionType: "support.request_received", entityType: "support_request", entityId: id,
      newValue: { reference, category, subject }, source: "settings",
    });
    res.status(201).json({ id, reference, status: "received", persisted: true });
  });
}