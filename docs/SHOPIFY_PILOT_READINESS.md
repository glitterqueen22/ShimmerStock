# Shopify Pilot Readiness

**Version:** Phase 1 · 2026-08-07

## Current Status

- ✅ Craft Supplies Test development store created
- ✅ E-commerce Brand Test development store created  
- ✅ ShimmerStock Read-Only Pilot app created in Shopify Partner Dashboard
- ✅ App configured with exactly four read-only scopes
- ❌ App NOT yet installed on either development store
- ❌ OAuth NOT yet initiated

**Actual installation occurs ONLY after:** branch reviewed, merged, deployed, and pilot-readiness checklist fully approved by owner.

---

## Approved Scopes (READ-ONLY ONLY)

```
read_orders
read_products
read_inventory
read_locations
```

No write scopes are approved. Any write scope appearing in a token must be rejected immediately and the connection revoked.

---

## What ShimmerStock Will NEVER Do (Read-Only Mode)

- Publish products or edit Shopify product listings
- Change inventory quantities in Shopify
- Fulfill or cancel orders
- Issue refunds
- Contact customers
- Modify themes or store content
- Submit GraphQL mutations that change store data

These restrictions are enforced at the gateway layer (`server/shopify.js`) and verified by the safety check (`scripts/check-gateway-bypass.mjs`).

---

## 14 Connection States

All states implemented in `client/src/components/ShopifyPilotReadiness.tsx`:

| State | UI Behavior |
|-------|-------------|
| `disconnected` | "Not connected" — standalone mode info |
| `ready_to_connect` | "Ready" — connection prerequisites met |
| `oauth_starting` | "Starting connection" — Shopify redirect about to happen |
| `connecting` | "Connecting..." — verifying read-only scope |
| `readonly_connected` | "Read-only connected" — green, scopes visible |
| `initial_sync` | "Initial import in progress" — first data import |
| `synced` | "Synced" — data is current |
| `reconciliation_required` | "Reconciliation needed" — data drift detected |
| `reconciliation_complete` | "Reconciliation complete" — aligned |
| `token_revoked` | "Access revoked" — reconnect required |
| `connection_error` | "Connection error" — sync log link shown |
| `reconnecting` | "Reconnecting..." — re-auth in progress |
| `disconnecting` | "Disconnecting..." — removing access |
| `no_write_mode` | "Read-only mode enforced" — write blocked |

---

## Pilot Readiness Checklist (All must be complete before installation)

- [ ] App version and configuration verified
- [ ] Exact four read-only scopes confirmed (no write scopes)
- [ ] Private staging environment is healthy (all P0 checks pass)
- [ ] Fake-data workspaces mapped to separate ShimmerStock businesses
  - Craft Supplies Test → Business A (separate tenant)
  - E-commerce Brand Test → Business B (separate tenant)
- [ ] Tenant-separation tests green
- [ ] Zero-write tests green (all REST write methods and mutations rejected)
- [ ] OAuth / replay / scope tests green
- [ ] Disconnect and rollback documented
- [ ] Owner approval received

---

## Tenant Mapping for Pilot

```
ShimmerStock Business A → Craft Supplies Test (.myshopify.com)
ShimmerStock Business B → E-commerce Brand Test (.myshopify.com)
```

These are never mixed. A credential for Business A cannot be used for Business B requests. This is enforced by the central Shopify gateway.

---

## Rollback Procedure

If the pilot connection must be removed:

1. Go to Shopify Partner Dashboard → Apps → ShimmerStock Read-Only Pilot
2. Uninstall from development store
3. In ShimmerStock Settings → Commerce → Disconnect
4. Verify `provider_credentials` table entry is deactivated for that business
5. Verify sync log shows no further Shopify API calls from that business
6. Document in audit log
