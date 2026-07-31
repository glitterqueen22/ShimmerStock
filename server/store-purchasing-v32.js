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
