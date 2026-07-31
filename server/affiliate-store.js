/**
 * ShimmerStock Affiliate Data Access Layer (V3.6)
 * ================================================
 * All affiliate DB access goes through this module.
 * Closes the Marketing → Commerce loop in the Operating Loop.
 */

// ═══════════════════════════════════════════════════════════════════
// AFFILIATES
// ═══════════════════════════════════════════════════════════════════

export function createAffiliate(db, {
  businessId, name, email, discountCode, discountType, discountValue, commissionRate, notes,
}) {
  const result = db.run(
    `INSERT INTO affiliates (business_id, name, email, discount_code, discount_type, discount_value, commission_rate, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      businessId,
      name,
      email || null,
      discountCode,
      discountType || "percentage",
      discountValue || 10,
      commissionRate || 0,
      notes || null,
    ]
  );
  return result.lastInsertRowid;
}

export function listAffiliates(db, businessId) {
  return db
    .query(
      `SELECT a.*,
        (SELECT COUNT(*) FROM affiliate_referrals ar WHERE ar.affiliate_id = a.id AND ar.business_id = a.business_id) as referral_count
       FROM affiliates a
       WHERE a.business_id = ?
       ORDER BY a.created_at DESC`
    )
    .all(businessId);
}

export function getAffiliate(db, id, businessId) {
  const affiliate = db
    .query(
      `SELECT a.*,
        (SELECT COUNT(*) FROM affiliate_referrals ar WHERE ar.affiliate_id = a.id AND ar.business_id = a.business_id) as referral_count
       FROM affiliates a
       WHERE a.id = ? AND a.business_id = ?`
    )
    .get(id, businessId);

  if (!affiliate) return null;

  // Get referrals for this affiliate
  const referrals = db
    .query(
      `SELECT ar.*, o.order_number, o.customer_name, o.customer_email, o.total_amount, o.source
       FROM affiliate_referrals ar
       JOIN orders o ON ar.order_id = o.id
       WHERE ar.affiliate_id = ? AND ar.business_id = ?
       ORDER BY ar.created_at DESC`
    )
    .all(id, businessId);

  return { ...affiliate, referrals };
}

export function updateAffiliate(db, id, fields) {
  const allowed = [
    "name", "email", "discount_code", "discount_type", "discount_value",
    "commission_rate", "is_active", "notes",
  ];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }

  if (sets.length === 0) return false;

  values.push(id);
  const result = db.run(
    `UPDATE affiliates SET ${sets.join(", ")} WHERE id = ?`,
    ...values
  );
  return result.changes > 0;
}

// ═══════════════════════════════════════════════════════════════════
// REFERRALS
// ═══════════════════════════════════════════════════════════════════

export function recordReferral(db, {
  affiliateId, orderId, discountAmount, commissionEarned, storeCreditIssued, businessId,
}) {
  const result = db.run(
    `INSERT INTO affiliate_referrals (business_id, affiliate_id, order_id, discount_amount, commission_earned, store_credit_issued, status)
     VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`,
    [businessId, affiliateId, orderId, discountAmount || 0, commissionEarned || 0, storeCreditIssued || 0]
  );

  // Update affiliate totals
  db.run(
    `UPDATE affiliates
     SET total_referrals = total_referrals + 1,
         total_revenue_generated = total_revenue_generated + ?,
         store_credit_balance = store_credit_balance + ?
     WHERE id = ? AND business_id = ?`,
    [commissionEarned || 0, storeCreditIssued || 0, affiliateId, businessId]
  );

  // Get order revenue for tracking
  const order = db.query("SELECT total_amount FROM orders WHERE id = ? AND business_id = ?").get(orderId, businessId);
  if (order) {
    db.run(
      `UPDATE affiliates SET total_revenue_generated = total_revenue_generated + ? WHERE id = ?`,
      [order.total_amount || 0, affiliateId]
    );
  }

  return result.lastInsertRowid;
}

export function listReferrals(db, businessId, filters = {}) {
  const conditions = ["ar.business_id = ?"];
  const params = [businessId];

  if (filters.affiliateId) {
    conditions.push("ar.affiliate_id = ?");
    params.push(filters.affiliateId);
  }
  if (filters.status) {
    conditions.push("ar.status = ?");
    params.push(filters.status);
  }

  const where = conditions.join(" AND ");
  return db
    .query(
      `SELECT ar.*, a.name as affiliate_name, a.discount_code,
              o.order_number, o.customer_name, o.customer_email, o.total_amount as order_total, o.source
       FROM affiliate_referrals ar
       JOIN affiliates a ON ar.affiliate_id = a.id
       JOIN orders o ON ar.order_id = o.id
       WHERE ${where}
       ORDER BY ar.created_at DESC
       LIMIT ?`
    )
    .all(...params, filters.limit || 200);
}

// ═══════════════════════════════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════════════════════════════

export function getLeaderboard(db, businessId, period = "month") {
  let dateFilter = "";
  if (period === "month") {
    dateFilter = "AND ar.created_at >= datetime('now', '-30 days')";
  } else if (period === "lastMonth") {
    dateFilter = "AND ar.created_at >= datetime('now', '-60 days') AND ar.created_at < datetime('now', '-30 days')";
  }
  // "all" has no filter

  return db
    .query(
      `SELECT
        a.id, a.name, a.discount_code, a.email, a.is_active,
        COUNT(ar.id) as referral_count,
        COALESCE(SUM(ar.discount_amount), 0) as total_discounts,
        COALESCE(SUM(ar.commission_earned), 0) as total_commissions,
        COALESCE(SUM(ar.store_credit_issued), 0) as total_credit_issued,
        a.store_credit_balance,
        a.total_referrals as lifetime_referrals,
        a.total_revenue_generated as lifetime_revenue
       FROM affiliates a
       LEFT JOIN affiliate_referrals ar ON ar.affiliate_id = a.id AND ar.business_id = a.business_id ${dateFilter}
       WHERE a.business_id = ?
       GROUP BY a.id
       ORDER BY referral_count DESC, total_commissions DESC`
    )
    .all(businessId);
}

// ═══════════════════════════════════════════════════════════════════
// STORE CREDIT
// ═══════════════════════════════════════════════════════════════════

export function issueStoreCredit(db, { affiliateId, amount, businessId }) {
  const result = db.run(
    `UPDATE affiliates
     SET store_credit_balance = store_credit_balance + ?
     WHERE id = ? AND business_id = ?`,
    [amount, affiliateId, businessId]
  );
  return result.changes > 0;
}

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════

export function getAffiliateSummary(db, businessId) {
  const totals = db
    .query(
      `SELECT
        COUNT(*) as total_affiliates,
        SUM(total_referrals) as total_referrals,
        SUM(total_revenue_generated) as total_revenue,
        SUM(store_credit_balance) as outstanding_credit
       FROM affiliates
       WHERE business_id = ? AND is_active = 1`
    )
    .get(businessId);

  const activeCodes = db
    .query(
      `SELECT COUNT(*) as count FROM affiliates
       WHERE business_id = ? AND is_active = 1`
    )
    .get(businessId);

  return {
    totalAffiliates: totals?.total_affiliates || 0,
    totalReferrals: totals?.total_referrals || 0,
    totalRevenueGenerated: totals?.total_revenue || 0,
    outstandingCredit: totals?.outstanding_credit || 0,
    activeDiscountCodes: activeCodes?.count || 0,
    summary: `${totals?.total_affiliates || 0} active affiliates, ${totals?.total_referrals || 0} total referrals`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PAYOUTS
// ═══════════════════════════════════════════════════════════════════

export function recordPayout(db, { affiliateId, amount, method, status, notes }) {
  const result = db.run(
    `INSERT INTO affiliate_payouts (affiliate_id, amount, method, status, notes, paid_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      affiliateId,
      amount,
      method || "store_credit",
      status || "pending",
      notes || null,
      status === "paid" ? new Date().toISOString() : null,
    ]
  );

  // If paid, reduce store credit balance
  if (status === "paid" && method === "store_credit") {
    db.run(
      `UPDATE affiliates SET store_credit_balance = MAX(0, store_credit_balance - ?)
       WHERE id = ?`,
      [amount, affiliateId]
    );
  }

  return result.lastInsertRowid;
}

export function getPayoutHistory(db, affiliateId) {
  const payouts = db
    .query(
      `SELECT p.*, a.name as affiliate_name, a.discount_code
       FROM affiliate_payouts p
       JOIN affiliates a ON p.affiliate_id = a.id
       WHERE p.affiliate_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(affiliateId);

  // Calculate running balance
  let balance = 0;
  for (const p of payouts.reverse()) {
    balance += p.amount;
    p.running_balance = balance;
  }
  payouts.reverse();

  // Get current store credit
  const affiliate = db.query("SELECT store_credit_balance FROM affiliates WHERE id = ?").get(affiliateId);

  return {
    payouts,
    currentBalance: affiliate?.store_credit_balance || 0,
  };
}

export function getPayoutSummary(db, businessId) {
  const pending = db
    .query(
      `SELECT
        a.id as affiliate_id, a.name, a.discount_code, a.store_credit_balance,
        COALESCE(SUM(ap.amount), 0) as pending_amount
       FROM affiliates a
       LEFT JOIN affiliate_payouts ap ON ap.affiliate_id = a.id AND ap.status = 'pending'
       WHERE a.business_id = ? AND a.is_active = 1 AND a.store_credit_balance > 0
       GROUP BY a.id
       ORDER BY a.store_credit_balance DESC`
    )
    .all(businessId);

  const totalPending = db
    .query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM affiliate_payouts ap
       JOIN affiliates a ON ap.affiliate_id = a.id
       WHERE a.business_id = ? AND ap.status = 'pending'`
    )
    .get(businessId);

  const totalPaid = db
    .query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM affiliate_payouts ap
       JOIN affiliates a ON ap.affiliate_id = a.id
       WHERE a.business_id = ? AND ap.status = 'paid'`
    )
    .get(businessId);

  return {
    pending: pending.filter(p => p.store_credit_balance > 0 || p.pending_amount > 0),
    totalPending: totalPending?.total || 0,
    totalPaid: totalPaid?.total || 0,
  };
}

export function getAllPayouts(db, businessId) {
  return db
    .query(
      `SELECT ap.*, a.name as affiliate_name, a.discount_code
       FROM affiliate_payouts ap
       JOIN affiliates a ON ap.affiliate_id = a.id
       WHERE a.business_id = ?
       ORDER BY ap.created_at DESC
       LIMIT 200`
    )
    .all(businessId);
}

// ═══════════════════════════════════════════════════════════════════
// CHALLENGES
// ═══════════════════════════════════════════════════════════════════

export function createChallenge(db, {
  businessId, title, description, targetType, targetValue, rewardType, rewardAmount,
  startsAt, endsAt,
}) {
  const result = db.run(
    `INSERT INTO affiliate_challenges (business_id, title, description, target_type, target_value, reward_type, reward_amount, starts_at, ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [businessId, title, description || null, targetType || "referrals", targetValue, rewardType || "store_credit", rewardAmount, startsAt, endsAt]
  );
  return result.lastInsertRowid;
}

export function listChallenges(db, businessId) {
  const challenges = db
    .query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM affiliate_challenge_progress acp WHERE acp.challenge_id = c.id) as participant_count,
        (SELECT COUNT(*) FROM affiliate_challenge_progress acp WHERE acp.challenge_id = c.id AND acp.completed_at IS NOT NULL) as completed_count
       FROM affiliate_challenges c
       WHERE c.business_id = ?
       ORDER BY c.is_active DESC, c.ends_at ASC`
    )
    .all(businessId);

  return challenges;
}

export function getChallengeLeaderboard(db, challengeId) {
  return db
    .query(
      `SELECT
        acp.*,
        a.name, a.discount_code, a.email,
        CASE WHEN acp.completed_at IS NOT NULL THEN 1 ELSE 0 END as is_completed
       FROM affiliate_challenge_progress acp
       JOIN affiliates a ON acp.affiliate_id = a.id
       WHERE acp.challenge_id = ?
       ORDER BY acp.current_value DESC, acp.completed_at ASC`
    )
    .all(challengeId);
}

export function updateChallengeProgress(db, { challengeId, affiliateId, currentValue }) {
  const challenge = db.query("SELECT * FROM affiliate_challenges WHERE id = ?").get(challengeId);
  if (!challenge) return null;

  const existing = db
    .query("SELECT * FROM affiliate_challenge_progress WHERE challenge_id = ? AND affiliate_id = ?")
    .get(challengeId, affiliateId);

  const completed = currentValue >= challenge.target_value;

  if (existing) {
    db.run(
      `UPDATE affiliate_challenge_progress
       SET current_value = ?, completed_at = ?
       WHERE challenge_id = ? AND affiliate_id = ?`,
      [currentValue, completed && !existing.completed_at ? new Date().toISOString() : existing.completed_at, challengeId, affiliateId]
    );
  } else {
    db.run(
      `INSERT INTO affiliate_challenge_progress (challenge_id, affiliate_id, current_value, completed_at)
       VALUES (?, ?, ?, ?)`,
      [challengeId, affiliateId, currentValue, completed ? new Date().toISOString() : null]
    );
  }

  return { completed: completed && (!existing || !existing.completed_at), challenge };
}

// ═══════════════════════════════════════════════════════════════════
// MARKETING ASSETS
// ═══════════════════════════════════════════════════════════════════

export function listAssets(db, businessId) {
  return db
    .query(
      `SELECT * FROM affiliate_assets
       WHERE business_id = ?
       ORDER BY created_at DESC`
    )
    .all(businessId);
}

export function createAsset(db, { businessId, title, type, url }) {
  const result = db.run(
    `INSERT INTO affiliate_assets (business_id, title, type, url) VALUES (?, ?, ?, ?)`,
    [businessId, title, type || "banner", url]
  );
  return result.lastInsertRowid;
}

export function recordAssetDownload(db, assetId) {
  db.run(
    `UPDATE affiliate_assets SET download_count = download_count + 1 WHERE id = ?`,
    [assetId]
  );
}

// ═══════════════════════════════════════════════════════════════════
// TRAINING MODULES
// ═══════════════════════════════════════════════════════════════════

export function listTrainingModules(db, businessId) {
  return db
    .query(
      `SELECT * FROM affiliate_training
       WHERE business_id = ?
       ORDER BY order_index ASC, created_at ASC`
    )
    .all(businessId);
}

export function createTrainingModule(db, { businessId, title, content, orderIndex }) {
  const result = db.run(
    `INSERT INTO affiliate_training (business_id, title, content, order_index)
     VALUES (?, ?, ?, ?)`,
    [businessId, title, content, orderIndex || 0]
  );
  return result.lastInsertRowid;
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Find affiliate by discount code
// ═══════════════════════════════════════════════════════════════════

export function findAffiliateByCode(db, discountCode, businessId) {
  return db
    .query(
      `SELECT * FROM affiliates
       WHERE discount_code = ? AND business_id = ? AND is_active = 1`
    )
    .get(discountCode, businessId);
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════════

export function getDashboardStats(db, businessId) {
  const totalAffiliates = db
    .query("SELECT COUNT(*) as count FROM affiliates WHERE business_id = ?")
    .get(businessId);

  const activeAffiliates = db
    .query("SELECT COUNT(*) as count FROM affiliates WHERE business_id = ? AND is_active = 1")
    .get(businessId);

  const monthReferrals = db
    .query(
      `SELECT COUNT(*) as count FROM affiliate_referrals
       WHERE business_id = ? AND created_at >= datetime('now', '-30 days')`
    )
    .get(businessId);

  const monthCommission = db
    .query(
      `SELECT COALESCE(SUM(commission_earned), 0) as total FROM affiliate_referrals
       WHERE business_id = ? AND created_at >= datetime('now', '-30 days')`
    )
    .get(businessId);

  const pendingPayouts = db
    .query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM affiliate_payouts ap
       JOIN affiliates a ON ap.affiliate_id = a.id
       WHERE a.business_id = ? AND ap.status = 'pending'`
    )
    .get(businessId);

  const activeChallenges = db
    .query(
      `SELECT COUNT(*) as count FROM affiliate_challenges
       WHERE business_id = ? AND is_active = 1`
    )
    .get(businessId);

  return {
    totalAffiliates: totalAffiliates?.count || 0,
    activeAffiliates: activeAffiliates?.count || 0,
    monthReferrals: monthReferrals?.count || 0,
    monthCommission: monthCommission?.total || 0,
    pendingPayouts: pendingPayouts?.total || 0,
    activeChallenges: activeChallenges?.count || 0,
  };
}

// ═══════════════════════════════════════════════════════════════════
// P4.4v2: WALLET SYSTEM
// ═══════════════════════════════════════════════════════════════════

export function ensureWallet(db, affiliateId) {
  const wallet = db.query("SELECT * FROM affiliate_wallets WHERE affiliate_id = ?").get(affiliateId);
  if (wallet) return wallet;
  const result = db.run(
    "INSERT INTO affiliate_wallets (affiliate_id, balance_cents, lifetime_earned_cents) VALUES (?, 0, 0)",
    [affiliateId]
  );
  return db.query("SELECT * FROM affiliate_wallets WHERE id = ?").get(result.lastInsertRowid);
}

export function getWallet(db, affiliateId) {
  const wallet = ensureWallet(db, affiliateId);
  const transactions = db.query(
    "SELECT * FROM affiliate_transactions WHERE wallet_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(wallet.id);
  return {
    id: wallet.id,
    affiliateId: wallet.affiliate_id,
    balanceCents: wallet.balance_cents,
    balanceDollars: wallet.balance_cents / 100,
    lifetimeEarnedCents: wallet.lifetime_earned_cents,
    lifetimeEarnedDollars: wallet.lifetime_earned_cents / 100,
    transactions: transactions.map(t => ({
      id: t.id,
      orderId: t.order_id,
      amountCents: t.amount_cents,
      amountDollars: t.amount_cents / 100,
      type: t.type,
      description: t.description,
      createdAt: t.created_at,
    })),
  };
}

export function creditWallet(db, { affiliateId, amountCents, orderId, description }) {
  const wallet = ensureWallet(db, affiliateId);
  db.run(
    "UPDATE affiliate_wallets SET balance_cents = balance_cents + ?, lifetime_earned_cents = lifetime_earned_cents + ? WHERE id = ?",
    [amountCents, amountCents, wallet.id]
  );
  db.run(
    "INSERT INTO affiliate_transactions (wallet_id, order_id, amount_cents, type, description) VALUES (?, ?, ?, 'earned', ?)",
    [wallet.id, orderId || null, amountCents, description || null]
  );
  // Also update legacy balance on affiliates table for compatibility
  db.run("UPDATE affiliates SET store_credit_balance = store_credit_balance + ? WHERE id = ?",
    [amountCents / 100, affiliateId]);
  return getWallet(db, affiliateId);
}

export function redeemWallet(db, { affiliateId, amountCents, description }) {
  const wallet = ensureWallet(db, affiliateId);
  if (wallet.balance_cents < amountCents) {
    throw new Error("Insufficient balance");
  }
  db.run(
    "UPDATE affiliate_wallets SET balance_cents = balance_cents - ? WHERE id = ?",
    [amountCents, wallet.id]
  );
  db.run(
    "INSERT INTO affiliate_transactions (wallet_id, amount_cents, type, description) VALUES (?, ?, 'redeemed', ?)",
    [wallet.id, amountCents, description || null]
  );
  db.run("UPDATE affiliates SET store_credit_balance = MAX(0, store_credit_balance - ?) WHERE id = ?",
    [amountCents / 100, affiliateId]);
  return getWallet(db, affiliateId);
}

// ═══════════════════════════════════════════════════════════════════
// P4.4v2: EARNINGS TIMELINE
// ═══════════════════════════════════════════════════════════════════

export function getEarningsTimeline(db, affiliateId, businessId) {
  return db.query(
    `SELECT
      ar.id,
      ar.commission_earned,
      ar.store_credit_issued,
      ar.discount_amount,
      ar.status,
      ar.created_at,
      o.order_number,
      o.customer_name,
      o.customer_email,
      o.total_amount as order_total
     FROM affiliate_referrals ar
     JOIN orders o ON ar.order_id = o.id
     WHERE ar.affiliate_id = ? AND ar.business_id = ?
     ORDER BY ar.created_at DESC
     LIMIT 100`
  ).all(affiliateId, businessId);
}

// ═══════════════════════════════════════════════════════════════════
// P4.4v2: COUPON GENERATION
// ═══════════════════════════════════════════════════════════════════

export function generateCoupon(db, { affiliateId, amountCents, businessId }) {
  const wallet = ensureWallet(db, affiliateId);
  if (wallet.balance_cents < amountCents) {
    throw new Error("Insufficient balance");
  }
  // Generate a unique code
  const prefix = "AFF";
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const code = `${prefix}-${random}`;

  // Deduct from wallet
  redeemWallet(db, { affiliateId, amountCents, description: `Coupon generated: ${code}` });

  const result = db.run(
    "INSERT INTO affiliate_coupons (affiliate_id, code, amount_cents, status) VALUES (?, ?, ?, 'active')",
    [affiliateId, code, amountCents]
  );
  return {
    id: result.lastInsertRowid,
    code,
    amountCents,
    amountDollars: amountCents / 100,
  };
}

export function listCoupons(db, affiliateId) {
  return db.query(
    "SELECT * FROM affiliate_coupons WHERE affiliate_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(affiliateId);
}

// ═══════════════════════════════════════════════════════════════════
// P4.4v2: REWARD SETTINGS
// ═══════════════════════════════════════════════════════════════════

export function getRewardSettings(db, businessId) {
  const settings = db.query(
    "SELECT * FROM affiliate_reward_settings WHERE business_id = ?"
  ).get(businessId);
  if (!settings) {
    db.run(
      "INSERT INTO affiliate_reward_settings (business_id, reward_type, config) VALUES (?, 'store_credit', '{}')",
      [businessId]
    );
    return { businessId, rewardType: "store_credit", config: {} };
  }
  return {
    ...settings,
    config: typeof settings.config === "string" ? JSON.parse(settings.config) : settings.config,
  };
}

export function updateRewardSettings(db, businessId, { rewardType, config }) {
  const result = db.run(
    `UPDATE affiliate_reward_settings
     SET reward_type = ?, config = ?, updated_at = datetime('now')
     WHERE business_id = ?`,
    [rewardType, JSON.stringify(config || {}), businessId]
  );
  if (result.changes === 0) {
    db.run(
      "INSERT INTO affiliate_reward_settings (business_id, reward_type, config) VALUES (?, ?, ?)",
      [businessId, rewardType, JSON.stringify(config || {})]
    );
  }
  return getRewardSettings(db, businessId);
}

// ═══════════════════════════════════════════════════════════════════
// P4.4v2: COMMISSION RULES
// ═══════════════════════════════════════════════════════════════════

export function getCommissionRules(db, businessId) {
  const rules = db.query(
    "SELECT * FROM affiliate_commission_rules WHERE business_id = ?"
  ).get(businessId);
  if (!rules) {
    db.run(
      `INSERT INTO affiliate_commission_rules (business_id, commission_type, rate, options)
       VALUES (?, 'percentage', 5, '{}')`,
      [businessId]
    );
    return { businessId, commissionType: "percentage", rate: 5, options: {} };
  }
  return {
    ...rules,
    options: typeof rules.options === "string" ? JSON.parse(rules.options) : rules.options,
  };
}

export function updateCommissionRules(db, businessId, { commissionType, rate, options }) {
  const result = db.run(
    `UPDATE affiliate_commission_rules
     SET commission_type = ?, rate = ?, options = ?, updated_at = datetime('now')
     WHERE business_id = ?`,
    [commissionType, rate, JSON.stringify(options || {}), businessId]
  );
  if (result.changes === 0) {
    db.run(
      "INSERT INTO affiliate_commission_rules (business_id, commission_type, rate, options) VALUES (?, ?, ?, ?)",
      [businessId, commissionType, rate, JSON.stringify(options || {})]
    );
  }
  return getCommissionRules(db, businessId);
}

// ═══════════════════════════════════════════════════════════════════
// P4.4v2: FRAUD DETECTION
// ═══════════════════════════════════════════════════════════════════

export function runFraudCheck(db, businessId) {
  const flags = [];

  // Self-referral: same email used by affiliate and customer
  const selfRefs = db.query(
    `SELECT ar.id, ar.affiliate_id, a.name as affiliate_name, a.email, o.customer_email, ar.created_at, o.order_number
     FROM affiliate_referrals ar
     JOIN affiliates a ON ar.affiliate_id = a.id
     JOIN orders o ON ar.order_id = o.id
     WHERE a.business_id = ? AND a.email IS NOT NULL AND LOWER(a.email) = LOWER(o.customer_email)
     ORDER BY ar.created_at DESC`
  ).all(businessId);
  for (const sr of selfRefs) {
    flags.push({
      type: "self_referral",
      affiliateId: sr.affiliate_id,
      affiliateName: sr.affiliate_name,
      orderId: sr.order_number,
      details: `Affiliate email (${sr.email}) matches customer email on order #${sr.order_number}`,
      createdAt: sr.created_at,
    });
  }

  // Suspicious patterns: multiple high-value orders from same affiliate in short window
  const suspicious = db.query(
    `SELECT a.id as affiliate_id, a.name as affiliate_name,
            COUNT(*) as cnt,
            SUM(o.total_amount) as total,
            MIN(ar.created_at) as first,
            MAX(ar.created_at) as last
     FROM affiliate_referrals ar
     JOIN affiliates a ON ar.affiliate_id = a.id
     JOIN orders o ON ar.order_id = o.id
     WHERE a.business_id = ?
       AND ar.created_at >= datetime('now', '-7 days')
     GROUP BY a.id
     HAVING cnt >= 3 AND total >= 200`
  ).all(businessId);
  for (const s of suspicious) {
    flags.push({
      type: "suspicious_volume",
      affiliateId: s.affiliate_id,
      affiliateName: s.affiliate_name,
      orderId: null,
      details: `${s.cnt} referrals generating ${(s.total || 0).toFixed(2)} in 7 days`,
      createdAt: s.last,
    });
  }

  // Get existing fraud flags
  const existingFlags = db.query(
    `SELECT ff.*, a.name as affiliate_name, o.order_number
     FROM affiliate_fraud_flags ff
     LEFT JOIN affiliates a ON ff.affiliate_id = a.id
     LEFT JOIN orders o ON ff.order_id = o.id
     WHERE ff.business_id = ?
     ORDER BY ff.created_at DESC`
  ).all(businessId);

  // Auto-create fraud flags for new detections
  for (const f of flags) {
    const existing = existingFlags.find(ef =>
      ef.affiliate_id === f.affiliateId && ef.flag_type === f.type
    );
    if (!existing) {
      db.run(
        "INSERT INTO affiliate_fraud_flags (business_id, affiliate_id, flag_type, details) VALUES (?, ?, ?, ?)",
        [businessId, f.affiliateId, f.type, f.details]
      );
    }
  }

  // Return all current flags
  return db.query(
    `SELECT ff.*, a.name as affiliate_name, a.discount_code, o.order_number
     FROM affiliate_fraud_flags ff
     LEFT JOIN affiliates a ON ff.affiliate_id = a.id
     LEFT JOIN orders o ON ff.order_id = o.id
     WHERE ff.business_id = ?
     ORDER BY ff.created_at DESC`
  ).all(businessId);
}

export function reviewFraudFlag(db, flagId, status, reviewerId) {
  db.run(
    "UPDATE affiliate_fraud_flags SET status = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?",
    [status, reviewerId, flagId]
  );
  return db.query("SELECT * FROM affiliate_fraud_flags WHERE id = ?").get(flagId);
}

// ═══════════════════════════════════════════════════════════════════
// P4.4v2: GOALS
// ═══════════════════════════════════════════════════════════════════

export function getGoals(db, affiliateId) {
  return db.query(
    "SELECT * FROM affiliate_goals WHERE affiliate_id = ? ORDER BY status ASC, created_at DESC"
  ).all(affiliateId);
}

export function createGoal(db, { affiliateId, businessId, title, target, reward }) {
  const result = db.run(
    "INSERT INTO affiliate_goals (affiliate_id, business_id, title, target, current, reward, status) VALUES (?, ?, ?, ?, 0, ?, 'active')",
    [affiliateId, businessId, title, target, reward || null]
  );
  return db.query("SELECT * FROM affiliate_goals WHERE id = ?").get(result.lastInsertRowid);
}

export function updateGoalProgress(db, goalId, current) {
  const goal = db.query("SELECT * FROM affiliate_goals WHERE id = ?").get(goalId);
  if (!goal) return null;
  const completed = current >= goal.target;
  db.run(
    "UPDATE affiliate_goals SET current = ?, status = ? WHERE id = ?",
    [current, completed ? "completed" : "active", goalId]
  );
  if (completed && goal.status !== "completed") {
    // Auto-credit wallet with reward if it's store credit
    if (goal.reward) {
      const match = goal.reward.match(/(\d+)/);
      if (match) {
        const amountCents = parseInt(match[0]) * 100;
        creditWallet(db, {
          affiliateId: goal.affiliate_id,
          amountCents,
          description: `Goal completed: ${goal.title}`,
        });
      }
    }
    return { ...goal, status: "completed", completed: true };
  }
  return { ...goal, current, completed, status: completed ? "completed" : "active" };
}

// ═══════════════════════════════════════════════════════════════════
// P4.4v2: REFERRAL TOOLKIT
// ═══════════════════════════════════════════════════════════════════

export function getToolkit(db, affiliateId, businessId) {
  const affiliate = db.query(
    "SELECT id, name, discount_code FROM affiliates WHERE id = ? AND business_id = ?"
  ).get(affiliateId, businessId);
  if (!affiliate) return null;

  const stats = db.query(
    "SELECT * FROM affiliate_toolkit_stats WHERE affiliate_id = ?"
  ).get(affiliateId) || { link_clicks: 0, conversions: 0, revenue_generated_cents: 0 };

  return {
    affiliateId: affiliate.id,
    affiliateName: affiliate.name,
    referralLink: `https://glitzyglitterexpress.com/?ref=${affiliate.discount_code}`,
    couponCode: affiliate.discount_code,
    linkClicks: stats.link_clicks || 0,
    conversions: stats.conversions || 0,
    revenueGeneratedCents: stats.revenue_generated_cents || 0,
    revenueGeneratedDollars: (stats.revenue_generated_cents || 0) / 100,
  };
}

// ═══════════════════════════════════════════════════════════════════
// P4.4v2: ENHANCED DASHBOARD
// ═══════════════════════════════════════════════════════════════════

export function getEnhancedDashboard(db, businessId) {
  const stats = getDashboardStats(db, businessId);
  const leaderboard = db.query(
    `SELECT
      a.id, a.name, a.discount_code, a.is_active,
      COUNT(ar.id) as referral_count,
      COALESCE(SUM(ar.commission_earned), 0) as total_commissions,
      (SELECT COALESCE(balance_cents, 0) FROM affiliate_wallets aw WHERE aw.affiliate_id = a.id) as wallet_balance_cents
     FROM affiliates a
     LEFT JOIN affiliate_referrals ar ON ar.affiliate_id = a.id
       AND ar.business_id = a.business_id
       AND ar.created_at >= datetime('now', '-30 days')
     WHERE a.business_id = ?
     GROUP BY a.id
     ORDER BY referral_count DESC
     LIMIT 5`
  ).all(businessId);

  const recentActivity = db.query(
    `SELECT ar.*, a.name as affiliate_name, a.discount_code,
            o.order_number, o.customer_name, o.total_amount as order_total
     FROM affiliate_referrals ar
     JOIN affiliates a ON ar.affiliate_id = a.id
     JOIN orders o ON ar.order_id = o.id
     WHERE ar.business_id = ?
     ORDER BY ar.created_at DESC
     LIMIT 5`
  ).all(businessId);

  const fraudFlags = db.query(
    "SELECT COUNT(*) as c FROM affiliate_fraud_flags WHERE business_id = ? AND status = 'pending'"
  ).get(businessId);

  return {
    ...stats,
    leaderboardPreview: leaderboard.map(e => ({
      ...e,
      walletBalanceDollars: (e.wallet_balance_cents || 0) / 100,
    })),
    recentActivity,
    pendingFraudFlags: fraudFlags?.c || 0,
  };
}
