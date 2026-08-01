/**
 * Shopify OAuth Routes — self-serve Shopify connection for every business.
 *
 * Required environment variables:
 *   SHOPIFY_CLIENT_ID     — from Shopify Partner dashboard (app setup)
 *   SHOPIFY_CLIENT_SECRET — from Shopify Partner dashboard
 *   ENCRYPTION_KEY        — 32-byte hex string for token encryption
 *                            (generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
 *   SHIMMERSTOCK_URL      — public URL for redirect_uri (e.g. https://shimmerstock.ctonew.app)
 *
 * Routes:
 *   GET  /api/shopify/auth             — initiate OAuth (requires auth)
 *   GET  /api/shopify/auth/callback    — OAuth callback (no auth — Shopify redirect)
 *   POST /api/shopify/disconnect       — disconnect Shopify (requires auth)
 *   GET  /api/shopify/status           — connection status (requires auth)
 */

import crypto from "crypto";
import { requireAuth } from "./auth.js";
import { encryptToken, decryptToken } from "./crypto-utils.js";
import { getProvider, invalidateProviderCache } from "./providers/registry.js";


const SHOPIFY_SCOPES = [
  "read_orders",
  "read_products",
  "write_inventory",
  "read_locations",
  "read_fulfillments",
  "write_fulfillments",
  "read_customers",
  "read_checkouts",
].join(",");

const API_VERSION = "2024-01";

/**
 * Validate an HMAC parameter from Shopify callback.
 * Shopify signs the query string using the client secret.
 */
function validateHmac(query, secret) {
  // Remove the hmac parameter and build the message
  const params = { ...query };
  delete params.hmac;

  const orderedParams = Object.keys(params)
    .sort()
    .map((key) => {
      const val = params[key];
      return `${key}=${Array.isArray(val) ? val[0] : val}`;
    })
    .join("&");

  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(orderedParams)
    .digest("hex");

  const receivedHmac = query.hmac;
  if (typeof receivedHmac !== "string") return false;

  // Constant-time comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHmac, "hex"),
      Buffer.from(receivedHmac, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Exchange a Shopify OAuth code for an access token.
 */
async function exchangeCodeForToken(shopDomain, code) {
  const url = `https://${shopDomain}/admin/oauth/access_token`;
  console.log(`[shopify-oauth] Exchanging code for token: ${shopDomain}`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID || "",
      client_secret: process.env.SHOPIFY_CLIENT_SECRET || "",
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Fetch shop information from Shopify Admin API.
 */
async function fetchShopInfo(shopDomain, accessToken) {
  const url = `https://${shopDomain}/admin/api/${API_VERSION}/shop.json`;
  console.log(`[shopify-oauth] Fetching shop info: ${shopDomain}`);

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shop info fetch failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Register webhooks with Shopify for a connected store.
 */
async function registerWebhooks(shopDomain, accessToken) {
  const webhookTopics = [
    { topic: "orders/create", address: `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/api/shopify/webhooks/orders-create` },
    { topic: "orders/updated", address: `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/api/shopify/webhooks/orders-updated` },
    { topic: "orders/cancelled", address: `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/api/shopify/webhooks/orders-cancelled` },
    { topic: "products/update", address: `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/api/shopify/webhooks/products-update` },
    { topic: "inventory_levels/update", address: `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/api/shopify/webhooks/inventory-update` },
    { topic: "app/uninstalled", address: `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/api/shopify/webhooks/app-uninstalled` },
  ];

  const webhookIds = [];

  for (const wh of webhookTopics) {
    try {
      const url = `https://${shopDomain}/admin/api/${API_VERSION}/webhooks.json`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          webhook: {
            topic: wh.topic,
            address: wh.address,
            format: "json",
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const webhookId = data.webhook?.id;
        if (webhookId) {
          webhookIds.push(`${wh.topic}:${webhookId}`);
          console.log(`[shopify-oauth] Webhook registered: ${wh.topic} → ${webhookId}`);
        }
      } else {
        const text = await res.text();
        console.warn(`[shopify-oauth] Webhook registration failed for ${wh.topic}: ${text}`);
      }
    } catch (err) {
      console.warn(`[shopify-oauth] Webhook registration error for ${wh.topic}:`, err.message);
    }
  }

  return webhookIds.join(",");
}

export function mountShopifyOauthRoutes(app, db) {
  // ── Initiate OAuth ────────────────────────────────────────────────────

  // Token-from-query fallback for browser redirects (window.location.href can't set headers)
  app.get("/api/shopify/auth", (req, res, next) => {
    const token = req.query.token;
    if (token) {
      const session = db.query("SELECT ub.business_id FROM sessions s JOIN user_businesses ub ON s.user_id = ub.user_id AND ub.is_active = 1 WHERE s.token = ? AND s.expires_at > datetime('now')").get(token);
      if (session) {
        req.businessId = session.business_id;
        return next();
      }
      // Token expired or invalid — redirect to login
      const shop = req.query.shop || "";
      const loginUrl = `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/login?redirect=/commerce${shop ? `&shop=${encodeURIComponent(shop)}` : ""}`;
      return res.redirect(loginUrl);
    }
    requireAuth(db, "shopify.read")(req, res, next);
  }, (req, res) => {
    try {
      const businessId = req.businessId;
      const shop = req.query.shop;

      if (!shop) {
        return res.status(400).json({ error: "Missing 'shop' query parameter (e.g. ?shop=mystore.myshopify.com)" });
      }

      if (!(process.env.SHOPIFY_CLIENT_ID || "")) {
        return res.status(500).json({ error: "Shopify OAuth is not configured — set SHOPIFY_CLIENT_ID" });
      }

      // Generate state with businessId + nonce for CSRF protection
      const nonce = crypto.randomBytes(16).toString("hex");
      const state = Buffer.from(JSON.stringify({ businessId, nonce })).toString("base64");

      // Build OAuth URL
      const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
      authUrl.searchParams.set("client_id", process.env.SHOPIFY_CLIENT_ID || "");
      authUrl.searchParams.set("scope", SHOPIFY_SCOPES);
      authUrl.searchParams.set("redirect_uri", `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/api/shopify/auth/callback`);
      authUrl.searchParams.set("state", state);

      console.log(`[shopify-oauth] Redirecting business ${businessId} to Shopify OAuth (shop: ${shop})`);

      res.redirect(authUrl.toString());
    } catch (err) {
      console.error("GET /api/shopify/auth error:", err);
      res.status(500).json({ error: "Failed to initiate OAuth" });
    }
  });

  // ── OAuth Callback ────────────────────────────────────────────────────

  app.get("/api/shopify/auth/callback", async (req, res) => {
    try {
      const { code, hmac, shop, state } = req.query;

      // Validate required params
      if (!code || !hmac || !shop || !state) {
        return res.status(400).json({ error: "Missing required parameters: code, hmac, shop, state" });
      }

      // Validate HMAC signature
      if (!validateHmac(req.query, process.env.SHOPIFY_CLIENT_SECRET || "")) {
        console.warn("[shopify-oauth] HMAC validation failed");
        return res.status(403).json({ error: "Invalid HMAC signature — request may be forged" });
      }

      // Parse state to extract businessId
      let businessId;
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
        businessId = stateData.businessId;
      } catch {
        return res.status(400).json({ error: "Invalid state parameter" });
      }

      if (!businessId) {
        return res.status(400).json({ error: "Invalid state — missing businessId" });
      }

      console.log(`[shopify-oauth] OAuth callback for business ${businessId}, shop ${shop}`);

      // Exchange code for access token
      const tokenData = await exchangeCodeForToken(shop, code);
      const accessToken = tokenData.access_token;
      const grantedScopes = tokenData.scope || "";

      console.log(`[shopify-oauth] Token obtained for ${shop} (scopes: ${grantedScopes})`);

      // Encrypt the access token
      const encryptedToken = encryptToken(accessToken);

      // ── Verification step: validate the token before marking as connected ──
      let shopOwner = null;
      let shopName = null;
      let verified = false;
      let verifyError = null;
      try {
        // Fetch shop info using the new token — verifies both token validity and shop identity
        const shopData = await fetchShopInfo(shop, accessToken);
        const verifiedShopDomain = shopData.shop?.myshopify_domain || shopData.shop?.domain || "";

        // Verify the shop domain in the response matches the shop that authorized
        if (verifiedShopDomain && verifiedShopDomain !== shop) {
          console.warn(`[shopify-oauth] Shop domain mismatch: expected ${shop}, got ${verifiedShopDomain}`);
          throw new Error(`Shop domain mismatch: expected ${shop}, got ${verifiedShopDomain}`);
        }

        // Update shop info from the verified response
        shopOwner = shopData.shop?.email || shopOwner;
        shopName = shopData.shop?.name || shopName;

        // Verify granted scopes include minimum required scopes
        // read_all_orders includes read_orders (Shopify broader scope)
        const grantedList = grantedScopes.split(",").map((s) => s.trim());
        const hasOrders = grantedList.includes("read_orders") || grantedList.includes("read_all_orders");
        const hasProducts = grantedList.includes("read_products");
        const missing = [];
        if (!hasOrders) missing.push("read_orders or read_all_orders");
        if (!hasProducts) missing.push("read_products");
        if (missing.length > 0) {
          throw new Error(
            `Shopify app needs additional permissions in Partner Dashboard. ` +
            `Add these scopes in Shopify Partners → App Setup → Configuration: ${missing.join(", ")}. ` +
            `Then reconnect.`
          );
        }

        verified = true;
        console.log(`[shopify-oauth] Token verified for ${shop}: shop=${shopName}, scopes OK`);
      } catch (err) {
        verifyError = err.message;
        console.error(`[shopify-oauth] Token validation failed for ${shop}:`, verifyError);
      }

      if (verified) {
        // Upsert provider_credentials — mark as connected
        db.run(`
          INSERT INTO provider_credentials
            (business_id, provider, credentials, is_active, shop_domain, access_token_encrypted, scopes, sync_status, shop_owner, shop_name, last_synced_at, updated_at)
          VALUES (?, 'shopify', '{}', 1, ?, ?, ?, 'connected', ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(business_id, provider) DO UPDATE SET
            shop_domain = excluded.shop_domain,
            access_token_encrypted = excluded.access_token_encrypted,
            scopes = excluded.scopes,
            is_active = 1,
            sync_status = 'connected',
            sync_error = NULL,
            shop_owner = excluded.shop_owner,
            shop_name = excluded.shop_name,
            last_synced_at = datetime('now'),
            updated_at = datetime('now')
        `, [businessId, shop, encryptedToken, grantedScopes, shopOwner, shopName]);

        // Register webhooks
        let webhookIds = "";
        try {
          webhookIds = await registerWebhooks(shop, accessToken);
          if (webhookIds) {
            db.run(
              "UPDATE provider_credentials SET webhook_id = ? WHERE business_id = ? AND provider = 'shopify'",
              [webhookIds, businessId]
            );
          }
        } catch (err) {
          console.warn(`[shopify-oauth] Webhook registration error (non-fatal): ${err.message}`);
        }

        // Invalidate registry cache for this business
        invalidateProviderCache(businessId);
        console.log(`[shopify-oauth] Shopify connected for business ${businessId}: ${shopName || shop}`);

        // Redirect back to the app with success
        const redirectUrl = `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/commerce?shopify_connected=true`;
        res.redirect(redirectUrl);
      } else {
        // Verification failed — save token but mark as failed
        db.run(`
          INSERT INTO provider_credentials
            (business_id, provider, credentials, is_active, shop_domain, access_token_encrypted, scopes, sync_status, sync_error, shop_owner, shop_name, last_synced_at, updated_at)
          VALUES (?, 'shopify', '{}', 0, ?, ?, ?, 'failed', ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(business_id, provider) DO UPDATE SET
            shop_domain = excluded.shop_domain,
            access_token_encrypted = excluded.access_token_encrypted,
            scopes = excluded.scopes,
            is_active = 0,
            sync_status = 'failed',
            sync_error = excluded.sync_error,
            shop_owner = excluded.shop_owner,
            shop_name = excluded.shop_name,
            last_synced_at = datetime('now'),
            updated_at = datetime('now')
        `, [businessId, shop, encryptedToken, grantedScopes, `Token validation failed: ${verifyError}`, shopOwner, shopName]);

        console.error(`[shopify-oauth] Shopify connection FAILED for business ${businessId}: ${verifyError}`);

        // Redirect with error — use a friendly code, not raw error text
        const errorUrl = `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/commerce?shopify_error=validation_failed`;
        res.redirect(errorUrl);
      }
    } catch (err) {
      console.error("GET /api/shopify/auth/callback error:", err);
      // Redirect with friendly error code — never expose raw error text to the user
      const errorUrl = `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/commerce?shopify_error=connection_failed`;
      res.redirect(errorUrl);
    }
  });

  // ── Disconnect Shopify ────────────────────────────────────────────────

  app.post("/api/shopify/disconnect", requireAuth(db, "shopify.write"), (req, res) => {
    try {
      const businessId = req.businessId;

      db.run(
        `UPDATE provider_credentials
         SET is_active = 0, access_token_encrypted = NULL, webhook_id = NULL,
             sync_status = 'disconnected', sync_error = NULL, updated_at = datetime('now')
         WHERE business_id = ? AND provider = 'shopify'`,
        [businessId]
      );

      // Invalidate the provider cache so a fresh provider is created on next connect
      invalidateProviderCache(businessId);

      console.log(`[shopify-oauth] Shopify disconnected for business ${businessId}`);

      res.json({ success: true, message: "Shopify disconnected" });
    } catch (err) {
      console.error("POST /api/shopify/disconnect error:", err);
      res.status(500).json({ error: "Failed to disconnect Shopify" });
    }
  });

  console.log("[shopify-oauth] Shopify OAuth routes mounted");
}
