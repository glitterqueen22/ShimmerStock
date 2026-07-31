/**
 * Movement History — API Routes
 * =============================
 * Mounted on the Express app from index.js.
 */

/**
 * Mount movement-related routes on the Express app.
 * @param {import("express").Express} app
 * @param {import("bun:sqlite").Database} db
 * @param {Function} requireAuth - Auth middleware factory
 */
export function mountMovementRoutes(app, db, requireAuth) {
  // GET /api/products/:id/movements — paginated movement history for a product
  app.get("/api/products/:id/movements", requireAuth(db, "products.read"), (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const offset = parseInt(req.query.offset) || 0;
      const type = req.query.type || null;
      const from = req.query.from || null;
      const to = req.query.to || null;

      // Build WHERE clauses
      const conditions = ["im.product_id = ?", "im.business_id = ?"];
      const params = [productId, req.businessId];

      if (type && ["in", "out", "order"].includes(type)) {
        conditions.push("im.type = ?");
        params.push(type);
      }

      if (from) {
        conditions.push("im.created_at >= ?");
        params.push(from);
      }

      if (to) {
        conditions.push("im.created_at <= ?");
        params.push(to);
      }

      const whereClause = conditions.join(" AND ");

      // Count total matching movements
      const countRow = db
        .query(`SELECT COUNT(*) as total FROM inventory_movements im WHERE ${whereClause}`)
        .get(...params);

      const total = countRow ? countRow.total : 0;

      // Fetch movements with user name
      const movements = db
        .query(
          `SELECT im.*, u.name as user_name, u.display_name as user_display_name
           FROM inventory_movements im
           LEFT JOIN users u ON im.user_id = u.id
           WHERE ${whereClause}
           ORDER BY im.created_at DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset);

      res.json({ movements, total, limit, offset });
    } catch (err) {
      console.error("GET /api/products/:id/movements error:", err);
      res.status(500).json({ error: "Failed to fetch movement history" });
    }
  });

  console.log("Movement routes mounted");
}
