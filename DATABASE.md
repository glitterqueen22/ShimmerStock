# Database

## Overview

ShimmerStock uses **SQLite** with **WAL (Write-Ahead Logging)** journal mode for development and single-tenant deployment. A migration to **PostgreSQL** is planned for multi-user production environments.

The database file is `shimmerstock.db` in the project root. All schema is defined in `server/db.js` via the `initDb()` function.

## Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `businesses` | Multi-tenant foundation — one row per business |
| `users` | User accounts with password hashes |
| `user_businesses` | Junction: which users belong to which businesses, with role |
| `sessions` | Active authentication sessions |
| `password_reset_tokens` | Password reset flow |
| `role_permissions` | Granular permission sets per role |

### Product & Inventory

| Table | Purpose |
|-------|---------|
| `products` | Base product catalog |
| `product_variants` | SKU-level variants with pricing and stock |
| `inventory_movements` | All stock changes (receiving, production, fulfillment, adjustments) |
| `inventory_reservations` | Reserved stock for orders in progress |
| `inventory_thresholds` | Reorder points and safety stock levels |

### Orders

| Table | Purpose |
|-------|---------|
| `orders` | Customer orders (Shopify-synced and manual) |
| `order_items` | Line items within orders |
| `order_scans` | Barcode scan verification during fulfillment |
| `order_shipments` | Shipment tracking |
| `order_shipment_items` | Items within each shipment |

### Production

| Table | Purpose |
|-------|---------|
| `boms` | Bills of materials (recipes/formulas) |
| `bom_items` | Ingredients within each BOM |
| `production_batches` | Manufacturing runs |
| `batch_movements` | Material consumption and output per batch |
| `formulas` | Calculation formulas |

### Purchasing

| Table | Purpose |
|-------|---------|
| `suppliers` | Supplier/vendor directory |
| `supplier_products` | Products available from each supplier |
| `purchase_orders` | POs generated or imported |
| `po_items` | Line items on purchase orders |
| `receiving_events` | Inventory received against POs |
| `supplier_notes` | Notes and communication log |

### Commerce

| Table | Purpose |
|-------|---------|
| `provider_credentials` | OAuth tokens and API keys per commerce provider |
| `shopify_webhook_deliveries` | Log of incoming Shopify webhooks |
| `shopify_sync_log` | Sync operation audit trail |

### Customer Hub

| Table | Purpose |
|-------|---------|
| `customer_conversations` | Support conversation threads |
| `customer_messages` | Individual messages |
| `customer_notes` | Internal notes on customers |
| `customer_tags` | Customer segmentation tags |
| `returns_refunds` | Return and refund records |
| `customer_store_credit` | Store credit balances |
| `customer_store_credit_redemptions` | Credit usage history |

### Affiliates & Partners

| Table | Purpose |
|-------|---------|
| `affiliates` | Affiliate profiles |
| `affiliate_referrals` | Referral tracking |
| `affiliate_payouts` | Commission payouts |
| `affiliate_attributions` | Attribution records |
| `affiliate_attribution_rules` | Rules for attribution |
| `affiliate_commission_config` | Commission structures |
| `partner_programs` | Partner program definitions |
| `partner_program_members` | Program membership |

### Fulfillment

| Table | Purpose |
|-------|---------|
| `fulfillment_shipments` | Outbound shipments |
| `fulfillment_pack_verifications` | Pack verification scans |
| `fulfillment_templates` | Branded packing templates |
| `fulfillment_unboxing_rules` | Unboxing experience rules |
| `packing_recipes` | Packing instructions per product |

### Warehouse

| Table | Purpose |
|-------|---------|
| `warehouse_bins` | Storage locations |
| `bin_contents` | Items in each bin |
| `warehouse_transfers` | Inter-bin movements |

### Novi (AI Companion)

| Table | Purpose |
|-------|---------|
| `novi_memory` | Long-term memory store |
| `novi_goals` | Business goals Novi tracks |
| `novi_messages` | Conversation history |
| `novi_settings` | Per-business Novi configuration |

### Other

| Table | Purpose |
|-------|---------|
| `business_settings` | Key-value settings per business |
| `system_settings` | Global system configuration |
| `health_snapshots` | Periodic business health scores |
| `opportunities` | Detected business opportunities |
| `dismissed_opportunities` | User-dismissed opportunities |
| `audit_log` | System-wide audit trail |
| `activity_log` | User activity feed |
| `approvals` | Approval workflow items |
| `notifications` | User notifications |
| `onboarding_state` | Per-business onboarding progress |
| `dream_grant_applications` | Dream Grant submissions |
| `founding_members` | Founding member registrations |
| `waitlist` | Beta waitlist signups |

## Migrations

### Current Strategy

Schema is defined in `server/db.js` using `CREATE TABLE IF NOT EXISTS`. Column additions use `ALTER TABLE` with existence checks:

```js
const cols = db.query("PRAGMA table_info(some_table)").all();
if (!cols.some(c => c.name === "new_column")) {
  db.run("ALTER TABLE some_table ADD COLUMN new_column TEXT");
}
```

### Migration Scripts

Structured migrations live in `server/migrations/`. Run them with:

```bash
bun run server/migrations/<name>.js
```

### Adding a New Table

1. Add the `CREATE TABLE IF NOT EXISTS` statement to `server/db.js` inside `initDb()`
2. Add any required indexes
3. If the table needs seed data, add to `server/seed.js`
4. Document the table in this file

### Adding a Column

```js
// In server/db.js, after the table creation block:
const cols = db.query("PRAGMA table_info(existing_table)").all();
if (!cols.some(c => c.name === "new_column")) {
  db.run("ALTER TABLE existing_table ADD COLUMN new_column TEXT DEFAULT 'default_value'");
  console.log("Added new_column to existing_table");
}
```

## Relationships

```
businesses
  ├── users (via user_businesses)
  ├── products → product_variants
  ├── orders → order_items
  ├── production_batches → batch_movements
  ├── purchase_orders → po_items
  ├── suppliers → supplier_products
  ├── warehouse_bins → bin_contents
  ├── affiliates → affiliate_referrals → affiliate_payouts
  └── customer_conversations → customer_messages
```

## Future: PostgreSQL Migration

When migrating to PostgreSQL:

1. Replace `bun:sqlite` with a PostgreSQL driver (e.g., `pg` or `postgres.js`)
2. Convert `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
3. Convert `datetime('now')` → `NOW()`
4. Review all `PRAGMA` statements (WAL, foreign_keys)
5. Add connection pooling
6. Update backup strategy to `pg_dump`
