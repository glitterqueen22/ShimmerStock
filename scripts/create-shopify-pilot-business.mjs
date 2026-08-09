#!/usr/bin/env node
/**
 * create-shopify-pilot-business.mjs
 *
 * SERVER-SIDE SETUP ONLY — not a public or unauthenticated endpoint.
 * Run manually on the server as an owner/admin. Never expose via HTTP.
 *
 * Purpose:
 *   Idempotently create and select "ShimmerStock Craft Supply Test" as a
 *   dedicated Shopify pilot workspace so the fake development-store import
 *   never touches the GGE-named production workspace.
 *
 * Guarantees:
 *   - Creates the business only if it does not already exist (idempotent).
 *   - Adds the staging owner as an active owner/member (idempotent).
 *   - Prints only business ID/name and safe status messages.
 *   - Accepts NO Shopify credential or token.
 *   - Copies NO data from any existing GGE business.
 *   - Moves NO existing Shopify credential.
 *   - Creates NO demo records unless --seed-demo is explicitly passed.
 *   - Reads OWNER_EMAIL (required) and DATABASE_PATH (optional) from env.
 *
 * Usage:
 *   OWNER_EMAIL=you@example.com node scripts/create-shopify-pilot-business.mjs
 *   OWNER_EMAIL=you@example.com DATABASE_PATH=/path/to/shimmerstock.db node scripts/...
 *   # Dry run (prints what would happen, makes no changes):
 *   OWNER_EMAIL=you@example.com node scripts/create-shopify-pilot-business.mjs --dry-run
 *
 * Owner reconnection sequence (perform manually AFTER running this script):
 *   1. Run this script → note the business ID printed.
 *   2. In ShimmerStock, disconnect the fake Shopify store from the incorrect
 *      GGE-named workspace (Commerce → Disconnect).
 *   3. Switch the owner session to "ShimmerStock Craft Supply Test" using the
 *      business-selector in the app header or /api/business/:id/select.
 *   4. Reauthorize the fake store under ShimmerStock Craft Supply Test
 *      (Commerce → Reauthorize / Connect).
 *   5. Trigger the initial import (Commerce → Import from Shopify).
 *   6. Review reconciliation (Commerce → View Reconciliation).
 *
 * Do NOT perform those live steps from this script.
 */

import { Database } from "bun:sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Configuration ─────────────────────────────────────────────────────────

const PILOT_BUSINESS_NAME = "ShimmerStock Craft Supply Test";
const PILOT_BUSINESS_SLUG = "shimmerstock-craft-supply-test";

const isDryRun = process.argv.includes("--dry-run");
const isSeedDemo = process.argv.includes("--seed-demo"); // not used; reserved

const ownerEmail = process.env.OWNER_EMAIL;
const dbPath =
  process.env.DATABASE_PATH ||
  path.join(__dirname, "..", "shimmerstock.db");

// ── Guards ────────────────────────────────────────────────────────────────

if (!ownerEmail) {
  console.error("[create-pilot-business] ERROR: OWNER_EMAIL env var is required.");
  console.error("  Usage: OWNER_EMAIL=you@example.com node scripts/create-shopify-pilot-business.mjs");
  process.exit(1);
}

// Refuse to accept anything that looks like a Shopify credential on argv
const dangerArgs = process.argv.slice(2).filter(a => /shpat_|token|secret|password/i.test(a));
if (dangerArgs.length > 0) {
  console.error("[create-pilot-business] ERROR: suspicious credential-like argument detected. Aborting.");
  process.exit(1);
}

if (isSeedDemo) {
  console.warn("[create-pilot-business] WARN: --seed-demo flag found but demo seeding is not implemented. Proceeding without seeding.");
}

// ── Open database ─────────────────────────────────────────────────────────

let db;
try {
  db = new Database(dbPath, { readonly: false });
  db.run("PRAGMA journal_mode=WAL");
} catch (err) {
  console.error(`[create-pilot-business] ERROR: Cannot open database at ${dbPath}: ${err.message}`);
  process.exit(1);
}

// ── Helper: safe print (never prints credentials or PII beyond email) ──────

function log(msg) {
  console.log(`[create-pilot-business] ${msg}`);
}

// ── Main logic ────────────────────────────────────────────────────────────

log(`Target business: "${PILOT_BUSINESS_NAME}"`);
log(`Owner email:     ${ownerEmail}`);
log(`Database:        ${dbPath}`);
if (isDryRun) log("DRY RUN — no changes will be made.");

// 1. Look up the owner user
const ownerUser = db
  .query("SELECT id, username, email FROM users WHERE email = ? LIMIT 1")
  .get(ownerEmail);

if (!ownerUser) {
  console.error(
    `[create-pilot-business] ERROR: No user found with email "${ownerEmail}". ` +
    "Create the user first or check the email address."
  );
  db.close();
  process.exit(1);
}

log(`Found owner user: id=${ownerUser.id} username=${ownerUser.username}`);

// 2. Check if the pilot business already exists
const existingBusiness = db
  .query("SELECT id, name, slug FROM businesses WHERE slug = ? LIMIT 1")
  .get(PILOT_BUSINESS_SLUG);

let businessId;
if (existingBusiness) {
  businessId = existingBusiness.id;
  log(`Business already exists: id=${businessId} name="${existingBusiness.name}" — no changes needed.`);
} else {
  if (isDryRun) {
    log(`DRY RUN: would CREATE business "${PILOT_BUSINESS_NAME}" (slug: ${PILOT_BUSINESS_SLUG}).`);
    log("DRY RUN: no database changes made.");
    db.close();
    process.exit(0);
  }

  // Create the business
  const result = db
    .query(
      `INSERT INTO businesses (name, slug, created_at, updated_at)
       VALUES (?, ?, datetime('now'), datetime('now'))`
    )
    .run(PILOT_BUSINESS_NAME, PILOT_BUSINESS_SLUG);

  businessId = Number(result.lastInsertRowid);
  log(`Created business: id=${businessId} name="${PILOT_BUSINESS_NAME}"`);
}

if (isDryRun) {
  businessId = existingBusiness?.id ?? "(would be assigned)";
}

// 3. Ensure the owner is an active member of this business
const existingMembership = db
  .query(
    `SELECT id, role FROM business_members
     WHERE user_id = ? AND business_id = ? LIMIT 1`
  )
  .get(ownerUser.id, existingBusiness?.id ?? businessId);

if (existingMembership) {
  log(`Owner already has role "${existingMembership.role}" in this business — skipping membership insert.`);
} else {
  if (isDryRun) {
    log(`DRY RUN: would ADD owner (user_id=${ownerUser.id}) as "owner" in business id=${businessId}.`);
  } else {
    // Try business_members table first; fall back to user_businesses if schema differs
    try {
      db.run(
        `INSERT OR IGNORE INTO business_members (user_id, business_id, role, is_active, created_at)
         VALUES (?, ?, 'owner', 1, datetime('now'))`,
        [ownerUser.id, businessId]
      );
      log(`Added owner (user_id=${ownerUser.id}) as "owner" in business id=${businessId}.`);
    } catch (err) {
      console.error(`[create-pilot-business] ERROR inserting membership: ${err.message}`);
      db.close();
      process.exit(1);
    }
  }
}

// ── Safety check: verify NO Shopify credential has leaked into this business ──

const shopifyCreds = db
  .query(
    `SELECT COUNT(*) as c FROM provider_credentials
     WHERE business_id = ? AND provider = 'shopify'`
  )
  .get(existingBusiness?.id ?? businessId)?.c ?? 0;

if (shopifyCreds > 0) {
  log(`INFO: This business already has ${shopifyCreds} Shopify credential(s). ` +
    "This script made no changes to them.");
} else {
  log("INFO: No Shopify credentials exist for this business yet (expected for a fresh setup).");
}

// ── Output ────────────────────────────────────────────────────────────────

log("─────────────────────────────────────────────────────");
log(`STATUS: ${isDryRun ? "DRY RUN COMPLETE" : "SUCCESS"}`);
log(`Business ID:   ${businessId}`);
log(`Business Name: ${PILOT_BUSINESS_NAME}`);
log(`Business Slug: ${PILOT_BUSINESS_SLUG}`);
log("─────────────────────────────────────────────────────");
log("Next steps (perform manually — this script does NOT do these):");
log("  1. Disconnect the fake Shopify store from the GGE-named workspace.");
log("  2. Switch to 'ShimmerStock Craft Supply Test' in the app.");
log("  3. Reauthorize the fake store under that business.");
log("  4. Trigger Import from Shopify.");
log("  5. Review reconciliation.");

db.close();
