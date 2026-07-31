/**
 * P0.3 — Apply all session multi-tenancy changes
 * ===============================================
 * 1. Run DB migration (add business_id to sessions)
 * 2. Patch store.js (createSession, getSessionByToken)
 * 3. Patch index.js (login + register createSession calls)
 * 
 * Run: bun run server/migrations/p0.3-apply-all.js
 */
import { Database } from "bun:sqlite";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";

const SITE_DIR = resolve(import.meta.dirname, "..");
const DB_PATH = resolve(SITE_DIR, "shimmerstock.db");
const STORE_PATH = resolve(SITE_DIR, "server", "store.js");
const INDEX_PATH = resolve(SITE_DIR, "server", "index.js");
const AUTH_PATH = resolve(SITE_DIR, "server", "auth.js");
const DBJS_PATH = resolve(SITE_DIR, "server", "db.js");

let changes = 0;
let errors = 0;

function patchFile(filePath, label, replacements) {
  console.log(`\n── ${label} ──`);
  let content = readFileSync(filePath, "utf8");
  let modified = false;
  for (const [oldStr, newStr] of replacements) {
    if (content.includes(newStr)) {
      console.log(`  ✓ Already applied: ${oldStr.substring(0, 50)}...`);
      continue;
    }
    if (!content.includes(oldStr)) {
      console.log(`  ⚠ Could not find pattern: ${oldStr.substring(0, 60)}...`);
      errors++;
      continue;
    }
    content = content.replace(oldStr, newStr);
    console.log(`  ✓ Applied: ${oldStr.substring(0, 50)}...`);
    modified = true;
    changes++;
  }
  if (modified) {
    writeFileSync(filePath, content, "utf8");
    console.log(`  ✓ Wrote ${filePath}`);
  }
  return modified;
}

// ═══════════════════════════════════════════════════════════════
// 1. Database migration
// ═══════════════════════════════════════════════════════════════
console.log("═══ P0.3 Session Multi-Tenancy Migration ═══\n");

const db = new Database(DB_PATH);
db.run("PRAGMA foreign_keys=ON");

const cols = db.query("PRAGMA table_info(sessions)").all();
const hasBusinessId = cols.some(c => c.name === "business_id");

if (!hasBusinessId) {
  console.log("1. Adding business_id column to sessions...");
  db.run("ALTER TABLE sessions ADD COLUMN business_id INTEGER REFERENCES businesses(id)");
  const verify = db.query("PRAGMA table_info(sessions)").all();
  if (verify.some(c => c.name === "business_id")) {
    console.log("   ✅ business_id column added");
    changes++;
  } else {
    console.log("   ❌ FAILED");
    errors++;
  }
} else {
  console.log("1. ✅ business_id column already exists on sessions");
  changes++;
}

const totalSessions = db.query("SELECT COUNT(*) as count FROM sessions").get().count;
const nullBiz = db.query("SELECT COUNT(*) as count FROM sessions WHERE business_id IS NULL").get().count;
console.log(`   ${totalSessions} sessions, ${nullBiz} with NULL business_id (legacy)`);
db.close();

// ═══════════════════════════════════════════════════════════════
// 2. Patch db.js — add migration logic to initDb
// ═══════════════════════════════════════════════════════════════
patchFile(DBJS_PATH, "db.js — sessions migration", [
  [
    // Add business_id to CREATE TABLE
    `  db.run(\`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  \`);`,
    `  db.run(\`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      business_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  \`);

  // P0.3: Migration — add business_id to sessions for multi-tenancy
  const sessCols = db.query("PRAGMA table_info(sessions)").all();
  if (!sessCols.some(c => c.name === "business_id")) {
    db.run("ALTER TABLE sessions ADD COLUMN business_id INTEGER REFERENCES businesses(id)");
    console.log("P0.3: Added business_id column to sessions (multi-tenancy)");
  }`
  ]
]);

// ═══════════════════════════════════════════════════════════════
// 3. Patch store.js
// ═══════════════════════════════════════════════════════════════
patchFile(STORE_PATH, "store.js — createSession + getSessionByToken", [
  // createSession — add businessId parameter
  [
    `export function createSession(db, { userId, token, expiresAt }) {
  const result = db.run(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
    [userId, token, expiresAt]
  );`,
    `export function createSession(db, { userId, token, expiresAt, businessId }) {
  const result = db.run(
    "INSERT INTO sessions (user_id, token, expires_at, business_id) VALUES (?, ?, ?, ?)",
    [userId, token, expiresAt, businessId ?? null]
  );`
  ],
  // getSessionByToken — use s.business_id with LEFT JOIN fallback
  [
    `      \`SELECT s.id, s.user_id, s.token, s.expires_at,
              u.username, u.display_name, u.role,
              ub.business_id, ub.role as business_role
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN user_businesses ub ON u.id = ub.user_id AND ub.is_active = 1
       WHERE s.token = ?\``,
    `      \`SELECT s.id, s.user_id, s.token, s.expires_at, s.business_id,
              u.username, u.display_name, u.role,
              COALESCE(s.business_id, ub.business_id) as effective_business_id,
              ub.role as business_role
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN user_businesses ub ON u.id = ub.user_id AND ub.is_active = 1
       WHERE s.token = ?\``
  ]
]);

// ═══════════════════════════════════════════════════════════════
// 4. Patch auth.js — requireAuth uses s.business_id
// ═══════════════════════════════════════════════════════════════
patchFile(AUTH_PATH, "auth.js — requireAuth business_id handling", [
  // Update the guard and business_id extraction to use the new column
  [
    `    // Guard: user must have an active business assignment via user_businesses
    if (session.business_id == null) {
      return res.status(500).json({ error: "User has no active business assignment" });
    }

    // Attach user info to request
    req.user = {
      id: session.user_id,
      username: session.username,
      display_name: session.display_name,
      role: session.role,
      business_id: session.business_id,
      business_role: session.business_role || session.role,
    };
    req.businessId = session.business_id;
    req.businessRole = session.business_role || session.role;
    req.sessionId = session.id;`,
    `    // P0.3: Use effective_business_id from session (set by getSessionByToken)
    // Falls back to business_id for legacy compatibility
    const effectiveBusinessId = session.effective_business_id ?? session.business_id;

    // Guard: user must have an active business assignment
    if (effectiveBusinessId == null) {
      return res.status(500).json({ error: "User has no active business assignment" });
    }

    // Attach user info to request
    req.user = {
      id: session.user_id,
      username: session.username,
      display_name: session.display_name,
      role: session.role,
      business_id: effectiveBusinessId,
      business_role: session.business_role || session.role,
    };
    req.businessId = effectiveBusinessId;
    req.businessRole = session.business_role || session.role;
    req.sessionId = session.id;`
  ]
]);

// ═══════════════════════════════════════════════════════════════
// 5. Patch index.js — login + register createSession calls
// ═══════════════════════════════════════════════════════════════
patchFile(INDEX_PATH, "index.js — login + register createSession", [
  // Login: determine business_id before creating session
  [
    `    // Create session (8 hour lifetime)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

    store.createSession(db, { userId: user.id, token, expiresAt });

    // Check if user needs to change password (password_changed_at is NULL)
    const mustChangePassword = user.password_changed_at === null;

    // Get all businesses for this user
    const businesses = store.getUserBusinesses(db, user.id);

    // Get active business
    const activeBiz = businesses.find(b => b.is_active) || businesses[0];`,
    `    // Get all businesses for this user
    const businesses = store.getUserBusinesses(db, user.id);

    // Get active business (determine before session creation for P0.3 multi-tenancy)
    const activeBiz = businesses.find(b => b.is_active) || businesses[0];
    const loginBusinessId = activeBiz ? activeBiz.business_id : user.business_id;

    // Create session (8 hour lifetime) — bound to business_id for multi-tenancy
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

    store.createSession(db, { userId: user.id, token, expiresAt, businessId: loginBusinessId });

    // Check if user needs to change password (password_changed_at is NULL)
    const mustChangePassword = user.password_changed_at === null;`
  ],
  // Register: add businessId
  [
    `      // Create session
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      store.createSession(db, { userId, token, expiresAt });`,
    `      // Create session — bound to business_id for multi-tenancy (P0.3)
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      store.createSession(db, { userId, token, expiresAt, businessId: business.id });`
  ]
]);

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════
console.log(`\n═══ P0.3 Summary ═══`);
console.log(`Changes applied: ${changes}`);
console.log(`Errors: ${errors}`);
console.log(errors === 0 ? "✅ All changes applied successfully" : "❌ Some changes failed — review output above");
