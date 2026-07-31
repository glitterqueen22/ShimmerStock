/**
 * Business Bestie — Intelligence Layer API
 * =========================================
 * Sits above all engines, consumes their structured summaries,
 * and answers four questions:
 * 1. What happened?
 * 2. What needs attention?
 * 3. What should I do?
 * 4. Why?
 *
 * Every recommendation cites its source data.
 * Engines generate facts — Bestie generates understanding.
 */

import * as store from "./store.js";
import { detectOpportunities } from "./opportunities.js";
import { getHealthScore } from "./health.js";
import { requireAuth } from "./auth.js";

// ── Personality formatters ──────────────────────────────────────────

const PERSONALITIES = {
  executive: {
    name: "executive",
    greeting: (name, hour) => {
      const timeWord = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
      return `Good ${timeWord}, ${name}.`;
    },
    toneText: (text) => text,
    briefPrefix: "",
  },
  coach: {
    name: "coach",
    greeting: (name, hour) => {
      const timeWord = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
      const encouragements = [
        "Let's make today count!",
        "You've got this!",
        "Ready to build something great?",
        "Another day to grow your business.",
        "Great things are built one day at a time.",
      ];
      const enc = encouragements[Math.floor(Math.random() * encouragements.length)];
      return `Good ${timeWord}, ${name}! ☀️ ${enc}`;
    },
    toneText: (text) => text,
    briefPrefix: "",
  },
  hype_girl: {
    name: "hype_girl",
    greeting: (name, hour) => {
      const timeWord = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
      const hypes = [
        "OMG you're going to CRUSH it today! 🔥",
        "Rise and grind, superstar! ⚡",
        "The BEST day ever starts NOW! 💫",
        "Your empire isn't going to build itself! 👑",
      ];
      const hype = hypes[Math.floor(Math.random() * hypes.length)];
      return `Good ${timeWord}, ${name}!!! ✨ ${hype}`;
    },
    toneText: (text) => text,
    briefPrefix: "",
  },
  analyst: {
    name: "analyst",
    greeting: (name, hour) => {
      const timeWord = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
      return `Good ${timeWord}, ${name}. Here's your data briefing for ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`;
    },
    toneText: (text) => text,
    briefPrefix: "",
  },
  ops_manager: {
    name: "ops_manager",
    greeting: (name, hour) => {
      const timeWord = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
      return `Good ${timeWord}, ${name}. Here's what's on deck today.`;
    },
    toneText: (text) => text,
    briefPrefix: "",
  },
};

// ── Helper: personality-specific text generation ────────────────────

function generateBriefTexts(data, personality) {
  const persona = PERSONALITIES[personality] || PERSONALITIES.coach;

  // What Happened texts
  const whatHappened = [];
  // Today's stats
  if (data.todayStats.orders > 0) {
    whatHappened.push({
      engine: "commerce",
      icon: "📋",
      text: persona_text(personality, "orders", data.todayStats.orders),
    });
  }
  if (data.todayStats.production > 0) {
    whatHappened.push({
      engine: "production",
      icon: "🏭",
      text: persona_text(personality, "production", data.todayStats.production),
    });
  }
  if (data.todayStats.scans > 0) {
    whatHappened.push({
      engine: "inventory",
      icon: "📷",
      text: persona_text(personality, "scans", data.todayStats.scans),
    });
  }
  if (data.todayStats.purchases > 0) {
    whatHappened.push({
      engine: "purchasing",
      icon: "📦",
      text: persona_text(personality, "purchases", data.todayStats.purchases),
    });
  }

  // Recent notable activity
  for (const event of (data.recentActivity || []).slice(0, 5)) {
    const icon = getEngineIcon(event.engine);
    whatHappened.push({
      engine: event.engine,
      icon,
      text: event.description,
    });
  }

  // If nothing happened
  if (whatHappened.length === 0) {
    whatHappened.push({
      engine: "system",
      icon: "✨",
      text: persona_text(personality, "quiet_day"),
    });
  }

  // Needs Attention texts
  const needsAttention = [];

  // Low stock / reorder urgency
  for (const rec of (data.reorderRecommendations || [])) {
    if (rec.urgency === "now") {
      const urgency = rec.current_stock <= 0 ? "critical" : "high";
      needsAttention.push({
        engine: "inventory",
        icon: "⚠️",
        text: persona_text(personality, "low_stock_urgent", rec),
        urgency,
      });
    } else if (rec.urgency === "soon") {
      needsAttention.push({
        engine: "inventory",
        icon: "📉",
        text: persona_text(personality, "low_stock_soon", rec),
        urgency: "medium",
      });
    }
  }

  // Overdue POs
  for (const po of (data.overduePOs || [])) {
    needsAttention.push({
      engine: "purchasing",
      icon: "📦",
      text: persona_text(personality, "overdue_po", po),
      urgency: "high",
    });
  }

  // Unfulfilled orders
  for (const order of (data.unfulfilledOrders || []).slice(0, 3)) {
    needsAttention.push({
      engine: "commerce",
      icon: "📋",
      text: persona_text(personality, "unfulfilled", order),
      urgency: "medium",
    });
  }

  // Pending batches
  for (const batch of (data.pendingBatches || []).slice(0, 2)) {
    needsAttention.push({
      engine: "production",
      icon: "🏭",
      text: persona_text(personality, "pending_batch", batch),
      urgency: "low",
    });
  }

  // What To Do texts
  const whatToDo = [];

  // Urgent reorders first
  const urgentRecs = (data.reorderRecommendations || []).filter(r => r.urgency === "now").slice(0, 3);
  for (const rec of urgentRecs) {
    const supplierParam = rec.supplier_id ? `&supplier=${rec.supplier_id}` : "";
    whatToDo.push({
      engine: "purchasing",
      icon: "📦",
      text: persona_text(personality, "action_reorder", rec),
      action: `/purchasing?create=po${supplierParam}`,
    });
  }

  // Pending batches to run
  for (const batch of (data.pendingBatches || []).slice(0, 2)) {
    whatToDo.push({
      engine: "production",
      icon: "🏭",
      text: persona_text(personality, "action_batch", batch),
      action: "/production",
    });
  }

  // Unfulfilled orders
  for (const order of (data.unfulfilledOrders || []).slice(0, 2)) {
    whatToDo.push({
      engine: "commerce",
      icon: "📋",
      text: persona_text(personality, "action_fulfill", order),
      action: "/orders",
    });
  }

  // Celebrations
  const celebrations = [];
  const totalActivity = (data.todayStats?.orders || 0) + (data.todayStats?.production || 0) + (data.todayStats?.purchases || 0) + (data.todayStats?.scans || 0);
  
  // Milestone: any activity today
  if (totalActivity > 0) {
    celebrations.push({
      text: persona_text(personality, "celebration_default"),
      milestone: false,
    });
  }
  
  // Milestone: substantial order volume
  if (data.todayStats?.orders >= 3) {
    celebrations.push({
      text: persona_text(personality, "celebration_orders", data.todayStats.orders),
      milestone: true,
    });
  }
  
  // Milestone: production running
  if (data.todayStats?.production > 0) {
    celebrations.push({
      text: persona_text(personality, "celebration_production"),
      milestone: false,
    });
  }
  
  // Milestone: high completion rate
  const completedOrders = (data.unfulfilledOrders || []).length === 0 && data.todayStats?.orders > 0;
  if (completedOrders) {
    celebrations.push({
      text: persona_text(personality, "celebration_all_fulfilled"),
      milestone: true,
    });
  }
  
  // If all BOMs have batches
  if ((data.pendingBatches || []).length === 0 && data.bomCount > 0) {
    celebrations.push({
      text: persona_text(personality, "celebration_caughtup"),
      milestone: false,
    });
  }

  return { whatHappened, needsAttention, whatToDo, celebrations };
}

function persona_text(personality, key, data) {
  const texts = {
    executive: {
      orders: (n) => `${n} order(s) today.`,
      production: (n) => `${n} production batch(es).`,
      scans: (n) => `${n} scan(s).`,
      purchases: (n) => `${n} PO(s).`,
      quiet_day: "No activity yet today.",
      low_stock_urgent: (r) => `${r.product_name}: ${r.current_stock} units — reorder now.`,
      low_stock_soon: (r) => `${r.product_name}: ${r.current_stock} units — reorder soon.`,
      overdue_po: (p) => `PO #${p.id} with ${p.supplier_name} is overdue.`,
      unfulfilled: (o) => `Order #${o.order_number || o.id}: ${o.item_count} items pending.`,
      pending_batch: (b) => `Batch "${b.bom_name}" ready to run.`,
      action_reorder: (r) => `Reorder ${r.product_name} (${r.reorder_qty} ${r.unit_type || "units"}${r.supplier_name ? ` from ${r.supplier_name}` : ""}).`,
      action_batch: (b) => `Run "${b.bom_name}" batch (${b.output_quantity} ${b.output_unit || "units"}).`,
      action_fulfill: (o) => `Fulfill Order #${o.order_number || o.id}.`,
      celebration_default: "Business is running.",
      celebration_orders: (n) => `${n} orders today — solid demand.`,
      celebration_production: "Production is active.",
      celebration_all_fulfilled: "All orders fulfilled — clean slate.",
      celebration_caughtup: "All BOMs have batches — production pipeline is full.",
    },
    coach: {
      orders: (n) => `${n} order(s) came in today — great momentum!`,
      production: (n) => `${n} production batch(es) running — you're building!`,
      scans: (n) => `${n} scan(s) logged — staying on top of inventory.`,
      purchases: (n) => `${n} PO(s) created — keeping the supply chain moving.`,
      quiet_day: "Fresh start — let's set the tone today!",
      low_stock_urgent: (r) => `${r.product_name} is at ${r.current_stock} units — let's get that reorder in!`,
      low_stock_soon: (r) => `${r.product_name} is getting low (${r.current_stock} units) — time to plan a reorder.`,
      overdue_po: (p) => `PO #${p.id} with ${p.supplier_name} is overdue — worth a follow-up.`,
      unfulfilled: (o) => `Order #${o.order_number || o.id} needs fulfillment — ${o.customer_name || "Customer"} is waiting!`,
      pending_batch: (b) => `Batch "${b.bom_name}" is ready — let's make some product!`,
      action_reorder: (r) => `Place PO for ${r.reorder_qty} ${r.unit_type || "units"} of ${r.product_name}${r.supplier_name ? ` with ${r.supplier_name}` : ""}${r.unit_cost ? ` ($${r.unit_cost}/unit)` : ""}.`,
      action_batch: (b) => `Run production batch "${b.bom_name}" — produces ${b.output_quantity} ${b.output_unit || "units"}.`,
      action_fulfill: (o) => `${o.item_count} item(s) in Order #${o.order_number || o.id} need fulfillment.`,
      celebration_default: "🎉 You're building something special — keep going!",
      celebration_orders: (n) => n > 0 ? `🎉 ${n} orders today — your customers love what you make!` : "",
      celebration_production: "🏭 Production humming — great work keeping things moving!",
      celebration_all_fulfilled: "🏆 All caught up on orders — that's a win!",
      celebration_caughtup: "📋 Every BOM is queued — you're on top of production!",
    },
    hype_girl: {
      orders: (n) => n > 0 ? `OMG ${n} new orders!!! 🔥 Let's GO!` : "Orders coming soon, I can FEEL it! 💫",
      production: (n) => n > 0 ? `${n} batches in production — you're a MACHINE! ⚡` : "Production floor is ready to ROCK! 🏭",
      scans: (n) => n > 0 ? `${n} scans — inventory on POINT! 📷✨` : "Fresh day, fresh scans! 📷",
      purchases: (n) => n > 0 ? `${n} POs — SUPPLY CHAIN QUEEN! 👑` : "Suppliers are waiting for YOUR call! 📦",
      quiet_day: "Clean slate, infinite possibilities! Let's MAKE MAGIC! ✨",
      low_stock_urgent: (r) => `🚨 ${r.product_name} is at ${r.current_stock}!! REORDER REORDER REORDER!!`,
      low_stock_soon: (r) => `👀 ${r.product_name} getting low (${r.current_stock} left) — stay ahead of it!`,
      overdue_po: (p) => `PO #${p.id} with ${p.supplier_name} is LATE — time to make some calls! 📞`,
      unfulfilled: (o) => `📋 Order #${o.order_number || o.id} for ${o.customer_name || "someone awesome"} — ship it, ship it!`,
      pending_batch: (b) => `🏭 "${b.bom_name}" is ready to GO — let's make stuff!!!`,
      action_reorder: (r) => `🛒 Buy ${r.reorder_qty} ${r.unit_type || "units"} of ${r.product_name}${r.unit_cost ? ` at $${r.unit_cost}/unit` : ""} — PRICES WON'T WAIT!`,
      action_batch: (b) => `🏭 MAKE ${b.output_quantity} ${b.output_unit || "units"} of "${b.bom_name}"!!!`,
      action_fulfill: (o) => `📦 SHIP Order #${o.order_number || o.id} — ${o.customer_name || "customer"} is waiting!!!`,
      celebration_default: "🎉 YOU'RE LITERALLY BUILDING AN EMPIRE!!! 👑✨",
      celebration_orders: (n) => n > 0 ? `🔥 ${n} ORDERS!!! THE PEOPLE WANT WHAT YOU MAKE!!!` : "",
      celebration_production: "🏭 FACTORY MODE: ENGAGED!!! ⚡⚡⚡",
      celebration_all_fulfilled: "🏆 ZERO PENDING ORDERS!!! YOU'RE A SHIPPING LEGEND!!!",
      celebration_caughtup: "📋 ALL BOMS LIVE!!! PRODUCTION BEAST MODE!!!",
    },
    analyst: {
      orders: (n) => `${n} order(s) today. Analyzing sales velocity...`,
      production: (n) => `${n} batch(es) in production. Utilization rate nominal.`,
      scans: (n) => `${n} scan(s) recorded. Audit trail updated.`,
      purchases: (n) => `${n} PO(s) processed. Supply chain metrics updating.`,
      quiet_day: "No activity detected. Baseline established.",
      low_stock_urgent: (r) => `${r.product_name}: ${r.current_stock} units remaining. ${r.days_remaining}d at ${r.daily_velocity}/day velocity. Reorder ${r.reorder_qty} ${r.unit_type || "units"}. Lead time: ${r.lead_time_days}d.`,
      low_stock_soon: (r) => `${r.product_name}: ${r.current_stock} units (${r.days_remaining}d coverage). Monitor.`,
      overdue_po: (p) => `PO #${p.id} (${p.supplier_name}): expected ${p.expected_delivery}. Status: overdue.`,
      unfulfilled: (o) => `Order #${o.order_number || o.id}: ${o.item_count} items, ${o.total_qty} qty, age: pending.`,
      pending_batch: (b) => `Batch "${b.bom_name}": ${b.output_quantity} ${b.output_unit} output, ${b.batch_size}x scale, status: ${b.status}.`,
      action_reorder: (r) => `Reorder ${r.product_name}: ${r.reorder_qty} ${r.unit_type || "units"} at ${r.unit_cost ? `$${r.unit_cost}/unit` : "market rate"} via ${r.supplier_name || "preferred supplier"}. ${r.days_remaining}d coverage remaining.`,
      action_batch: (b) => `Execute batch "${b.bom_name}" (${b.output_quantity} ${b.output_unit} output, ${b.batch_size}x multiplier).`,
      action_fulfill: (o) => `Fulfill Order #${o.order_number || o.id}: ${o.item_count} SKUs, ${o.total_qty} total quantity.`,
      celebration_default: "All systems nominal. Continue monitoring.",
      celebration_orders: (n) => `${n} orders processed. Demand indicators: positive.`,
      celebration_production: "Production pipeline: active. Utilization within parameters.",
      celebration_all_fulfilled: "Order backlog: zero. Queue depth nominal.",
      celebration_caughtup: "BOM coverage: complete. Production scheduling optimal.",
    },
    ops_manager: {
      orders: (n) => `${n} order(s) — on your plate.`,
      production: (n) => `${n} batch(es) — production checklist ready.`,
      scans: (n) => `${n} scan(s) — logged.`,
      purchases: (n) => `${n} PO(s) — tracked.`,
      quiet_day: "Slow start. Here's what you can get ahead on.",
      low_stock_urgent: (r) => `Priority: ${r.product_name} at ${r.current_stock} units. Reorder ${r.reorder_qty} ${r.unit_type || "units"} ASAP.`,
      low_stock_soon: (r) => `Watch: ${r.product_name} at ${r.current_stock} units. Add to reorder list.`,
      overdue_po: (p) => `Action needed: PO #${p.id} with ${p.supplier_name} — follow up today.`,
      unfulfilled: (o) => `Task: Ship Order #${o.order_number || o.id} — ${o.item_count} items to pick.`,
      pending_batch: (b) => `Task: Run "${b.bom_name}" batch — ${b.output_quantity} ${b.output_unit || "units"} output.`,
      action_reorder: (r) => `Task ${r.urgency === "now" ? "#1" : ""}: Place PO for ${r.reorder_qty} ${r.unit_type || "units"} ${r.product_name}${r.supplier_name ? ` with ${r.supplier_name}` : ""}.`,
      action_batch: (b) => `Task: Manufacture "${b.bom_name}" — ${b.output_quantity} ${b.output_unit || "units"}.`,
      action_fulfill: (o) => `Task: Pick & pack Order #${o.order_number || o.id} (${o.item_count} items).`,
      celebration_default: "✅ Keep the operations tight.",
      celebration_orders: (n) => `${n} order(s) today — keep fulfillment moving.`,
      celebration_production: "Production: active. Check quality daily.",
      celebration_all_fulfilled: "✅ All orders shipped. Zero backlog.",
      celebration_caughtup: "✅ All BOMs queued. Production schedule full.",
    },
  };

  const persona_texts = texts[personality] || texts.coach;
  const handler = persona_texts[key];
  if (!handler) return "";
  if (typeof handler === "function") return handler(data);
  // If handler is a string (for atomic keys like quiet_day, celebration_default), return it
  return handler;
}

function getEngineIcon(engineName) {
  const icons = {
    production: "🏭",
    purchasing: "📦",
    orders: "📋",
    commerce: "📋",
    inventory: "📦",
    scan: "📷",
    calculation: "🧮",
    system: "🔧",
  };
  return icons[engineName] || "🔧";
}

// ── Health Score Calculation ────────────────────────────────────────

function calculateHealthScore(data) {
  const breakdown = {
    inventory: 100,
    production: 100,
    purchasing: 100,
    commerce: 100,
  };

  // Inventory health: penalize for low stock
  const urgentReorderCount = (data.reorderRecommendations || []).filter(r => r.urgency === "now").length;
  const soonReorderCount = (data.reorderRecommendations || []).filter(r => r.urgency === "soon").length;
  if (urgentReorderCount > 0) breakdown.inventory = Math.max(10, 100 - urgentReorderCount * 25);
  else if (soonReorderCount > 0) breakdown.inventory = Math.max(30, 100 - soonReorderCount * 15);

  // Production health: penalize for pending batches or empty BOMs
  const pendingBatchCount = (data.pendingBatches || []).length;
  const bomCount = data.bomCount || 0;
  if (bomCount === 0) breakdown.production = 50; // no BOMs = neutral
  else if (pendingBatchCount > 0) breakdown.production = 85; // has work to do
  else breakdown.production = 95; // everything caught up

  // Purchasing health: penalize for overdue POs
  const overduePOCount = (data.overduePOs || []).length;
  if (overduePOCount > 0) breakdown.purchasing = Math.max(20, 100 - overduePOCount * 30);
  else if (urgentReorderCount > 0) breakdown.purchasing = 75; // needs attention
  else breakdown.purchasing = 90;

  // Commerce health: penalize for unfulfilled orders
  const unfulfilledCount = (data.unfulfilledOrders || []).length;
  if (unfulfilledCount > 0) breakdown.commerce = Math.max(30, 100 - unfulfilledCount * 20);
  else breakdown.commerce = 90;

  const score = Math.round(
    (breakdown.inventory + breakdown.production + breakdown.purchasing + breakdown.commerce) / 4
  );

  let label = "Needs Attention";
  if (score >= 90) label = "Excellent";
  else if (score >= 75) label = "Doing Well";
  else if (score >= 50) label = "Fair";
  else label = "Needs Attention";

  return { score, label, breakdown };
}

// ── Daily Planner ───────────────────────────────────────────────────

function buildDailyPlanner(data) {
  const tasks = [];
  let priority = 0;

  // Urgent reorders
  for (const rec of (data.reorderRecommendations || []).filter(r => r.urgency === "now").slice(0, 3)) {
    priority++;
    const supplierParam = rec.supplier_id ? `&supplier=${rec.supplier_id}` : "";
    tasks.push({
      priority,
      engine: "purchasing",
      task: `Reorder ${rec.product_name} — ${rec.reorder_qty} ${rec.unit_type || "units"}`,
      why: rec.current_stock <= 0
        ? "Out of stock"
        : `${rec.days_remaining} days remaining — lead time is ${rec.lead_time_days} days`,
      action: `/purchasing?create=po${supplierParam}`,
    });
  }

  // Unfulfilled orders
  for (const order of (data.unfulfilledOrders || []).slice(0, 3)) {
    priority++;
    tasks.push({
      priority,
      engine: "commerce",
      task: `Ship Order #${order.order_number || order.id} (${order.customer_name || "Customer"})`,
      why: `${order.item_count} item(s) pending`,
      action: "/orders",
    });
  }

  // Pending batches
  for (const batch of (data.pendingBatches || []).slice(0, 2)) {
    priority++;
    tasks.push({
      priority,
      engine: "production",
      task: `Run "${batch.bom_name}" production batch`,
      why: `Produces ${batch.output_quantity} ${batch.output_unit || "units"}`,
      action: "/production",
    });
  }

  // Overdue POs
  for (const po of (data.overduePOs || []).slice(0, 2)) {
    priority++;
    tasks.push({
      priority,
      engine: "purchasing",
      task: `Follow up PO #${po.id} with ${po.supplier_name}`,
      why: `Was expected ${po.expected_delivery}`,
      action: "/purchasing",
    });
  }

  // Soon reorders
  for (const rec of (data.reorderRecommendations || []).filter(r => r.urgency === "soon").slice(0, 2)) {
    priority++;
    tasks.push({
      priority,
      engine: "purchasing",
      task: `Plan reorder for ${rec.product_name}`,
      why: `${rec.days_remaining} days of stock remaining`,
      action: "/purchasing",
    });
  }

  // Determine focus area
  const engineCounts = {};
  for (const t of tasks) {
    engineCounts[t.engine] = (engineCounts[t.engine] || 0) + 1;
  }
  let focusArea = "General Operations";
  let maxCount = 0;
  for (const [engine, count] of Object.entries(engineCounts)) {
    if (count > maxCount) {
      maxCount = count;
      const labels = {
        purchasing: "Restocking",
        commerce: "Fulfillment",
        production: "Manufacturing",
        inventory: "Inventory",
      };
      focusArea = labels[engine] || engine.charAt(0).toUpperCase() + engine.slice(1);
    }
  }
  if (tasks.length > 1 && maxCount === 1) focusArea = "General Operations";

  return {
    date: new Date().toISOString().split("T")[0],
    focusArea: `${focusArea}${tasks.length > 0 ? "" : " & Planning"}`,
    tasks,
  };
}

// ── Data Gathering ──────────────────────────────────────────────────

function gatherBriefData(db, businessId) {
  // Today's stats
  const orders = store.countTodayMovements(db, businessId, "order");
  const scansIn = store.countTodayMovements(db, businessId, "in");
  const scansOut = store.countTodayMovements(db, businessId, "out");
  const scans = scansIn + scansOut;

  const purchases = db
    .query(
      `SELECT COUNT(*) as count FROM purchase_orders
       WHERE business_id = ? AND date(created_at) = date('now')`
    )
    .get(businessId).count;

  const production = db
    .query(
      `SELECT COUNT(*) as count FROM production_batches
       WHERE business_id = ? AND date(created_at) = date('now')`
    )
    .get(businessId).count;

  const todayStats = { orders, production, scans, purchases };

  // Recent activity — filter out auth events and limit system/duplicates
  const rawAuditEntries = store.getAuditLog(db, businessId, { limit: 30, offset: 0 });
  const seenDescriptions = new Set();
  const auditEntries = rawAuditEntries.filter(entry => {
    // Skip auth events entirely
    if (entry.action_type && entry.action_type.startsWith("auth.")) return false;
    // Skip system events that aren't interesting
    if (entry.action_type === "system" || (!entry.action_type && entry.entity_type === "system")) return false;
    return true;
  });
  const recentActivity = [];
  for (const entry of auditEntries) {
    const engine = classifyEngine(entry.action_type);
    const description = formatBriefDescription(entry);
    // Deduplicate by description
    if (seenDescriptions.has(description)) continue;
    seenDescriptions.add(description);
    recentActivity.push({ id: entry.id, engine, description, timeAgo: entry.created_at });
    if (recentActivity.length >= 8) break;
  }

  // Reorder recommendations
  const reorderRecommendations = store.getReorderRecommendations(db, businessId);

  // Low stock
  const lowStock = store.getLowStockProducts(db, businessId);

  // Pending batches
  const pendingBatches = store.getPendingBatches(db, businessId);

  // BOM count
  const bomCount = db
    .query("SELECT COUNT(*) as count FROM boms WHERE business_id = ?")
    .get(businessId).count;

  // Overdue POs
  const overduePOs = db
    .query(
      `SELECT po.id, po.status, po.order_date, po.expected_delivery, po.notes,
              s.name as supplier_name,
              COUNT(pi.id) as item_count
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN po_items pi ON pi.po_id = po.id
       WHERE po.business_id = ? AND po.status = 'ordered'
         AND po.expected_delivery IS NOT NULL
         AND date(po.expected_delivery) < date('now')
       GROUP BY po.id
       ORDER BY po.expected_delivery ASC
       LIMIT 10`
    )
    .all(businessId);

  // Unfulfilled orders
  const unfulfilledOrders = db
    .query(
      `SELECT o.id, o.order_number, o.customer_name, o.status, o.created_at,
              COUNT(oi.id) as item_count,
              SUM(oi.quantity) as total_qty,
              SUM(CASE WHEN oi.scanned_quantity >= oi.quantity THEN 1 ELSE 0 END) as scanned_items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.business_id = ? AND o.status = 'pending'
       GROUP BY o.id
       ORDER BY o.created_at ASC
       LIMIT 10`
    )
    .all(businessId);

  return {
    todayStats,
    recentActivity,
    reorderRecommendations,
    lowStock,
    pendingBatches,
    bomCount,
    overduePOs,
    unfulfilledOrders,
  };
}

function classifyEngine(actionType) {
  if (!actionType) return "system";
  if (actionType.startsWith("production.")) return "production";
  if (actionType.startsWith("purchasing.") || actionType.startsWith("supplier.")) return "purchasing";
  if (actionType.startsWith("order.") || actionType.startsWith("scan.")) return "orders";
  if (actionType.startsWith("product.") || actionType.startsWith("inventory.")) return "inventory";
  if (actionType.startsWith("calculation.")) return "calculation";
  return "system";
}

function formatBriefDescription(entry) {
  const user = entry.user_display_name || "System";
  const type = entry.action_type || "";

  let context = "";
  try {
    if (entry.new_value) {
      const nv = typeof entry.new_value === "string" ? JSON.parse(entry.new_value) : entry.new_value;
      if (nv.name || nv.product_name || nv.sku) {
        context = nv.name || nv.product_name || nv.sku;
      } else if (nv.username) {
        context = nv.username;
      } else if (nv.formulaName) {
        context = nv.formulaName;
      } else if (nv.batch_size && nv.bom_name) {
        context = `${nv.bom_name} (×${nv.batch_size})`;
      }
    }
  } catch {}

  if (type === "production.batch_created") return `${user} created batch${context ? ` "${context}"` : ""}`;
  if (type === "production.batch_completed") return `${user} completed batch${context ? ` "${context}"` : ""}`;
  if (type === "production.batch_cancelled") return `${user} cancelled batch${context ? ` "${context}"` : ""}`;
  if (type === "calculation.formula_created") return `${user} created formula${context ? ` "${context}"` : ""}`;
  if (type === "calculation.formula_executed") return `${user} ran calculation${context ? ` "${context}"` : ""}`;
  if (type === "purchasing.supplier_added") return `${user} added supplier${context ? ` ${context}` : ""}`;
  if (type === "purchasing.po_created") return `${user} created purchase order${context ? ` ${context}` : ""}`;
  if (type === "purchasing.po_received") return `${user} received purchase order${context ? ` ${context}` : ""}`;
  if (type === "auth.login") return `${user} logged in`;
  if (type === "scan.in") return `${user} scanned in${context ? ` ${context}` : ""}`;
  if (type === "scan.out") return `${user} scanned out${context ? ` ${context}` : ""}`;
  return `${user} — ${type}${context ? ` (${context})` : ""}`;
}

// ── Keyword-based Engine Routing for /ask ───────────────────────────

function routeQuestion(question) {
  const q = question.toLowerCase();

  const routes = [
    { keywords: ["stock", "inventory", "how many", "how much", "count", "available", "on hand", "glitter base", "mixing base"], engine: "inventory" },
    { keywords: ["supplier", "reorder", "purchase", "po", "lead time", "procure"], engine: "purchasing" },
    { keywords: ["manufacture", "batch", "bom", "produce", "production", "assembly", "assembl"], engine: "production" },
    { keywords: ["order", "sale", "selling", "best-sell", "popular", "fastest", "revenue", "customer", "shopify", "unfulfilled"], engine: "commerce" },
    { keywords: ["profit", "margin", "cost", "price", "calculate", "formula"], engine: "calculation" },
    { keywords: ["health", "score", "how am i doing", "status", "overview", "summary"], engine: "hq" },
    { keywords: ["bestie", "novi", "who are you", "what can you do", "help"], engine: "bestie" },
  ];

  for (const route of routes) {
    for (const kw of route.keywords) {
      if (q.includes(kw)) return route.engine;
    }
  }

  return null;
}

function extractProductName(question) {
  // Try to extract product name by removing common question words
  const cleaned = question
    .replace(/how (much|many) /i, "")
    .replace(/do i have/i, "")
    .replace(/what('s| is) (the |my )?/i, "")
    .replace(/tell me about /i, "")
    .replace(/show me /i, "")
    .replace(/check /i, "")
    .replace(/\?/g, "")
    .trim();

  // If there's something meaningful left, return it
  if (cleaned.length > 2) return cleaned;
  return null;
}

function answerInventory(db, businessId, question) {
  const productName = extractProductName(question);
  const products = store.listProducts(db, businessId);

  if (productName) {
    // Try to find a matching product
    const product = products.find(
      p => p.name.toLowerCase().includes(productName.toLowerCase()) ||
           p.sku.toLowerCase().includes(productName.toLowerCase())
    );
    if (product) {
      const lastMovement = db
        .query("SELECT created_at FROM inventory_movements WHERE product_id = ? AND business_id = ? ORDER BY created_at DESC LIMIT 1")
        .get(product.id, businessId);
      const lastMovementText = lastMovement
        ? ` (last movement: ${timeAgoShort(lastMovement.created_at)})`
        : "";

      return {
        answer: `You have ${product.stock_count} units of ${product.name} in stock${lastMovementText}.`,
        citedData: {
          product: { id: product.id, name: product.name, sku: product.sku, stock_count: product.stock_count },
          source: "inventory",
        },
      };
    }
  }

  // No specific product found — give summary
  const totalProducts = products.length;
  const totalStock = products.reduce((sum, p) => sum + p.stock_count, 0);
  const lowStock = products.filter(p => p.stock_count <= 5).length;

  return {
    answer: `You have ${totalProducts} product(s) in inventory with a total of ${totalStock} units across all SKUs. ${lowStock > 0 ? `${lowStock} product(s) are low on stock (5 or fewer units).` : "All products are well-stocked."} ${products.length > 0 ? `Here are your products: ${products.map(p => `${p.name} (${p.stock_count})`).join(", ")}.` : ""}`,
    citedData: {
      totalProducts,
      totalStock,
      lowStockCount: lowStock,
      products: products.map(p => ({ id: p.id, name: p.name, sku: p.sku, stock_count: p.stock_count })),
      source: "inventory",
    },
  };
}

function answerCommerce(db, businessId, question) {
  const orders = store.listOrders(db, businessId);
  const pending = orders.filter(o => o.status === "pending");
  const totalToday = store.countTodayMovements(db, businessId, "order");

  // Check if asking about best-selling / sales velocity
  const q = (question || "").toLowerCase();
  const isSalesVelocity = q.includes("selling") || q.includes("best-sell") || q.includes("popular") || q.includes("fastest");

  if (orders.length === 0) {
    return {
      answer: "You don't have any orders yet. Connect a commerce channel like Shopify to start pulling in orders.",
      citedData: { orderCount: 0, source: "commerce" },
    };
  }

  if (isSalesVelocity) {
    // Calculate product sales from order_items
    const rows = db.query(
      `SELECT p.id, p.name, p.sku, COUNT(oi.id) as order_count, SUM(oi.quantity) as total_sold
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE p.business_id = ?
       GROUP BY p.id
       ORDER BY total_sold DESC, order_count DESC
       LIMIT 5`
    ).all(businessId);

    if (rows.length === 0) {
      return {
        answer: "No sales data yet — your orders don't have product line items tracked.",
        citedData: { source: "commerce" },
      };
    }

    const top = rows.map((r, i) => `${i + 1}. ${r.name} — ${r.total_sold} sold across ${r.order_count} order(s)`).join("\n");
    return {
      answer: `Here are your top-selling products:\n${top}`,
      citedData: {
        topProducts: rows.map(r => ({ id: r.id, name: r.name, sku: r.sku, totalSold: r.total_sold, orderCount: r.order_count })),
        source: "commerce",
      },
    };
  }

  return {
    answer: `You have ${orders.length} order(s) total, with ${pending.length} pending fulfillment. ${totalToday} order(s) came in today.`,
    citedData: {
      totalOrders: orders.length,
      pendingCount: pending.length,
      todayCount: totalToday,
      source: "commerce",
    },
  };
}

function answerProduction(db, businessId) {
  const boms = db
    .query("SELECT COUNT(*) as count FROM boms WHERE business_id = ?")
    .get(businessId).count;
  const pendingBatches = store.getPendingBatches(db, businessId);
  const todayBatches = db
    .query("SELECT COUNT(*) as count FROM production_batches WHERE business_id = ? AND date(created_at) = date('now')")
    .get(businessId).count;

  if (boms === 0) {
    return {
      answer: "You haven't created any BOMs (Bill of Materials) yet. BOMs define what materials go into manufacturing a product. Head to the Production page to create your first BOM.",
      citedData: { bomCount: 0, source: "production" },
    };
  }

  return {
    answer: `You have ${boms} BOM(s) defined. ${pendingBatches.length} batch(es) are pending production, and ${todayBatches} batch(es) were created today.${pendingBatches.length > 0 ? ` Ready to run: ${pendingBatches.map(b => `"${b.bom_name}"`).join(", ")}.` : ""}`,
    citedData: {
      bomCount: boms,
      pendingBatches: pendingBatches.length,
      todayBatches,
      source: "production",
    },
  };
}

function answerPurchasing(db, businessId) {
  const summary = store.getPurchasingSummary(db, businessId);
  const recs = store.getReorderRecommendations(db, businessId);
  const urgent = recs.filter(r => r.urgency === "now");

  // Provide specific reorder recommendations
  let reorderDetails = "";
  if (recs.length > 0) {
    const top = recs.slice(0, 5);
    reorderDetails = "\n\nHere's what needs attention:\n" + top.map(r => 
      `• ${r.product_name}: ${r.current_stock} units (${r.days_remaining}d remaining) — reorder ${r.reorder_qty} ${r.unit_type || "units"}${r.supplier_name ? " from " + r.supplier_name : ""}`
    ).join("\n");
  }

  return {
    answer: `${summary.summary}${reorderDetails}${urgent.length > 0 ? `\n\n🚨 Urgent: ${urgent.map(r => `${r.product_name} (${r.current_stock} left)`).join(", ")}.` : ""}`,
    citedData: {
      urgentReorderCount: summary.urgentReorderCount,
      soonReorderCount: summary.soonReorderCount,
      supplierCount: summary.supplierCount,
      pendingPOs: summary.pendingPOs,
      source: "purchasing",
    },
  };
}

function answerCalculation(db, businessId) {
  const formulas = db
    .query("SELECT COUNT(*) as count FROM formulas WHERE business_id = ? AND is_public = 0")
    .get(businessId).count;
  const templates = db
    .query("SELECT COUNT(*) as count FROM formulas WHERE is_public = 1")
    .get().count;

  if (formulas === 0) {
    return {
      answer: `You haven't created any custom formulas yet. There are ${templates} pre-built templates available in the Calculator — try the Cost Per Unit or Margin Calculator to get started.`,
      citedData: { formulaCount: 0, templateCount: templates, source: "calculation" },
    };
  }

  return {
    answer: `You have ${formulas} custom formula(s) and ${templates} template(s) available. Formulas help you calculate costs, margins, batch sizes, and more automatically.`,
    citedData: { formulaCount: formulas, templateCount: templates, source: "calculation" },
  };
}

function answerHQ(db, businessId) {
  const data = gatherBriefData(db, businessId);
  const health = getHealthScore(db, businessId);
  const totalAttention =
    (data.lowStock || []).length +
    (data.pendingBatches || []).length +
    (data.overduePOs || []).length +
    (data.unfulfilledOrders || []).length;

  return {
    answer: `Your business health score is ${health.score}/100 (${health.label}). ${totalAttention > 0 ? `${totalAttention} item(s) need attention.` : "Everything looks good!"} Breakdown: Inventory ${health.breakdown.inventory.score}%, Production ${health.breakdown.production.score}%, Purchasing ${health.breakdown.purchasing.score}%, Commerce ${health.breakdown.commerce.score}%, Operations ${health.breakdown.operations.score}%, Quality ${health.breakdown.quality.score}%.`,
    citedData: {
      health,
      totalAttention,
      todayStats: data.todayStats,
      source: "hq",
    },
  };
}

function answerBestie() {
  return {
    answer: "I'm Novi ✨ — your AI-powered business companion! I can help you with:\n\n• **Inventory** — check stock levels, find products\n• **Orders** — see pending orders, sales activity\n• **Production** — check manufacturing status, BOMs\n• **Purchasing** — reorder recommendations, suppliers\n• **Calculations** — costs, margins, formulas\n• **Health** — overall business health check\n\nTry asking: \"How much Glitter Base do I have?\" or \"What needs my attention?\"",
    citedData: { source: "bestie" },
  };
}

function timeAgoShort(iso) {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Mount Business Bestie routes on the Express app.
 * @param {import("express").Express} app
 * @param {import("bun:sqlite").Database} db
 */
export function mountBestieRoutes(app, db) {
  // ── GET /api/bestie/brief — The Morning Brief ─────────────────────

  app.get("/api/bestie/brief", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const rawData = gatherBriefData(db, req.businessId);
      const personality = req.query.personality || "coach";
      const validPersonality = PERSONALITIES[personality] ? personality : "coach";

      const texts = generateBriefTexts(rawData, validPersonality);
      try { const opps = detectOpportunities(db, req.businessId); for (const o of opps.opportunities.slice(0, 3)) { if (o.impact === "high") { texts.whatToDo.unshift({ engine: o.engine, icon: o.icon, text: o.title + " — " + o.description, action: o.action }); } else { texts.whatToDo.push({ engine: o.engine, icon: o.icon, text: o.title + " — " + o.description, action: o.action }); } } } catch {}
      const health = getHealthScore(db, req.businessId);

      const hour = new Date().getHours();
      const greeting = PERSONALITIES[validPersonality].greeting(req.user.display_name || "there", hour);

      // ── P4.7: Memory-aware enhancements ──────────────────────────

      // Business context
      let businessContext = null;
      try {
        const biz = db.query("SELECT created_at FROM businesses WHERE id = ?").get(req.businessId);
        if (biz) {
          const bizCreated = new Date(biz.created_at);
          const ageDays = Math.floor((new Date() - bizCreated) / (1000 * 60 * 60 * 24));
          const orderCount = db.query("SELECT COUNT(*) as count FROM orders WHERE business_id = ?").get(req.businessId).count;
          let phase = "getting started";
          let phaseText = "You're laying the foundation for something great.";
          if (ageDays > 90 && orderCount > 50) { phase = "scaling"; phaseText = "You're scaling — systems and consistency are your superpower."; }
          else if (ageDays > 30 || orderCount > 10) { phase = "growing"; phaseText = "You're growing steadily — your business is finding its rhythm."; }
          businessContext = { ageDays, orderCount, phase, phaseText };
        }
      } catch {}

      // On this day — anniversaries from novi_memory
      let onThisDay = [];
      try {
        const today = new Date();
        const month = today.getMonth() + 1;
        const day = today.getDate();
        onThisDay = db.query(
          `SELECT title, description, occurred_at
           FROM novi_memory
           WHERE business_id = ?
             AND CAST(strftime('%m', occurred_at) AS INTEGER) = ?
             AND CAST(strftime('%d', occurred_at) AS INTEGER) = ?
             AND date(occurred_at) < date('now')
           ORDER BY occurred_at DESC`
        ).all(req.businessId, month, day);
      } catch {}

      // Goal progress
      let goalProgress = [];
      try {
        const goals = db.query(
          "SELECT * FROM novi_goals WHERE business_id = ? AND status = 'active'"
        ).all(req.businessId);
        for (const g of goals) {
          const progress = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0;
          goalProgress.push({ title: g.title, target: g.target, current: g.current, unit: g.unit, progress });
        }
      } catch {}

      // Brand Setup nudge — if no branded templates exist
      let brandNudge = null;
      try {
        const templates = db.query(
          "SELECT config FROM fulfillment_templates WHERE business_id = ?"
        ).all(req.businessId);
        const hasBranded = templates.some(t => {
          try { return JSON.parse(t.config || "{}").generated_by === "novi"; } catch { return false; }
        });
        if (!hasBranded && templates.length === 0) {
          brandNudge = {
            engine: "brand_setup",
            icon: "🎨",
            text: "Your business documents aren't branded yet — I can design them in a few minutes!",
            action: "/brand-setup",
            actionLabel: "Design my brand",
          };
        }
      } catch {}

      res.json({
        greeting,
        personality: validPersonality,
        timestamp: new Date().toISOString(),
        whatHappened: texts.whatHappened,
        needsAttention: texts.needsAttention,
        whatToDo: texts.whatToDo,
        celebrations: texts.celebrations,
        topOpportunities: (() => { try { const opps = detectOpportunities(db, req.businessId); return opps.opportunities.slice(0, 3).map(o => ({ id: o.id, type: o.type, engine: o.engine, icon: o.icon, title: o.title, description: o.description, impact: o.impact, action: o.action, actionLabel: o.actionLabel })); } catch { return []; } })(),
        healthSummary: {
          score: health.score,
          label: health.label,
          breakdown: health.breakdown,
        },
        // P4.7 additions:
        businessContext,
        onThisDay,
        goalProgress,
        // Brand Setup nudge
        brandNudge,
      });
    } catch (err) {
      console.error("GET /api/bestie/brief error:", err);
      res.status(500).json({ error: "Failed to generate brief" });
    }
  });

  // ── GET /api/bestie/ask — Natural Language Q&A ───────────────────

  app.get("/api/bestie/ask", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const question = req.query.q;
      if (!question || !question.trim()) {
        return res.status(400).json({ error: "Question is required (q parameter)" });
      }

      const engine = routeQuestion(question.trim());
      let result;

      switch (engine) {
        case "inventory":
          result = answerInventory(db, req.businessId, question.trim());
          break;
        case "commerce":
          result = answerCommerce(db, req.businessId, question.trim());
          break;
        case "production":
          result = answerProduction(db, req.businessId);
          break;
        case "purchasing":
          result = answerPurchasing(db, req.businessId);
          break;
        case "calculation":
          result = answerCalculation(db, req.businessId);
          break;
        case "hq":
          result = answerHQ(db, req.businessId);
          break;
        case "bestie":
          result = answerBestie();
          break;
        default:
          result = {
            answer: "I don't know how to answer that yet — but I'm learning! Try asking about inventory, orders, production status, purchasing recommendations, calculations, or your business health. For example: \"How much stock do I have?\" or \"What needs reordering?\"",
            citedData: { source: "bestie", suggestion: true },
          };
          break;
      }

      res.json({
        question: question.trim(),
        ...result,
      });
    } catch (err) {
      console.error("GET /api/bestie/ask error:", err);
      res.status(500).json({ error: "Failed to answer question" });
    }
  });

  // ── GET /api/bestie/daily-planner — Today's prioritized task list ─

  app.get("/api/bestie/daily-planner", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const rawData = gatherBriefData(db, req.businessId);
      const planner = buildDailyPlanner(rawData);
      res.json(planner);
    } catch (err) {
      console.error("GET /api/bestie/daily-planner error:", err);
      res.status(500).json({ error: "Failed to generate daily planner" });
    }
  });

  // ── GET /api/bestie/summary — AI-consumable summary ──────────────

  app.get("/api/bestie/summary", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const rawData = gatherBriefData(db, req.businessId);
      const health = getHealthScore(db, req.businessId);

      res.json({
        engine: "bestie",
        timestamp: new Date().toISOString(),
        health,
        todayStats: rawData.todayStats,
        urgentCount: (rawData.reorderRecommendations || []).filter(r => r.urgency === "now").length,
        pendingBatchCount: (rawData.pendingBatches || []).length,
        unfulfilledOrderCount: (rawData.unfulfilledOrders || []).length,
        overduePOCount: (rawData.overduePOs || []).length,
        productCount: store.countProducts(db, req.businessId),
        summary: `Business health: ${health.score}/100 (${health.label}). ${rawData.todayStats.orders} order(s), ${rawData.todayStats.production} batch(es), ${rawData.todayStats.scans} scan(s) today. ${(rawData.reorderRecommendations || []).filter(r => r.urgency === "now").length} urgent reorder(s), ${rawData.unfulfilledOrders.length} pending order(s).`,
      });
    } catch (err) {
      console.error("GET /api/bestie/summary error:", err);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });
}
