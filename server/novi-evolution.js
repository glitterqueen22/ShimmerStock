/**
 * P4.7: Novi Evolution — Intelligence & Memory Layer
 * ===================================================
 * Long-term business memory, goal tracking, business wrapped,
 * executive summaries, and proactive coaching.
 *
 * All routes require auth (reports.read minimum).
 */

import * as store from "./store.js";
import { requireAuth } from "./auth.js";
import { getHealthScore } from "./health.js";
import { getAttributionValidationStatus, getAttributionAlerts } from "./affiliate-attribution-store.js";

// ── Helpers ──────────────────────────────────────────────────────────

function daysAgo(dateStr) {
  const now = new Date();
  const then = new Date(dateStr);
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function monthsAgo(dateStr) {
  const now = new Date();
  const then = new Date(dateStr);
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
}

function formatRelativeDate(dateStr) {
  const days = daysAgo(dateStr);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week(s) ago`;
  if (days < 365) return `${Math.floor(days / 30)} month(s) ago`;
  return `${Math.floor(days / 365)} year(s) ago`;
}

// ── Memory helpers ───────────────────────────────────────────────────

function getMemoriesForBusiness(db, businessId, limit = 50) {
  return db.query(
    `SELECT id, event_type, title, description, occurred_at, created_at
     FROM novi_memory
     WHERE business_id = ?
     ORDER BY occurred_at DESC
     LIMIT ?`
  ).all(businessId, limit);
}

function getMemoriesOnThisDay(db, businessId) {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  return db.query(
    `SELECT id, event_type, title, description, occurred_at
     FROM novi_memory
     WHERE business_id = ?
       AND CAST(strftime('%m', occurred_at) AS INTEGER) = ?
       AND CAST(strftime('%d', occurred_at) AS INTEGER) = ?
     ORDER BY occurred_at DESC`
  ).all(businessId, month, day);
}

function createMemory(db, businessId, eventType, title, description, occurredAt) {
  const result = db.run(
    `INSERT INTO novi_memory (business_id, event_type, title, description, occurred_at)
     VALUES (?, ?, ?, ?, ?)`,
    [businessId, eventType, title, description || null, occurredAt || new Date().toISOString()]
  );
  return result.lastInsertRowid;
}

// ── Business context ─────────────────────────────────────────────────

function getBusinessContext(db, businessId) {
  // How old is the business?
  const biz = db.query("SELECT created_at FROM businesses WHERE id = ?").get(businessId);
  const ageDays = biz ? daysAgo(biz.created_at) : 0;

  // Order count
  const orderCount = db.query(
    "SELECT COUNT(*) as count FROM orders WHERE business_id = ?"
  ).get(businessId).count;

  // Revenue
  const revenueData = db.query(
    `SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0) as total
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE o.business_id = ? AND o.status != 'cancelled'`
  ).get(businessId);
  const totalRevenue = revenueData ? revenueData.total : 0;

  // Product count
  const productCount = db.query(
    "SELECT COUNT(*) as count FROM products WHERE business_id = ?"
  ).get(businessId).count;

  // Determine phase
  let phase = "getting started";
  let phaseDescription = "You're in the early days — laying the foundation for something great.";
  if (ageDays > 90 && orderCount > 50) {
    phase = "scaling";
    phaseDescription = "You're building real momentum — systems and processes matter more than ever.";
  } else if (ageDays > 30 || orderCount > 10) {
    phase = "growing";
    phaseDescription = "You're finding your stride — your business is gaining steady traction.";
  }

  return { ageDays, orderCount, totalRevenue, productCount, phase, phaseDescription };
}

// ── Goal helpers ─────────────────────────────────────────────────────

function getGoalsForBusiness(db, businessId) {
  const goals = db.query(
    `SELECT id, title, target, current, unit, deadline, status, created_at
     FROM novi_goals
     WHERE business_id = ?
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END, created_at DESC`
  ).all(businessId);

  return goals.map(g => ({
    ...g,
    progress: g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0,
  }));
}

function createGoal(db, businessId, { title, target, unit, deadline }) {
  const result = db.run(
    `INSERT INTO novi_goals (business_id, title, target, current, unit, deadline, status)
     VALUES (?, ?, ?, 0, ?, ?, 'active')`,
    [businessId, title, target, unit || "orders", deadline || null]
  );
  return result.lastInsertRowid;
}

function updateGoalProgress(db, goalId, businessId, current) {
  const goal = db.query(
    "SELECT * FROM novi_goals WHERE id = ? AND business_id = ?"
  ).get(goalId, businessId);
  if (!goal) return null;

  const newCurrent = parseFloat(current) || 0;
  let newStatus = goal.status;

  // Auto-complete when target reached
  if (newCurrent >= goal.target && goal.status === "active") {
    newStatus = "completed";
    // Create a memory for hitting the goal
    createMemory(db, businessId, "achievement",
      `Goal Achieved: ${goal.title}`,
      `You hit your target of ${goal.target} ${goal.unit}! 🎉 This is worth celebrating.`,
      new Date().toISOString()
    );
  }

  db.run(
    "UPDATE novi_goals SET current = ?, status = ? WHERE id = ? AND business_id = ?",
    [newCurrent, newStatus, goalId, businessId]
  );

  return { ...goal, current: newCurrent, status: newStatus };
}

function getGoalProgressMessages(db, businessId) {
  const goals = db.query(
    "SELECT * FROM novi_goals WHERE business_id = ? AND status = 'active'"
  ).all(businessId);

  const messages = [];
  for (const g of goals) {
    const progress = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0;
    if (progress >= 90) {
      const remaining = g.target - g.current;
      messages.push({
        goal: g.title,
        progress,
        message: `You're ${progress}% to your ${g.title.toLowerCase()} — just ${remaining} more ${g.unit}!`,
        urgency: "celebrate",
      });
    } else if (progress >= 50) {
      messages.push({
        goal: g.title,
        progress,
        message: `You're halfway to your goal of ${g.target} ${g.unit} — keep the momentum going!`,
        urgency: "encourage",
      });
    } else {
      messages.push({
        goal: g.title,
        progress,
        message: `You're at ${progress}% of your ${g.title.toLowerCase()} target. Every step counts.`,
        urgency: "info",
      });
    }
  }

  return messages;
}

// ── Coaching tips ────────────────────────────────────────────────────

function getCoachingTips(db, businessId) {
  const ctx = getBusinessContext(db, businessId);
  const tips = [];

  // Stage-based tips
  if (ctx.phase === "getting started") {
    tips.push({
      title: "Focus on your first 10 customers",
      description: "Get feedback early — your first customers will teach you more than any report.",
      category: "growth",
    });
    tips.push({
      title: "Set a simple revenue goal",
      description: "Even a small target gives you something to aim for. Try setting a monthly revenue goal and Novi will track it for you.",
      category: "goals",
    });
  } else if (ctx.phase === "growing") {
    tips.push({
      title: "Start tracking inventory trends",
      description: "Knowing which products sell fastest helps you avoid stockouts. Check your reorder recommendations regularly.",
      category: "operations",
    });
    tips.push({
      title: "Consider expanding your channels",
      description: "If you're only selling on one platform, adding another can unlock new customers without changing your product.",
      category: "growth",
    });
  } else if (ctx.phase === "scaling") {
    tips.push({
      title: "Delegate with confidence",
      description: "As you scale, trusting your team becomes essential. ShimmerStock's role-based permissions let you share the load safely.",
      category: "leadership",
    });
    tips.push({
      title: "Forecast your inventory needs",
      description: "At your volume, running out of stock costs real revenue. Use the Purchasing engine to stay ahead of demand.",
      category: "operations",
    });
  }

  // Activity-based tips
  const pendingOrders = db.query(
    "SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND status = 'pending'"
  ).get(businessId).count;

  if (pendingOrders > 3) {
    tips.push({
      title: `${pendingOrders} orders waiting to ship`,
      description: "Batching your fulfillment into a focused session can help you clear the queue faster.",
      category: "operations",
    });
  }

  const lowStockCount = db.query(
    "SELECT COUNT(*) as count FROM products WHERE business_id = ? AND stock_count <= 5"
  ).get(businessId).count;

  if (lowStockCount > 0) {
    tips.push({
      title: `${lowStockCount} product(s) running low`,
      description: "Low stock means missed sales. A quick reorder now keeps your customers happy later.",
      category: "inventory",
    });
  }

  // Goal-based tips
  const goals = db.query(
    "SELECT * FROM novi_goals WHERE business_id = ? AND status = 'active'"
  ).all(businessId);

  if (goals.length === 0 && ctx.ageDays > 7) {
    tips.push({
      title: "Set your first business goal",
      description: "Goals give Novi more ways to help. Try '50 orders this month' or '$500 in revenue' and let Novi track your progress.",
      category: "goals",
    });
  }

  const missedGoals = db.query(
    "SELECT * FROM novi_goals WHERE business_id = ? AND status = 'active' AND deadline IS NOT NULL AND date(deadline) < date('now')"
  ).all(businessId);

  if (missedGoals.length > 0) {
    tips.push({
      title: "Don't let a missed goal slow you down",
      description: `Goals are guideposts, not ultimatums. Try setting a new target and breaking it into smaller milestones.`,
      category: "encouragement",
    });
  }

  // Return 1-3 most relevant tips
  return tips.slice(0, 3);
}

// ── Business Wrapped ─────────────────────────────────────────────────

function getBusinessWrapped(db, businessId, year) {
  const y = parseInt(year) || new Date().getFullYear();
  const prevY = y - 1;

  // This year's stats
  const thisYear = db.query(
    `SELECT COUNT(DISTINCT o.id) as total_orders,
            COALESCE(SUM(oi.unit_price * oi.quantity), 0) as total_revenue,
            COALESCE(SUM(oi.quantity), 0) as total_products_sold
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.business_id = ?
       AND strftime('%Y', o.created_at) = ?
       AND o.status != 'cancelled'`
  ).get(businessId, String(y)) || { total_orders: 0, total_revenue: 0, total_products_sold: 0 };

  // Previous year for growth comparison
  const prevYear = db.query(
    `SELECT COUNT(DISTINCT o.id) as total_orders,
            COALESCE(SUM(oi.unit_price * oi.quantity), 0) as total_revenue
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.business_id = ?
       AND strftime('%Y', o.created_at) = ?
       AND o.status != 'cancelled'`
  ).get(businessId, String(prevY)) || { total_orders: 0, total_revenue: 0 };

  // Growth percentages
  const orderGrowth = prevYear.total_orders > 0
    ? Math.round(((thisYear.total_orders - prevYear.total_orders) / prevYear.total_orders) * 100)
    : null;
  const revenueGrowth = prevYear.total_revenue > 0
    ? Math.round(((thisYear.total_revenue - prevYear.total_revenue) / prevYear.total_revenue) * 100)
    : null;

  // Top product
  const topProduct = db.query(
    `SELECT p.name, p.sku, SUM(oi.quantity) as total_sold,
            COALESCE(SUM(oi.unit_price * oi.quantity), 0) as revenue
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     LEFT JOIN products p ON oi.product_id = p.id
     WHERE o.business_id = ?
       AND strftime('%Y', o.created_at) = ?
       AND o.status != 'cancelled'
     GROUP BY oi.product_id
     ORDER BY total_sold DESC
     LIMIT 1`
  ).get(businessId, String(y));

  // Top channel
  const topChannel = db.query(
    `SELECT COALESCE(o.source, 'shopify') as channel, COUNT(*) as count,
            COALESCE(SUM(oi.unit_price * oi.quantity), 0) as revenue
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.business_id = ?
       AND strftime('%Y', o.created_at) = ?
       AND o.status != 'cancelled'
     GROUP BY channel
     ORDER BY count DESC
     LIMIT 1`
  ).get(businessId, String(y));

  // Top customer
  const topCustomer = db.query(
    `SELECT o.customer_name, COUNT(DISTINCT o.id) as orders,
            COALESCE(SUM(oi.unit_price * oi.quantity), 0) as revenue
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.business_id = ?
       AND strftime('%Y', o.created_at) = ?
       AND o.status != 'cancelled'
       AND o.customer_name IS NOT NULL
     GROUP BY o.customer_name
     ORDER BY orders DESC
     LIMIT 1`
  ).get(businessId, String(y));

  // Busiest month
  const busiestMonth = db.query(
    `SELECT strftime('%m', o.created_at) as month,
            COUNT(DISTINCT o.id) as count
     FROM orders o
     WHERE o.business_id = ?
       AND strftime('%Y', o.created_at) = ?
       AND o.status != 'cancelled'
     GROUP BY month
     ORDER BY count DESC
     LIMIT 1`
  ).get(businessId, String(y));

  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const busiestMonthName = busiestMonth ? monthNames[parseInt(busiestMonth.month) - 1] : null;

  // Busiest day of week
  const busiestDay = db.query(
    `SELECT strftime('%w', o.created_at) as dow,
            COUNT(DISTINCT o.id) as count
     FROM orders o
     WHERE o.business_id = ?
       AND strftime('%Y', o.created_at) = ?
       AND o.status != 'cancelled'
     GROUP BY dow
     ORDER BY count DESC
     LIMIT 1`
  ).get(businessId, String(y));

  const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const busiestDayName = busiestDay ? dayNames[parseInt(busiestDay.dow)] : null;

  // Milestones hit this year
  const milestones = db.query(
    `SELECT title, description, occurred_at
     FROM novi_memory
     WHERE business_id = ?
       AND strftime('%Y', occurred_at) = ?
       AND event_type IN ('milestone', 'achievement', 'launch')
     ORDER BY occurred_at ASC`
  ).all(businessId, String(y));

  // Highlights
  const highlights = [];
  if (thisYear.total_orders > 0) {
    highlights.push(`You fulfilled ${thisYear.total_orders} orders this year — every single one of them someone who chose you.`);
  }
  if (topProduct) {
    highlights.push(`"${topProduct.name}" was your star product, selling ${topProduct.total_sold} units and generating $${topProduct.revenue?.toFixed(2) || '0.00'} in revenue.`);
  }
  if (orderGrowth !== null && orderGrowth > 0) {
    highlights.push(`Your orders grew ${orderGrowth}% compared to last year — that's real momentum.`);
  }
  if (milestones.length > 0) {
    highlights.push(`You hit ${milestones.length} milestone(s) this year — each one a stepping stone to something bigger.`);
  }

  return {
    year: y,
    totalOrders: thisYear.total_orders || 0,
    totalRevenue: thisYear.total_revenue || 0,
    totalProductsSold: thisYear.total_products_sold || 0,
    topProduct: topProduct ? { name: topProduct.name, sku: topProduct.sku, totalSold: topProduct.total_sold, revenue: topProduct.revenue } : null,
    topChannel: topChannel ? { channel: topChannel.channel, orders: topChannel.count, revenue: topChannel.revenue } : null,
    topCustomer: topCustomer ? { name: topCustomer.customer_name, orders: topCustomer.orders, revenue: topCustomer.revenue } : null,
    busiestMonth: busiestMonthName,
    busiestDay: busiestDayName,
    orderGrowth: orderGrowth !== null ? `${orderGrowth >= 0 ? '+' : ''}${orderGrowth}%` : null,
    revenueGrowth: revenueGrowth !== null ? `${revenueGrowth >= 0 ? '+' : ''}${revenueGrowth}%` : null,
    milestones,
    highlights,
  };
}

// ── Executive Summary ────────────────────────────────────────────────

function getExecutiveSummary(db, businessId) {
  // Today
  const todayOrders = db.query(
    `SELECT COUNT(DISTINCT o.id) as count,
            COALESCE(SUM(oi.unit_price * oi.quantity), 0) as revenue
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.business_id = ? AND date(o.created_at) = date('now')
       AND o.status != 'cancelled'`
  ).get(businessId) || { count: 0, revenue: 0 };

  // This week (last 7 days)
  const weekOrders = db.query(
    `SELECT COUNT(DISTINCT o.id) as count,
            COALESCE(SUM(oi.unit_price * oi.quantity), 0) as revenue
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.business_id = ?
       AND date(o.created_at) >= date('now', '-7 days')
       AND o.status != 'cancelled'`
  ).get(businessId) || { count: 0, revenue: 0 };

  // Last week (7-14 days ago)
  const lastWeekOrders = db.query(
    `SELECT COUNT(DISTINCT o.id) as count,
            COALESCE(SUM(oi.unit_price * oi.quantity), 0) as revenue
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.business_id = ?
       AND date(o.created_at) >= date('now', '-14 days')
       AND date(o.created_at) < date('now', '-7 days')
       AND o.status != 'cancelled'`
  ).get(businessId) || { count: 0, revenue: 0 };

  const weekOrderChange = (lastWeekOrders && lastWeekOrders.count > 0)
    ? Math.round(((weekOrders.count - lastWeekOrders.count) / lastWeekOrders.count) * 100)
    : null;
  const weekRevenueChange = (lastWeekOrders && lastWeekOrders.revenue > 0)
    ? Math.round(((weekOrders.revenue - lastWeekOrders.revenue) / lastWeekOrders.revenue) * 100)
    : null;

  // Shipments today
  const todayShipments = (db.query(
    `SELECT COUNT(*) as count FROM orders
     WHERE business_id = ? AND status = 'complete'
       AND date(updated_at) = date('now')`
  ).get(businessId) || { count: 0 }).count;

  // Issues (low stock + overdue POs + pending orders)
  const issues = [];
  const lowStock = (db.query(
    "SELECT COUNT(*) as count FROM products WHERE business_id = ? AND stock_count <= 5"
  ).get(businessId) || { count: 0 }).count;
  if (lowStock > 0) issues.push(`${lowStock} product(s) low on stock`);

  const overduePOs = (db.query(
    `SELECT COUNT(*) as count FROM purchase_orders
     WHERE business_id = ? AND status = 'ordered'
       AND expected_delivery IS NOT NULL AND date(expected_delivery) < date('now')`
  ).get(businessId) || { count: 0 }).count;
  if (overduePOs > 0) issues.push(`${overduePOs} overdue PO(s)`);

  const pendingOrders = (db.query(
    "SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND status = 'pending'"
  ).get(businessId) || { count: 0 }).count;
  if (pendingOrders > 0) issues.push(`${pendingOrders} order(s) pending fulfillment`);

  // Check for packing recipes (Fulfillment 1.2)
  const recipeCount = db.query(
    "SELECT COUNT(*) as count FROM packing_recipes WHERE business_id = ? AND is_active = 1"
  ).get(businessId)?.count || 0;
  const hasRecipes = recipeCount > 0;

  // Health
  const health = getHealthScore(db, businessId);

  // Top attention item
  let topAttention = null;
  if (overduePOs > 0) {
    topAttention = { type: "overdue_po", message: `${overduePOs} purchase order(s) past their expected delivery date`, action: "/purchasing" };
  } else if (lowStock > 0) {
    topAttention = { type: "low_stock", message: `${lowStock} product(s) with critically low inventory`, action: "/purchasing" };
  } else if (pendingOrders > 0) {
    topAttention = { type: "pending_orders", message: `${pendingOrders} order(s) waiting to be shipped`, action: "/orders" };
  }

  // Recommended action
  let recommendedAction = null;
  const reorderRecs = store.getReorderRecommendations(db, businessId);
  const urgentRecs = (reorderRecs || []).filter(r => r.urgency === "now");
  if (urgentRecs.length > 0) {
    recommendedAction = {
      type: "reorder",
      message: `Reorder ${urgentRecs[0].product_name} — at ${urgentRecs[0].current_stock} units with ${urgentRecs[0].days_remaining} days remaining`,
      action: "/purchasing",
    };
  } else if (pendingOrders > 0) {
    const recipeMsg = hasRecipes ? ` — packing recipes are ready to guide you` : '';
    recommendedAction = {
      type: "fulfill",
      message: `Ship ${pendingOrders} pending order(s) to keep customers happy${recipeMsg}`,
      action: "/orders",
    };
  } else if (lowStock === 0 && pendingOrders === 0 && overduePOs === 0) {
    recommendedAction = {
      type: "growth",
      message: "Everything's running smoothly — a great time to plan your next growth move",
      action: null,
    };
  }

  return {
    today: {
      orders: todayOrders.count || 0,
      revenue: todayOrders.revenue || 0,
      shipments: todayShipments,
      issues: issues.length > 0 ? issues : ["All clear ✨"],
    },
    thisWeek: {
      orders: weekOrders.count || 0,
      revenue: weekOrders.revenue || 0,
      orderChange: weekOrderChange !== null ? `${weekOrderChange >= 0 ? '+' : ''}${weekOrderChange}%` : null,
      revenueChange: weekRevenueChange !== null ? `${weekRevenueChange >= 0 ? '+' : ''}${weekRevenueChange}%` : null,
    },
    health,
    topAttention,
    recommendedAction,
    packingRecipesCount: recipeCount,
  };
}

// ── Public API / Route Mounting ──────────────────────────────────────

export function mountNoviEvolutionRoutes(app, db) {

  // ── GET /api/novi/memories — list memories ─────────────────────────

  app.get("/api/novi/memories", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const memories = getMemoriesForBusiness(db, req.businessId, 100);
      res.json({ memories });
    } catch (err) {
      console.error("GET /api/novi/memories error:", err);
      res.status(500).json({ error: "Failed to fetch memories" });
    }
  });

  // ── POST /api/novi/memories — create a memory ────────────────────

  app.post("/api/novi/memories", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const { event_type, title, description, occurred_at } = req.body;
      if (!event_type || !title) {
        return res.status(400).json({ error: "event_type and title are required" });
      }
      const validTypes = ["milestone", "launch", "hire", "anniversary", "achievement", "note"];
      if (!validTypes.includes(event_type)) {
        return res.status(400).json({ error: `event_type must be one of: ${validTypes.join(", ")}` });
      }
      const id = createMemory(db, req.businessId, event_type, title, description, occurred_at || new Date().toISOString());
      res.status(201).json({ id, event_type, title, description, occurred_at: occurred_at || new Date().toISOString() });
    } catch (err) {
      console.error("POST /api/novi/memories error:", err);
      res.status(500).json({ error: "Failed to create memory" });
    }
  });

  // ── GET /api/novi/wrapped?year=2026 — Business Wrapped ────────────

  app.get("/api/novi/wrapped", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const year = req.query.year || new Date().getFullYear();
      const wrapped = getBusinessWrapped(db, req.businessId, year);
      res.json(wrapped);
    } catch (err) {
      console.error("GET /api/novi/wrapped error:", err);
      res.status(500).json({ error: "Failed to generate Business Wrapped" });
    }
  });

  // ── GET /api/novi/summary — Executive Summary ─────────────────────

  app.get("/api/novi/summary", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const summary = getExecutiveSummary(db, req.businessId);
      res.json(summary);
    } catch (err) {
      console.error("GET /api/novi/summary error:", err);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  // ── GET /api/novi/goals — list goals ──────────────────────────────

  app.get("/api/novi/goals", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const goals = getGoalsForBusiness(db, req.businessId);
      res.json({ goals });
    } catch (err) {
      console.error("GET /api/novi/goals error:", err);
      res.status(500).json({ error: "Failed to fetch goals" });
    }
  });

  // ── POST /api/novi/goals — create a goal ──────────────────────────

  app.post("/api/novi/goals", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const { title, target, unit, deadline } = req.body;
      if (!title || !target) {
        return res.status(400).json({ error: "title and target are required" });
      }
      const validUnits = ["orders", "revenue", "products", "customers"];
      const unitToUse = validUnits.includes(unit) ? unit : "orders";
      const id = createGoal(db, req.businessId, { title, target, unit: unitToUse, deadline: deadline || null });
      res.status(201).json({ id, title, target, current: 0, unit: unitToUse, deadline: deadline || null, status: "active", progress: 0 });
    } catch (err) {
      console.error("POST /api/novi/goals error:", err);
      res.status(500).json({ error: "Failed to create goal" });
    }
  });

  // ── PUT /api/novi/goals/:id — update goal progress ──────────────

  app.put("/api/novi/goals/:id", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const { current } = req.body;
      if (current === undefined) {
        return res.status(400).json({ error: "current value is required" });
      }
      const updated = updateGoalProgress(db, req.params.id, req.businessId, current);
      if (!updated) {
        return res.status(404).json({ error: "Goal not found" });
      }
      const progress = updated.target > 0 ? Math.min(100, Math.round((updated.current / updated.target) * 100)) : 0;
      res.json({ ...updated, progress });
    } catch (err) {
      console.error("PUT /api/novi/goals/:id error:", err);
      res.status(500).json({ error: "Failed to update goal" });
    }
  });

  // ── GET /api/novi/coaching — coaching tips ────────────────────────

  app.get("/api/novi/coaching", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const tips = getCoachingTips(db, req.businessId);
      res.json({ tips });
    } catch (err) {
      console.error("GET /api/novi/coaching error:", err);
      res.status(500).json({ error: "Failed to generate coaching tips" });
    }
  });

  // ── GET /api/novi/context — business context ──────────────────────

  app.get("/api/novi/context", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const ctx = getBusinessContext(db, req.businessId);
      const onThisDay = getMemoriesOnThisDay(db, req.businessId);
      const goalProgress = getGoalProgressMessages(db, req.businessId);
      const attributionStatus = getAttributionValidationStatus(db, req.businessId);
      const attributionAlerts = getAttributionAlerts(db, req.businessId);
      res.json({ context: ctx, onThisDay, goalProgress, attributionStatus, attributionAlerts });
    } catch (err) {
      console.error("GET /api/novi/context error:", err);
      res.status(500).json({ error: "Failed to fetch context" });
    }
  });

  console.log("P4.7: Novi Evolution routes mounted");
}

// ── Exports for bestie.js integration ────────────────────────────────

export {
  getMemoriesForBusiness,
  getMemoriesOnThisDay,
  getBusinessContext,
  getGoalProgressMessages,
  getCoachingTips,
  getBusinessWrapped,
  getExecutiveSummary,
};
