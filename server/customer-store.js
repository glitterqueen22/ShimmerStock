/**
 * ShimmerStock Customer HQ Data Access Layer (P4.3)
 * ==================================================
 * Aggregation queries for the comprehensive Customer HQ view.
 */

// ═══════════════════════════════════════════════════════════════════════
// CUSTOMER SEARCH
// ═══════════════════════════════════════════════════════════════════════

export function searchCustomers(db, businessId, filters = {}) {
  const conditions = ["o.business_id = ?"];
  const params = [businessId];

  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push("(o.customer_email LIKE ? OR o.customer_name LIKE ? OR o.order_number LIKE ?)");
    params.push(term, term, term);
  }

  if (filters.minOrders) {
    conditions.push("o.business_id = ?"); // placeholder, we'll filter in HAVING
  }

  if (filters.tag) {
    conditions.push("EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_email = o.customer_email AND ct.business_id = ? AND ct.tag = ?)");
    params.push(businessId, filters.tag);
  }

  const where = conditions.join(" AND ");

  // Group by customer email to get aggregated stats
  const rows = db
    .query(
      `SELECT 
        o.customer_email,
        MAX(o.customer_name) as customer_name,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total_amount), 0) as lifetime_value,
        MIN(o.created_at) as first_order_date,
        MAX(o.created_at) as last_order_date
       FROM orders o
       WHERE ${where} AND o.customer_email IS NOT NULL AND o.customer_email != ''
       GROUP BY o.customer_email
       ORDER BY last_order_date DESC
       LIMIT ?`
    )
    .all(...params, filters.limit || 50);

  // Filter by minOrders post-query (since we can't use HAVING with placeholder params easily)
  let results = rows;
  if (filters.minOrders) {
    results = results.filter(r => r.total_orders >= parseInt(filters.minOrders));
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// CUSTOMER HQ — Full aggregated view
// ═══════════════════════════════════════════════════════════════════════

export function getCustomerHQ(db, customerEmail, businessId) {
  // 1. Customer profile & stats
  const profile = db
    .query(
      `SELECT 
        o.customer_email,
        MAX(o.customer_name) as customer_name,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total_amount), 0) as lifetime_value,
        MIN(o.created_at) as first_order_date,
        MAX(o.created_at) as last_order_date,
        AVG(o.total_amount) as avg_order_value
       FROM orders o
       WHERE o.customer_email = ? AND o.business_id = ?`
    )
    .get(customerEmail, businessId);

  if (!profile || !profile.customer_email) {
    return null;
  }

  // 2. Order history
  const orders = db
    .query(
      `SELECT o.id, o.order_number, o.customer_name, o.customer_email, o.source,
              o.status, o.cs_status, o.total_amount, o.notes, o.created_at, o.packed_at,
              COUNT(oi.id) as item_count,
              SUM(oi.quantity) as total_qty
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_email = ? AND o.business_id = ?
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT 50`
    )
    .all(customerEmail, businessId);

  // 3. Return/refund history
  const returns = db
    .query(
      `SELECT rr.*, o.order_number
       FROM returns_refunds rr
       JOIN orders o ON rr.order_id = o.id
       WHERE o.customer_email = ? AND rr.business_id = ?
       ORDER BY rr.created_at DESC`
    )
    .all(customerEmail, businessId);

  // 4. Communication timeline (notes + email log)
  const notes = db
    .query(
      `SELECT cn.id, cn.customer_email, cn.order_id, cn.note as content, cn.note_type, 
              cn.created_at, u.display_name as created_by_name, 'note' as source
       FROM customer_notes cn
       LEFT JOIN users u ON cn.created_by = u.id
       WHERE cn.customer_email = ? AND cn.business_id = ?`
    )
    .all(customerEmail, businessId);

  const emails = db
    .query(
      `SELECT el.id, el.customer_email, el.subject, el.body as content, 
              el.template_id, el.status, el.sent_at, el.created_at, 'email' as source
       FROM email_log el
       WHERE el.customer_email = ? AND el.business_id = ?
       ORDER BY el.created_at DESC`
    )
    .all(customerEmail, businessId);

  // Combine and sort communications
  const communications = [...notes, ...emails].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // 5. Affiliate activity
  const affiliate = db
    .query(
      `SELECT a.id, a.name, a.discount_code, a.commission_rate,
              a.total_referrals, a.total_revenue_generated, a.store_credit_balance
       FROM affiliates a
       WHERE a.email = ? AND a.business_id = ?`
    )
    .get(customerEmail, businessId);

  // 6. Tags
  const tags = db
    .query(
      `SELECT tag FROM customer_tags
       WHERE customer_email = ? AND business_id = ?
       ORDER BY created_at DESC`
    )
    .all(customerEmail, businessId)
    .map(r => r.tag);

  // 7. Recent activity feed (last 20 events)
  const activityFeed = [];

  // Recent orders
  for (const o of orders.slice(0, 5)) {
    activityFeed.push({
      timestamp: o.created_at,
      type: 'order',
      label: `Order #${o.order_number}`,
      detail: `${o.source} · ${o.status} · $${(o.total_amount || 0).toFixed(2)}`,
    });
  }

  // Recent returns
  for (const r of returns.slice(0, 3)) {
    activityFeed.push({
      timestamp: r.created_at,
      type: 'return',
      label: `${r.type.replace('_', ' ')} — ${r.status}`,
      detail: r.reason || `Order #${r.order_number}`,
    });
  }

  // Sort all activity
  activityFeed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    profile: {
      email: profile.customer_email,
      name: profile.customer_name,
      firstOrderDate: profile.first_order_date,
      lastOrderDate: profile.last_order_date,
      totalOrders: profile.total_orders,
      lifetimeValue: profile.lifetime_value,
      avgOrderValue: profile.avg_order_value,
      tags,
    },
    orders,
    returns,
    communications,
    affiliate: affiliate || null,
    activityFeed: activityFeed.slice(0, 15),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// CUSTOMER TAGS
// ═══════════════════════════════════════════════════════════════════════

export function addCustomerTag(db, { customerEmail, tag, businessId }) {
  db.run(
    "INSERT OR IGNORE INTO customer_tags (business_id, customer_email, tag) VALUES (?, ?, ?)",
    [businessId, customerEmail, tag]
  );
}

export function removeCustomerTag(db, { customerEmail, tag, businessId }) {
  db.run(
    "DELETE FROM customer_tags WHERE business_id = ? AND customer_email = ? AND tag = ?",
    [businessId, customerEmail, tag]
  );
}

export function getCustomerTags(db, customerEmail, businessId) {
  return db
    .query(
      "SELECT tag FROM customer_tags WHERE customer_email = ? AND business_id = ? ORDER BY created_at DESC"
    )
    .all(customerEmail, businessId)
    .map(r => r.tag);
}
