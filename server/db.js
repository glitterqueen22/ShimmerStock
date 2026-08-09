import { Database } from "bun:sqlite";
import path from "path";

const DB_PATH = path.join(import.meta.dirname, "..", "shimmerstock.db");

/**
 * Default permission sets per role.
 * Adjust these to change what each role can do.
 */
const DEFAULT_PERMISSIONS = {
  owner: [
    "products.read", "products.write", "products.delete",
    "inventory.read", "inventory.write", "inventory.adjust",
    "orders.read", "orders.write", "orders.sync", "orders.fulfill",
    "users.read", "users.create", "users.edit", "users.delete",
    "settings.read", "settings.write",
    "shopify.read", "shopify.sync", "shopify.write_inventory", "shopify.write",
    "audit.read",
    "reports.read",
    "production.read", "production.write", "production.execute",
    "purchasing.read", "purchasing.write",
    "affiliates.read", "affiliates.write",
    "customers.read",
    "cs.inbox_read",
    "partners.read", "partners.write",
  ],
  admin: [
    "products.read", "products.write", "products.delete",
    "inventory.read", "inventory.write", "inventory.adjust",
    "orders.read", "orders.write", "orders.sync", "orders.fulfill",
    "users.read", "users.create", "users.edit",
    "settings.read", "settings.write",
    "shopify.read", "shopify.sync", "shopify.write_inventory", "shopify.write",
    "audit.read",
    "reports.read",
    "production.read", "production.write", "production.execute",
    "purchasing.read", "purchasing.write",
    "affiliates.read", "affiliates.write",
    "customers.read",
    "cs.inbox_read",
    "partners.read", "partners.write",
  ],
  manager: [
    "products.read", "products.write",
    "inventory.read", "inventory.write", "inventory.adjust",
    "orders.read", "orders.write", "orders.sync", "orders.fulfill",
    "users.read",
    "settings.read",
    "shopify.read", "shopify.sync", "shopify.write_inventory", "shopify.write",
    "audit.read",
    "reports.read",
    "production.read", "production.write", "production.execute",
    "purchasing.read", "purchasing.write",
    "affiliates.read",
    "customers.read",
    "cs.inbox_read",
    "partners.read",
  ],
  warehouse: [
    "products.read",
    "inventory.read", "inventory.write",
    "orders.read", "orders.fulfill",
    "production.read",
    "purchasing.read",
  ],
  manufacturing: [
    "products.read",
    "inventory.read", "inventory.write",
    "orders.read",
    "production.read", "production.write", "production.execute",
    "purchasing.read", "purchasing.write",
  ],
  customer_service: [
    "orders.read",
    "products.read",
    "users.read",
    "reports.read",
    "customers.read",
    "cs.inbox_read",
  ],
  viewer: [
    "products.read",
    "inventory.read",
    "orders.read",
    "reports.read",
  ],
  marketing: [
    "products.read",
    "orders.read",
    "reports.read",
    "affiliates.read",
  ],
  affiliate_manager: [
    "products.read",
    "orders.read",
    "reports.read",
    "users.read",
    "affiliates.read", "affiliates.write",
    "partners.read", "partners.write",
  ],
};

/**
 * Known placeholder / default passwords that must be rejected for bootstrap accounts.
 */
const KNOWN_PLACEHOLDER_PASSWORDS = new Set([
  "admin", "password", "password123", "changeme", "change-me", "change_me",
  "secret", "123456", "admin123", "owner", "initial", "bootstrap",
  "changeme!", "change_me!", "replace_me", "default",
]);

/**
 * Minimum length enforced for bootstrap credentials (matches change-password policy).
 */
const BOOTSTRAP_PASSWORD_MIN_LENGTH = 12;

/**
 * Validate a bootstrap credential supplied through an environment variable.
 *
 * Throws a configuration error (without exposing the value) if the credential
 * is absent, empty, matches a known placeholder, or is too short.
 * Never generates a fallback password — callers must provide a valid value.
 */
function validateBootstrapCredential(envVarName, value) {
  if (typeof value !== "string") {
    throw new Error(
      `Bootstrap configuration error: ${envVarName} is required to create the initial seeded account but is not set. ` +
      `Set a strong, unique password in the ${envVarName} environment variable before starting the server on a fresh database.`
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    throw new Error(
      `Bootstrap configuration error: ${envVarName} is required to create the initial seeded account but is not set. ` +
      `Set a strong, unique password in the ${envVarName} environment variable before starting the server on a fresh database.`
    );
  }

  if (normalizedValue !== value) {
    throw new Error(
      `Bootstrap configuration error: ${envVarName} cannot contain leading or trailing whitespace. ` +
      `Set the exact credential value without surrounding spaces.`
    );
  }

  const normalizedLower = normalizedValue.toLowerCase();

  if (
    KNOWN_PLACEHOLDER_PASSWORDS.has(normalizedLower)
  ) {
    throw new Error(
      `Bootstrap configuration error: ${envVarName} is set to a known placeholder value. ` +
      `Replace it with a unique, strong password before starting the server.`
    );
  }

  if (normalizedValue.length < BOOTSTRAP_PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Bootstrap configuration error: ${envVarName} must be at least ${BOOTSTRAP_PASSWORD_MIN_LENGTH} characters. ` +
      `Set a stronger password in the ${envVarName} environment variable.`
    );
  }

  return normalizedValue;
}

/**
 * Safe, idempotent table-rebuild migration: converts global sku/barcode UNIQUE
 * constraints on the products table to tenant-scoped indexes.
 *
 * - Detects whether the existing table has inline UNIQUE on sku or barcode.
 * - If not needed, returns immediately (safe to call multiple times).
 * - Preserves every column (including later-added columns), every row, all IDs,
 *   all Shopify metadata, and all business_id values.
 * - Verifies row counts before/after; throws and rolls back on mismatch.
 * - Runs inside a transaction. Disables FK enforcement during the rebuild only.
 */
export function rebuildProductsForTenantScoping(db) {
  const createRow = db.query(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='products'"
  ).get();
  const tableSql = createRow?.sql || "";
  const hasGlobalSku = /\bsku\s+TEXT\s+UNIQUE\b/i.test(tableSql);
  const hasGlobalBarcode = /\bbarcode\s+TEXT\s+UNIQUE\b/i.test(tableSql);

  if (!hasGlobalSku && !hasGlobalBarcode) {
    return; // Already tenant-scoped or fresh schema — nothing to do
  }

  // Discover all current columns dynamically so no data is lost.
  const cols = db.query("PRAGMA table_info(products)").all();
  const colNames = cols.map(c => c.name).join(", ");

  // Columns whose DDL we explicitly declare in the rebuilt table.
  const knownCols = new Set([
    "id", "name", "sku", "barcode", "stock_count",
    "created_at", "updated_at",
    "business_id", "shopify_product_id", "shopify_status", "shopify_imported_at",
  ]);
  // Any extra columns added by future migrations are appended as-is.
  const extraCols = cols.filter(c => !knownCols.has(c.name));

  const before = db.query("SELECT COUNT(*) as c FROM products").get().c;

  // PRAGMA foreign_keys must be changed outside a transaction in SQLite.
  db.run("PRAGMA foreign_keys=OFF");
  db.run("BEGIN IMMEDIATE");
  try {
    db.run(`
      CREATE TABLE products_rebuilt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        barcode TEXT,
        stock_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        business_id INTEGER REFERENCES businesses(id),
        shopify_product_id TEXT,
        shopify_status TEXT,
        shopify_imported_at TEXT${extraCols.map(c => `,\n        ${c.name} ${c.type || "TEXT"}`).join("")}
      )
    `);

    db.run(`INSERT INTO products_rebuilt (${colNames}) SELECT ${colNames} FROM products`);

    const after = db.query("SELECT COUNT(*) as c FROM products_rebuilt").get().c;
    if (after !== before) {
      throw new Error(
        `Products tenant-scoping migration: row count mismatch — ` +
        `before=${before} after=${after}. Rolling back.`
      );
    }

    db.run("DROP TABLE products");
    db.run("ALTER TABLE products_rebuilt RENAME TO products");
    db.run("COMMIT");
    console.log(
      `Rebuilt products table: removed global sku/barcode UNIQUE constraints ` +
      `(${after} rows preserved, IDs intact)`
    );
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  } finally {
    db.run("PRAGMA foreign_keys=ON");
  }
}

export function rebuildProductVariantsForShopifyIdentity(db) {
  const columns = db.query("PRAGMA table_info(product_variants)").all();
  if (columns.length === 0) return;

  const skuColumn = columns.find(column => column.name === "sku");
  const hasUniqueSkuIndex = Boolean(db.query(
    "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_variants_sku'"
  ).get());
  if (!skuColumn?.notnull && !hasUniqueSkuIndex) return;

  const columnNames = columns.map(column => column.name).join(", ");
  const extraColumns = columns.filter(column => ![
    "id", "product_id", "business_id", "sku", "barcode", "variant_type",
    "variant_value", "price", "cost", "stock_count", "weight_oz", "is_active",
    "created_at", "updated_at", "shopify_variant_id", "shopify_inventory_item_id",
  ].includes(column.name));
  const before = db.query("SELECT COUNT(*) AS count FROM product_variants").get().count;

  db.run("PRAGMA foreign_keys=OFF");
  db.run("BEGIN IMMEDIATE");
  try {
    db.run(`
      CREATE TABLE product_variants_rebuilt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id),
        business_id INTEGER NOT NULL REFERENCES businesses(id),
        sku TEXT,
        barcode TEXT,
        variant_type TEXT NOT NULL,
        variant_value TEXT NOT NULL,
        price REAL,
        cost REAL,
        stock_count INTEGER NOT NULL DEFAULT 0,
        weight_oz REAL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        shopify_variant_id TEXT,
        shopify_inventory_item_id TEXT${extraColumns.map(column =>
          `,\n        ${column.name} ${column.type || "TEXT"}${column.notnull ? " NOT NULL" : ""}${column.dflt_value !== null ? ` DEFAULT ${column.dflt_value}` : ""}`
        ).join("")}
      )
    `);
    db.run(`INSERT INTO product_variants_rebuilt (${columnNames}) SELECT ${columnNames} FROM product_variants`);

    const after = db.query("SELECT COUNT(*) AS count FROM product_variants_rebuilt").get().count;
    if (after !== before) {
      throw new Error(`Product variant migration row count mismatch: before=${before} after=${after}`);
    }

    db.run("DROP TABLE product_variants");
    db.run("ALTER TABLE product_variants_rebuilt RENAME TO product_variants");
    db.run("COMMIT");
    console.log(`Rebuilt product_variants for Shopify identity (${after} rows preserved)`);
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  } finally {
    db.run("PRAGMA foreign_keys=ON");
  }
}

export function initDb(dbPath) {
  const db = new Database(dbPath || DB_PATH);

  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA foreign_keys=ON");

  // ── Businesses table (multi-tenant foundation) ────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Products ──────────────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      barcode TEXT,
      stock_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration: add Shopify external ID columns to products
  {
    const prodCols = db.query("PRAGMA table_info(products)").all();
    // business_id must be added BEFORE the tenant-scoped index that references it.
    if (!prodCols.some(c => c.name === "business_id")) {
      db.run("ALTER TABLE products ADD COLUMN business_id INTEGER REFERENCES businesses(id)");
      db.run("UPDATE products SET business_id = 1 WHERE business_id IS NULL");
      console.log("Added business_id column to products");
    }
    if (!prodCols.some(c => c.name === "shopify_product_id")) {
      db.run("ALTER TABLE products ADD COLUMN shopify_product_id TEXT");
      // Tenant-scoped unique index: two different businesses may have the same Shopify product ID.
      // Drop the old global index if it exists (from pre-tenant-aware migrations).
      db.run("DROP INDEX IF EXISTS idx_products_shopify_id");
      db.run(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_biz_shopify_id " +
        "ON products(business_id, shopify_product_id) WHERE shopify_product_id IS NOT NULL"
      );
      console.log("Added shopify_product_id column to products");
    } else {
      // Upgrade existing global index to tenant-scoped if not already done.
      const hasOldGlobal = db
        .query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_products_shopify_id'")
        .get();
      const hasTenantIndex = db
        .query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_products_biz_shopify_id'")
        .get();
      if (hasOldGlobal && !hasTenantIndex) {
        db.run("DROP INDEX IF EXISTS idx_products_shopify_id");
        db.run(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_biz_shopify_id " +
          "ON products(business_id, shopify_product_id) WHERE shopify_product_id IS NOT NULL"
        );
        console.log("Upgraded products Shopify ID index to tenant-scoped");
      } else if (!hasTenantIndex) {
        db.run(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_biz_shopify_id " +
          "ON products(business_id, shopify_product_id) WHERE shopify_product_id IS NOT NULL"
        );
      }
    }
    if (!prodCols.some(c => c.name === "shopify_status")) {
      db.run("ALTER TABLE products ADD COLUMN shopify_status TEXT");
      console.log("Added shopify_status column to products");
    }
    if (!prodCols.some(c => c.name === "shopify_imported_at")) {
      db.run("ALTER TABLE products ADD COLUMN shopify_imported_at TEXT");
      console.log("Added shopify_imported_at column to products");
    }
  }

  // Migration: replace global sku/barcode UNIQUE constraints with tenant-scoped indexes.
  // Safe to call on every startup — returns immediately if already done.
  rebuildProductsForTenantScoping(db);

  // Tenant-scoped unique indexes for products (idempotent — IF NOT EXISTS).
  db.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_biz_sku " +
    "ON products(business_id, sku)"
  );
  db.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_biz_barcode " +
    "ON products(business_id, barcode) WHERE barcode IS NOT NULL"
  );

  // ── Product Variants ────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      sku TEXT,
      barcode TEXT,
      variant_type TEXT NOT NULL,
      variant_value TEXT NOT NULL,
      price REAL,
      cost REAL,
      stock_count INTEGER NOT NULL DEFAULT 0,
      weight_oz REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_variants_business ON product_variants(business_id)`);

  // Migration: add product_variants table to existing databases
  const variantCols = db.query("PRAGMA table_info(product_variants)").all();
  // If the table was created by a previous run without business_id, add it
  // (Table was just created with business_id, but check for legacy)
  if (variantCols.length > 0 && !variantCols.some(c => c.name === "business_id")) {
    db.run("ALTER TABLE product_variants ADD COLUMN business_id INTEGER REFERENCES businesses(id)");
    db.run("UPDATE product_variants SET business_id = 1 WHERE business_id IS NULL");
    console.log("Added business_id column to product_variants");
  }
  // Migration: add Shopify external ID columns to product_variants
  if (!variantCols.some(c => c.name === "shopify_variant_id")) {
    db.run("ALTER TABLE product_variants ADD COLUMN shopify_variant_id TEXT");
    // Tenant-scoped unique index.
    db.run("DROP INDEX IF EXISTS idx_variants_shopify_id");
    db.run(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_biz_shopify_id " +
      "ON product_variants(business_id, shopify_variant_id) WHERE shopify_variant_id IS NOT NULL"
    );
    console.log("Added shopify_variant_id column to product_variants");
  } else {
    // Upgrade existing global index to tenant-scoped if not already done.
    const hasOldGlobal = db
      .query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_variants_shopify_id'")
      .get();
    const hasTenantIndex = db
      .query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_variants_biz_shopify_id'")
      .get();
    if (hasOldGlobal && !hasTenantIndex) {
      db.run("DROP INDEX IF EXISTS idx_variants_shopify_id");
      db.run(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_biz_shopify_id " +
        "ON product_variants(business_id, shopify_variant_id) WHERE shopify_variant_id IS NOT NULL"
      );
      console.log("Upgraded product_variants Shopify ID index to tenant-scoped");
    } else if (!hasTenantIndex) {
      db.run(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_biz_shopify_id " +
        "ON product_variants(business_id, shopify_variant_id) WHERE shopify_variant_id IS NOT NULL"
      );
    }
  }
  if (!variantCols.some(c => c.name === "shopify_inventory_item_id")) {
    db.run("ALTER TABLE product_variants ADD COLUMN shopify_inventory_item_id TEXT");
    console.log("Added shopify_inventory_item_id column to product_variants");
  }
  if (!variantCols.some(c => c.name === "shopify_sku")) {
    db.run("ALTER TABLE product_variants ADD COLUMN shopify_sku TEXT");
    console.log("Added shopify_sku column to product_variants");
  }
  if (!variantCols.some(c => c.name === "shopify_barcode")) {
    db.run("ALTER TABLE product_variants ADD COLUMN shopify_barcode TEXT");
    console.log("Added shopify_barcode column to product_variants");
  }
  if (!variantCols.some(c => c.name === "inventory_tracked")) {
    db.run("ALTER TABLE product_variants ADD COLUMN inventory_tracked INTEGER");
    console.log("Added inventory_tracked column to product_variants");
  }

  rebuildProductVariantsForShopifyIdentity(db);
  db.run(`CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_variants_business ON product_variants(business_id)`);
  db.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_biz_shopify_id " +
    "ON product_variants(business_id, shopify_variant_id) WHERE shopify_variant_id IS NOT NULL"
  );

  console.log("Product variants table ready");

  // ── Users & sessions tables ──────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── User-businesses junction table (multi-business support) ──────

  db.run(`
    CREATE TABLE IF NOT EXISTS user_businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      UNIQUE(user_id, business_id)
    )
  `);

  db.run(`
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
  `);

  // P0.3: Migration — add business_id to sessions for multi-tenancy
  const sessCols = db.query("PRAGMA table_info(sessions)").all();
  if (!sessCols.some(c => c.name === "business_id")) {
    db.run("ALTER TABLE sessions ADD COLUMN business_id INTEGER REFERENCES businesses(id)");
    console.log("P0.3: Added business_id column to sessions (multi-tenancy)");
  }

  // ── Password reset tokens ────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ── Role permissions ─────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      permission TEXT NOT NULL,
      UNIQUE(role, permission)
    )
  `);

  // ── Seed default role permissions ────────────────────────────────

  const permCount = db.query("SELECT COUNT(*) as count FROM role_permissions").get();
  if (permCount.count === 0) {
    const insertPerm = db.prepare(
      "INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)"
    );
    for (const [role, perms] of Object.entries(DEFAULT_PERMISSIONS)) {
      for (const perm of perms) {
        insertPerm.run(role, perm);
      }
    }
    console.log("Seeded default role permissions for", Object.keys(DEFAULT_PERMISSIONS).length, "roles");
  }

  // ── Migration: backfill user_businesses from users.business_id ────

  const userCols = db.query("PRAGMA table_info(users)").all();
  const hasBusinessId = userCols.some((c) => c.name === "business_id");
  if (hasBusinessId) {
    const ubCount = db.query("SELECT COUNT(*) as count FROM user_businesses").get();
    if (ubCount.count === 0) {
      // Backfill: for each user with a business_id, create a user_businesses row
      const usersWithBiz = db.query(
        "SELECT id, role, business_id FROM users WHERE business_id IS NOT NULL"
      ).all();
      const insertUb = db.prepare(
        "INSERT OR IGNORE INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, ?, ?, 1)"
      );
      for (const u of usersWithBiz) {
        insertUb.run(u.id, u.business_id, u.role || 'owner');
      }
      console.log(`Backfilled ${usersWithBiz.length} users into user_businesses junction table`);
    }
  }

  // ── Add password_changed_at to users (migration) ─────────────────

  if (!userCols.some((c) => c.name === "password_changed_at")) {
    db.run("ALTER TABLE users ADD COLUMN password_changed_at TEXT");
    console.log("Added password_changed_at column to users");
  }

  // ── Migrate inventory_movements to support 'order' type ──────────
  // SQLite doesn't support ALTER CONSTRAINT, so we recreate the table.
  const oldConstraint = db
    .query(`SELECT sql FROM sqlite_master WHERE type='table' AND name='inventory_movements'`)
    .get();

  if (oldConstraint && !oldConstraint.sql.includes("'order'")) {
    // Recreate with expanded CHECK
    db.run("ALTER TABLE inventory_movements RENAME TO inventory_movements_old");

    db.run(`
      CREATE TABLE inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        type TEXT CHECK(type IN ('in', 'out', 'order')) NOT NULL,
        quantity INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        user_id INTEGER,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Copy existing data
    db.run(`
      INSERT INTO inventory_movements (id, product_id, type, quantity, created_at)
      SELECT id, product_id, type, quantity, created_at FROM inventory_movements_old
    `);

    db.run("DROP TABLE inventory_movements_old");
    console.log("Migrated inventory_movements: added 'order' type support");
  } else if (!oldConstraint) {
    // Fresh install
    db.run(`
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        type TEXT CHECK(type IN ('in', 'out', 'order')) NOT NULL,
        quantity INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        user_id INTEGER,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
  }

  // Add user_id to existing inventory_movements (if column missing)
  const movCols = db.query("PRAGMA table_info(inventory_movements)").all();
  if (!movCols.some((c) => c.name === "user_id")) {
    db.run("ALTER TABLE inventory_movements ADD COLUMN user_id INTEGER REFERENCES users(id)");
    console.log("Added user_id column to inventory_movements");
  }

  // ── Orders tables ────────────────────────────────────────────────

  // Check if orders table exists and needs migration (v3.1: manual orders support)
  const ordersCols = db.query("PRAGMA table_info(orders)").all();
  const ordersNeedsMigration = ordersCols.length > 0 && (
    !ordersCols.some(c => c.name === "source") ||
    !ordersCols.some(c => c.name === "business_id") ||
    ordersCols.some(c => c.name === "shopify_order_id" && c.notnull === 1)
  );

  if (ordersNeedsMigration) {
    console.log("Migrating orders table for manual orders support (v3.1)...");

    // Build the new schema (no column-level UNIQUE on shopify_order_id — use tenant-scoped index instead)
    db.run(`
      CREATE TABLE IF NOT EXISTS orders_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shopify_order_id TEXT,
        order_number INTEGER,
        customer_name TEXT,
        customer_email TEXT,
        shipping_address TEXT,
        source TEXT NOT NULL DEFAULT 'shopify',
        status TEXT DEFAULT 'pending',
        notes TEXT,
        total_amount REAL,
        created_by INTEGER REFERENCES users(id),
        business_id INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        imported_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Copy existing data
    const hasBizId = ordersCols.some(c => c.name === "business_id");
    db.run(`
      INSERT INTO orders_new (id, shopify_order_id, order_number, customer_name, source, status, created_at, imported_at, business_id)
      SELECT id, shopify_order_id, order_number, customer_name, 'shopify', status, created_at, imported_at,
        ${hasBizId ? "business_id" : "1"}
      FROM orders
    `);

    db.run("DROP TABLE orders");
    db.run("ALTER TABLE orders_new RENAME TO orders");
    console.log("  ✓ orders table migrated");
  } else if (ordersCols.length === 0) {
    // Fresh install — create with full schema (no global UNIQUE on shopify_order_id)
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shopify_order_id TEXT,
        order_number INTEGER,
        customer_name TEXT,
        customer_email TEXT,
        shipping_address TEXT,
        source TEXT NOT NULL DEFAULT 'shopify',
        status TEXT DEFAULT 'pending',
        notes TEXT,
        total_amount REAL,
        created_by INTEGER REFERENCES users(id),
        business_id INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        imported_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  // Ensure tenant-scoped unique index on orders.shopify_order_id.
  // Replaces any pre-existing global UNIQUE constraint (which prevents multi-tenant use).
  {
    // Detect if the orders table was created with a legacy global unique constraint.
    const ordersCreate = db
      .query("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'")
      .get()?.sql || "";
    const hasGlobalUnique = /shopify_order_id\s+TEXT\s+UNIQUE/i.test(ordersCreate);
    const hasTenantOrderIndex = db
      .query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_orders_biz_shopify_id'")
      .get();

    if (hasGlobalUnique && !hasTenantOrderIndex) {
      // Recreate orders table to remove the global UNIQUE column constraint.
      console.log("Migrating orders table: removing global shopify_order_id UNIQUE, adding tenant-scoped index...");
      const existingOrderColInfo = db.query("PRAGMA table_info(orders)").all();
      const existingOrderColNames = existingOrderColInfo.map(c => c.name);

      // Build a dynamic CREATE TABLE that preserves all existing columns.
      // Always include a safe base schema for known required columns,
      // then add any additional columns found in the live table.
      const baseColDefs = {
        id: "INTEGER PRIMARY KEY AUTOINCREMENT",
        shopify_order_id: "TEXT", // intentionally without UNIQUE
        order_number: "INTEGER",
        customer_name: "TEXT",
        customer_email: "TEXT",
        shipping_address: "TEXT",
        source: "TEXT NOT NULL DEFAULT 'shopify'",
        status: "TEXT DEFAULT 'pending'",
        notes: "TEXT",
        total_amount: "REAL",
        created_by: "INTEGER REFERENCES users(id)",
        business_id: "INTEGER NOT NULL DEFAULT 1",
        created_at: "TEXT DEFAULT (datetime('now'))",
        imported_at: "TEXT DEFAULT (datetime('now'))",
      };

      // Add any extra columns that exist in the live table but not in our base schema.
      const extraColDefs = [];
      for (const col of existingOrderColInfo) {
        if (!baseColDefs[col.name]) {
          const notNull = col.notnull ? " NOT NULL" : "";
          const dflt = col.dflt_value !== null ? ` DEFAULT ${col.dflt_value}` : "";
          extraColDefs.push(`${col.name} ${col.type}${notNull}${dflt}`);
        }
      }

      const allColDefs = [
        ...Object.entries(baseColDefs).map(([n, d]) => `${n} ${d}`),
        ...extraColDefs,
      ].join(",\n          ");

      db.run(`CREATE TABLE orders_tenant_migrate (\n          ${allColDefs}\n        )`);

      // Copy all columns that exist in both the old and new table.
      const selectCols = existingOrderColNames.join(", ");
      db.run(`INSERT INTO orders_tenant_migrate (${selectCols}) SELECT ${selectCols} FROM orders`);
      db.run("DROP TABLE orders");
      db.run("ALTER TABLE orders_tenant_migrate RENAME TO orders");
      console.log("  ✓ orders table re-created without global unique constraint");
    }

    if (!hasTenantOrderIndex) {
      db.run(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_biz_shopify_id " +
        "ON orders(business_id, shopify_order_id) WHERE shopify_order_id IS NOT NULL"
      );
      console.log("  ✓ Added tenant-scoped unique index for orders.shopify_order_id");
    }
  }

  // Migrate order_items: add variant_id, unit_price, line_total, business_id columns
  const oiCols = db.query("PRAGMA table_info(order_items)").all();
  const oiNeedsMigration = oiCols.length > 0 && (
    !oiCols.some(c => c.name === "variant_id") ||
    !oiCols.some(c => c.name === "unit_price") ||
    !oiCols.some(c => c.name === "line_total") ||
    !oiCols.some(c => c.name === "business_id")
  );

  if (oiNeedsMigration) {
    console.log("Migrating order_items table (v3.1)...");
    db.run(`
      CREATE TABLE IF NOT EXISTS order_items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        variant_id INTEGER REFERENCES product_variants(id),
        sku TEXT,
        variant_title TEXT,
        quantity INTEGER NOT NULL,
        unit_price REAL,
        line_total REAL,
        scanned_quantity INTEGER DEFAULT 0,
        business_id INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    const hasOiBizId = oiCols.some(c => c.name === "business_id");
    db.run(`
      INSERT INTO order_items_new (id, order_id, product_id, sku, variant_title, quantity, scanned_quantity, business_id)
      SELECT id, order_id, product_id, sku, variant_title, quantity, scanned_quantity,
        ${hasOiBizId ? "business_id" : "1"}
      FROM order_items
    `);

    db.run("DROP TABLE order_items");
    db.run("ALTER TABLE order_items_new RENAME TO order_items");
    console.log("  ✓ order_items table migrated");
  } else if (oiCols.length === 0) {
    db.run(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        variant_id INTEGER REFERENCES product_variants(id),
        sku TEXT,
        variant_title TEXT,
        quantity INTEGER NOT NULL,
        unit_price REAL,
        line_total REAL,
        scanned_quantity INTEGER DEFAULT 0,
        business_id INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);
  }

  // For tracking scan verification per order item
  db.run(`
    CREATE TABLE IF NOT EXISTS order_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER NOT NULL,
      product_id INTEGER,
      barcode TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      user_id INTEGER,
      business_id INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (order_item_id) REFERENCES order_items(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Add missing columns to order_scans (migration-safe)
  const scanCols = db.query("PRAGMA table_info(order_scans)").all();
  if (!scanCols.some((c) => c.name === "user_id")) {
    db.run("ALTER TABLE order_scans ADD COLUMN user_id INTEGER REFERENCES users(id)");
    console.log("Added user_id column to order_scans");
  }
  if (!scanCols.some((c) => c.name === "business_id")) {
    db.run("ALTER TABLE order_scans ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1");
    console.log("Added business_id column to order_scans");
  }

  // ── Shopify sync log (idempotency + audit trail) ──────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS shopify_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL,
      action TEXT NOT NULL,
      shopify_order_id TEXT,
      shopify_product_id TEXT,
      provider TEXT NOT NULL DEFAULT 'shopify',
      external_id TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      details TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  // Migration: add provider + external_id columns to existing shopify_sync_log
  const syncLogCols = db.query("PRAGMA table_info(shopify_sync_log)").all();
  if (!syncLogCols.some((c) => c.name === "provider")) {
    db.run("ALTER TABLE shopify_sync_log ADD COLUMN provider TEXT NOT NULL DEFAULT 'shopify'");
    console.log("Added provider column to shopify_sync_log");
  }
  if (!syncLogCols.some((c) => c.name === "external_id")) {
    db.run("ALTER TABLE shopify_sync_log ADD COLUMN external_id TEXT");
    // Backfill: set external_id from shopify_order_id or shopify_product_id
    db.run(
      "UPDATE shopify_sync_log SET external_id = COALESCE(shopify_order_id, shopify_product_id) WHERE external_id IS NULL"
    );
    console.log("Added external_id column to shopify_sync_log (backfilled)");
  }

  // Create index for fast idempotency lookups if not already present
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_log_idempotency
    ON shopify_sync_log(business_id, idempotency_key)
  `);

  // ── Audit log ──────────────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      user_id INTEGER,
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      previous_value TEXT,
      new_value TEXT,
      source TEXT DEFAULT 'manual',
      device_info TEXT,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Migration: add business_id to audit_log if the table existed from a prior attempt
  const auditCols = db.query("PRAGMA table_info(audit_log)").all();
  if (!auditCols.some((c) => c.name === "business_id")) {
    db.run("ALTER TABLE audit_log ADD COLUMN business_id INTEGER REFERENCES businesses(id)");
    // Backfill: set business_id = 1 for any existing rows
    db.run("UPDATE audit_log SET business_id = 1 WHERE business_id IS NULL");
    console.log("Added business_id column to audit_log");
  }
  if (!auditCols.some((c) => c.name === "user_id")) {
    db.run("ALTER TABLE audit_log ADD COLUMN user_id INTEGER REFERENCES users(id)");
    console.log("Added user_id column to audit_log");
  }

  // ── Migration: add business_id to all tables ─────────────────────

  const tablesNeedingBusinessId = [
    "users",
    "products",
    "orders",
    "inventory_movements",
    "order_items",
    "order_scans",
  ];

  for (const table of tablesNeedingBusinessId) {
    // Check if table exists first
    const tableExists = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);

    if (!tableExists) continue;

    const cols = db.query(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === "business_id")) {
      db.run(
        `ALTER TABLE ${table} ADD COLUMN business_id INTEGER REFERENCES businesses(id)`
      );
      console.log(`Added business_id column to ${table}`);
    }
  }

  // ── Seed default business & owner (on first run) ─────────────────

  const businessCount = db.query("SELECT COUNT(*) as count FROM businesses").get();
  if (businessCount.count === 0) {
    // Create default business
    db.run(
      "INSERT INTO businesses (name, slug) VALUES (?, ?)",
      ["Glitzy Glitter Express", "glitzy-glitter-express"]
    );

    // Create owner user (no business_id — uses user_businesses junction)
    const ownerPassword = validateBootstrapCredential(
      "OWNER_INITIAL_PASSWORD",
      process.env.OWNER_INITIAL_PASSWORD
    );
    const ownerHash = Bun.password.hashSync(ownerPassword);
    const ownerResult = db.run(
      "INSERT INTO users (username, password_hash, display_name, role, password_changed_at) VALUES (?, ?, ?, ?, datetime('now'))",
      ["owner", ownerHash, "Owner", "owner"]
    );
    const ownerId = ownerResult.lastInsertRowid;

    // Create user_businesses row for owner
    db.run(
      "INSERT INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, 1, 'owner', 1)",
      [ownerId]
    );

    // Migrate all existing records to business_id = 1
    for (const table of tablesNeedingBusinessId) {
      const tableExists = db
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      if (tableExists) {
        const result = db.run(
          `UPDATE ${table} SET business_id = 1 WHERE business_id IS NULL`
        );
        if (result.changes > 0) {
          console.log(`  Migrated ${result.changes} ${table} records to business_id=1`);
        }
      }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  🏢 Business 'Glitzy Glitter Express' created.");
    console.log("  🔐 Owner account created securely. Remove OWNER_INITIAL_PASSWORD from the environment after securing access.");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }

  // ── Seed admin user (only on first run) ─────────────────────────

  const existingUsers = db.query("SELECT COUNT(*) as count FROM users").get();
  if (existingUsers.count === 0) {
    const password = validateBootstrapCredential(
      "ADMIN_INITIAL_PASSWORD",
      process.env.ADMIN_INITIAL_PASSWORD
    );
    const hash = Bun.password.hashSync(password);
    // password_changed_at is left NULL so first login triggers mustChangePassword
    const adminResult = db.run(
      "INSERT INTO users (username, password_hash, display_name, role, password_changed_at) VALUES (?, ?, ?, ?, NULL)",
      ["admin", hash, "Admin", "admin"]
    );
    const adminId = adminResult.lastInsertRowid;

    // Create user_businesses row for admin
    db.run(
      "INSERT INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, 1, 'admin', 1)",
      [adminId]
    );

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  🔐 Admin account created securely. Remove ADMIN_INITIAL_PASSWORD from the environment after securing access.");
    console.log("  ⚠️  You will be prompted to change this password on first login!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } else {
    // Ensure admin user exists (for migration case: business created but admin user missing)
    const existingAdmin = db.query("SELECT id FROM users WHERE username = ?").get("admin");
    if (!existingAdmin) {
      const password = validateBootstrapCredential(
        "ADMIN_INITIAL_PASSWORD",
        process.env.ADMIN_INITIAL_PASSWORD
      );
      const hash = Bun.password.hashSync(password);
      const adminResult = db.run(
        "INSERT INTO users (username, password_hash, display_name, role, password_changed_at) VALUES (?, ?, ?, ?, datetime('now'))",
        ["admin", hash, "Admin", "admin"]
      );
      const adminId = adminResult.lastInsertRowid;

      // Create user_businesses row for admin
      db.run(
        "INSERT INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, 1, 'admin', 1)",
        [adminId]
      );

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("  🔐 Admin account created securely (migration). Remove ADMIN_INITIAL_PASSWORD from the environment after securing access.");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }

    // Backfill any existing users that don't have user_businesses rows yet
    const ubCount = db.query("SELECT COUNT(*) as count FROM user_businesses").get();
    if (ubCount.count === 0) {
      const allUsers = db.query("SELECT id, role, business_id FROM users WHERE business_id IS NOT NULL").all();
      for (const u of allUsers) {
        db.run(
          "INSERT OR IGNORE INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, ?, ?, 1)",
          [u.id, u.business_id, u.role || 'owner']
        );
      }
      if (allUsers.length > 0) {
        console.log(`Backfilled ${allUsers.length} existing users into user_businesses`);
      }
    }
  }

  // ── Production Engine tables ────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS boms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      output_product_id INTEGER NOT NULL,
      output_quantity REAL NOT NULL DEFAULT 1,
      output_unit TEXT DEFAULT 'unit',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (output_product_id) REFERENCES products(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bom_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bom_id INTEGER NOT NULL,
      input_product_id INTEGER NOT NULL,
      quantity_per_batch REAL NOT NULL,
      unit TEXT DEFAULT 'unit',
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (bom_id) REFERENCES boms(id),
      FOREIGN KEY (input_product_id) REFERENCES products(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS production_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      bom_id INTEGER NOT NULL,
      batch_size REAL NOT NULL DEFAULT 1,
      status TEXT DEFAULT 'draft',
      notes TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (bom_id) REFERENCES boms(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS batch_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      direction TEXT CHECK(direction IN ('consumed', 'produced')) NOT NULL,
      planned_quantity REAL NOT NULL,
      actual_quantity REAL NOT NULL,
      unit TEXT DEFAULT 'unit',
      FOREIGN KEY (batch_id) REFERENCES production_batches(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Migration: add business_id to existing production tables if missing
  const prodTables = ["boms", "production_batches"];
  for (const table of prodTables) {
    const tableExists = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!tableExists) continue;
    const cols = db.query(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === "business_id")) {
      db.run(`ALTER TABLE ${table} ADD COLUMN business_id INTEGER REFERENCES businesses(id)`);
      console.log(`Added business_id column to ${table}`);
    }
  }

  // ── V3.3: Migrate production_batches — add reserved_at, cancelled_at, cancelled_reason ──

  const batchCols = db.query("PRAGMA table_info(production_batches)").all();
  if (!batchCols.some(c => c.name === "reserved_at")) {
    db.run("ALTER TABLE production_batches ADD COLUMN reserved_at TEXT");
    console.log("Added reserved_at column to production_batches");
  }
  if (!batchCols.some(c => c.name === "cancelled_at")) {
    db.run("ALTER TABLE production_batches ADD COLUMN cancelled_at TEXT");
    console.log("Added cancelled_at column to production_batches");
  }
  if (!batchCols.some(c => c.name === "cancelled_reason")) {
    db.run("ALTER TABLE production_batches ADD COLUMN cancelled_reason TEXT");
    console.log("Added cancelled_reason column to production_batches");
  }

  // ── V3.3: inventory_reservations table ────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      batch_id INTEGER NOT NULL,
      product_id INTEGER,
      variant_id INTEGER,
      quantity_reserved REAL NOT NULL,
      status TEXT DEFAULT 'reserved',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (batch_id) REFERENCES production_batches(id)
    )
  `);
  console.log("V3.3: inventory_reservations table ready");

  // ── Migration: add production permissions to role_permissions ─────

  const productionPerms = ["production.read", "production.write", "production.execute"];
  const productionRoles = ["owner", "admin", "manager", "manufacturing"];
  for (const role of productionRoles) {
    for (const perm of productionPerms) {
      db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", [role, perm]);
    }
  }
  // Also add production.read to warehouse
  db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", ["warehouse", "production.read"]);

  // ── Calculation Engine: formulas table ─────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS formulas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'custom',
      template_id TEXT,
      inputs TEXT NOT NULL,
      output_expression TEXT NOT NULL,
      output_label TEXT NOT NULL,
      output_unit TEXT,
      is_public INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  // Migration: seed public template formulas if none exist
  const templateCount = db.query("SELECT COUNT(*) as count FROM formulas WHERE is_public = 1").get();
  if (templateCount.count === 0) {
    const templates = [
      {
        name: "Mold Pour Weight",
        description: "Calculate total weight needed for mold pours including waste factor.",
        category: "craft",
        templateId: "mold_pour_weight",
        inputs: JSON.stringify([
          { key: "volume", label: "Volume per mold", type: "number", unit: "oz", default: 4 },
          { key: "density", label: "Material density", type: "number", unit: "oz/fl_oz", default: 0.8 },
          { key: "molds", label: "Number of molds", type: "number", unit: "", default: 12 },
          { key: "waste", label: "Waste percentage", type: "number", unit: "%", default: 5 },
        ]),
        outputExpression: "(volume * density * molds) * (1 + waste/100)",
        outputLabel: "Total weight",
        outputUnit: "oz",
      },
      {
        name: "Wax Melt Batch",
        description: "Calculate total batch weight for wax melts including fragrance oil.",
        category: "craft",
        templateId: "wax_melt_batch",
        inputs: JSON.stringify([
          { key: "wax_weight", label: "Wax weight per unit", type: "number", unit: "oz", default: 3 },
          { key: "fragrance", label: "Fragrance oil ratio", type: "number", unit: "%", default: 10 },
          { key: "batch_count", label: "Units in batch", type: "number", unit: "", default: 50 },
        ]),
        outputExpression: "(wax_weight * (1 + fragrance/100)) * batch_count",
        outputLabel: "Total batch weight",
        outputUnit: "oz",
      },
      {
        name: "Fragrance Oil Calculator",
        description: "Calculate how much fragrance oil you need for a given wax weight.",
        category: "craft",
        templateId: "fragrance_oil_calc",
        inputs: JSON.stringify([
          { key: "wax_weight", label: "Wax weight", type: "number", unit: "oz", default: 16 },
          { key: "fragrance", label: "Fragrance oil ratio", type: "number", unit: "%", default: 10 },
        ]),
        outputExpression: "wax_weight * (fragrance / 100)",
        outputLabel: "Fragrance needed",
        outputUnit: "oz",
      },
      {
        name: "Cost Per Unit",
        description: "Calculate the cost per individual unit including materials, labor, and overhead.",
        category: "pricing",
        templateId: "cost_per_unit",
        inputs: JSON.stringify([
          { key: "material_cost", label: "Material cost", type: "number", unit: "$", default: 50 },
          { key: "labor", label: "Labor cost", type: "number", unit: "$", default: 30 },
          { key: "overhead", label: "Overhead cost", type: "number", unit: "$", default: 20 },
          { key: "units", label: "Total units", type: "number", unit: "", default: 100 },
        ]),
        outputExpression: "(material_cost + labor + overhead) / units",
        outputLabel: "Cost per unit",
        outputUnit: "$",
      },
      {
        name: "Bulk Breakdown",
        description: "Calculate how many units you can make from a bulk amount.",
        category: "production",
        templateId: "bulk_breakdown",
        inputs: JSON.stringify([
          { key: "total_weight", label: "Total material weight", type: "number", unit: "oz", default: 160 },
          { key: "unit_weight", label: "Weight per unit", type: "number", unit: "oz", default: 4 },
        ]),
        outputExpression: "total_weight / unit_weight",
        outputLabel: "Number of units",
        outputUnit: "",
      },
      {
        name: "Margin Calculator",
        description: "Calculate your profit margin as a percentage of the selling price.",
        category: "pricing",
        templateId: "margin_calculator",
        inputs: JSON.stringify([
          { key: "cost", label: "Total cost", type: "number", unit: "$", default: 8 },
          { key: "price", label: "Selling price", type: "number", unit: "$", default: 20 },
        ]),
        outputExpression: "((price - cost) / price) * 100",
        outputLabel: "Margin",
        outputUnit: "%",
      },
      {
        name: "Markup Price",
        description: "Calculate the selling price given a cost and desired markup percentage.",
        category: "pricing",
        templateId: "markup_price",
        inputs: JSON.stringify([
          { key: "cost", label: "Unit cost", type: "number", unit: "$", default: 10 },
          { key: "markup", label: "Markup percentage", type: "number", unit: "%", default: 50 },
        ]),
        outputExpression: "cost * (1 + markup/100)",
        outputLabel: "Selling price",
        outputUnit: "$",
      },
      {
        name: "Batch Water Calculator",
        description: "Calculate how much water to add based on total weight and water ratio.",
        category: "production",
        templateId: "batch_water_calc",
        inputs: JSON.stringify([
          { key: "total_weight", label: "Total batch weight", type: "number", unit: "oz", default: 100 },
          { key: "water_ratio", label: "Water ratio", type: "number", unit: "%", default: 30 },
        ]),
        outputExpression: "total_weight * (water_ratio / 100)",
        outputLabel: "Water needed",
        outputUnit: "oz",
      },
    ];

    const insertTemplate = db.prepare(`
      INSERT INTO formulas (business_id, name, description, category, template_id, inputs, output_expression, output_label, output_unit, is_public)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    for (const t of templates) {
      insertTemplate.run(t.name, t.description, t.category, t.templateId, t.inputs, t.outputExpression, t.outputLabel, t.outputUnit);
    }

    console.log(`Seeded ${templates.length} calculation templates`);
  }

  // ── Migration: add calculation permissions to role_permissions ─────

  const calcPerms = ["calculation.read", "calculation.execute"];
  const calcRoles = ["owner", "admin", "manager", "manufacturing", "warehouse"];
  for (const role of calcRoles) {
    for (const perm of calcPerms) {
      db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", [role, perm]);
    }
  }

  // ── Purchasing Engine tables ─────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      website TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS supplier_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      supplier_sku TEXT,
      unit_cost REAL,
      unit_type TEXT DEFAULT 'unit',
      min_order_qty REAL DEFAULT 1,
      quoted_lead_time_days INTEGER,
      is_preferred INTEGER DEFAULT 0,
      last_order_date TEXT,
      last_order_cost REAL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      UNIQUE(supplier_id, product_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      status TEXT DEFAULT 'draft',
      order_date TEXT,
      expected_delivery TEXT,
      received_date TEXT,
      actual_delivery_date TEXT,
      carrier TEXT,
      tracking_number TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS po_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL,
      total_cost REAL,
      received_quantity REAL DEFAULT 0,
      quantity_damaged REAL DEFAULT 0,
      quantity_backordered REAL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  db.run(`
      CREATE TABLE IF NOT EXISTS inventory_thresholds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL UNIQUE,
        reorder_point REAL NOT NULL,
        reorder_quantity REAL NOT NULL,
        unit_type TEXT DEFAULT 'unit',
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (business_id) REFERENCES businesses(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // ── V3.2: Migrate po_items (add damaged, backordered, notes) ─────

    const poItemCols = db.query("PRAGMA table_info(po_items)").all();
    if (!poItemCols.some(c => c.name === "quantity_damaged")) {
      db.run("ALTER TABLE po_items ADD COLUMN quantity_damaged REAL DEFAULT 0");
      console.log("Added quantity_damaged column to po_items");
    }
    if (!poItemCols.some(c => c.name === "quantity_backordered")) {
      db.run("ALTER TABLE po_items ADD COLUMN quantity_backordered REAL DEFAULT 0");
      console.log("Added quantity_backordered column to po_items");
    }
    if (!poItemCols.some(c => c.name === "notes")) {
      db.run("ALTER TABLE po_items ADD COLUMN notes TEXT");
      console.log("Added notes column to po_items");
    }

    // ── V3.2: Migrate purchase_orders (add actual_delivery, carrier, tracking) ──

    const poCols = db.query("PRAGMA table_info(purchase_orders)").all();
    if (!poCols.some(c => c.name === "actual_delivery_date")) {
      db.run("ALTER TABLE purchase_orders ADD COLUMN actual_delivery_date TEXT");
      console.log("Added actual_delivery_date column to purchase_orders");
    }
    if (!poCols.some(c => c.name === "carrier")) {
      db.run("ALTER TABLE purchase_orders ADD COLUMN carrier TEXT");
      console.log("Added carrier column to purchase_orders");
    }
    if (!poCols.some(c => c.name === "tracking_number")) {
      db.run("ALTER TABLE purchase_orders ADD COLUMN tracking_number TEXT");
      console.log("Added tracking_number column to purchase_orders");
    }

    // ── V3.2: receiving_events table ──────────────────────────────────

    db.run(`
      CREATE TABLE IF NOT EXISTS receiving_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        po_id INTEGER NOT NULL,
        po_item_id INTEGER,
        product_id INTEGER,
        variant_id INTEGER,
        quantity_received REAL DEFAULT 0,
        quantity_damaged REAL DEFAULT 0,
        quantity_backordered REAL DEFAULT 0,
        bin_location TEXT,
        notes TEXT,
        received_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (business_id) REFERENCES businesses(id),
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
      )
    `);

    // ── V3.2: supplier_notes table ────────────────────────────────────

    db.run(`
      CREATE TABLE IF NOT EXISTS supplier_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        po_id INTEGER,
        note TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      )
    `);

    // ── Opportunity Center: dismissed_opportunities ──────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS dismissed_opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      opportunity_id TEXT NOT NULL,
      dismissed_by INTEGER NOT NULL,
      dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (dismissed_by) REFERENCES users(id),
      UNIQUE(business_id, opportunity_id)
    )
  `);

  // ── Unified Opportunities Table ──────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'novi',
      source_event_type TEXT NOT NULL,
      engine TEXT NOT NULL,
      icon TEXT,
      title TEXT NOT NULL,
      description TEXT,
      impact TEXT NOT NULL CHECK(impact IN ('high','medium','low')),
      effort TEXT NOT NULL DEFAULT 'medium' CHECK(effort IN ('low','medium','high')),
      potential_value TEXT,
      confidence REAL NOT NULL DEFAULT 0.5,
      explanation TEXT,
      cited_data TEXT,
      action_type TEXT NOT NULL DEFAULT 'navigate',
      action_label TEXT,
      action_link TEXT,
      novi_assist_prompt TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','snoozed','completed','dismissed')),
      snoozed_until TEXT,
      completed_at TEXT,
      completed_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_opp_business_status ON opportunities(business_id, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_opp_business_type ON opportunities(business_id, source_event_type)`);


  // ── Business Health Snapshots ────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS health_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      breakdown TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_health_snapshots_business_date
    ON health_snapshots(business_id, created_at)
  `);

  // ── Migration: add purchasing permissions to role_permissions ─────

  const purchasingPerms = ["purchasing.read", "purchasing.write"];
  const purchasingRoles = ["owner", "admin", "manager", "manufacturing"];
  for (const role of purchasingRoles) {
    for (const perm of purchasingPerms) {
      db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", [role, perm]);
    }
  }
  // Add shopify.write to owner and admin roles
  db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", ["owner", "shopify.write"]);
  db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", ["admin", "shopify.write"]);
  db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", ["manager", "shopify.write"]);

  // Also add read to warehouse
  db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", ["warehouse", "purchasing.read"]);

  // ── Warehouse Engine tables ─────────────────────────────────────────

  // Add bin_location column to products
  const productCols = db.query("PRAGMA table_info(products)").all();
  if (!productCols.some(c => c.name === "bin_location")) {
    db.run("ALTER TABLE products ADD COLUMN bin_location TEXT");
    console.log("Added bin_location column to products");
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS warehouse_bins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      zone TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      UNIQUE(business_id, name)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bin_contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      bin_id INTEGER NOT NULL,
      product_id INTEGER,
      variant_id INTEGER,
      quantity REAL NOT NULL DEFAULT 0,
      last_moved_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (bin_id) REFERENCES warehouse_bins(id),
      UNIQUE(bin_id, product_id, variant_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS warehouse_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      from_bin_id INTEGER,
      to_bin_id INTEGER NOT NULL,
      product_id INTEGER,
      variant_id INTEGER,
      quantity REAL NOT NULL,
      transfer_type TEXT NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  // Ensure inventory.adjust permission on warehouse + manufacturing roles
  db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", ["warehouse", "inventory.adjust"]);
  db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", ["manufacturing", "inventory.adjust"]);

  console.log("Warehouse engine tables ready");

  // ── V3.5: Customer Service tables ────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      customer_email TEXT NOT NULL,
      order_id INTEGER,
      note TEXT NOT NULL,
      note_type TEXT DEFAULT 'general',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS returns_refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      amount REAL,
      reason TEXT,
      replacement_order_id INTEGER,
      store_credit_amount REAL,
      store_credit_code TEXT,
      approved_by INTEGER REFERENCES users(id),
      processed_by INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  // Migration: add restock tracking columns to returns_refunds
  const rrCols = db.query("PRAGMA table_info(returns_refunds)").all();
  if (!rrCols.some(c => c.name === "restocked_at")) {
    db.run("ALTER TABLE returns_refunds ADD COLUMN restocked_at TEXT");
    console.log("Added restocked_at column to returns_refunds");
  }
  if (!rrCols.some(c => c.name === "restocked_quantity")) {
    db.run("ALTER TABLE returns_refunds ADD COLUMN restocked_quantity INTEGER DEFAULT 0");
    console.log("Added restocked_quantity column to returns_refunds");
  }

  // Migration: add reference_type, reference_id, variant_id to inventory_movements
  const imCols = db.query("PRAGMA table_info(inventory_movements)").all();
  if (!imCols.some(c => c.name === "variant_id")) {
    db.run("ALTER TABLE inventory_movements ADD COLUMN variant_id INTEGER REFERENCES product_variants(id)");
    console.log("Added variant_id column to inventory_movements");
  }
  if (!imCols.some(c => c.name === "reference_type")) {
    db.run("ALTER TABLE inventory_movements ADD COLUMN reference_type TEXT");
    console.log("Added reference_type column to inventory_movements");
  }
  if (!imCols.some(c => c.name === "reference_id")) {
    db.run("ALTER TABLE inventory_movements ADD COLUMN reference_id INTEGER");
    console.log("Added reference_id column to inventory_movements");
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS packing_proof (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      proof_type TEXT DEFAULT 'photo',
      data TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  // Migration: add cs_status, packed_at, packed_by to orders
  const orderColsV35 = db.query("PRAGMA table_info(orders)").all();
  if (!orderColsV35.some(c => c.name === "cs_status")) {
    db.run("ALTER TABLE orders ADD COLUMN cs_status TEXT DEFAULT 'none'");
    console.log("Added cs_status column to orders");
  }
  if (!orderColsV35.some(c => c.name === "packed_at")) {
    db.run("ALTER TABLE orders ADD COLUMN packed_at TEXT");
    console.log("Added packed_at column to orders");
  }
  if (!orderColsV35.some(c => c.name === "packed_by")) {
    db.run("ALTER TABLE orders ADD COLUMN packed_by INTEGER REFERENCES users(id)");
    console.log("Added packed_by column to orders");
  }

  // Migration: add cs.write permission
  const csPermRoles = ["owner", "admin", "manager", "customer_service"];
  for (const role of csPermRoles) {
    db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", [role, "cs.write"]);
    db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", [role, "cs.inbox_read"]);
  }

  console.log("Customer Service (V3.5) tables ready");

  // ── V4.0 (Phase 1): Customer Inbox — Conversations & Messages ────────

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      customer_email TEXT NOT NULL,
      subject TEXT,
      source TEXT NOT NULL DEFAULT 'email',
      source_ref TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      assigned_to INTEGER REFERENCES users(id),
      tags TEXT DEFAULT '[]',
      last_message_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      direction TEXT NOT NULL DEFAULT 'inbound',
      sender_type TEXT NOT NULL DEFAULT 'customer',
      sender_name TEXT,
      body TEXT NOT NULL,
      drafted_by_novi INTEGER DEFAULT 0,
      novi_draft_context TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES customer_conversations(id),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_customer_conversations_business ON customer_conversations(business_id, status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_customer_conversations_customer ON customer_conversations(business_id, customer_email)");
  db.run("CREATE INDEX IF NOT EXISTS idx_customer_messages_conversation ON customer_messages(conversation_id)");

  console.log("Customer Inbox (V4.0 Phase 1) tables ready");

  // ── V3.6: Affiliates ────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      discount_code TEXT UNIQUE NOT NULL,
      discount_type TEXT DEFAULT 'percentage',
      discount_value REAL NOT NULL DEFAULT 10,
      commission_rate REAL DEFAULT 0,
      store_credit_balance REAL DEFAULT 0,
      total_referrals INTEGER DEFAULT 0,
      total_revenue_generated REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      affiliate_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      discount_amount REAL DEFAULT 0,
      commission_earned REAL DEFAULT 0,
      store_credit_issued REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (affiliate_id) REFERENCES affiliates(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  console.log("Affiliate (V3.6) tables ready");

  // ── P4.4: Affiliate HQ — Payouts, Challenges, Assets, Training ────────

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      affiliate_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'store_credit',
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      paid_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (affiliate_id) REFERENCES affiliates(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      target_type TEXT NOT NULL DEFAULT 'referrals',
      target_value REAL NOT NULL,
      reward_type TEXT NOT NULL DEFAULT 'store_credit',
      reward_amount REAL NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_challenge_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER NOT NULL,
      affiliate_id INTEGER NOT NULL,
      current_value REAL NOT NULL DEFAULT 0,
      completed_at TEXT,
      FOREIGN KEY (challenge_id) REFERENCES affiliate_challenges(id),
      FOREIGN KEY (affiliate_id) REFERENCES affiliates(id),
      UNIQUE(challenge_id, affiliate_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'banner',
      url TEXT NOT NULL,
      download_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_training (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  console.log("P4.4: Affiliate HQ tables ready (payouts, challenges, progress, assets, training)");

  // Migration: add affiliates permissions
  const affPermRoles = ["owner", "admin", "manager", "marketing", "affiliate_manager"];
  for (const role of affPermRoles) {
    db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", [role, "affiliates.read"]);
  }
  const affWriteRoles = ["owner", "admin", "affiliate_manager"];
  for (const role of affWriteRoles) {
    db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", [role, "affiliates.write"]);
  }

  // ── P4.1: Adaptive HQ — Industry Config & Business Settings ───────

  db.run(`
    CREATE TABLE IF NOT EXISTS industry_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      terminology TEXT NOT NULL DEFAULT '{}',
      default_engines TEXT NOT NULL DEFAULT '[]',
      workflow_order TEXT NOT NULL DEFAULT '[]',
      default_units TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS business_settings (
      business_id INTEGER NOT NULL,
      industry_config_id TEXT REFERENCES industry_configs(id),
      settings TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (business_id),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  // Migration: add settings.read/write permissions
  db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", ["owner", "settings.read"]);
  db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", ["owner", "settings.write"]);
  db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", ["admin", "settings.read"]);
  db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", ["admin", "settings.write"]);

  console.log("P4.1: Adaptive HQ tables ready (industry_configs, business_settings)");

  // ── P4.2: Commerce Expansion — Provider Credentials ──────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS provider_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      credentials TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 0,
      last_synced_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      UNIQUE(business_id, provider)
    )
  `);

  console.log("P4.2: Commerce Expansion — provider_credentials table ready");

  // ── Migration: Shopify OAuth columns on provider_credentials ───────

  const pcCols = db.query("PRAGMA table_info(provider_credentials)").all();
  const oauthCols = ["shop_domain", "access_token_encrypted", "scopes", "webhook_id", "sync_status", "sync_error", "shop_owner", "shop_name", "sync_mode"];
  for (const colName of oauthCols) {
    if (!pcCols.some(c => c.name === colName)) {
      const colType = colName === "sync_status" ? "TEXT DEFAULT 'pending'" : colName === "sync_mode" ? "TEXT DEFAULT 'readonly'" : "TEXT";
      db.run("ALTER TABLE provider_credentials ADD COLUMN " + colName + " " + colType);
      console.log("Added " + colName + " column to provider_credentials");
    }
  }

  console.log("Shopify OAuth: provider_credentials migration complete");

  // ── Novi SKU & Label Studio ────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS product_identity_settings (
      business_id INTEGER PRIMARY KEY REFERENCES businesses(id),
      sku_pattern TEXT NOT NULL DEFAULT '{PRODUCT}-{VARIANT}-{NUMBER}',
      sku_separator TEXT NOT NULL DEFAULT '-',
      sku_case TEXT NOT NULL DEFAULT 'upper' CHECK(sku_case IN ('upper', 'lower')),
      number_start INTEGER NOT NULL DEFAULT 1,
      number_padding INTEGER NOT NULL DEFAULT 3,
      preserve_existing INTEGER NOT NULL DEFAULT 1,
      writeback_enabled INTEGER NOT NULL DEFAULT 0,
      preferred_label_size TEXT NOT NULL DEFAULT '2x1',
      label_fields TEXT NOT NULL DEFAULT '["product","variant","sku","barcode"]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS generated_internal_barcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      variant_id INTEGER NOT NULL REFERENCES product_variants(id),
      barcode_value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(business_id, variant_id),
      UNIQUE(business_id, barcode_value)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS label_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      name TEXT NOT NULL,
      width_inches REAL NOT NULL,
      height_inches REAL NOT NULL,
      fields TEXT NOT NULL,
      custom_text TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(business_id, name)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS label_print_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      template_id INTEGER REFERENCES label_templates(id),
      requested_by INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','printing','completed','cancelled','failed')),
      items TEXT NOT NULL,
      total_labels INTEGER NOT NULL,
      is_test INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS product_setup_audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      import_session_id INTEGER REFERENCES shopify_import_sessions(id),
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shopify_identifier_writeback_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      shop TEXT NOT NULL,
      shopify_product_id TEXT NOT NULL,
      shopify_variant_id TEXT NOT NULL,
      previous_sku TEXT,
      previous_barcode TEXT,
      requested_sku TEXT,
      requested_barcode TEXT,
      result TEXT NOT NULL,
      shopify_user_errors TEXT NOT NULL DEFAULT '[]',
      initiated_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shopify_identifier_writeback_previews (
      id TEXT PRIMARY KEY,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      initiated_by INTEGER NOT NULL REFERENCES users(id),
      payload TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      executed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_internal_barcodes_business ON generated_internal_barcodes(business_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_label_templates_business ON label_templates(business_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_label_print_jobs_business ON label_print_jobs(business_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_product_setup_audits_business ON product_setup_audits(business_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_identifier_writeback_business ON shopify_identifier_writeback_audit(business_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_identifier_previews_business ON shopify_identifier_writeback_previews(business_id)");

  console.log("Novi SKU & Label Studio tables ready");

  // ── Shopify OAuth State table — CSRF / replay protection ─────────────
  // Stores server-side hashes of opaque state tokens for OAuth callbacks.
  // Each row is single-use and expires after a short TTL.

  db.run(`
    CREATE TABLE IF NOT EXISTS shopify_oauth_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      session_id INTEGER,
      expected_shop TEXT NOT NULL,
      requested_capability TEXT NOT NULL DEFAULT 'readonly',
      expires_at TEXT NOT NULL,
      used_at TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const oauthStateColumns = db.query("PRAGMA table_info(shopify_oauth_state)").all();
  if (!oauthStateColumns.some(column => column.name === "requested_capability")) {
    db.run("ALTER TABLE shopify_oauth_state ADD COLUMN requested_capability TEXT NOT NULL DEFAULT 'readonly'");
  }

  console.log("Shopify OAuth: shopify_oauth_state table ready");

  // ── Shopify Webhook Deliveries table ─────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS shopify_webhook_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      topic TEXT NOT NULL,
      shopify_id TEXT,
      payload TEXT,
      processed INTEGER DEFAULT 0,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  console.log("Shopify OAuth: shopify_webhook_deliveries table ready");

  // ── Shopify Import Sessions — state machine for import tracking ────────

  db.run(`
    CREATE TABLE IF NOT EXISTS shopify_import_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      state TEXT NOT NULL DEFAULT 'IMPORT_PENDING',
      import_started_at TEXT,
      import_completed_at TEXT,
      last_successful_import_at TEXT,
      shopify_products_count INTEGER,
      shopify_variants_count INTEGER,
      shopify_orders_count INTEGER,
      shopify_locations_count INTEGER,
      shopify_inventory_levels_count INTEGER,
      persisted_products_count INTEGER,
      persisted_variants_count INTEGER,
      persisted_orders_count INTEGER,
      persisted_locations_count INTEGER,
      persisted_inventory_levels_count INTEGER,
      shopify_product_ids TEXT,
      shopify_variant_ids TEXT,
      shopify_order_ids TEXT,
      shopify_location_ids TEXT,
      shopify_inventory_pairs TEXT,
      shopify_inventory_snapshot TEXT,
      discrepancies TEXT,
      errors TEXT,
      reconciliation_status TEXT DEFAULT 'PENDING',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_import_sessions_business ON shopify_import_sessions(business_id)`);

  // Migration: add ID-set columns to existing import sessions tables.
  {
    const sisCols = db.query("PRAGMA table_info(shopify_import_sessions)").all().map(c => c.name);
    for (const col of ["shopify_product_ids", "shopify_variant_ids", "shopify_order_ids",
                        "shopify_location_ids", "shopify_inventory_pairs", "shopify_inventory_snapshot"]) {
      if (!sisCols.includes(col)) {
        db.run(`ALTER TABLE shopify_import_sessions ADD COLUMN ${col} TEXT`);
      }
    }
  }
  console.log("Shopify import sessions table ready");

  // ── Shopify Locations ──────────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS shopify_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      shopify_location_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      address TEXT,
      imported_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(business_id, shopify_location_id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_shopify_locations_business ON shopify_locations(business_id)`);
  console.log("Shopify locations table ready");

  // ── Shopify Inventory Levels ───────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS shopify_inventory_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      shopify_inventory_item_id TEXT NOT NULL,
      shopify_location_id TEXT NOT NULL,
      available INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(business_id, shopify_inventory_item_id, shopify_location_id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_shopify_inv_levels_business ON shopify_inventory_levels(business_id)`);
  console.log("Shopify inventory levels table ready");

  // ── Orders migration: add financial/fulfillment status columns ─────────
  {
    const orderCols = db.query("PRAGMA table_info(orders)").all();
    if (!orderCols.some(c => c.name === "financial_status")) {
      db.run("ALTER TABLE orders ADD COLUMN financial_status TEXT");
      console.log("Added financial_status column to orders");
    }
    if (!orderCols.some(c => c.name === "fulfillment_status")) {
      db.run("ALTER TABLE orders ADD COLUMN fulfillment_status TEXT");
      console.log("Added fulfillment_status column to orders");
    }
    if (!orderCols.some(c => c.name === "shopify_created_at")) {
      db.run("ALTER TABLE orders ADD COLUMN shopify_created_at TEXT");
      console.log("Added shopify_created_at column to orders");
    }
  }

  // ── P4.3: Customer Hub — Email, Approvals, Customer Tags ─────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      customer_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      template_id INTEGER,
      status TEXT DEFAULT 'queued',
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (template_id) REFERENCES email_templates(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      request_data TEXT NOT NULL DEFAULT '{}',
      requested_by INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (requested_by) REFERENCES users(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      customer_email TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      UNIQUE(business_id, customer_email, tag)
    )
  `);

  // Migration: add customer_id column to orders (for customer hub)
  const orderColsP43 = db.query("PRAGMA table_info(orders)").all();
  if (!orderColsP43.some(c => c.name === "customer_id")) {
    db.run("ALTER TABLE orders ADD COLUMN customer_id TEXT");
    console.log("Added customer_id column to orders");
  }

  // Migration: add cs permissions for customer hub
  const csHubPerms = ["customers.read", "approvals.read", "approvals.write", "email.read", "email.send"];
  const csHubRoles = ["owner", "admin", "manager", "customer_service"];
  for (const role of csHubRoles) {
    for (const perm of csHubPerms) {
      db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", [role, perm]);
    }
  }

  console.log("P4.3: Customer Hub tables ready (email_templates, email_log, approvals, customer_tags)");

  // ── P4.5: Studio — Creative Workspace ───────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS studio_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('product_graphics', 'social_post', 'email_banner', 'launch_asset')),
      layout TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS studio_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      template_id INTEGER,
      product_id INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      html_content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (template_id) REFERENCES studio_templates(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Migration: add brand columns to business_settings if not present
  const bsCols = db.query("PRAGMA table_info(business_settings)").all();
  if (!bsCols.some(c => c.name === "brand_colors")) {
    db.run("ALTER TABLE business_settings ADD COLUMN brand_colors TEXT DEFAULT '[]'");
  }
  if (!bsCols.some(c => c.name === "brand_logo_url")) {
    db.run("ALTER TABLE business_settings ADD COLUMN brand_logo_url TEXT");
  }
  if (!bsCols.some(c => c.name === "brand_font")) {
    db.run("ALTER TABLE business_settings ADD COLUMN brand_font TEXT DEFAULT 'Inter'");
  }

  console.log("P4.5: Studio tables ready (studio_templates, studio_assets, brand_settings)");

  // ── P4.7: Novi Evolution — Novi Memory & Goals ──────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS novi_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      occurred_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_novi_memory_business ON novi_memory(business_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_novi_memory_type ON novi_memory(business_id, event_type)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_novi_memory_date ON novi_memory(business_id, occurred_at)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS novi_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      target REAL NOT NULL,
      current REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'orders',
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_novi_goals_business ON novi_goals(business_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_novi_goals_status ON novi_goals(business_id, status)`);

  // Seed novi_memory from existing data if empty
  const memoryCount = db.query("SELECT COUNT(*) as count FROM novi_memory").get().count;
  if (memoryCount === 0) {
    // Auto-populate memories from existing data
    const businesses = db.query("SELECT id FROM businesses").all();
    for (const biz of businesses) {
      // First order date
      const firstOrder = db.query(
        "SELECT created_at, order_number FROM orders WHERE business_id = ? ORDER BY created_at ASC LIMIT 1"
      ).get(biz.id);
      if (firstOrder) {
        db.run(
          "INSERT INTO novi_memory (business_id, event_type, title, description, occurred_at) VALUES (?, ?, ?, ?, ?)",
          [biz.id, "milestone", "First Order Received", `Order #${firstOrder.order_number} — the very first order that started it all.`, firstOrder.created_at]
        );
      }

      // First product created
      const firstProduct = db.query(
        "SELECT created_at, name FROM products WHERE business_id = ? ORDER BY created_at ASC LIMIT 1"
      ).get(biz.id);
      if (firstProduct) {
        db.run(
          "INSERT INTO novi_memory (business_id, event_type, title, description, occurred_at) VALUES (?, ?, ?, ?, ?)",
          [biz.id, "launch", "First Product Launched", `"${firstProduct.name}" was the first product added to your catalog.`, firstProduct.created_at]
        );
      }

      // Revenue milestones — check for cumulative revenue
      const revenueData = db.query(
        `SELECT SUM(oi.unit_price * oi.quantity) as total,
                MIN(o.created_at) as started,
                MAX(o.created_at) as latest
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE o.business_id = ? AND o.status != 'cancelled'`
      ).get(biz.id);
      if (revenueData && revenueData.total > 0) {
        // Check for $100 milestone
        if (revenueData.total >= 100) {
          // Find when $100 was reached
          const orders = db.query(
            `SELECT o.id, o.created_at, SUM(oi.unit_price * oi.quantity) as order_total
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
             WHERE o.business_id = ? AND o.status != 'cancelled'
             GROUP BY o.id ORDER BY o.created_at ASC`
          ).all(biz.id);
          let running = 0;
          for (const o of orders) {
            running += o.order_total;
            if (running >= 100) {
              const existing = db.query(
                "SELECT id FROM novi_memory WHERE business_id = ? AND event_type = 'achievement' AND title = 'Revenue Milestone: $100'"
              ).get(biz.id);
              if (!existing) {
                db.run(
                  "INSERT INTO novi_memory (business_id, event_type, title, description, occurred_at) VALUES (?, ?, ?, ?, ?)",
                  [biz.id, "achievement", "Revenue Milestone: $100", `Crossed $100 in total revenue — proof that people want what you're building.`, o.created_at]
                );
              }
              break;
            }
          }
          // $1000 milestone
          if (revenueData.total >= 1000) {
            running = 0;
            for (const o of orders) {
              running += o.order_total;
              if (running >= 1000) {
                const existing = db.query(
                  "SELECT id FROM novi_memory WHERE business_id = ? AND event_type = 'achievement' AND title = 'Revenue Milestone: $1,000'"
                ).get(biz.id);
                if (!existing) {
                  db.run(
                    "INSERT INTO novi_memory (business_id, event_type, title, description, occurred_at) VALUES (?, ?, ?, ?, ?)",
                    [biz.id, "achievement", "Revenue Milestone: $1,000", `Crossed $1,000 in total revenue — your business is gaining real traction.`, o.created_at]
                  );
                }
                break;
              }
            }
          }
        }
      }

      // First employee (user who isn't the first user)
      const userCount = db.query(
        "SELECT COUNT(*) as count FROM user_businesses WHERE business_id = ?"
      ).get(biz.id).count;
      if (userCount >= 2) {
        const secondUser = db.query(
          `SELECT ub.created_at, u.display_name
           FROM user_businesses ub
           JOIN users u ON ub.user_id = u.id
           WHERE ub.business_id = ?
           ORDER BY ub.created_at ASC LIMIT 1 OFFSET 1`
        ).get(biz.id);
        if (secondUser) {
          const existing = db.query(
            "SELECT id FROM novi_memory WHERE business_id = ? AND event_type = 'hire'"
          ).get(biz.id);
          if (!existing) {
            db.run(
              "INSERT INTO novi_memory (business_id, event_type, title, description, occurred_at) VALUES (?, ?, ?, ?, ?)",
              [biz.id, "hire", "First Team Member", `${secondUser.display_name} joined the team — you're not going it alone anymore.`, secondUser.created_at]
            );
          }
        }
      }

      // Business anniversary based on created_at
      const bizCreated = db.query("SELECT created_at FROM businesses WHERE id = ?").get(biz.id);
      if (bizCreated) {
        const existing = db.query(
          "SELECT id FROM novi_memory WHERE business_id = ? AND event_type = 'anniversary'"
        ).get(biz.id);
        if (!existing) {
          db.run(
            "INSERT INTO novi_memory (business_id, event_type, title, description, occurred_at) VALUES (?, ?, ?, ?, ?)",
            [biz.id, "anniversary", "Business Founded", "The day ShimmerStock first powered your operations — the start of your journey.", bizCreated.created_at]
          );
        }
      }
    }
    console.log("P4.7: Novi memories auto-seeded from existing data");
  }

  console.log("P4.7: Novi Evolution tables ready (novi_memory, novi_goals)");

  // ── Novi Message Center: proactive notifications ─────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS novi_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      user_id INTEGER REFERENCES users(id),
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      action_type TEXT,
      action_label TEXT,
      action_link TEXT,
      severity TEXT DEFAULT "info" CHECK(severity IN ("info","warning","opportunity","celebration","urgent")),
      status TEXT DEFAULT "new" CHECK(status IN ("new","viewed","snoozed","completed","dismissed")),
      context_data TEXT DEFAULT "{}",
      viewed_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_novi_messages_business ON novi_messages(business_id, status)`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_novi_messages_event ON novi_messages(business_id, event_type, status)`);
  // Add action_route column if it doesn't exist (migration — safe to run repeatedly)
  try {
    db.run(`ALTER TABLE novi_messages ADD COLUMN action_route TEXT`);
    console.log("Migration: added action_route column to novi_messages");
  } catch (e) {
    // Column already exists — that's fine
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS novi_settings (
      business_id INTEGER NOT NULL UNIQUE REFERENCES businesses(id),
      frequency TEXT DEFAULT "balanced" CHECK(frequency IN ("proactive","balanced","minimal","quiet")),
      sound_enabled INTEGER DEFAULT 1,
      popup_enabled INTEGER DEFAULT 1,
      email_enabled INTEGER DEFAULT 0,
      push_enabled INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Novi Message Center tables ready (novi_messages, novi_settings)");

  // ── Team HQ: Members, Roles, Permissions, Activity Log ─────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT,
      status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('active', 'invited', 'disabled')),
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT,
      UNIQUE(business_id, email)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS team_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(business_id, name)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS team_role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER NOT NULL REFERENCES team_roles(id),
      resource TEXT NOT NULL,
      granted INTEGER NOT NULL DEFAULT 1,
      UNIQUE(role_id, resource)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS member_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL REFERENCES team_members(id),
      role_id INTEGER NOT NULL REFERENCES team_roles(id),
      UNIQUE(member_id, role_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      member_id INTEGER REFERENCES team_members(id),
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id INTEGER,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_activity_log_biz ON activity_log(business_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_activity_log_member ON activity_log(member_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at)");

  // ── Seed default team roles (one per business on first init) ────────

  const TEAM_DEFAULT_ROLES = {
    Owner: [
      "orders.view", "orders.edit", "orders.create", "orders.refund", "orders.delete",
      "inventory.view", "inventory.adjust", "inventory.create_po", "inventory.delete_product",
      "warehouse.view", "warehouse.receive", "warehouse.move", "warehouse.pick", "warehouse.pack", "warehouse.ship",
      "production.view", "production.create", "production.edit", "production.execute",
      "customers.view", "customers.edit", "customers.delete", "customers.issue_store_credit", "customers.replace_orders",
      "affiliates.view", "affiliates.approve", "affiliates.issue_rewards", "affiliates.view_spend", "affiliates.change_commission",
      "studio.view", "studio.create", "studio.edit", "studio.delete",
      "growth.view", "growth.export",
      "finance.view_revenue", "finance.view_profit", "finance.view_margins", "finance.view_banking", "finance.view_payroll", "finance.view_vendor_costs", "finance.export",
      "team.view", "team.invite", "team.edit_roles", "team.remove",
      "settings.view", "settings.edit",
    ],
    "General Manager": [
      "orders.view", "orders.edit", "orders.create", "orders.refund", "orders.delete",
      "inventory.view", "inventory.adjust", "inventory.create_po",
      "warehouse.view", "warehouse.receive", "warehouse.move", "warehouse.pick", "warehouse.pack", "warehouse.ship",
      "production.view", "production.create", "production.edit", "production.execute",
      "customers.view", "customers.edit", "customers.issue_store_credit", "customers.replace_orders",
      "affiliates.view", "affiliates.approve", "affiliates.issue_rewards",
      "studio.view", "studio.create", "studio.edit",
      "growth.view", "growth.export",
      "team.view",
      "settings.view", "settings.edit",
    ],
    Warehouse: [
      "inventory.view", "inventory.adjust",
      "warehouse.view", "warehouse.receive", "warehouse.move", "warehouse.pick", "warehouse.pack", "warehouse.ship",
      "orders.view",
    ],
    "Customer Service": [
      "orders.view", "orders.edit", "orders.refund",
      "customers.view", "customers.edit", "customers.issue_store_credit", "customers.replace_orders",
    ],
    Production: [
      "production.view", "production.create", "production.edit", "production.execute",
      "inventory.view",
    ],
    Marketing: [
      "studio.view", "studio.create", "studio.edit",
      "affiliates.view",
      "growth.view",
    ],
    "Affiliate Manager": [
      "affiliates.view", "affiliates.approve", "affiliates.issue_rewards", "affiliates.view_spend",
      "studio.view",
    ],
    Accounting: [
      "finance.view_revenue", "finance.view_profit", "finance.view_margins", "finance.view_banking", "finance.view_payroll", "finance.view_vendor_costs", "finance.export",
      "orders.view",
    ],
  };

  // Seed roles for each business that doesn't have them yet
  const businesses = db.query("SELECT id FROM businesses").all();
  const insertRole = db.prepare(
    "INSERT OR IGNORE INTO team_roles (business_id, name, is_default) VALUES (?, ?, 1)"
  );
  const insertPerm = db.prepare(
    "INSERT OR IGNORE INTO team_role_permissions (role_id, resource, granted) VALUES (?, ?, 1)"
  );

  for (const biz of businesses) {
    for (const [roleName, permissions] of Object.entries(TEAM_DEFAULT_ROLES)) {
      insertRole.run(biz.id, roleName);
      const roleRow = db.query(
        "SELECT id FROM team_roles WHERE business_id = ? AND name = ?"
      ).get(biz.id, roleName);
      if (roleRow) {
        for (const perm of permissions) {
          insertPerm.run(roleRow.id, perm);
        }
      }
    }
  }

  console.log("Team HQ tables ready (team_members, team_roles, team_role_permissions, member_roles, activity_log)");

  // ── Fulfillment HQ tables ───────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS fulfillment_shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      carrier TEXT NOT NULL,
      tracking_number TEXT,
      package_type TEXT,
      weight_oz REAL,
      cost REAL,
      status TEXT NOT NULL DEFAULT 'label_created'
        CHECK(status IN ('label_created','in_transit','out_for_delivery','delivered','exception')),
      shipped_at TEXT DEFAULT (datetime('now')),
      delivered_at TEXT,
      estimated_delivery TEXT,
      business_id INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fulfillment_pack_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      photo_url TEXT,
      verified_by INTEGER REFERENCES users(id),
      items_checked TEXT DEFAULT '[]',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      business_id INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  console.log("Fulfillment HQ tables ready (fulfillment_shipments, fulfillment_pack_verifications)");

  // ── Adaptive Onboarding ─────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS onboarding_state (
      business_id INTEGER PRIMARY KEY,
      phase TEXT NOT NULL DEFAULT 'greeting'
        CHECK(phase IN ('greeting','clarification','proposal','complete')),
      analysis_data TEXT NOT NULL DEFAULT '{}',
      workspace_config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  console.log("Adaptive Onboarding: onboarding_state table ready");

  // ── P4.4v2: Affiliate HQ 2.0 — Wallets, Transactions, Commission Rules, Fraud, Goals ──

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      affiliate_id INTEGER NOT NULL UNIQUE,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      lifetime_earned_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (affiliate_id) REFERENCES affiliates(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER NOT NULL,
      order_id INTEGER,
      amount_cents INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('earned','redeemed','adjusted','payout')),
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (wallet_id) REFERENCES affiliate_wallets(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_reward_settings (
      business_id INTEGER NOT NULL UNIQUE,
      reward_type TEXT NOT NULL DEFAULT 'store_credit'
        CHECK(reward_type IN ('store_credit','cash','gift_card','points','custom')),
      config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_commission_rules (
      business_id INTEGER NOT NULL UNIQUE,
      commission_type TEXT NOT NULL DEFAULT 'percentage'
        CHECK(commission_type IN ('percentage','flat','tiered','lifetime')),
      rate REAL NOT NULL DEFAULT 5,
      options TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      affiliate_id INTEGER NOT NULL,
      code TEXT UNIQUE NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','used','expired','cancelled')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (affiliate_id) REFERENCES affiliates(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      affiliate_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      target INTEGER NOT NULL,
      current INTEGER NOT NULL DEFAULT 0,
      reward TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (affiliate_id) REFERENCES affiliates(id),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_fraud_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      affiliate_id INTEGER,
      order_id INTEGER,
      flag_type TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed','confirmed')),
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (affiliate_id) REFERENCES affiliates(id),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_toolkit_stats (
      affiliate_id INTEGER NOT NULL UNIQUE,
      link_clicks INTEGER NOT NULL DEFAULT 0,
      conversions INTEGER NOT NULL DEFAULT 0,
      revenue_generated_cents INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (affiliate_id) REFERENCES affiliates(id)
    )
  `);

  // Migrate existing affiliate store_credit_balance to wallets
  const existingAffiliates = db.query("SELECT id, store_credit_balance FROM affiliates WHERE store_credit_balance > 0").all();
  for (const aff of existingAffiliates) {
    const wallet = db.query("SELECT id FROM affiliate_wallets WHERE affiliate_id = ?").get(aff.id);
    if (!wallet) {
      const balanceCents = Math.round((aff.store_credit_balance || 0) * 100);
      const walletResult = db.run(
        "INSERT INTO affiliate_wallets (affiliate_id, balance_cents, lifetime_earned_cents) VALUES (?, ?, ?)",
        [aff.id, balanceCents, balanceCents]
      );
      if (balanceCents > 0) {
        db.run(
          "INSERT INTO affiliate_transactions (wallet_id, amount_cents, type, description) VALUES (?, ?, 'adjusted', 'Migrated from legacy balance')",
          [walletResult.lastInsertRowid, balanceCents]
        );
      }
    }
  }

  // Seed default reward_settings for GGE if none exist
  const rewardSettingsCount = db.query("SELECT COUNT(*) as c FROM affiliate_reward_settings WHERE business_id = 1").get().c;
  if (rewardSettingsCount === 0) {
    db.run(
      "INSERT INTO affiliate_reward_settings (business_id, reward_type, config) VALUES (1, 'store_credit', '{}')"
    );
  }

  // Seed default commission rules for GGE if none exist
  const commRulesCount = db.query("SELECT COUNT(*) as c FROM affiliate_commission_rules WHERE business_id = 1").get().c;
  if (commRulesCount === 0) {
    db.run(
      "INSERT INTO affiliate_commission_rules (business_id, commission_type, rate, options) VALUES (1, 'percentage', 5, '{\"include_shipping\":false,\"include_tax\":false,\"exclude_discounts\":true,\"exclude_gift_cards\":true,\"product_eligibility\":\"all\",\"reward_timing\":\"after_fulfillment\"}')"
    );
  }

  // Seed toolkit stats for existing affiliates
  for (const aff of existingAffiliates) {
    db.run("INSERT OR IGNORE INTO affiliate_toolkit_stats (affiliate_id, link_clicks, conversions, revenue_generated_cents) VALUES (?, ?, ?, ?)",
      [aff.id, Math.floor(Math.random() * 100) + 10, 0, 0]
    );
  }

  // Seed goals for existing affiliates
  const goalsCount = db.query("SELECT COUNT(*) as c FROM affiliate_goals WHERE business_id = 1").get().c;
  if (goalsCount === 0) {
    const allAffs = db.query("SELECT id, name FROM affiliates WHERE business_id = 1").all();
    for (const aff of allAffs) {
      db.run(
        "INSERT INTO affiliate_goals (affiliate_id, business_id, title, target, current, reward, status) VALUES (?, 1, 'Reach 10 referrals', 10, ?, '25 store credit', 'active')",
        [aff.id, Math.floor(Math.random() * 5)]
      );
    }
  }

  console.log("P4.4v2: Affiliate HQ 2.0 tables ready (wallets, transactions, reward_settings, commission_rules, coupons, goals, fraud_flags, toolkit_stats)");

  // ── Fulfillment HQ 1.1: Template Designer & Unboxing Engine ──────────

  db.run(`
    CREATE TABLE IF NOT EXISTS fulfillment_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('shipping_label','packing_slip','invoice','warehouse_label','thank_you_card','return_slip','email_header','email_signature','quote_template')),
      name TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fulfillment_unboxing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      condition_type TEXT NOT NULL CHECK(condition_type IN ('order_value','product_type','customer_type','seasonal','custom')),
      condition_value TEXT NOT NULL,
      action_type TEXT NOT NULL CHECK(action_type IN ('thank_you_card','free_sample','coupon','seasonal_insert','wholesale_instructions','custom_note','sticker','gift_wrap')),
      action_config TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  // Migration: expand template types for AI Brand Setup (P4.8)
  try {
    const oldCheck = db.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='fulfillment_templates'").get();
    if (oldCheck && oldCheck.sql && !oldCheck.sql.includes("thank_you_card")) {
      db.run("ALTER TABLE fulfillment_templates RENAME TO fulfillment_templates_old");
      db.run(`CREATE TABLE fulfillment_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          business_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('shipping_label','packing_slip','invoice','warehouse_label','thank_you_card','return_slip','email_header','email_signature','quote_template')),
          name TEXT NOT NULL,
          config TEXT NOT NULL DEFAULT '{}',
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (business_id) REFERENCES businesses(id)
        )`);
      db.run("INSERT INTO fulfillment_templates SELECT * FROM fulfillment_templates_old");
      db.run("DROP TABLE fulfillment_templates_old");
      console.log("Fulfillment HQ 1.1: template types expanded for Brand Setup");
    }
  } catch (e) {}
  console.log("Fulfillment HQ 1.1 tables ready (fulfillment_templates, fulfillment_unboxing_rules)");

  // ── Fulfillment HQ 1.2: Packing Recipes ──────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS packing_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      product_id INTEGER,
      order_type TEXT NOT NULL DEFAULT 'any'
        CHECK(order_type IN ('retail','wholesale','sample','any')),
      box_size TEXT,
      packing_materials TEXT NOT NULL DEFAULT '[]',
      inserts TEXT NOT NULL DEFAULT '[]',
      labels TEXT,
      special_instructions TEXT,
      priority INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  console.log("Fulfillment HQ 1.2: packing_recipes table ready");

  // ── Partner HQ 3.0: Multi-Program Partner Management ──────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS partner_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('affiliate','brand_rep','creator','wholesale','ambassador','influencer')),
      description TEXT,
      logo_url TEXT,
      brand_color TEXT DEFAULT '#6366f1',
      is_active INTEGER NOT NULL DEFAULT 1,
      default_commission_type TEXT DEFAULT 'percentage',
      default_commission_rate REAL DEFAULT 5,
      approval_mode TEXT NOT NULL DEFAULT 'auto' CHECK(approval_mode IN ('auto','manual')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      UNIQUE(business_id, slug)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS partner_program_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      partner_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending','rejected','suspended')),
      joined_at TEXT DEFAULT (datetime('now')),
      rejected_at TEXT,
      custom_commission_rate REAL,
      notes TEXT,
      FOREIGN KEY (program_id) REFERENCES partner_programs(id),
      FOREIGN KEY (partner_id) REFERENCES affiliates(id),
      UNIQUE(program_id, partner_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS partner_application_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      description TEXT,
      fields TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (program_id) REFERENCES partner_programs(id),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS partner_application_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      program_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      applicant_email TEXT NOT NULL,
      applicant_name TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (form_id) REFERENCES partner_application_forms(id),
      FOREIGN KEY (program_id) REFERENCES partner_programs(id),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS partner_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('image','video','document','link')),
      url TEXT NOT NULL,
      is_watermarked INTEGER NOT NULL DEFAULT 0,
      download_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (program_id) REFERENCES partner_programs(id),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS partner_asset_downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      user_id INTEGER,
      downloaded_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (asset_id) REFERENCES partner_assets(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS partner_content_protection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      business_id INTEGER NOT NULL,
      watermark_enabled INTEGER NOT NULL DEFAULT 0,
      watermark_text TEXT DEFAULT 'ShimmerStock Partner',
      watermark_position TEXT DEFAULT 'bottom-right',
      download_logging_enabled INTEGER NOT NULL DEFAULT 0,
      viewer_overlay_enabled INTEGER NOT NULL DEFAULT 0,
      viewer_overlay_message TEXT DEFAULT 'For authorized partners only',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (program_id) REFERENCES partner_programs(id),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      UNIQUE(program_id, business_id)
    )
  `);

  // Add partner permissions
  const partnerPermRoles = ["owner", "admin", "manager", "marketing", "affiliate_manager"];
  for (const role of partnerPermRoles) {
    db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", [role, "partners.read"]);
  }
  const partnerWriteRoles = ["owner", "admin", "affiliate_manager"];
  for (const role of partnerWriteRoles) {
    db.run("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)", [role, "partners.write"]);
  }

  console.log("Partner HQ 3.0 tables ready (partner_programs, members, applications, assets, content_protection)");

  // ── Affiliate Attribution Engine ──────────────────────────────────
  initAttributionTables(db);


  // ── Customer Store Credit tables ────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_store_credit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL DEFAULT 1,
      customer_email TEXT NOT NULL,
      return_refund_id INTEGER NOT NULL,
      store_credit_code TEXT UNIQUE NOT NULL,
      amount_issued REAL NOT NULL,
      amount_remaining REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      issued_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (return_refund_id) REFERENCES returns_refunds(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_store_credit_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      amount_applied REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (credit_id) REFERENCES customer_store_credit(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  console.log("Customer Store Credit tables ready (customer_store_credit, customer_store_credit_redemptions)");

  // ── Split Shipment tables ──────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS order_shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      shipment_number INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','picking','shipped','delivered')),
      carrier TEXT,
      tracking_number TEXT,
      shipped_at TEXT,
      delivered_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_shipment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL,
      order_item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (shipment_id) REFERENCES order_shipments(id),
      FOREIGN KEY (order_item_id) REFERENCES order_items(id)
    )
  `);

  console.log("Split Shipment tables ready (order_shipments, order_shipment_items)");


  // ── Dream Grant Applications ──────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS dream_grant_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      dream TEXT NOT NULL,
      build TEXT NOT NULL,
      stopping TEXT,
      change_field TEXT NOT NULL,
      mean_field TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      reviewed INTEGER DEFAULT 0
    )
  `);
  console.log("Dream Grant: dream_grant_applications table ready");

  // ── System Settings ─────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.run(`
    INSERT OR IGNORE INTO system_settings (key, value) VALUES ('founding_member_limit', '250')
  `);

  // ── Founding Members ────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS founding_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER UNIQUE,
      plan TEXT,
      claimed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);
  console.log("Founding Members: tables ready");

  console.log("Database initialized:", dbPath || DB_PATH);
  return db;
}
// ── Affiliate Attribution Engine Tables ────────────────────────────────

function initAttributionTables(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_attributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      order_id INTEGER,
      shopify_order_id TEXT,
      shopify_order_number TEXT,
      affiliate_id INTEGER NOT NULL,
      program_id INTEGER,
      attribution_method TEXT NOT NULL CHECK(attribution_method IN ('coupon','referral_link','cookie','manual','import','manual_note')),
      coupon_code_used TEXT,
      referral_link_id INTEGER,
      order_total_cents INTEGER NOT NULL DEFAULT 0,
      eligible_amount_cents INTEGER NOT NULL DEFAULT 0,
      commission_rate REAL NOT NULL DEFAULT 0,
      commission_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','available','reversed','disputed')),
      paid_at TEXT,
      is_self_referral INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (affiliate_id) REFERENCES affiliates(id),
      FOREIGN KEY (program_id) REFERENCES partner_programs(id),
      FOREIGN KEY (referral_link_id) REFERENCES affiliate_referral_links(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_attribution_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      program_id INTEGER,
      cookie_duration_hours INTEGER NOT NULL DEFAULT 720,
      attribution_model TEXT NOT NULL DEFAULT 'last_click' CHECK(attribution_model IN ('first_click','last_click')),
      coupon_overrides_referral INTEGER NOT NULL DEFAULT 1,
      allow_self_referrals INTEGER NOT NULL DEFAULT 0,
      require_fulfillment INTEGER NOT NULL DEFAULT 0,
      require_return_window INTEGER NOT NULL DEFAULT 0,
      return_window_days INTEGER NOT NULL DEFAULT 30,
      repeat_customer_orders_qualify INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (program_id) REFERENCES partner_programs(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_commission_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      program_id INTEGER,
      exclude_shipping INTEGER NOT NULL DEFAULT 1,
      exclude_taxes INTEGER NOT NULL DEFAULT 1,
      exclude_discounts INTEGER NOT NULL DEFAULT 1,
      exclude_gift_cards INTEGER NOT NULL DEFAULT 1,
      exclude_tips INTEGER NOT NULL DEFAULT 1,
      excluded_product_ids TEXT,
      excluded_collection_ids TEXT,
      minimum_order_amount_cents INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (program_id) REFERENCES partner_programs(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_referral_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      affiliate_id INTEGER NOT NULL,
      program_id INTEGER,
      link_code TEXT NOT NULL UNIQUE,
      full_url TEXT NOT NULL,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      click_count INTEGER NOT NULL DEFAULT 0,
      conversion_count INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (affiliate_id) REFERENCES affiliates(id),
      FOREIGN KEY (program_id) REFERENCES partner_programs(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_tracking_cookies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      affiliate_id INTEGER NOT NULL,
      referral_link_id INTEGER,
      cookie_id TEXT NOT NULL UNIQUE,
      visitor_id TEXT NOT NULL,
      clicked_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      converted_at TEXT,
      order_id INTEGER,
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (affiliate_id) REFERENCES affiliates(id),
      FOREIGN KEY (referral_link_id) REFERENCES affiliate_referral_links(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS affiliate_order_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      shopify_order_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('created','updated','cancelled','refunded','fulfilled')),
      raw_payload TEXT NOT NULL DEFAULT '{}',
      processed INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);

  console.log("Affiliate Attribution Engine tables ready (attributions, rules, commission_config, referral_links, tracking_cookies, sync_log)");

  // ── Waitlist ──────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      business_type TEXT,
      current_software TEXT,
      pain_point TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log("Waitlist table ready");

  // ── Early Access applications ───────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS early_access_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      normalized_email TEXT NOT NULL,
      business_name TEXT NOT NULL,
      website_url TEXT,
      what_business_sells TEXT NOT NULL,
      business_category TEXT NOT NULL,
      current_commerce_platform TEXT NOT NULL,
      monthly_order_range TEXT NOT NULL,
      team_size TEXT NOT NULL,
      biggest_operational_challenge TEXT NOT NULL,
      plan_interest TEXT NOT NULL,
      consented_at TEXT NOT NULL,
      privacy_acknowledged INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'public_site',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_early_access_applications_normalized_email
    ON early_access_applications(normalized_email)
  `);
  console.log("Early Access applications table ready");
}
