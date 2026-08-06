/**
 * Novi Event Detection Engine
 * =============================
 * The brain that watches real business events and generates Novi messages.
 * Turns Novi from decorative into proactive.
 *
 * Subscribes to the event bus and runs detection rules when events fire.
 * Respects novi_settings.frequency to avoid overwhelming users.
 */

import { on, off, emit } from "./events.js";
import * as store from "./store.js";

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if a similar un-dismissed message already exists.
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @param {string} eventType
 * @param {string|null} contextKey — a unique key within context_data to dedupe on
 * @returns {boolean}
 */
function hasActiveMessage(db, businessId, eventType, contextKey) {
  if (!contextKey) {
    // Simple dedupe: just check for any un-dismissed message of this type
    const row = db.query(
      `SELECT COUNT(*) as count FROM novi_messages
       WHERE business_id = ? AND event_type = ? AND status = 'new'`
    ).get(businessId, eventType);
    return row.count > 0;
  }

  // Dedupe with context matching: check if context_data contains the key
  const row = db.query(
    `SELECT COUNT(*) as count FROM novi_messages
     WHERE business_id = ? AND event_type = ? AND status = 'new'
     AND context_data LIKE ?`
  ).get(businessId, eventType, `%${contextKey}%`);
  return row.count > 0;
}

/**
 * Determine if we should notify based on frequency settings.
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @param {string} severity — "info" | "warning" | "opportunity" | "celebration" | "urgent"
 * @returns {boolean}
 */
function shouldNotify(db, businessId, severity) {
  const settings = db.query(
    "SELECT frequency FROM novi_settings WHERE business_id = ?"
  ).get(businessId);

  const frequency = settings?.frequency || "balanced";

  // Quiet: no messages at all
  if (frequency === "quiet") return false;

  // Minimal: only warnings and urgent
  if (frequency === "minimal") {
    return severity === "warning" || severity === "urgent";
  }

  // Balanced: skip low-priority info
  if (frequency === "balanced") {
    if (severity === "info") return false;
    return true;
  }

  // Proactive: everything
  return true;
}

/**
 * Create a Novi message if it passes deduplication and frequency checks.
 * Returns the message ID or null.
 */
function createMessageIfNeeded(db, businessId, message) {
  // Check frequency
  if (!shouldNotify(db, businessId, message.severity)) {
    return null;
  }

  // Build context key for deduplication
  let contextKey = null;
  if (message.eventType === 'low_inventory' || message.eventType === 'out_of_stock') {
    contextKey = message.contextData ? JSON.parse(message.contextData || '{}').productId : null;
    if (contextKey) contextKey = `productId:${contextKey}`;
  }
  if (message.eventType === 'orders_combine') {
    contextKey = message.contextData || null;
  }

  // Check deduplication
  if (hasActiveMessage(db, businessId, message.eventType, contextKey)) {
    return null;
  }

  // Create the message
  try {
    const id = store.createNoviMessage(db, {
      businessId,
      userId: null, // system-generated
      eventType: message.eventType,
      title: message.title,
      description: message.description,
      actionType: message.actionType || null,
      actionLabel: message.actionLabel || null,
      actionLink: message.actionLink || null,
      actionRoute: message.actionRoute || message.actionLink || null,
      severity: message.severity || "info",
      contextData: message.contextData || null,
    });
    // Emit opportunity event for cross-engine consumption
    try {
      emit("opportunity.detected", {
        businessId,
        source: "novi",
        event_type: message.eventType,
        title: message.title,
        description: message.description,
        severity: message.severity || "info",
      });
    } catch (emitErr) {
      console.error("[novi-detection] Failed to emit opportunity.detected:", emitErr.message);
    }

    return id;
  } catch (err) {
    console.error(`[novi-detection] Failed to create message for ${message.eventType}:`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DETECTION RULES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Rule 1: Low Inventory
 * Event: inventory.updated
 * Products with quantity <= reorder_point AND quantity > 0
 */
function detectLowInventory(db, businessId) {
  const products = db.query(
    `SELECT p.id, p.name, p.sku, p.stock_count,
            COALESCE(t.reorder_point, 5) as reorder_point
     FROM products p
     LEFT JOIN inventory_thresholds t ON t.product_id = p.id AND t.business_id = p.business_id
     WHERE p.business_id = ? AND p.stock_count > 0
       AND p.stock_count <= COALESCE(t.reorder_point, 5)`
  ).all(businessId);

  const created = [];
  for (const product of products) {
    const contextKey = `productId:${product.id}`;
    if (hasActiveMessage(db, businessId, 'low_inventory', contextKey)) continue;

    const id = createMessageIfNeeded(db, businessId, {
      eventType: 'low_inventory',
      title: `Low Stock: ${product.name}`,
      description: `${product.stock_count} units remaining (reorder at ${product.reorder_point})`,
      severity: 'warning',
      actionType: 'navigate',
      actionLabel: 'Create Purchase Order',
      actionLink: '/purchasing',
      contextData: JSON.stringify({ productId: product.id, sku: product.sku, stockCount: product.stock_count }),
    });
    if (id) created.push(id);
  }
  return created;
}

/**
 * Rule 2: Out of Stock
 * Event: inventory.updated
 * Products with quantity <= 0
 */
function detectOutOfStock(db, businessId) {
  const products = db.query(
    `SELECT id, name, sku, stock_count
     FROM products
     WHERE business_id = ? AND stock_count <= 0`
  ).all(businessId);

  const created = [];
  for (const product of products) {
    const contextKey = `productId:${product.id}`;
    if (hasActiveMessage(db, businessId, 'out_of_stock', contextKey)) continue;

    const id = createMessageIfNeeded(db, businessId, {
      eventType: 'out_of_stock',
      title: `Out of Stock: ${product.name}`,
      description: `${product.name} (${product.sku}) is completely out of stock.`,
      severity: 'urgent',
      actionType: 'navigate',
      actionLabel: 'Reorder Now',
      actionLink: '/purchasing',
      contextData: JSON.stringify({ productId: product.id, sku: product.sku }),
    });
    if (id) created.push(id);
  }
  return created;
}

/**
 * Rule 3: Orders Can Be Combined
 * Event: order.created
 * Check for recent orders (last 24h) for the same customer
 */
function detectOrdersCanCombine(db, businessId, payload) {
  if (!payload || !payload.customerName || !payload.orderId) return [];

  const recentOrders = db.query(
    `SELECT o.id, o.order_number, o.customer_name, o.created_at
     FROM orders o
     WHERE o.business_id = ? AND o.customer_name = ? AND o.id != ?
       AND o.created_at >= datetime('now', '-24 hours')
       AND o.status NOT IN ('cancelled', 'shipped')
     ORDER BY o.created_at DESC`
  ).all(businessId, payload.customerName, payload.orderId);

  if (recentOrders.length < 1) return [];

  const allOrderIds = [payload.orderId, ...recentOrders.map(o => o.id)];

  const contextKey = `customer:${payload.customerName}`;
  if (hasActiveMessage(db, businessId, 'orders_combine', contextKey)) return [];

  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'orders_combine',
    title: 'Orders Can Be Combined',
    description: `${allOrderIds.length} orders for ${payload.customerName} could ship together`,
    severity: 'opportunity',
    actionType: 'navigate',
    actionLabel: 'Combine Orders',
    actionLink: `/orders?combine=${allOrderIds.join(',')}`,
    contextData: JSON.stringify({ orderIds: allOrderIds, customerName: payload.customerName }),
  });
  return id ? [id] : [];
}

/**
 * Rule 4: Order May Need Splitting
 * Event: order.created
 * Check if order items span different warehouses or if some items are out of stock
 */
function detectOrderMayNeedSplit(db, businessId, payload) {
  if (!payload || !payload.orderId) return [];

  const orderId = payload.orderId;

  const outOfStockItems = db.query(
    `SELECT oi.id, oi.sku, oi.quantity, p.stock_count, p.name
     FROM order_items oi
     LEFT JOIN products p ON oi.product_id = p.id
     WHERE oi.order_id = ? AND oi.business_id = ?
       AND (p.stock_count IS NULL OR p.stock_count < oi.quantity)`
  ).all(orderId, businessId);

  if (outOfStockItems.length === 0) return [];

  const contextKey = `orderId:${orderId}`;
  if (hasActiveMessage(db, businessId, 'order_split', contextKey)) return [];

  const itemNames = outOfStockItems.map(i => i.name || i.sku).join(', ');
  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'order_split',
    title: 'Order May Need Splitting',
    description: `Some items in order #${payload.orderNumber || orderId} are unavailable: ${itemNames}`,
    severity: 'warning',
    actionType: 'navigate',
    actionLabel: 'Split Order',
    actionLink: `/orders?split=${orderId}`,
    contextData: JSON.stringify({ orderId, unavailableItems: outOfStockItems.map(i => i.id) }),
  });
  return id ? [id] : [];
}

/**
 * Rule 5: Missing SKUs
 * Events: product.created, commerce.products_synced
 * Check for products with NULL or empty SKU
 */
function detectMissingSKUs(db, businessId) {
  const missingSkuProducts = db.query(
    `SELECT id, name, barcode
     FROM products
     WHERE business_id = ? AND (sku IS NULL OR sku = '')`
  ).all(businessId);

  if (missingSkuProducts.length === 0) return [];

  if (hasActiveMessage(db, businessId, 'missing_skus', null)) return [];

  const names = missingSkuProducts.map(p => p.name).join(', ');
  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'missing_skus',
    title: `${missingSkuProducts.length} Products Missing SKUs`,
    description: `Add SKUs to enable barcode scanning and inventory tracking: ${names}`,
    severity: 'warning',
    actionType: 'navigate',
    actionLabel: 'Generate SKUs',
    actionLink: '/products?filter=missing-sku',
    contextData: JSON.stringify({ productIds: missingSkuProducts.map(p => p.id) }),
  });
  return id ? [id] : [];
}

/**
 * Rule 6: Duplicate SKUs
 * Events: product.created, commerce.products_synced
 * Check for duplicate SKUs within the business
 */
function detectDuplicateSKUs(db, businessId) {
  const duplicates = db.query(
    `SELECT sku, COUNT(*) as count, GROUP_CONCAT(name, ', ') as names
     FROM products
     WHERE business_id = ? AND sku IS NOT NULL AND sku != ''
     GROUP BY sku
     HAVING COUNT(*) > 1`
  ).all(businessId);

  if (duplicates.length === 0) return [];

  if (hasActiveMessage(db, businessId, 'duplicate_skus', null)) return [];

  const totalDuped = duplicates.reduce((sum, d) => sum + d.count - 1, 0);
  const details = duplicates.map(d => `"${d.sku}" used by: ${d.names}`).join('; ');

  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'duplicate_skus',
    title: 'Duplicate SKUs Detected',
    description: `${totalDuped} SKU(s) are used by multiple products. ${details}`,
    severity: 'warning',
    actionType: 'navigate',
    actionLabel: 'Review Duplicates',
    actionLink: '/products?filter=duplicate-sku',
    contextData: JSON.stringify({ duplicateSkus: duplicates.map(d => d.sku) }),
  });
  return id ? [id] : [];
}

/**
 * Rule 7: First Sale Milestone
 * Event: order.created
 * Check if this is the first order for the business
 */
function detectFirstSale(db, businessId) {
  const count = db.query(
    "SELECT COUNT(*) as count FROM orders WHERE business_id = ?"
  ).get(businessId).count;

  if (count !== 1) return [];

  if (hasActiveMessage(db, businessId, 'milestone_first_sale', null)) return [];

  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'milestone_first_sale',
    title: '🎉 First Sale!',
    description: 'Your first customer just placed an order! This is a big moment.',
    severity: 'celebration',
    actionType: null,
    actionLabel: null,
    actionLink: null,
    contextData: null,
  });
  return id ? [id] : [];
}

/**
 * Rule 8: First Shipment Milestone
 * Events: warehouse.order_shipped, fulfillment.shipment_created
 * Check if this is the first shipped/fulfilled order
 */
function detectFirstShipment(db, businessId) {
  const fulfilledCount = db.query(
    `SELECT COUNT(*) as count FROM orders
     WHERE business_id = ? AND status IN ('shipped', 'fulfilled', 'delivered')`
  ).get(businessId).count;

  if (fulfilledCount !== 1) return [];

  if (hasActiveMessage(db, businessId, 'milestone_first_shipment', null)) return [];

  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'milestone_first_shipment',
    title: '📦 First Shipment!',
    description: 'Your first order is on its way to a customer!',
    severity: 'celebration',
    actionType: null,
    actionLabel: null,
    actionLink: null,
    contextData: null,
  });
  return id ? [id] : [];
}

/**
 * Rule 9: Setup Incomplete
 * Event: auth.login
 * Check if business has no products, no commerce connection, no fulfillment templates
 */
function detectSetupIncomplete(db, businessId) {
  const productCount = db.query(
    "SELECT COUNT(*) as count FROM products WHERE business_id = ?"
  ).get(businessId).count;

  const commerceConnected = db.query(
    "SELECT COUNT(*) as count FROM provider_credentials WHERE business_id = ?"
  ).get(businessId).count > 0;

  let fulfillmentTemplates = 0;
  try {
    const ft = db.query(
      "SELECT COUNT(*) as count FROM fulfillment_templates WHERE business_id = ?"
    ).get(businessId);
    fulfillmentTemplates = ft?.count || 0;
  } catch {
    fulfillmentTemplates = 0;
  }

  let completedSteps = 0;
  const totalSteps = 3;
  if (productCount > 0) completedSteps++;
  if (commerceConnected) completedSteps++;
  if (fulfillmentTemplates > 0) completedSteps++;

  const pct = Math.round((completedSteps / totalSteps) * 100);

  if (pct >= 100) return [];

  if (hasActiveMessage(db, businessId, 'setup_incomplete', null)) return [];

  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'setup_incomplete',
    title: 'Setup In Progress',
    description: `You're ${pct}% set up. Let's finish the last few steps.`,
    severity: 'info',
    actionType: 'navigate',
    actionLabel: 'Continue Setup',
    actionLink: '/hq?onboarding=1',
    contextData: JSON.stringify({ pct, productCount, commerceConnected, fulfillmentTemplates }),
  });
  return id ? [id] : [];
}

/**
 * Rule 10: Affiliate Application Pending
 * Events: partner.application_submitted, periodic
 */
function detectAffiliateApplications(db, businessId) {
  let pendingApps = [];
  try {
    pendingApps = db.query(
      `SELECT pa.id, pa.applicant_name, pa.created_at, pp.name as program_name
       FROM partner_applications pa
       JOIN partner_programs pp ON pa.program_id = pp.id
       WHERE pa.business_id = ? AND pa.status = 'pending'
       ORDER BY pa.created_at ASC`
    ).all(businessId);
  } catch {
    return [];
  }

  if (pendingApps.length === 0) return [];

  if (hasActiveMessage(db, businessId, 'affiliate_application', null)) return [];

  const appList = pendingApps.map(a => {
    const daysAgo = Math.floor((Date.now() - new Date(a.created_at + 'Z').getTime()) / (1000 * 60 * 60 * 24));
    return `${a.applicant_name || 'Someone'} applied ${daysAgo} day(s) ago`;
  }).join(', ');

  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'affiliate_application',
    title: `${pendingApps.length} Affiliate Application${pendingApps.length > 1 ? 's' : ''} Waiting`,
    description: appList,
    severity: 'info',
    actionType: 'navigate',
    actionLabel: 'Review Applications',
    actionLink: '/partners?tab=applications',
    contextData: JSON.stringify({ applicationIds: pendingApps.map(a => a.id) }),
  });
  return id ? [id] : [];
}

/**
 * Rule 11: Fulfillment Deadline Approaching
 * Events: order.created, periodic
 * Orders with status 'processing' older than 24h
 */
function detectFulfillmentDeadlines(db, businessId) {
  const staleOrders = db.query(
    `SELECT id, order_number, customer_name, status, created_at,
            CAST(ROUND((JULIANDAY('now') - JULIANDAY(created_at)) * 24) AS INTEGER) as hours_old
     FROM orders
     WHERE business_id = ? AND status IN ('processing', 'pending')
       AND created_at < datetime('now', '-24 hours')
     ORDER BY created_at ASC`
  ).all(businessId);

  if (staleOrders.length === 0) return [];

  const created = [];
  for (const order of staleOrders) {
    const contextKey = `orderId:${order.id}`;
    if (hasActiveMessage(db, businessId, 'fulfillment_deadline', contextKey)) continue;

    const id = createMessageIfNeeded(db, businessId, {
      eventType: 'fulfillment_deadline',
      title: `Order #${order.order_number || order.id} Needs Attention`,
      description: `This order has been processing for ${order.hours_old}h`,
      severity: 'warning',
      actionType: 'navigate',
      actionLabel: 'Fulfill Now',
      actionLink: `/fulfillment?highlight=${order.id}`,
      contextData: JSON.stringify({ orderId: order.id, hoursOld: order.hours_old }),
    });
    if (id) created.push(id);
  }
  return created;
}

// ═══════════════════════════════════════════════════════════════════════
// NEW DETECTION RULES (Version 40)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Rule 12: First Login — Welcome Message
 * Event: auth.login
 * Fires only once per business, on the first-ever login
 */
function detectFirstLogin(db, businessId) {
  // Check if we already have a first_login message (one-time only)
  const existing = db.query(
    `SELECT COUNT(*) as count FROM novi_messages
     WHERE business_id = ? AND event_type = 'first_login'`
  ).get(businessId);

  if (existing.count > 0) return [];

  // Check if this business has ANY login audit entries (meaning it's not the first)
  const loginCount = db.query(
    `SELECT COUNT(*) as count FROM audit_log
     WHERE business_id = ? AND action_type = 'auth.login'`
  ).get(businessId).count;

  // Only fire on truly first login (0 or 1 prior entries; 1 because the current login triggers this)
  if (loginCount > 1) return [];

  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'first_login',
    title: 'Welcome to ShimmerStock! 👋',
    description: "I'm Novi — your business companion. Let's get your business set up and ready to grow.",
    severity: 'celebration',
    actionType: 'navigate',
    actionLabel: 'Start Setup',
    actionLink: '/hq?onboarding=1',
    contextData: JSON.stringify({ loginCount }),
  });
  return id ? [id] : [];
}

/**
 * Rule 13: Shopify Not Connected
 * Event: auth.login
 * Checks if business has no Shopify/Commerce connection
 */
function detectShopifyNotConnected(db, businessId) {
  const commerceCount = db.query(
    "SELECT COUNT(*) as count FROM provider_credentials WHERE business_id = ?"
  ).get(businessId).count;

  if (commerceCount > 0) return [];

  if (hasActiveMessage(db, businessId, 'shopify_not_connected', null)) return [];

  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'shopify_not_connected',
    title: 'Connect Your Store',
    description: 'Connect your Shopify store so I can import your products and orders automatically.',
    severity: 'info',
    actionType: 'navigate',
    actionLabel: 'Connect Shopify',
    actionLink: '/commerce',
    contextData: JSON.stringify({}),
  });
  return id ? [id] : [];
}

/**
 * Rule 14: Inventory Mismatch — Shopify vs ShimmerStock
 * Events: inventory.updated, commerce.products_synced
 * Compares Shopify inventory levels with ShimmerStock and flags discrepancies
 */
function detectInventoryMismatch(db, businessId) {
  // Find products that have both a shopify_product_id and differing stock levels
  let mismatches;
  try {
    mismatches = db.query(
      `SELECT p.id, p.name, p.sku, p.stock_count, 
              COALESCE(siv.shopify_quantity, p.stock_count) as shopify_qty
       FROM products p
       LEFT JOIN shopify_inventory_variants siv ON siv.product_id = p.id
       WHERE p.business_id = ? 
         AND p.shopify_product_id IS NOT NULL
         AND ABS(p.stock_count - COALESCE(siv.shopify_quantity, p.stock_count)) > 0
       LIMIT 10`
    ).all(businessId);
  } catch {
    // shopify_inventory_variants may not exist — try simpler approach
    try {
      mismatches = db.query(
        `SELECT p.id, p.name, p.sku, p.stock_count
         FROM products p
         WHERE p.business_id = ? 
           AND p.shopify_product_id IS NOT NULL
           AND p.shopify_stock IS NOT NULL
           AND p.stock_count != p.shopify_stock
         LIMIT 10`
      ).all(businessId);
    } catch {
      return [];
    }
  }

  if (!mismatches || mismatches.length === 0) return [];

  if (hasActiveMessage(db, businessId, 'inventory_mismatch', null)) return [];

  const count = mismatches.length;
  const names = mismatches.slice(0, 3).map(p => p.name).join(', ');
  const suffix = count > 3 ? ` and ${count - 3} more` : '';

  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'inventory_mismatch',
    title: 'Inventory Mismatch Detected',
    description: `${count} product(s) have different stock levels in ShimmerStock vs your store: ${names}${suffix}. Sync to fix.`,
    severity: 'warning',
    actionType: 'navigate',
    actionLabel: 'Review Inventory',
    actionLink: '/products',
    contextData: JSON.stringify({ productIds: mismatches.map(p => p.id), count }),
  });
  return id ? [id] : [];
}

/**
 * Rule 15: Delayed Orders — Orders past expected fulfillment dates
 * Events: order.created, periodic
 * Looks for orders with expected_delivery_date or ships_by date that has passed
 */
function detectDelayedOrders(db, businessId) {
  // Check orders with status in processing/pending that were created more than 48h ago
  // (different from fulfillment_deadlines which checks 24h)
  const delayedOrders = db.query(
    `SELECT id, order_number, customer_name, status, created_at,
            CAST(ROUND((JULIANDAY('now') - JULIANDAY(created_at)) * 24) AS INTEGER) as hours_old
     FROM orders
     WHERE business_id = ? 
       AND status IN ('processing', 'pending', 'confirmed')
       AND created_at < datetime('now', '-48 hours')
     ORDER BY created_at ASC`
  ).all(businessId);

  if (delayedOrders.length === 0) return [];

  const created = [];
  for (const order of delayedOrders) {
    const contextKey = `orderId:${order.id}`;
    if (hasActiveMessage(db, businessId, 'delayed_order', contextKey)) continue;

    const id = createMessageIfNeeded(db, businessId, {
      eventType: 'delayed_order',
      title: `⚠️ Delayed: Order #${order.order_number || order.id}`,
      description: `This order has been pending for ${order.hours_old}h — it may need urgent attention.`,
      severity: 'urgent',
      actionType: 'navigate',
      actionLabel: 'Review Order',
      actionLink: `/orders?highlight=${order.id}`,
      contextData: JSON.stringify({ orderId: order.id, hoursOld: order.hours_old }),
    });
    if (id) created.push(id);
  }
  return created;
}

/**
 * Rule 16: Returns Awaiting Processing
 * Events: periodic, order.status_changed
 * Orders with status indicating a return waiting to be processed
 */
function detectReturnsWaiting(db, businessId) {
  let returnOrders;
  try {
    returnOrders = db.query(
      `SELECT id, order_number, customer_name, status, created_at
       FROM orders
       WHERE business_id = ? 
         AND (status = 'returned' OR status = 'return_pending' OR status = 'refund_pending')
       ORDER BY created_at ASC`
    ).all(businessId);
  } catch {
    return [];
  }

  if (returnOrders.length === 0) return [];

  if (hasActiveMessage(db, businessId, 'returns_waiting', null)) return [];

  const orderList = returnOrders.map(o => `#${o.order_number || o.id}`).join(', ');
  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'returns_waiting',
    title: `${returnOrders.length} Return${returnOrders.length > 1 ? 's' : ''} Awaiting Processing`,
    description: `Orders need your attention: ${orderList}`,
    severity: 'warning',
    actionType: 'navigate',
    actionLabel: 'Process Returns',
    actionLink: '/orders?status=returned',
    contextData: JSON.stringify({ orderIds: returnOrders.map(o => o.id) }),
  });
  return id ? [id] : [];
}

/**
 * Rule 17: Order Milestones — 10th, 50th, 100th, 500th, 1000th order
 * Event: order.created
 * Celebrates business growth milestones
 */
function detectMilestoneCelebration(db, businessId) {
  const count = db.query(
    "SELECT COUNT(*) as count FROM orders WHERE business_id = ?"
  ).get(businessId).count;

  const milestones = [10, 50, 100, 500, 1000];
  const hitMilestone = milestones.find(m => count === m);

  if (!hitMilestone) return [];

  const eventType = `milestone_order_${hitMilestone}`;
  if (hasActiveMessage(db, businessId, eventType, null)) return [];

  const descriptions = {
    10: "You've reached 10 orders! Your business is gaining momentum.",
    50: "50 orders! You're building something real — keep going!",
    100: "💯 100 orders! That's a major milestone — you're doing amazing!",
    500: "500 orders! You've built a serious business. This is incredible!",
    1000: "🏆 1,000 orders! You're a force to be reckoned with. So proud of you!",
  };

  const id = createMessageIfNeeded(db, businessId, {
    eventType,
    title: `🎉 ${hitMilestone} Orders!`,
    description: descriptions[hitMilestone] || `${hitMilestone} orders and counting!`,
    severity: 'celebration',
    actionType: null,
    actionLabel: null,
    actionLink: null,
    contextData: JSON.stringify({ milestone: hitMilestone, totalOrders: count }),
  });
  return id ? [id] : [];
}

/**
 * Rule 18: Customer Follow-Up Detection
 * Events: periodic, order.status_changed
 *
 * Two sub-checks:
 *  a) Orders delivered 7+ days ago without any follow-up note
 *  b) Customers who haven't ordered in 60+ days but ordered 3+ times previously
 */
function detectCustomerFollowUp(db, businessId) {
  const created = [];

  // ── Check A: Delivered orders without follow-up ──
  let deliveredNoFollowup = [];
  try {
    deliveredNoFollowup = db.query(
      `SELECT o.id, o.order_number, o.customer_name, o.customer_email, o.created_at,
              CAST(ROUND(JULIANDAY('now') - JULIANDAY(o.created_at)) AS INTEGER) as days_ago
       FROM orders o
       WHERE o.business_id = ? AND o.status IN ('delivered', 'fulfilled')
         AND o.created_at < datetime('now', '-7 days')
         AND o.id NOT IN (
           SELECT DISTINCT cn.order_id FROM customer_notes cn WHERE cn.business_id = ? AND cn.order_id IS NOT NULL
         )
       ORDER BY o.created_at ASC
       LIMIT 10`
    ).all(businessId, businessId);
  } catch {
    return [];
  }

  for (const order of deliveredNoFollowup) {
    const contextKey = `followup_delivered:${order.id}`;
    if (hasActiveMessage(db, businessId, 'customer_followup', contextKey)) continue;

    const id = createMessageIfNeeded(db, businessId, {
      eventType: 'customer_followup',
      title: `Follow Up: ${order.customer_name || 'Customer'} — Order #${order.order_number || order.id}`,
      description: `Delivered ${order.days_ago}d ago. Send a follow-up to check satisfaction and encourage a repeat purchase.`,
      severity: 'opportunity',
      actionType: 'navigate',
      actionLabel: 'Draft Follow-up Email',
      actionLink: `/customers?email=${encodeURIComponent(order.customer_email || '')}`,
      contextData: JSON.stringify({ orderId: order.id, customerEmail: order.customer_email, daysAgo: order.days_ago }),
    });
    if (id) created.push(id);
  }

  // ── Check B: Lapsed repeat customers (60+ days, 3+ prior orders) ──
  try {
    const lapsedCustomers = db.query(
      `SELECT o.customer_email, o.customer_name,
              COUNT(o.id) as total_orders,
              MAX(o.created_at) as last_order_date,
              CAST(ROUND(JULIANDAY('now') - JULIANDAY(MAX(o.created_at))) AS INTEGER) as days_since_last
       FROM orders o
       WHERE o.business_id = ?
         AND o.customer_email IS NOT NULL
         AND o.customer_email != ''
       GROUP BY o.customer_email
       HAVING total_orders >= 3
          AND days_since_last >= 60
       ORDER BY days_since_last DESC
       LIMIT 10`
    ).all(businessId);

    for (const cust of lapsedCustomers) {
      const contextKey = `followup_lapsed:${cust.customer_email}`;
      if (hasActiveMessage(db, businessId, 'customer_followup', contextKey)) continue;

      const id = createMessageIfNeeded(db, businessId, {
        eventType: 'customer_followup',
        title: `Re-engage: ${cust.customer_name || cust.customer_email}`,
        description: `${cust.total_orders} previous orders — last purchase ${cust.days_since_last}d ago. A win-back offer could bring them back.`,
        severity: 'opportunity',
        actionType: 'navigate',
        actionLabel: 'Send Win-Back Offer',
        actionLink: `/customers?email=${encodeURIComponent(cust.customer_email)}`,
        contextData: JSON.stringify({ customerEmail: cust.customer_email, totalOrders: cust.total_orders, daysSinceLast: cust.days_since_last }),
      });
      if (id) created.push(id);
    }
  } catch (err) {
    console.error("[novi-detection] Customer follow-up lapsed check error:", err.message);
  }

  return created;
}

/**
 * Rule 19: Industry Not Configured
 * Event: auth.login
 * Condition: Business has onboardingCompleted = true but industry_config_id is NULL
 * Prompt user to pick an industry profile so labels match their business
 */
function detectIndustryNotConfigured(db, businessId) {
  // Check if onboarding is complete
  const settings = db.query(
    "SELECT bs.industry_config_id, bs.settings FROM business_settings bs WHERE bs.business_id = ?"
  ).get(businessId);

  if (!settings) return [];

  const config = JSON.parse(settings.settings || "{}");
  if (!config.onboardingCompleted) return [];

  // Industry config is already set
  if (settings.industry_config_id) return [];

  // Check deduplication
  if (hasActiveMessage(db, businessId, 'industry_not_configured', null)) return [];

  const id = createMessageIfNeeded(db, businessId, {
    eventType: 'industry_not_configured',
    title: '🏷️ Customize Your Workspace Labels',
    description: "I noticed your workspace is still using default labels. Want me to help you pick an industry profile? It'll rename things to match your business — like 'Products' becomes 'Candles' or 'Baked Goods'.",
    severity: 'info',
    actionType: 'navigate',
    actionLabel: 'Pick Industry Profile',
    actionLink: '/settings#industry',
    contextData: JSON.stringify({}),
  });
  return id ? [id] : [];
}

// ═══════════════════════════════════════════════════════════════════════
// INITIALIZATION — Subscribe to events
// ═══════════════════════════════════════════════════════════════════════

/**
 * Initialize the Novi Detection Engine.
 * Subscribes to the event bus and runs detection rules when events fire.
 * @param {import("bun:sqlite").Database} db
 */
export function initNoviDetection(db) {
  console.log("[novi-detection] Initializing detection engine...");

  const disposers = [];

  function subscribe(event, handler) {
    on(event, handler);
    disposers.push(() => off(event, handler));
  }

  // ── inventory.updated — Low Inventory + Out of Stock + Inventory Mismatch ──
  subscribe("inventory.updated", (payload) => {
    const bizId = payload?.businessId;
    if (!bizId) return;
    console.log(`[novi-detection] inventory.updated for business ${bizId}`);

    try {
      const r1 = detectLowInventory(db, bizId);
      const r2 = detectOutOfStock(db, bizId);
      const r14 = detectInventoryMismatch(db, bizId);
      if (r1.length || r2.length || r14.length) {
        console.log(`[novi-detection] inventory check: ${r1.length} low, ${r2.length} out of stock, ${r14.length} mismatch`);
      }
    } catch (err) {
      console.error("[novi-detection] inventory.updated error:", err.message);
    }
  });

  // ── order.created — Orders Combine, Split, First Sale, Fulfillment Deadline, Milestones, Delayed ──
  subscribe("order.created", (payload) => {
    const bizId = payload?.businessId;
    if (!bizId) return;
    console.log(`[novi-detection] order.created for business ${bizId}, order #${payload.orderNumber || payload.orderId}`);

    try {
      const r3 = detectOrdersCanCombine(db, bizId, payload);
      const r4 = detectOrderMayNeedSplit(db, bizId, payload);
      const r7 = detectFirstSale(db, bizId);
      const r11 = detectFulfillmentDeadlines(db, bizId);
      const r15 = detectDelayedOrders(db, bizId);
      const r17 = detectMilestoneCelebration(db, bizId);

      const total = r3.length + r4.length + r7.length + r11.length + r15.length + r17.length;
      if (total > 0) {
        console.log(`[novi-detection] order.created generated ${total} message(s)`);
      }
    } catch (err) {
      console.error("[novi-detection] order.created error:", err.message);
    }
  });

  // ── auth.login — Setup Incomplete, First Login, Shopify Not Connected, Industry Not Configured ──
  subscribe("auth.login", (payload) => {
    const bizId = payload?.businessId;
    if (!bizId) return;
    console.log(`[novi-detection] auth.login for business ${bizId}`);

    try {
      const r9 = detectSetupIncomplete(db, bizId);
      const r12 = detectFirstLogin(db, bizId);
      const r13 = detectShopifyNotConnected(db, bizId);
      const r19 = detectIndustryNotConfigured(db, bizId);
      if (r9.length || r12.length || r13.length || r19.length) {
        console.log(`[novi-detection] login checks: ${r9.length} setup, ${r12.length} first-login, ${r13.length} shopify-not-connected, ${r19.length} industry-not-configured`);
      }
    } catch (err) {
      console.error("[novi-detection] auth.login error:", err.message);
    }
  });

  // ── product.created / commerce.products_synced — Missing SKUs, Duplicate SKUs, Inventory Mismatch ──
  const handleProductSync = (payload) => {
    const bizId = payload?.businessId;
    if (!bizId) return;
    console.log(`[novi-detection] product sync for business ${bizId}`);

    try {
      const r5 = detectMissingSKUs(db, bizId);
      const r6 = detectDuplicateSKUs(db, bizId);
      const r14 = detectInventoryMismatch(db, bizId);
      if (r5.length || r6.length || r14.length) {
        console.log(`[novi-detection] SKU check: ${r5.length} missing, ${r6.length} duplicate, ${r14.length} mismatch`);
      }
    } catch (err) {
      console.error("[novi-detection] product sync error:", err.message);
    }
  };

  subscribe("product.created", handleProductSync);
  subscribe("commerce.products_synced", handleProductSync);

  // ── warehouse.order_shipped — First Shipment Milestone ────────
  subscribe("warehouse.order_shipped", (payload) => {
    const bizId = payload?.businessId;
    if (!bizId) return;
    console.log(`[novi-detection] warehouse.order_shipped for business ${bizId}`);

    try {
      const r8 = detectFirstShipment(db, bizId);
      if (r8.length) {
        console.log(`[novi-detection] first shipment milestone detected!`);
      }
    } catch (err) {
      console.error("[novi-detection] warehouse.order_shipped error:", err.message);
    }
  });

  // ── fulfillment.shipment_created — First Shipment Milestone ───
  subscribe("fulfillment.shipment_created", (payload) => {
    const bizId = payload?.businessId;
    if (!bizId) return;
    console.log(`[novi-detection] fulfillment.shipment_created for business ${bizId}`);

    try {
      const r8 = detectFirstShipment(db, bizId);
      if (r8.length) {
        console.log(`[novi-detection] first shipment milestone detected!`);
      }
    } catch (err) {
      console.error("[novi-detection] fulfillment.shipment_created error:", err.message);
    }
  });

  // ── partner.application_submitted — Affiliate Applications ────
  subscribe("partner.application_submitted", (payload) => {
    const bizId = payload?.businessId;
    if (!bizId) return;
    console.log(`[novi-detection] partner.application_submitted for business ${bizId}`);

    try {
      const r10 = detectAffiliateApplications(db, bizId);
      if (r10.length) {
        console.log(`[novi-detection] affiliate applications: ${r10.length} message(s)`);
      }
    } catch (err) {
      console.error("[novi-detection] partner.application_submitted error:", err.message);
    }
  });

  // ── order.status_changed — Returns Waiting + Customer Follow-Up ────
  subscribe("order.status_changed", (payload) => {
    const bizId = payload?.businessId;
    if (!bizId) return;
    console.log(`[novi-detection] order.status_changed for business ${bizId}`);

    try {
      const r16 = detectReturnsWaiting(db, bizId);
      const r18 = detectCustomerFollowUp(db, bizId);
      if (r16.length || r18.length) {
        console.log(`[novi-detection] status changed: ${r16.length} returns waiting, ${r18.length} customer follow-ups`);
      }
    } catch (err) {
      console.error("[novi-detection] order.status_changed error:", err.message);
    }
  });

  console.log("[novi-detection] Detection engine initialized — listening for events");

  // ── Startup scan: run all checks once after a 30s delay ──────────
  const startupTimer = setTimeout(() => {
    try {
      const businesses = db.query("SELECT id FROM businesses").all();
      console.log(`[novi-detection] Running startup scan for ${businesses.length} businesses...`);
      for (const biz of businesses) {
        try {
          console.log(`[novi-detection] Running startup scan for business ${biz.id}...`);
          runAllChecks(db, biz.id);
        } catch (err) {
          console.error(`[novi-detection] Startup scan error for business ${biz.id}:`, err.message);
        }
      }
      console.log("[novi-detection] Startup scan complete");
    } catch (err) {
      console.error("[novi-detection] Startup scan error:", err.message);
    }
  }, 30000);

  // ── Periodic scan: run all checks every 10 minutes ──────────────
  const periodicTimer = setInterval(() => {
    try {
      const businesses = db.query("SELECT id FROM businesses").all();
      let totalMessages = 0;
      for (const biz of businesses) {
        try {
          const results = runAllChecks(db, biz.id);
          totalMessages += results.reduce((sum, r) => sum + r.created, 0);
        } catch (err) {
          console.error(`[novi-detection] Periodic scan error for business ${biz.id}:`, err.message);
        }
      }
      console.log(`[novi-detection] Periodic scan complete: ${businesses.length} businesses checked, ${totalMessages} total messages created`);
    } catch (err) {
      console.error("[novi-detection] Periodic scan error:", err.message);
    }
  }, 10 * 60 * 1000);

  return () => {
    clearTimeout(startupTimer);
    clearInterval(periodicTimer);
    for (const dispose of disposers.splice(0).reverse()) {
      dispose();
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORT: Run all checks for manual/periodic invocation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Run all detection rules for a given business.
 * Useful for periodic checks (cron) or manual triggering.
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @returns {{ rule: string, created: number }[]}
 */
export function runAllChecks(db, businessId) {
  const results = [];

  const rules = [
    { name: 'low_inventory', fn: detectLowInventory },
    { name: 'out_of_stock', fn: detectOutOfStock },
    { name: 'missing_skus', fn: detectMissingSKUs },
    { name: 'duplicate_skus', fn: detectDuplicateSKUs },
    { name: 'first_sale', fn: detectFirstSale },
    { name: 'first_shipment', fn: detectFirstShipment },
    { name: 'setup_incomplete', fn: detectSetupIncomplete },
    { name: 'affiliate_application', fn: detectAffiliateApplications },
    { name: 'fulfillment_deadline', fn: detectFulfillmentDeadlines },
    { name: 'first_login', fn: detectFirstLogin },
    { name: 'shopify_not_connected', fn: detectShopifyNotConnected },
    { name: 'inventory_mismatch', fn: detectInventoryMismatch },
    { name: 'delayed_order', fn: detectDelayedOrders },
    { name: 'returns_waiting', fn: detectReturnsWaiting },
    { name: 'milestone_celebration', fn: detectMilestoneCelebration },
    { name: 'customer_followup', fn: detectCustomerFollowUp },
    { name: 'industry_not_configured', fn: detectIndustryNotConfigured },
  ];

  for (const rule of rules) {
    try {
      const created = rule.fn(db, businessId);
      results.push({ rule: rule.name, created: created.length });
    } catch (err) {
      console.error(`[novi-detection] ${rule.name} error:`, err.message);
      results.push({ rule: rule.name, created: 0, error: err.message });
    }
  }

  return results;
}
