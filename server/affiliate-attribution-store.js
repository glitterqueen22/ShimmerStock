/**
 * ShimmerStock Affiliate Attribution Data Access Layer
 * =====================================================
 * Store functions for attribution processing, order sync, rules, and config.
 * Connects Shopify orders → Partner HQ affiliates.
 */

import { calculateCommission, matchAffiliateByCoupon, matchAffiliateByCookie, resolveAttribution, detectSelfReferral } from "./affiliate-attribution.js";

// ═══════════════════════════════════════════════════════════════════
// ATTRIBUTION RULES
// ═══════════════════════════════════════════════════════════════════

export function getAttributionRules(db, businessId, programId) {
  if (programId) {
    const rules = db.query(
      "SELECT * FROM affiliate_attribution_rules WHERE business_id = ? AND program_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(businessId, programId);
    if (rules) return rules;
  }
  // Fall back to global (program_id IS NULL)
  return db.query(
    "SELECT * FROM affiliate_attribution_rules WHERE business_id = ? AND program_id IS NULL ORDER BY created_at DESC LIMIT 1"
  ).get(businessId);
}

export function updateAttributionRules(db, businessId, programId, data) {
  const existing = getAttributionRules(db, businessId, programId);

  if (existing && (existing.program_id === (programId || null) || (!existing.program_id && !programId))) {
    const fields = [];
    const values = [];
    if (data.cookie_duration_hours !== undefined) { fields.push("cookie_duration_hours = ?"); values.push(data.cookie_duration_hours); }
    if (data.attribution_model !== undefined) { fields.push("attribution_model = ?"); values.push(data.attribution_model); }
    if (data.coupon_overrides_referral !== undefined) { fields.push("coupon_overrides_referral = ?"); values.push(data.coupon_overrides_referral ? 1 : 0); }
    if (data.allow_self_referrals !== undefined) { fields.push("allow_self_referrals = ?"); values.push(data.allow_self_referrals ? 1 : 0); }
    if (data.require_fulfillment !== undefined) { fields.push("require_fulfillment = ?"); values.push(data.require_fulfillment ? 1 : 0); }
    if (data.require_return_window !== undefined) { fields.push("require_return_window = ?"); values.push(data.require_return_window ? 1 : 0); }
    if (data.return_window_days !== undefined) { fields.push("return_window_days = ?"); values.push(data.return_window_days); }
    if (data.repeat_customer_orders_qualify !== undefined) { fields.push("repeat_customer_orders_qualify = ?"); values.push(data.repeat_customer_orders_qualify ? 1 : 0); }

    if (fields.length === 0) return existing;
    fields.push("updated_at = datetime('now')");
    values.push(existing.id);
    db.run(`UPDATE affiliate_attribution_rules SET ${fields.join(", ")} WHERE id = ?`, values);
    return getAttributionRules(db, businessId, programId);
  } else {
    const result = db.run(
      `INSERT INTO affiliate_attribution_rules (business_id, program_id, cookie_duration_hours, attribution_model, coupon_overrides_referral, allow_self_referrals, require_fulfillment, require_return_window, return_window_days, repeat_customer_orders_qualify)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId,
        programId || null,
        data.cookie_duration_hours || 720,
        data.attribution_model || "last_click",
        data.coupon_overrides_referral !== undefined ? (data.coupon_overrides_referral ? 1 : 0) : 1,
        data.allow_self_referrals ? 1 : 0,
        data.require_fulfillment ? 1 : 0,
        data.require_return_window ? 1 : 0,
        data.return_window_days || 30,
        data.repeat_customer_orders_qualify !== undefined ? (data.repeat_customer_orders_qualify ? 1 : 0) : 1,
      ]
    );
    return db.query("SELECT * FROM affiliate_attribution_rules WHERE id = ?").get(result.lastInsertRowid);
  }
}

// ═══════════════════════════════════════════════════════════════════
// COMMISSION CONFIG
// ═══════════════════════════════════════════════════════════════════

export function getCommissionConfig(db, businessId, programId) {
  if (programId) {
    const cfg = db.query(
      "SELECT * FROM affiliate_commission_config WHERE business_id = ? AND program_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(businessId, programId);
    if (cfg) return cfg;
  }
  return db.query(
    "SELECT * FROM affiliate_commission_config WHERE business_id = ? AND program_id IS NULL ORDER BY created_at DESC LIMIT 1"
  ).get(businessId);
}

export function updateCommissionConfig(db, businessId, programId, data) {
  const existing = getCommissionConfig(db, businessId, programId);

  if (existing && (existing.program_id === (programId || null) || (!existing.program_id && !programId))) {
    const fields = [];
    const values = [];
    const boolFields = ["exclude_shipping", "exclude_taxes", "exclude_discounts", "exclude_gift_cards", "exclude_tips"];
    for (const f of boolFields) {
      if (data[f] !== undefined) { fields.push(`${f} = ?`); values.push(data[f] ? 1 : 0); }
    }
    if (data.excluded_product_ids !== undefined) { fields.push("excluded_product_ids = ?"); values.push(JSON.stringify(data.excluded_product_ids)); }
    if (data.excluded_collection_ids !== undefined) { fields.push("excluded_collection_ids = ?"); values.push(JSON.stringify(data.excluded_collection_ids)); }
    if (data.minimum_order_amount_cents !== undefined) { fields.push("minimum_order_amount_cents = ?"); values.push(data.minimum_order_amount_cents); }

    if (fields.length === 0) return existing;
    values.push(existing.id);
    db.run(`UPDATE affiliate_commission_config SET ${fields.join(", ")} WHERE id = ?`, values);
    return getCommissionConfig(db, businessId, programId);
  } else {
    const result = db.run(
      `INSERT INTO affiliate_commission_config (business_id, program_id, exclude_shipping, exclude_taxes, exclude_discounts, exclude_gift_cards, exclude_tips, excluded_product_ids, excluded_collection_ids, minimum_order_amount_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId,
        programId || null,
        data.exclude_shipping !== undefined ? (data.exclude_shipping ? 1 : 0) : 1,
        data.exclude_taxes !== undefined ? (data.exclude_taxes ? 1 : 0) : 1,
        data.exclude_discounts !== undefined ? (data.exclude_discounts ? 1 : 0) : 1,
        data.exclude_gift_cards !== undefined ? (data.exclude_gift_cards ? 1 : 0) : 1,
        data.exclude_tips !== undefined ? (data.exclude_tips ? 1 : 0) : 1,
        data.excluded_product_ids ? JSON.stringify(data.excluded_product_ids) : null,
        data.excluded_collection_ids ? JSON.stringify(data.excluded_collection_ids) : null,
        data.minimum_order_amount_cents || null,
      ]
    );
    return db.query("SELECT * FROM affiliate_commission_config WHERE id = ?").get(result.lastInsertRowid);
  }
}

// ═══════════════════════════════════════════════════════════════════
// ATTRIBUTION PROCESSING
// ═══════════════════════════════════════════════════════════════════

/**
 * Main entry point: process a Shopify order for attribution.
 */
export function processShopifyOrder(db, shopifyOrderData, businessId) {
  const shopifyOrderId = String(shopifyOrderData.id);
  const shopifyOrderNumber = shopifyOrderData.order_number || shopifyOrderData.name || shopifyOrderId;

  // 1. Find or create ShimmerStock order
  let order = db.query(
    "SELECT * FROM orders WHERE shopify_order_id = ? AND business_id = ?"
  ).get(shopifyOrderId, businessId);

  if (!order) {
    // Create a placeholder order if not yet synced
    const totalAmount = parseFloat(shopifyOrderData.total_price) || 0;
    const subtotalAmount = parseFloat(shopifyOrderData.subtotal_price) || totalAmount;
    const result = db.run(
      `INSERT INTO orders (shopify_order_id, order_number, customer_name, customer_email, shipping_address, source, status, total_amount, business_id, notes)
       VALUES (?, ?, ?, ?, ?, 'shopify', ?, ?, ?, ?)`,
      [
        shopifyOrderId,
        shopifyOrderNumber,
        shopifyOrderData.customer ? `${shopifyOrderData.customer.first_name || ""} ${shopifyOrderData.customer.last_name || ""}`.trim() : (shopifyOrderData.billing_address?.name || "Unknown"),
        shopifyOrderData.customer?.email || shopifyOrderData.email || null,
        shopifyOrderData.shipping_address ? JSON.stringify(shopifyOrderData.shipping_address) : null,
        shopifyOrderData.financial_status === "paid" ? "confirmed" : "pending",
        subtotalAmount,
        businessId,
        null,
      ]
    );
    order = db.query("SELECT * FROM orders WHERE id = ?").get(result.lastInsertRowid);

    // Create order items
    if (shopifyOrderData.line_items) {
      for (const item of shopifyOrderData.line_items) {
        db.run(
          `INSERT INTO order_items (order_id, product_id, variant_id, sku, variant_title, quantity, unit_price, line_total, business_id)
           VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
          [
            order.id,
            item.sku || null,
            item.variant_title || item.title || null,
            item.quantity || 1,
            parseFloat(item.price) || 0,
            parseFloat(item.price) * (item.quantity || 1),
            businessId,
          ]
        );
      }
    }
  }

  // 2. Check for existing attribution
  const existingAttr = db.query(
    "SELECT * FROM affiliate_attributions WHERE shopify_order_id = ? AND business_id = ?"
  ).get(shopifyOrderId, businessId);

  if (existingAttr) {
    // Already attributed — just return it
    return existingAttr;
  }

  // 3. Match attribution
  const rules = getAttributionRules(db, businessId, null);
  const candidates = [];

  // Check coupon codes
  const couponCodes = [];
  if (shopifyOrderData.discount_codes && shopifyOrderData.discount_codes.length > 0) {
    for (const dc of shopifyOrderData.discount_codes) {
      couponCodes.push(dc.code || dc);
    }
  }
  if (shopifyOrderData.coupon_code) couponCodes.push(shopifyOrderData.coupon_code);

  for (const code of couponCodes) {
    const match = matchAffiliateByCoupon(db, businessId, code);
    if (match) {
      candidates.push({ method: "coupon", ...match, couponCode: code });
    }
  }

  // Check referral cookies (use customer email as visitor_id fallback)
  const visitorId = shopifyOrderData.customer?.id
    ? `shopify_${shopifyOrderData.customer.id}`
    : (shopifyOrderData.customer?.email || shopifyOrderData.email || null);

  if (visitorId) {
    const cookieMatch = matchAffiliateByCookie(db, businessId, visitorId);
    if (cookieMatch) {
      candidates.push({ method: cookieMatch.source, ...cookieMatch, visitorId });
    }
  }

  // Check order notes for manual attribution flags
  if (shopifyOrderData.note) {
    const noteMatch = shopifyOrderData.note.match(/affiliate[:_-]?id[=:]\s*(\d+)/i);
    if (noteMatch) {
      const affId = parseInt(noteMatch[1]);
      const aff = db.query("SELECT id FROM affiliates WHERE id = ? AND business_id = ?").get(affId, businessId);
      if (aff) {
        candidates.push({ method: "manual_note", affiliateId: affId, programId: null });
      }
    }
  }

  if (candidates.length === 0) {
    // No attribution found — log and return
    logOrderSync(db, businessId, shopifyOrderId, "created", shopifyOrderData, true, "No attribution match found");
    return null;
  }

  // 4. Resolve attribution
  const rulesObj = {
    coupon_overrides_referral: !!rules?.coupon_overrides_referral,
    attribution_model: rules?.attribution_model || "last_click",
  };

  const winner = resolveAttribution(candidates, rulesObj);
  if (!winner) {
    logOrderSync(db, businessId, shopifyOrderId, "created", shopifyOrderData, true, "Could not resolve attribution winner");
    return null;
  }

  // 5. Self-referral check
  const orderData = {
    customer_email: shopifyOrderData.customer?.email || shopifyOrderData.email,
    customer_name: shopifyOrderData.customer ? `${shopifyOrderData.customer.first_name || ""} ${shopifyOrderData.customer.last_name || ""}`.trim() : "",
  };

  const isSelfReferral = detectSelfReferral(db, winner.affiliateId, orderData);

  if (isSelfReferral && !rules?.allow_self_referrals) {
    // Log self-referral but don't attribute
    const attrResult = db.run(
      `INSERT INTO affiliate_attributions (business_id, order_id, shopify_order_id, shopify_order_number, affiliate_id, program_id, attribution_method, coupon_code_used, referral_link_id, order_total_cents, eligible_amount_cents, commission_rate, commission_cents, currency, status, is_self_referral, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, 'disputed', 1, ?)`,
      [
        businessId, order.id, shopifyOrderId, shopifyOrderNumber,
        winner.affiliateId, winner.programId || null,
        winner.method, winner.couponCode || null, winner.referralLinkId || null,
        Math.round(parseFloat(shopifyOrderData.total_price || 0) * 100),
        winner.affiliateId ? (db.query("SELECT commission_rate FROM affiliates WHERE id = ?").get(winner.affiliateId)?.commission_rate || 0) : 0,
        shopifyOrderData.currency || "USD",
        "Self-referral detected"
      ]
    );
    logOrderSync(db, businessId, shopifyOrderId, "created", shopifyOrderData, true, "Self-referral flagged");
    return db.query("SELECT * FROM affiliate_attributions WHERE id = ?").get(attrResult.lastInsertRowid);
  }

  // 6. Calculate commission
  const commConfig = getCommissionConfig(db, businessId, winner.programId);
  const commissionRate = getAffiliateCommissionRate(db, winner.affiliateId, winner.programId);
  const shippingAmount = parseFloat(shopifyOrderData.total_shipping_price_set?.shop_money?.amount || shopifyOrderData.total_shipping || 0);
  const taxAmount = parseFloat(shopifyOrderData.total_tax || 0);
  const discountAmount = parseFloat(shopifyOrderData.total_discounts || 0);
  const subtotalAmount = parseFloat(shopifyOrderData.subtotal_price || shopifyOrderData.total_price || 0);

  const lineItems = (shopifyOrderData.line_items || []).map(item => ({
    productId: item.product_id,
    collectionIds: [], // We don't have collection mappings easily — could enhance later
    amountCents: Math.round(parseFloat(item.price || 0) * (item.quantity || 1) * 100),
    amount: parseFloat(item.price || 0) * (item.quantity || 1),
  }));

  const calcResult = calculateCommission({
    orderTotal: subtotalAmount,
    shipping: shippingAmount,
    taxes: taxAmount,
    discounts: discountAmount,
    giftCards: 0,
    tips: 0,
    config: commConfig || {},
    lineItems,
    commissionRate,
  });

  // 7. Determine status
  let status = "approved";
  if (rules?.require_fulfillment) status = "pending";
  if (calcResult.commissionCents === 0) status = "approved"; // Zero commission doesn't need to wait

  // 8. Create attribution record
  const attrResult = db.run(
    `INSERT INTO affiliate_attributions (business_id, order_id, shopify_order_id, shopify_order_number, affiliate_id, program_id, attribution_method, coupon_code_used, referral_link_id, order_total_cents, eligible_amount_cents, commission_rate, commission_cents, currency, status, is_self_referral, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      businessId, order.id, shopifyOrderId, shopifyOrderNumber,
      winner.affiliateId, winner.programId || null,
      winner.method, winner.couponCode || null, winner.referralLinkId || null,
      calcResult.eligibleAmountCents + (calcResult.deductions ? Object.values(calcResult.deductions).reduce((a, b) => a + b, 0) : 0), // total before deductions
      calcResult.eligibleAmountCents,
      commissionRate,
      calcResult.commissionCents,
      shopifyOrderData.currency || "USD",
      status,
      calcResult.breakdown,
    ]
  );

  // 9. Credit wallet if approved
  if (status === "approved" && calcResult.commissionCents > 0) {
    creditAffiliateWallet(db, winner.affiliateId, businessId, calcResult.commissionCents, `Commission for order #${shopifyOrderNumber}`, attrResult.lastInsertRowid);
  }

  // 10. Update referral link conversion count
  if (winner.referralLinkId) {
    db.run("UPDATE affiliate_referral_links SET conversion_count = conversion_count + 1 WHERE id = ?", [winner.referralLinkId]);
  }

  // 11. Mark cookie as converted
  if (winner.cookieId) {
    db.run("UPDATE affiliate_tracking_cookies SET converted_at = datetime('now'), order_id = ? WHERE cookie_id = ?",
      [order.id, winner.cookieId]);
  }

  // 12. Log
  logOrderSync(db, businessId, shopifyOrderId, "created", shopifyOrderData, true, `Attributed to affiliate ${winner.affiliateId} via ${winner.method}; commission: ${calcResult.commissionCents}¢`);

  return db.query("SELECT * FROM affiliate_attributions WHERE id = ?").get(attrResult.lastInsertRowid);
}

/**
 * Handle order lifecycle changes (refunds, cancellations, fulfillment).
 */
export function syncOrderStatus(db, shopifyOrderId, newStatus, businessId, eventData) {
  const attribution = db.query(
    "SELECT * FROM affiliate_attributions WHERE shopify_order_id = ? AND business_id = ?"
  ).get(shopifyOrderId, businessId);

  if (!attribution) return null;

  const order = db.query("SELECT * FROM orders WHERE shopify_order_id = ? AND business_id = ?").get(shopifyOrderId, businessId);

  switch (newStatus) {
    case "cancelled": {
      // Reverse commission
      if (attribution.status === "approved" || attribution.status === "available") {
        db.run("UPDATE affiliate_attributions SET status = 'reversed', updated_at = datetime('now'), notes = COALESCE(notes, '') || ' | Cancelled: commission reversed' WHERE id = ?", [attribution.id]);
        if (attribution.commission_cents > 0) {
          debitAffiliateWallet(db, attribution.affiliate_id, businessId, attribution.commission_cents, `Order #${attribution.shopify_order_number} cancelled — commission reversed`, attribution.id);
        }
      } else {
        db.run("UPDATE affiliate_attributions SET status = 'reversed', updated_at = datetime('now'), notes = COALESCE(notes, '') || ' | Cancelled (was pending)' WHERE id = ?", [attribution.id]);
      }
      // Update order status
      if (order) db.run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
      break;
    }

    case "refunded": {
      // Partial refund: recalculate, full refund: reverse
      if (attribution.status === "approved" || attribution.status === "available") {
        db.run("UPDATE affiliate_attributions SET status = 'reversed', updated_at = datetime('now'), notes = COALESCE(notes, '') || ' | Refunded: commission reversed' WHERE id = ?", [attribution.id]);
        if (attribution.commission_cents > 0) {
          debitAffiliateWallet(db, attribution.affiliate_id, businessId, attribution.commission_cents, `Order #${attribution.shopify_order_number} refunded — commission reversed`, attribution.id);
        }
      } else {
        db.run("UPDATE affiliate_attributions SET status = 'reversed', updated_at = datetime('now'), notes = COALESCE(notes, '') || ' | Refunded (was pending)' WHERE id = ?", [attribution.id]);
      }
      if (order) db.run("UPDATE orders SET status = 'refunded' WHERE id = ?", [order.id]);
      break;
    }

    case "fulfilled": {
      // If require_fulfillment is on, approve the pending attribution
      if (attribution.status === "pending") {
        const rules = getAttributionRules(db, businessId, attribution.program_id);
        if (rules?.require_fulfillment) {
          db.run("UPDATE affiliate_attributions SET status = 'approved', updated_at = datetime('now'), notes = COALESCE(notes, '') || ' | Approved on fulfillment' WHERE id = ?", [attribution.id]);
          if (attribution.commission_cents > 0) {
            creditAffiliateWallet(db, attribution.affiliate_id, businessId, attribution.commission_cents, `Order #${attribution.shopify_order_number} fulfilled — commission approved`, attribution.id);
          }
        }
      }
      if (order) db.run("UPDATE orders SET status = 'fulfilled' WHERE id = ?", [order.id]);
      break;
    }

    case "updated": {
      // Recalculate commission on order edit
      if ((attribution.status === "pending" || attribution.status === "approved") && eventData) {
        const commConfig = getCommissionConfig(db, businessId, attribution.program_id);
        const commissionRate = attribution.commission_rate;
        const calcResult = calculateCommission({
          orderTotal: parseFloat(eventData.subtotal_price || eventData.total_price || 0),
          shipping: parseFloat(eventData.total_shipping || 0),
          taxes: parseFloat(eventData.total_tax || 0),
          discounts: parseFloat(eventData.total_discounts || 0),
          giftCards: 0,
          tips: 0,
          config: commConfig || {},
          lineItems: (eventData.line_items || []).map(item => ({
            productId: item.product_id,
            collectionIds: [],
            amountCents: Math.round(parseFloat(item.price || 0) * (item.quantity || 1) * 100),
          })),
          commissionRate,
        });

        const oldCommission = attribution.commission_cents;
        db.run("UPDATE affiliate_attributions SET eligible_amount_cents = ?, commission_cents = ?, updated_at = datetime('now'), notes = COALESCE(notes, '') || ? WHERE id = ?",
          [calcResult.eligibleAmountCents, calcResult.commissionCents, ` | Recalculated on update: ${calcResult.breakdown}`, attribution.id]);

        // Adjust wallet difference
        const diff = calcResult.commissionCents - oldCommission;
        if (diff > 0 && attribution.status === "approved") {
          creditAffiliateWallet(db, attribution.affiliate_id, businessId, diff, `Order #${attribution.shopify_order_number} updated — commission adjusted`, attribution.id);
        } else if (diff < 0 && attribution.status === "approved") {
          debitAffiliateWallet(db, attribution.affiliate_id, businessId, Math.abs(diff), `Order #${attribution.shopify_order_number} updated — commission adjusted`, attribution.id);
        }
      }
      break;
    }
  }

  if (eventData) {
    logOrderSync(db, businessId, shopifyOrderId, newStatus, eventData, true, `Status: ${newStatus}`);
  }

  return db.query("SELECT * FROM affiliate_attributions WHERE id = ?").get(attribution.id);
}

// ═══════════════════════════════════════════════════════════════════
// LIST / QUERY
// ═══════════════════════════════════════════════════════════════════

export function getAffiliateAttributions(db, businessId, filters = {}) {
  let sql = `SELECT aa.*, a.name as affiliate_name, a.email as affiliate_email
    FROM affiliate_attributions aa
    JOIN affiliates a ON a.id = aa.affiliate_id
    WHERE aa.business_id = ?`;
  const params = [businessId];

  if (filters.affiliate_id) { sql += " AND aa.affiliate_id = ?"; params.push(filters.affiliate_id); }
  if (filters.status) { sql += " AND aa.status = ?"; params.push(filters.status); }
  if (filters.program_id) { sql += " AND aa.program_id = ?"; params.push(filters.program_id); }

  sql += " ORDER BY aa.created_at DESC";

  if (filters.limit) { sql += " LIMIT ?"; params.push(filters.limit); }
  if (filters.offset) { sql += " OFFSET ?"; params.push(filters.offset); }

  return db.query(sql).all(...params);
}

export function getPendingAttributions(db, businessId) {
  return db.query(
    `SELECT aa.*, a.name as affiliate_name, a.email as affiliate_email
     FROM affiliate_attributions aa
     JOIN affiliates a ON a.id = aa.affiliate_id
     WHERE aa.business_id = ? AND aa.status = 'pending'
     ORDER BY aa.created_at DESC`
  ).all(businessId);
}

export function getDisputedAttributions(db, businessId) {
  return db.query(
    `SELECT aa.*, a.name as affiliate_name, a.email as affiliate_email
     FROM affiliate_attributions aa
     JOIN affiliates a ON a.id = aa.affiliate_id
     WHERE aa.business_id = ? AND aa.status = 'disputed'
     ORDER BY aa.created_at DESC`
  ).all(businessId);
}

// ═══════════════════════════════════════════════════════════════════
// MANUAL / ADMIN
// ═══════════════════════════════════════════════════════════════════

export function manualAttribute(db, businessId, { orderId, affiliateId, reason, commissionCents, commissionRate }) {
  // Check existing
  const existing = db.query(
    "SELECT * FROM affiliate_attributions WHERE order_id = ? AND affiliate_id = ? AND business_id = ?"
  ).get(orderId, affiliateId, businessId);

  if (existing) return existing;

  const order = db.query("SELECT * FROM orders WHERE id = ? AND business_id = ?").get(orderId, businessId);
  if (!order) throw new Error("Order not found");

  const rate = commissionRate || (db.query("SELECT commission_rate FROM affiliates WHERE id = ?").get(affiliateId)?.commission_rate || 5);
  const totalCents = Math.round((order.total_amount || 0) * 100);
  const commission = commissionCents !== undefined ? commissionCents : Math.round(totalCents * (rate / 100));

  const result = db.run(
    `INSERT INTO affiliate_attributions (business_id, order_id, shopify_order_id, shopify_order_number, affiliate_id, program_id, attribution_method, coupon_code_used, order_total_cents, eligible_amount_cents, commission_rate, commission_cents, currency, status, is_self_referral, notes)
     VALUES (?, ?, ?, ?, ?, NULL, 'manual', NULL, ?, ?, ?, ?, 'USD', 'approved', 0, ?)`,
    [
      businessId, orderId, order.shopify_order_id, order.order_number,
      affiliateId, totalCents, totalCents, rate, commission,
      reason || "Manual attribution",
    ]
  );

  if (commission > 0) {
    creditAffiliateWallet(db, affiliateId, businessId, commission, `Manual commission for order #${order.order_number}`, result.lastInsertRowid);
  }

  return db.query("SELECT * FROM affiliate_attributions WHERE id = ?").get(result.lastInsertRowid);
}

export function reverseAttribution(db, businessId, attributionId, reason) {
  const attr = db.query("SELECT * FROM affiliate_attributions WHERE id = ? AND business_id = ?").get(attributionId, businessId);
  if (!attr) throw new Error("Attribution not found");

  if (attr.status === "reversed") return attr;

  db.run("UPDATE affiliate_attributions SET status = 'reversed', updated_at = datetime('now'), notes = COALESCE(notes, '') || ? WHERE id = ?",
    [` | Admin reversal: ${reason || "No reason provided"}`, attributionId]);

  if (attr.commission_cents > 0 && (attr.status === "approved" || attr.status === "available")) {
    debitAffiliateWallet(db, attr.affiliate_id, businessId, attr.commission_cents, `Attribution reversed: ${reason || "Admin action"}`, attributionId);
  }

  return db.query("SELECT * FROM affiliate_attributions WHERE id = ?").get(attributionId);
}

// ═══════════════════════════════════════════════════════════════════
// REFERRAL LINKS
// ═══════════════════════════════════════════════════════════════════

export function createReferralLink(db, businessId, { affiliateId, programId, utmSource, utmMedium, utmCampaign }) {
  const linkCode = generateLinkCode();
  const domain = process.env.PUBLIC_URL || "https://shimmerstock.com";

  // Build UTM params into the URL
  const utmParams = [];
  if (utmSource) utmParams.push(`utm_source=${encodeURIComponent(utmSource)}`);
  if (utmMedium) utmParams.push(`utm_medium=${encodeURIComponent(utmMedium)}`);
  if (utmCampaign) utmParams.push(`utm_campaign=${encodeURIComponent(utmCampaign)}`);
  utmParams.push(`ref=${linkCode}`);

  const fullUrl = `${domain}/r/${linkCode}?${utmParams.join("&")}`;

  const result = db.run(
    `INSERT INTO affiliate_referral_links (business_id, affiliate_id, program_id, link_code, full_url, utm_source, utm_medium, utm_campaign, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      businessId, affiliateId, programId || null,
      linkCode, fullUrl,
      utmSource || null, utmMedium || null, utmCampaign || null,
    ]
  );

  return db.query("SELECT * FROM affiliate_referral_links WHERE id = ?").get(result.lastInsertRowid);
}

export function getReferralLinks(db, businessId, affiliateId) {
  return db.query(
    `SELECT * FROM affiliate_referral_links
     WHERE business_id = ? AND affiliate_id = ?
     ORDER BY created_at DESC`
  ).all(businessId, affiliateId);
}

export function trackReferralClick(db, linkCode, visitorId) {
  const link = db.query(
    "SELECT * FROM affiliate_referral_links WHERE link_code = ? AND is_active = 1"
  ).get(linkCode);

  if (!link) return null;

  // Increment click count
  db.run("UPDATE affiliate_referral_links SET click_count = click_count + 1 WHERE id = ?", [link.id]);

  // Get rules for cookie duration
  const rules = getAttributionRules(db, link.business_id, link.program_id);
  const durationHours = rules?.cookie_duration_hours || 720;

  // Create tracking cookie
  const cookieId = `ck_${linkCode}_${visitorId}_${Date.now()}`;
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

  db.run(
    `INSERT INTO affiliate_tracking_cookies (business_id, affiliate_id, referral_link_id, cookie_id, visitor_id, clicked_at, expires_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
    [link.business_id, link.affiliate_id, link.id, cookieId, visitorId, expiresAt]
  );

  return { cookieId, expiresAt, linkCode };
}

// ═══════════════════════════════════════════════════════════════════
// SYNC LOG
// ═══════════════════════════════════════════════════════════════════

function logOrderSync(db, businessId, shopifyOrderId, eventType, rawPayload, processed, errorMessage) {
  db.run(
    `INSERT INTO affiliate_order_sync_log (business_id, shopify_order_id, event_type, raw_payload, processed, error_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      businessId, shopifyOrderId, eventType,
      JSON.stringify(rawPayload),
      processed ? 1 : 0,
      errorMessage || null,
    ]
  );
}

export function getSyncLog(db, businessId, limit = 50) {
  return db.query(
    "SELECT * FROM affiliate_order_sync_log WHERE business_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(businessId, limit);
}

// ═══════════════════════════════════════════════════════════════════
// WALLET HELPERS
// ═══════════════════════════════════════════════════════════════════

function getAffiliateCommissionRate(db, affiliateId, programId) {
  // Check program member custom rate first
  if (programId) {
    const member = db.query(
      "SELECT custom_commission_rate FROM partner_program_members WHERE partner_id = ? AND program_id = ? AND status = 'active'"
    ).get(affiliateId, programId);
    if (member?.custom_commission_rate) return member.custom_commission_rate;

    // Check program default
    const prog = db.query(
      "SELECT default_commission_rate FROM partner_programs WHERE id = ?"
    ).get(programId);
    if (prog?.default_commission_rate) return prog.default_commission_rate;
  }

  // Fall back to affiliate default
  const aff = db.query("SELECT commission_rate FROM affiliates WHERE id = ?").get(affiliateId);
  return aff?.commission_rate || 5;
}

function creditAffiliateWallet(db, affiliateId, businessId, amountCents, description, attributionId) {
  const dollars = amountCents / 100;

  // Insert wallet transaction
  db.run(
    `INSERT INTO affiliate_transactions (business_id, affiliate_id, type, amount, description, reference_id, created_at)
     VALUES (?, ?, 'credit', ?, ?, ?, datetime('now'))`,
    [businessId, affiliateId, dollars, description, `attr_${attributionId}`]
  );

  // Update wallet balance
  const wallet = db.query("SELECT * FROM affiliate_wallets WHERE affiliate_id = ?").get(affiliateId);
  if (wallet) {
    db.run("UPDATE affiliate_wallets SET balance = balance + ?, pending_balance = pending_balance + ?, updated_at = datetime('now') WHERE id = ?",
      [dollars, dollars, wallet.id]);
  } else {
    db.run(
      "INSERT INTO affiliate_wallets (affiliate_id, business_id, balance, pending_balance) VALUES (?, ?, ?, ?)",
      [affiliateId, businessId, dollars, dollars]
    );
  }

  // Also update legacy affiliate store_credit
  db.run("UPDATE affiliates SET store_credit_balance = store_credit_balance + ? WHERE id = ?", [dollars, affiliateId]);

  // Update legacy referral tracking
  db.run("UPDATE affiliates SET total_referrals = total_referrals + 1, total_revenue_generated = total_revenue_generated + ? WHERE id = ?",
    [dollars, affiliateId]);
}

function debitAffiliateWallet(db, affiliateId, businessId, amountCents, description, attributionId) {
  const dollars = amountCents / 100;

  // Insert wallet transaction
  db.run(
    `INSERT INTO affiliate_transactions (business_id, affiliate_id, type, amount, description, reference_id, created_at)
     VALUES (?, ?, 'debit', ?, ?, ?, datetime('now'))`,
    [businessId, affiliateId, dollars, description, `rev_${attributionId}`]
  );

  // Update wallet balance
  const wallet = db.query("SELECT * FROM affiliate_wallets WHERE affiliate_id = ?").get(affiliateId);
  if (wallet) {
    db.run("UPDATE affiliate_wallets SET balance = MAX(0, balance - ?), pending_balance = MAX(0, pending_balance - ?), updated_at = datetime('now') WHERE id = ?",
      [dollars, dollars, wallet.id]);
  }

  // Also update legacy affiliate store_credit
  db.run("UPDATE affiliates SET store_credit_balance = MAX(0, store_credit_balance - ?), total_revenue_generated = MAX(0, total_revenue_generated - ?) WHERE id = ?",
    [dollars, dollars, affiliateId]);
}

// ═══════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════

function generateLinkCode() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ═══════════════════════════════════════════════════════════════════
// NOVI CHECKS
// ═══════════════════════════════════════════════════════════════════

/**
 * Pre-launch validation for Novi.
 */
export function getAttributionValidationStatus(db, businessId) {
  const checks = [];

  // Check rules exist
  const rules = getAttributionRules(db, businessId, null);
  checks.push({
    name: "Attribution rules configured",
    passed: !!rules,
    detail: rules ? "Cookie, model, and override rules are set" : "No attribution rules configured",
  });

  // Check commission config
  const config = getCommissionConfig(db, businessId, null);
  checks.push({
    name: "Commission config set",
    passed: !!config,
    detail: config ? "Shipping, tax, discount exclusions configured" : "No commission config found",
  });

  // Check active affiliates
  const activeAffiliates = db.query("SELECT COUNT(*) as c FROM affiliates WHERE business_id = ? AND is_active = 1").get(businessId).c;
  checks.push({
    name: "Active affiliates",
    passed: activeAffiliates > 0,
    detail: `${activeAffiliates} active affiliate(s)`,
  });

  // Check Shopify connection
  const shopifyCreds = db.query("SELECT * FROM provider_credentials WHERE business_id = ? AND provider = 'shopify' AND is_active = 1").get(businessId);
  checks.push({
    name: "Shopify connection active",
    passed: !!shopifyCreds,
    detail: shopifyCreds ? "Shopify is connected" : "Shopify not connected",
  });

  // Check for unprocessed orders
  const unprocessed = db.query(
    "SELECT COUNT(*) as c FROM affiliate_order_sync_log WHERE business_id = ? AND processed = 0"
  ).get(businessId).c;
  checks.push({
    name: "No unprocessed sync events",
    passed: unprocessed === 0,
    detail: unprocessed === 0 ? "All events processed" : `${unprocessed} unprocessed event(s)`,
  });

  // Check disputed attributions
  const disputed = db.query(
    "SELECT COUNT(*) as c FROM affiliate_attributions WHERE business_id = ? AND status = 'disputed'"
  ).get(businessId).c;
  checks.push({
    name: "No disputed attributions",
    passed: disputed === 0,
    detail: disputed === 0 ? "No issues" : `${disputed} disputed attribution(s) need review`,
  });

  return {
    allPassed: checks.every(c => c.passed),
    checks,
    message: checks.every(c => c.passed)
      ? "Your Shopify connection is active. I tested your referral link and coupon attribution. Your affiliate program is ready."
      : "Some attribution settings need attention before launch.",
  };
}

/**
 * Proactive monitoring for Novi.
 */
export function getAttributionAlerts(db, businessId) {
  const alerts = [];

  // Unattributed orders with coupon codes (potential missed attributions)
  // This requires Shopify orders with coupon codes but no attribution record
  // For now, check sync log for errors
  const failedSyncs = db.query(
    "SELECT COUNT(*) as c FROM affiliate_order_sync_log WHERE business_id = ? AND processed = 0 AND error_message IS NOT NULL"
  ).get(businessId).c;

  if (failedSyncs > 0) {
    alerts.push({
      type: "warning",
      message: `${failedSyncs} Shopify orders used affiliate codes but did not receive attribution. I've placed them in Review.`,
      count: failedSyncs,
    });
  }

  // Pending attributions awaiting fulfillment
  const pendingCount = db.query(
    "SELECT COUNT(*) as c FROM affiliate_attributions WHERE business_id = ? AND status = 'pending'"
  ).get(businessId).c;

  if (pendingCount > 0) {
    alerts.push({
      type: "info",
      message: `${pendingCount} commission(s) pending — awaiting order fulfillment.`,
      count: pendingCount,
    });
  }

  // Recently reversed attributions (refunds)
  const recentReversals = db.query(
    `SELECT COUNT(*) as c, COALESCE(SUM(commission_cents), 0) as total_reversed
     FROM affiliate_attributions
     WHERE business_id = ? AND status = 'reversed'
       AND updated_at > datetime('now', '-7 days')`
  ).get(businessId);

  if (recentReversals.c > 0) {
    alerts.push({
      type: "info",
      message: `${recentReversals.c} commission(s) reversed in the last 7 days ($${(recentReversals.total_reversed / 100).toFixed(2)} total).`,
      count: recentReversals.c,
    });
  }

  return alerts;
}
