/**
 * ShimmerStock Affiliate Attribution Engine
 * ==========================================
 * Pure-function commission calculation engine.
 * Transparent, auditable, reusable across commerce adapters (Shopify, WooCommerce, etc.).
 *
 * Every calculation returns a full breakdown string suitable for display
 * and an object suitable for audit logging.
 */

// ═══════════════════════════════════════════════════════════════════
// COMMISSION CALCULATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate commission for a single order.
 *
 * @param {Object} params
 * @param {number} params.orderTotal      - Total order subtotal (before shipping/tax/discounts)
 * @param {number} params.shipping        - Shipping amount in cents
 * @param {number} params.taxes           - Tax amount in cents
 * @param {number} params.discounts       - Discount amount in cents (coupon + other)
 * @param {number} params.giftCards       - Gift card amount applied in cents
 * @param {number} params.tips            - Tip amount in cents
 * @param {Object} params.config          - Commission config from affiliate_commission_config
 * @param {Array}  params.lineItems       - [{ productId, collectionIds, amountCents }]
 * @param {number} params.commissionRate  - Rate as a percentage (e.g. 5 for 5%)
 * @returns {{ eligibleAmountCents: number, commissionCents: number, breakdown: string, deductions: object }}
 */
export function calculateCommission({ orderTotal, shipping, taxes, discounts, giftCards, tips, config, lineItems, commissionRate }) {
  // Normalize: work in cents for precision
  const subtotalCents = Math.round(orderTotal * 100);
  const shippingCents = Math.round((shipping || 0) * 100);
  const taxesCents = Math.round((taxes || 0) * 100);
  const discountsCents = Math.round((discounts || 0) * 100);
  const giftCardsCents = Math.round((giftCards || 0) * 100);
  const tipsCents = Math.round((tips || 0) * 100);

  // Default config if missing
  const cfg = config || {};
  const excludeShipping = cfg.exclude_shipping !== undefined ? cfg.exclude_shipping : true;
  const excludeTaxes = cfg.exclude_taxes !== undefined ? cfg.exclude_taxes : true;
  const excludeDiscounts = cfg.exclude_discounts !== undefined ? cfg.exclude_discounts : true;
  const excludeGiftCards = cfg.exclude_gift_cards !== undefined ? cfg.exclude_gift_cards : true;
  const excludeTips = cfg.exclude_tips !== undefined ? cfg.exclude_tips : true;
  const excludedProductIds = parseJsonSafe(cfg.excluded_product_ids, []);
  const excludedCollectionIds = parseJsonSafe(cfg.excluded_collection_ids, []);
  const minOrderCents = cfg.minimum_order_amount_cents || 0;

  // Start with subtotal
  let eligibleCents = subtotalCents;
  const deductions = { shipping: 0, taxes: 0, discounts: 0, giftCards: 0, tips: 0, excludedProducts: 0 };

  // Subtract exclusions
  if (excludeShipping) { eligibleCents -= shippingCents; deductions.shipping = shippingCents; }
  if (excludeTaxes) { eligibleCents -= taxesCents; deductions.taxes = taxesCents; }
  if (excludeDiscounts) { eligibleCents -= discountsCents; deductions.discounts = discountsCents; }
  if (excludeGiftCards) { eligibleCents -= giftCardsCents; deductions.giftCards = giftCardsCents; }
  if (excludeTips) { eligibleCents -= tipsCents; deductions.tips = tipsCents; }

  // Exclude specific products
  if (excludedProductIds.length > 0 && lineItems && lineItems.length > 0) {
    for (const item of lineItems) {
      if (excludedProductIds.includes(item.productId)) {
        const itemCents = Math.round(item.amountCents || (item.amount || 0) * 100);
        eligibleCents -= itemCents;
        deductions.excludedProducts += itemCents;
      }
    }
  }

  // Exclude products in excluded collections
  if (excludedCollectionIds.length > 0 && lineItems && lineItems.length > 0) {
    for (const item of lineItems) {
      if (item.collectionIds && item.collectionIds.some(cid => excludedCollectionIds.includes(cid))) {
        const itemCents = Math.round(item.amountCents || (item.amount || 0) * 100);
        // Avoid double-counting
        if (!excludedProductIds.includes(item.productId)) {
          eligibleCents -= itemCents;
          deductions.excludedProducts += itemCents;
        }
      }
    }
  }

  // Minimum check
  eligibleCents = Math.max(0, eligibleCents);

  // Apply commission rate
  const rate = commissionRate || 0;
  let commissionCents = 0;
  if (eligibleCents >= minOrderCents) {
    commissionCents = Math.round(eligibleCents * (rate / 100));
  }

  // Build transparent breakdown
  const breakdown = buildBreakdown({
    subtotalCents, shippingCents, taxesCents, discountsCents, giftCardsCents, tipsCents,
    eligibleCents, commissionCents, rate, deductions, minOrderCents, excludeShipping,
    excludeTaxes, excludeDiscounts, excludeGiftCards, excludeTips, excludedProductIds,
  });

  return {
    eligibleAmountCents: eligibleCents,
    commissionCents,
    breakdown,
    deductions,
  };
}

// ═══════════════════════════════════════════════════════════════════
// BREAKDOWN STRING BUILDER
// ═══════════════════════════════════════════════════════════════════

function buildBreakdown(opts) {
  const {
    subtotalCents, shippingCents, taxesCents, discountsCents, giftCardsCents, tipsCents,
    eligibleCents, commissionCents, rate, deductions, minOrderCents,
    excludeShipping, excludeTaxes, excludeDiscounts, excludeGiftCards, excludeTips,
  } = opts;

  const parts = [];
  parts.push(`Subtotal $${centsToDollars(subtotalCents)}`);

  if (excludeShipping && shippingCents > 0) parts.push(`- Shipping $${centsToDollars(shippingCents)}`);
  if (excludeTaxes && taxesCents > 0) parts.push(`- Tax $${centsToDollars(taxesCents)}`);
  if (excludeDiscounts && discountsCents > 0) parts.push(`- Discounts $${centsToDollars(discountsCents)}`);
  if (excludeGiftCards && giftCardsCents > 0) parts.push(`- Gift Cards $${centsToDollars(giftCardsCents)}`);
  if (excludeTips && tipsCents > 0) parts.push(`- Tips $${centsToDollars(tipsCents)}`);

  if (deductions.excludedProducts > 0) parts.push(`- Excluded Products $${centsToDollars(deductions.excludedProducts)}`);

  parts.push(`= Eligible $${centsToDollars(eligibleCents)}`);

  if (eligibleCents < minOrderCents) {
    parts.push(`(below minimum $${centsToDollars(minOrderCents)}, no commission)`);
  } else {
    parts.push(`× ${rate}% = Commission $${centsToDollars(commissionCents)}`);
  }

  return parts.join(' ');
}

// ═══════════════════════════════════════════════════════════════════
// ATTRIBUTION MATCHING
// ═══════════════════════════════════════════════════════════════════

/**
 * Match a Shopify order to an affiliate via coupon code.
 * @param {Object} db - Database instance
 * @param {number} businessId
 * @param {string} couponCode
 * @returns {Object|null} { affiliateId, programId, couponId }
 */
export function matchAffiliateByCoupon(db, businessId, couponCode) {
  if (!couponCode) return null;

  const coupon = db.query(
    `SELECT ac.*, a.id as affiliate_id, a.is_active as affiliate_active,
            ppm.program_id
     FROM affiliate_coupons ac
     JOIN affiliates a ON a.id = ac.affiliate_id AND a.business_id = ?
     LEFT JOIN partner_program_members ppm ON ppm.partner_id = a.id AND ppm.status = 'active'
     WHERE ac.code = ? AND ac.business_id = ? AND ac.is_active = 1 AND a.is_active = 1
     LIMIT 1`
  ).get(businessId, couponCode, businessId);

  if (!coupon) {
    // Also check discount_code column on affiliates directly
    const direct = db.query(
      `SELECT a.id as affiliate_id, a.discount_code as code, a.commission_rate,
              ppm.program_id
       FROM affiliates a
       LEFT JOIN partner_program_members ppm ON ppm.partner_id = a.id AND ppm.status = 'active'
       WHERE a.discount_code = ? AND a.business_id = ? AND a.is_active = 1
       LIMIT 1`
    ).get(couponCode, businessId);
    if (direct) return { affiliateId: direct.affiliate_id, programId: direct.program_id || null, couponId: null, source: 'discount_code' };
    return null;
  }

  return {
    affiliateId: coupon.affiliate_id,
    programId: coupon.program_id || null,
    couponId: coupon.id,
    source: 'affiliate_coupon',
  };
}

/**
 * Match a Shopify order to an affiliate via referral cookie.
 * @param {Object} db
 * @param {number} businessId
 * @param {string} visitorId
 * @returns {Object|null}
 */
export function matchAffiliateByCookie(db, businessId, visitorId) {
  if (!visitorId) return null;

  const cookie = db.query(
    `SELECT atc.*, arl.program_id
     FROM affiliate_tracking_cookies atc
     JOIN affiliate_referral_links arl ON arl.id = atc.referral_link_id
     WHERE atc.visitor_id = ? AND atc.business_id = ?
       AND atc.converted_at IS NULL
       AND atc.expires_at > datetime('now')
     ORDER BY atc.clicked_at DESC
     LIMIT 1`
  ).get(visitorId, businessId);

  return cookie ? {
    affiliateId: cookie.affiliate_id,
    programId: cookie.program_id,
    referralLinkId: cookie.referral_link_id,
    cookieId: cookie.cookie_id,
    source: 'cookie',
  } : null;
}

// ═══════════════════════════════════════════════════════════════════
// ATTRIBUTION RULE EVALUATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Determine which attribution wins based on rules.
 * @param {Array} candidates - Array of { method, affiliateId, programId, ... }
 * @param {Object} rules - Attribution rules object
 * @returns {Object|null}
 */
export function resolveAttribution(candidates, rules) {
  if (!candidates || candidates.length === 0) return null;

  // If coupon overrides referral and both exist
  const couponCandidates = candidates.filter(c => c.method === 'coupon');
  const referralCandidates = candidates.filter(c => c.method === 'referral_link' || c.method === 'cookie');

  if (rules.coupon_overrides_referral && couponCandidates.length > 0) {
    return couponCandidates[0]; // First coupon wins
  }

  // Apply attribution model
  if (rules.attribution_model === 'last_click' || rules.attribution_model === 'last-click') {
    // Last candidate wins (most recent)
    return candidates[candidates.length - 1];
  }

  // first_click: first candidate wins
  return candidates[0];
}

// ═══════════════════════════════════════════════════════════════════
// SELF-REFERRAL DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a referral is self-referral.
 * @param {Object} db
 * @param {number} affiliateId
 * @param {Object} orderData - { customer_email, customer_name }
 * @returns {boolean}
 */
export function detectSelfReferral(db, affiliateId, orderData) {
  const affiliate = db.query(
    "SELECT email, name FROM affiliates WHERE id = ?"
  ).get(affiliateId);

  if (!affiliate) return false;

  if (affiliate.email && orderData.customer_email &&
      affiliate.email.toLowerCase() === orderData.customer_email.toLowerCase()) {
    return true;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function parseJsonSafe(val, defaultVal) {
  if (!val) return defaultVal;
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : defaultVal;
  } catch {
    return defaultVal;
  }
}

function centsToDollars(cents) {
  return (cents / 100).toFixed(2);
}
