/**
 * P0.3 — Session Multi-Tenancy Migration
 * =======================================
 * Adds business_id column to sessions table.
 * Must be idempotent — safe to run multiple times.
 */
import { Database } from "bun:sqlite";

const DB_PATH = new URL("../../shimmerstock.db", import.meta.url).pathname;

const db = new Database(DB_PATH);
db.run("PRAGMA foreign_keys=ON");

// Check if business_id column already exists
const cols = db.query("PRAGMA table_info(sessions)").all();
const hasBusinessId = cols.some(c => c.name === "business_id");

if (!hasBusinessId) {
  console.log("P0.3: Adding business_id column to sessions...");
  db.run("ALTER TABLE sessions ADD COLUMN business_id INTEGER REFERENCES businesses(id)");
  
  // Verify
  const verify = db.query("PRAGMA table_info(sessions)").all();
  const added = verify.some(c => c.name === "business_id");
  console.log(added ? "P0.3: ✅ business_id column added to sessions" : "P0.3: ❌ FAILED to add business_id");
} else {
  console.log("P0.3: ✅ business_id column already exists on sessions");
}

// Show current state
const sessionCount = db.query("SELECT COUNT(*) as count FROM sessions").get().count;
const nullBizCount = db.query("SELECT COUNT(*) as count FROM sessions WHERE business_id IS NULL").get().count;
console.log(`P0.3: ${sessionCount} sessions total, ${nullBizCount} with NULL business_id (legacy)`);

db.close();
