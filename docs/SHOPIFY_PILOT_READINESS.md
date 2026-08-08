# Shopify Pilot Readiness

**Last updated:** 2026-08-07
**Status:** Preflight complete — awaiting owner approval before installation

---

## EXPLICIT STATEMENTS

**GGE is NOT connected.** The production GGE store is not connected to ShimmerStock in this phase or any prior phase.

**No development store has been installed.** Neither the Craft Supply Test store nor the E-commerce Brand Test store has had the ShimmerStock Read-Only Pilot app installed. This task does not perform any installation.

---

## 1. Approved API Version

| Setting | Value |
|---------|-------|
| Shopify Admin API version | **2026-07** |
| Centralized constant | `SHOPIFY_API_VERSION` in `server/providers/shopify-gateway.js` |
| Exported for import | `export const SHOPIFY_API_VERSION = "2026-07"` |
| Used by | Every REST and GraphQL call through `gatewayFetch()` / `gatewayGraphQL()` |
| Previous value | `2024-01` (removed 2026-08-07) |

**Single source of truth rule:** No other module may declare its own API version constant. `shopify-oauth-routes.js` previously had a dead duplicate `const API_VERSION = "2024-01"` — that has been removed and replaced with an import of `SHOPIFY_API_VERSION`. Tests verify only one version literal exists in gateway source.

---

## 2. Approved OAuth Scopes — Exactly Four

```
read_orders
read_products
read_inventory
read_locations
```

**NOT approved (rejected on receipt):**
- `write_*` — any write scope causes immediate OAuth rejection
- `read_all_orders` — not approved; requires a separate owner-approved scope milestone
- `read_customers`, `read_fulfillments`, `read_checkouts` — not approved
- Any scope not in the exact approved set

**Enforcement:** `verifyGrantedScopes()` in `server/shopify-oauth-routes.js` rejects missing required scopes AND extra unapproved scopes. Both conditions cause immediate token rejection before storage.

---

## 3. REST Read Paths — Active for Pilot

All REST reads go through `gatewayFetch("readonly", ...)` which uses `SHOPIFY_API_VERSION = "2026-07"`.

| # | Feature | Endpoint | Method | Scope Required | Pagination | Pilot Required |
|---|---------|----------|--------|----------------|-----------|----------------|
| 1 | Shop verification | `GET /shop.json` | REST | (token) | None | ✅ Yes — post-OAuth check |
| 2 | Orders import | `GET /orders.json?status=open&limit=250` | REST | `read_orders` | Limit-only (up to 250) | ✅ Yes |
| 3 | Products import | `GET /products.json?limit=250` | REST | `read_products` | Limit-only (up to 250) | ✅ Yes |
| 4 | Variant lookup | `GET /variants/{id}.json` | REST | `read_products` | None | ✅ Yes |
| 5 | Locations list | `GET /locations.json` | REST | `read_locations` | None | ✅ Yes |

**Technical debt — REST reads to migrate before public beta:**
- All five endpoints above use the REST Admin API. The REST Admin API is not deprecated in 2026-07 and these reads remain safe for the private pilot.
- Before public Shopify distribution, these should be migrated to GraphQL (cursor-based pagination, better efficiency, GraphQL-first Shopify direction).
- Pagination for orders and products currently uses `limit=250` only. Stores with >250 records will be incomplete. This must be addressed before public beta via cursor-based GraphQL pagination or REST link-header pagination.

**Blocked write path (present in source, gateway-blocked before network):**
- `POST /inventory_levels/set.json` — exists for `mode === "full"` only, blocked in readonly mode before any network call.

---

## 4. GraphQL Read Paths

`gatewayGraphQL()` is fully implemented and enforced. The gateway correctly classifies:
- `query` → allowed in `readonly` mode
- `mutation` → always blocked in `readonly` mode
- `subscription` → always blocked in all modes
- `unknown`/ambiguous → blocked, fail-closed

**Current state:** No production code path currently sends GraphQL queries. The gateway infrastructure is in place and tested; new read paths should use GraphQL.

**Example ready-to-use shop query:**
```graphql
query {
  shop {
    name
    primaryDomain { url }
    plan { displayName }
  }
}
```

---

## 5. Zero-Write Guarantee

The gateway at `server/providers/shopify-gateway.js` blocks BEFORE any network transmission:

| Blocked Operation | How Blocked |
|-------------------|-------------|
| REST POST | `mode !== "full" && REST_WRITE_METHODS.has(upperMethod)` |
| REST PUT | Same |
| REST PATCH | Same |
| REST DELETE | Same |
| GraphQL mutation | `classifyGraphQLDocument()` returns "mutation" → blocked |
| GraphQL subscription | `classifyGraphQLDocument()` returns "subscription" → always blocked |
| Ambiguous GraphQL | `classifyGraphQLDocument()` returns "unknown" → blocked, fail-closed |

**Fail-closed principle:** When safety cannot be established, block. Do not pass the request.

**Read-Only Early Access statement (shown in all UI surfaces):**

> ShimmerStock will not:
> - Publish products or edit Shopify product listings
> - Change inventory quantities in Shopify
> - Fulfill or cancel orders
> - Issue refunds
> - Contact customers
> - Modify themes or store content

---

## 6. OAuth Safety Protections — Verified Unchanged

All protections in `server/shopify-oauth-routes.js`:

| Protection | Implementation |
|-----------|----------------|
| Random opaque state | `crypto.randomBytes(32).toString("hex")` |
| Server stores only hash | `crypto.createHash("sha256").update(state).digest("hex")` |
| Short TTL | 600 seconds (10 minutes) |
| One-time atomic consume | Deleted on first use; replay rejected |
| Bound to userId | State record includes `user_id` |
| Bound to businessId | State record includes `business_id` |
| Bound to sessionId | State record includes `session_id` |
| Bound to expectedShop | State record includes `expected_shop` |
| HMAC verification | `validateHmac()` with `timingSafeEqual` |
| Constant-time comparison | `crypto.timingSafeEqual()` |
| Scope enforcement | `verifyGrantedScopes()` — exact match required |
| Write scope rejection | Any `write_*` in granted scopes → reject immediately |
| Domain canonicalization | `canonicalizeShopDomain()` — must be `*.myshopify.com` |
| Domain re-validation | `isCanonicalShopDomain()` at every gateway call |

**Canonical domain rule:** Only `*.myshopify.com` domains are accepted. Arbitrary hostnames, IP addresses, and non-Shopify domains are rejected at multiple layers.

---

## 7. Webhook Implementation

| Aspect | Current State |
|--------|--------------|
| Endpoint | `POST /api/shopify/webhooks/:topic` |
| HMAC validation | ✅ `crypto.createHmac("sha256", SHOPIFY_CLIENT_SECRET).update(rawBody).digest("base64")` + `timingSafeEqual` |
| Uses `express.raw()` | ✅ Yes — raw body captured for HMAC before JSON parse |
| Tenant resolution | ✅ Looks up `business_id` from `shop_domain` in `provider_credentials` |
| Idempotency | ✅ `shopify_webhook_deliveries` table — `shopify_id` tracked per delivery |
| Duplicate delivery | ✅ Same `shopify_id` skipped if already processed |
| Retry behavior | ✅ Returns 500 on error so Shopify retries; 200 only on success |
| Topics handled | `orders/create`, `orders/updated`, `orders/cancelled`, `products/update`, `inventory/update`, `app/uninstalled` |
| API version in webhook | Not set by ShimmerStock — Shopify sets webhook API version at registration time |
| Required for first pilot | Conditional — webhooks are not strictly required for a read-only import pilot but are needed for real-time sync |

**Note:** For the first pilot (manual import/sync only), webhooks can be deferred. They become required when real-time sync is added.

---

## 8. Tenant Separation

**Two separate ShimmerStock businesses for the pilot:**

| Business | Store | ShimmerStock Business |
|----------|-------|----------------------|
| Craft Supply Test | `shimmerstock-craft-supply-test.myshopify.com` | Business A |
| E-commerce Brand Test | `shimmerstock-ecommerce-test.myshopify.com` | Business B |

**Separation guarantees to prove in pilot:**
- Business A token cannot be used for Business B API calls (different `business_id` in `provider_credentials`)
- Business A cannot read Business B's orders/products/inventory
- OAuth state is bound to `business_id` — cross-business replay rejected
- Webhook resolution matches `shop_domain` to `business_id` — no cross-tenant delivery
- Sync/reconciliation scoped to `business_id` throughout
- Disconnect removes only that business's credential, leaves others untouched

---

## 9. Development-Store Test Sequence

### Before Installation (This Task — Complete)
- [x] API version updated to 2026-07
- [x] Zero-write gateway verified via tests
- [x] Scope enforcement verified via tests
- [x] OAuth safety verified via tests
- [x] Tenant separation architecture documented
- [x] Read-only UI states implemented
- [x] Pilot readiness checklist documented

### Installation Prerequisites (To Be Confirmed)
- [ ] Branch reviewed, merged to main
- [ ] Deployed to staging environment
- [ ] All P0 checks pass on deployed build
- [ ] Owner approval of this readiness document
- [ ] Both test stores confirmed with fake data only

### Business A — Craft Supply Test
1. Open ShimmerStock Business A settings → Commerce
2. Enter store: `shimmerstock-craft-supply-test.myshopify.com`
3. Initiate OAuth → redirected to Shopify
4. Approve app with exactly 4 scopes (read_orders, read_products, read_inventory, read_locations)
5. Verify granted scopes match exactly — any extra → automatic rejection
6. Import runs: products, variants, orders, locations, inventory
7. **Verify products:** count matches Shopify admin count
8. **Verify variants:** all variants imported, SKUs match
9. **Verify orders:** count matches open orders in Shopify
10. **Verify locations:** count and names match
11. **Verify inventory:** levels match per location
12. **Verify pagination:** no missing records (compare total counts)
13. Attempt to trigger any write operation → confirm blocked before network
14. Disconnect → verify `provider_credentials` deactivated, no further calls

### Business B — E-commerce Brand Test

### Owner-side OAuth verification
1. Confirm the Shopify Dev Dashboard app name is exactly `ShimmerStock Read-Only Pilot`.
2. Confirm the app version is Active/Released.
3. Confirm the Client ID copied from the app Settings page matches the Railway runtime fingerprint.
4. Confirm the redirect URL is exactly `https://shimmerstock-production.up.railway.app/api/shopify/auth/callback`.
5. Confirm the App URL matches the Railway staging URL.
6. Confirm `Craft Supply Test` is the selected development store.
7. Confirm the app is installed on that exact development store.
8. Confirm no attempt is made against GGE.
9. Confirm the Railway variables are set on the correct ShimmerStock service/environment.
10. Confirm Railway redeploy occurred after the most recent variable update.
11. If fingerprints differ, treat it as a Railway runtime-variable mismatch before changing OAuth logic.

### Safe fingerprint check

Run the local/server-side diagnostic:

```bash
bun run shopify:oauth:check
```

To fingerprint a copied Client ID without printing it, read it silently and pipe it through stdin:

```bash
read -rs SHOPIFY_CLIENT_ID_INPUT; printf '\n'; printf '%s' "$SHOPIFY_CLIENT_ID_INPUT" | node scripts/check-shopify-oauth-config.mjs --fingerprint-stdin
unset SHOPIFY_CLIENT_ID_INPUT
```

The diagnostic and the hidden-stdin fingerprint must match before the OAuth app is trusted.

---

## 10. Reconciliation Checklist

For each development store, compare Shopify vs ShimmerStock:

| Resource | Check |
|----------|-------|
| Products | Count matches · IDs match · titles match · statuses match |
| Variants | Count matches · Shopify IDs match · SKUs match · options match |
| Orders | Count matches (within `read_orders` scope, all accessible statuses) · IDs match · order numbers match · financial/fulfillment status match · line items match |
| Locations | Count matches · IDs match · names match |
| Inventory | Item IDs match · levels per location match · location associations match |
| Pagination | No missing records (especially for stores with >250 orders or products) |

**Reconciliation discrepancies that are explainable:**
- Orders excluded if outside Shopify's accessible history window (without read_all_orders)
- ShimmerStock may lag by sync interval (not real-time without webhooks)
- Inventory may differ if updated between sync and verification

---

## 11. Test Sequence for OAuth Safety and Import

```bash
# Run Shopify OAuth/safety tests
ENCRYPTION_KEY=temporary-test-only-value bun test tests/shopify-readonly.test.ts
# Expected: 60 pass, 0 fail

# Run import pipeline tests (state machine, isolation, idempotency, reconciliation)
ENCRYPTION_KEY=temporary-test-only-value bun test tests/shopify-pilot-import.test.ts
# Expected: 32 pass, 0 fail
```

Tests cover: state machine transitions, business isolation, credential mismatch rejection, product/variant/order/location persistence, idempotency, tenant-scoped inventory, reconciliation discrepancy detection, workspace truthfulness, write control gating, scope verification.

---

## 12. Public Beta / Public Shopify Distribution Technical Debt

These items are acceptable for the private development-store pilot but **MUST be completed before public Shopify distribution:**

| Item | Priority | Description |
|------|----------|-------------|
| REST fetchOrders → GraphQL migration | High | `fetchOrders()` in ShopifyProvider still uses REST with status=any; GraphQL import pipeline (shopify-import.js) is the correct path |
| Pagination completeness for REST | High | REST `limit=250` queries may miss records; GraphQL pipeline uses cursor-based 50/page pagination |
| Webhook registration | Medium | Currently not auto-registered; must be set up before real-time sync |
| Webhook API version | Medium | Must be explicitly set to `2026-07` when registering webhooks |
| Shopify App Store review | Required | Public distribution requires Partner Dashboard review |
| Rate limit handling | Medium | Current code does not handle Shopify's leaky-bucket REST rate limit or GraphQL cost limits |
| Error recovery | Medium | Partial sync failures need retry/resume logic |
| Token refresh | Low | Access tokens don't expire but app uninstall detection (via webhook) needs testing |

---

## 13. Import State Machine

States used by `server/shopify-import.js`:

| State | Meaning |
|-------|---------|
| `DISCONNECTED` | No active Shopify credential for this business |
| `CONNECTED` | OAuth succeeded, no import has run yet |
| `IMPORT_PENDING` | Import session created, not yet started |
| `IMPORTING` | Import actively running |
| `RECONCILIATION_REQUIRED` | Import completed with discrepancies between Shopify counts and persisted counts |
| `SYNCED` | Import completed, counts reconciled |
| `IMPORT_FAILED` | Import threw an error |
| `TOKEN_REVOKED` | Shopify returned 401 Unauthorized |
| `CONNECTION_ERROR` | Network or configuration error |

**Critical rule:** `SYNCED` state is only set after the full import completes AND counts match. OAuth connection alone sets `CONNECTED`, not `SYNCED`.

### Import session stored fields:
- `import_started_at` — timestamp when IMPORTING state was entered
- `import_completed_at` — timestamp when final state was reached
- `last_successful_import_at` — timestamp of last SYNCED result
- `shopify_*_count` — counts returned from Shopify
- `persisted_*_count` — counts actually written to ShimmerStock DB
- `discrepancies` — JSON array of error messages
- `reconciliation_status` — `RECONCILED` or `NEEDS_REVIEW`

---

## 14. GraphQL Import Pipeline

Implemented in `server/shopify-import.js`. Uses Shopify Admin GraphQL API 2026-07 via `gatewayGraphQL()`.

### GraphQL queries used:

**Products (cursor-paginated, 50/page):**
```graphql
query {
  products(first: 50, after: "CURSOR") {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id title status
        variants(first: 100) {
          edges { node { id sku barcode title inventoryItem { id } inventoryQuantity } }
        }
      }
    }
  }
}
```

**Locations (cursor-paginated, 50/page):**
```graphql
query {
  locations(first: 50, after: "CURSOR") {
    pageInfo { hasNextPage endCursor }
    edges { node { id name isActive address { formatted } } }
  }
}
```

**Inventory levels per location (cursor-paginated, 50/page):**
```graphql
query {
  location(id: "LOCATION_GID") {
    inventoryLevels(first: 50, after: "CURSOR") {
      pageInfo { hasNextPage endCursor }
      edges { node { available item { id } } }
    }
  }
}
```

**Orders — all accessible statuses (cursor-paginated, 50/page):**
```graphql
query {
  orders(first: 50, after: "CURSOR") {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id name displayFinancialStatus displayFulfillmentStatus createdAt
        customer { firstName lastName email }
        lineItems(first: 100) {
          edges { node { title quantity sku variant { id title } } }
        }
      }
    }
  }
}
```

**No `status` filter** — the `read_orders` scope provides access to all orders within Shopify's default history window. No `read_all_orders` needed or approved.

### Field mappings:

| Shopify field | ShimmerStock field | Table |
|--------------|-------------------|-------|
| `product.id` (GID) | `shopify_product_id` | `products` |
| `product.title` | `name` | `products` |
| `product.status` | `shopify_status` | `products` |
| `variant.id` (GID) | `shopify_variant_id` | `product_variants` |
| `variant.sku` | `sku` | `product_variants` |
| `variant.barcode` | `barcode` | `product_variants` |
| `variant.title` | `variant_value` | `product_variants` |
| `variant.inventoryItem.id` | `shopify_inventory_item_id` | `product_variants` |
| `location.id` (GID) | `shopify_location_id` | `shopify_locations` |
| `location.name` | `name` | `shopify_locations` |
| `location.isActive` | `is_active` | `shopify_locations` |
| `inventoryLevel.item.id` | `shopify_inventory_item_id` | `shopify_inventory_levels` |
| `inventoryLevel.available` | `available` | `shopify_inventory_levels` |
| `order.id` (GID) | `shopify_order_id` | `orders` |
| `order.name` | `order_number` | `orders` |
| `order.displayFinancialStatus` | `financial_status` | `orders` |
| `order.displayFulfillmentStatus` | `fulfillment_status` | `orders` |
| `order.createdAt` | `shopify_created_at` | `orders` |
| `order.customer.{firstName,lastName,email}` | `customer_name`, `customer_email` | `orders` |
| `lineItem.sku` | `sku` | `order_items` |
| `lineItem.variant.title` | `variant_title` | `order_items` |

---

## 15. Dedicated Business Workspace Requirement

The fake Shopify Craft Supply Test store must be imported into a dedicated ShimmerStock business workspace named **"ShimmerStock Craft Supply Test"**, not into a workspace for GGE or any live merchant.

**Enforcement in code:**
- `loadAndValidateCredentials()` in `server/shopify-import.js` queries credentials `WHERE business_id = ?` — a credential can only be loaded by the matching business
- The import endpoint (`POST /api/shopify/import`) validates that the credential's `business_id` matches `req.businessId` before starting any Shopify call
- No silent credential transfer between businesses is possible

**If the current OAuth credential is attached to the wrong business:**
1. Do NOT move the credential silently
2. Steps to correct (after merge/deploy):
   a. Disconnect from the incorrect business: Settings → Commerce → Disconnect
   b. Create/select the "ShimmerStock Craft Supply Test" business
   c. Reauthorize the same fake store under that business via OAuth

---

## 16. Local-Only Record Behavior

During the read-only pilot, "Add Product" and "New Order" buttons create **ShimmerStock-local records only** — they do NOT create or modify anything in Shopify.

This is safe but may complicate reconciliation. Approach chosen:
- Buttons remain enabled for local record creation
- Local records have `shopify_product_id = NULL` and `source = 'manual'`
- Reconciliation only counts records where `shopify_product_id IS NOT NULL` (Shopify-originated)
- Manual records are excluded from Shopify reconciliation reports
- UI note added to Commerce page explaining the distinction

---

## 17. Demo vs Real Workspace Rules

| Workspace State | Products Page | Insight Source |
|----------------|---------------|----------------|
| `empty_real` | No demo insights shown | N/A |
| `demo` | Demo insights shown with "DEMO WORKSPACE" banner | `getDemoInsights()` filtered to `is_demo=true` |
| `real` (has imported products) | Only real insights | `getDemoInsights()` filtered to `is_demo≠true` |
| Connected, import pending | No demo insights | N/A |

**The Products page unconditional demo insight call has been replaced** with `deriveWorkspaceState()` + `filterInsightsByWorkspaceState()`. The "Craft Supplies" demo insight is only shown if the workspace is explicitly in demo mode.

---

## 18. Reconciliation Definitions

| Status | Meaning |
|--------|---------|
| `RECONCILED` | Shopify count matches ShimmerStock count; no duplicates |
| `MISMATCH` | Count difference between Shopify and ShimmerStock |
| `NEEDS_REVIEW` | Variants with missing SKUs or other non-critical issues |
| `NO_IMPORT` | No import has been run yet |

Endpoint: `GET /api/shopify/import/reconciliation` — read-only, returns structured report.

---

## 19. Rollback Procedure

1. Shopify Partner Dashboard → Apps → ShimmerStock Read-Only Pilot → Uninstall from store
2. ShimmerStock Settings → Commerce → Disconnect
3. Verify `provider_credentials` row `is_active = 0` for that business
4. Verify no further API calls in server logs for that shop domain
5. Document in audit log with timestamp
