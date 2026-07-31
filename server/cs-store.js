/**
 * ShimmerStock Customer Service Data Access Layer
 * =================================================
 * All CS database access goes through this module.
 */

// ═══════════════════════════════════════════════════════════════════════
// RETURNS & REFUNDS
// ═══════════════════════════════════════════════════════════════════════

export function createReturnRefund(db, {
  businessId, orderId, orderItemId, type, amount, reason, notes,
}) {
  const result = db.run(
    `INSERT INTO returns_refunds (business_id, order_id, order_item_id, type, amount, reason, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [businessId, orderId, orderItemId || null, type, amount || null, reason || null, notes || null]
  );
  return result.lastInsertRowid;
}

export function getReturnsRefunds(db, businessId, filters = {}) {
  const conditions = ["rr.business_id = ?"];
  const params = [businessId];

  if (filters.status) {
    conditions.push("rr.status = ?");
    params.push(filters.status);
  }
  if (filters.type) {
    conditions.push("rr.type = ?");
    params.push(filters.type);
  }
  if (filters.orderId) {
    conditions.push("rr.order_id = ?");
    params.push(filters.orderId);
  }

  const where = conditions.join(" AND ");
  return db
    .query(
      `SELECT rr.*, o.order_number, o.customer_name, o.customer_email, o.source
       FROM returns_refunds rr
       JOIN orders o ON rr.order_id = o.id
       WHERE ${where}
       ORDER BY rr.created_at DESC
       LIMIT ?`
    )
    .all(...params, filters.limit || 100);
}

export function getReturnRefund(db, id, businessId) {
  return db
    .query(
      `SELECT rr.*, o.order_number, o.customer_name, o.customer_email, o.source
       FROM returns_refunds rr
       JOIN orders o ON rr.order_id = o.id
       WHERE rr.id = ? AND rr.business_id = ?`
    )
    .get(id, businessId);
}

export function approveReturnRefund(db, { id, approvedBy, businessId }) {
  const result = db.run(
    `UPDATE returns_refunds SET status = 'approved', approved_by = ?, updated_at = datetime('now')
     WHERE id = ? AND business_id = ? AND status = 'pending'`,
    [approvedBy, id, businessId]
  );
  return result.changes > 0;
}

export function processReturnRefund(db, {
  id, processedBy, businessId, replacementOrderId, storeCreditCode,
}) {
  const fields = [];
  const params = [];

  fields.push("status = 'processed'");
  fields.push("processed_by = ?");
  params.push(processedBy);

  if (replacementOrderId) {
    fields.push("replacement_order_id = ?");
    params.push(replacementOrderId);
  }
  if (storeCreditCode) {
    fields.push("store_credit_code = ?");
    params.push(storeCreditCode);
  }

  fields.push("updated_at = datetime('now')");
  params.push(id);
  params.push(businessId);

  const result = db.run(
    `UPDATE returns_refunds SET ${fields.join(", ")}
     WHERE id = ? AND business_id = ? AND status = 'approved'`,
    ...params
  );
  return result.changes > 0;
}

export function rejectReturnRefund(db, { id, approvedBy, businessId, reason }) {
  const result = db.run(
    `UPDATE returns_refunds SET status = 'rejected', approved_by = ?, notes = COALESCE(notes || '; ', '') || ?, updated_at = datetime('now')
     WHERE id = ? AND business_id = ? AND status = 'pending'`,
    [approvedBy, reason || '', id, businessId]
  );
  return result.changes > 0;
}

// ═══════════════════════════════════════════════════════════════════════
// CUSTOMER NOTES
// ═══════════════════════════════════════════════════════════════════════

export function addCustomerNote(db, {
  customerEmail, orderId, note, noteType, createdBy, businessId,
}) {
  const result = db.run(
    `INSERT INTO customer_notes (business_id, customer_email, order_id, note, note_type, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [businessId, customerEmail, orderId || null, note, noteType || 'general', createdBy || null]
  );
  return result.lastInsertRowid;
}

export function getCustomerNotes(db, { customerEmail, orderId, businessId }) {
  const conditions = ["cn.business_id = ?"];
  const params = [businessId];

  if (customerEmail) {
    conditions.push("cn.customer_email = ?");
    params.push(customerEmail);
  }
  if (orderId) {
    conditions.push("cn.order_id = ?");
    params.push(orderId);
  }

  const where = conditions.join(" AND ");
  return db
    .query(
      `SELECT cn.*, u.display_name as created_by_name
       FROM customer_notes cn
       LEFT JOIN users u ON cn.created_by = u.id
       WHERE ${where}
       ORDER BY cn.created_at DESC`
    )
    .all(...params);
}

// ═══════════════════════════════════════════════════════════════════════
// CUSTOMER HISTORY
// ═══════════════════════════════════════════════════════════════════════

export function getCustomerHistory(db, customerEmail, businessId) {
  // All orders for this customer
  const orders = db
    .query(
      `SELECT o.id, o.order_number, o.customer_name, o.customer_email, o.source,
              o.status, o.cs_status, o.total_amount, o.created_at,
              COUNT(oi.id) as item_count,
              SUM(oi.quantity) as total_qty
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_email = ? AND o.business_id = ?
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    )
    .all(customerEmail, businessId);

  // All notes
  const notes = db
    .query(
      `SELECT cn.*, u.display_name as created_by_name
       FROM customer_notes cn
       LEFT JOIN users u ON cn.created_by = u.id
       WHERE cn.customer_email = ? AND cn.business_id = ?
       ORDER BY cn.created_at DESC`
    )
    .all(customerEmail, businessId);

  // All returns/refunds
  const returns = db
    .query(
      `SELECT rr.*, o.order_number
       FROM returns_refunds rr
       JOIN orders o ON rr.order_id = o.id
       WHERE o.customer_email = ? AND rr.business_id = ?
       ORDER BY rr.created_at DESC`
    )
    .all(customerEmail, businessId);

  // Lifetime value
  const ltv = db
    .query(
      `SELECT COALESCE(SUM(o.total_amount), 0) as lifetime_value,
              COUNT(*) as order_count
       FROM orders o
       WHERE o.customer_email = ? AND o.business_id = ?`
    )
    .get(customerEmail, businessId);

  return { customerEmail, orders, notes, returns, ...ltv };
}

// ═══════════════════════════════════════════════════════════════════════
// ORDER TIMELINE
// ═══════════════════════════════════════════════════════════════════════

export function getOrderTimeline(db, orderId, businessId) {
  const order = db
    .query(
      `SELECT o.id, o.order_number, o.customer_name, o.customer_email, o.source,
              o.status, o.cs_status, o.total_amount, o.packed_at,
              o.created_at, o.imported_at
       FROM orders o
       WHERE o.id = ? AND o.business_id = ?`
    )
    .get(orderId, businessId);

  if (!order) return null;

  const events = [];

  // 1. Order created
  events.push({
    id: `order-created-${order.id}`,
    timestamp: order.created_at,
    engine: 'commerce',
    action: 'order_created',
    label: 'Order Created',
    details: `Order #${order.order_number} created via ${order.source}`,
  });

  // 2. Order imported (if Shopify)
  if (order.imported_at) {
    events.push({
      id: `order-imported-${order.id}`,
      timestamp: order.imported_at,
      engine: 'commerce',
      action: 'order_imported',
      label: 'Order Imported from Shopify',
      details: `Order #${order.order_number} imported`,
    });
  }

  // 3. Production batches related to order items (if any)
  const orderSkus = db
    .query("SELECT DISTINCT sku FROM order_items WHERE order_id = ?")
    .all(orderId)
    .map(r => r.sku);

  if (orderSkus.length > 0) {
    const placeholders = orderSkus.map(() => "?").join(",");
    const productionEvents = db
      .query(
        `SELECT DISTINCT pb.id as batch_id, pb.status, pb.started_at, pb.completed_at,
                b.name as bom_name, pb.created_at
         FROM production_batches pb
         JOIN boms b ON pb.bom_id = b.id
         JOIN bom_items bi ON bi.bom_id = b.id
         JOIN products p ON bi.input_product_id = p.id
         WHERE p.sku IN (${placeholders}) AND pb.business_id = ?
         ORDER BY pb.created_at`
      )
      .all(...orderSkus, businessId);

    for (const pe of productionEvents) {
      if (pe.status === 'completed' && pe.completed_at) {
        events.push({
          id: `production-${pe.batch_id}`,
          timestamp: pe.completed_at,
          engine: 'production',
          action: 'batch_completed',
          label: `Production: ${pe.bom_name}`,
          details: `Batch #${pe.batch_id} completed`,
        });
      } else if (pe.status !== 'draft') {
        events.push({
          id: `production-${pe.batch_id}`,
          timestamp: pe.started_at || pe.created_at,
          engine: 'production',
          action: 'batch_started',
          label: `Production: ${pe.bom_name}`,
          details: `Batch #${pe.batch_id} started (${pe.status})`,
        });
      }
    }
  }

  // 4. Packed (if packed_at is set)
  if (order.packed_at) {
    events.push({
      id: `packed-${order.id}`,
      timestamp: order.packed_at,
      engine: 'fulfillment',
      action: 'order_packed',
      label: 'Order Packed',
      details: 'Order was packed and proof recorded',
    });
  }

  // 5. Scan/verification events
  const scans = db
    .query(
      `SELECT os.created_at, oi.sku, oi.variant_title,
              u.display_name as scanned_by_name
       FROM order_scans os
       JOIN order_items oi ON os.order_item_id = oi.id
       LEFT JOIN users u ON os.user_id = u.id
       WHERE os.order_id = ?
       ORDER BY os.created_at`
    )
    .all(orderId);

  for (const scan of scans) {
    events.push({
      id: `scan-${scan.created_at}`,
      timestamp: scan.created_at,
      engine: 'commerce',
      action: 'order_verified',
      label: `Item Verified: ${scan.sku}`,
      details: `${scan.sku}${scan.variant_title ? ` (${scan.variant_title})` : ''} scanned by ${scan.scanned_by_name || 'unknown'}`,
    });
  }

  // 6. Order status changes from audit log
  const auditEvents = db
    .query(
      `SELECT al.created_at, al.action_type, al.new_value, al.previous_value, u.display_name
       FROM audit_log al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.entity_type = 'order' AND al.entity_id = ? AND al.business_id = ?
       ORDER BY al.created_at`
    )
    .all(orderId, businessId);

  for (const ae of auditEvents) {
    let label = '';
    let engine = 'commerce';
    if (ae.action_type === 'order.cancelled') {
      label = 'Order Cancelled';
      engine = 'commerce';
    } else if (ae.action_type === 'order.reset') {
      label = 'Order Reset';
      engine = 'commerce';
    } else if (ae.action_type === 'order.updated') {
      label = 'Order Updated';
      engine = 'commerce';
    } else if (ae.action_type === 'order.imported' || ae.action_type === 'order.imported_readonly') {
      continue; // already covered above
    } else if (ae.action_type === 'order.created') {
      continue; // already covered above
    } else {
      label = ae.action_type;
    }

    // Avoid duplicate events with same timestamp + label
    const dup = events.some(e => e.timestamp === ae.created_at && e.label === label);
    if (!dup) {
      events.push({
        id: `audit-${ae.created_at}-${ae.action_type}`,
        timestamp: ae.created_at,
        engine,
        action: ae.action_type,
        label,
        details: ae.display_name ? `by ${ae.display_name}` : '',
      });
    }
  }

  // 7. CS events (returns/refunds)
  const csEvents = db
    .query(
      `SELECT rr.id, rr.type, rr.status, rr.amount, rr.reason, rr.created_at, rr.updated_at,
              rr.notes, u.display_name as processed_by_name
       FROM returns_refunds rr
       LEFT JOIN users u ON rr.processed_by = u.id
       WHERE rr.order_id = ? AND rr.business_id = ?
       ORDER BY rr.created_at`
    )
    .all(orderId, businessId);

  for (const cs of csEvents) {
    events.push({
      id: `cs-${cs.id}`,
      timestamp: cs.created_at,
      engine: 'customer_service',
      action: 'return_created',
      label: `${cs.type.charAt(0).toUpperCase() + cs.type.slice(1)} Request`,
      details: `${cs.type.replace('_', ' ')} — ${cs.status}${cs.amount ? ` ($${cs.amount.toFixed(2)})` : ''}${cs.reason ? ` — ${cs.reason}` : ''}`,
    });

    if (cs.status !== 'pending' && cs.updated_at && cs.updated_at !== cs.created_at) {
      events.push({
        id: `cs-status-${cs.id}`,
        timestamp: cs.updated_at,
        engine: 'customer_service',
        action: `return_${cs.status}`,
        label: `${cs.type.charAt(0).toUpperCase() + cs.type.slice(1)} ${cs.status.charAt(0).toUpperCase() + cs.status.slice(1)}`,
        details: cs.processed_by_name ? `Processed by ${cs.processed_by_name}` : '',
      });
    }
  }

  // 8. Customer notes on this order
  const orderNotes = db
    .query(
      `SELECT cn.id, cn.note, cn.note_type, cn.created_at, u.display_name as created_by_name
       FROM customer_notes cn
       LEFT JOIN users u ON cn.created_by = u.id
       WHERE cn.order_id = ? AND cn.business_id = ?
       ORDER BY cn.created_at`
    )
    .all(orderId, businessId);

  for (const note of orderNotes) {
    events.push({
      id: `note-${note.id}`,
      timestamp: note.created_at,
      engine: 'customer_service',
      action: 'customer_note',
      label: `${note.note_type.charAt(0).toUpperCase() + note.note_type.slice(1)} Note`,
      details: `${note.note}${note.created_by_name ? ` — ${note.created_by_name}` : ''}`,
    });
  }

  // Sort all events chronologically
  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return { order, events };
}

// ═══════════════════════════════════════════════════════════════════════
// PACKING PROOF
// ═══════════════════════════════════════════════════════════════════════

export function addPackingProof(db, {
  orderId, proofType, data, createdBy, businessId,
}) {
  const result = db.run(
    `INSERT INTO packing_proof (business_id, order_id, proof_type, data, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [businessId, orderId, proofType || 'photo', JSON.stringify(data || {}), createdBy || null]
  );

  // Also update the order's packed_at / packed_by
  db.run(
    "UPDATE orders SET packed_at = datetime('now'), packed_by = ? WHERE id = ? AND business_id = ?",
    [createdBy, orderId, businessId]
  );

  return result.lastInsertRowid;
}

export function getPackingProof(db, orderId, businessId) {
  return db
    .query(
      `SELECT pp.*, u.display_name as created_by_name
       FROM packing_proof pp
       LEFT JOIN users u ON pp.created_by = u.id
       WHERE pp.order_id = ? AND pp.business_id = ?
       ORDER BY pp.created_at DESC`
    )
    .all(orderId, businessId);
}

// ═══════════════════════════════════════════════════════════════════════
// REPLACEMENT ORDER
// ═══════════════════════════════════════════════════════════════════════

export function createReplacementOrder(db, {
  originalOrderId, items, businessId, userId,
}) {
  // Get next order number
  const row = db
    .query("SELECT COALESCE(MAX(order_number), 999) + 1 AS next_num FROM orders WHERE business_id = ? AND order_number >= 1000")
    .get(businessId);
  const orderNumber = row.next_num;

  // Get original order for customer info
  const originalOrder = db
    .query("SELECT customer_name, customer_email, shipping_address FROM orders WHERE id = ? AND business_id = ?")
    .get(originalOrderId, businessId);

  const result = db.run(
    `INSERT INTO orders (shopify_order_id, order_number, customer_name, customer_email, shipping_address, source, status, notes, total_amount, created_by, business_id, cs_status)
     VALUES (NULL, ?, ?, ?, ?, 'replacement', 'pending', ?, 0, ?, ?, 'none')`,
    [
      orderNumber,
      originalOrder?.customer_name || 'Customer',
      originalOrder?.customer_email || null,
      originalOrder?.shipping_address || null,
      `Replacement for order #${originalOrderId}`,
      userId,
      businessId,
    ]
  );
  const newOrderId = result.lastInsertRowid;

  let computedTotal = 0;
  for (const item of items) {
    const qty = parseInt(item.quantity) || 1;
    const price = parseFloat(item.unitPrice) || 0;
    const lineTotal = price * qty;
    computedTotal += lineTotal;

    db.run(
      `INSERT INTO order_items (order_id, product_id, variant_id, sku, variant_title, quantity, unit_price, line_total, business_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newOrderId, item.productId || null, item.variantId || null, item.sku || 'UNKNOWN', item.variantTitle || null, qty, price, lineTotal, businessId]
    );
  }

  // Update total
  if (computedTotal > 0) {
    db.run("UPDATE orders SET total_amount = ? WHERE id = ?", [computedTotal, newOrderId]);
  }

  // Link replacement to original return
  db.run(
    "UPDATE returns_refunds SET replacement_order_id = ?, updated_at = datetime('now') WHERE order_id = ? AND business_id = ? AND type = 'replacement' AND replacement_order_id IS NULL",
    [newOrderId, originalOrderId, businessId]
  );

  return { orderId: newOrderId, orderNumber, items: items.length, total: computedTotal };
}

// ═══════════════════════════════════════════════════════════════════════
// INVENTORY RESTOCKING FROM RETURNS
// ═══════════════════════════════════════════════════════════════════════

export function restockReturnedItems(db, { returnId, orderId, orderItemId, businessId }) {
  let items;

  if (orderItemId) {
    // Fetch that specific order_item
    items = db
      .query(
        `SELECT oi.id, oi.product_id, oi.variant_id, oi.quantity
         FROM order_items oi
         WHERE oi.id = ? AND oi.order_id = ? AND oi.business_id = ?`
      )
      .all(orderItemId, orderId, businessId);
  } else {
    // Fetch ALL order_items for the order
    items = db
      .query(
        `SELECT oi.id, oi.product_id, oi.variant_id, oi.quantity
         FROM order_items oi
         WHERE oi.order_id = ? AND oi.business_id = ?`
      )
      .all(orderId, businessId);
  }

  let totalRestocked = 0;

  for (const item of items) {
    const qty = item.quantity;

    // Increment variant stock if variant_id is set
    if (item.variant_id) {
      db.run(
        `UPDATE product_variants
         SET stock_count = stock_count + ?, updated_at = datetime('now')
         WHERE id = ? AND business_id = ?`,
        [qty, item.variant_id, businessId]
      );
    }

    // Increment product stock if product_id is set
    if (item.product_id) {
      db.run(
        `UPDATE products
         SET stock_count = stock_count + ?, updated_at = datetime('now')
         WHERE id = ? AND business_id = ?`,
        [qty, item.product_id, businessId]
      );
    }

    // Insert inventory_movements row
    db.run(
      `INSERT INTO inventory_movements (product_id, variant_id, type, quantity, reference_type, reference_id, created_at)
       VALUES (?, ?, 'in', ?, 'return', ?, datetime('now'))`,
      [item.product_id || null, item.variant_id || null, qty, returnId]
    );

    totalRestocked += qty;
  }

  // Mark return as restocked
  db.run(
    `UPDATE returns_refunds
     SET restocked_at = datetime('now'), restocked_quantity = ?
     WHERE id = ? AND business_id = ?`,
    [totalRestocked, returnId, businessId]
  );

  return totalRestocked;
}
