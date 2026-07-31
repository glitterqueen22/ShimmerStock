// ═══════════════════════════════════════════════════════════════════════
// WAREHOUSE ENGINE — Store functions
// ═══════════════════════════════════════════════════════════════════════

import { transaction, incrementOrderItemScanned, createOrderScan } from "./store.js";

/** Create a warehouse bin. Returns lastInsertRowid. */
export function createBin(db, { businessId, name, zone }) {
  const r = db.run(
    "INSERT INTO warehouse_bins (business_id, name, zone) VALUES (?, ?, ?)",
    [businessId, name, zone || null]
  );
  return r.lastInsertRowid;
}

/** List all bins for a business with content counts. */
export function listBins(db, businessId) {
  return db.query(`
    SELECT wb.id, wb.name, wb.zone, wb.created_at,
           COUNT(bc.id) AS product_count,
           COALESCE(SUM(bc.quantity), 0) AS total_quantity
    FROM warehouse_bins wb
    LEFT JOIN bin_contents bc ON bc.bin_id = wb.id
    WHERE wb.business_id = ?
    GROUP BY wb.id
    ORDER BY wb.zone, wb.name
  `).all(businessId);
}

/** Get single bin by ID. */
export function getBin(db, binId, businessId) {
  return db.query(
    "SELECT id, name, zone, created_at FROM warehouse_bins WHERE id = ? AND business_id = ?"
  ).get(binId, businessId);
}

/** Get contents of a specific bin. */
export function getBinContents(db, binId, businessId) {
  return db.query(`
    SELECT bc.id, bc.product_id, bc.variant_id, bc.quantity, bc.last_moved_at,
           p.name AS product_name, p.sku, p.stock_count,
           pv.sku AS variant_sku, pv.variant_value
    FROM bin_contents bc
    LEFT JOIN products p ON bc.product_id = p.id
    LEFT JOIN product_variants pv ON bc.variant_id = pv.id
    WHERE bc.bin_id = ? AND bc.business_id = ?
    ORDER BY p.name
  `).all(binId, businessId);
}

/** Receive items into a bin — add stock, update bin, record transfer, update product stock. */
export function receiveIntoBin(db, { binId, productId, variantId, quantity, referenceType, referenceId, notes, businessId, userId }) {
  return transaction(db, () => {
    const existing = db.query(
      "SELECT id, quantity FROM bin_contents WHERE bin_id = ? AND product_id = ? AND COALESCE(variant_id,0) = COALESCE(?,0) AND business_id = ?"
    ).get(binId, productId, variantId || 0, businessId);

    if (existing) {
      db.run("UPDATE bin_contents SET quantity = quantity + ?, last_moved_at = datetime('now') WHERE id = ?",
        [quantity, existing.id]);
    } else {
      db.run(
        "INSERT INTO bin_contents (business_id, bin_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?, ?)",
        [businessId, binId, productId, variantId || null, quantity]
      );
    }

    db.run(
      `INSERT INTO warehouse_transfers (business_id, from_bin_id, to_bin_id, product_id, variant_id, quantity, transfer_type, reference_type, reference_id, notes, created_by)
       VALUES (?, NULL, ?, ?, ?, ?, 'receive', ?, ?, ?, ?)`,
      [businessId, binId, productId, variantId || null, quantity, referenceType || null, referenceId || null, notes || null, userId || null]
    );

    db.run("UPDATE products SET stock_count = stock_count + ?, updated_at = datetime('now'), bin_location = (SELECT name FROM warehouse_bins WHERE id = ?) WHERE id = ?",
      [quantity, binId, productId]);

    if (variantId) {
      db.run("UPDATE product_variants SET stock_count = stock_count + ?, updated_at = datetime('now') WHERE id = ?",
        [quantity, variantId]);
    }

    return { binId, productId, quantity };
  });
}

/** Move stock between bins — update both bin_contents, record transfer. */
export function moveBetweenBins(db, { fromBinId, toBinId, productId, variantId, quantity, notes, businessId, userId }) {
  return transaction(db, () => {
    const fromContent = db.query(
      "SELECT id, quantity FROM bin_contents WHERE bin_id = ? AND product_id = ? AND COALESCE(variant_id,0) = COALESCE(?,0) AND business_id = ?"
    ).get(fromBinId, productId, variantId || 0, businessId);

    if (!fromContent || fromContent.quantity < quantity) {
      throw new Error(`Insufficient quantity in source bin. Available: ${fromContent ? fromContent.quantity : 0}, requested: ${quantity}`);
    }

    const newFromQty = fromContent.quantity - quantity;
    if (newFromQty <= 0) {
      db.run("DELETE FROM bin_contents WHERE id = ?", [fromContent.id]);
    } else {
      db.run("UPDATE bin_contents SET quantity = ?, last_moved_at = datetime('now') WHERE id = ?",
        [newFromQty, fromContent.id]);
    }

    const toContent = db.query(
      "SELECT id, quantity FROM bin_contents WHERE bin_id = ? AND product_id = ? AND COALESCE(variant_id,0) = COALESCE(?,0) AND business_id = ?"
    ).get(toBinId, productId, variantId || 0, businessId);

    if (toContent) {
      db.run("UPDATE bin_contents SET quantity = quantity + ?, last_moved_at = datetime('now') WHERE id = ?",
        [quantity, toContent.id]);
    } else {
      db.run(
        "INSERT INTO bin_contents (business_id, bin_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?, ?)",
        [businessId, toBinId, productId, variantId || null, quantity]
      );
    }

    db.run(
      `INSERT INTO warehouse_transfers (business_id, from_bin_id, to_bin_id, product_id, variant_id, quantity, transfer_type, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'move', ?, ?)`,
      [businessId, fromBinId, toBinId, productId, variantId || null, quantity, notes || null, userId || null]
    );

    db.run("UPDATE products SET bin_location = (SELECT name FROM warehouse_bins WHERE id = ?), updated_at = datetime('now') WHERE id = ?",
      [toBinId, productId]);

    return { fromBinId, toBinId, productId, quantity };
  });
}

/** Pick items from a bin for order fulfillment. */
export function pickForOrder(db, { orderId, binId, productId, variantId, quantity, orderItemId, businessId, userId }) {
  return transaction(db, () => {
    const content = db.query(
      "SELECT id, quantity FROM bin_contents WHERE bin_id = ? AND product_id = ? AND COALESCE(variant_id,0) = COALESCE(?,0) AND business_id = ?"
    ).get(binId, productId, variantId || 0, businessId);

    if (!content || content.quantity < quantity) {
      throw new Error(`Insufficient quantity in bin. Available: ${content ? content.quantity : 0}, requested: ${quantity}`);
    }

    const newQty = content.quantity - quantity;
    if (newQty <= 0) {
      db.run("DELETE FROM bin_contents WHERE id = ?", [content.id]);
    } else {
      db.run("UPDATE bin_contents SET quantity = ?, last_moved_at = datetime('now') WHERE id = ?",
        [newQty, content.id]);
    }

    // Find shipping bin or use to_bin_id=binId as fallback
    const shipBin = db.query("SELECT id FROM warehouse_bins WHERE zone = 'Shipping' AND business_id = ? LIMIT 1").get(businessId);
    const toBinId = shipBin ? shipBin.id : binId;

    db.run(
      `INSERT INTO warehouse_transfers (business_id, from_bin_id, to_bin_id, product_id, variant_id, quantity, transfer_type, reference_type, reference_id, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'pick', 'order', ?, 'Picked for order', ?)`,
      [businessId, binId, toBinId, productId, variantId || null, quantity, orderId, userId || null]
    );

    db.run("UPDATE products SET stock_count = MAX(0, stock_count - ?), updated_at = datetime('now') WHERE id = ?",
      [quantity, productId]);

    if (variantId) {
      db.run("UPDATE product_variants SET stock_count = MAX(0, stock_count - ?), updated_at = datetime('now') WHERE id = ?",
        [quantity, variantId]);
    }

    // ── Unified scan tracking: reconcile warehouse picks with order scanning ──
    // Find the order item for tracking
    let oiId = orderItemId;
    if (!oiId) {
      const oi = db.query(
        "SELECT id FROM order_items WHERE order_id = ? AND product_id = ? LIMIT 1"
      ).get(orderId, productId);
      oiId = oi ? oi.id : null;
    }

    if (oiId) {
      // Update scanned_quantity for fulfillment visibility
      incrementOrderItemScanned(db, oiId, quantity);

      // Get product barcode for scan record
      const product = db.query("SELECT sku, barcode FROM products WHERE id = ?").get(productId);
      createOrderScan(db, {
        orderId,
        orderItemId: oiId,
        productId,
        barcode: (product && product.barcode) || (product && product.sku) || `sku-${productId}`,
        userId,
        businessId,
      });
    }

    // Update order status to 'picking' on first pick action
    const order = db.query("SELECT status FROM orders WHERE id = ?").get(orderId);
    if (order && order.status === 'pending') {
      db.run("UPDATE orders SET status = 'picking' WHERE id = ?", [orderId]);
    }

    return { orderId, binId, productId, quantity, orderItemId: oiId };
  });
}

/** Cycle count adjustment. */
export function cycleCount(db, { binId, productId, variantId, actualQuantity, businessId, userId }) {
  return transaction(db, () => {
    const existing = db.query(
      "SELECT id, quantity FROM bin_contents WHERE bin_id = ? AND product_id = ? AND COALESCE(variant_id,0) = COALESCE(?,0) AND business_id = ?"
    ).get(binId, productId, variantId || 0, businessId);

    const previousQty = existing ? existing.quantity : 0;
    const difference = actualQuantity - previousQty;

    if (difference === 0) {
      return { adjusted: false, binId, productId, actualQuantity, previousQty, difference: 0 };
    }

    if (actualQuantity <= 0) {
      if (existing) db.run("DELETE FROM bin_contents WHERE id = ?", [existing.id]);
    } else {
      if (existing) {
        db.run("UPDATE bin_contents SET quantity = ?, last_moved_at = datetime('now') WHERE id = ?",
          [actualQuantity, existing.id]);
      } else {
        db.run(
          "INSERT INTO bin_contents (business_id, bin_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?, ?)",
          [businessId, binId, productId, variantId || null, actualQuantity]
        );
      }
    }

    db.run(
      `INSERT INTO warehouse_transfers (business_id, from_bin_id, to_bin_id, product_id, variant_id, quantity, transfer_type, notes, created_by)
       VALUES (?, NULL, ?, ?, ?, ?, 'cycle_count_adjustment', ?, ?)`,
      [businessId, binId, productId, variantId || null, Math.abs(difference),
       `Cycle count: was ${previousQty}, now ${actualQuantity} (diff: ${difference >= 0 ? '+' : ''}${difference})`,
       userId || null]
    );

    db.run("UPDATE products SET stock_count = MAX(0, stock_count + ?), updated_at = datetime('now') WHERE id = ?",
      [difference, productId]);

    if (variantId) {
      db.run("UPDATE product_variants SET stock_count = MAX(0, stock_count + ?), updated_at = datetime('now') WHERE id = ?",
        [difference, variantId]);
    }

    return { adjusted: true, binId, productId, actualQuantity, previousQty, difference };
  });
}

/** Get pick list for an order — returns which bins have the needed products. */
export function getPickList(db, orderId, businessId) {
  const items = db.query(`
    SELECT oi.id AS order_item_id, oi.product_id, oi.variant_id, oi.sku, oi.variant_title,
           oi.quantity AS ordered_qty, oi.scanned_quantity,
           p.name AS product_name, p.stock_count
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ? AND oi.business_id = ?
  `).all(orderId, businessId);

  const result = items.map(item => {
    const remaining = item.ordered_qty - (item.scanned_quantity || 0);
    if (remaining <= 0) {
      return { ...item, remaining: 0, bins: [], pickable: true };
    }

    const bins = db.query(`
      SELECT bc.bin_id, wb.name AS bin_name, wb.zone, bc.quantity AS available
      FROM bin_contents bc
      JOIN warehouse_bins wb ON bc.bin_id = wb.id
      WHERE bc.product_id = ? AND bc.business_id = ? AND bc.quantity > 0
      ORDER BY wb.zone, wb.name
    `).all(item.product_id, businessId);

    const totalAvailable = bins.reduce((sum, b) => sum + b.available, 0);

    return {
      ...item,
      remaining,
      bins: bins.map(b => ({
        ...b,
        pick_quantity: Math.min(b.available, remaining),
      })),
      pickable: totalAvailable >= remaining,
    };
  });

  return result;
}

/** Get bin stock summary — all bins with totals. */
export function getBinStockSummary(db, businessId) {
  return db.query(`
    SELECT wb.id, wb.name, wb.zone,
           COUNT(bc.id) AS unique_products,
           COALESCE(SUM(bc.quantity), 0) AS total_quantity
    FROM warehouse_bins wb
    LEFT JOIN bin_contents bc ON bc.bin_id = wb.id
    WHERE wb.business_id = ?
    GROUP BY wb.id
    ORDER BY wb.zone, wb.name
  `).all(businessId);
}

/** Ship an order — mark as shipped. */
export function shipOrder(db, { orderId, businessId, userId }) {
  return transaction(db, () => {
    const order = db.query(
      "SELECT id, status FROM orders WHERE id = ? AND business_id = ?"
    ).get(orderId, businessId);

    if (!order) throw new Error("Order not found");
    if (order.status === "shipped") throw new Error("Order is already shipped");

    db.run("UPDATE orders SET status = 'shipped' WHERE id = ?", [orderId]);

    const shipBin = db.query("SELECT id FROM warehouse_bins WHERE zone = 'Shipping' AND business_id = ? LIMIT 1").get(businessId);

    db.run(
      `INSERT INTO warehouse_transfers (business_id, from_bin_id, to_bin_id, product_id, variant_id, quantity, transfer_type, reference_type, reference_id, notes, created_by)
       VALUES (?, NULL, ?, NULL, NULL, 0, 'ship', 'order', ?, 'Order shipped', ?)`,
      [businessId, shipBin ? shipBin.id : null, orderId, userId || null]
    );

    return { orderId, status: 'shipped' };
  });
}

/** Get transfer history with optional filters. */
export function getTransfers(db, businessId, filters = {}) {
  let sql = `
    SELECT wt.id, wt.from_bin_id, wt.to_bin_id, wt.product_id, wt.variant_id,
           wt.quantity, wt.transfer_type, wt.reference_type, wt.reference_id,
           wt.notes, wt.created_by, wt.created_at,
           fb.name AS from_bin_name, tb.name AS to_bin_name,
           p.name AS product_name, p.sku,
           u.display_name AS user_name
    FROM warehouse_transfers wt
    LEFT JOIN warehouse_bins fb ON wt.from_bin_id = fb.id
    LEFT JOIN warehouse_bins tb ON wt.to_bin_id = tb.id
    LEFT JOIN products p ON wt.product_id = p.id
    LEFT JOIN users u ON wt.created_by = u.id
    WHERE wt.business_id = ?
  `;
  const params = [businessId];

  if (filters.type) {
    sql += " AND wt.transfer_type = ?";
    params.push(filters.type);
  }
  if (filters.productId) {
    sql += " AND wt.product_id = ?";
    params.push(filters.productId);
  }

  sql += " ORDER BY wt.created_at DESC LIMIT ?";
  params.push(filters.limit || 100);

  return db.query(sql).all(...params);
}
