/**
 * ShimmerStock Data Access Layer
 * ===============================
 * ALL database access goes through this module. Route files and middleware
 * must never write raw SQL — they call store functions instead.
 *
 * ── PostgreSQL Migration Path ──────────────────────────────────────────
 *
 * This module currently targets SQLite via bun:sqlite. To migrate to
 * PostgreSQL, only this file needs to change. Route files stay untouched.
 *
 * Key differences to handle:
 *
 *   SQLite                          PostgreSQL
 *   ──────                          ──────────
 *   ? placeholders                  $1, $2, $3 (positional)
 *   db.run(...).lastInsertRowid     INSERT ... RETURNING id
 *   INSERT OR IGNORE                INSERT ... ON CONFLICT (cols) DO NOTHING
 *   datetime('now')                 NOW()
 *   PRAGMA journal_mode=WAL         (not needed)
 *   PRAGMA foreign_keys=ON          (default)
 *   INTEGER PRIMARY KEY AUTOINCREMENT  SERIAL PRIMARY KEY
 *   TEXT (no native JSON)           JSONB for audit/sync details
 *   LIMIT ? OFFSET ?                LIMIT $n OFFSET $m
 *
 * Strategy:
 *   1. Create store.pg.js with the same function signatures.
 *   2. Swap `import * as store from "./store.js"` → `"./store.pg.js"`.
 *   3. All route files continue working with zero changes.
 */

// ═══════════════════════════════════════════════════════════════════════
// TRANSACTION WRAPPER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Wrap a callback in a database transaction.
 *
 * All store calls inside the callback run on the same transactional context.
 * If the callback throws, everything rolls back. If it returns, everything commits.
 *
 * Usage:
 *   const result = store.transaction(db, () => {
 *     store.createProduct(db, ...);
 *     store.logAuditEntry(db, ...);
 *     return { productId };
 *   });
 *
 * The callback receives db as its argument (same db instance, transactional).
 *
 * @param {import("bun:sqlite").Database} db
 * @param {(db: import("bun:sqlite").Database) => any} callback
 * @returns {any} The return value of the callback
 */
export function transaction(db, callback) {
  const txnFn = db.transaction(callback);
  return txnFn(db);
}

// ═══════════════════════════════════════════════════════════════════════
// AUTH — sessions, password reset tokens
// ═══════════════════════════════════════════════════════════════════════

/** Insert a new session and return lastInsertRowid. */
export function createSession(db, { userId, token, expiresAt, businessId }) {
  const result = db.run(
    "INSERT INTO sessions (user_id, token, expires_at, business_id) VALUES (?, ?, ?, ?)",
    [userId, token, expiresAt, businessId ?? null]
  );
  return result.lastInsertRowid;
}

/** Look up a session + user by token. Returns the joined row or null. */
export function getSessionByToken(db, token) {
  return db
    .query(
      `SELECT s.id, s.user_id, s.token, s.expires_at, s.business_id,
              u.username, u.display_name, u.role,
              COALESCE(s.business_id, ub.business_id) as effective_business_id,
              ub.role as business_role
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN user_businesses ub ON u.id = ub.user_id AND ub.is_active = 1
       WHERE s.token = ?`
    )
    .get(token);
}

/** Delete a single session by its ID. */
export function deleteSession(db, sessionId) {
  db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
}

/** Delete ALL sessions for a given user. */
export function deleteAllUserSessions(db, userId) {
  db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

/** Delete all sessions for a user EXCEPT a specific session. */
export function deleteOtherUserSessions(db, userId, exceptSessionId) {
  db.run("DELETE FROM sessions WHERE user_id = ? AND id != ?", [userId, exceptSessionId]);
}

/** Refresh (extend) a session's expiry. */
export function refreshSessionExpiry(db, sessionId, newExpiresAt) {
  db.run("UPDATE sessions SET expires_at = ? WHERE id = ?", [newExpiresAt, sessionId]);
}

/** Pin an authenticated session to the newly selected business. */
export function setSessionBusiness(db, sessionId, businessId) {
  db.run("UPDATE sessions SET business_id = ? WHERE id = ?", [businessId, sessionId]);
}

/** Look up a session by token (lightweight — only returns id + expires_at). */
export function getSessionExpiry(db, token) {
  return db
    .query("SELECT id, expires_at FROM sessions WHERE token = ?")
    .get(token);
}

// ═══════════════════════════════════════════════════════════════════════
// USERS — CRUD + password helpers
// ═══════════════════════════════════════════════════════════════════════

/** Get a user by username (no business join). */
export function getUserByUsername(db, username) {
  return db
    .query("SELECT id, username, password_hash, display_name, role, password_changed_at FROM users WHERE username = ?")
    .get(username);
}

/** Get a user by username with active business joined via user_businesses. */
export function getUserByUsernameWithBusiness(db, username) {
  return db
    .query(
      `SELECT u.id, u.username, u.password_hash, u.display_name, u.role,
              u.password_changed_at,
              ub.business_id, ub.role as business_role,
              b.name as business_name, b.slug as business_slug
       FROM users u
       LEFT JOIN user_businesses ub ON u.id = ub.user_id AND ub.is_active = 1
       LEFT JOIN businesses b ON ub.business_id = b.id
       WHERE u.username = ?`
    )
    .get(username);
}

/** Get a user by ID. */
export function getUserById(db, userId) {
  return db
    .query("SELECT id, username, password_hash, display_name, role, password_changed_at FROM users WHERE id = ?")
    .get(userId);
}

/** Get just the password_hash for a user. */
export function getUserPasswordHash(db, userId) {
  return db.query("SELECT password_hash FROM users WHERE id = ?").get(userId);
}

/** Update a user's password hash and set password_changed_at. */
export function updateUserPassword(db, userId, newHash) {
  db.run(
    "UPDATE users SET password_hash = ?, password_changed_at = datetime('now') WHERE id = ?",
    [newHash, userId]
  );
}

/** Set password_changed_at for a user. */
export function setPasswordChangedAt(db, userId) {
  db.run("UPDATE users SET password_changed_at = datetime('now') WHERE id = ?", [userId]);
}

/** Create a password reset token. Returns lastInsertRowid. */
export function createResetToken(db, { userId, token, expiresAt }) {
  const result = db.run(
    "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
    [userId, token, expiresAt]
  );
  return result.lastInsertRowid;
}

/** Look up a reset token record. */
export function getResetToken(db, token) {
  return db
    .query("SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token = ?")
    .get(token);
}

/** Mark a reset token as used. */
export function consumeResetToken(db, resetId) {
  db.run("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", [resetId]);
}

/** Delete all reset tokens for a user. */
export function deleteUserResetTokens(db, userId) {
  db.run("DELETE FROM password_reset_tokens WHERE user_id = ?", [userId]);
}

/** List all users in a business (via user_businesses junction). */
export function listUsers(db, businessId) {
  return db
    .query(
      `SELECT u.id, u.username, u.display_name, u.role, u.created_at, u.password_changed_at,
              ub.role as business_role
       FROM users u
       JOIN user_businesses ub ON u.id = ub.user_id
       WHERE ub.business_id = ?
       ORDER BY u.username ASC`
    )
    .all(businessId);
}

/** Create a new user (no business assignment). Returns lastInsertRowid. */
export function createUser(db, { username, hash, displayName, role }) {
  const result = db.run(
    "INSERT INTO users (username, password_hash, display_name, role, password_changed_at) VALUES (?, ?, ?, ?, datetime('now'))",
    [username, hash, displayName, role]
  );
  return result.lastInsertRowid;
}

/** Get a full user row scoped to business (via user_businesses). */
export function getUserByIdAndBusiness(db, userId, businessId) {
  return db
    .query(
      `SELECT u.id, u.username, u.display_name, u.role, u.created_at, u.password_changed_at,
              ub.role as business_role
       FROM users u
       JOIN user_businesses ub ON u.id = ub.user_id
       WHERE u.id = ? AND ub.business_id = ?`
    )
    .get(userId, businessId);
}

/** Update a user's mutable fields (display_name, role) — system-level fields. */
export function updateUser(db, userId, businessId, fields) {
  const updates = [];
  const values = [];

  if (fields.displayName !== undefined) {
    updates.push("display_name = ?");
    values.push(fields.displayName);
  }
  if (fields.role !== undefined) {
    updates.push("role = ?");
    values.push(fields.role);
  }

  if (updates.length === 0) return 0;

  // Verify user belongs to business before updating
  values.push(userId, businessId);
  const result = db.run(
    `UPDATE users SET ${updates.join(", ")} WHERE id = ? AND id IN (SELECT user_id FROM user_businesses WHERE user_id = ? AND business_id = ?)`,
    values
  );
  return result.changes;
}

/** Delete a user scoped to business (removes from user_businesses, then deletes user). */
export function deleteUser(db, userId, businessId) {
  // Remove from this business
  db.run("DELETE FROM user_businesses WHERE user_id = ? AND business_id = ?", [userId, businessId]);

  // If user has no remaining businesses, delete the user entirely
  const remaining = db.query("SELECT COUNT(*) as count FROM user_businesses WHERE user_id = ?").get(userId);
  if (remaining.count === 0) {
    db.run("DELETE FROM users WHERE id = ?", [userId]);
    return 2; // user fully deleted
  }
  return 1; // only removed from business
}

// ═══════════════════════════════════════════════════════════════════════
// BUSINESS
// ═══════════════════════════════════════════════════════════════════════

/** Get a business by ID. */
export function getBusinessById(db, businessId) {
  return db.query("SELECT id, name, slug FROM businesses WHERE id = ?").get(businessId);
}

/** Get just the business name. */
export function getBusinessName(db, businessId) {
  return db.query("SELECT name FROM businesses WHERE id = ?").get(businessId);
}

/** Get a business by slug. */
export function getBusinessBySlug(db, slug) {
  return db.query("SELECT id, name, slug FROM businesses WHERE slug = ?").get(slug);
}

/** Create a new business. Returns the created business row. */
export function createBusiness(db, name, slug) {
  const result = db.run(
    "INSERT INTO businesses (name, slug) VALUES (?, ?)",
    [name, slug]
  );
  return getBusinessById(db, result.lastInsertRowid);
}

/** Add a user to a business with a role. Returns lastInsertRowid. */
export function addUserToBusiness(db, userId, businessId, role = 'owner') {
  const result = db.run(
    "INSERT INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, ?, ?, 0)",
    [userId, businessId, role]
  );
  return result.lastInsertRowid;
}

/** Get all businesses for a user with role info. */
export function getUserBusinesses(db, userId) {
  return db
    .query(
      `SELECT ub.business_id, b.name, b.slug, ub.role, ub.is_active
       FROM user_businesses ub
       JOIN businesses b ON ub.business_id = b.id
       WHERE ub.user_id = ?
       ORDER BY ub.is_active DESC, ub.created_at ASC`
    )
    .all(userId);
}

/** Set the active business for a user (deactivate all others, activate this one). */
export function setActiveBusiness(db, userId, businessId) {
  db.run("UPDATE user_businesses SET is_active = 0 WHERE user_id = ?", [userId]);
  db.run("UPDATE user_businesses SET is_active = 1 WHERE user_id = ? AND business_id = ?", [userId, businessId]);
}

/** Get the active business for a user. */
export function getActiveBusiness(db, userId) {
  return db
    .query(
      `SELECT ub.business_id, b.name, b.slug, ub.role
       FROM user_businesses ub
       JOIN businesses b ON ub.business_id = b.id
       WHERE ub.user_id = ? AND ub.is_active = 1
       LIMIT 1`
    )
    .get(userId);
}

// ═══════════════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════════════

/** List all products for a business. */
export function listProducts(db, businessId) {
  return db
    .query("SELECT id, name, sku, barcode, stock_count FROM products WHERE business_id = ? ORDER BY name ASC")
    .all(businessId);
}

/** Get a product by SKU, scoped to business. */
export function getProductBySku(db, sku, businessId) {
  return db
    .query("SELECT id, name, sku, barcode, stock_count FROM products WHERE sku = ? AND business_id = ?")
    .get(sku, businessId);
}

/** Get a product by ID, scoped to business. */
export function getProductById(db, id, businessId) {
  return db
    .query("SELECT id, name, sku, barcode, stock_count FROM products WHERE id = ? AND business_id = ?")
    .get(id, businessId);
}

/** Get a product by barcode, scoped to business. */
export function getProductByBarcode(db, barcode, businessId) {
  return db
    .query("SELECT id, name, sku, barcode, stock_count FROM products WHERE barcode = ? AND business_id = ?")
    .get(barcode, businessId);
}

/** Create a product. Returns lastInsertRowid. */
export function createProduct(db, { name, sku, barcode, stockCount, businessId }) {
  const result = db.run(
    "INSERT INTO products (name, sku, barcode, stock_count, business_id) VALUES (?, ?, ?, ?, ?)",
    [name, sku, barcode ?? null, stockCount ?? 0, businessId]
  );
  return result.lastInsertRowid;
}

/** Update a product's mutable fields, scoped to business. Returns changes count. */
export function updateProduct(db, id, businessId, fields) {
  const updates = [];
  const values = [];

  if (fields.name !== undefined) {
    updates.push("name = ?");
    values.push(fields.name);
  }
  if (fields.sku !== undefined) {
    updates.push("sku = ?");
    values.push(fields.sku);
  }
  if (fields.barcode !== undefined) {
    updates.push("barcode = ?");
    values.push(fields.barcode ?? null);
  }
  if (fields.stockCount !== undefined) {
    updates.push("stock_count = ?");
    values.push(fields.stockCount);
  }
  if (fields.nameBarcodeUpdate) {
    // Specialized partial update for import: name + barcode only
    updates.push("name = ?");
    values.push(fields.nameBarcodeUpdate.name);
    updates.push("barcode = COALESCE(?, barcode)");
    values.push(fields.nameBarcodeUpdate.barcode);
  }

  if (updates.length === 0) return 0;

  updates.push("updated_at = datetime('now')");
  values.push(id, businessId);

  const result = db.run(
    `UPDATE products SET ${updates.join(", ")} WHERE id = ? AND business_id = ?`,
    values
  );
  return result.changes;
}

/** Update just the stock_count for a product, scoped to business. */
export function updateProductStock(db, id, businessId, newStock) {
  db.run(
    "UPDATE products SET stock_count = ?, updated_at = datetime('now') WHERE id = ? AND business_id = ?",
    [newStock, id, businessId]
  );
}

/** Delete a product and all its FK references. Returns the deleted product info or null. */
export function deleteProductCascade(db, id, businessId) {
  const product = getProductById(db, id, businessId);
  if (!product) return null;

  db.run("DELETE FROM inventory_movements WHERE product_id = ?", [id]);
  db.run("DELETE FROM order_scans WHERE product_id = ?", [id]);
  db.run("UPDATE order_items SET product_id = NULL WHERE product_id = ?", [id]);
  db.run("DELETE FROM products WHERE id = ? AND business_id = ?", [id, businessId]);
  return product;
}

/** Get low-stock products for a business. */
export function getLowStockProducts(db, businessId) {
  return db
    .query(
      "SELECT id, name, sku, barcode, stock_count FROM products WHERE stock_count <= 5 AND business_id = ? ORDER BY stock_count ASC"
    )
    .all(businessId);
}

/** Count total products for a business. */
export function countProducts(db, businessId) {
  return db
    .query("SELECT COUNT(*) as count FROM products WHERE business_id = ?")
    .get(businessId).count;
}

// ═══════════════════════════════════════════════════════════════════════
// INVENTORY MOVEMENTS
// ═══════════════════════════════════════════════════════════════════════

/** Record an inventory movement. Returns lastInsertRowid. */
export function recordMovement(db, { productId, type, quantity, userId, businessId }) {
  const result = db.run(
    "INSERT INTO inventory_movements (product_id, type, quantity, user_id, business_id) VALUES (?, ?, ?, ?, ?)",
    [productId, type, quantity, userId, businessId]
  );
  return result.lastInsertRowid;
}

/** Get recent movements with product info. */
export function getMovements(db, businessId, limit = 20) {
  return db
    .query(
      `SELECT m.id, m.type, m.quantity, m.created_at,
              p.id as product_id, p.name as product_name, p.sku, p.barcode, p.stock_count
       FROM inventory_movements m
       JOIN products p ON m.product_id = p.id
       WHERE m.business_id = ?
       ORDER BY m.created_at DESC
       LIMIT ?`
    )
    .all(businessId, limit);
}

/** Count today's movements of a specific type. */
export function countTodayMovements(db, businessId, type) {
  return db
    .query(
      "SELECT COUNT(*) as count FROM inventory_movements WHERE type = ? AND date(created_at) = date('now') AND business_id = ?"
    )
    .get(type, businessId).count;
}

/** Get the N most recent movements with product join. */
export function getRecentMovements(db, businessId, limit = 5) {
  return db
    .query(
      `SELECT m.id, m.type, m.quantity, m.created_at,
              p.id as product_id, p.name as product_name, p.sku, p.barcode
       FROM inventory_movements m
       JOIN products p ON m.product_id = p.id
       WHERE m.business_id = ?
       ORDER BY m.created_at DESC
       LIMIT ?`
    )
    .all(businessId, limit);
}

// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════

/** Create an order (Shopify). Returns lastInsertRowid. */
export function createOrder(db, { shopifyOrderId, orderNumber, customerName, businessId }) {
  const result = db.run(
    "INSERT INTO orders (shopify_order_id, order_number, customer_name, source, status, business_id) VALUES (?, ?, ?, 'shopify', 'pending', ?)",
    [shopifyOrderId, orderNumber, customerName, businessId]
  );
  return result.lastInsertRowid;
}

/** Create a manual order. Returns the new order's id. */
export function createManualOrder(db, { source, orderNumber, customerName, customerEmail, shippingAddress, notes, totalAmount, createdBy, businessId }) {
  const result = db.run(
    `INSERT INTO orders (shopify_order_id, order_number, customer_name, customer_email, shipping_address, source, status, notes, total_amount, created_by, business_id, imported_at)
     VALUES (NULL, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NULL)`,
    [orderNumber, customerName, customerEmail || null, shippingAddress || null, source, notes || null, totalAmount || null, createdBy || null, businessId]
  );
  return result.lastInsertRowid;
}

/** Update an order's fields. */
export function updateOrder(db, orderId, fields) {
  const allowed = ["customer_name", "customer_email", "shipping_address", "status", "notes", "total_amount"];
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
  }
  if (sets.length === 0) return;
  vals.push(orderId);
  db.run(`UPDATE orders SET ${sets.join(", ")} WHERE id = ?`, vals);
}

/** Get an order by Shopify order ID, scoped to business. */
export function getOrderByShopifyId(db, shopifyOrderId, businessId) {
  return db
    .query("SELECT id FROM orders WHERE shopify_order_id = ? AND business_id = ?")
    .get(shopifyOrderId, businessId);
}

/** Get an order by local ID, scoped to business. */
export function getOrderById(db, id, businessId) {
  return db
    .query(`SELECT id, shopify_order_id, order_number, customer_name, customer_email,
            shipping_address, source, status, notes, total_amount, created_by,
            created_at, imported_at
     FROM orders WHERE id = ? AND business_id = ?`)
    .get(id, businessId);
}

/** Get a full order with items, variant info, and creator. */
export function getOrderByIdFull(db, id, businessId) {
  const order = db
    .query(`SELECT o.id, o.shopify_order_id, o.order_number, o.customer_name, o.customer_email,
            o.shipping_address, o.source, o.status, o.notes, o.total_amount, o.created_by,
            o.created_at, o.imported_at,
            u.display_name as created_by_name
     FROM orders o
     LEFT JOIN users u ON o.created_by = u.id
     WHERE o.id = ? AND o.business_id = ?`)
    .get(id, businessId);
  if (!order) return null;

  const items = db
    .query(`SELECT oi.id, oi.sku, oi.variant_title, oi.quantity, oi.scanned_quantity,
            oi.unit_price, oi.line_total, oi.variant_id,
            p.id as product_id, p.name as product_name, p.barcode,
            pv.variant_value, pv.price as variant_price
     FROM order_items oi
     LEFT JOIN products p ON oi.product_id = p.id
     LEFT JOIN product_variants pv ON oi.variant_id = pv.id
     WHERE oi.order_id = ?
     ORDER BY oi.id`)
    .all(id);

  return { ...order, items };
}

/** Get just the order status. */
export function getOrderStatus(db, orderId) {
  return db.query("SELECT id, status FROM orders WHERE id = ?").get(orderId);
}

/** Update an order's status. */
export function updateOrderStatus(db, orderId, status) {
  db.run("UPDATE orders SET status = ? WHERE id = ?", [status, orderId]);
}

/** Cancel an order. */
export function cancelOrder(db, orderId, businessId) {
  const order = db.query("SELECT id FROM orders WHERE id = ? AND business_id = ?").get(orderId, businessId);
  if (!order) return false;
  db.run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [orderId]);
  return true;
}

/** Create an order item. Returns lastInsertRowid. */
export function createOrderItem(db, { orderId, productId, sku, variantTitle, quantity, businessId }) {
  const result = db.run(
    "INSERT INTO order_items (order_id, product_id, sku, variant_title, quantity, business_id) VALUES (?, ?, ?, ?, ?, ?)",
    [orderId, productId ?? null, sku, variantTitle, quantity, businessId]
  );
  return result.lastInsertRowid;
}

/** Create an order item with variant and pricing info. */
export function createOrderItemWithVariant(db, { orderId, productId, variantId, sku, variantTitle, quantity, unitPrice, lineTotal, businessId }) {
  const result = db.run(
    "INSERT INTO order_items (order_id, product_id, variant_id, sku, variant_title, quantity, unit_price, line_total, business_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [orderId, productId ?? null, variantId ?? null, sku, variantTitle, quantity, unitPrice ?? null, lineTotal ?? null, businessId]
  );
  return result.lastInsertRowid;
}

/** Delete an order item. */
export function deleteOrderItem(db, itemId) {
  db.run("DELETE FROM order_items WHERE id = ?", [itemId]);
}

/** Get all items for an order with product info. */
export function getOrderItemsByOrderId(db, orderId) {
  return db
    .query(
      `SELECT oi.id, oi.sku, oi.variant_title, oi.quantity, oi.scanned_quantity,
              oi.unit_price, oi.line_total, oi.variant_id,
              p.id as product_id, p.name as product_name, p.barcode
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?
       ORDER BY oi.id`
    )
    .all(orderId);
}

/** Get an order item matching a barcode within an order. */
export function getOrderItemByBarcode(db, orderId, barcode) {
  return db
    .query(
      `SELECT oi.id, oi.sku, oi.variant_title, oi.quantity, oi.scanned_quantity,
              oi.product_id, p.name as product_name, p.barcode
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ? AND p.barcode = ?`
    )
    .get(orderId, barcode);
}

/** Get an order item matching a SKU within an order (scanned/typed fallback). */
export function getOrderItemBySku(db, orderId, sku) {
  return db
    .query(
      `SELECT oi.id, oi.sku, oi.variant_title, oi.quantity, oi.scanned_quantity,
              oi.product_id, p.name as product_name, p.barcode
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ? AND (p.sku = ? OR oi.sku = ?)`
    )
    .get(orderId, sku, sku);
}

/** Increment the scanned_quantity for an order item. */
export function incrementOrderItemScanned(db, itemId, qty = 1) {
  db.run("UPDATE order_items SET scanned_quantity = scanned_quantity + ? WHERE id = ?", [qty, itemId]);
}

/** List all orders for a business with item summaries. */
export function listOrders(db, businessId) {
  return db
    .query(
      `SELECT o.id, o.shopify_order_id, o.order_number, o.customer_name, o.source, o.status,
              o.created_at, o.imported_at,
              COUNT(oi.id) AS item_count,
              SUM(oi.quantity) AS total_qty,
              SUM(CASE WHEN oi.scanned_quantity >= oi.quantity THEN 1 ELSE 0 END) AS scanned_items,
              COALESCE(o.total_amount, SUM(oi.line_total)) AS total_amount
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.business_id = ?
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    )
    .all(businessId);
}

/** List orders with filtering. */
export function listOrdersFiltered(db, businessId, filters = {}) {
  const conditions = ["o.business_id = ?"];
  const params = [businessId];

  if (filters.source) {
    conditions.push("o.source = ?");
    params.push(filters.source);
  }
  if (filters.status) {
    conditions.push("o.status = ?");
    params.push(filters.status);
  }
  if (filters.dateFrom) {
    conditions.push("o.created_at >= ?");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push("o.created_at <= ?");
    params.push(filters.dateTo);
  }
  if (filters.search) {
    conditions.push("(o.customer_name LIKE ? OR o.order_number LIKE ? OR o.customer_email LIKE ?)");
    const q = `%${filters.search}%`;
    params.push(q, q, q);
  }

  const where = conditions.join(" AND ");
  return db
    .query(
      `SELECT o.id, o.shopify_order_id, o.order_number, o.customer_name, o.source, o.status,
              o.created_at, o.imported_at, o.customer_email,
              COUNT(oi.id) AS item_count,
              SUM(oi.quantity) AS total_qty,
              SUM(CASE WHEN oi.scanned_quantity >= oi.quantity THEN 1 ELSE 0 END) AS scanned_items,
              COALESCE(o.total_amount, SUM(oi.line_total)) AS total_amount
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE ${where}
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT ?`
    )
    .all(...params, filters.limit || 100);
}

/** Get existing order items for an order (for diffing in readonly mode). */
export function getOrderItemsForDiff(db, orderId) {
  return db
    .query(
      "SELECT oi.sku, oi.variant_title, oi.quantity, p.stock_count, p.name FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?"
    )
    .all(orderId);
}

/** Count order items that still need scanning. */
export function countPendingOrderItems(db, orderId) {
  return db
    .query("SELECT COUNT(*) as count FROM order_items WHERE order_id = ? AND scanned_quantity < quantity")
    .get(orderId);
}

/** Reset all scanned quantities and delete scans for an order. */
export function resetOrderScans(db, orderId) {
  db.run("UPDATE order_items SET scanned_quantity = 0 WHERE order_id = ?", [orderId]);
  db.run("DELETE FROM order_scans WHERE order_id = ?", [orderId]);
}

/** Get the next available manual order number for a business. */
export function getNextOrderNumber(db, businessId) {
  const row = db
    .query("SELECT COALESCE(MAX(order_number), 999) + 1 AS next_num FROM orders WHERE business_id = ? AND order_number >= 1000")
    .get(businessId);
  return row.next_num;
}

/** Search products (with variants) for manual order item selection. */
export function searchProductsForOrder(db, businessId, query) {
  const q = `%${query}%`;
  return db
    .query(
      `SELECT p.id, p.name, p.sku, p.stock_count,
              pv.id as variant_id, pv.sku as variant_sku, pv.variant_value, pv.price, pv.cost, pv.stock_count as variant_stock
       FROM products p
       LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.business_id = p.business_id
       WHERE p.business_id = ? AND (p.name LIKE ? OR p.sku LIKE ? OR pv.sku LIKE ? OR pv.variant_value LIKE ?)
       ORDER BY p.name, pv.variant_value
       LIMIT 25`
    )
    .all(businessId, q, q, q, q);
}

// ═══════════════════════════════════════════════════════════════════════
// ORDER SCANS
// ═══════════════════════════════════════════════════════════════════════

/** Record a barcode scan against an order item. Returns lastInsertRowid. */
export function createOrderScan(db, { orderId, orderItemId, productId, barcode, userId, businessId }) {
  const result = db.run(
    "INSERT INTO order_scans (order_id, order_item_id, product_id, barcode, user_id, business_id) VALUES (?, ?, ?, ?, ?, ?)",
    [orderId, orderItemId, productId ?? null, barcode, userId, businessId]
  );
  return result.lastInsertRowid;
}

// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════

/** Insert a single audit log entry. Returns lastInsertRowid. */
export function logAuditEntry(db, {
  businessId,
  userId,
  actionType,
  entityType,
  entityId = null,
  previousValue = null,
  newValue = null,
  source = "manual",
  deviceInfo = null,
  reason = null,
}) {
  try {
    const result = db.run(
      `INSERT INTO audit_log
       (business_id, user_id, action_type, entity_type, entity_id,
        previous_value, new_value, source, device_info, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId,
        userId ?? null,
        actionType,
        entityType,
        entityId ?? null,
        previousValue ? JSON.stringify(previousValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        source || "manual",
        deviceInfo || null,
        reason || null,
      ]
    );
    return result.lastInsertRowid;
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err.message);
    return null;
  }
}

/** Get paginated audit log entries with optional entity_type filter. */
export function getAuditLog(db, businessId, { entityType = null, limit = 50, offset = 0 } = {}) {
  let query = `
    SELECT a.id, a.action_type, a.entity_type, a.entity_id,
           a.previous_value, a.new_value, a.source, a.device_info,
           a.reason, a.created_at,
           u.display_name as user_display_name, u.username
    FROM audit_log a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.business_id = ?
  `;
  const params = [businessId];

  if (entityType) {
    query += " AND a.entity_type = ?";
    params.push(entityType);
  }

  query += " ORDER BY a.created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  return db.query(query).all(...params);
}

/** Count audit log entries (optionally filtered by entity_type). */
export function countAuditLog(db, businessId, entityType = null) {
  let query = "SELECT COUNT(*) as total FROM audit_log WHERE business_id = ?";
  const params = [businessId];
  if (entityType) {
    query += " AND entity_type = ?";
    params.push(entityType);
  }
  return db.query(query).get(...params).total;
}

/** Get distinct entity_types from audit_log for a business. */
export function getAuditEntityTypes(db, businessId) {
  return db
    .query("SELECT DISTINCT entity_type FROM audit_log WHERE business_id = ? ORDER BY entity_type")
    .all(businessId)
    .map((r) => r.entity_type);
}

/**
 * Get timeline entries with engine classification, search, and date filtering.
 * Used by GET /api/timeline for the unified Business Timeline.
 */
export function getTimelineEntries(db, businessId, {
  limit = 50,
  offset = 0,
  engine = null,
  search = null,
  dateFrom = null,
  dateTo = null,
} = {}) {
  let where = "WHERE a.business_id = ?";
  const params = [businessId];

  if (dateFrom) {
    where += " AND a.created_at >= ?";
    params.push(dateFrom);
  }
  if (dateTo) {
    where += " AND a.created_at <= ?";
    params.push(dateTo);
  }
  if (search) {
    where += " AND (a.action_type LIKE ? OR a.entity_type LIKE ? OR a.new_value LIKE ? OR u.display_name LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const query = `
    SELECT a.id, a.action_type, a.entity_type, a.entity_id,
           a.previous_value, a.new_value, a.source, a.device_info,
           a.reason, a.created_at,
           u.display_name as user_display_name, u.username
    FROM audit_log a
    LEFT JOIN users u ON a.user_id = u.id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  return db.query(query).all(...params);
}

/** Count timeline entries matching the same filters. */
export function countTimelineEntries(db, businessId, {
  engine = null,
  search = null,
  dateFrom = null,
  dateTo = null,
} = {}) {
  let where = "WHERE a.business_id = ?";
  const params = [businessId];

  if (dateFrom) {
    where += " AND a.created_at >= ?";
    params.push(dateFrom);
  }
  if (dateTo) {
    where += " AND a.created_at <= ?";
    params.push(dateTo);
  }
  if (search) {
    where += " AND (a.action_type LIKE ? OR a.entity_type LIKE ? OR a.new_value LIKE ? OR u.display_name LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const query = `
    SELECT COUNT(*) as total
    FROM audit_log a
    LEFT JOIN users u ON a.user_id = u.id
    ${where}
  `;
  return db.query(query).get(...params).total;
}

// ═══════════════════════════════════════════════════════════════════════
// SYNC LOG (shopify_sync_log)
// ═══════════════════════════════════════════════════════════════════════

/** Insert a sync log entry (idempotent via INSERT OR IGNORE). Returns lastInsertRowid or null. */
export function logSyncEntry(db, {
  businessId,
  idempotencyKey,
  action,
  shopifyOrderId = null,
  shopifyProductId = null,
  provider = 'shopify',
  externalId = null,
  entityType = null,
  entityId = null,
  status,
  details = null,
  errorMessage = null,
}) {
  try {
    const result = db.run(
      `INSERT OR IGNORE INTO shopify_sync_log
       (business_id, idempotency_key, action, shopify_order_id, shopify_product_id,
        provider, external_id,
        entity_type, entity_id, status, details, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId,
        idempotencyKey,
        action,
        shopifyOrderId || null,
        shopifyProductId || null,
        provider || 'shopify',
        externalId || null,
        entityType || null,
        entityId || null,
        status,
        details ? JSON.stringify(details) : null,
        errorMessage || null,
      ]
    );
    return result.lastInsertRowid;
  } catch (err) {
    console.error("[sync] Failed to write sync log:", err.message);
    return null;
  }
}

/** Get paginated sync log entries. */
export function getSyncLog(db, businessId, { status = null, limit = 50, offset = 0 } = {}) {
  let query = `
    SELECT id, business_id, idempotency_key, action, shopify_order_id,
           shopify_product_id, provider, external_id,
           entity_type, entity_id, status, details,
           error_message, created_at
    FROM shopify_sync_log
    WHERE business_id = ?
  `;
  const params = [businessId];

  if (status) {
    query += " AND status = ?";
    params.push(status);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  return db.query(query).all(...params);
}

/** Count sync log entries (optionally filtered by status). */
export function countSyncLog(db, businessId, status = null) {
  let query = "SELECT COUNT(*) as total FROM shopify_sync_log WHERE business_id = ?";
  const params = [businessId];
  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  return db.query(query).get(...params).total;
}

/** Get sync log counts grouped by status. */
export function getSyncLogStatusCounts(db, businessId) {
  return db
    .query(
      "SELECT status, COUNT(*) as count FROM shopify_sync_log WHERE business_id = ? GROUP BY status"
    )
    .all(businessId);
}

/** Get a single sync log entry by ID, scoped to business. */
export function getSyncLogById(db, id, businessId) {
  return db
    .query("SELECT * FROM shopify_sync_log WHERE id = ? AND business_id = ?")
    .get(id, businessId);
}

/** Check if a sync key already has a 'success' entry. */
export function isDuplicate(db, businessId, key) {
  const exists = db
    .query(
      "SELECT id FROM shopify_sync_log WHERE business_id = ? AND idempotency_key = ? AND status = 'success'"
    )
    .get(businessId, key);
  return !!exists;
}

/** Check if a sync key has a 'dry_run' entry. */
export function wasDryRun(db, businessId, key) {
  const exists = db
    .query(
      "SELECT id FROM shopify_sync_log WHERE business_id = ? AND idempotency_key = ? AND status = 'dry_run'"
    )
    .get(businessId, key);
  return !!exists;
}

/** Check if a sync key was attempted in any status (not pending). */
export function wasAttempted(db, businessId, key) {
  const exists = db
    .query(
      "SELECT id FROM shopify_sync_log WHERE business_id = ? AND idempotency_key = ? AND status IN ('success', 'skipped', 'failed', 'dry_run')"
    )
    .get(businessId, key);
  return !!exists;
}

/** Update an existing sync log entry's status (e.g. for retry). */
export function updateSyncLogStatus(db, id, status, errorMessage = null) {
  db.run(
    "UPDATE shopify_sync_log SET status = ?, error_message = ? WHERE id = ?",
    [status, errorMessage || null, id]
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════

/** Check if a role has a specific permission. Returns truthy if yes. */
export function getRolePermission(db, role, permission) {
  return db
    .query("SELECT 1 FROM role_permissions WHERE role = ? AND permission = ?")
    .get(role, permission);
}

// ═══════════════════════════════════════════════════════════════════════
// BOMS (Bill of Materials)
// ═══════════════════════════════════════════════════════════════════════

/** Create a BOM. Returns lastInsertRowid. */
export function createBom(db, { businessId, name, outputProductId, outputQuantity = 1, outputUnit = 'unit' }) {
  const result = db.run(
    "INSERT INTO boms (business_id, name, output_product_id, output_quantity, output_unit) VALUES (?, ?, ?, ?, ?)",
    [businessId, name, outputProductId, outputQuantity, outputUnit]
  );
  return result.lastInsertRowid;
}

/** Get a BOM with output product info, scoped to business. */
export function getBom(db, bomId, businessId) {
  return db
    .query(
      `SELECT b.*, p.name as output_product_name, p.sku as output_product_sku, p.stock_count as output_stock_count
       FROM boms b
       JOIN products p ON b.output_product_id = p.id
       WHERE b.id = ? AND b.business_id = ?`
    )
    .get(bomId, businessId);
}

/** List all BOMs for a business. */
export function listBoms(db, businessId) {
  return db
    .query(
      `SELECT b.*, p.name as output_product_name, p.sku as output_product_sku, p.stock_count as output_stock_count
       FROM boms b
       JOIN products p ON b.output_product_id = p.id
       WHERE b.business_id = ?
       ORDER BY b.name ASC`
    )
    .all(businessId);
}

/** Update a BOM's mutable fields. Returns changes count. */
export function updateBom(db, bomId, businessId, fields) {
  const updates = [];
  const values = [];

  if (fields.name !== undefined) { updates.push("name = ?"); values.push(fields.name); }
  if (fields.outputProductId !== undefined) { updates.push("output_product_id = ?"); values.push(fields.outputProductId); }
  if (fields.outputQuantity !== undefined) { updates.push("output_quantity = ?"); values.push(fields.outputQuantity); }
  if (fields.outputUnit !== undefined) { updates.push("output_unit = ?"); values.push(fields.outputUnit); }
  if (fields.isActive !== undefined) { updates.push("is_active = ?"); values.push(fields.isActive); }

  if (updates.length === 0) return 0;
  values.push(bomId, businessId);

  const result = db.run(
    `UPDATE boms SET ${updates.join(", ")} WHERE id = ? AND business_id = ?`,
    values
  );
  return result.changes;
}

/** Delete a BOM and its items. Returns the deleted BOM or null. */
export function deleteBom(db, bomId, businessId) {
  const bom = getBom(db, bomId, businessId);
  if (!bom) return null;
  db.run("DELETE FROM bom_items WHERE bom_id = ?", [bomId]);
  db.run("DELETE FROM boms WHERE id = ? AND business_id = ?", [bomId, businessId]);
  return bom;
}

// ── BOM Items ────────────────────────────────────────────────────────

/** Add an item to a BOM. Returns lastInsertRowid. */
export function addBomItem(db, { bomId, inputProductId, quantityPerBatch, unit = 'unit', sortOrder = 0 }) {
  const result = db.run(
    "INSERT INTO bom_items (bom_id, input_product_id, quantity_per_batch, unit, sort_order) VALUES (?, ?, ?, ?, ?)",
    [bomId, inputProductId, quantityPerBatch, unit, sortOrder]
  );
  return result.lastInsertRowid;
}

/** Get all items for a BOM with product info. */
export function getBomItems(db, bomId) {
  return db
    .query(
      `SELECT bi.*, p.name as input_product_name, p.sku as input_product_sku, p.stock_count as input_stock_count,
              p.barcode as input_barcode
       FROM bom_items bi
       JOIN products p ON bi.input_product_id = p.id
       WHERE bi.bom_id = ?
       ORDER BY bi.sort_order, bi.id`
    )
    .all(bomId);
}

/** Update a BOM item. Returns changes count. */
export function updateBomItem(db, itemId, fields) {
  const updates = [];
  const values = [];

  if (fields.inputProductId !== undefined) { updates.push("input_product_id = ?"); values.push(fields.inputProductId); }
  if (fields.quantityPerBatch !== undefined) { updates.push("quantity_per_batch = ?"); values.push(fields.quantityPerBatch); }
  if (fields.unit !== undefined) { updates.push("unit = ?"); values.push(fields.unit); }
  if (fields.sortOrder !== undefined) { updates.push("sort_order = ?"); values.push(fields.sortOrder); }

  if (updates.length === 0) return 0;
  values.push(itemId);

  const result = db.run(
    `UPDATE bom_items SET ${updates.join(", ")} WHERE id = ?`,
    values
  );
  return result.changes;
}

/** Delete a BOM item. */
export function deleteBomItem(db, itemId) {
  db.run("DELETE FROM bom_items WHERE id = ?", [itemId]);
}

// ═══════════════════════════════════════════════════════════════════════
// PRODUCTION BATCHES
// ═══════════════════════════════════════════════════════════════════════

/** Create a production batch. Returns lastInsertRowid. */
export function createBatch(db, { businessId, bomId, batchSize = 1, notes = null, createdBy = null }) {
  const result = db.run(
    "INSERT INTO production_batches (business_id, bom_id, batch_size, notes, created_by) VALUES (?, ?, ?, ?, ?)",
    [businessId, bomId, batchSize, notes, createdBy]
  );
  return result.lastInsertRowid;
}

/** Get a single batch with BOM info, scoped to business. */
export function getBatch(db, batchId, businessId) {
  return db
    .query(
      `SELECT pb.*, b.name as bom_name, b.output_quantity, b.output_unit,
              p.name as output_product_name, p.sku as output_product_sku,
              u.display_name as created_by_name
       FROM production_batches pb
       JOIN boms b ON pb.bom_id = b.id
       JOIN products p ON b.output_product_id = p.id
       LEFT JOIN users u ON pb.created_by = u.id
       WHERE pb.id = ? AND pb.business_id = ?`
    )
    .get(batchId, businessId);
}

/** List batches for a business with BOM info. */
export function listBatches(db, businessId) {
  return db
    .query(
      `SELECT pb.*, b.name as bom_name,
              p.name as output_product_name, p.sku as output_product_sku,
              u.display_name as created_by_name
       FROM production_batches pb
       JOIN boms b ON pb.bom_id = b.id
       JOIN products p ON b.output_product_id = p.id
       LEFT JOIN users u ON pb.created_by = u.id
       WHERE pb.business_id = ?
       ORDER BY pb.created_at DESC`
    )
    .all(businessId);
}

/** Update a batch's status. */
export function updateBatchStatus(db, batchId, status, extra = {}) {
  const updates = ["status = ?"];
  const values = [status];

  if (status === "in_progress") {
    updates.push("started_at = datetime('now')");
  }
  if (status === "completed") {
    updates.push("completed_at = datetime('now')");
  }
  if (extra.notes !== undefined) {
    updates.push("notes = ?");
    values.push(extra.notes);
  }

  values.push(batchId);
  db.run(`UPDATE production_batches SET ${updates.join(", ")} WHERE id = ?`, values);
}

/** Get pending (draft) batches for a business — "What should I manufacture today?" */
export function getPendingBatches(db, businessId) {
  return db
    .query(
      `SELECT pb.*, b.name as bom_name, b.output_quantity, b.output_unit,
              p.name as output_product_name, p.sku as output_product_sku,
              p.stock_count as output_stock_count
       FROM production_batches pb
       JOIN boms b ON pb.bom_id = b.id
       JOIN products p ON b.output_product_id = p.id
       WHERE pb.business_id = ? AND pb.status = 'draft'
       ORDER BY pb.created_at ASC`
    )
    .all(businessId);
}

// ── Batch Movements ──────────────────────────────────────────────────

/** Record a batch movement. */
export function recordBatchMovement(db, { batchId, productId, direction, plannedQuantity, actualQuantity, unit = 'unit' }) {
  db.run(
    "INSERT INTO batch_movements (batch_id, product_id, direction, planned_quantity, actual_quantity, unit) VALUES (?, ?, ?, ?, ?, ?)",
    [batchId, productId, direction, plannedQuantity, actualQuantity, unit]
  );
}

/** Get all movements for a batch with product info. */
export function getBatchMovements(db, batchId) {
  return db
    .query(
      `SELECT bm.*, p.name as product_name, p.sku as product_sku
       FROM batch_movements bm
       JOIN products p ON bm.product_id = p.id
       WHERE bm.batch_id = ?
       ORDER BY bm.id`
    )
    .all(batchId);
}

// ═══════════════════════════════════════════════════════════════════════
// BATCH EXECUTION & CANCELLATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Execute a production batch — the core operation.
 *
 * In a single transaction:
 *   1. Validate batch is in 'draft' status
 *   2. Get BOM items × batch_size to calculate consumption
 *   3. Check stock availability for all inputs
 *   4. Consume input inventory (decrement stock_count)
 *   5. Produce output inventory (increment stock_count)
 *   6. Record all movements (planned vs actual)
 *   7. Audit log every change
 *   8. Update batch status to 'completed'
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} batchId
 * @param {number} businessId
 * @param {number} userId
 * @returns {object} Result with batch, movements, consumed, produced
 */
export function executeBatch(db, batchId, businessId, userId) {
  return transaction(db, (txnDb) => {
    // 1. Validate batch
    const batch = txnDb
      .query("SELECT * FROM production_batches WHERE id = ? AND business_id = ? AND status = 'draft'")
      .get(batchId, businessId);

    if (!batch) {
      const existing = txnDb
        .query("SELECT id, status FROM production_batches WHERE id = ? AND business_id = ?")
        .get(batchId, businessId);
      if (!existing) throw Object.assign(new Error("Batch not found"), { statusCode: 404 });
      throw Object.assign(new Error(`Batch is ${existing.status}, not draft`), { statusCode: 409 });
    }

    // 2. Get BOM + items
    const bom = getBom(txnDb, batch.bom_id, businessId);
    if (!bom) throw Object.assign(new Error("BOM not found"), { statusCode: 404 });
    if (!bom.is_active) throw Object.assign(new Error("BOM is inactive"), { statusCode: 400 });

    const bomItems = getBomItems(txnDb, batch.bom_id);
    if (bomItems.length === 0) throw Object.assign(new Error("BOM has no items — add components first"), { statusCode: 400 });

    // 3. Check stock availability for ALL inputs first (fail fast)
    const multiplier = batch.batch_size;
    const stockChecks = [];
    for (const item of bomItems) {
      const needed = item.quantity_per_batch * multiplier;
      const available = item.input_stock_count || 0;
      stockChecks.push({ item, needed, available });
      if (available < needed) {
        throw Object.assign(
          new Error(`Insufficient stock: ${item.input_product_name} (${item.input_product_sku}) needs ${needed} ${item.unit} but only ${available} available`),
          { statusCode: 409, shortage: { productId: item.input_product_id, name: item.input_product_name, sku: item.input_product_sku, needed, available } }
        );
      }
    }

    // 4–5. Execute: consume inputs, produce outputs
    const movements = [];

    for (const check of stockChecks) {
      const { item, needed } = check;
      const newStock = item.input_stock_count - needed;

      // Update stock
      const flooredInputStock = Math.max(0, newStock);
      if (newStock < 0) {
        console.error(
          `[executeBatch] UNEXPECTED STOCKOUT during batch execution: ${item.input_product_name} (${item.input_product_sku}) — needed ${needed}, had ${item.input_stock_count}. Shortfall: ${Math.abs(newStock)}. Stock set to 0.`
        );
      }
      updateProductStock(txnDb, item.input_product_id, businessId, flooredInputStock);

      // Record inventory movement
      recordMovement(txnDb, {
        productId: item.input_product_id,
        type: "out",
        quantity: needed,
        userId,
        businessId,
      });

      // Record batch movement
      recordBatchMovement(txnDb, {
        batchId,
        productId: item.input_product_id,
        direction: "consumed",
        plannedQuantity: needed,
        actualQuantity: needed,
        unit: item.unit,
      });

      movements.push({
        productId: item.input_product_id,
        productName: item.input_product_name,
        sku: item.input_product_sku,
        direction: "consumed",
        planned: needed,
        actual: needed,
        unit: item.unit,
      });
    }

    // Produce output
    const outputQty = bom.output_quantity * multiplier;
    const outputProduct = txnDb
      .query("SELECT id, name, sku, stock_count FROM products WHERE id = ? AND business_id = ?")
      .get(bom.output_product_id, businessId);

    if (!outputProduct) throw Object.assign(new Error("Output product not found"), { statusCode: 404 });

    const newOutputStock = outputProduct.stock_count + outputQty;
    updateProductStock(txnDb, bom.output_product_id, businessId, newOutputStock);

    recordMovement(txnDb, {
      productId: bom.output_product_id,
      type: "in",
      quantity: outputQty,
      userId,
      businessId,
    });

    recordBatchMovement(txnDb, {
      batchId,
      productId: bom.output_product_id,
      direction: "produced",
      plannedQuantity: outputQty,
      actualQuantity: outputQty,
      unit: bom.output_unit,
    });

    movements.push({
      productId: bom.output_product_id,
      productName: outputProduct.name,
      sku: outputProduct.sku,
      direction: "produced",
      planned: outputQty,
      actual: outputQty,
      unit: bom.output_unit,
    });

    // 8. Update batch status
    updateBatchStatus(txnDb, batchId, "completed");

    return {
      batchId,
      bomId: batch.bom_id,
      bomName: bom.name,
      batchSize: multiplier,
      status: "completed",
      consumed: movements.filter((m) => m.direction === "consumed"),
      produced: movements.filter((m) => m.direction === "produced"),
      outputProductName: outputProduct.name,
      outputProductSku: outputProduct.sku,
      outputQuantity: outputQty,
      outputUnit: bom.output_unit,
    };
  });
}

/**
 * Cancel a production batch — reverse everything.
 *
 * In a single transaction:
 *   1. Validate batch is in 'completed' status
 *   2. Get batch movements
 *   3. Reverse consumed: restore input inventory
 *   4. Reverse produced: remove output inventory
 *   5. Audit all reversals
 *   6. Update batch status to 'cancelled'
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} batchId
 * @param {number} businessId
 * @param {number} userId
 * @returns {object} Result with reversal details
 */
export function cancelBatch(db, batchId, businessId, userId) {
  return transaction(db, (txnDb) => {
    // 1. Validate batch
    const batch = txnDb
      .query("SELECT * FROM production_batches WHERE id = ? AND business_id = ? AND status = 'completed'")
      .get(batchId, businessId);

    if (!batch) {
      const existing = txnDb
        .query("SELECT id, status FROM production_batches WHERE id = ? AND business_id = ?")
        .get(batchId, businessId);
      if (!existing) throw Object.assign(new Error("Batch not found"), { statusCode: 404 });
      throw Object.assign(new Error(`Only completed batches can be cancelled — batch is ${existing.status}`), { statusCode: 409 });
    }

    // 2. Get batch movements
    const movements = getBatchMovements(txnDb, batchId);
    if (movements.length === 0) throw Object.assign(new Error("No movements recorded for this batch"), { statusCode: 400 });

    const reversals = [];

    for (const mov of movements) {
      const product = txnDb
        .query("SELECT id, name, sku, stock_count FROM products WHERE id = ? AND business_id = ?")
        .get(mov.product_id, businessId);

      if (!product) {
        console.warn(`[cancelBatch] Product #${mov.product_id} not found — skipping reversal`);
        continue;
      }

      if (mov.direction === "consumed") {
        // Restore consumed inventory
        const newStock = product.stock_count + mov.actual_quantity;
        updateProductStock(txnDb, mov.product_id, businessId, newStock);

        recordMovement(txnDb, {
          productId: mov.product_id,
          type: "in",
          quantity: mov.actual_quantity,
          userId,
          businessId,
        });

        reversals.push({
          productId: mov.product_id,
          productName: product.name,
          sku: product.sku,
          direction: "restored",
          quantity: mov.actual_quantity,
          unit: mov.unit,
          previousStock: product.stock_count,
          newStock,
        });
      } else if (mov.direction === "produced") {
        // Remove produced inventory
        const rawCancelStock = product.stock_count - mov.actual_quantity;
        const newStock = Math.max(0, rawCancelStock);
        if (rawCancelStock < 0) {
          console.warn(
            `[cancelBatch] STOCKOUT on reversal: batch #${batchId} — ${product.name} (${product.sku}): reversing ${mov.actual_quantity} ${mov.unit} but only ${product.stock_count} available. Shortfall: ${Math.abs(rawCancelStock)}. Stock set to 0.`
          );
        }
        updateProductStock(txnDb, mov.product_id, businessId, newStock);

        recordMovement(txnDb, {
          productId: mov.product_id,
          type: "out",
          quantity: mov.actual_quantity,
          userId,
          businessId,
        });

        reversals.push({
          productId: mov.product_id,
          productName: product.name,
          sku: product.sku,
          direction: "reversed",
          quantity: mov.actual_quantity,
          unit: mov.unit,
          previousStock: product.stock_count,
          newStock,
          stockout: rawCancelStock < 0,
          shortfall: rawCancelStock < 0 ? Math.abs(rawCancelStock) : 0,
        });
      }
    }

    // 6. Update batch status
    updateBatchStatus(txnDb, batchId, "cancelled", { notes: (batch.notes || "") + " [CANCELLED — inventory reversed]" });

    return {
      batchId,
      status: "cancelled",
      reversals,
    };
  });
}


// ═══════════════════════════════════════════════════════════════════════
// V3.3: INVENTORY RESERVATIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Reserve inventory for a production batch.
 * Given a batch (with bom + batch_size), calculate required ingredients,
 * check stock availability, create inventory_reservations.
 * Returns { reserved, shortages } — what was reserved and what's insufficient.
 */
export function reserveInventoryForBatch(db, batchId, businessId) {
  return transaction(db, (txnDb) => {
    // Validate batch is draft
    const batch = txnDb
      .query("SELECT * FROM production_batches WHERE id = ? AND business_id = ? AND status = 'draft'")
      .get(batchId, businessId);

    if (!batch) {
      const existing = txnDb
        .query("SELECT id, status FROM production_batches WHERE id = ? AND business_id = ?")
        .get(batchId, businessId);
      if (!existing) throw Object.assign(new Error("Batch not found"), { statusCode: 404 });
      throw Object.assign(new Error(`Batch is ${existing.status}, must be draft to reserve`), { statusCode: 409 });
    }

    // Get BOM items
    const bomItems = getBomItems(txnDb, batch.bom_id);
    if (bomItems.length === 0) throw Object.assign(new Error("BOM has no items"), { statusCode: 400 });

    // Clear any existing reservations for this batch
    txnDb.run("DELETE FROM inventory_reservations WHERE batch_id = ?", [batchId]);

    const multiplier = batch.batch_size;
    const reserved = [];
    const shortages = [];

    for (const item of bomItems) {
      const needed = item.quantity_per_batch * multiplier;
      const available = item.input_stock_count || 0;

      if (available < needed) {
        if (available > 0) {
          txnDb.run(
            "INSERT INTO inventory_reservations (business_id, batch_id, product_id, quantity_reserved, status) VALUES (?, ?, ?, ?, 'reserved')",
            [businessId, batchId, item.input_product_id, available]
          );
          reserved.push({
            productId: item.input_product_id, productName: item.input_product_name,
            sku: item.input_product_sku, needed, reserved: available, unit: item.unit,
          });
        }
        shortages.push({
          productId: item.input_product_id, productName: item.input_product_name,
          sku: item.input_product_sku, needed, available,
          shortfall: needed - available, unit: item.unit,
        });
      } else {
        txnDb.run(
          "INSERT INTO inventory_reservations (business_id, batch_id, product_id, quantity_reserved, status) VALUES (?, ?, ?, ?, 'reserved')",
          [businessId, batchId, item.input_product_id, needed]
        );
        reserved.push({
          productId: item.input_product_id, productName: item.input_product_name,
          sku: item.input_product_sku, needed, reserved: needed, unit: item.unit,
        });
      }
    }

    txnDb.run("UPDATE production_batches SET reserved_at = datetime('now') WHERE id = ?", [batchId]);

    return {
      batchId, reserved, shortages,
      canExecute: shortages.length === 0,
      summary: shortages.length === 0
        ? "All materials reserved"
        : `${shortages.length} material shortage(s) — unable to fully execute`,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════
// V3.3: UNDO BATCH
// ═══════════════════════════════════════════════════════════════════════

export function undoBatch(db, batchId, businessId, userId) {
  return transaction(db, (txnDb) => {
    const batch = txnDb
      .query("SELECT * FROM production_batches WHERE id = ? AND business_id = ? AND status = 'completed'")
      .get(batchId, businessId);

    if (!batch) {
      const existing = txnDb
        .query("SELECT id, status FROM production_batches WHERE id = ? AND business_id = ?")
        .get(batchId, businessId);
      if (!existing) throw Object.assign(new Error("Batch not found"), { statusCode: 404 });
      throw Object.assign(new Error(`Only completed batches can be undone — batch is ${existing.status}`), { statusCode: 409 });
    }

    const movements = getBatchMovements(txnDb, batchId);
    if (movements.length === 0) throw Object.assign(new Error("No movements recorded for this batch"), { statusCode: 400 });

    const reversals = [];

    for (const mov of movements) {
      const product = txnDb
        .query("SELECT id, name, sku, stock_count FROM products WHERE id = ? AND business_id = ?")
        .get(mov.product_id, businessId);
      if (!product) continue;

      if (mov.direction === "consumed") {
        const newStock = product.stock_count + mov.actual_quantity;
        updateProductStock(txnDb, mov.product_id, businessId, newStock);
        recordMovement(txnDb, {
          productId: mov.product_id, type: "in", quantity: mov.actual_quantity, userId, businessId,
        });
        reversals.push({
          productId: mov.product_id, productName: product.name, sku: product.sku,
          direction: "restored", quantity: mov.actual_quantity, unit: mov.unit,
          previousStock: product.stock_count, newStock,
        });
      } else if (mov.direction === "produced") {
        const rawNewStock = product.stock_count - mov.actual_quantity;
        const newStock = Math.max(0, rawNewStock);
        updateProductStock(txnDb, mov.product_id, businessId, newStock);
        recordMovement(txnDb, {
          productId: mov.product_id, type: "out", quantity: mov.actual_quantity, userId, businessId,
        });
        reversals.push({
          productId: mov.product_id, productName: product.name, sku: product.sku,
          direction: "reversed", quantity: mov.actual_quantity, unit: mov.unit,
          previousStock: product.stock_count, newStock,
          stockout: rawNewStock < 0, shortfall: rawNewStock < 0 ? Math.abs(rawNewStock) : 0,
        });
      }
    }

    txnDb.run(
      "UPDATE production_batches SET status = 'cancelled', cancelled_at = datetime('now'), cancelled_reason = 'undone' WHERE id = ?",
      [batchId]
    );

    return { batchId, status: "cancelled", reason: "undone", reversals };
  });
}

// ═══════════════════════════════════════════════════════════════════════
// V3.3: ENHANCED CANCEL — supports draft & completed
// ═══════════════════════════════════════════════════════════════════════

export function cancelBatchV33(db, batchId, businessId, userId, reason = null) {
  return transaction(db, (txnDb) => {
    const batch = txnDb
      .query("SELECT * FROM production_batches WHERE id = ? AND business_id = ?")
      .get(batchId, businessId);
    if (!batch) throw Object.assign(new Error("Batch not found"), { statusCode: 404 });

    if (batch.status === "draft") {
      txnDb.run("UPDATE inventory_reservations SET status = 'released' WHERE batch_id = ? AND business_id = ?",
        [batchId, businessId]);
      txnDb.run(
        "UPDATE production_batches SET status = 'cancelled', cancelled_at = datetime('now'), cancelled_reason = ? WHERE id = ?",
        [reason || 'cancelled by user', batchId]
      );
      const resCount = txnDb.query(
        "SELECT COUNT(*) as count FROM inventory_reservations WHERE batch_id = ? AND status = 'released'"
      ).get(batchId).count;

      return {
        batchId, status: "cancelled", reason: reason || 'cancelled by user',
        releasedReservations: resCount,
        message: resCount > 0 ? `${resCount} reservation(s) released` : "Batch cancelled (no reservations to release)",
      };
    }

    if (batch.status === "completed") {
      const movements = getBatchMovements(txnDb, batchId);
      if (movements.length === 0) throw Object.assign(new Error("No movements recorded for this batch"), { statusCode: 400 });

      const reversals = [];
      for (const mov of movements) {
        const product = txnDb
          .query("SELECT id, name, sku, stock_count FROM products WHERE id = ? AND business_id = ?")
          .get(mov.product_id, businessId);
        if (!product) continue;

        if (mov.direction === "consumed") {
          const newStock = product.stock_count + mov.actual_quantity;
          updateProductStock(txnDb, mov.product_id, businessId, newStock);
          recordMovement(txnDb, {
            productId: mov.product_id, type: "in", quantity: mov.actual_quantity, userId, businessId,
          });
          reversals.push({
            productId: mov.product_id, productName: product.name, sku: product.sku,
            direction: "restored", quantity: mov.actual_quantity, unit: mov.unit,
            previousStock: product.stock_count, newStock,
          });
        } else if (mov.direction === "produced") {
          const rawNewStock = product.stock_count - mov.actual_quantity;
          const newStock = Math.max(0, rawNewStock);
          updateProductStock(txnDb, mov.product_id, businessId, newStock);
          recordMovement(txnDb, {
            productId: mov.product_id, type: "out", quantity: mov.actual_quantity, userId, businessId,
          });
          reversals.push({
            productId: mov.product_id, productName: product.name, sku: product.sku,
            direction: "reversed", quantity: mov.actual_quantity, unit: mov.unit,
            previousStock: product.stock_count, newStock,
            stockout: rawNewStock < 0, shortfall: rawNewStock < 0 ? Math.abs(rawNewStock) : 0,
          });
        }
      }

      txnDb.run(
        "UPDATE production_batches SET status = 'cancelled', cancelled_at = datetime('now'), cancelled_reason = ? WHERE id = ?",
        [reason || 'cancelled — inventory reversed', batchId]
      );

      return { batchId, status: "cancelled", reason: reason || 'cancelled — inventory reversed', reversals };
    }

    throw Object.assign(new Error(`Cannot cancel batch in '${batch.status}' status`), { statusCode: 409 });
  });
}

// ═══════════════════════════════════════════════════════════════════════
// V3.3: GET BATCH FULL
// ═══════════════════════════════════════════════════════════════════════

export function getBatchFull(db, batchId, businessId) {
  const batch = getBatch(db, batchId, businessId);
  if (!batch) return null;

  const movements = getBatchMovements(db, batchId);
  const bomItems = getBomItems(db, batch.bom_id);

  const reservations = db
    .query(
      `SELECT ir.*, p.name as product_name, p.sku as product_sku
       FROM inventory_reservations ir
       LEFT JOIN products p ON ir.product_id = p.id
       WHERE ir.batch_id = ? AND ir.business_id = ?
       ORDER BY ir.id`
    )
    .all(batchId, businessId);

  const enrichedBomItems = bomItems.map(item => ({
    ...item,
    neededForBatch: item.quantity_per_batch * batch.batch_size,
    available: item.input_stock_count || 0,
    sufficient: (item.input_stock_count || 0) >= (item.quantity_per_batch * batch.batch_size),
  }));

  return {
    ...batch,
    movements,
    bomItems: enrichedBomItems,
    reservations,
    hasReservations: reservations.length > 0,
    reservedCount: reservations.filter(r => r.status === 'reserved').length,
    consumedCount: reservations.filter(r => r.status === 'consumed').length,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// V3.3: PRODUCTION REQUIREMENTS
// ═══════════════════════════════════════════════════════════════════════

export function getProductionRequirements(db, businessId) {
  const batches = getPendingBatches(db, businessId);

  const enriched = batches.map(batch => {
    const bomItems = getBomItems(db, batch.bom_id);
    const items = bomItems.map(item => {
      const needed = item.quantity_per_batch * batch.batch_size;
      const available = item.input_stock_count || 0;
      return {
        productId: item.input_product_id, productName: item.input_product_name,
        sku: item.input_product_sku, needed, available,
        sufficient: available >= needed,
        shortfall: Math.max(0, needed - available), unit: item.unit,
      };
    });

    const canExecute = items.every(i => i.sufficient);
    const shortages = items.filter(i => !i.sufficient);

    return {
      batchId: batch.id, bomName: batch.bom_name,
      outputProductName: batch.output_product_name,
      batchSize: batch.batch_size, canExecute, items, shortages,
      shortageCount: shortages.length,
    };
  });

  return {
    batches: enriched,
    totalBatches: enriched.length,
    executableBatches: enriched.filter(b => b.canExecute).length,
    summary: enriched.length === 0
      ? "No pending production batches"
      : `${enriched.filter(b => b.canExecute).length} of ${enriched.length} batch(es) executable`,
  };
}
// ═══════════════════════════════════════════════════════════════════════
// CALCULATION ENGINE — Formulas
// ═══════════════════════════════════════════════════════════════════════

/** Create a formula for a business. Returns lastInsertRowid. */
export function createFormula(db, businessId, { name, description, category = 'custom', templateId = null, inputs, outputExpression, outputLabel, outputUnit = null, isPublic = 0 }) {
  const result = db.run(
    `INSERT INTO formulas (business_id, name, description, category, template_id, inputs, output_expression, output_label, output_unit, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [businessId, name, description || null, category, templateId, JSON.stringify(inputs), outputExpression, outputLabel, outputUnit, isPublic]
  );
  return result.lastInsertRowid;
}

/** Get a single formula with parsed inputs. */
export function getFormula(db, id) {
  const row = db.query("SELECT * FROM formulas WHERE id = ?").get(id);
  if (!row) return null;
  return {
    ...row,
    inputs: safelyParseJson(row.inputs, []),
  };
}

/** List formulas for a business (optionally filtered by category). */
export function listFormulas(db, businessId, category = null) {
  let query = "SELECT * FROM formulas WHERE business_id = ? AND is_public = 0";
  const params = [businessId];
  if (category) {
    query += " AND category = ?";
    params.push(category);
  }
  query += " ORDER BY created_at DESC";
  const rows = db.query(query).all(...params);
  return rows.map((row) => ({
    ...row,
    inputs: safelyParseJson(row.inputs, []),
  }));
}

/** List public template formulas (is_public=1). */
export function listTemplates(db) {
  const rows = db.query("SELECT * FROM formulas WHERE is_public = 1 ORDER BY category, name").all();
  return rows.map((row) => ({
    ...row,
    inputs: safelyParseJson(row.inputs, []),
  }));
}

/** Instantiate a template for a business (copies template to user formulas). */
export function instantiateTemplate(db, businessId, templateId) {
  const template = db.query("SELECT * FROM formulas WHERE template_id = ? AND is_public = 1").get(templateId);
  if (!template) return null;

  const id = createFormula(db, businessId, {
    name: template.name,
    description: template.description,
    category: template.category,
    templateId: template.template_id,
    inputs: safelyParseJson(template.inputs, []),
    outputExpression: template.output_expression,
    outputLabel: template.output_label,
    outputUnit: template.output_unit,
  });

  return getFormula(db, id);
}

/** Update a formula's mutable fields. */
export function updateFormula(db, id, businessId, fields) {
  const updates = [];
  const values = [];

  if (fields.name !== undefined) { updates.push("name = ?"); values.push(fields.name); }
  if (fields.description !== undefined) { updates.push("description = ?"); values.push(fields.description); }
  if (fields.category !== undefined) { updates.push("category = ?"); values.push(fields.category); }
  if (fields.inputs !== undefined) { updates.push("inputs = ?"); values.push(JSON.stringify(fields.inputs)); }
  if (fields.outputExpression !== undefined) { updates.push("output_expression = ?"); values.push(fields.outputExpression); }
  if (fields.outputLabel !== undefined) { updates.push("output_label = ?"); values.push(fields.outputLabel); }
  if (fields.outputUnit !== undefined) { updates.push("output_unit = ?"); values.push(fields.outputUnit); }

  if (updates.length === 0) return 0;

  values.push(id, businessId);
  const result = db.run(
    `UPDATE formulas SET ${updates.join(", ")} WHERE id = ? AND business_id = ?`,
    values
  );
  return result.changes;
}

/** Delete a formula, scoped to business. */
export function deleteFormula(db, id, businessId) {
  const row = db.query("SELECT id FROM formulas WHERE id = ? AND business_id = ? AND is_public = 0").get(id, businessId);
  if (!row) return false;
  db.run("DELETE FROM formulas WHERE id = ? AND business_id = ?", [id, businessId]);
  return true;
}

/** Count user formulas for a business. */
export function countFormulas(db, businessId) {
  return db.query("SELECT COUNT(*) as count FROM formulas WHERE business_id = ? AND is_public = 0").get(businessId).count;
}

/** Get recently-used formula IDs (by audit log of execution). */
export function getRecentFormulaIds(db, businessId, limit = 5) {
  return db
    .query(
      `SELECT DISTINCT entity_id FROM audit_log
       WHERE business_id = ? AND action_type = 'calculation.executed' AND entity_id IS NOT NULL
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(businessId, limit)
    .map((r) => r.entity_id);
}

/** Count total templates available. */
export function countTemplates(db) {
  return db.query("SELECT COUNT(*) as count FROM formulas WHERE is_public = 1").get().count;
}

// ═══════════════════════════════════════════════════════════════════════
// PURCHASING INTELLIGENCE — suppliers, POs, thresholds, recommendations
// ═══════════════════════════════════════════════════════════════════════

// ── Suppliers ──────────────────────────────────────────────────────────

/** Create a supplier. Returns lastInsertRowid. */
export function createSupplier(db, { businessId, name, contactName = null, email = null, phone = null, website = null, notes = null }) {
  const result = db.run(
    "INSERT INTO suppliers (business_id, name, contact_name, email, phone, website, notes) VALUES (?, ?, ?, ?, ?, ?)",
    [businessId, name, contactName, email, phone, website, notes]
  );
  return result.lastInsertRowid;
}

/** Get a single supplier, scoped to business. */
export function getSupplier(db, supplierId, businessId) {
  return db
    .query("SELECT * FROM suppliers WHERE id = ? AND business_id = ?")
    .get(supplierId, businessId);
}

/** List all suppliers for a business. */
export function listSuppliers(db, businessId) {
  return db
    .query("SELECT * FROM suppliers WHERE business_id = ? ORDER BY name ASC")
    .all(businessId);
}

/** Update a supplier. Returns changes count. */
export function updateSupplier(db, supplierId, businessId, fields) {
  const updates = [];
  const values = [];

  if (fields.name !== undefined) { updates.push("name = ?"); values.push(fields.name); }
  if (fields.contactName !== undefined) { updates.push("contact_name = ?"); values.push(fields.contactName); }
  if (fields.email !== undefined) { updates.push("email = ?"); values.push(fields.email); }
  if (fields.phone !== undefined) { updates.push("phone = ?"); values.push(fields.phone); }
  if (fields.website !== undefined) { updates.push("website = ?"); values.push(fields.website); }
  if (fields.notes !== undefined) { updates.push("notes = ?"); values.push(fields.notes); }
  if (fields.isActive !== undefined) { updates.push("is_active = ?"); values.push(fields.isActive); }

  if (updates.length === 0) return 0;
  values.push(supplierId, businessId);

  const result = db.run(
    `UPDATE suppliers SET ${updates.join(", ")} WHERE id = ? AND business_id = ?`,
    values
  );
  return result.changes;
}

/** Delete a supplier and its product links. */
export function deleteSupplier(db, supplierId, businessId) {
  const supplier = getSupplier(db, supplierId, businessId);
  if (!supplier) return null;
  db.run("DELETE FROM supplier_products WHERE supplier_id = ?", [supplierId]);
  db.run("DELETE FROM suppliers WHERE id = ? AND business_id = ?", [supplierId, businessId]);
  return supplier;
}

// ── Supplier Products ──────────────────────────────────────────────────

/** Link a product to a supplier with pricing/lead time. Returns lastInsertRowid. */
export function linkSupplierProduct(db, { supplierId, productId, supplierSku = null, unitCost = null, unitType = 'unit', minOrderQty = 1, quotedLeadTimeDays = null, isPreferred = 0 }) {
  const result = db.run(
    `INSERT INTO supplier_products (supplier_id, product_id, supplier_sku, unit_cost, unit_type, min_order_qty, quoted_lead_time_days, is_preferred)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(supplier_id, product_id) DO UPDATE SET
       supplier_sku = excluded.supplier_sku,
       unit_cost = excluded.unit_cost,
       unit_type = excluded.unit_type,
       min_order_qty = excluded.min_order_qty,
       quoted_lead_time_days = excluded.quoted_lead_time_days,
       is_preferred = CASE WHEN excluded.is_preferred = 1 THEN 1 ELSE supplier_products.is_preferred END`,
    [supplierId, productId, supplierSku, unitCost, unitType, minOrderQty, quotedLeadTimeDays, isPreferred]
  );
  return result.lastInsertRowid;
}

/** Get all products linked to a supplier, with product info. */
export function getSupplierProducts(db, supplierId) {
  return db
    .query(
      `SELECT sp.*, p.name as product_name, p.sku as product_sku, p.stock_count, p.barcode
       FROM supplier_products sp
       JOIN products p ON sp.product_id = p.id
       WHERE sp.supplier_id = ?
       ORDER BY sp.is_preferred DESC, p.name ASC`
    )
    .all(supplierId);
}

/** Update a supplier-product link. */
export function updateSupplierProduct(db, linkId, fields) {
  const updates = [];
  const values = [];

  if (fields.supplierSku !== undefined) { updates.push("supplier_sku = ?"); values.push(fields.supplierSku); }
  if (fields.unitCost !== undefined) { updates.push("unit_cost = ?"); values.push(fields.unitCost); }
  if (fields.unitType !== undefined) { updates.push("unit_type = ?"); values.push(fields.unitType); }
  if (fields.minOrderQty !== undefined) { updates.push("min_order_qty = ?"); values.push(fields.minOrderQty); }
  if (fields.quotedLeadTimeDays !== undefined) { updates.push("quoted_lead_time_days = ?"); values.push(fields.quotedLeadTimeDays); }
  if (fields.isPreferred !== undefined) { updates.push("is_preferred = ?"); values.push(fields.isPreferred); }

  if (updates.length === 0) return 0;
  values.push(linkId);

  const result = db.run(
    `UPDATE supplier_products SET ${updates.join(", ")} WHERE id = ?`,
    values
  );
  return result.changes;
}

/** Set a supplier product as preferred for its product (unset others). */
export function setPreferredSupplier(db, supplierId, productId) {
  return db.transaction(() => {
    // Unset all preferred for this product within the same business
    db.run(
      `UPDATE supplier_products SET is_preferred = 0
       WHERE product_id = ? AND supplier_id IN
         (SELECT id FROM suppliers WHERE business_id = (SELECT business_id FROM suppliers WHERE id = ?))`,
      [productId, supplierId]
    );
    // Set the preferred one
    db.run(
      "UPDATE supplier_products SET is_preferred = 1 WHERE supplier_id = ? AND product_id = ?",
      [supplierId, productId]
    );
    return true;
  })();
}

// ── Purchase Orders ────────────────────────────────────────────────────

/** Create a purchase order. Returns lastInsertRowid. */
export function createPO(db, { businessId, supplierId, notes = null, expectedDelivery = null, createdBy = null }) {
  const result = db.run(
    "INSERT INTO purchase_orders (business_id, supplier_id, notes, expected_delivery, created_by) VALUES (?, ?, ?, ?, ?)",
    [businessId, supplierId, notes, expectedDelivery, createdBy]
  );
  return result.lastInsertRowid;
}

/** Get a single PO with supplier info, scoped to business. */
export function getPO(db, poId, businessId) {
  return db
    .query(
      `SELECT po.*, s.name as supplier_name, u.display_name as created_by_name
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN users u ON po.created_by = u.id
       WHERE po.id = ? AND po.business_id = ?`
    )
    .get(poId, businessId);
}

/** List all POs for a business. */
export function listPOs(db, businessId) {
  return db
    .query(
      `SELECT po.*, s.name as supplier_name
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.business_id = ?
       ORDER BY po.created_at DESC`
    )
    .all(businessId);
}

/** Update a PO's status. */
export function updatePOStatus(db, poId, status, extra = {}) {
  const updates = ["status = ?"];
  const values = [status];

  if (status === "ordered") {
    updates.push("order_date = datetime('now')");
  }
  if (status === "received") {
    updates.push("received_date = datetime('now')");
  }
  if (extra.expectedDelivery !== undefined) {
    updates.push("expected_delivery = ?");
    values.push(extra.expectedDelivery);
  }
  if (extra.notes !== undefined) {
    updates.push("notes = ?");
    values.push(extra.notes);
  }

  values.push(poId);
  db.run(`UPDATE purchase_orders SET ${updates.join(", ")} WHERE id = ?`, values);
}

/** Add an item to a PO. Returns lastInsertRowid. */
export function addPOItem(db, { poId, productId, quantity, unitCost = null, totalCost = null }) {
  const result = db.run(
    "INSERT INTO po_items (po_id, product_id, quantity, unit_cost, total_cost) VALUES (?, ?, ?, ?, ?)",
    [poId, productId, quantity, unitCost, totalCost]
  );
  return result.lastInsertRowid;
}

/** Get all items for a PO with product info. */
export function getPOItems(db, poId) {
  return db
    .query(
      `SELECT pi.*, p.name as product_name, p.sku as product_sku
       FROM po_items pi
       JOIN products p ON pi.product_id = p.id
       WHERE pi.po_id = ?
       ORDER BY pi.id`
    )
    .all(poId);
}

/** V3.2: Receive PO — backward-compatible wrapper. For new call style with line-item granularity,
 * see receivePO_v32 below. Legacy calls (db, poId, businessId, userId) receive all outstanding. */
export function receivePO(db, poIdOrParams, businessIdOrUserId, userIdOrNothing) {
  return receivePO_v32(db, poIdOrParams, businessIdOrUserId, userIdOrNothing);
}

// ── Inventory Thresholds ───────────────────────────────────────────────

/** Set or update a reorder threshold for a product. */
export function upsertThreshold(db, { businessId, productId, reorderPoint, reorderQuantity, unitType = 'unit' }) {
  const result = db.run(
    `INSERT INTO inventory_thresholds (business_id, product_id, reorder_point, reorder_quantity, unit_type, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(product_id) DO UPDATE SET
       reorder_point = excluded.reorder_point,
       reorder_quantity = excluded.reorder_quantity,
       unit_type = excluded.unit_type,
       updated_at = datetime('now')`,
    [businessId, productId, reorderPoint, reorderQuantity, unitType]
  );
  return result.lastInsertRowid;
}

/** Get threshold for a product. */
export function getThreshold(db, businessId, productId) {
  return db
    .query("SELECT * FROM inventory_thresholds WHERE business_id = ? AND product_id = ?")
    .get(businessId, productId);
}

/** List all thresholds for a business. */
export function listThresholds(db, businessId) {
  return db
    .query(
      `SELECT it.*, p.name as product_name, p.sku as product_sku, p.stock_count
       FROM inventory_thresholds it
       JOIN products p ON it.product_id = p.id
       WHERE it.business_id = ?
       ORDER BY p.name ASC`
    )
    .all(businessId);
}

// ── Reorder Recommendations (the core intelligence function) ───────────

/**
 * Calculate daily velocity for a product based on recent inventory movements.
 * Looks at the last 30 days of movements and computes average daily consumption.
 * Falls back to a broader window if not enough data in 30 days.
 */
function calculateDailyVelocity(db, productId, businessId) {
  // Sum of inventory decreases over the last 30 days (or all time if <30 days)
  const movement = db
    .query(
      `SELECT COALESCE(SUM(ABS(quantity)), 0) as total_moved
       FROM inventory_movements
       WHERE product_id = ? AND business_id = ?
         AND type = 'out'
         AND created_at >= datetime('now', '-30 days')`
    )
    .get(productId, businessId);

  const totalMoved = movement.total_moved || 0;

  if (totalMoved === 0) {
    // Try all-time
    const allTime = db
      .query(
        `SELECT COALESCE(SUM(ABS(quantity)), 0) as total_moved,
                MIN(created_at) as earliest
         FROM inventory_movements
         WHERE product_id = ? AND business_id = ?
           AND type = 'out'`
      )
      .get(productId, businessId);

    if (!allTime.earliest || allTime.total_moved === 0) return 0;

    const daysSinceEarliest = Math.max(1, Math.ceil((Date.now() - new Date(allTime.earliest).getTime()) / (1000 * 60 * 60 * 24)));
    return allTime.total_moved / daysSinceEarliest;
  }

  return totalMoved / 30;
}

/**
 * Get reorder recommendations for a business.
 * For each product:
 *   - Check if stock <= reorder_point (or estimate based on velocity)
 *   - Find preferred supplier with pricing and lead time
 *   - Calculate days_of_stock based on recent movement velocity
 *   - Return explainable recommendation
 */
export function getReorderRecommendations(db, businessId) {
  // Get all products with their stock, thresholds, and preferred suppliers in one efficient query
  const rows = db
    .query(
      `SELECT
         p.id as product_id, p.name as product_name, p.sku, p.stock_count,
         it.reorder_point, it.reorder_quantity, it.unit_type as threshold_unit_type,
         sp.supplier_id, sp.unit_cost, sp.quoted_lead_time_days, sp.min_order_qty,
         sp.unit_type as supplier_unit_type,
         s.name as supplier_name
       FROM products p
       LEFT JOIN inventory_thresholds it ON it.product_id = p.id AND it.business_id = ?
       LEFT JOIN supplier_products sp ON sp.product_id = p.id AND sp.is_preferred = 1
       LEFT JOIN suppliers s ON sp.supplier_id = s.id AND s.is_active = 1 AND s.business_id = ?
       ORDER BY p.stock_count ASC, p.name ASC`
    )
    .all(businessId, businessId);

  const recommendations = [];

  for (const row of rows) {
    const dailyVelocity = calculateDailyVelocity(db, row.product_id, businessId);

    // Determine if we should recommend reorder
    let reorderPoint = row.reorder_point;
    const currentStock = row.stock_count;

    // If no threshold set, auto-estimate: reorder when stock < 14 days at current velocity
    if (reorderPoint === null || reorderPoint === undefined) {
      if (dailyVelocity > 0) {
        reorderPoint = dailyVelocity * 14; // 2 weeks of stock
      } else {
        continue; // Skip products with no velocity and no threshold
      }
    }

    // Check if we need to reorder
    if (currentStock > reorderPoint) continue;

    // Calculate days remaining
    const daysRemaining = dailyVelocity > 0 ? Math.round(currentStock / dailyVelocity) : 999;

    // Determine urgency
    let urgency = "ok";
    let leadTimeDays = row.quoted_lead_time_days || 7; // default to 7 days if unknown

    if (currentStock <= 0) {
      urgency = "now";
    } else if (daysRemaining <= leadTimeDays) {
      urgency = "now";
    } else if (daysRemaining <= leadTimeDays * 2) {
      urgency = "soon";
    }

    // Determine reorder quantity
    const reorderQty = row.reorder_quantity || Math.max(row.min_order_qty || 1, Math.ceil(dailyVelocity * 30));

    // Build the explainable recommendation
    const explanationParts = [];
    explanationParts.push(`current stock is ${currentStock}`);

    if (dailyVelocity > 0) {
      explanationParts.push(`covers ${daysRemaining} days at current sales rate`);
    }

    if (row.quoted_lead_time_days) {
      explanationParts.push(`lead time is ${row.quoted_lead_time_days} days`);
    } else {
      explanationParts.push(`lead time is unknown (estimated 7 days)`);
    }

    explanationParts.push(`reorder point is ${reorderPoint}`);

    recommendations.push({
      product_id: row.product_id,
      product_name: row.product_name,
      sku: row.sku,
      current_stock: currentStock,
      daily_velocity: Math.round(dailyVelocity * 100) / 100,
      days_remaining: daysRemaining,
      reorder_qty: reorderQty,
      reorder_point: reorderPoint,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name || null,
      unit_cost: row.unit_cost,
      lead_time_days: leadTimeDays,
      min_order_qty: row.min_order_qty || 1,
      unit_type: row.supplier_unit_type || row.threshold_unit_type || 'unit',
      urgency,
      explanation: `Reorder ${reorderQty} ${row.supplier_unit_type || row.threshold_unit_type || 'units'} of ${row.product_name}${row.supplier_name ? ` from ${row.supplier_name}` : ''} — ${explanationParts.join(', ')}.`,
    });
  }

  // Sort: urgency "now" first, then "soon", then "ok"
  const urgencyOrder = { now: 0, soon: 1, ok: 2 };
  recommendations.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return recommendations;
}

// ── Supplier Performance ────────────────────────────────────────────────

/** Get performance metrics for a supplier. */
export function getSupplierPerformance(db, supplierId, businessId) {
  const supplier = getSupplier(db, supplierId, businessId);
  if (!supplier) return null;

  // Count of POs
  const poStats = db
    .query(
      `SELECT COUNT(*) as total_pos,
              AVG(CASE WHEN order_date IS NOT NULL AND received_date IS NOT NULL
                  THEN julianday(received_date) - julianday(order_date) END) as avg_actual_lead_time
       FROM purchase_orders
       WHERE supplier_id = ? AND business_id = ? AND status = 'received'`
    )
    .get(supplierId, businessId);

  // Quoted vs actual lead time comparison
  const supplierProds = getSupplierProducts(db, supplierId);

  const quotedAvg = supplierProds.reduce((sum, sp) => sum + (sp.quoted_lead_time_days || 0), 0) / Math.max(1, supplierProds.length);

  // Recent POs
  const recentPOs = db
    .query(
      `SELECT po.id, po.status, po.order_date, po.expected_delivery, po.received_date,
              COUNT(pi.id) as item_count
       FROM purchase_orders po
       LEFT JOIN po_items pi ON pi.po_id = po.id
       WHERE po.supplier_id = ? AND po.business_id = ?
       GROUP BY po.id
       ORDER BY po.created_at DESC
       LIMIT 10`
    )
    .all(supplierId, businessId);

  return {
    supplier: { ...supplier, products: supplierProds },
    totalPOs: poStats.total_pos,
    avgActualLeadTime: poStats.avg_actual_lead_time ? Math.round(poStats.avg_actual_lead_time) : null,
    avgQuotedLeadTime: supplierProds.length > 0 ? Math.round(quotedAvg) : null,
    leadTimeDelta: poStats.avg_actual_lead_time && supplierProds.length > 0
      ? Math.round(poStats.avg_actual_lead_time - quotedAvg)
      : null,
    recentPOs,
  };
}

// ── Purchasing Summary (for AI consumption) ─────────────────────────────

/** Get a structured purchasing summary for AI consumption. */
export function getPurchasingSummary(db, businessId) {
  const recommendations = getReorderRecommendations(db, businessId);

  const urgentCount = recommendations.filter(r => r.urgency === "now").length;
  const soonCount = recommendations.filter(r => r.urgency === "soon").length;

  // Supplier stats
  const supplierCount = db
    .query("SELECT COUNT(*) as count FROM suppliers WHERE business_id = ? AND is_active = 1")
    .get(businessId).count;

  const pendingPOs = db
    .query("SELECT COUNT(*) as count FROM purchase_orders WHERE business_id = ? AND status = 'ordered'")
    .get(businessId).count;

  const draftPOs = db
    .query("SELECT COUNT(*) as count FROM purchase_orders WHERE business_id = ? AND status = 'draft'")
    .get(businessId).count;

  return {
    urgentReorderCount: urgentCount,
    soonReorderCount: soonCount,
    totalRecommendations: recommendations.length,
    urgentRecommendations: recommendations.filter(r => r.urgency === "now").slice(0, 10),
    supplierCount,
    pendingPOs,
    draftPOs,
    summary: recommendations.length > 0
      ? `${urgentCount} urgent reorder(s), ${soonCount} soon. ${draftPOs} draft PO(s), ${pendingPOs} PO(s) on order.`
      : "No reorder recommendations at this time.",
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PRODUCT HQ — comprehensive product snapshot
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get comprehensive product snapshot for the Product HQ dashboard.
 * Aggregates data from every engine independently.
 * @param {import("bun:sqlite").Database} db
 * @param {number} productId
 * @param {number} businessId
 * @returns {object|null}
 */
export function getProductHQ(db, productId, businessId) {
  // ── Product core ──────────────────────────────────────────────────
  const product = db
    .query("SELECT id, name, sku, barcode, stock_count, created_at, updated_at FROM products WHERE id = ? AND business_id = ?")
    .get(productId, businessId);
  if (!product) return null;

  // ── Inventory ─────────────────────────────────────────────────────
  const inventoryStats = db
    .query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END), 0) as total_in,
         COALESCE(SUM(CASE WHEN type = 'out' OR type = 'order' THEN quantity ELSE 0 END), 0) as total_out,
         MAX(created_at) as last_movement_date
       FROM inventory_movements
       WHERE product_id = ? AND business_id = ?`
    )
    .get(productId, businessId);

  // Last 5 movements
  const recentMovements = db
    .query(
      `SELECT id, type, quantity, created_at
       FROM inventory_movements
       WHERE product_id = ? AND business_id = ?
       ORDER BY created_at DESC LIMIT 5`
    )
    .all(productId, businessId);

  const inventory = {
    currentStock: product.stock_count,
    totalIn: inventoryStats.total_in || 0,
    totalOut: inventoryStats.total_out || 0,
    lastMovementDate: inventoryStats.last_movement_date || null,
    recentMovements,
  };

  // ── Commerce ──────────────────────────────────────────────────────
  // Orders containing this product (via order_items matching product_id or sku)
  const commerceStats = db
    .query(
      `SELECT
         COUNT(DISTINCT oi.order_id) as order_count,
         COALESCE(SUM(oi.quantity), 0) as units_sold
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.product_id = ? AND o.business_id = ?`
    )
    .get(productId, businessId);

  // Also match by SKU if product_id is null (for imported orders)
  const skuCommerceStats = db
    .query(
      `SELECT
         COUNT(DISTINCT oi.order_id) as order_count,
         COALESCE(SUM(oi.quantity), 0) as units_sold
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.sku = ? AND o.business_id = ? AND oi.product_id IS NULL`
    )
    .get(product.sku, businessId);

  const totalUnitsSold = (commerceStats.units_sold || 0) + (skuCommerceStats.units_sold || 0);
  const totalOrders = (commerceStats.order_count || 0) + (skuCommerceStats.order_count || 0);

  // Revenue estimate: we don't track price per order item, so mark as unavailable
  const commerce = {
    orderCount: totalOrders,
    unitsSold: totalUnitsSold,
    revenue: null,
    revenueNote: "Revenue tracking requires Shopify order sync with pricing data",
  };

  // ── Production ────────────────────────────────────────────────────
  // BOMs where this product is the output
  const bomsAsOutput = db
    .query(
      `SELECT b.id, b.name, b.output_quantity, b.output_unit, b.is_active
       FROM boms b
       WHERE b.output_product_id = ? AND b.business_id = ?`
    )
    .all(productId, businessId);

  // BOMs where this product is an input (material)
  const bomsAsInput = db
    .query(
      `SELECT bi.bom_id, b.name as bom_name, bi.quantity_per_batch, bi.unit,
              p2.name as output_product_name
       FROM bom_items bi
       JOIN boms b ON bi.bom_id = b.id
       JOIN products p2 ON b.output_product_id = p2.id
       WHERE bi.input_product_id = ? AND b.business_id = ?`
    )
    .all(productId, businessId);

  // Recent batches involving this product
  const recentBatches = db
    .query(
      `SELECT pb.id, pb.status, pb.batch_size, pb.created_at, pb.completed_at,
              b.name as bom_name, p2.name as output_product_name
       FROM production_batches pb
       JOIN boms b ON pb.bom_id = b.id
       JOIN products p2 ON b.output_product_id = p2.id
       WHERE pb.business_id = ?
         AND (b.output_product_id = ? OR b.id IN (
           SELECT bi.bom_id FROM bom_items bi WHERE bi.input_product_id = ?
         ))
       ORDER BY pb.created_at DESC LIMIT 10`
    )
    .all(businessId, productId, productId);

  // Total manufactured (from batch_movements where direction = 'produced')
  const manufacturedStats = db
    .query(
      `SELECT COALESCE(SUM(bm.actual_quantity), 0) as total_manufactured
       FROM batch_movements bm
       JOIN production_batches pb ON bm.batch_id = pb.id
       WHERE bm.product_id = ? AND bm.direction = 'produced' AND pb.business_id = ?`
    )
    .get(productId, businessId);

  const production = {
    bomsAsOutput,
    bomsAsInput,
    recentBatches,
    totalManufactured: manufacturedStats.total_manufactured || 0,
  };

  // ── Purchasing ────────────────────────────────────────────────────
  const suppliers = db
    .query(
      `SELECT s.id, s.name, sp.unit_cost, sp.quoted_lead_time_days, sp.min_order_qty,
              sp.supplier_sku, sp.is_preferred, sp.unit_type
       FROM supplier_products sp
       JOIN suppliers s ON sp.supplier_id = s.id
       WHERE sp.product_id = ? AND s.business_id = ? AND s.is_active = 1
       ORDER BY sp.is_preferred DESC, s.name ASC`
    )
    .all(productId, businessId);

  // Last purchase order containing this product
  const lastPO = db
    .query(
      `SELECT po.id, po.status, po.order_date, po.expected_delivery, po.received_date,
              pi.quantity, pi.unit_cost, s.name as supplier_name
       FROM po_items pi
       JOIN purchase_orders po ON pi.po_id = po.id
       JOIN suppliers s ON po.supplier_id = s.id
       WHERE pi.product_id = ? AND po.business_id = ?
       ORDER BY po.created_at DESC LIMIT 1`
    )
    .get(productId, businessId);

  // Reorder recommendation (via purchasing engine)
  const threshold = getThreshold(db, businessId, productId);
  let reorderRecommendation = null;
  if (threshold) {
    const daysRemaining = commerceStats.units_sold > 0
      ? Math.round(product.stock_count / Math.max(1, commerceStats.units_sold / 30))
      : 999;
    const preferredSupplier = suppliers.find(s => s.is_preferred) || suppliers[0];
    const leadTimeDays = (preferredSupplier && preferredSupplier.quoted_lead_time_days) || 7;
    let urgency = "ok";
    if (product.stock_count <= 0) urgency = "now";
    else if (product.stock_count <= threshold.reorder_point) urgency = "now";
    else if (product.stock_count <= threshold.reorder_point * 1.5) urgency = "soon";

    reorderRecommendation = {
      recommended: product.stock_count <= threshold.reorder_point,
      urgency,
      reorderPoint: threshold.reorder_point,
      reorderQuantity: threshold.reorder_quantity,
      daysRemaining,
      leadTimeDays,
      preferredSupplier: preferredSupplier ? preferredSupplier.name : null,
      preferredSupplierId: preferredSupplier ? preferredSupplier.id : null,
    };
  }

  const purchasing = {
    suppliers,
    lastPO,
    threshold: threshold || null,
    reorderRecommendation,
  };

  // ── Profitability ─────────────────────────────────────────────────
  // Cost from preferred supplier
  const preferredSupp = suppliers.find(s => s.is_preferred) || suppliers[0];
  const costPerUnit = preferredSupp ? preferredSupp.unit_cost : null;

  // Revenue: not tracked directly, use supplier cost as cost basis
  const profitability = {
    costPerUnit,
    revenuePerUnit: null,
    margin: null,
    note: costPerUnit
      ? "Cost from linked supplier. Revenue tracking requires order pricing."
      : "Link a supplier with pricing to see cost data.",
  };

  // ── Recent Activity ───────────────────────────────────────────────
  const recentActivity = db
    .query(
      `SELECT a.id, a.action_type, a.entity_type, a.new_value, a.previous_value,
              a.source, a.created_at, u.display_name as user_display_name
       FROM audit_log a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.business_id = ? AND a.entity_id = ? AND a.entity_type = 'product'
       ORDER BY a.created_at DESC LIMIT 10`
    )
    .all(businessId, productId);

  // Also include inventory-related audit entries for this product
  const inventoryActivity = db
    .query(
      `SELECT a.id, a.action_type, a.entity_type, a.new_value, a.previous_value,
              a.source, a.created_at, u.display_name as user_display_name
       FROM audit_log a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.business_id = ? AND a.entity_type = 'inventory'
         AND (a.new_value LIKE ? OR a.previous_value LIKE ?)
       ORDER BY a.created_at DESC LIMIT 10`
    )
    .all(businessId, `%${product.sku}%`, `%${product.sku}%`);

  // Merge and deduplicate, take last 10
  const allActivity = [...recentActivity, ...inventoryActivity]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  return {
    product,
    inventory,
    commerce,
    production,
    purchasing,
    profitability,
    recentActivity: allActivity,
  };
}

/**
 * AI-consumable summary for a product.
 * Follows the engine pattern: /api/{engine}/summary
 * @param {import("bun:sqlite").Database} db
 * @param {number} productId
 * @param {number} businessId
 * @returns {object|null}
 */
export function getProductSummary(db, productId, businessId) {
  const hq = getProductHQ(db, productId, businessId);
  if (!hq) return null;

  const p = hq.product;
  const supplyChain = [];
  if (hq.purchasing.reorderRecommendation && hq.purchasing.reorderRecommendation.recommended) {
    supplyChain.push(`REORDER RECOMMENDED: ${hq.purchasing.reorderRecommendation.reorderQuantity} units, urgency ${hq.purchasing.reorderRecommendation.urgency}`);
  }
  if (hq.production.bomsAsOutput.length > 0) {
    supplyChain.push(`${hq.production.bomsAsOutput.length} BOM(s) produce this product`);
  }
  if (hq.production.bomsAsInput.length > 0) {
    supplyChain.push(`Used as raw material in ${hq.production.bomsAsInput.length} BOM(s)`);
  }

  return {
    product: {
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
    },
    currentStock: p.stock_count,
    inventory: {
      totalIn: hq.inventory.totalIn,
      totalOut: hq.inventory.totalOut,
      lastMovement: hq.inventory.lastMovementDate,
    },
    commerce: {
      unitsSold: hq.commerce.unitsSold,
      orderCount: hq.commerce.orderCount,
    },
    production: {
      totalManufactured: hq.production.totalManufactured,
      bomCount: hq.production.bomsAsOutput.length,
      materialInCount: hq.production.bomsAsInput.length,
      activeBatches: hq.production.recentBatches.filter(b => b.status === 'draft' || b.status === 'in_progress').length,
    },
    purchasing: {
      supplierCount: hq.purchasing.suppliers.length,
      preferredSupplier: hq.purchasing.suppliers.find(s => s.is_preferred)?.name || null,
      costPerUnit: hq.profitability.costPerUnit,
      lastPO: hq.purchasing.lastPO ? { id: hq.purchasing.lastPO.id, status: hq.purchasing.lastPO.status, date: hq.purchasing.lastPO.order_date } : null,
    },
    recommendations: supplyChain,
    summary: `${p.name} (${p.sku}): ${p.stock_count} in stock. ${hq.commerce.unitsSold} units sold across ${hq.commerce.orderCount} orders. ${hq.production.totalManufactured} units manufactured. ${supplyChain.join('. ')}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// OPPORTUNITY CENTER — dismissals
// ═══════════════════════════════════════════════════════════════════════

/** Dismiss an opportunity for a business. Returns lastInsertRowid or null if already dismissed. */
export function dismissOpportunity(db, { businessId, opportunityId, dismissedBy }) {
  try {
    const result = db.run(
      "INSERT OR IGNORE INTO dismissed_opportunities (business_id, opportunity_id, dismissed_by) VALUES (?, ?, ?)",
      [businessId, opportunityId, dismissedBy]
    );
    return result.lastInsertRowid;
  } catch (err) {
    console.error("[opportunities] Failed to dismiss:", err.message);
    return null;
  }
}

/** Get all dismissed opportunity IDs for a business (newer than 7 days). */
export function getDismissedOpportunities(db, businessId) {
  const rows = db
    .query(
      `SELECT opportunity_id FROM dismissed_opportunities
       WHERE business_id = ?
         AND dismissed_at >= datetime('now', '-7 days')`
    )
    .all(businessId);
  return rows.map(r => r.opportunity_id);
}


// ── Unified Opportunities Table ────────────────────────────────────

/** Create a new opportunity. */
export function createOpportunity(db, params) {
  const result = db.run(
    `INSERT INTO opportunities (business_id, source, source_event_type, engine, icon, title, description,
      impact, effort, potential_value, confidence, explanation, cited_data,
      action_type, action_label, action_link, novi_assist_prompt, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.businessId,
      params.source || "novi",
      params.sourceEventType || params.eventType,
      params.engine || "system",
      params.icon || null,
      params.title,
      params.description || null,
      params.impact || "medium",
      params.effort || "medium",
      params.potentialValue || null,
      params.confidence ?? 0.5,
      params.explanation || null,
      params.citedData ? JSON.stringify(params.citedData) : null,
      params.actionType || "navigate",
      params.actionLabel || null,
      params.actionLink || null,
      params.noviAssistPrompt || null,
      params.status || "active",
    ]
  );
  return result.lastInsertRowid;
}

/** Upsert an opportunity — insert if (business_id, source_event_type, title) unique, else update. */
export function upsertOpportunity(db, params) {
  const existing = db.query(
    `SELECT id FROM opportunities
     WHERE business_id = ? AND source_event_type = ? AND title = ?
     AND status = 'active'`
  ).get(params.businessId, params.sourceEventType || params.eventType, params.title);

  if (existing) {
    // Update existing active opportunity
    db.run(
      `UPDATE opportunities SET
        description = COALESCE(?, description),
        impact = COALESCE(?, impact),
        confidence = COALESCE(?, confidence),
        explanation = COALESCE(?, explanation),
        cited_data = COALESCE(?, cited_data),
        action_label = COALESCE(?, action_label),
        action_link = COALESCE(?, action_link),
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        params.description || null,
        params.impact || null,
        params.confidence ?? null,
        params.explanation || null,
        params.citedData ? JSON.stringify(params.citedData) : null,
        params.actionLabel || null,
        params.actionLink || null,
        existing.id,
      ]
    );
    return existing.id;
  }

  // Check if a completed/snoozed/dismissed version exists — if so, skip
  const inactive = db.query(
    `SELECT id FROM opportunities
     WHERE business_id = ? AND source_event_type = ? AND title = ?
     AND status != 'active'`
  ).get(params.businessId, params.sourceEventType || params.eventType, params.title);

  if (inactive) {
    // Re-activate it
    db.run(
      `UPDATE opportunities SET status = 'active', updated_at = datetime('now'),
        description = COALESCE(?, description),
        impact = COALESCE(?, impact),
        confidence = COALESCE(?, confidence),
        explanation = COALESCE(?, explanation),
        cited_data = COALESCE(?, cited_data)
       WHERE id = ?`,
      [
        params.description || null,
        params.impact || null,
        params.confidence ?? null,
        params.explanation || null,
        params.citedData ? JSON.stringify(params.citedData) : null,
        inactive.id,
      ]
    );
    return inactive.id;
  }

  // Insert new
  return createOpportunity(db, params);
}

/** Get opportunities with optional filters. */
export function getOpportunities(db, businessId, filters = {}) {
  const conditions = ["business_id = ?"];
  const params = [businessId];

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters.type) {
    conditions.push("source_event_type = ?");
    params.push(filters.type);
  }
  if (filters.impact) {
    conditions.push("impact = ?");
    params.push(filters.impact);
  }
  if (filters.engine) {
    conditions.push("engine = ?");
    params.push(filters.engine);
  }

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const rows = db.query(
    `SELECT id, business_id, source, source_event_type, engine, icon, title, description,
            impact, effort, potential_value, confidence, explanation, cited_data,
            action_type, action_label, action_link, novi_assist_prompt,
            status, snoozed_until, completed_at, completed_by, created_at, updated_at
     FROM opportunities
     WHERE ${conditions.join(" AND ")}
     ORDER BY
       CASE impact WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
       confidence DESC,
       created_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  return rows.map(r => ({
    ...r,
    cited_data: r.cited_data ? JSON.parse(r.cited_data) : null,
  }));
}

/** Get a single opportunity by ID. */
export function getOpportunity(db, opportunityId) {
  const row = db.query(
    `SELECT id, business_id, source, source_event_type, engine, icon, title, description,
            impact, effort, potential_value, confidence, explanation, cited_data,
            action_type, action_label, action_link, novi_assist_prompt,
            status, snoozed_until, completed_at, completed_by, created_at, updated_at
     FROM opportunities WHERE id = ?`
  ).get(opportunityId);

  if (!row) return null;
  return {
    ...row,
    cited_data: row.cited_data ? JSON.parse(row.cited_data) : null,
  };
}

/** Update an opportunity status. Sets completed_at/completed_by when completed. */
export function updateOpportunityStatus(db, opportunityId, status, userId) {
  const now = new Date().toISOString();
  const sets = ["status = ?", "updated_at = datetime('now')"];
  const params = [status];

  if (status === "completed") {
    sets.push("completed_at = ?");
    params.push(now);
    if (userId) {
      sets.push("completed_by = ?");
      params.push(userId);
    }
  }

  if (status === "dismissed" && userId) {
    // Also add to dismissed_opportunities for backward compat
    const opp = getOpportunity(db, opportunityId);
    if (opp) {
      try {
        db.run(
          "INSERT OR IGNORE INTO dismissed_opportunities (business_id, opportunity_id, dismissed_by) VALUES (?, ?, ?)",
          [opp.business_id, `opp_${opp.source_event_type}_${opp.id}`, userId]
        );
      } catch { /* ignore duplicates */ }
    }
  }

  params.push(opportunityId);
  db.run(
    `UPDATE opportunities SET ${sets.join(", ")} WHERE id = ?`,
    ...params
  );

  return { id: opportunityId, status };
}

/** Snooze an opportunity until a specific time. */
export function snoozeOpportunity(db, opportunityId, until) {
  db.run(
    `UPDATE opportunities SET status = 'snoozed', snoozed_until = ?, updated_at = datetime('now') WHERE id = ?`,
    [until, opportunityId]
  );
  return { id: opportunityId, status: "snoozed", snoozedUntil: until };
}

/** Get opportunity summary counts by status and total potential value. */
export function getOpportunitySummary(db, businessId) {
  const counts = db.query(
    `SELECT status, COUNT(*) as count FROM opportunities
     WHERE business_id = ? GROUP BY status`
  ).all(businessId);

  const totalActive = db.query(
    "SELECT COUNT(*) as count FROM opportunities WHERE business_id = ? AND status = 'active'"
  ).get(businessId).count;

  const highImpact = db.query(
    "SELECT COUNT(*) as count FROM opportunities WHERE business_id = ? AND status = 'active' AND impact = 'high'"
  ).get(businessId).count;

  const summary = {};
  for (const row of counts) {
    summary[row.status] = row.count;
  }

  return {
    total: totalActive,
    highImpact,
    byStatus: summary,
    active: totalActive,
  };
}

/** Re-activate snoozed opportunities whose snooze period has expired. */
export function reactivateSnoozedOpportunities(db, businessId) {
  const result = db.run(
    `UPDATE opportunities SET status = 'active', snoozed_until = NULL, updated_at = datetime('now')
     WHERE business_id = ? AND status = 'snoozed'
     AND snoozed_until IS NOT NULL AND snoozed_until <= datetime('now')`,
    [businessId]
  );
  return result.changes;
}

// ── Health Snapshots ─────────────────────────────────────────────────

/** Check if a health snapshot already exists for today. */
export function getTodaySnapshot(db, businessId) {
  return db
    .query(
      `SELECT id, score, breakdown, created_at FROM health_snapshots
       WHERE business_id = ? AND date(created_at) = date('now')
       LIMIT 1`
    )
    .get(businessId) || null;
}

/** Save a health snapshot. Returns the new row ID. */
export function saveHealthSnapshot(db, { businessId, score, breakdown }) {
  const breakdownJson = typeof breakdown === 'string' ? breakdown : JSON.stringify(breakdown);
  const result = db.run(
    `INSERT INTO health_snapshots (business_id, score, breakdown, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [businessId, score, breakdownJson]
  );
  return result.lastInsertRowid;
}

/** Get health snapshots for a business within a date range. */
export function getHealthSnapshots(db, businessId, days = 30) {
  return db
    .query(
      `SELECT id, score, breakdown, created_at FROM health_snapshots
       WHERE business_id = ? AND created_at >= datetime('now', ?)
       ORDER BY created_at ASC`
    )
    .all(businessId, `-${days} days`);
}

// ── Helpers ──────────────────────────────────────────────────────────

function safelyParseJson(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Re-export product variant functions from variant-store.js
// ═══════════════════════════════════════════════════════════════════════

export {
  listVariants,
  getVariant,
  getVariantBySku,
  createVariant,
  updateVariant,
  deleteVariant,
  updateVariantStock,
  bulkProductImport,
} from "./variant-store.js";
// ── V3.2 Purchase Order Receiving ──────────────────────────────────────
// These functions are appended to store.js

/** V3.2: Receive PO with line-item granularity (partial, damaged, backordered).
 * items: [{poItemId, qtyReceived, qtyDamaged, qtyBackordered, binLocation, notes}]
 * Also backward-compatible: receivePO(db, poId, businessId, userId) receives all outstanding. */
export function receivePO_v32(db, poIdOrParams, businessIdOrUserId, userIdOrNothing) {
  let poId, businessId, items, receivedBy;

  if (typeof poIdOrParams === "object") {
    const params = poIdOrParams;
    poId = params.poId;
    businessId = params.businessId;
    items = params.items;
    receivedBy = params.receivedBy;
  } else {
    poId = poIdOrParams;
    businessId = businessIdOrUserId;
    receivedBy = userIdOrNothing;
    const existingItems = getPOItems(db, poId);
    items = existingItems.map(i => ({
      poItemId: i.id,
      qtyReceived: (i.quantity||0) - ((i.received_quantity||0)+(i.quantity_damaged||0)+(i.quantity_backordered||0)),
      qtyDamaged: 0, qtyBackordered: 0, binLocation: null, notes: null,
    })).filter(it => it.qtyReceived > 0);
  }

  return transaction(db, () => {
    const po = db.query(
      "SELECT * FROM purchase_orders WHERE id = ? AND business_id = ? AND status IN ('ordered','partial')"
    ).get(poId, businessId);
    if (!po) { const e = new Error("PO not found or not in 'ordered'/'partial' status"); e.statusCode = 400; throw e; }

    const received = [];
    let totalSettled = 0;
    for (const spec of items) {
      const qtyRcvd = Number(spec.qtyReceived)||0;
      const qtyDmg = Number(spec.qtyDamaged)||0;
      const qtyBack = Number(spec.qtyBackordered)||0;
      if (qtyRcvd+qtyDmg+qtyBack <= 0) continue;

      const item = db.query("SELECT * FROM po_items WHERE id = ? AND po_id = ?").get(spec.poItemId, poId);
      if (!item) continue;

      db.run(
        `UPDATE po_items SET received_quantity=received_quantity+?, quantity_damaged=quantity_damaged+?,
         quantity_backordered=quantity_backordered+?, notes=CASE WHEN ? IS NOT NULL THEN ? ELSE notes END
         WHERE id=?`,
        [qtyRcvd,qtyDmg,qtyBack, spec.notes||null, spec.notes||null, item.id]
      );

      db.run(
        `INSERT INTO receiving_events (business_id,po_id,po_item_id,product_id,quantity_received,
         quantity_damaged,quantity_backordered,bin_location,notes,received_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [businessId,poId,item.id,item.product_id,qtyRcvd,qtyDmg,qtyBack, spec.binLocation||null, spec.notes||null, receivedBy||null]
      );

      if (qtyRcvd > 0) {
        db.run("UPDATE products SET stock_count=stock_count+? WHERE id=?", [qtyRcvd,item.product_id]);
        db.run(
          "UPDATE supplier_products SET last_order_date=datetime('now'),last_order_cost=? WHERE supplier_id=? AND product_id=?",
          [item.unit_cost, po.supplier_id, item.product_id]
        );
        recordMovement(db, { productId:item.product_id, type:"in", quantity:qtyRcvd, userId:receivedBy, businessId });
      }

      const prod = db.query("SELECT name,sku FROM products WHERE id=?").get(item.product_id);
      received.push({
        poItemId:item.id, productId:item.product_id,
        productName:prod?.name||"Unknown", sku:prod?.sku||"",
        quantityReceived:qtyRcvd, quantityDamaged:qtyDmg, quantityBackordered:qtyBack,
        binLocation:spec.binLocation||null, unitCost:item.unit_cost,
      });
      totalSettled++;
    }

    if (totalSettled===0) { const e=new Error("No valid items to receive"); e.statusCode=400; throw e; }

    const updatedItems = db.query("SELECT * FROM po_items WHERE po_id=?").all(poId);
    const allDone = updatedItems.every(i => (i.received_quantity||0)+(i.quantity_damaged||0)+(i.quantity_backordered||0) >= i.quantity);
    const newStatus = allDone ? "received" : "partial";
    db.run(
      "UPDATE purchase_orders SET status=?, actual_delivery_date=datetime('now'), received_date=CASE WHEN ?='received' THEN datetime('now') ELSE received_date END WHERE id=?",
      [newStatus,newStatus,poId]
    );
    return { poId, supplierId:po.supplier_id, status:newStatus, received };
  });
}

/** Get PO with full supplier info, items, and receiving history. */
export function getPOWithSupplier(db, poId, businessId) {
  const po = db.query(
    `SELECT po.*, s.name as supplier_name, s.contact_name as supplier_contact,
     s.email as supplier_email, s.phone as supplier_phone, u.display_name as created_by_name
     FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id
     LEFT JOIN users u ON po.created_by = u.id
     WHERE po.id = ? AND po.business_id = ?`
  ).get(poId, businessId);
  if (!po) return null;
  return { ...po, items: getPOItems(db, poId), receivingHistory: listReceivingEvents(db, poId, businessId) };
}

/** List all receiving events for a PO. */
export function listReceivingEvents(db, poId, businessId) {
  return db.query(
    `SELECT re.*, p.name as product_name, p.sku as product_sku, u.display_name as received_by_name
     FROM receiving_events re
     LEFT JOIN products p ON re.product_id = p.id
     LEFT JOIN users u ON re.received_by = u.id
     WHERE re.po_id = ? AND re.business_id = ?
     ORDER BY re.created_at DESC`
  ).all(poId, businessId);
}

/** Add a note to a supplier. */
export function addSupplierNote(db, { supplierId, poId, note, createdBy, businessId }) {
  const r = db.run(
    "INSERT INTO supplier_notes (business_id, supplier_id, po_id, note, created_by) VALUES (?,?,?,?,?)",
    [businessId, supplierId, poId||null, note, createdBy||null]
  );
  return r.lastInsertRowid;
}

/** Get notes for a supplier (optionally filtered by PO). */
export function getSupplierNotes(db, supplierId, businessId) {
  return db.query(
    `SELECT sn.*, u.display_name as created_by_name, po.id as po_ref
     FROM supplier_notes sn
     LEFT JOIN users u ON sn.created_by = u.id
     LEFT JOIN purchase_orders po ON sn.po_id = po.id
     WHERE sn.supplier_id = ? AND sn.business_id = ?
     ORDER BY sn.created_at DESC`
  ).all(supplierId, businessId);
}

/** Get expected deliveries: POs with status 'ordered' or 'partial', ordered by expected_delivery asc. */
export function getExpectedDeliveries(db, businessId) {
  return db.query(
    `SELECT po.*, s.name as supplier_name,
     (SELECT COUNT(*) FROM po_items WHERE po_id = po.id) as item_count,
     (SELECT COALESCE(SUM(quantity),0) FROM po_items WHERE po_id = po.id) as total_ordered,
     (SELECT COALESCE(SUM(received_quantity),0) FROM po_items WHERE po_id = po.id) as total_received
     FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id
     WHERE po.business_id = ? AND po.status IN ('ordered','partial')
     ORDER BY po.expected_delivery ASC`
  ).all(businessId);
}

/** Get backordered items: po_items where quantity_backordered > 0, grouped by product. */
export function getBackorderedItems(db, businessId) {
  return db.query(
    `SELECT pi.product_id, p.name as product_name, p.sku as product_sku,
     SUM(pi.quantity_backordered) as total_backordered,
     COUNT(DISTINCT pi.po_id) as po_count,
     GROUP_CONCAT(DISTINCT s.name) as supplier_names
     FROM po_items pi
     JOIN purchase_orders po ON pi.po_id = po.id
     JOIN products p ON pi.product_id = p.id
     LEFT JOIN suppliers s ON po.supplier_id = s.id
     WHERE po.business_id = ? AND pi.quantity_backordered > 0
     GROUP BY pi.product_id
     ORDER BY total_backordered DESC`
  ).all(businessId);
}

/** Update PO fields (expected_delivery, carrier, tracking, notes, status). */
export function updatePO(db, poId, businessId, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    const colMap = { expectedDelivery:"expected_delivery", carrier:"carrier", trackingNumber:"tracking_number", notes:"notes", status:"status" };
    const col = colMap[k];
    if (col && v !== undefined) { sets.push(`${col}=?`); vals.push(v); }
  }
  if (sets.length === 0) return 0;
  vals.push(poId, businessId);
  const r = db.run(`UPDATE purchase_orders SET ${sets.join(",")} WHERE id=? AND business_id=?`, vals);
  return r.changes;
}
// ═══════════════════════════════════════════════════════════════════════
// TEAM HQ — Members, Roles, Permissions, Activity Log
// ═══════════════════════════════════════════════════════════════════════

// ── Team Members ──

export function createTeamMember(db, { businessId, email, name, passwordHash = null, status = 'invited' }) {
  const r = db.run(
    "INSERT INTO team_members (business_id, email, name, password_hash, status) VALUES (?, ?, ?, ?, ?)",
    [businessId, email, name, passwordHash, status]
  );
  return r.lastInsertRowid;
}

export function getTeamMember(db, memberId, businessId) {
  return db.query(
    "SELECT * FROM team_members WHERE id = ? AND business_id = ?"
  ).get(memberId, businessId);
}

export function getTeamMemberByEmail(db, email, businessId) {
  return db.query(
    "SELECT * FROM team_members WHERE email = ? AND business_id = ?"
  ).get(email, businessId);
}

export function listTeamMembers(db, businessId) {
  return db.query(
    `SELECT tm.*, 
            (SELECT GROUP_CONCAT(tr.name, ', ') 
             FROM member_roles mr 
             JOIN team_roles tr ON mr.role_id = tr.id 
             WHERE mr.member_id = tm.id) as roles
     FROM team_members tm
     WHERE tm.business_id = ?
     ORDER BY tm.created_at DESC`
  ).all(businessId);
}

export function updateTeamMember(db, memberId, businessId, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    const colMap = { name: "name", email: "email", status: "status", passwordHash: "password_hash", lastLogin: "last_login" };
    const col = colMap[k];
    if (col && v !== undefined) { sets.push(`${col}=?`); vals.push(v); }
  }
  if (sets.length === 0) return 0;
  vals.push(memberId, businessId);
  const r = db.run(`UPDATE team_members SET ${sets.join(",")} WHERE id=? AND business_id=?`, vals);
  return r.changes;
}

export function deleteTeamMember(db, memberId, businessId) {
  db.run("DELETE FROM member_roles WHERE member_id = ?", [memberId]);
  db.run("DELETE FROM activity_log WHERE member_id = ?", [memberId]);
  const r = db.run("DELETE FROM team_members WHERE id = ? AND business_id = ?", [memberId, businessId]);
  return r.changes;
}

// ── Team Roles ──

export function createTeamRole(db, { businessId, name, isDefault = 0 }) {
  const r = db.run(
    "INSERT INTO team_roles (business_id, name, is_default) VALUES (?, ?, ?)",
    [businessId, name, isDefault]
  );
  return r.lastInsertRowid;
}

export function getTeamRole(db, roleId, businessId) {
  return db.query(
    "SELECT * FROM team_roles WHERE id = ? AND business_id = ?"
  ).get(roleId, businessId);
}

export function listTeamRoles(db, businessId) {
  const roles = db.query(
    "SELECT * FROM team_roles WHERE business_id = ? ORDER BY is_default DESC, name ASC"
  ).all(businessId);
  for (const role of roles) {
    const count = db.query(
      "SELECT COUNT(*) as count FROM team_role_permissions WHERE role_id = ? AND granted = 1"
    ).get(role.id);
    role.permissionCount = count ? count.count : 0;
  }
  return roles;
}

export function updateTeamRole(db, roleId, businessId, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    const colMap = { name: "name" };
    const col = colMap[k];
    if (col && v !== undefined) { sets.push(`${col}=?`); vals.push(v); }
  }
  if (sets.length === 0) return 0;
  vals.push(roleId, businessId);
  const r = db.run(`UPDATE team_roles SET ${sets.join(",")} WHERE id=? AND business_id=?`, vals);
  return r.changes;
}

export function deleteTeamRole(db, roleId, businessId) {
  db.run("DELETE FROM team_role_permissions WHERE role_id = ?", [roleId]);
  db.run("DELETE FROM member_roles WHERE role_id = ?", [roleId]);
  const r = db.run("DELETE FROM team_roles WHERE id = ? AND business_id = ? AND is_default = 0", [roleId, businessId]);
  return r.changes;
}

// ── Role Permissions ──

export function setRolePermission(db, roleId, resource, granted) {
  db.run(
    "INSERT OR REPLACE INTO team_role_permissions (role_id, resource, granted) VALUES (?, ?, ?)",
    [roleId, resource, granted ? 1 : 0]
  );
}

export function getRolePermissions(db, roleId) {
  return db.query(
    "SELECT resource, granted FROM team_role_permissions WHERE role_id = ?"
  ).all(roleId);
}

export function setRolePermissionsBatch(db, roleId, permissions) {
  db.run("DELETE FROM team_role_permissions WHERE role_id = ?", [roleId]);
  const insert = db.prepare(
    "INSERT INTO team_role_permissions (role_id, resource, granted) VALUES (?, ?, ?)"
  );
  for (const p of permissions) {
    insert.run(roleId, p.resource, p.granted ? 1 : 0);
  }
}

// ── Member Roles ──

export function assignMemberRole(db, memberId, roleId) {
  db.run(
    "INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?, ?)",
    [memberId, roleId]
  );
}

export function removeMemberRole(db, memberId, roleId) {
  db.run("DELETE FROM member_roles WHERE member_id = ? AND role_id = ?", [memberId, roleId]);
}

export function setMemberRoles(db, memberId, roleIds) {
  db.run("DELETE FROM member_roles WHERE member_id = ?", [memberId]);
  const insert = db.prepare("INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)");
  for (const roleId of roleIds) {
    insert.run(memberId, roleId);
  }
}

export function getMemberPermissions(db, memberId) {
  const rows = db.query(
    `SELECT DISTINCT trp.resource
     FROM member_roles mr
     JOIN team_role_permissions trp ON mr.role_id = trp.role_id AND trp.granted = 1
     WHERE mr.member_id = ?`
  ).all(memberId);
  return rows.map(r => r.resource);
}

export function checkMemberPermission(db, memberId, resource) {
  const row = db.query(
    `SELECT 1 FROM member_roles mr
     JOIN team_role_permissions trp ON mr.role_id = trp.role_id AND trp.granted = 1
     WHERE mr.member_id = ? AND trp.resource = ?`
  ).get(memberId, resource);
  return !!row;
}

// ── Activity Log ──

export function logActivity(db, { businessId, memberId, action, resourceType = null, resourceId = null, details = null }) {
  const r = db.run(
    "INSERT INTO activity_log (business_id, member_id, action, resource_type, resource_id, details) VALUES (?, ?, ?, ?, ?, ?)",
    [businessId, memberId, action, resourceType, resourceId, details]
  );
  return r.lastInsertRowid;
}

export function listActivityLog(db, businessId, filters = {}) {
  const { memberId, action, resourceType, limit = 100, offset = 0 } = filters;
  let sql = `SELECT al.*, tm.name as member_name, tm.email as member_email
             FROM activity_log al
             LEFT JOIN team_members tm ON al.member_id = tm.id
             WHERE al.business_id = ?`;
  const params = [businessId];

  if (memberId) { sql += " AND al.member_id = ?"; params.push(memberId); }
  if (action) { sql += " AND al.action LIKE ?"; params.push(`%${action}%`); }
  if (resourceType) { sql += " AND al.resource_type = ?"; params.push(resourceType); }

  sql += " ORDER BY al.created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  return db.query(sql).all(...params);
}

export function getTeamStats(db, businessId) {
  const memberCount = db.query(
    "SELECT COUNT(*) as count FROM team_members WHERE business_id = ? AND status != 'disabled'"
  ).get(businessId);
  const roleCount = db.query(
    `SELECT COUNT(DISTINCT tr.id) as count FROM member_roles mr 
     JOIN team_roles tr ON mr.role_id = tr.id 
     JOIN team_members tm ON mr.member_id = tm.id 
     WHERE tm.business_id = ? AND tm.status != 'disabled'`
  ).get(businessId);
  return {
    totalMembers: memberCount ? memberCount.count : 0,
    activeRoles: roleCount ? roleCount.count : 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// FULFILLMENT STORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/** Get orders ready to ship: status is 'pending'/'picking'/'processing' and no shipment record exists.
 * Includes pick progress (scanned vs total items). */
export function getPendingOrders(db, businessId) {
  return db.query(`
    SELECT o.id, o.order_number, o.customer_name, o.customer_email,
           o.shipping_address, o.source, o.status, o.total_amount,
           o.created_at,
           GROUP_CONCAT(p.name || ' (' || COALESCE(oi.variant_title,'') || ' x' || oi.quantity || ')', ', ') AS items_summary,
           SUM(oi.quantity) AS total_qty,
           SUM(oi.scanned_quantity) AS scanned_qty,
           CASE WHEN SUM(oi.quantity) > 0 AND SUM(oi.scanned_quantity) >= SUM(oi.quantity) THEN 1 ELSE 0 END AS fully_picked
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON oi.product_id = p.id
    LEFT JOIN fulfillment_shipments fs ON fs.order_id = o.id
    WHERE o.business_id = ?
      AND o.status IN ('pending', 'processing', 'picking')
      AND fs.id IS NULL
    GROUP BY o.id
    ORDER BY o.created_at ASC
  `).all(businessId);
}

/** Get active shipments (in transit or out for delivery). */
export function getActiveShipments(db, businessId) {
  return db.query(`
    SELECT fs.*, o.order_number, o.customer_name, o.customer_email,
           o.shipping_address
    FROM fulfillment_shipments fs
    JOIN orders o ON fs.order_id = o.id
    WHERE fs.business_id = ?
      AND fs.status IN ('label_created', 'in_transit', 'out_for_delivery')
    ORDER BY fs.shipped_at DESC
  `).all(businessId);
}

/** Get all shipments for analytics. */
export function getAllShipments(db, businessId) {
  return db.query(`
    SELECT fs.*, o.order_number, o.customer_name,
           CAST(julianday(COALESCE(fs.delivered_at, datetime('now'))) - julianday(fs.shipped_at) AS REAL) AS days_in_transit
    FROM fulfillment_shipments fs
    JOIN orders o ON fs.order_id = o.id
    WHERE fs.business_id = ?
    ORDER BY fs.shipped_at DESC
  `).all(businessId);
}

/** Create a shipment record (mark order as shipped). */
export function createShipment(db, { orderId, carrier, trackingNumber, packageType, weightOz, cost, businessId }) {
  const r = db.run(
    `INSERT INTO fulfillment_shipments (order_id, carrier, tracking_number, package_type, weight_oz, cost, status, shipped_at, business_id)
     VALUES (?, ?, ?, ?, ?, ?, 'label_created', datetime('now'), ?)`,
    [orderId, carrier, trackingNumber || null, packageType || null, weightOz || null, cost || null, businessId]
  );
  db.run("UPDATE orders SET status = 'shipped' WHERE id = ? AND business_id = ?", [orderId, businessId]);
  return r.lastInsertRowid;
}

/** Update a shipment's status/tracking. */
export function updateShipment(db, shipmentId, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (sets.length === 0) return;
  vals.push(shipmentId);
  db.run(`UPDATE fulfillment_shipments SET ${sets.join(", ")} WHERE id = ?`, vals);
}

/** Get order items with variant info for packaging suggestions. */
export function getOrderItemsForPackaging(db, orderId) {
  return db.query(`
    SELECT oi.id, oi.sku, oi.variant_title, oi.quantity,
           oi.product_id,
           p.name AS product_name,
           pv.weight_oz, pv.price
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    LEFT JOIN product_variants pv ON oi.variant_id = pv.id
    WHERE oi.order_id = ?
  `).all(orderId);
}

/** Suggest combined orders going to the same address. */
export function getCombinedOrderCandidates(db, businessId) {
  return db.query(`
    SELECT o.shipping_address, o.customer_name,
           GROUP_CONCAT(o.id) AS order_ids,
           GROUP_CONCAT(o.order_number) AS order_numbers,
           COUNT(*) AS order_count,
           SUM(o.total_amount) AS combined_total
    FROM orders o
    LEFT JOIN fulfillment_shipments fs ON fs.order_id = o.id
    WHERE o.business_id = ?
      AND o.status IN ('pending', 'processing')
      AND fs.id IS NULL
      AND o.shipping_address IS NOT NULL
      AND o.shipping_address != ''
    GROUP BY o.shipping_address
    HAVING COUNT(*) > 1
    ORDER BY order_count DESC
  `).all(businessId);
}

/** Log a pack verification. */

// ═══════════════════════════════════════════════════════════════════════
// V2: COMBINE SHIPMENTS — same customer orders within 24 hours
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get combine shipment suggestions: groups recent orders (last 24h) by customer_email.
 * Only returns groups with 2+ orders in pending/picking status and positive savings.
 */
export function getCombineSuggestionsByEmail(db, businessId) {
  const raw = db.query(`
    SELECT o.customer_email, o.customer_name,
           GROUP_CONCAT(o.id) AS order_ids,
           GROUP_CONCAT(o.order_number) AS order_numbers,
           COUNT(*) AS order_count,
           SUM(COALESCE(o.total_amount, 0)) AS combined_total
    FROM orders o
    LEFT JOIN fulfillment_shipments fs ON fs.order_id = o.id
    WHERE o.business_id = ?
      AND o.status IN ('pending', 'picking')
      AND fs.id IS NULL
      AND o.customer_email IS NOT NULL
      AND o.customer_email != ''
      AND o.created_at >= datetime('now', '-24 hours')
    GROUP BY LOWER(o.customer_email)
    HAVING COUNT(*) > 1
    ORDER BY order_count DESC
  `).all(businessId);

  return raw.map(row => {
    const orderIds = row.order_ids.split(",").map(Number);
    const orderCount = orderIds.length;
    // Estimate shipping: $7 per order individually, $10 combined + $3 per extra
    const individualShipping = orderCount * 7;
    const combinedShipping = 10 + (orderCount - 1) * 3;
    const savings = Math.max(0, individualShipping - combinedShipping);
    return {
      customerEmail: row.customer_email,
      customerName: row.customer_name,
      orderIds,
      orderNumbers: row.order_numbers.split(",").map(Number),
      orderCount,
      combinedTotal: row.combined_total,
      estimatedIndividualShipping: individualShipping,
      estimatedCombinedShipping: combinedShipping,
      estimatedSavings: savings,
      savingsPercent: individualShipping > 0 ? Math.round((savings / individualShipping) * 100) : 0,
    };
  }).filter(s => s.estimatedSavings > 0);
}

/**
 * Combine multiple orders into one target order.
 */
export function combineOrders(db, businessId, userId, orderIds, savingsEstimate) {
  return transaction(db, (txnDb) => {
    if (!orderIds || orderIds.length < 2) {
      throw Object.assign(new Error("At least 2 orders required to combine"), { statusCode: 400 });
    }

    const placeholders = orderIds.map(() => "?").join(",");
    const orders = txnDb.query(
      `SELECT * FROM orders WHERE id IN (${placeholders}) AND business_id = ?`
    ).all(...orderIds, businessId);

    if (orders.length < 2) {
      throw Object.assign(new Error("Not enough valid orders found"), { statusCode: 404 });
    }

    const emails = [...new Set(orders.map(o => (o.customer_email || "").toLowerCase().trim()))];
    if (emails.length > 1 || !emails[0]) {
      throw Object.assign(new Error("All orders must belong to the same customer with a valid email"), { statusCode: 400 });
    }

    for (const o of orders) {
      if (!['pending', 'picking'].includes(o.status)) {
        throw Object.assign(new Error(`Order #${o.order_number} has status '${o.status}' — must be pending or picking`), { statusCode: 400 });
      }
    }

    orders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const [targetOrder, ...sourceOrders] = orders;

    const newTotal = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

    let combinedItemCount = 0;
    for (const src of sourceOrders) {
      const items = txnDb.query(
        "SELECT id FROM order_items WHERE order_id = ?"
      ).all(src.id);

      for (const item of items) {
        txnDb.run(
          "UPDATE order_items SET order_id = ? WHERE id = ?",
          [targetOrder.id, item.id]
        );
        combinedItemCount++;
      }
    }

    txnDb.run(
      "UPDATE orders SET total_amount = ?, status = 'pending' WHERE id = ?",
      [newTotal, targetOrder.id]
    );

    for (const src of sourceOrders) {
      txnDb.run(
        "UPDATE orders SET status = 'combined' WHERE id = ?",
        [src.id]
      );
    }

    const result = txnDb.run(
      `INSERT INTO combined_shipments (business_id, original_order_ids, target_order_id, savings_estimate, status, combined_by)
       VALUES (?, ?, ?, ?, 'combined', ?)`,
      [businessId, JSON.stringify(orderIds), targetOrder.id, savingsEstimate || null, userId]
    );

    return {
      combinedShipmentId: result.lastInsertRowid,
      targetOrderId: targetOrder.id,
      targetOrderNumber: targetOrder.order_number,
      sourceOrderIds: sourceOrders.map(o => o.id),
      sourceOrderNumbers: sourceOrders.map(o => o.order_number),
      combinedItemCount,
      newTotalAmount: newTotal,
      savingsEstimate: savingsEstimate || 0,
      customerEmail: emails[0],
    };
  });
}

/**
 * Check if an order has been combined (either as target or source).
 */
export function getOrderCombinedInfo(db, orderId, businessId) {
  const asTarget = db.query(
    `SELECT cs.* FROM combined_shipments cs
     WHERE cs.target_order_id = ? AND cs.business_id = ?`
  ).get(orderId, businessId);
  if (asTarget) {
    const sourceOrderIds = JSON.parse(asTarget.original_order_ids || '[]');
    return { ...asTarget, isTarget: true, sourceOrderIds };
  }

  const asSource = db.query(
    `SELECT cs.* FROM combined_shipments cs
     WHERE cs.business_id = ?
       AND cs.original_order_ids LIKE ?`
  ).get(businessId, '%' + orderId + '%');
  if (asSource) {
    const targetOrder = db.query(
      "SELECT id, order_number FROM orders WHERE id = ?"
    ).get(asSource.target_order_id);
    return {
      ...asSource,
      isTarget: false,
      mergedIntoTargetId: asSource.target_order_id,
      mergedIntoTargetNumber: targetOrder?.order_number || null,
    };
  }

  return null;
}
export function createPackVerification(db, { orderId, photoUrl, verifiedBy, itemsChecked, notes, businessId }) {
  const r = db.run(
    `INSERT INTO fulfillment_pack_verifications (order_id, photo_url, verified_by, items_checked, notes, business_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [orderId, photoUrl || null, verifiedBy || null, JSON.stringify(itemsChecked || []), notes || null, businessId]
  );
  return r.lastInsertRowid;
}

/** Get pack verifications for an order. */
export function getPackVerifications(db, orderId) {
  return db.query(
    "SELECT * FROM fulfillment_pack_verifications WHERE order_id = ? ORDER BY created_at DESC"
  ).all(orderId);
}

/** Get fulfillment analytics. */
export function getFulfillmentAnalytics(db, businessId) {
  const avgShipTime = db.query(`
    SELECT AVG(CAST(julianday(fs.shipped_at) - julianday(o.created_at) AS REAL)) AS avg_days
    FROM fulfillment_shipments fs
    JOIN orders o ON fs.order_id = o.id
    WHERE fs.business_id = ?
  `).get(businessId);

  const costStats = db.query(`
    SELECT COUNT(*) AS total_shipments,
           COALESCE(SUM(cost), 0) AS total_cost,
           COALESCE(AVG(cost), 0) AS avg_cost
    FROM fulfillment_shipments
    WHERE business_id = ?
  `).get(businessId);

  const onTime = db.query(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'delivered' AND (
             (estimated_delivery IS NOT NULL AND CAST(julianday(delivered_at) - julianday(estimated_delivery) AS REAL) <= 1)
             OR
             (estimated_delivery IS NULL AND CAST(julianday(delivered_at) - julianday(shipped_at) AS REAL) <= 7)
           ) THEN 1 ELSE 0 END) AS on_time
    FROM fulfillment_shipments
    WHERE business_id = ? AND status = 'delivered'
  `).get(businessId);

  const carrierPerf = db.query(`
    SELECT carrier,
           COUNT(*) AS shipment_count,
           COALESCE(AVG(cost), 0) AS avg_cost,
           AVG(CAST(julianday(COALESCE(delivered_at, datetime('now'))) - julianday(shipped_at) AS REAL)) AS avg_days,
           SUM(CASE WHEN status = 'exception' THEN 1 ELSE 0 END) AS exceptions
    FROM fulfillment_shipments
    WHERE business_id = ?
    GROUP BY carrier
  `).all(businessId);

  const ordersPerDay = db.query(`
    SELECT DATE(shipped_at) as day, COUNT(*) as count
    FROM fulfillment_shipments
    WHERE business_id = ? AND shipped_at >= datetime('now', '-30 days')
    GROUP BY DATE(shipped_at)
    ORDER BY day ASC
  `).all(businessId);

  return {
    avgDaysToShip: avgShipTime ? Math.round(avgShipTime.avg_days * 100) / 100 : 0,
    totalShipments: costStats?.total_shipments || 0,
    totalCost: costStats?.total_cost || 0,
    avgCost: costStats?.avg_cost || 0,
    onTimeRate: onTime && onTime.total > 0 ? Math.round((onTime.on_time / onTime.total) * 100) : 0,
    onTimeDelivered: onTime?.on_time || 0,
    totalDelivered: onTime?.total || 0,
    carrierPerformance: carrierPerf || [],
    ordersPerDay: ordersPerDay || [],
  };
}

// ── Fulfillment Templates ────────────────────────────────────────────

/** List all templates for a business, optionally filtered by type. */
export function getFulfillmentTemplates(db, businessId, typeFilter) {
  let sql = "SELECT * FROM fulfillment_templates WHERE business_id = ?";
  const params = [businessId];
  if (typeFilter) {
    sql += " AND type = ?";
    params.push(typeFilter);
  }
  sql += " ORDER BY type, is_default DESC, created_at DESC";
  return db.query(sql).all(...params);
}

/** Get a single template by ID. */
export function getFulfillmentTemplateById(db, id, businessId) {
  return db.query(
    "SELECT * FROM fulfillment_templates WHERE id = ? AND business_id = ?"
  ).get(id, businessId);
}

/** Create a new template. */
export function createFulfillmentTemplate(db, { businessId, type, name, config, isDefault }) {
  if (isDefault) {
    db.run(
      "UPDATE fulfillment_templates SET is_default = 0 WHERE business_id = ? AND type = ?",
      [businessId, type]
    );
  }
  const r = db.run(
    "INSERT INTO fulfillment_templates (business_id, type, name, config, is_default) VALUES (?, ?, ?, ?, ?)",
    [businessId, type, name, JSON.stringify(config || {}), isDefault ? 1 : 0]
  );
  return r.lastInsertRowid;
}

/** Update an existing template. */
export function updateFulfillmentTemplate(db, id, businessId, { type, name, config, isDefault }) {
  if (isDefault) {
    const existing = getFulfillmentTemplateById(db, id, businessId);
    db.run(
      "UPDATE fulfillment_templates SET is_default = 0 WHERE business_id = ? AND type = ? AND id != ?",
      [businessId, existing.type, id]
    );
  }
  const sets = [];
  const vals = [];
  if (name !== undefined) { sets.push("name = ?"); vals.push(name); }
  if (config !== undefined) { sets.push("config = ?"); vals.push(JSON.stringify(config)); }
  if (isDefault !== undefined) { sets.push("is_default = ?"); vals.push(isDefault ? 1 : 0); }
  if (type !== undefined) { sets.push("type = ?"); vals.push(type); }
  if (sets.length === 0) return;
  vals.push(id, businessId);
  db.run(
    `UPDATE fulfillment_templates SET ${sets.join(", ")} WHERE id = ? AND business_id = ?`,
    vals
  );
}

/** Delete a template. */
export function deleteFulfillmentTemplate(db, id, businessId) {
  db.run("DELETE FROM fulfillment_templates WHERE id = ? AND business_id = ?", [id, businessId]);
}

/** Duplicate a template. */
export function duplicateFulfillmentTemplate(db, id, businessId) {
  const orig = getFulfillmentTemplateById(db, id, businessId);
  if (!orig) return null;
  return createFulfillmentTemplate(db, {
    businessId,
    type: orig.type,
    name: `${orig.name} (Copy)`,
    config: JSON.parse(orig.config || '{}'),
    isDefault: false,
  });
}

// ── Unboxing Rules ───────────────────────────────────────────────────

/** List all unboxing rules for a business. */
export function getUnboxingRules(db, businessId) {
  return db.query(
    "SELECT * FROM fulfillment_unboxing_rules WHERE business_id = ? ORDER BY priority DESC, created_at DESC"
  ).all(businessId);
}

/** Get a single unboxing rule by ID. */
export function getUnboxingRuleById(db, id, businessId) {
  return db.query(
    "SELECT * FROM fulfillment_unboxing_rules WHERE id = ? AND business_id = ?"
  ).get(id, businessId);
}

/** Create an unboxing rule. */
export function createUnboxingRule(db, { businessId, name, conditionType, conditionValue, actionType, actionConfig, isActive, priority }) {
  const r = db.run(
    `INSERT INTO fulfillment_unboxing_rules (business_id, name, condition_type, condition_value, action_type, action_config, is_active, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [businessId, name, conditionType, conditionValue, actionType, JSON.stringify(actionConfig || {}), isActive !== false ? 1 : 0, priority || 0]
  );
  return r.lastInsertRowid;
}

/** Update an unboxing rule. */
export function updateUnboxingRule(db, id, businessId, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (k === 'actionConfig') {
      sets.push("action_config = ?");
      vals.push(JSON.stringify(v));
    } else if (k === 'isActive') {
      sets.push("is_active = ?");
      vals.push(v ? 1 : 0);
    } else {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      sets.push(`${col} = ?`);
      vals.push(v);
    }
  }
  if (sets.length === 0) return;
  vals.push(id, businessId);
  db.run(
    `UPDATE fulfillment_unboxing_rules SET ${sets.join(", ")} WHERE id = ? AND business_id = ?`,
    vals
  );
}

/** Delete an unboxing rule. */
export function deleteUnboxingRule(db, id, businessId) {
  db.run("DELETE FROM fulfillment_unboxing_rules WHERE id = ? AND business_id = ?", [id, businessId]);
}

/** Get unboxing suggestions for a specific order. */
export function getUnboxingSuggestions(db, orderId, businessId) {
  const order = db.query(
    "SELECT * FROM orders WHERE id = ? AND business_id = ?"
  ).get(orderId, businessId);
  if (!order) return [];

  const rules = getUnboxingRules(db, businessId);
  const results = [];

  for (const rule of rules) {
    if (!rule.is_active) continue;
    const config = JSON.parse(rule.action_config || '{}');
    let match = false;
    let reason = '';

    switch (rule.condition_type) {
      case 'order_value': {
        const threshold = parseFloat(rule.condition_value);
        if (!isNaN(threshold) && (order.total_amount || 0) >= threshold) {
          match = true;
          reason = `Order of $${(order.total_amount || 0).toFixed(2)} meets $${threshold} threshold`;
        }
        break;
      }
      case 'product_type': {
        const items = db.query(
          `SELECT oi.sku, oi.variant_title, p.name
           FROM order_items oi
           LEFT JOIN products p ON oi.product_id = p.id
           WHERE oi.order_id = ?`
        ).all(orderId);
        const keyword = rule.condition_value.toLowerCase();
        for (const item of items) {
          if (
            (item.name && item.name.toLowerCase().includes(keyword)) ||
            (item.variant_title && item.variant_title.toLowerCase().includes(keyword)) ||
            (item.sku && item.sku.toLowerCase().includes(keyword))
          ) {
            match = true;
            reason = `Contains product matching "${rule.condition_value}"`;
            break;
          }
        }
        break;
      }
      case 'customer_type': {
        if (rule.condition_value === 'first_time') {
          const prevOrders = db.query(
            "SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND customer_email = ? AND id != ? AND status != 'cancelled'"
          ).get(businessId, order.customer_email, orderId);
          if (prevOrders && prevOrders.count === 0) {
            match = true;
            reason = "First-time customer";
          }
        } else if (rule.condition_value === 'returning') {
          const prevOrders = db.query(
            "SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND customer_email = ? AND id != ? AND status != 'cancelled'"
          ).get(businessId, order.customer_email, orderId);
          if (prevOrders && prevOrders.count > 0) {
            match = true;
            reason = "Returning customer";
          }
        } else if (rule.condition_value === 'wholesale' && order.source === 'wholesale') {
          match = true;
          reason = "Wholesale order";
        }
        break;
      }
      case 'seasonal': {
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const [startM, startD, endM, endD] = rule.condition_value.split('-').map(Number);
        const currentDate = month * 100 + day;
        const startDate = (startM || 1) * 100 + (startD || 1);
        const endDate = (endM || 12) * 100 + (endD || 31);
        if (currentDate >= startDate && currentDate <= endDate) {
          match = true;
          reason = `Seasonal rule active (${rule.condition_value})`;
        }
        break;
      }
      case 'custom': {
        match = true;
        reason = "Custom rule";
        break;
      }
    }

    if (match) {
      results.push({
        id: rule.id,
        name: rule.name,
        condition_type: rule.condition_type,
        condition_value: rule.condition_value,
        action_type: rule.action_type,
        action_config: config,
        priority: rule.priority,
        reason,
      });
    }
  }

  return results;
}
// ═══════════════════════════════════════════════════════════════════════
// FULFILLMENT HQ 1.2 — PACKING RECIPES
// ═══════════════════════════════════════════════════════════════════════

/** List all packing recipes for a business, with optional filters. */
export function getPackingRecipes(db, businessId, { productId, orderType } = {}) {
  let sql = "SELECT * FROM packing_recipes WHERE business_id = ? AND is_active = 1";
  const params = [businessId];

  if (productId !== undefined) {
    sql += " AND (product_id = ? OR product_id IS NULL)";
    params.push(productId);
  }
  if (orderType) {
    sql += " AND (order_type = ? OR order_type = 'any')";
    params.push(orderType);
  }

  sql += " ORDER BY priority ASC, name ASC";
  const rows = db.query(sql).all(...params);
  return rows.map(parseRecipeRow);
}

/** Get a single packing recipe by ID. */
export function getPackingRecipeById(db, id, businessId) {
  const row = db.query(
    "SELECT * FROM packing_recipes WHERE id = ? AND business_id = ?"
  ).get(id, businessId);
  return row ? parseRecipeRow(row) : null;
}

/** Create a packing recipe. Returns lastInsertRowid. */
export function createPackingRecipe(db, {
  businessId, name, productId = null, orderType = 'any',
  boxSize = null, packingMaterials = [], inserts = [],
  labels = null, specialInstructions = null, priority = 1, isActive = 1,
}) {
  const result = db.run(
    `INSERT INTO packing_recipes (business_id, name, product_id, order_type, box_size, packing_materials, inserts, labels, special_instructions, priority, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      businessId, name, productId, orderType, boxSize,
      JSON.stringify(packingMaterials), JSON.stringify(inserts),
      labels ? JSON.stringify(labels) : null, specialInstructions, priority, isActive ? 1 : 0,
    ]
  );
  return result.lastInsertRowid;
}

/** Update a packing recipe. Returns changes count. */
export function updatePackingRecipe(db, id, businessId, fields) {
  const sets = [];
  const vals = [];

  if (fields.name !== undefined) { sets.push("name = ?"); vals.push(fields.name); }
  if (fields.productId !== undefined) { sets.push("product_id = ?"); vals.push(fields.productId); }
  if (fields.orderType !== undefined) { sets.push("order_type = ?"); vals.push(fields.orderType); }
  if (fields.boxSize !== undefined) { sets.push("box_size = ?"); vals.push(fields.boxSize); }
  if (fields.packingMaterials !== undefined) { sets.push("packing_materials = ?"); vals.push(JSON.stringify(fields.packingMaterials)); }
  if (fields.inserts !== undefined) { sets.push("inserts = ?"); vals.push(JSON.stringify(fields.inserts)); }
  if (fields.labels !== undefined) { sets.push("labels = ?"); vals.push(fields.labels ? JSON.stringify(fields.labels) : null); }
  if (fields.specialInstructions !== undefined) { sets.push("special_instructions = ?"); vals.push(fields.specialInstructions); }
  if (fields.priority !== undefined) { sets.push("priority = ?"); vals.push(fields.priority); }
  if (fields.isActive !== undefined) { sets.push("is_active = ?"); vals.push(fields.isActive ? 1 : 0); }

  if (sets.length === 0) return 0;
  vals.push(id, businessId);

  const result = db.run(
    `UPDATE packing_recipes SET ${sets.join(", ")} WHERE id = ? AND business_id = ?`,
    vals
  );
  return result.changes;
}

/** Delete a packing recipe. */
export function deletePackingRecipe(db, id, businessId) {
  const row = db.query("SELECT id FROM packing_recipes WHERE id = ? AND business_id = ?").get(id, businessId);
  if (!row) return false;
  db.run("DELETE FROM packing_recipes WHERE id = ? AND business_id = ?", [id, businessId]);
  return true;
}

/**
 * THE KEY FUNCTION: Get packing recipes for a specific order.
 * Given an order, find all matching recipes by joining:
 *   order_items → products → packing_recipes
 * Plus fallback to "any product" recipes.
 * Match on order_type (order.source).
 * Return sorted by priority.
 */
export function getPackingRecipeForOrder(db, orderId, businessId) {
  // Get the order to check its source
  const order = db.query(
    "SELECT id, source, order_number FROM orders WHERE id = ? AND business_id = ?"
  ).get(orderId, businessId);
  if (!order) return [];

  // Map order.source to recipe order_type
  let orderType = order.source;
  if (!['retail', 'wholesale', 'sample'].includes(orderType)) {
    orderType = 'retail';
  }

  // Get distinct product IDs from order items
  const productIds = db.query(
    "SELECT DISTINCT product_id FROM order_items WHERE order_id = ? AND product_id IS NOT NULL"
  ).all(orderId).map(r => r.product_id);

  if (productIds.length === 0) {
    const rows = db.query(
      `SELECT * FROM packing_recipes
       WHERE business_id = ? AND is_active = 1
         AND product_id IS NULL
         AND (order_type = ? OR order_type = 'any')
       ORDER BY priority ASC, name ASC`
    ).all(businessId, orderType);
    return rows.map(parseRecipeRow);
  }

  const placeholders = productIds.map(() => '?').join(', ');
  const sql = `
    SELECT DISTINCT pr.* FROM packing_recipes pr
    WHERE pr.business_id = ? AND pr.is_active = 1
      AND (pr.product_id IN (${placeholders}) OR pr.product_id IS NULL)
      AND (pr.order_type = ? OR pr.order_type = 'any')
    ORDER BY pr.priority ASC, pr.name ASC
  `;
  const rows = db.query(sql).all(businessId, ...productIds, orderType);
  return rows.map(parseRecipeRow);
}

/** Helper: parse JSON fields in a recipe row. */
function parseRecipeRow(row) {
  return {
    ...row,
    packing_materials: safelyParseJson(row.packing_materials, []),
    inserts: safelyParseJson(row.inserts, []),
    labels: safelyParseJson(row.labels, null),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// SPLIT SHIPMENT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/** Create a new order_shipment record. Returns the new shipment ID. */
export function createOrderShipment(db, { orderId, shipmentNumber, status = 'pending', notes = null }) {
  const r = db.run(
    `INSERT INTO order_shipments (order_id, shipment_number, status, notes)
     VALUES (?, ?, ?, ?)`,
    [orderId, shipmentNumber, status, notes]
  );
  return r.lastInsertRowid;
}

/** Add an item to a shipment. */
export function addShipmentItem(db, { shipmentId, orderItemId, quantity }) {
  const r = db.run(
    `INSERT INTO order_shipment_items (shipment_id, order_item_id, quantity)
     VALUES (?, ?, ?)`,
    [shipmentId, orderItemId, quantity]
  );
  return r.lastInsertRowid;
}

/** Get all shipments for an order with their items. */
export function getOrderShipments(db, orderId) {
  const shipments = db.query(
    `SELECT * FROM order_shipments WHERE order_id = ? ORDER BY shipment_number`
  ).all(orderId);

  return shipments.map(s => {
    const items = db.query(
      `SELECT osi.id, osi.quantity, oi.id AS order_item_id, oi.sku,
              oi.variant_title, oi.quantity AS ordered_qty, oi.unit_price, oi.line_total,
              oi.product_id, p.name AS product_name, p.barcode
       FROM order_shipment_items osi
       JOIN order_items oi ON osi.order_item_id = oi.id
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE osi.shipment_id = ?
       ORDER BY osi.id`
    ).all(s.id);
    return { ...s, items };
  });
}

/** Get a single shipment by ID. */
export function getOrderShipmentById(db, shipmentId) {
  const s = db.query("SELECT * FROM order_shipments WHERE id = ?").get(shipmentId);
  if (!s) return null;
  const items = db.query(
    `SELECT osi.id, osi.quantity, oi.id AS order_item_id, oi.sku,
            oi.variant_title, oi.quantity AS ordered_qty, oi.unit_price, oi.line_total,
            oi.product_id, p.name AS product_name, p.barcode
     FROM order_shipment_items osi
     JOIN order_items oi ON osi.order_item_id = oi.id
     LEFT JOIN products p ON oi.product_id = p.id
     WHERE osi.shipment_id = ?
     ORDER BY osi.id`
  ).all(shipmentId);
  return { ...s, items };
}

/** Update a shipment's fields (status, carrier, tracking, etc.) */
export function updateOrderShipment(db, shipmentId, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(k + " = ?");
    vals.push(v);
  }
  if (sets.length === 0) return;
  vals.push(shipmentId);
  db.run("UPDATE order_shipments SET " + sets.join(", ") + " WHERE id = ?", vals);
}

/** Ship a specific order_shipment — creates fulfillment_shipments record and updates status. */
export function shipOrderShipment(db, { shipmentId, carrier, trackingNumber, orderId, businessId }) {
  const r = db.run(
    `INSERT INTO fulfillment_shipments (order_id, carrier, tracking_number, status, shipped_at, business_id)
     VALUES (?, ?, ?, 'label_created', datetime('now'), ?)`,
    [orderId, carrier, trackingNumber || null, businessId]
  );

  db.run(
    "UPDATE order_shipments SET status = 'shipped', carrier = ?, tracking_number = ?, shipped_at = datetime('now') WHERE id = ?",
    [carrier, trackingNumber || null, shipmentId]
  );

  const remaining = db.query(
    "SELECT COUNT(*) as cnt FROM order_shipments WHERE order_id = ? AND status != 'shipped' AND status != 'delivered'"
  ).get(orderId);

  if (remaining && remaining.cnt === 0) {
    db.run("UPDATE orders SET status = 'shipped' WHERE id = ?", [orderId]);
  } else {
    db.run("UPDATE orders SET status = 'partial' WHERE id = ?", [orderId]);
  }

  return r.lastInsertRowid;
}

/** Get split suggestion for an order. */
export function getSplitSuggestion(db, orderId) {
  const items = db.query(
    `SELECT oi.id, oi.sku, oi.variant_title, oi.quantity, oi.product_id,
            p.name AS product_name, p.stock_count
     FROM order_items oi
     LEFT JOIN products p ON oi.product_id = p.id
     WHERE oi.order_id = ?
     ORDER BY oi.id`
  ).all(orderId);

  if (items.length === 0) return { suggestSplit: false, backorderedItems: [], readyItems: [] };

  const backorderedItems = items.filter(i => (i.stock_count ?? 0) < i.quantity);
  const readyItems = items.filter(i => (i.stock_count ?? 0) >= i.quantity);

  const suggestSplit = backorderedItems.length > 0 && readyItems.length > 0;

  let message = '';
  if (suggestSplit) {
    const boNames = backorderedItems.map(i => i.product_name || i.sku).join(', ');
    if (backorderedItems.length === 1) {
      message = "It looks like only one item (" + boNames + ") is backordered. Would you like me to split this shipment so your customer receives the rest today?";
    } else {
      message = backorderedItems.length + " items are backordered: " + boNames + ". Would you like me to split this shipment so your customer receives the in-stock items today?";
    }
  }

  return { suggestSplit, backorderedItems, readyItems, message };
}

/** Get order timeline with shipments for customer view. */
export function getOrderTimelineWithShipments(db, orderId) {
  const order = db.query(
    "SELECT id, order_number, customer_name, status, created_at FROM orders WHERE id = ?"
  ).get(orderId);
  if (!order) return null;

  const shipments = getOrderShipments(db, orderId);

  return { ...order, shipments };
}
// ═══════════════════════════════════════════════════════════════════════
// OPERATIONS CENTER — order operations (V2)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get available operations for an order, checking status to determine
 * which operations make sense.
 */
export function getOrderOperations(db, orderId, businessId) {
  const order = db.query(
    "SELECT id, status, previous_status, hold_reason FROM orders WHERE id = ? AND business_id = ?"
  ).get(orderId, businessId);
  if (!order) return null;

  const isHeld = order.status === 'held';
  const isComplete = order.status === 'complete' || order.status === 'shipped';
  const isCancelled = order.status === 'cancelled';
  const isCombined = order.status === 'combined';

  const items = db.query(
    "SELECT id, sku, quantity, item_status FROM order_items WHERE order_id = ?",
  ).all(orderId);

  const hasItems = items.length > 0;
  const hasActiveItems = items.some(i => i.item_status === 'active' || !i.item_status);
  const hasBackorderedItems = items.some(i => i.item_status === 'backordered');

  // Build operations list
  const operations = [
    {
      id: 'split',
      label: 'Split Shipment',
      available: hasActiveItems && !isCancelled && !isComplete,
      reason: isCancelled ? 'Order is cancelled' : isComplete ? 'Order is complete' : !hasActiveItems ? 'No active items to split' : null,
      icon: '✂️',
    },
    {
      id: 'merge',
      label: 'Combine with another order',
      available: !isCancelled && !isComplete && !isCombined,
      reason: isCancelled ? 'Order is cancelled' : isComplete ? 'Order is complete' : isCombined ? 'Order is already combined' : null,
      icon: '🔗',
    },
    {
      id: 'hold',
      label: 'Hold Order',
      available: !isHeld && !isComplete && !isCancelled,
      reason: isHeld ? 'Order is already on hold' : isComplete ? 'Order is complete' : isCancelled ? 'Order is cancelled' : null,
      icon: '⏸️',
    },
    {
      id: 'release_hold',
      label: 'Release Hold',
      available: isHeld,
      reason: !isHeld ? 'Order is not on hold' : null,
      icon: '▶️',
    },
    {
      id: 'cancel_item',
      label: 'Cancel Item',
      available: hasActiveItems && !isCancelled && !isComplete,
      reason: isCancelled ? 'Order is cancelled' : isComplete ? 'Order is complete' : !hasActiveItems ? 'No active items to cancel' : null,
      icon: '❌',
    },
    {
      id: 'backorder',
      label: 'Backorder Item',
      available: hasActiveItems && !isCancelled && !isComplete,
      reason: isCancelled ? 'Order is cancelled' : isComplete ? 'Order is complete' : !hasActiveItems ? 'No active items to backorder' : null,
      icon: '📦',
    },
    {
      id: 'substitute',
      label: 'Substitute Item',
      available: hasActiveItems && !isCancelled && !isComplete,
      reason: isCancelled ? 'Order is cancelled' : isComplete ? 'Order is complete' : !hasActiveItems ? 'No active items to substitute' : null,
      icon: '🔄',
    },
    {
      id: 'store_credit',
      label: 'Issue Store Credit',
      available: !isCancelled,
      reason: isCancelled ? 'Order is cancelled' : null,
      icon: '💳',
    },
    {
      id: 'refund',
      label: 'Refund Order',
      available: !isCancelled,
      reason: isCancelled ? 'Order is cancelled' : null,
      icon: '💰',
    },
  ];

  return {
    orderId,
    orderStatus: order.status,
    holdReason: order.hold_reason || null,
    previousStatus: order.previous_status || null,
    itemCount: items.length,
    hasBackorderedItems,
    availableOperations: operations,
  };
}

/** Hold an order — set status to 'held', record reason, save previous status. */
export function holdOrder(db, orderId, businessId, reason, userId) {
  const order = db.query(
    "SELECT id, status FROM orders WHERE id = ? AND business_id = ?"
  ).get(orderId, businessId);
  if (!order) return { success: false, error: "Order not found" };
  if (order.status === 'held') return { success: false, error: "Order is already on hold" };

  const previousStatus = order.status;
  db.run(
    "UPDATE orders SET status = 'held', previous_status = ?, hold_reason = ?, held_at = datetime('now') WHERE id = ?",
    [previousStatus, reason || null, orderId]
  );

  // Add order note
  db.run(
    "UPDATE orders SET notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || '\n' || ? END WHERE id = ?",
    [`[held] ${reason || 'No reason provided'}`, `[held] ${reason || 'No reason provided'}`, orderId]
  );

  return { success: true, previousStatus };
}

/** Release a held order — restore to previous status. */
export function releaseHold(db, orderId, businessId, userId) {
  const order = db.query(
    "SELECT id, status, previous_status FROM orders WHERE id = ? AND business_id = ?"
  ).get(orderId, businessId);
  if (!order) return { success: false, error: "Order not found" };
  if (order.status !== 'held') return { success: false, error: "Order is not on hold" };

  const restoreStatus = order.previous_status || 'pending';
  db.run(
    "UPDATE orders SET status = ?, previous_status = NULL, hold_reason = NULL, held_at = NULL WHERE id = ?",
    [restoreStatus, orderId]
  );

  // Add order note
  db.run(
    "UPDATE orders SET notes = CASE WHEN notes IS NULL OR notes = '' THEN '[released hold]' ELSE notes || '\n[released hold]' END WHERE id = ?",
    [orderId]
  );

  return { success: true, restoredStatus: restoreStatus };
}

/** Cancel a specific item from an order. Optionally processes refund or store credit. */
export function cancelOrderItem(db, orderId, orderItemId, businessId, reason, refundAction) {
  const item = db.query(
    "SELECT oi.*, o.customer_email, o.total_amount FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.id = ? AND oi.order_id = ? AND o.business_id = ?",
  ).get(orderItemId, orderId, businessId);
  if (!item) return { success: false, error: "Order item not found" };

  // Mark item as cancelled
  db.run(
    "UPDATE order_items SET item_status = 'cancelled' WHERE id = ?",
    [orderItemId]
  );

  // Update order total
  const itemTotal = item.line_total || (item.unit_price || 0) * item.quantity;
  db.run(
    "UPDATE orders SET total_amount = MAX(0, COALESCE(total_amount, 0) - ?) WHERE id = ?",
    [itemTotal, orderId]
  );

  // Add order note
  db.run(
    "UPDATE orders SET notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || '\n' || ? END WHERE id = ?",
    [`[cancelled item] ${item.sku || item.variant_title}: ${reason || 'No reason'}`, `[cancelled item] ${item.sku || item.variant_title}: ${reason || 'No reason'}`, orderId]
  );

  let refundId = null;
  let creditId = null;

  // Process refund or store credit
  if (refundAction === 'refund' && itemTotal > 0) {
    const result = db.run(
      `INSERT INTO returns_refunds (business_id, order_id, order_item_id, type, status, amount, reason, notes, created_at)
       VALUES (?, ?, ?, 'refund', 'completed', ?, ?, ?, datetime('now'))`,
      [businessId, orderId, orderItemId, itemTotal, reason || 'Item cancelled', `Cancelled item: ${item.sku || item.variant_title}`]
    );
    refundId = result.lastInsertRowid;
  } else if (refundAction === 'store_credit' && itemTotal > 0) {
    // Create returns_refunds record
    const rrResult = db.run(
      `INSERT INTO returns_refunds (business_id, order_id, order_item_id, type, status, amount, reason, store_credit_amount, notes, created_at)
       VALUES (?, ?, ?, 'refund', 'completed', ?, ?, ?, ?, datetime('now'))`,
      [businessId, orderId, orderItemId, itemTotal, reason || 'Item cancelled', itemTotal, `Cancelled item: ${item.sku || item.variant_title}`]
    );
    refundId = rrResult.lastInsertRowid;

    // Create store credit
    const creditCode = 'SC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const scResult = db.run(
      `INSERT INTO customer_store_credit (business_id, customer_email, return_refund_id, store_credit_code, amount_issued, amount_remaining, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [businessId, item.customer_email || '', refundId, creditCode, itemTotal, itemTotal]
    );
    creditId = scResult.lastInsertRowid;
  }

  // Check if all items are now cancelled
  const activeItems = db.query(
    "SELECT COUNT(*) as cnt FROM order_items WHERE order_id = ? AND (item_status = 'active' OR item_status IS NULL)",
  ).get(orderId);
  if (activeItems && activeItems.cnt === 0) {
    db.run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [orderId]);
  }

  return { success: true, refundId, creditId, itemTotal };
}

/** Mark an order item as backordered. */
export function backorderOrderItem(db, orderId, orderItemId, businessId) {
  const item = db.query(
    "SELECT * FROM order_items WHERE id = ? AND order_id = ?",
  ).get(orderItemId, orderId);
  if (!item) return { success: false, error: "Order item not found" };

  db.run(
    "UPDATE order_items SET item_status = 'backordered' WHERE id = ?",
    [orderItemId]
  );

  // Add order note
  db.run(
    "UPDATE orders SET notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || '\n' || ? END WHERE id = ?",
    [`[backordered] ${item.sku || item.variant_title}`, `[backordered] ${item.sku || item.variant_title}`, orderId]
  );

  return { success: true };
}

/** Substitute an order item with a different product/variant. */
export function substituteOrderItem(db, orderId, orderItemId, replacementProductId, replacementVariantId, businessId) {
  const item = db.query(
    "SELECT * FROM order_items WHERE id = ? AND order_id = ?",
  ).get(orderItemId, orderId);
  if (!item) return { success: false, error: "Order item not found" };

  // Get replacement product info
  const replacement = db.query(
    "SELECT p.name, p.sku, p.barcode, pv.variant_value, pv.price, pv.sku as variant_sku FROM products p LEFT JOIN product_variants pv ON pv.id = ? WHERE p.id = ?",
  ).get(replacementVariantId || null, replacementProductId);
  if (!replacement) return { success: false, error: "Replacement product not found" };

  const replacementSku = replacement.variant_sku || replacement.sku;
  const replacementTitle = replacement.variant_value || null;
  const replacementPrice = replacement.price || item.unit_price;
  const newLineTotal = replacementPrice * item.quantity;
  const oldLineTotal = item.line_total || (item.unit_price || 0) * item.quantity;
  const priceDiff = newLineTotal - oldLineTotal;

  // Mark original item as substituted
  db.run(
    "UPDATE order_items SET item_status = 'substituted' WHERE id = ?",
    [orderItemId]
  );

  // Create new order item with the replacement
  const newItemResult = db.run(
    `INSERT INTO order_items (order_id, product_id, variant_id, sku, variant_title, quantity, unit_price, line_total, business_id, item_status, substituted_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [orderId, replacementProductId, replacementVariantId || null, replacementSku, replacementTitle, item.quantity, replacementPrice, newLineTotal, businessId || item.business_id, `item_id:${orderItemId}`]
  );

  // Update order total
  db.run(
    "UPDATE orders SET total_amount = COALESCE(total_amount, 0) + ? WHERE id = ?",
    [priceDiff, orderId]
  );

  // Add order note
  db.run(
    "UPDATE orders SET notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || '\n' || ? END WHERE id = ?",
    [`[substituted] ${item.sku || item.variant_title} → ${replacementSku} (${replacement.name})`, `[substituted] ${item.sku || item.variant_title} → ${replacementSku} (${replacement.name})`, orderId]
  );

  return { success: true, newItemId: newItemResult.lastInsertRowid, priceDiff };
}

// ═══════════════════════════════════════════════════════════════════════
// NOVI MESSAGE CENTER
// ═══════════════════════════════════════════════════════════════════════

/** Get messages for a business with optional filters. */
export function getNoviMessages(db, businessId, filters = {}) {
  const conditions = ["business_id = ?"];
  const params = [businessId];

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters.severity) {
    conditions.push("severity = ?");
    params.push(filters.severity);
  }

  const limit = filters.limit || 20;
  const offset = filters.offset || 0;

  const rows = db.query(
    `SELECT id, business_id, user_id, event_type, title, description, action_type,
            action_label, action_link, action_route, severity, status, context_data,
            created_at, viewed_at, completed_at
     FROM novi_messages
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  return rows.map(r => ({
    ...r,
    context_data: r.context_data ? JSON.parse(r.context_data) : null,
  }));
}

/** Create a single message. Returns the new message ID. */
export function createNoviMessage(db, data) {
  const result = db.run(
    `INSERT INTO novi_messages (business_id, user_id, event_type, title, description, action_type, action_label, action_link, action_route, severity, status, context_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    [
      data.businessId,
      data.userId || null,
      data.eventType,
      data.title,
      data.description,
      data.actionType || null,
      data.actionLabel || null,
      data.actionLink || null,
      data.actionRoute || null,
      data.severity || "info",
      data.contextData || null,
    ]
  );
  return result.lastInsertRowid;
}

/** Update a message's status. Sets viewed_at or completed_at as appropriate. */
export function updateNoviMessageStatus(db, messageId, businessId, status) {
  const message = db.query(
    "SELECT id FROM novi_messages WHERE id = ? AND business_id = ?"
  ).get(messageId, businessId);

  if (!message) return null;

  const now = new Date().toISOString();
  const sets = ["status = ?"];
  const params = [status];

  if (status === "viewed" || status === "completed") {
    sets.push("viewed_at = COALESCE(viewed_at, ?)");
    params.push(now);
  }
  if (status === "completed") {
    sets.push("completed_at = ?");
    params.push(now);
  }

  params.push(messageId, businessId);

  db.run(
    `UPDATE novi_messages SET ${sets.join(", ")} WHERE id = ? AND business_id = ?`,
    ...params
  );

  return { id: messageId, status };
}

/** Get message counts by status and severity for a business. */
export function getNoviMessageCounts(db, businessId) {
  const unread = db.query(
    "SELECT COUNT(*) as count FROM novi_messages WHERE business_id = ? AND status = 'new'"
  ).get(businessId).count;

  const urgent = db.query(
    "SELECT COUNT(*) as count FROM novi_messages WHERE business_id = ? AND severity = 'urgent' AND status = 'new'"
  ).get(businessId).count;

  const celebration = db.query(
    "SELECT COUNT(*) as count FROM novi_messages WHERE business_id = ? AND severity = 'celebration' AND status = 'new'"
  ).get(businessId).count;

  return { unread, urgent, celebration };
}

/** Get the most recent unread message for a business. */
export function getNoviLatestMessage(db, businessId) {
  const row = db.query(
    `SELECT id, event_type, title, description, action_type, action_label, action_link, action_route,
            severity, status, context_data, created_at
     FROM novi_messages
     WHERE business_id = ? AND status = 'new'
     ORDER BY created_at DESC
     LIMIT 1`
  ).get(businessId);

  if (!row) return null;

  return {
    ...row,
    context_data: row.context_data ? JSON.parse(row.context_data) : null,
  };
}

/** Get Novi settings for a business (and optionally a user). */
export function getNoviSettings(db, businessId, userId) {
  return db.query(
    "SELECT * FROM novi_settings WHERE business_id = ?"
  ).get(businessId);
}

/** Upsert Novi settings for a business (and optionally a user). */
export function upsertNoviSettings(db, businessId, userId, data) {
  const existing = db.query(
    "SELECT id FROM novi_settings WHERE business_id = ?",
  ).get(businessId);

  if (existing) {
    const sets = [];
    const params = [];

    if (data.frequency !== undefined) { sets.push("frequency = ?"); params.push(data.frequency); }
    if (data.soundEnabled !== undefined) { sets.push("sound_enabled = ?"); params.push(data.soundEnabled); }
    if (data.popupEnabled !== undefined) { sets.push("popup_enabled = ?"); params.push(data.popupEnabled); }
    if (data.emailEnabled !== undefined) { sets.push("email_enabled = ?"); params.push(data.emailEnabled); }
    if (data.pushEnabled !== undefined) { sets.push("push_enabled = ?"); params.push(data.pushEnabled); }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      params.push(existing.id);
      db.run(`UPDATE novi_settings SET ${sets.join(", ")} WHERE id = ?`, ...params);
    }
  } else {
    db.run(
      `INSERT INTO novi_settings (business_id, frequency, sound_enabled, popup_enabled, email_enabled, push_enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        businessId,
        data.frequency || "balanced",
        data.soundEnabled !== undefined ? data.soundEnabled : 1,
        data.popupEnabled !== undefined ? data.popupEnabled : 1,
        data.emailEnabled !== undefined ? data.emailEnabled : 0,
        data.pushEnabled !== undefined ? data.pushEnabled : 0,
      ]
    );
  }
}
