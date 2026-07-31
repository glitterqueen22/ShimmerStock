/**
 * Shopify Webhook Routes — receive and process Shopify webhook events.
 *
 * Routes:
 *   POST /api/shopify/webhooks/:topic — receive webhook (no auth — called by Shopify)
 *
 * Webhook topics handled:
 *   orders-create, orders-updated, orders-cancelled,
 *   products-update, inventory-update, app-uninstalled
 */

import crypto from "crypto";
import express from "express";
import * as sync from "./sync.js";
import * as store from "./store.js";

const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || "";

/**
 * Validate a Shopify webhook HMAC header.
 */
function validateWebhookHmac(rawBody, hmacHeader) {
  if (!hmacHeader) return false;
  const expectedHmac = crypto
    .createHmac("sha256", SHOPIFY_CLIENT_SECRET)
    .update(rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHmac),
      Buffer.from(hmacHeader)
    );
  } catch {
    return false;
  }
}

/**
 * Resolve business_id from shop_domain in provider_credentials.
 */
function resolveBusinessId(db, shopDomain) {
  if (!shopDomain) return null;
  const row = db
    .query("SELECT business_id FROM provider_credentials WHERE shop_domain = ? AND provider = 'shopify' AND is_active = 1")
    .get(shopDomain);
  return row ? row.business_id : null;
}

export function mountShopifyWebhookRoutes(app, db) {
  /**
   * POST /api/shopify/webhooks/:topic
   * No auth middleware — called by Shopify's servers.
   * Uses express.raw() to capture the raw body for HMAC validation.
   */
  app.post("/api/shopify/webhooks/:topic", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const topic = req.params.topic;
      const shopDomain = req.headers["x-shopify-shop-domain"] || "";
      const hmacHeader = req.headers["x-shopify-hmac-sha256"] || "";
      const shopifyWebhookId = req.headers["x-shopify-webhook-id"] || null;

      // req.body is a Buffer from express.raw()
      const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(req.body || "");
      const rawBodyStr = rawBody.toString("utf8");

      // Validate HMAC
      if (!validateWebhookHmac(rawBodyStr, hmacHeader)) {
        console.warn(`[shopify-webhook] HMAC validation failed for topic: ${topic}, shop: ${shopDomain}`);
        return res.status(403).json({ error: "Invalid HMAC signature" });
      }

      // Parse JSON body
      let parsedBody;
      try {
        parsedBody = JSON.parse(rawBodyStr);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }

      // Resolve business from shop domain
      const businessId = resolveBusinessId(db, shopDomain);
      if (!businessId) {
        console.warn(`[shopify-webhook] Unknown shop domain: ${shopDomain}`);
        return res.status(200).json({ message: "Shop not found — ignored" });
      }

      const payload = rawBodyStr;

      // Insert delivery record
      const result = db.run(
        `INSERT INTO shopify_webhook_deliveries (business_id, topic, shopify_id, payload, processed, created_at)
         VALUES (?, ?, ?, ?, 0, datetime('now'))`,
        [businessId, topic, shopifyWebhookId, payload]
      );
      const deliveryId = result.lastInsertRowid;

      console.log(`[shopify-webhook] Received ${topic} for business ${businessId} (shop: ${shopDomain})`);

      // Process based on topic
      try {
        switch (topic) {
          case "orders-create":
            await handleOrderCreate(db, businessId, parsedBody);
            break;
          case "orders-updated":
            await handleOrderUpdated(db, businessId, parsedBody);
            break;
          case "orders-cancelled":
            await handleOrderCancelled(db, businessId, parsedBody);
            break;
          case "products-update":
            await handleProductUpdate(db, businessId, parsedBody);
            break;
          case "inventory-update":
            await handleInventoryUpdate(db, businessId, parsedBody);
            break;
          case "app-uninstalled":
            await handleAppUninstalled(db, businessId);
            break;
          default:
            console.log(`[shopify-webhook] Unhandled topic: ${topic}`);
        }

        // Mark as processed
        db.run("UPDATE shopify_webhook_deliveries SET processed = 1 WHERE id = ?", [deliveryId]);
      } catch (err) {
        console.error(`[shopify-webhook] Error processing ${topic}:`, err.message);
        db.run("UPDATE shopify_webhook_deliveries SET error = ? WHERE id = ?", [err.message, deliveryId]);
      }

      // Always return 200 to Shopify
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("[shopify-webhook] Unexpected error:", err.message);
      // Return 200 even on error to prevent retries
      res.status(200).json({ success: false, error: err.message });
    }
  });

  console.log("[shopify-webhook] Webhook routes mounted");
}

// ── Webhook handlers ────────────────────────────────────────────────────

async function handleOrderCreate(db, businessId, webhookData) {
  const order = webhookData;
  const shopifyOrderId = String(order.id || order.admin_graphql_api_id || "");
  const orderNumber = order.order_number || order.id;

  // Check for existing order (idempotency)
  const orderKey = sync.idempotencyKey("import_order", shopifyOrderId);
  if (sync.isDuplicate(db, businessId, orderKey)) {
    console.log(`[shopify-webhook] Order ${orderNumber} already imported — skipping`);
    return;
  }

  // Extract customer name
  const customer = order.customer || {};
  const customerName = customer.first_name
    ? `${customer.first_name} ${customer.last_name || ""}`.trim()
    : (customer.email || "Unknown");

  const lineItems = (order.line_items || []).map((item) => ({
    sku: item.sku || "",
    title: item.title || "",
    variantTitle: item.variant_title || "",
    quantity: item.quantity || 0,
    variantId: item.variant_id,
  }));

  store.transaction(db, () => {
    const orderId = store.createOrder(db, {
      businessId,
      shopifyOrderId,
      orderNumber,
      customerName,
      source: "shopify",
      status: "pending",
    });

    for (const item of lineItems) {
      if (!item.sku) continue;
      const product = store.getProductBySku(db, item.sku, businessId);
      store.createOrderItem(db, {
        orderId,
        productId: product ? product.id : null,
        sku: item.sku,
        variantTitle: item.variantTitle,
        quantity: item.quantity,
        businessId,
      });
    }

    sync.logSync(db, {
      businessId,
      idempotencyKey: orderKey,
      action: "import_order",
      shopifyOrderId,
      provider: "shopify",
      externalId: shopifyOrderId,
      entityType: "order",
      entityId: orderId,
      status: "success",
      details: { order_number: orderNumber, source: "webhook" },
    });
  });

  console.log(`[shopify-webhook] Order created via webhook: #${orderNumber}`);
}

async function handleOrderUpdated(db, businessId, webhookData) {
  const shopifyOrderId = String(webhookData.id || "");
  const order = store.getOrderByShopifyId(db, shopifyOrderId, businessId);

  if (!order) {
    console.log(`[shopify-webhook] Order ${shopifyOrderId} not found locally — skipping update`);
    return;
  }

  const shopifyStatus = webhookData.financial_status || webhookData.fulfillment_status;
  console.log(`[shopify-webhook] Order #${order.order_number} updated — Shopify status: ${shopifyStatus}`);

  // Could sync additional fields here like fulfillment status, tracking, etc.
  // For now, just log it.
}

async function handleOrderCancelled(db, businessId, webhookData) {
  const shopifyOrderId = String(webhookData.id || "");
  const order = store.getOrderByShopifyId(db, shopifyOrderId, businessId);

  if (!order) {
    console.log(`[shopify-webhook] Cancelled order ${shopifyOrderId} not found locally — skipping`);
    return;
  }

  store.updateOrderStatus(db, order.id, "cancelled");
  console.log(`[shopify-webhook] Order #${order.order_number} marked as cancelled`);
}

async function handleProductUpdate(db, businessId, webhookData) {
  const productId = String(webhookData.id || "");
  const title = webhookData.title || "";

  console.log(`[shopify-webhook] Product updated: ${title} (${productId})`);

  // Update product name / variants if they exist locally
  for (const variant of webhookData.variants || []) {
    if (!variant.sku) continue;
    const existingProduct = store.getProductBySku(db, variant.sku, businessId);
    if (existingProduct) {
      store.updateProduct(db, existingProduct.id, businessId, {
        nameBarcodeUpdate: {
          name: title,
          barcode: variant.barcode || existingProduct.barcode,
        },
      });
    }
  }
}

async function handleInventoryUpdate(db, businessId, webhookData) {
  const inventoryItemId = String(webhookData.inventory_item_id || "");
  const available = webhookData.available;

  console.log(`[shopify-webhook] Inventory update: item ${inventoryItemId} → ${available}`);

  // We don't have a mapping from inventory_item_id to local product in this schema.
  // For now, log it. Future: sync inventory counts back.
  // This would need inventory_item_id tracked on product_variants.
}

async function handleAppUninstalled(db, businessId) {
  console.log(`[shopify-webhook] App uninstalled for business ${businessId}`);

  db.run(
    `UPDATE provider_credentials
     SET is_active = 0, access_token_encrypted = NULL, webhook_id = NULL,
         sync_status = 'error', sync_error = 'App uninstalled from Shopify',
         updated_at = datetime('now')
     WHERE business_id = ? AND provider = 'shopify'`,
    [businessId]
  );
}
