/**
 * Commerce Routes — P4.2 Commerce Expansion
 *
 * Multi-provider commerce endpoints:
 *   GET  /api/commerce/providers — list all providers with status
 *   POST /api/commerce/providers/:provider/connect — save credentials
 *   POST /api/commerce/providers/:provider/sync — sync orders & products
 *   POST /api/commerce/sync-all — sync all active providers
 *   GET  /api/commerce/providers/:provider/status — connection status
 */

import { getProvider as getShopifyProvider } from "./providers/registry.js";
import * as commerceRegistry from "./commerce/index.js";
import { requireAuth } from "./auth.js";
import * as sync from "./sync.js";
import * as store from "./store.js";

export function mountCommerceRoutes(app, db) {
  // ── List all available providers ────────────────────────────────────

  app.get("/api/commerce/providers", requireAuth(db, "shopify.read"), (req, res) => {
    try {
      const providers = commerceRegistry.listProviders();
      const businessId = req.businessId || 1;

      // Get stored credentials for this business
      const storedCreds = db
        .query(
          "SELECT provider, is_active, last_synced_at, sync_status, sync_error FROM provider_credentials WHERE business_id = ?"
        )
        .all(businessId);

      const credsMap = {};
      for (const row of storedCreds) {
        credsMap[row.provider] = row;
      }

      const result = providers.map((p) => {
        const stored = credsMap[p.slug];
        let connectionStatus = "not_connected";
        let syncStatus = stored?.sync_status || null;
        let syncError = stored?.sync_error || null;

        if (p.slug === "shopify") {
          // Shopify uses the real provider
          const storedShopify = db
            .query(
              "SELECT sync_status, sync_error, last_synced_at, is_active FROM provider_credentials WHERE business_id = ? AND provider = 'shopify'"
            )
            .get(businessId);
          syncStatus = storedShopify?.sync_status || syncStatus;
          syncError = storedShopify?.sync_error || syncError;
          connectionStatus = syncStatus === "connected" || syncStatus === "syncing" || syncStatus === "synced"
            ? "connected"
            : syncStatus === "pending"
              ? "pending_validation"
              : syncStatus === "failed" || syncStatus === "error"
                ? "failed"
                : "not_connected";
        } else if (stored && stored.is_active) {
          connectionStatus = "connected";
        }

        return {
          ...p,
          connectionStatus,
          syncStatus,
          syncError,
          isActive: stored ? stored.is_active : false,
          lastSyncedAt: stored ? stored.last_synced_at : null,
        };
      });

      res.json(result);
    } catch (err) {
      console.error("GET /api/commerce/providers error:", err);
      res.status(500).json({ error: "Failed to fetch providers" });
    }
  });

  // ── Connect / save credentials for a provider ───────────────────────

  app.post(
    "/api/commerce/providers/:provider/connect",
    requireAuth(db, "shopify.write_inventory"),
    (req, res) => {
      try {
        const { provider } = req.params;
        const { credentials, isActive } = req.body;
        const businessId = req.businessId || 1;

        // Validate provider exists
        const meta = commerceRegistry.getProviderMeta(provider);
        if (!meta) {
          return res.status(400).json({ error: `Unknown provider: ${provider}` });
        }

        const credsJson = JSON.stringify(credentials || {});

        db.run(
          `INSERT INTO provider_credentials (business_id, provider, credentials, is_active, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(business_id, provider) DO UPDATE SET
             credentials = excluded.credentials,
             is_active = COALESCE(?, excluded.is_active),
             updated_at = datetime('now')`,
          [businessId, provider, credsJson, isActive ? 1 : 0, isActive ? 1 : 0]
        );

        console.log(
          `[commerce] Provider connected: ${provider} for business ${businessId} (active: ${isActive ? "yes" : "no"})`
        );

        // Invalidate registry cache for this business
        invalidateProviderCache(businessId);

        res.json({
          success: true,
          provider,
          isActive: isActive || false,
          message: `Connected to ${meta.label}`,
        });
      } catch (err) {
        console.error(`POST /api/commerce/providers/${req.params.provider}/connect error:`, err);
        res.status(500).json({ error: "Failed to connect provider" });
      }
    });

  // ── Get provider connection status ──────────────────────────────────

  app.get(
    "/api/commerce/providers/:provider/status",
    requireAuth(db, "shopify.read"),
    (req, res) => {
      try {
        const { provider } = req.params;
        const businessId = req.businessId || 1;

        if (provider === "shopify") {
          const status = getShopifyProvider(businessId, db).getStatus();
          return res.json({
            provider: "shopify",
            configured: status.configured,
            mode: status.mode,
            canWrite: status.canWrite,
            label: "Shopify",
          });
        }

        const meta = commerceRegistry.getProviderMeta(provider);
        if (!meta) {
          return res.status(400).json({ error: `Unknown provider: ${provider}` });
        }

        const stored = db
          .query(
            "SELECT is_active, last_synced_at FROM provider_credentials WHERE business_id = ? AND provider = ?"
          )
          .get(businessId, provider);

        const simStatus = commerceRegistry.getProviderStatus(provider);

        res.json({
          provider,
          configured: simStatus?.configured || false,
          mode: simStatus?.mode || "simulated",
          canWrite: simStatus?.canWrite || false,
          label: meta.label,
          isActive: stored?.is_active || false,
          lastSyncedAt: stored?.last_synced_at || null,
        });
      } catch (err) {
        console.error(`GET /api/commerce/providers/${req.params.provider}/status error:`, err);
        res.status(500).json({ error: "Failed to get provider status" });
      }
    });

  // ── Sync orders & products from a specific provider ─────────────────

  app.post(
    "/api/commerce/providers/:provider/sync",
    requireAuth(db, "shopify.sync"),
    async (req, res) => {
      try {
        const { provider } = req.params;
        const businessId = req.businessId || 1;

        // Shopify: delegate to existing sync route logic
        if (provider === "shopify") {
          const shopifyProvider = getShopifyProvider(businessId, db);
          const status = shopifyProvider.getStatus();

          if (!status.configured) {
            return res.status(400).json({
              success: false,
              error: "Shopify is not configured — set SHOPIFY_API_TOKEN",
            });
          }

          const orders = await shopifyProvider.fetchOrders();
          const products = await shopifyProvider.fetchProducts();
          const importedOrders = [];

          for (const order of orders) {
            const orderKey = sync.idempotencyKey("import_order", order.orderId);
            if (sync.isDuplicate(db, businessId, orderKey)) continue;

            const existing = store.getOrderByShopifyId(db, order.orderId, businessId);
            if (existing) continue;

            const orderNumber =
              order.orderNumber ||
              (await store.getNextOrderNumber(db, businessId));

            store.createOrder(db, {
              businessId,
              shopifyOrderId: order.orderId,
              orderNumber,
              customerName: order.customerName,
              source: "shopify",
              status: "pending",
            });

            const dbOrder = store.getOrderByShopifyId(db, order.orderId, businessId);
            if (dbOrder) {
              for (const item of order.lineItems) {
                store.createOrderItem(db, {
                  orderId: dbOrder.id,
                  sku: item.sku,
                  variantTitle: item.variantTitle,
                  quantity: item.quantity,
                  businessId,
                });
              }
            }

            sync.logSync(db, {
              businessId,
              idempotencyKey: orderKey,
              action: "import_order",
              shopifyOrderId: order.orderId,
              provider: "shopify",
              externalId: order.orderId,
              entityType: "order",
              entityId: dbOrder?.id || null,
              status: "success",
              details: { order_number: order.orderNumber },
            });

            importedOrders.push(order.orderNumber);
          }

          // Update last synced timestamp
          db.run(
            `INSERT INTO provider_credentials (business_id, provider, credentials, is_active, last_synced_at, updated_at, sync_status)
             VALUES (?, 'shopify', '{}', 1, datetime('now'), datetime('now'), 'synced')
             ON CONFLICT(business_id, provider) DO UPDATE SET
               last_synced_at = datetime('now'),
               updated_at = datetime('now'),
               sync_status = 'synced',
               sync_error = NULL`,
            [businessId]
          );

          return res.json({
            success: true,
            provider: "shopify",
            ordersImported: importedOrders.length,
            productsFetched: products.length,
            orderNumbers: importedOrders,
          });
        }

        // ── Simulated providers ──────────────────────────────────────────

        const adapter = commerceRegistry.getAdapter(provider);
        if (!adapter) {
          return res.status(400).json({ error: `Unknown provider: ${provider}` });
        }

        // Get stored credentials
        const stored = db
          .query(
            "SELECT credentials, is_active FROM provider_credentials WHERE business_id = ? AND provider = ?"
          )
          .get(businessId, provider);

        const credentials = stored ? JSON.parse(stored.credentials || "{}") : {};

        // Fetch from simulated adapter
        const orders = await adapter.syncOrders(credentials);
        const products = await adapter.syncProducts(credentials);

        const importedOrders = [];

        for (const order of orders) {
          const orderKey = sync.idempotencyKey("import_order", order.orderId);

          if (sync.isDuplicate(db, businessId, orderKey)) continue;

          const existing = store.getOrderByShopifyId(db, order.orderId, businessId);
          if (existing) continue;

          const orderNumber =
            order.orderNumber ||
            (await store.getNextOrderNumber(db, businessId));

          store.createOrder(db, {
            businessId,
            shopifyOrderId: order.orderId,
            orderNumber,
            customerName: order.customerName,
            source: provider,
            status: "pending",
          });

          const dbOrder = store.getOrderByShopifyId(db, order.orderId, businessId);
          if (dbOrder) {
            for (const item of order.lineItems) {
              store.createOrderItem(db, {
                orderId: dbOrder.id,
                sku: item.sku,
                variantTitle: item.variantTitle,
                quantity: item.quantity,
                businessId,
              });
            }
          }

          sync.logSync(db, {
            businessId,
            idempotencyKey: orderKey,
            action: "import_order",
            shopifyOrderId: order.orderId,
            provider,
            externalId: order.orderId,
            entityType: "order",
            entityId: dbOrder?.id || null,
            status: "success",
            details: { order_number: order.orderNumber },
          });

          importedOrders.push(order.orderNumber);
        }

        // Update last synced timestamp
        db.run(
          `INSERT INTO provider_credentials (business_id, provider, credentials, is_active, last_synced_at, updated_at, sync_status)
           VALUES (?, ?, ?, 1, datetime('now'), datetime('now'), 'synced')
           ON CONFLICT(business_id, provider) DO UPDATE SET
             last_synced_at = datetime('now'),
             updated_at = datetime('now'),
             sync_status = 'synced',
             sync_error = NULL`,
          [businessId, provider, JSON.stringify(credentials)]
        );

        console.log(
          `[commerce] Synced ${provider}: ${importedOrders.length} orders, ${products.length} products`
        );

        res.json({
          success: true,
          provider,
          ordersImported: importedOrders.length,
          productsFetched: products.length,
          orderNumbers: importedOrders,
          simulated: true,
        });
      } catch (err) {
        console.error(
          `POST /api/commerce/providers/${req.params.provider}/sync error:`,
          err
        );
        res.status(500).json({
          success: false,
          error: `Failed to sync ${req.params.provider}: ${err.message}`,
        });
      }
    }
  );

  // ── Sync all active providers ───────────────────────────────────────

  app.post(
    "/api/commerce/sync-all",
    requireAuth(db, "shopify.sync"),
    async (req, res) => {
      try {
        const businessId = req.businessId || 1;
        const results = [];

        // Shopify sync
        try {
          const shopifyProvider = getShopifyProvider(businessId, db);
          const status = shopifyProvider.getStatus();
          if (status.configured) {
            const orders = await shopifyProvider.fetchOrders();
            const products = await shopifyProvider.fetchProducts();
            let imported = 0;

            for (const order of orders) {
              const orderKey = sync.idempotencyKey("import_order", order.orderId);
              if (sync.isDuplicate(db, businessId, orderKey)) continue;
              const existing = store.getOrderByShopifyId(db, order.orderId, businessId);
              if (existing) continue;

              const orderNumber =
                order.orderNumber ||
                (await store.getNextOrderNumber(db, businessId));

              store.createOrder(db, {
                businessId,
                shopifyOrderId: order.orderId,
                orderNumber,
                customerName: order.customerName,
                source: "shopify",
                status: "pending",
              });

              const dbOrder = store.getOrderByShopifyId(db, order.orderId, businessId);
              if (dbOrder) {
                for (const item of order.lineItems) {
                  store.createOrderItem(db, {
                    orderId: dbOrder.id,
                    sku: item.sku,
                    variantTitle: item.variantTitle,
                    quantity: item.quantity,
                    businessId,
                  });
                }
              }

              sync.logSync(db, {
                businessId,
                idempotencyKey: orderKey,
                action: "import_order",
                shopifyOrderId: order.orderId,
                provider: "shopify",
                externalId: order.orderId,
                entityType: "order",
                entityId: dbOrder?.id || null,
                status: "success",
                details: { order_number: order.orderNumber },
              });

              imported++;
            }

            results.push({
              provider: "shopify",
              success: true,
              ordersImported: imported,
              productsFetched: products.length,
            });
          }
        } catch (err) {
          results.push({ provider: "shopify", success: false, error: err.message });
        }

        // Simulated providers — only sync active ones
        const activeProviderRows = db
          .query(
            "SELECT provider, credentials FROM provider_credentials WHERE business_id = ? AND is_active = 1 AND provider != 'shopify'"
          )
          .all(businessId);

        for (const row of activeProviderRows) {
          try {
            const adapter = commerceRegistry.getAdapter(row.provider);
            if (!adapter) {
              results.push({ provider: row.provider, success: false, error: "No adapter found" });
              continue;
            }

            const credentials = JSON.parse(row.credentials || "{}");
            const orders = await adapter.syncOrders(credentials);
            const products = await adapter.syncProducts(credentials);
            let imported = 0;

            for (const order of orders) {
              const orderKey = sync.idempotencyKey("import_order", order.orderId);
              if (sync.isDuplicate(db, businessId, orderKey)) continue;
              const existing = store.getOrderByShopifyId(db, order.orderId, businessId);
              if (existing) continue;

              const orderNumber =
                order.orderNumber ||
                (await store.getNextOrderNumber(db, businessId));

              store.createOrder(db, {
                businessId,
                shopifyOrderId: order.orderId,
                orderNumber,
                customerName: order.customerName,
                source: row.provider,
                status: "pending",
              });

              const dbOrder = store.getOrderByShopifyId(db, order.orderId, businessId);
              if (dbOrder) {
                for (const item of order.lineItems) {
                  store.createOrderItem(db, {
                    orderId: dbOrder.id,
                    sku: item.sku,
                    variantTitle: item.variantTitle,
                    quantity: item.quantity,
                    businessId,
                  });
                }
              }

              sync.logSync(db, {
                businessId,
                idempotencyKey: orderKey,
                action: "import_order",
                shopifyOrderId: order.orderId,
                provider: row.provider,
                externalId: order.orderId,
                entityType: "order",
                entityId: dbOrder?.id || null,
                status: "success",
                details: { order_number: order.orderNumber },
              });

              imported++;
            }

            db.run(
              "UPDATE provider_credentials SET last_synced_at = datetime('now'), updated_at = datetime('now'), sync_status = 'synced', sync_error = NULL WHERE business_id = ? AND provider = ?",
              [businessId, row.provider]
            );

            results.push({
              provider: row.provider,
              success: true,
              ordersImported: imported,
              productsFetched: products.length,
              simulated: true,
            });
          } catch (err) {
            results.push({ provider: row.provider, success: false, error: err.message });
          }
        }

        console.log(
          `[commerce] Sync-all complete for business ${businessId}: ${results.length} providers`
        );

        res.json({ success: true, results });
      } catch (err) {
        console.error("POST /api/commerce/sync-all error:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  console.log("[commerce-routes] P4.2 Commerce routes mounted");
}
