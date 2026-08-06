/**
 * Opportunity Bridge
 * =================
 * Bridges the gap between Novi detection events and the unified opportunities table.
 *
 * Subscribes to "opportunity.detected" events from the event bus and persists them
 * into the `opportunities` table via store functions.
 *
 * Also exposes `runAllDetectors()` which runs all Novi detection rules plus the
 * existing Opportunity Center categories and merges everything into the table.
 */

import { on, off } from "./events.js";
import * as store from "./store.js";
import { runAllChecks } from "./novi-detection.js";
import { detectOpportunities } from "./opportunities.js";

// ═══════════════════════════════════════════════════════════════════════
// EVENT TYPE → OPPORTUNITY METADATA MAPPING
// ═══════════════════════════════════════════════════════════════════════

const EVENT_META = {
  low_inventory:          { impact: "high",   engine: "inventory",  icon: "📉",   action_label: "Create Purchase Order",  action_link: "/purchasing" },
  out_of_stock:           { impact: "high",   engine: "inventory",  icon: "🚫",   action_label: "Reorder Now",            action_link: "/purchasing" },
  missing_skus:           { impact: "medium", engine: "inventory",  icon: "🏷️",  action_label: "Generate SKUs",           action_link: "/products?filter=missing-sku" },
  duplicate_skus:         { impact: "medium", engine: "inventory",  icon: "⚠️",   action_label: "Review Duplicates",       action_link: "/products?filter=duplicate-sku" },
  orders_combine:         { impact: "medium", engine: "orders",     icon: "📦📦", action_label: "Combine Orders",           action_link: "/orders" },
  order_split:            { impact: "medium", engine: "orders",     icon: "✂️",   action_label: "Split Order",             action_link: "/orders" },
  delayed_order:          { impact: "high",   engine: "orders",     icon: "⏰",   action_label: "Review Order",            action_link: "/orders" },
  fulfillment_deadline:   { impact: "high",   engine: "fulfillment", icon: "⏳",  action_label: "Fulfill Now",             action_link: "/fulfillment" },
  returns_waiting:        { impact: "medium", engine: "orders",     icon: "↩️",   action_label: "Process Returns",         action_link: "/orders?status=returned" },
  affiliate_application:  { impact: "low",    engine: "partners",   icon: "👥",   action_label: "Review Applications",      action_link: "/partners?tab=applications" },
  inventory_mismatch:     { impact: "medium", engine: "commerce",   icon: "🔄",   action_label: "Review Inventory",         action_link: "/products" },
  customer_followup:      { impact: "medium", engine: "customers",  icon: "💬",   action_label: "Send Follow-up",           action_link: "/customers" },
};

// ═══════════════════════════════════════════════════════════════════════
// OPPORTUNITY DETECTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Map an event to an opportunity metadata object.
 * @param {object} payload — the event payload from emit()
 * @returns {object|null}
 */
function mapToOpportunity(payload) {
  const meta = EVENT_META[payload.event_type];
  if (!meta) {
    console.log(`[opportunity-bridge] Unknown event type: ${payload.event_type} — skipping`);
    return null;
  }

  return {
    businessId: payload.businessId,
    source: payload.source || "novi",
    sourceEventType: payload.event_type,
    eventType: payload.event_type,
    engine: meta.engine,
    icon: meta.icon,
    title: payload.title || `Opportunity: ${payload.event_type}`,
    description: payload.description || null,
    impact: meta.impact,
    effort: "medium",
    confidence: 0.75,
    explanation: payload.description || null,
    actionType: "navigate",
    actionLabel: meta.action_label,
    actionLink: meta.action_link || null,
    noviAssistPrompt: payload.description ? `Help me with: ${payload.description}` : null,
    status: "active",
  };
}

/**
 * Handle an "opportunity.detected" event by upserting into the opportunities table.
 */
function handleOpportunityDetected(payload) {
  if (!payload || !payload.businessId) {
    console.log("[opportunity-bridge] Received event without businessId — skipping");
    return;
  }

  const opp = mapToOpportunity(payload);
  if (!opp) return;

  try {
    const id = store.upsertOpportunity(db, opp);
    console.log(`[opportunity-bridge] Upserted opportunity ${id}: ${opp.sourceEventType} — "${opp.title}" for business ${opp.businessId}`);
  } catch (err) {
    console.error("[opportunity-bridge] Failed to upsert opportunity:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// RUN ALL DETECTORS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Run all detectors for a given business and merge results into the table.
 * @param {import("bun:sqlite").Database} database
 * @param {number} businessId
 * @returns {{ novi: number, oppCenter: number, reactivated: number }}
 */
export async function runAllDetectors(database, businessId) {
  console.log(`[opportunity-bridge] Running all detectors for business ${businessId}...`);
  let noviCount = 0;
  let oppCenterCount = 0;

  // 1. Re-activate snoozed opportunities whose time has passed
  const reactivated = store.reactivateSnoozedOpportunities(database, businessId);
  if (reactivated > 0) {
    console.log(`[opportunity-bridge] Reactivated ${reactivated} snoozed opportunities`);
  }

  // 2. Run Novi detection rules
  try {
    const results = runAllChecks(database, businessId);
    noviCount = results.reduce((sum, r) => sum + (r.created || 0), 0);
    console.log(`[opportunity-bridge] Novi checks: ${noviCount} messages created`);
  } catch (err) {
    console.error("[opportunity-bridge] Novi detection error:", err.message);
  }

  // 3. Run Opportunity Center categories and upsert into table
  try {
    const result = detectOpportunities(database, businessId);
    for (const opp of result.opportunities) {
      try {
        store.upsertOpportunity(database, {
          businessId,
          source: "opportunity-center",
          sourceEventType: opp.type,
          eventType: opp.type,
          engine: opp.engine || "system",
          icon: opp.icon || "💡",
          title: opp.title,
          description: opp.description,
          impact: opp.impact || "medium",
          effort: opp.effort || "medium",
          potentialValue: opp.potentialValue || opp.potential_value,
          confidence: opp.confidence ?? 0.5,
          explanation: opp.explanation,
          citedData: opp.cited_data || opp.citedData,
          actionType: "navigate",
          actionLabel: opp.actionLabel || opp.action_label,
          actionLink: opp.action || opp.action_link,
          status: "active",
        });
        oppCenterCount++;
      } catch (err) {
        console.error(`[opportunity-bridge] Failed to upsert opp-center opp "${opp.title}":`, err.message);
      }
    }
    console.log(`[opportunity-bridge] Opportunity Center: ${oppCenterCount} upserted`);
  } catch (err) {
    console.error("[opportunity-bridge] Opportunity Center detection error:", err.message);
  }

  return { novi: noviCount, oppCenter: oppCenterCount, reactivated };
}

// ═══════════════════════════════════════════════════════════════════════
// SUBSCRIBER SETUP
// ═══════════════════════════════════════════════════════════════════════

let db = null;

/**
 * Initialize the opportunity bridge. Subscribes to the event bus.
 * @param {import("bun:sqlite").Database} database — the app's DB instance
 */
export function initOpportunityBridge(database) {
  db = database;
  console.log("[opportunity-bridge] Initializing bridge...");

  // Subscribe to opportunity.detected events from Novi detection
  on("opportunity.detected", handleOpportunityDetected);

  console.log("[opportunity-bridge] Bridge initialized — listening for opportunity.detected events");

  return () => {
    off("opportunity.detected", handleOpportunityDetected);
  };
}
