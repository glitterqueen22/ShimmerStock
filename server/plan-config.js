export const ACCESS_PLANS = Object.freeze({
  early_access: Object.freeze({
    key: "early_access",
    name: "Early Access",
    statusLabel: "Current access",
    price: null,
    billingPeriod: null,
    limits: Object.freeze({ monthlyOrders: null, teamMembers: null, products: null }),
    capabilities: Object.freeze([
      "Core operations workspace",
      "Read-only Shopify import and reconciliation",
      "Novi SKU, barcode, label, and command workflows",
    ]),
  }),
});

export function getBusinessAccess(db, businessId) {
  db.run("INSERT OR IGNORE INTO business_access (business_id) VALUES (?)", [businessId]);
  const assignment = db.query(
    "SELECT access_key, status, source, granted_at FROM business_access WHERE business_id = ?"
  ).get(businessId);
  const plan = ACCESS_PLANS[assignment.access_key] || ACCESS_PLANS.early_access;
  const usage = {
    ordersLast30Days: db.query(
      "SELECT COUNT(*) AS count FROM orders WHERE business_id = ? AND created_at >= datetime('now', '-30 days')"
    ).get(businessId).count,
    teamMembers: db.query("SELECT COUNT(*) AS count FROM user_businesses WHERE business_id = ?").get(businessId).count,
    products: db.query("SELECT COUNT(*) AS count FROM products WHERE business_id = ?").get(businessId).count,
  };
  return {
    ...plan,
    status: assignment.status,
    source: assignment.source,
    grantedAt: assignment.granted_at,
    usage,
    billing: { configured: false, renewalDate: null, paymentMethod: null, invoices: [] },
    recommendation: {
      verdict: "STAY_PUT",
      why: "No enforced usage limit or authoritative paid upgrade is configured for Early Access.",
      whatChanges: "Nothing changes while Early Access remains active.",
      cost: null,
      benefit: "Keep using the current workspace without an unnecessary upgrade.",
    },
  };
}