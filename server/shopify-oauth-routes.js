/**
 * Shopify OAuth Routes — self-serve Shopify connection for every business.
 *
 * Required environment variables:
 *   SHOPIFY_CLIENT_ID     — from Shopify Partner dashboard (app setup)
 *   SHOPIFY_CLIENT_SECRET — from Shopify Partner dashboard
 *   ENCRYPTION_KEY        — 32-byte hex string for token encryption
 *   SHIMMERSTOCK_URL      — public URL for redirect_uri
 *
 * Routes:
 *   GET  /api/shopify/auth             — initiate OAuth (requires auth)
 *   GET  /api/shopify/auth/callback    — OAuth callback (no auth — Shopify redirect)
 *   POST /api/shopify/disconnect       — disconnect Shopify (requires auth)
 *   GET  /api/shopify/status           — connection status (requires auth)
 *
 * Security:
 *   - State is a random opaque token; only its SHA-256 hash is stored server-side.
 *   - State is bound to: userId, businessId, sessionId, expectedShop, expiry.
 *   - State is consumed atomically (one-time use).
 *   - No Shopify write or webhook mutation occurs during OAuth connect.
 *   - Granted scopes are verified before the token is activated.
 *   - Any write_* scope in the granted set causes immediate rejection.
 *   - Missing required read scopes cause immediate rejection.
 *   - Token and authorization headers are never logged.
 */

import crypto from "crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { requireAuth } from "./auth.js";
import { encryptToken } from "./crypto-utils.js";
import { getProvider, invalidateProviderCache } from "./providers/registry.js";
import { canonicalizeShopDomain, isCanonicalShopDomain } from "./providers/shopify-domain.js";
import { gatewayFetch } from "./providers/shopify-gateway.js";

// ── Rate limiters for OAuth endpoints ──────────────────────────────────────

/** Rate limit for OAuth initiation: 10 requests per IP per 5 minutes. */
const oauthInitLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OAuth requests — please wait and try again" },
  keyGenerator: (req) => ipKeyGenerator(req),
});

/** Rate limit for OAuth callback: 20 requests per IP per 5 minutes. */
const oauthCallbackLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OAuth callback requests — please wait and try again" },
  keyGenerator: (req) => ipKeyGenerator(req),
});


// ── P0 OAuth scope policy ────────────────────────────────────────────────────
// Exactly these four read scopes — no more, no fewer.

const REQUIRED_SCOPES = ["read_orders", "read_products", "read_inventory", "read_locations"];
const SHOPIFY_SCOPES = REQUIRED_SCOPES.join(",");

// P0 policy: the approved set is exactly REQUIRED_SCOPES — no additional scopes.
// read_all_orders is NOT approved for P0; it belongs in a separate owner-approved scope milestone.
const APPROVED_SCOPES = new Set(REQUIRED_SCOPES);

const API_VERSION = "2024-01";

// ── OAuth state TTL ────────────────────────────────────────────────────────
const STATE_TTL_SECONDS = 600; // 10 minutes

// ── Canonical shop domain validation ──────────────────────────────────────

export { canonicalizeShopDomain };

/**
 * Validate that a shop string is a canonical *.myshopify.com domain.
 * Always normalizes to lowercase before testing.
 * Rejects anything that is not exactly one subdomain label followed by .myshopify.com.
 *
 * @param {string} shop
 * @returns {boolean}
 */
function isValidShopDomain(shop) {
  return isCanonicalShopDomain(shop);
}

// ── HMAC validation ───────────────────────────────────────────────────────

/**
 * Validate an HMAC parameter from Shopify callback.
 * Shopify signs the query string using the client secret.
 * Excludes 'hmac' and legacy 'signature' from the signed parameter set.
 */
function validateHmac(query, secret) {
  const params = { ...query };
  delete params.hmac;
  delete params.signature; // legacy Shopify parameter — excluded from signing

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

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHmac, "hex"),
      Buffer.from(receivedHmac, "hex")
    );
  } catch {
    return false;
  }
}

// ── Token exchange ────────────────────────────────────────────────────────

/**
 * Exchange a Shopify OAuth code for an access token.
 * Never logs the token or client secret values.
 */
async function exchangeCodeForToken(shopDomain, code) {
  const normalizedShopDomain = canonicalizeShopDomain(shopDomain);
  // Defense-in-depth: assert canonical Shopify domain before constructing the URL.
  // The shopDomain should already have been validated by isValidShopDomain() in the caller,
  // but we re-validate here to prevent any accidental code path that skips that check.
  if (!isCanonicalShopDomain(normalizedShopDomain)) {
    throw new Error("Invalid shop domain — must be a canonical *.myshopify.com domain");
  }
  const url = `https://${normalizedShopDomain}/admin/oauth/access_token`;
  console.log(`[shopify-oauth] Exchanging code for token: ${normalizedShopDomain}`);

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
    throw new Error(`Token exchange failed (${res.status})`);
  }

  return res.json();
}

/**
 * Fetch shop information from Shopify Admin API.
 * Never logs the access token.
 */
async function fetchShopInfo(shopDomain, accessToken) {
  console.log(`[shopify-oauth] Verifying shop identity: ${shopDomain}`);
  // Route through centralized gateway — GET is always allowed, token never logged.
  return gatewayFetch("readonly", shopDomain, accessToken, "GET", "/shop.json");
}

// ── Scope verification ────────────────────────────────────────────────────

/**
 * Verify granted scopes against P0 policy:
 *  - No write_* scope is permitted.
 *  - Granted scopes must exactly match APPROVED_SCOPES (same as REQUIRED_SCOPES for P0).
 *  - All REQUIRED_SCOPES must be present.
 *
 * Exported for unit testing.
 *
 * @param {string} grantedScopeString — comma-separated scope string from Shopify
 * @returns {{ ok: boolean, error?: string, verifiedScopes: string[] }}
 */
export function verifyGrantedScopes(grantedScopeString) {
  const grantedList = (grantedScopeString || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Reject any write scope
  const writeScopesFound = grantedList.filter((s) => s.startsWith("write_"));
  if (writeScopesFound.length > 0) {
    return {
      ok: false,
      error: `Connection rejected: Shopify granted write scopes that are not permitted: ${writeScopesFound.join(", ")}`,
      verifiedScopes: [],
    };
  }

  // Reject any scope that is not in the approved P0 set (least privilege).
  const extraScopes = grantedList.filter((s) => !APPROVED_SCOPES.has(s));
  if (extraScopes.length > 0) {
    return {
      ok: false,
      error: `Connection rejected: Shopify granted unapproved scopes: ${extraScopes.join(", ")}`,
      verifiedScopes: [],
    };
  }

  // Check all required scopes are present
  const missing = REQUIRED_SCOPES.filter((req) => !grantedList.includes(req));

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Connection rejected: missing required scopes: ${missing.join(", ")}`,
      verifiedScopes: [],
    };
  }

  return { ok: true, verifiedScopes: grantedList };
}

// ── State management ──────────────────────────────────────────────────────

/**
 * Create and persist a new OAuth state record.
 * Returns the opaque state token (to be placed in the URL).
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} userId
 * @param {number} businessId
 * @param {number|null} sessionId
 * @param {string} expectedShop
 * @returns {string} opaque state token
 */
function createOAuthState(db, userId, businessId, sessionId, expectedShop) {
  const stateToken = crypto.randomBytes(32).toString("hex");
  const stateHash = crypto.createHash("sha256").update(stateToken).digest("hex");
  const expiresAt = new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString();

  db.run(
    `INSERT INTO shopify_oauth_state (state_hash, user_id, business_id, session_id, expected_shop, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [stateHash, userId, businessId, sessionId ?? null, expectedShop, expiresAt]
  );

  return stateToken;
}

/**
 * Validate and atomically consume an OAuth state token.
 *
 * Checks:
 *  - State hash exists in DB
 *  - Not already consumed (used_at IS NULL)
 *  - Not expired (expires_at > now)
 *  - expectedShop matches the shop in the callback
 *  - businessId matches (caller must also verify userId binding if needed)
 *
 * @param {import("bun:sqlite").Database} db
 * @param {string} stateToken
 * @param {string} callbackShop
 * @returns {{ ok: boolean, error?: string, record?: object }}
 */
function consumeOAuthState(db, stateToken, callbackShop) {
  if (!stateToken || typeof stateToken !== "string") {
    return { ok: false, error: "Missing state token" };
  }

  const stateHash = crypto.createHash("sha256").update(stateToken).digest("hex");
  const record = db
    .query("SELECT * FROM shopify_oauth_state WHERE state_hash = ?")
    .get(stateHash);

  if (!record) {
    return { ok: false, error: "Unknown or replayed state — request rejected" };
  }

  if (record.used_at !== null) {
    return { ok: false, error: "State already consumed — replay rejected" };
  }

  const now = new Date();
  const expiresAt = new Date(record.expires_at);
  if (expiresAt < now) {
    return { ok: false, error: "State expired — please restart the OAuth flow" };
  }

  if (record.expected_shop !== callbackShop) {
    return {
      ok: false,
      error: `Shop mismatch: expected ${record.expected_shop}, got ${callbackShop}`,
    };
  }

  // Validate that the initiating session is still valid and still belongs to the
  // expected user (guards against session invalidation between initiation and callback).
  if (record.session_id) {
    const session = db
      .query(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      )
      .get(record.session_id);

    if (!session) {
      return { ok: false, error: "Session mismatch — initiating session is no longer valid" };
    }

    if (session.user_id !== record.user_id) {
      return { ok: false, error: "User mismatch — session user does not match state user" };
    }
  }

  // Validate that the business still belongs to the initiating user.
  if (record.business_id && record.user_id) {
    const bizLink = db
      .query(
        "SELECT 1 FROM user_businesses WHERE user_id = ? AND business_id = ? AND is_active = 1"
      )
      .get(record.user_id, record.business_id);

    if (!bizLink) {
      return { ok: false, error: "Business mismatch — user is no longer associated with this business" };
    }
  }

  // Atomically mark as used — only one call can succeed (UPDATE returns changes=1)
  const result = db.run(
    "UPDATE shopify_oauth_state SET used_at = datetime('now') WHERE state_hash = ? AND used_at IS NULL",
    [stateHash]
  );

  if (result.changes !== 1) {
    return { ok: false, error: "State already consumed (race condition) — replay rejected" };
  }

  return { ok: true, record };
}

// ── Route mounting ────────────────────────────────────────────────────────

export function mountShopifyOauthRoutes(app, db) {
  // ── Initiate OAuth ────────────────────────────────────────────────────

  app.get("/api/shopify/auth", oauthInitLimiter, requireAuth(db, "shopify.read"), (req, res) => {
    try {
      const userId = req.user?.id;
      const businessId = req.businessId;
      const sessionId = req.sessionId ?? null;
      // Canonicalize to lowercase at the input boundary
      const shop = canonicalizeShopDomain(req.query.shop);

      if (!shop) {
        return res.status(400).json({ error: "Missing 'shop' query parameter (e.g. ?shop=mystore.myshopify.com)" });
      }

      if (!isValidShopDomain(shop)) {
        return res.status(400).json({ error: "Invalid shop domain — must be a canonical *.myshopify.com domain" });
      }

      if (!(process.env.SHOPIFY_CLIENT_ID || "")) {
        return res.status(500).json({ error: "Shopify OAuth is not configured — set SHOPIFY_CLIENT_ID" });
      }

      if (!userId || !businessId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Create opaque state bound to user + business + session + shop
      const stateToken = createOAuthState(db, userId, businessId, sessionId, shop);

      const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
      authUrl.searchParams.set("client_id", process.env.SHOPIFY_CLIENT_ID || "");
      authUrl.searchParams.set("scope", SHOPIFY_SCOPES);
      authUrl.searchParams.set("redirect_uri", `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/api/shopify/auth/callback`);
      authUrl.searchParams.set("state", stateToken);

      const destination = authUrl.toString();
      console.log(`[shopify-oauth] Redirecting business ${businessId} to Shopify OAuth (shop: ${shop})`);
      if (req.query.format === "json") {
        return res.json({ authUrl: destination });
      }
      res.redirect(destination);
    } catch (err) {
      console.error("GET /api/shopify/auth error:", err.message);
      res.status(500).json({ error: "Failed to initiate OAuth" });
    }
  });

  // ── OAuth Callback ────────────────────────────────────────────────────

  app.get("/api/shopify/auth/callback", oauthCallbackLimiter, async (req, res) => {
    try {
      const { code, hmac, state } = req.query;
      // Canonicalize shop domain at the callback boundary
      const shop = canonicalizeShopDomain(req.query.shop);

      if (!code || !hmac || !shop || !state) {
        return res.status(400).json({ error: "Missing required parameters: code, hmac, shop, state" });
      }

      // Validate canonical shop domain
      if (!isValidShopDomain(shop)) {
        return res.status(400).json({ error: "Invalid shop domain in callback" });
      }

      // Validate HMAC signature — constant-time, excludes 'signature' legacy param
      if (!validateHmac(req.query, process.env.SHOPIFY_CLIENT_SECRET || "")) {
        console.warn("[shopify-oauth] HMAC validation failed");
        return res.status(403).json({ error: "Invalid HMAC signature — request may be forged" });
      }

      // Validate and atomically consume the state token
      const stateResult = consumeOAuthState(db, state, shop);
      if (!stateResult.ok) {
        console.warn(`[shopify-oauth] State validation failed: ${stateResult.error}`);
        return res.status(400).json({ error: stateResult.error });
      }

      const { record: stateRecord } = stateResult;
      const businessId = stateRecord.business_id;

      console.log(`[shopify-oauth] OAuth callback for business ${businessId}, shop ${shop}`);

      // Exchange code for access token — token value never logged
      const tokenData = await exchangeCodeForToken(shop, code);
      const accessToken = tokenData.access_token;
      const grantedScopeString = tokenData.scope || "";

      // Verify granted scopes — reject write scopes and missing required reads
      const scopeCheck = verifyGrantedScopes(grantedScopeString);
      if (!scopeCheck.ok) {
        console.error(`[shopify-oauth] Scope verification failed for ${shop}: ${scopeCheck.error}`);
        return res.status(403).json({ error: scopeCheck.error });
      }

      // Persist only the exact verified scope list
      const verifiedScopeString = scopeCheck.verifiedScopes.join(",");

      // Encrypt the access token — value never stored or logged in plaintext
      const encryptedToken = encryptToken(accessToken);

      // Verify shop identity and token validity before activating
      let shopOwner = null;
      let shopName = null;
      let verified = false;
      let verifyError = null;

      try {
        const shopData = await fetchShopInfo(shop, accessToken);
        // Normalize the verified domain to lowercase for comparison
        const verifiedShopDomain = canonicalizeShopDomain(
          shopData.shop?.myshopify_domain || shopData.shop?.domain || ""
        );

        if (verifiedShopDomain && verifiedShopDomain !== shop) {
          throw new Error(`Shop identity mismatch: state says ${shop}, Shopify reports ${verifiedShopDomain}`);
        }

        shopOwner = shopData.shop?.email || null;
        shopName = shopData.shop?.name || null;
        verified = true;
        console.log(`[shopify-oauth] Token verified for ${shop}: shop=${shopName || "unknown"}, scopes OK`);
      } catch (err) {
        verifyError = err.message;
        // Do not interpolate shop domain or error message into the format string —
        // both may contain API-sourced data (log-injection / tainted-format-string prevention).
        console.error("[shopify-oauth] Token validation failed — Shopify identity check rejected");
      }

      if (verified) {
        // Upsert provider_credentials — mark as connected with exact verified scopes
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
        `, [businessId, shop, encryptedToken, verifiedScopeString, shopOwner, shopName]);

        // No webhook registration here — that is a Shopify write mutation
        // and is explicitly prohibited during P0 OAuth connect.

        invalidateProviderCache(businessId);
        console.log(`[shopify-oauth] Shopify connected for business ${businessId}: ${shopName || shop}`);

        const redirectUrl = `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/commerce?shopify_connected=true`;
        res.redirect(redirectUrl);
      } else {
        // Verification failed — save metadata but mark as failed, do not activate
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
        `, [businessId, shop, encryptedToken, verifiedScopeString, `Token validation failed`, shopOwner, shopName]);

        console.error(`[shopify-oauth] Shopify connection FAILED for business ${businessId}`);
        const errorUrl = `${process.env.SHIMMERSTOCK_URL || "https://shimmerstock.ctonew.app"}/commerce?shopify_error=validation_failed`;
        res.redirect(errorUrl);
      }
    } catch (err) {
      console.error("GET /api/shopify/auth/callback error:", err.message);
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

      invalidateProviderCache(businessId);
      console.log(`[shopify-oauth] Shopify disconnected for business ${businessId}`);
      res.json({ success: true, message: "Shopify disconnected" });
    } catch (err) {
      console.error("POST /api/shopify/disconnect error:", err.message);
      res.status(500).json({ error: "Failed to disconnect Shopify" });
    }
  });

  console.log("[shopify-oauth] Shopify OAuth routes mounted");
}
