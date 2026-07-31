import express from "express";
import { sanitizeServerError } from "./error-sanitizer.js";
import cors from "cors";
import path from "path";
import { initDb } from "./db.js";
import * as shopify from "./shopify.js"; // backward compat re-export
import { getProvider, initRegistry } from "./providers/registry.js";
import * as sync from "./sync.js";
import * as store from "./store.js";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  generateResetToken,
  requireAuth,
  refreshSession,
} from "./auth.js";
import { auditLog, getDeviceInfo } from "./audit.js";
import { emit, getProductionSummary, getCalculationSummary } from "./events.js";
import { evaluate } from "./calc.js";
import { mountPurchasingRoutes } from "./purchasing-routes.js";
import { mountTimelineRoutes } from "./timeline.js";
import { getHQSummary } from "./hq.js";
import { mountBestieRoutes } from "./bestie.js";
import { mountOpportunityRoutes } from "./opportunities.js";
import { mountHealthRoutes } from "./health.js";
import { mountVariantRoutes } from "./variant-routes.js";
import { mountWarehouseRoutes } from "./warehouse-routes.js";
import { mountCsRoutes } from "./cs-routes.js";
import { mountAffiliateRoutes } from "./affiliate-routes.js";
import { mountIndustryRoutes } from "./industry-routes.js";
import { mountCommerceRoutes } from "./commerce-routes.js";
import { mountCustomerRoutes } from "./customer-routes.js";
import { mountEmailRoutes } from "./email-routes.js";
import { mountApprovalRoutes } from "./approval-routes.js";
import { mountStudioRoutes } from "./studio-routes.js";
import { mountGrowthRoutes } from "./growth-routes.js";
import { mountNoviEvolutionRoutes } from "./novi-evolution.js";
import { mountTeamRoutes } from "./team-routes.js";
import { mountFulfillmentRoutes } from "./fulfillment-routes.js";
import { mountOnboardingRoutes } from "./onboarding-routes.js";
import { mountPartnerRoutes } from "./partner-routes.js";
import { mountAffiliateAttributionRoutes } from "./affiliate-attribution-routes.js";
import { mountBrandSetupRoutes } from "./ai-brand-setup-routes.js";
import { mountNoviMessageRoutes } from "./novi-messages.js";
import { initNoviDetection } from "./novi-detection.js";
import { initOpportunityBridge } from "./opportunity-bridge.js";
import { mountStoreCreditRoutes } from "./store-credit-routes.js";
import { mountMovementRoutes } from "./movement-routes.js";
import { mountShopifyOauthRoutes } from "./shopify-oauth-routes.js";
import { mountShopifyWebhookRoutes } from "./shopify-webhook-routes.js";

const app = express();
const PORT = 3000;

app.use(express.json());
  app.use(cors());

// Initialize database
const db = initDb();

// Initialize provider registry (CommerceProvider abstraction)
initRegistry();

// ── API Routes ────────────────────────────────────────────────────────

// ── API Routes ────────────────────────────────────────────────────────

// ── Auth endpoints ──────────────────────────────────────────────────

// POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = store.getUserByUsernameWithBusiness(db, username.trim());

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Get all businesses for this user (P0.3: needed before session creation)
    const businesses = store.getUserBusinesses(db, user.id);

    // Get active business
    const activeBiz = businesses.find(b => b.is_active) || businesses[0];

    // Create session (8 hour lifetime) — bound to business_id for multi-tenancy (P0.3)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    const loginBusinessId = activeBiz ? activeBiz.business_id : user.business_id;
    store.createSession(db, { userId: user.id, token, expiresAt, businessId: loginBusinessId });

    // Check if user needs to change password (password_changed_at is NULL)
    const mustChangePassword = user.password_changed_at === null;

    // Audit: successful login
    auditLog(db, {
      businessId: activeBiz ? activeBiz.business_id : user.business_id,
      userId: user.id,
      actionType: "auth.login",
      entityType: "user",
      entityId: user.id,
      newValue: { username: user.username },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });


    // Emit event for detection engine
    emit("auth.login", {
      businessId: activeBiz ? activeBiz.business_id : user.business_id,
      userId: user.id,
      username: user.username,
    });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        business_id: activeBiz ? activeBiz.business_id : user.business_id,
        business_name: activeBiz ? activeBiz.name : user.business_name,
        business_role: activeBiz ? activeBiz.role : (user.business_role || user.role),
        businesses: businesses.map(b => ({
          business_id: b.business_id,
          name: b.name,
          slug: b.slug,
          role: b.role,
          is_active: b.is_active,
        })),
      },
      ...(mustChangePassword && { mustChangePassword: true }),
    });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/logout
app.post("/api/auth/logout", requireAuth(db), (req, res) => {
  try {
    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "auth.logout",
      entityType: "user",
      entityId: req.user.id,
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });
    store.deleteSession(db, req.sessionId);
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/auth/logout error:", err);
    res.status(500).json({ error: "Logout failed" });
  }
});

// POST /api/auth/logout-all — delete ALL sessions for current user
app.post("/api/auth/logout-all", requireAuth(db), (req, res) => {
  try {
    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "auth.logout_all",
      entityType: "user",
      entityId: req.user.id,
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });
    store.deleteAllUserSessions(db, req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/auth/logout-all error:", err);
    res.status(500).json({ error: "Logout all failed" });
  }
});

// GET /api/auth/me — with session refresh
app.get("/api/auth/me", (req, res, next) => {
  // Extract token manually for refresh before auth middleware
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }
  if (!token && req.headers.cookie) {
    const idx = req.headers.cookie.indexOf("token=");
    if (idx >= 0) {
      const start = idx + 6;
      const end = req.headers.cookie.indexOf(";", start);
      token = req.headers.cookie.substring(start, end > 0 ? end : undefined);
    }
  }

  // Authenticate
  const authMiddleware = requireAuth(db);
  authMiddleware(req, res, () => {
    // Refresh session if needed
    if (token) {
      refreshSession(db, token);
    }
    // Look up active business info
    const activeBiz = store.getActiveBusiness(db, req.user.id);
    const businesses = store.getUserBusinesses(db, req.user.id);
    res.json({
      id: req.user.id,
      username: req.user.username,
      display_name: req.user.display_name,
      role: req.user.role,
      business_id: activeBiz ? activeBiz.business_id : req.user.business_id,
      business_name: activeBiz ? activeBiz.name : null,
      business_role: activeBiz ? activeBiz.role : (req.user.business_role || req.user.role),
      businesses: businesses.map(b => ({
        business_id: b.business_id,
        name: b.name,
        slug: b.slug,
        role: b.role,
        is_active: b.is_active,
      })),
    });
  });
});

// POST /api/auth/change-password — requires auth
app.post("/api/auth/change-password", requireAuth(db), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    // Verify current password
    const user = store.getUserPasswordHash(db, req.user.id);

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Hash and update password
    const newHash = await hashPassword(newPassword);
    store.updateUserPassword(db, req.user.id, newHash);

    // Delete all other sessions (force re-login everywhere)
    store.deleteOtherUserSessions(db, req.user.id, req.sessionId);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "auth.password_changed",
      entityType: "user",
      entityId: req.user.id,
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/auth/change-password error:", err);
    res.status(500).json({ error: "Password change failed" });
  }
});

// POST /api/auth/forgot-password — public
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const user = store.getUserByUsername(db, username.trim());

    // Always return the same response whether user exists or not
    if (!user) {
      console.log(`[forgot-password] No user found for username: ${username.trim()}`);
      return res.json({ message: "If that account exists, a reset link has been sent." });
    }

    // Create reset token (expires in 1 hour)
    const resetToken = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    store.createResetToken(db, { userId: user.id, token: resetToken, expiresAt });

    // TODO: send via email when email service is set up
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  📧 Password reset for: ${username.trim()} (user #${user.id})`);
    console.log(`     Reset token: ${resetToken}`);
    console.log(`     Expires at: ${expiresAt}`);
    console.log("  TODO: send via email when email service is set up");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    res.json({
      message: "If that account exists, a reset link has been sent.",
      // TODO: remove token from response once email is set up
      resetToken,
    });
  } catch (err) {
    console.error("POST /api/auth/forgot-password error:", err);
    res.status(500).json({ error: "Password reset request failed" });
  }
});

// POST /api/auth/reset-password — public
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    // Find the token
    const resetRecord = store.getResetToken(db, token);

    if (!resetRecord) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    // Check if already used
    if (resetRecord.used) {
      return res.status(400).json({ error: "This reset token has already been used" });
    }

    // Check expiry
    if (new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: "This reset token has expired" });
    }

    // Hash new password and update user
    const newHash = await hashPassword(newPassword);
    store.updateUserPassword(db, resetRecord.user_id, newHash);

    // Mark token as used
    store.consumeResetToken(db, resetRecord.id);

    // Delete all sessions for this user (force re-login everywhere)
    store.deleteAllUserSessions(db, resetRecord.user_id);

    // Look up the username for audit
    const resetUser = store.getUserById(db, resetRecord.user_id);

    // Get business from user_businesses for audit
    const userBizs = store.getUserBusinesses(db, resetRecord.user_id);
    const auditBusinessId = userBizs.length > 0 ? userBizs[0].business_id : 1;

    auditLog(db, {
      businessId: auditBusinessId,
      userId: resetRecord.user_id,
      actionType: "auth.password_reset",
      entityType: "user",
      entityId: resetRecord.user_id,
      newValue: { username: resetUser?.username },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    console.log(`[reset-password] Password reset completed for user #${resetRecord.user_id}`);

    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/auth/reset-password error:", err);
    res.status(500).json({ error: "Password reset failed" });
  }
});

// ── Auth: Register (sign-up) ──────────────────────────────────────

// POST /api/auth/register — create account + business
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, displayName, businessName } = req.body;

    if (!username || !password || !displayName || !businessName) {
      return res.status(400).json({
        error: "Username, password, display name, and business name are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const trimmedUsername = username.trim();
    const trimmedBizName = businessName.trim();

    // Check if username already exists
    const existing = store.getUserByUsername(db, trimmedUsername);
    if (existing) {
      return res.status(409).json({ error: "Username already exists" });
    }

    // Generate business slug from name
    const slug = trimmedBizName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50) || `business-${Date.now()}`;

    // Hash password outside transaction
    const hash = await hashPassword(password);

    const result = store.transaction(db, () => {
      // Create business
      const business = store.createBusiness(db, trimmedBizName, slug);

      // Create user
      const userId = store.createUser(db, {
        username: trimmedUsername,
        hash,
        displayName: displayName.trim(),
        role: "owner",
      });

      // Create user_businesses row (active)
      store.addUserToBusiness(db, userId, business.id, "owner");
      // Set as active
      store.setActiveBusiness(db, userId, business.id);

      // Create session
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      store.createSession(db, { userId, token, expiresAt, businessId: business.id });

      auditLog(db, {
        businessId: business.id,
        userId,
        actionType: "auth.register",
        entityType: "user",
        entityId: userId,
        newValue: { username: trimmedUsername, business_name: trimmedBizName },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      const businesses = [{
        business_id: business.id,
        name: business.name,
        slug: business.slug,
        role: "owner",
        is_active: 1,
      }];

      return {
        token,
        user: {
          id: userId,
          username: trimmedUsername,
          display_name: displayName.trim(),
          role: "owner",
          business_id: business.id,
          business_name: business.name,
          business_role: "owner",
          businesses,
        },
      };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE constraint failed")) {
      const msg = err.message.includes("users.username") ? "Username already exists" : err.message.includes("businesses.slug") || err.message.includes("businesses.name") ? "A business with this name already exists" : "Username or business name already exists";
      return res.status(409).json({ error: msg });
    }
    console.error("POST /api/auth/register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ── Business routes ────────────────────────────────────────────────

// GET /api/businesses — list businesses for current user
app.get("/api/businesses", requireAuth(db), (req, res) => {
  try {
    const businesses = store.getUserBusinesses(db, req.user.id);
    res.json(businesses);
  } catch (err) {
    console.error("GET /api/businesses error:", err);
    res.status(500).json({ error: "Failed to fetch businesses" });
  }
});

// POST /api/businesses — create a new business (user becomes owner)
app.post("/api/businesses", requireAuth(db), async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Business name is required" });
    }

    const trimmedName = name.trim();

    // Generate slug
    const baseSlug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50) || `business-${Date.now()}`;

    // Check for slug uniqueness
    let slug = baseSlug;
    let counter = 1;
    while (store.getBusinessBySlug(db, slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const result = store.transaction(db, () => {
      const business = store.createBusiness(db, trimmedName, slug);
      store.addUserToBusiness(db, req.user.id, business.id, "owner");

      auditLog(db, {
        businessId: business.id,
        userId: req.user.id,
        actionType: "business.created",
        entityType: "business",
        entityId: business.id,
        newValue: { name: trimmedName, slug },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      return business;
    });

    res.status(201).json(result);
  } catch (err) {
    console.error("POST /api/businesses error:", err);
    res.status(500).json({ error: "Failed to create business" });
  }
});

// POST /api/businesses/:id/activate — switch active business
app.post("/api/businesses/:id/activate", requireAuth(db), (req, res) => {
  try {
    const businessId = parseInt(req.params.id);

    // Verify user belongs to this business
    const businesses = store.getUserBusinesses(db, req.user.id);
    const belongs = businesses.some(b => b.business_id === businessId);

    if (!belongs) {
      return res.status(403).json({ error: "You are not a member of this business" });
    }

    store.setActiveBusiness(db, req.user.id, businessId);

    const activeBiz = businesses.find(b => b.business_id === businessId);

    auditLog(db, {
      businessId,
      userId: req.user.id,
      actionType: "business.switched",
      entityType: "business",
      entityId: businessId,
      newValue: { name: activeBiz ? activeBiz.name : null },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    res.json({
      success: true,
      business_id: businessId,
      business_name: activeBiz ? activeBiz.name : null,
      business_role: activeBiz ? activeBiz.role : null,
    });
  } catch (err) {
    console.error("POST /api/businesses/:id/activate error:", err);
    res.status(500).json({ error: "Failed to switch business" });
  }
});

// ── Shopify status ──────────────────────────────────────────────────

app.get("/api/shopify/status", requireAuth(db, "shopify.read"), (req, res) => {
  // Read DB record for rich info (OAuth-connected businesses)
  const creds = db
    .query(
      "SELECT shop_domain, shop_name, shop_owner, scopes, sync_status, sync_error, sync_mode, last_synced_at, is_active FROM provider_credentials WHERE business_id = ? AND provider = 'shopify'"
    )
    .get(req.businessId);

  // Map sync_status to connectionState
  const connectionStateMap = {
    connected: "connected",
    pending: "pending_validation",
    failed: "failed",
    disconnected: "disconnected",
    syncing: "connected",
    synced: "connected",
    error: "failed",
  };
  const connectionState = creds?.sync_status
    ? (connectionStateMap[creds.sync_status] || "disconnected")
    : "disconnected";

  // Only report configured when the connection is verified valid via OAuth
  const isConnected = connectionState === "connected";
  const isActive = creds?.is_active === 1 && isConnected;

  // If no valid DB connection, never trust the singleton
  if (!creds || !isConnected) {
    return res.json({
      configured: false,
      connectionState,
      syncMode: creds?.sync_mode || "readonly",
      canWrite: false,
      shopDomain: creds?.shop_domain || null,
      shopName: creds?.shop_name || null,
      shopOwner: creds?.shop_owner || null,
      scopes: creds?.scopes || null,
      lastSyncedAt: creds?.last_synced_at || null,
      syncStatus: creds?.sync_status || "not_connected",
      syncError: creds?.sync_error || null,
      isActive: false,
    });
  }

  const status = getProvider(req.businessId, db).getStatus();

  res.json({
    configured: true,
    connectionState,
    syncMode: creds.sync_mode || status.mode,
    canWrite: status.canWrite,
    shopDomain: creds.shop_domain || null,
    shopName: creds.shop_name || null,
    shopOwner: creds.shop_owner || null,
    scopes: creds.scopes || null,
    lastSyncedAt: creds.last_synced_at || null,
    syncStatus: creds.sync_status || "not_connected",
    syncError: creds.sync_error || null,
    isActive,
  });
});

// GET /api/shopify/sync-mode — return current sync mode
app.get("/api/shopify/sync-mode", requireAuth(db, "shopify.read"), (req, res) => {
  const creds = db
    .query(
      "SELECT sync_mode FROM provider_credentials WHERE business_id = ? AND provider = 'shopify'"
    )
    .get(req.businessId);
  const mode = creds?.sync_mode || getProvider(req.businessId, db).getStatus().mode;
  res.json({ mode });
});

// POST /api/shopify/sync-mode — update sync mode (requires write permission)
app.post("/api/shopify/sync-mode", requireAuth(db, "shopify.write_inventory"), async (req, res) => {
  try {
    const { mode } = req.body;
    if (mode !== "readonly" && mode !== "full") {
      return res.status(400).json({ error: "Mode must be 'readonly' or 'full'" });
    }

    const provider = getProvider(req.businessId, db);
    const oldMode = provider.getStatus().mode;

    // Update sync mode via the provider (keeps env in sync internally)
    await provider.setMode(mode);

    // Persist sync_mode to the database so it survives restarts
    db.run(
      "UPDATE provider_credentials SET sync_mode = ?, updated_at = datetime('now') WHERE business_id = ? AND provider = 'shopify'",
      [mode, req.businessId]
    );

    // Invalidate the provider cache so the next request picks up the new mode
    const { invalidateProviderCache } = await import("./providers/registry.js");
    invalidateProviderCache(req.businessId);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "settings.changed",
      entityType: "settings",
      entityId: null,
      previousValue: { mode: oldMode },
      newValue: { mode },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    console.log(`[shopify] Sync mode changed to: ${mode} (by ${req.user.username})`);

    res.json({ mode, canWrite: mode === "full" });
  } catch (err) {
    console.error("POST /api/shopify/sync-mode error:", err);
    res.status(500).json({ error: "Failed to update sync mode" });
  }
});

// ── Shopify sync log (reconciliation) ────────────────────────────────

// GET /api/shopify/sync-log — list sync log entries for current business
app.get("/api/shopify/sync-log", requireAuth(db, "shopify.read"), (req, res) => {
  try {
    const status = req.query.status || null;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const entries = store.getSyncLog(db, req.businessId, { status, limit, offset });
    const total = store.countSyncLog(db, req.businessId, status);
    const statusCounts = store.getSyncLogStatusCounts(db, req.businessId);

    res.json({
      entries,
      total,
      limit,
      offset,
      statusFilter: status || "all",
      statusCounts,
    });
  } catch (err) {
    console.error("GET /api/shopify/sync-log error:", err);
    res.status(500).json({ error: "Failed to fetch sync log" });
  }
});

// POST /api/shopify/sync-log/:id/retry — retry a failed sync entry
app.post("/api/shopify/sync-log/:id/retry", requireAuth(db, "shopify.sync"), (req, res) => {
  try {
    const entry = store.getSyncLogById(db, req.params.id, req.businessId);

    if (!entry) {
      return res.status(404).json({ error: "Sync log entry not found" });
    }

    if (entry.status !== "failed") {
      return res.status(400).json({
        error: `Cannot retry entry with status "${entry.status}". Only "failed" entries can be retried.`,
      });
    }

    // Reset the entry to pending, clearing the error
    store.updateSyncLogStatus(db, entry.id, "pending", null);

    console.log(`[sync] Retry requested for sync log #${entry.id} (${entry.action} ${entry.shopify_order_id || entry.shopify_product_id || ""}) by ${req.user.username}`);

    res.json({
      success: true,
      message: `Sync log entry #${entry.id} reset to pending. Re-run the sync to retry.`,
      entry: { ...entry, status: "pending", error_message: null },
    });
  } catch (err) {
    console.error("POST /api/shopify/sync-log/:id/retry error:", err);
    res.status(500).json({ error: "Failed to retry sync entry" });
  }
});

// ── Products CRUD ────────────────────────────────────────────────────

// GET /api/products — list all products
app.get("/api/products", requireAuth(db, "products.read"), (req, res) => {
  try {
    const products = store.listProducts(db, req.businessId);
    res.json(products);
  } catch (err) {
    console.error("GET /api/products error:", err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// POST /api/products — create a product
app.post("/api/products", requireAuth(db, "products.write"), (req, res) => {
  try {
    const { name, sku, barcode, stock_count } = req.body;

    if (!name || !sku) {
      return res.status(400).json({ error: "Name and SKU are required" });
    }

    const product = store.transaction(db, () => {
      const productId = store.createProduct(db, {
        name: name.trim(),
        sku: sku.trim(),
        barcode: barcode ? barcode.trim() : null,
        stockCount: stock_count ?? 0,
        businessId: req.businessId,
      });

      const created = store.getProductById(db, productId, req.businessId);

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "product.created",
        entityType: "product",
        entityId: created.id,
        newValue: { name: created.name, sku: created.sku, barcode: created.barcode, stock_count: created.stock_count },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      return created;
    });

      emit("product.created", { businessId: req.businessId, productId: product.id, name: product.name, sku: product.sku });
    res.status(201).json(product);
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE constraint failed")) {
      const field = err.message.includes("sku") ? "SKU" : "Barcode";
      return res.status(409).json({ error: `${field} already exists` });
    }
    console.error("POST /api/products error:", err);
    res.status(500).json({ error: "Failed to create product" });
  }
});

// GET /api/products/:id — get a single product
app.get("/api/products/:id", requireAuth(db, "products.read"), (req, res) => {
  try {
    const product = store.getProductById(db, req.params.id, req.businessId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (err) {
    console.error("GET /api/products/:id error:", err);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// PUT /api/products/:id — update a product
app.put("/api/products/:id", requireAuth(db, "products.write"), (req, res) => {
  try {
    // Read old product outside transaction (validation)
    const oldProduct = store.getProductById(db, req.params.id, req.businessId);

    if (!oldProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    const { name, sku, barcode, stock_count } = req.body;

    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (sku !== undefined) fields.sku = sku.trim();
    if (barcode !== undefined) fields.barcode = barcode ? barcode.trim() : null;
    if (stock_count !== undefined) fields.stockCount = stock_count;

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const updated = store.transaction(db, () => {
      store.updateProduct(db, req.params.id, req.businessId, fields);

      const fresh = store.getProductById(db, req.params.id, req.businessId);

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "product.updated",
        entityType: "product",
        entityId: oldProduct.id,
        previousValue: { name: oldProduct.name, sku: oldProduct.sku, barcode: oldProduct.barcode, stock_count: oldProduct.stock_count },
        newValue: { name: fresh.name, sku: fresh.sku, barcode: fresh.barcode, stock_count: fresh.stock_count },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      return fresh;
    });

      if (fields.stockCount !== undefined) { emit("inventory.updated", { businessId: req.businessId, productId: parseInt(req.params.id) }); }
    res.json(updated);
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE constraint failed")) {
      const field = err.message.includes("sku") ? "SKU" : "Barcode";
      return res.status(409).json({ error: `${field} already exists` });
    }
    console.error("PUT /api/products/:id error:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

// DELETE /api/products/:id — delete a product (with FK-safe cleanup)
app.delete("/api/products/:id", requireAuth(db, "products.delete"), (req, res) => {
  try {
    store.transaction(db, () => {
      const product = store.deleteProductCascade(db, req.params.id, req.businessId);

      if (!product) {
        throw Object.assign(new Error("Product not found"), { statusCode: 404 });
      }

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "product.deleted",
        entityType: "product",
        entityId: product.id,
        previousValue: { name: product.name, sku: product.sku, barcode: product.barcode, stock_count: product.stock_count },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });
    });

    res.json({ success: true });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: "Product not found" });
    }
    console.error("DELETE /api/products/:id error:", err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// GET /api/products/:id/hq — comprehensive product HQ snapshot
app.get("/api/products/:id/hq", requireAuth(db, "products.read"), (req, res) => {
  try {
    const hq = store.getProductHQ(db, parseInt(req.params.id), req.businessId);

    if (!hq) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(hq);
  } catch (err) {
    console.error("GET /api/products/:id/hq error:", err);
    res.status(500).json({ error: "Failed to fetch product HQ data" });
  }
});

// GET /api/products/:id/summary — AI-consumable product summary
app.get("/api/products/:id/summary", requireAuth(db, "products.read"), (req, res) => {
  try {
    const summary = store.getProductSummary(db, parseInt(req.params.id), req.businessId);

    if (!summary) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(summary);
  } catch (err) {
    console.error("GET /api/products/:id/summary error:", err);
    res.status(500).json({ error: "Failed to fetch product summary" });
  }
});

// POST /api/products/import — import products from Shopify
app.post("/api/products/import", requireAuth(db, "shopify.read"), async (req, res) => {
  try {
    const provider = getProvider(req.businessId, db);
    const status = provider.getStatus();

    if (!status.configured) {
      return res.status(400).json({
        success: false,
        error: "Shopify is not connected — set SHOPIFY_API_TOKEN",
      });
    }

    const products = await provider.fetchProducts();
    let newCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const imported = [];

    for (const p of products) {
      for (const v of p.variants) {
        if (!v.sku) continue; // Skip variants without SKU

        // Idempotency: skip products already successfully imported
        const productKey = sync.idempotencyKey("import_product", v.variantId.toString());

        if (sync.isDuplicate(db, req.businessId, productKey)) {
          skippedCount++;
          imported.push({ sku: v.sku, action: "skipped", name: p.title, reason: "already imported" });
          continue;
        }

        // Barcode fallback: if variant has no barcode, try to use SKU as barcode
        const barcode = v.barcode || null;

        const existing = store.getProductBySku(db, v.sku, req.businessId);

        if (existing) {
          try {
            store.transaction(db, () => {
              // Update name + barcode if they changed
              const oldValues = { name: existing.name, barcode: existing.barcode };
              store.updateProduct(db, existing.id, req.businessId, {
                nameBarcodeUpdate: { name: p.title, barcode },
              });

              auditLog(db, {
                businessId: req.businessId,
                userId: req.user.id,
                actionType: "product.updated",
                entityType: "product",
                entityId: existing.id,
                previousValue: oldValues,
                newValue: { name: p.title, barcode: barcode || existing.barcode },
                source: "shopify",
                deviceInfo: getDeviceInfo(req),
              });

              sync.logSync(db, {
                businessId: req.businessId,
                idempotencyKey: productKey,
                action: "import_product",
                shopifyProductId: p.productId,
                provider: "shopify",
                externalId: p.productId.toString(),
                entityType: "product",
                entityId: existing.id,
                status: "success",
                details: { sku: v.sku, action: "updated", name: p.title },
              });
            });
            updatedCount++;
            imported.push({ sku: v.sku, action: "updated", name: p.title });
          } catch (err) {
            sync.logSync(db, {
              businessId: req.businessId,
              idempotencyKey: productKey,
              action: "import_product",
              shopifyProductId: p.productId,
              provider: "shopify",
              externalId: p.productId.toString(),
              entityType: "product",
              entityId: existing.id,
              status: "failed",
              details: { sku: v.sku, action: "updated" },
              errorMessage: err.message,
            });
            throw err; // re-throw to outer catch
          }
        } else {
          try {
            store.transaction(db, () => {
              // Insert new product — stock_count stays 0 (not Shopify's number)
              const productId = store.createProduct(db, {
                name: p.title,
                sku: v.sku,
                barcode,
                stockCount: 0,
                businessId: req.businessId,
              });

              auditLog(db, {
                businessId: req.businessId,
                userId: req.user.id,
                actionType: "product.created",
                entityType: "product",
                entityId: productId,
                newValue: { name: p.title, sku: v.sku, barcode, stock_count: 0 },
                source: "shopify",
                deviceInfo: getDeviceInfo(req),
              });

              sync.logSync(db, {
                businessId: req.businessId,
                idempotencyKey: productKey,
                action: "import_product",
                shopifyProductId: p.productId,
                provider: "shopify",
                externalId: p.productId.toString(),
                entityType: "product",
                entityId: productId,
                status: "success",
                details: { sku: v.sku, action: "new", name: p.title },
              });
            });
            newCount++;
            imported.push({ sku: v.sku, action: "new", name: p.title });
          } catch (err) {
            sync.logSync(db, {
              businessId: req.businessId,
              idempotencyKey: productKey,
              action: "import_product",
              shopifyProductId: p.productId,
              provider: "shopify",
              externalId: p.productId.toString(),
              entityType: "product",
              status: "failed",
              details: { sku: v.sku },
              errorMessage: err.message,
            });
            throw err; // re-throw to outer catch
          }
        }
      }
    }

    res.json({
      success: true,
      total: imported.length,
      new: newCount,
      updated: updatedCount,
      skipped: skippedCount,
      products: imported,
      message: `Imported ${imported.length} products (${newCount} new, ${updatedCount} updated, ${skippedCount} skipped)`,
    });
    emit("commerce.products_synced", { businessId: req.businessId, count: imported.length, newCount, updatedCount });
  } catch (err) {
    console.error("POST /api/products/import error:", err);
    const msg = err.message || "";
    // Detect Shopify auth failures and return a Novi-friendly message
    if (msg.includes("401") || msg.includes("Invalid API key") || msg.includes("access token")) {
      res.status(502).json({
        success: false,
        error: "Shopify didn't finish connecting, so I haven't imported or changed anything. Let's reconnect your store.",
      });
    } else {
      res.status(500).json({ success: false, error: msg || "Failed to import products" });
    }
  }
});

// ── Dashboard ──────────────────────────────────────────────────────────

app.get("/api/dashboard", requireAuth(db, "reports.read"), (req, res) => {
  try {
    const totalProducts = store.countProducts(db, req.businessId);
    const lowStock = store.getLowStockProducts(db, req.businessId);

    const todayIn = store.countTodayMovements(db, req.businessId, "in");
    const todayOut = store.countTodayMovements(db, req.businessId, "out");
    const todayOrders = store.countTodayMovements(db, req.businessId, "order");

    const recent = store.getRecentMovements(db, req.businessId, 5);

    res.json({
      totalProducts,
      lowStock,
      todayMovements: {
        totalIn: todayIn,
        totalOut: todayOut,
        totalOrders: todayOrders,
        recent,
      },
    });
  } catch (err) {
    console.error("GET /api/dashboard error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// ── Scanning ──────────────────────────────────────────────────────────

// POST /api/scan — process a barcode scan
app.post("/api/scan", requireAuth(db, "inventory.write"), (req, res) => {
  try {
    const { barcode, mode } = req.body;

    if (!barcode || typeof barcode !== "string" || !barcode.trim()) {
      return res.status(400).json({ success: false, error: "Barcode is required" });
    }

    if (mode !== "in" && mode !== "out") {
      return res.status(400).json({ success: false, error: "Mode must be 'in' or 'out'" });
    }

    const product = store.getProductByBarcode(db, barcode.trim(), req.businessId);

    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    // Reject OUT scan when stock is already 0 (read-only check outside transaction)
    if (mode === "out" && product.stock_count <= 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot go below zero stock — ${product.name} has 0 in stock`,
        product: { id: product.id, name: product.name, sku: product.sku, barcode: product.barcode },
      });
    }

    const result = store.transaction(db, () => {
      const previousStock = product.stock_count;
      const newStock = mode === "in" ? previousStock + 1 : previousStock - 1;

      // Update product stock_count
      store.updateProductStock(db, product.id, req.businessId, newStock);

      // Insert movement record with user_id and business_id
      store.recordMovement(db, {
        productId: product.id,
        type: mode,
        quantity: 1,
        userId: req.user.id,
        businessId: req.businessId,
      });

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: mode === "in" ? "scan.in" : "scan.out",
        entityType: "inventory",
        entityId: product.id,
        previousValue: { stock_count: previousStock },
        newValue: { stock_count: newStock },
        source: "scanner",
        deviceInfo: getDeviceInfo(req),
      });

      return { newStock, previousStock };
    });

    res.json({
      success: true,
      product: { id: product.id, name: product.name, sku: product.sku, barcode: product.barcode },
      new_stock: result.newStock,
      previous_stock: result.previousStock,
      mode,
      quantity: 1,
    });
  } catch (err) {
    console.error("POST /api/scan error:", err);
    res.status(500).json({ success: false, error: "Failed to process scan" });
  }
});

// GET /api/movements — get recent inventory movements (for scan history)
app.get("/api/movements", requireAuth(db, "inventory.read"), (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const movements = store.getMovements(db, req.businessId, limit);
    res.json(movements);
  } catch (err) {
    console.error("GET /api/movements error:", err);
    res.status(500).json({ error: "Failed to fetch movements" });
  }
});

// ── Orders ────────────────────────────────────────────────────────────

// POST /api/orders/sync — pull open orders from Shopify
app.post("/api/orders/sync", requireAuth(db, "shopify.sync"), async (req, res) => {
  try {
    const provider = getProvider(req.businessId, db);
    const providerStatus = provider.getStatus();

    if (!providerStatus.configured) {
      return res.status(400).json({
        success: false,
        error: "Shopify is not connected — set SHOPIFY_API_TOKEN",
      });
    }

    const syncMode = providerStatus.mode;
    const isReadonly = syncMode !== "full";

    const orders = await provider.fetchOrders();
    const imported = [];
    const skipped = [];
    const orderDiffs = [];
    const stockouts = [];

    for (const order of orders) {
      // ── Idempotency: skip orders already synced ──
      const orderKey = sync.idempotencyKey("import_order", order.orderId);

      if (sync.isDuplicate(db, req.businessId, orderKey)) {
        skipped.push({
          shopify_order_id: order.orderId,
          order_number: order.orderNumber,
          reason: "already synced (idempotent)",
        });
        // Still include in diff for readonly review
        if (isReadonly) {
          const existingOrder = store.getOrderByShopifyId(db, order.orderId, req.businessId);
          if (existingOrder) {
            const existingItems = store.getOrderItemsForDiff(db, existingOrder.id);
            orderDiffs.push({
              order: { order_number: order.orderNumber, customer_name: order.customerName },
              already_imported: true,
              idempotent_skip: true,
              items: existingItems.map((i) => ({
                sku: i.sku,
                name: i.name || i.sku,
                variant_title: i.variant_title,
                quantity: i.quantity,
                current_stock: i.stock_count ?? null,
                would_become: i.stock_count != null ? Math.max(0, i.stock_count - i.quantity) : null,
                matched: i.stock_count != null,
                warning: i.stock_count == null ? "SKU not found in local products" :
                  (i.stock_count < i.quantity ? `Stockout! Ordered ${i.quantity}, only ${i.stock_count} available (shortfall: ${i.quantity - i.stock_count})` : null),
              })),
            });
          }
        }
        continue;
      }

      // Check for existing order in DB (legacy duplicate check, backup to idempotency)
      const existing = store.getOrderByShopifyId(db, order.orderId, req.businessId);

      if (existing) {
        // Log as skipped via sync log for idempotency tracking
        sync.logSync(db, {
          businessId: req.businessId,
          idempotencyKey: orderKey,
          action: "import_order",
          shopifyOrderId: order.orderId,
          provider: "shopify",
          externalId: order.orderId,
          entityType: "order",
          entityId: existing.id,
          status: "skipped",
          details: { order_number: order.orderNumber, reason: "already exists in DB" },
        });

        if (isReadonly) {
          const existingItems = store.getOrderItemsForDiff(db, existing.id);
          orderDiffs.push({
            order: { order_number: order.orderNumber, customer_name: order.customerName },
            already_imported: true,
            items: existingItems.map((i) => ({
              sku: i.sku,
              name: i.name || i.sku,
              variant_title: i.variant_title,
              quantity: i.quantity,
              current_stock: i.stock_count ?? null,
              would_become: i.stock_count != null ? Math.max(0, i.stock_count - i.quantity) : null,
              matched: i.stock_count != null,
              warning: i.stock_count == null ? "SKU not found in local products" :
                (i.stock_count < i.quantity ? `Stockout! Ordered ${i.quantity}, only ${i.stock_count} available (shortfall: ${i.quantity - i.stock_count})` : null),
            })),
          });
        }
        continue;
      }

      // ── Phase 1: DB transaction — all or nothing for this order ──
      let orderId;
      let inventoryPushTasks = []; // collected for Phase 2 (Shopify push)
      let itemsDiff = [];

      try {
        const txnResult = store.transaction(db, () => {
          const createdOrderId = store.createOrder(db, {
            shopifyOrderId: order.orderId,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            businessId: req.businessId,
          });

          // Audit: order imported
          auditLog(db, {
            businessId: req.businessId,
            userId: req.user.id,
            actionType: isReadonly ? "order.imported_readonly" : "order.imported",
            entityType: "order",
            entityId: createdOrderId,
            newValue: { shopify_order_id: order.orderId, order_number: order.orderNumber, customer_name: order.customerName },
            source: "shopify",
            deviceInfo: getDeviceInfo(req),
          });

          const txnPushTasks = [];
          const txnItemsDiff = [];

          // Insert line items
          for (const item of order.lineItems) {
            if (!item.sku) {
              // Insert without product match
              store.createOrderItem(db, {
                orderId: createdOrderId,
                productId: null,
                sku: item.sku,
                variantTitle: item.variantTitle,
                quantity: item.quantity,
                businessId: req.businessId,
              });
              if (isReadonly) {
                txnItemsDiff.push({
                  sku: item.sku || "(no SKU)",
                  name: item.title,
                  variant_title: item.variantTitle,
                  quantity: item.quantity,
                  matched: false,
                  warning: "No SKU on line item",
                });
              }
              continue;
            }

            // Find product by SKU
            const product = store.getProductBySku(db, item.sku, req.businessId);

            let productId = null;
            const previousStock = product ? product.stock_count : null;
            const wouldBecome = product ? Math.max(0, previousStock - item.quantity) : null;

            if (product && !isReadonly) {
              // ── FULL MODE: decrement inventory ──
              productId = product.id;
              const rawNewStock = product.stock_count - item.quantity;
              const newStock = Math.max(0, rawNewStock);
              const actualDecrement = product.stock_count - newStock;

              // Decrement inventory
              store.updateProductStock(db, product.id, req.businessId, newStock);

              // Insert movement record (type: 'order') with user_id and business_id
              store.recordMovement(db, {
                productId: product.id,
                type: "order",
                quantity: actualDecrement,
                userId: req.user.id,
                businessId: req.businessId,
              });

              // Audit: inventory decremented by order sync
              auditLog(db, {
                businessId: req.businessId,
                userId: req.user.id,
                actionType: "inventory.decremented",
                entityType: "inventory",
                entityId: product.id,
                previousValue: { stock_count: product.stock_count },
                newValue: { stock_count: newStock },
                source: "shopify",
                deviceInfo: getDeviceInfo(req),
                reason: `Order #${order.orderNumber} — ${item.sku} x${item.quantity}`,
              });

              // Detect and flag stockouts — never silently absorb negative stock
              if (rawNewStock < 0) {
                const shortfall = Math.abs(rawNewStock);
                console.warn(
                  `[order sync] STOCKOUT: Order #${order.orderNumber} — ${item.sku}: ordered ${item.quantity} but only ${product.stock_count} available (shortfall: ${shortfall})`
                );
                auditLog(db, {
                  businessId: req.businessId,
                  userId: req.user.id,
                  actionType: "inventory.stockout",
                  entityType: "inventory",
                  entityId: product.id,
                  previousValue: { stock_count: product.stock_count },
                  newValue: { stock_count: 0, ordered: item.quantity, fulfilled: actualDecrement, shortfall },
                  source: "shopify",
                  deviceInfo: getDeviceInfo(req),
                  reason: `Stockout on Order #${order.orderNumber} — ${item.sku} ordered ${item.quantity}, only ${product.stock_count} available, fulfilled ${actualDecrement}, shortfall ${shortfall}`,
                });
                stockouts.push({
                  sku: item.sku,
                  product_name: product.name,
                  product_id: product.id,
                  order_number: order.orderNumber,
                  shopify_order_id: order.orderId,
                  ordered: item.quantity,
                  available: product.stock_count,
                  fulfilled: actualDecrement,
                  shortfall,
                });
              }

              // Collect push task for Phase 2
              txnPushTasks.push({
                variantId: item.variantId,
                sku: item.sku,
                newStock,
                productId: product.id,
              });

              console.log(
                `[order sync] FULL MODE: Order #${order.orderNumber}: decremented ${item.sku} by ${actualDecrement} (${product.stock_count} → ${newStock})${rawNewStock < 0 ? ' ⚠️ STOCKOUT' : ''}`
              );
            } else if (product && isReadonly) {
              // ── READONLY MODE: record that we would decrement, but don't ──
              productId = product.id;
              console.log(
                `[order sync] READONLY: Order #${order.orderNumber}: would decrement ${item.sku} by ${item.quantity} (${previousStock} → ${wouldBecome}) — BLOCKED`
              );
            } else if (!product) {
              console.warn(
                `[order sync] SKU "${item.sku}" not found in local products — skipping inventory ${isReadonly ? "diff" : "decrement"}`
              );
            }

            // Insert order item (both modes)
            store.createOrderItem(db, {
              orderId: createdOrderId,
              productId,
              sku: item.sku,
              variantTitle: item.variantTitle,
              quantity: item.quantity,
              businessId: req.businessId,
            });

            // Build diff item (readonly mode)
            if (isReadonly) {
              const diffStockout = product && previousStock !== null && previousStock < item.quantity;
              txnItemsDiff.push({
                sku: item.sku,
                name: product ? product.name : item.title,
                variant_title: item.variantTitle,
                quantity: item.quantity,
                current_stock: previousStock,
                would_become: wouldBecome,
                matched: !!product,
                stockout: diffStockout,
                shortfall: diffStockout ? item.quantity - previousStock : 0,
                warning: !product ? "SKU not found in local products" :
                  (diffStockout ? `Stockout! Ordered ${item.quantity}, only ${previousStock} available` : null),
              });
            }
          }

          // Log the order import in sync log
          const syncStatus = isReadonly ? "dry_run" : "success";
          sync.logSync(db, {
            businessId: req.businessId,
            idempotencyKey: orderKey,
            action: "import_order",
            shopifyOrderId: order.orderId,
            provider: "shopify",
            externalId: order.orderId,
            entityType: "order",
            entityId: createdOrderId,
            status: syncStatus,
            details: {
              order_number: order.orderNumber,
              customer_name: order.customerName,
              item_count: order.lineItems.length,
              mode: syncMode,
            },
          });

          return { orderId: createdOrderId, pushTasks: txnPushTasks, itemsDiff: txnItemsDiff };
        });

        orderId = txnResult.orderId;
        inventoryPushTasks = txnResult.pushTasks;
        itemsDiff = txnResult.itemsDiff;

        // ── Phase 2: Push inventory to Shopify AFTER transaction commits ──
        if (!isReadonly) {
          for (const task of inventoryPushTasks) {
            try {
              const result = await provider.pushInventory(task.sku, task.variantId, task.newStock);

              if (result.success) {
                // Log successful inventory push
                const pushKey = sync.idempotencyKey(
                  "push_inventory",
                  task.variantId.toString(),
                  { suffix: "shopify" }
                );
                sync.logSync(db, {
                  businessId: req.businessId,
                  idempotencyKey: pushKey,
                  action: "push_inventory",
                  shopifyProductId: task.variantId.toString(),
                  provider: "shopify",
                  externalId: task.variantId.toString(),
                  entityType: "product",
                  entityId: task.productId,
                  status: "success",
                  details: {
                    new_stock: task.newStock,
                    sku: task.sku,
                    order_number: order.orderNumber,
                  },
                });
              } else {
                // Log failed inventory push
                const pushKey = sync.idempotencyKey(
                  "push_inventory",
                  task.variantId.toString(),
                  { suffix: Date.now().toString() }
                );
                sync.logSync(db, {
                  businessId: req.businessId,
                  idempotencyKey: pushKey,
                  action: "push_inventory",
                  shopifyProductId: task.variantId.toString(),
                  provider: "shopify",
                  externalId: task.variantId.toString(),
                  entityType: "product",
                  entityId: task.productId,
                  status: "failed",
                  details: { sku: task.sku, order_number: order.orderNumber },
                  errorMessage: result.error || "Unknown error",
                });

                console.warn(
                  `[order sync] Failed to push inventory for variant ${task.variantId} (SKU ${task.sku}):`,
                  result.error
                );
              }
            } catch (shopifyErr) {
              console.warn(
                `[order sync] Failed to push inventory for variant ${task.variantId} (SKU ${task.sku}):`,
                shopifyErr.message
              );

              // Log failed inventory push
              const pushKey = sync.idempotencyKey(
                "push_inventory",
                task.variantId.toString(),
                { suffix: Date.now().toString() }
              );
              sync.logSync(db, {
                businessId: req.businessId,
                idempotencyKey: pushKey,
                action: "push_inventory",
                shopifyProductId: task.variantId.toString(),
                provider: "shopify",
                externalId: task.variantId.toString(),
                entityType: "product",
                entityId: task.productId,
                status: "failed",
                details: { sku: task.sku, order_number: order.orderNumber },
                errorMessage: shopifyErr.message,
              });
            }
          }
        }

        const orderEntry = {
          id: orderId,
          shopify_order_id: order.orderId,
          order_number: order.orderNumber,
          customer_name: order.customerName,
        };

        imported.push(orderEntry);

        if (isReadonly) {
          orderDiffs.push({
            order: { order_number: order.orderNumber, customer_name: order.customerName },
            items: itemsDiff,
            would_decrement: itemsDiff.some((i) => i.matched),
            blocked: true,
          });
        }
      } catch (orderErr) {
        // Log the failed order import (outside transaction — transaction already rolled back)
        sync.logSync(db, {
          businessId: req.businessId,
          idempotencyKey: orderKey,
          action: "import_order",
          shopifyOrderId: order.orderId,
          provider: "shopify",
          externalId: order.orderId,
          entityType: "order",
          status: "failed",
          details: { order_number: order.orderNumber },
          errorMessage: orderErr.message,
        });
        // Continue processing other orders — don't let one failure block all
        console.error(`[order sync] Failed to import order #${order.orderNumber}:`, orderErr.message);
      }
    }

    if (isReadonly) {
      res.json({
        success: true,
        mode: "readonly",
        imported: imported.length,
        skipped: skipped.length,
        orders: imported,
        diffs: orderDiffs,
        skipped_orders: skipped,
        stockouts,
        message: `📋 Read-only sync: imported ${imported.length} orders, skipped ${skipped.length}. Inventory was NOT changed.`,
      });
    } else {
      res.json({
        success: true,
        mode: "full",
        imported: imported.length,
        skipped: skipped.length,
        orders: imported,
        skipped_orders: skipped,
        stockouts,
        message: `✅ Full sync: imported ${imported.length} orders, skipped ${skipped.length}. Inventory decremented and pushed to Shopify.`,
      });
    }
  } catch (err) {
    console.error("POST /api/orders/sync error:", err);
    const msg = err.message || "";
    // Detect Shopify auth failures and return a Novi-friendly message
    if (msg.includes("401") || msg.includes("Invalid API key") || msg.includes("access token")) {
      res.status(502).json({
        success: false,
        error: "Shopify didn't finish connecting, so I haven't imported or changed anything. Let's reconnect your store.",
      });
    } else {
      res.status(500).json({ success: false, error: msg || "Failed to sync orders" });
    }
  }
});

// GET /api/orders — list orders with item summaries (supports ?source=&status=&search=)
app.get("/api/orders", requireAuth(db, "orders.read"), (req, res) => {
  try {
    const { source, status, search } = req.query;
    if (source || status || search) {
      const orders = store.listOrdersFiltered(db, req.businessId, { source, status, search });
      res.json(orders);
    } else {
      const orders = store.listOrders(db, req.businessId);
      res.json(orders);
    }
  } catch (err) {
    console.error("GET /api/orders error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// GET /api/orders/:id — single order with full pick list
app.get("/api/orders/:id", requireAuth(db, "orders.read"), (req, res) => {
  try {
    const order = store.getOrderByIdFull(db, req.params.id, req.businessId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (err) {
    console.error("GET /api/orders/:id error:", err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});


// POST /api/orders/:id/scan — scan an item against an order's pick list
app.post("/api/orders/:id/scan", requireAuth(db, "orders.fulfill"), (req, res) => {
  try {
    const orderId = req.params.id;
    const { barcode } = req.body;

    if (!barcode || typeof barcode !== "string" || !barcode.trim()) {
      return res.status(400).json({ success: false, error: "Barcode is required" });
    }

    // Find the order (read-only validation)
    const order = store.getOrderStatus(db, orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    if (order.status === "complete") {
      return res.status(400).json({ success: false, error: "This order is already complete" });
    }

    // Mark as picking if pending (outside transaction — single write)
    if (order.status === "pending") {
      store.updateOrderStatus(db, orderId, "picking");
    }

    // Find the order item matching this barcode
    const item = store.getOrderItemByBarcode(db, orderId, barcode.trim());

    if (!item) {
      // Try finding the product by SKU in case barcode was a SKU
      const bySku = store.getOrderItemBySku(db, orderId, barcode.trim());

      if (!bySku) {
        // Audit: mismatch — barcode not in order
        auditLog(db, {
          businessId: req.businessId,
          userId: req.user.id,
          actionType: "order.mismatch",
          entityType: "order_item",
          entityId: null,
          newValue: { barcode: barcode.trim(), order_id: parseInt(orderId) },
          source: "scanner",
          deviceInfo: getDeviceInfo(req),
        });

        return res.json({
          success: false,
          mismatch: true,
          error: "This item is NOT in this order!",
          barcode: barcode.trim(),
        });
      }

      // SKU fallback: check if already fully picked (read-only)
      if (bySku.scanned_quantity >= bySku.quantity) {
        return res.json({
          success: false,
          over: true,
          error: "This item is already fully picked",
          item: {
            id: bySku.id,
            sku: bySku.sku,
            variant_title: bySku.variant_title,
            product_name: bySku.product_name,
            scanned_quantity: bySku.scanned_quantity,
            quantity: bySku.quantity,
          },
        });
      }

      // Transaction: increment scan, record scan, audit, check complete
      const skuResult = store.transaction(db, () => {
        store.incrementOrderItemScanned(db, bySku.id);

        store.createOrderScan(db, {
          orderId: parseInt(orderId),
          orderItemId: bySku.id,
          productId: bySku.product_id,
          barcode: barcode.trim(),
          userId: req.user.id,
          businessId: req.businessId,
        });

        const newScanned = bySku.scanned_quantity + 1;

        auditLog(db, {
          businessId: req.businessId,
          userId: req.user.id,
          actionType: "order.verified",
          entityType: "order_item",
          entityId: bySku.id,
          newValue: { scanned: newScanned, barcode: barcode.trim(), sku: bySku.sku },
          source: "scanner",
          deviceInfo: getDeviceInfo(req),
        });

        checkOrderComplete(db, orderId);
        const updatedOrder = store.getOrderStatus(db, orderId);

        return { newScanned, orderStatus: updatedOrder.status };
      });

      return res.json({
        success: true,
        verified: true,
        item: {
          id: bySku.id,
          sku: bySku.sku,
          variant_title: bySku.variant_title,
          product_name: bySku.product_name,
          scanned_quantity: skuResult.newScanned,
          quantity: bySku.quantity,
        },
        remaining: bySku.quantity - skuResult.newScanned,
        orderStatus: skuResult.orderStatus,
      });
    }

    // Barcode match: check if already fully picked (read-only)
    if (item.scanned_quantity >= item.quantity) {
      return res.json({
        success: false,
        over: true,
        error: "This item is already fully picked",
        item: {
          id: item.id,
          sku: item.sku,
          variant_title: item.variant_title,
          product_name: item.product_name,
          scanned_quantity: item.scanned_quantity,
          quantity: item.quantity,
        },
      });
    }

    // Transaction: increment scan, record scan, audit, check complete
    const result = store.transaction(db, () => {
      store.incrementOrderItemScanned(db, item.id);

      store.createOrderScan(db, {
        orderId: parseInt(orderId),
        orderItemId: item.id,
        productId: item.product_id,
        barcode: barcode.trim(),
        userId: req.user.id,
        businessId: req.businessId,
      });

      const newScanned = item.scanned_quantity + 1;

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "order.verified",
        entityType: "order_item",
        entityId: item.id,
        newValue: { scanned: newScanned, barcode: barcode.trim(), sku: item.sku },
        source: "scanner",
        deviceInfo: getDeviceInfo(req),
      });

      checkOrderComplete(db, orderId);
      const updatedOrder = store.getOrderStatus(db, orderId);

      return { newScanned, orderStatus: updatedOrder.status };
    });

    res.json({
      success: true,
      verified: true,
      item: {
        id: item.id,
        sku: item.sku,
        variant_title: item.variant_title,
        product_name: item.product_name,
        scanned_quantity: result.newScanned,
        quantity: item.quantity,
      },
      remaining: item.quantity - result.newScanned,
      orderStatus: result.orderStatus,
    });
  } catch (err) {
    console.error("POST /api/orders/:id/scan error:", err);
    res.status(500).json({ success: false, error: "Failed to process scan" });
  }
});

function checkOrderComplete(db, orderId) {
  const pending = store.countPendingOrderItems(db, orderId);

  if (pending.count === 0) {
    store.updateOrderStatus(db, orderId, "complete");
    console.log(`[order] Order #${orderId} marked complete — all items verified`);
  }
}

// POST /api/orders/:id/reset — reset scanned quantities
app.post("/api/orders/:id/reset", requireAuth(db, "orders.fulfill"), (req, res) => {
  try {
    const orderId = req.params.id;

    // Read-only validation outside transaction
    const order = store.getOrderById(db, orderId, req.businessId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    store.transaction(db, () => {
      store.resetOrderScans(db, orderId);
      store.updateOrderStatus(db, orderId, "pending");

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "order.reset",
        entityType: "order",
        entityId: parseInt(orderId),
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });
    });

    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/orders/:id/reset error:", err);
    res.status(500).json({ error: "Failed to reset order" });
  }
});

// POST /api/orders/manual — create a manual order
app.post("/api/orders/manual", requireAuth(db, "orders.write"), async (req, res) => {
  try {
    const { source, customerName, customerEmail, shippingAddress, notes, items } = req.body;

    if (!source || !customerName) {
      return res.status(400).json({ error: "source and customerName are required" });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required" });
    }

    const validSources = ["manual", "phone", "wholesale", "walkin", "invoice", "replacement", "sample"];
    if (!validSources.includes(source)) {
      return res.status(400).json({ error: `Invalid source. Must be one of: ${validSources.join(", ")}` });
    }

    const result = store.transaction(db, () => {
      // Auto-generate order number (starts at 1000 for manual orders)
      const orderNumber = store.getNextOrderNumber(db, req.businessId);

      const orderId = store.createManualOrder(db, {
        source,
        orderNumber,
        customerName,
        customerEmail: customerEmail || null,
        shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : null,
        notes: notes || null,
        totalAmount: null, // computed from items
        createdBy: req.user.id,
        businessId: req.businessId,
      });

      let computedTotal = 0;
      for (const item of items) {
        const quantity = parseInt(item.quantity) || 1;
        const unitPrice = parseFloat(item.unitPrice) || 0;
        const lineTotal = unitPrice * quantity;
        computedTotal += lineTotal;

        // Look up product/variant info
        let productName = null;
        let sku = item.sku || null;
        let variantTitle = item.variantTitle || null;

        if (item.productId) {
          const product = store.getProductById(db, item.productId, req.businessId);
          if (product) {
            productName = product.name;
            sku = sku || product.sku;
          }
        }
        if (item.variantId) {
          const variant = db.query(
            "SELECT sku, variant_value FROM product_variants WHERE id = ? AND business_id = ?"
          ).get(item.variantId, req.businessId);
          if (variant) {
            sku = sku || variant.sku;
            variantTitle = variantTitle || variant.variant_value;
          }
        }

        store.createOrderItemWithVariant(db, {
          orderId,
          productId: item.productId || null,
          variantId: item.variantId || null,
          sku: sku || "UNKNOWN",
          variantTitle,
          quantity,
          unitPrice,
          lineTotal,
          businessId: req.businessId,
        });
      }

      // Update total amount
      if (computedTotal > 0) {
        db.run("UPDATE orders SET total_amount = ? WHERE id = ?", [computedTotal, orderId]);
      }

      // Audit
      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "order.created",
        entityType: "order",
        entityId: orderId,
        newValue: { order_number: orderNumber, source, customer_name: customerName, item_count: items.length },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      // Emit event
      emit("order.created", {
        businessId: req.businessId,
        orderId,
        orderNumber,
        source,
        customerName,
        itemCount: items.length,
      });

      return { orderId, orderNumber };
    });

    // Return full order
    const fullOrder = store.getOrderByIdFull(db, result.orderId, req.businessId);
    res.status(201).json({ success: true, order: fullOrder });
  } catch (err) {
    console.error("POST /api/orders/manual error:", err);
    res.status(500).json({ error: "Failed to create manual order" });
  }
});

// PUT /api/orders/:id — update order fields
app.put("/api/orders/:id", requireAuth(db, "orders.write"), (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = store.getOrderById(db, orderId, req.businessId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    store.updateOrder(db, orderId, req.body);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "order.updated",
      entityType: "order",
      entityId: orderId,
      previousValue: {
        customer_name: order.customer_name,
        status: order.status,
      },
      newValue: req.body,
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    const updated = store.getOrderById(db, orderId, req.businessId);
    res.json({ success: true, order: updated });
  } catch (err) {
    console.error("PUT /api/orders/:id error:", err);
    res.status(500).json({ error: "Failed to update order" });
  }
});

// POST /api/orders/:id/items — add item to order
app.post("/api/orders/:id/items", requireAuth(db, "orders.write"), (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = store.getOrderById(db, orderId, req.businessId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { productId, variantId, sku, variantTitle, quantity, unitPrice } = req.body;
    if (!quantity) {
      return res.status(400).json({ error: "quantity is required" });
    }

    const qty = parseInt(quantity) || 1;
    const price = parseFloat(unitPrice) || 0;
    const lineTotal = price * qty;

    const itemId = store.createOrderItemWithVariant(db, {
      orderId,
      productId: productId || null,
      variantId: variantId || null,
      sku: sku || "UNKNOWN",
      variantTitle: variantTitle || null,
      quantity: qty,
      unitPrice: price,
      lineTotal,
      businessId: req.businessId,
    });

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "order.item_added",
      entityType: "order_item",
      entityId: itemId,
      newValue: { order_id: orderId, sku, quantity: qty },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    const items = store.getOrderItemsByOrderId(db, orderId);
    res.status(201).json({ success: true, itemId, items });
  } catch (err) {
    console.error("POST /api/orders/:id/items error:", err);
    res.status(500).json({ error: "Failed to add item" });
  }
});

// DELETE /api/orders/:id/items/:itemId — remove item from order
app.delete("/api/orders/:id/items/:itemId", requireAuth(db, "orders.write"), (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const itemId = parseInt(req.params.itemId);
    const order = store.getOrderById(db, orderId, req.businessId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    store.deleteOrderItem(db, itemId);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "order.item_removed",
      entityType: "order_item",
      entityId: itemId,
      previousValue: { order_id: orderId },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    const items = store.getOrderItemsByOrderId(db, orderId);
    res.json({ success: true, items });
  } catch (err) {
    console.error("DELETE /api/orders/:id/items/:itemId error:", err);
    res.status(500).json({ error: "Failed to remove item" });
  }
});

// POST /api/orders/:id/cancel — cancel order
app.post("/api/orders/:id/cancel", requireAuth(db, "orders.write"), (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = store.getOrderById(db, orderId, req.businessId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (order.status === "cancelled") {
      return res.status(400).json({ error: "Order is already cancelled" });
    }

    store.cancelOrder(db, orderId, req.businessId);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "order.cancelled",
      entityType: "order",
      entityId: orderId,
      previousValue: { status: order.status },
      newValue: { status: "cancelled" },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    emit("order.cancelled", {
      businessId: req.businessId,
      orderId,
      orderNumber: order.order_number,
    });

    res.json({ success: true, status: "cancelled" });
  } catch (err) {
    console.error("POST /api/orders/:id/cancel error:", err);
    res.status(500).json({ error: "Failed to cancel order" });
  }
});

// POST /api/orders/search-products — search products for manual order
app.post("/api/orders/search-products", requireAuth(db, "orders.write"), (req, res) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: "Search query must be at least 2 characters" });
    }
    const results = store.searchProductsForOrder(db, req.businessId, query.trim());
    res.json(results);
  } catch (err) {
    console.error("POST /api/orders/search-products error:", err);
    res.status(500).json({ error: "Failed to search products" });
  }
});


// ── Users CRUD ────────────────────────────────────────────────────────

// GET /api/users — list users for current business
app.get("/api/users", requireAuth(db, "users.read"), (req, res) => {
  try {
    const users = store.listUsers(db, req.businessId);
    res.json(users);
  } catch (err) {
    console.error("GET /api/users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// POST /api/users — create a user in current business
app.post("/api/users", requireAuth(db, "users.create"), async (req, res) => {
  try {
    const { username, password, display_name, role } = req.body;

    if (!username || !password || !display_name) {
      return res.status(400).json({ error: "Username, password, and display name are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const validRoles = ["admin", "manager", "warehouse", "customer_service", "viewer", "marketing", "affiliate_manager", "manufacturing"];
    const assignedRole = role || "viewer";
    if (!validRoles.includes(assignedRole)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
    }

    // Hash password outside transaction (expensive, no DB state)
    const hash = await hashPassword(password);

    const user = store.transaction(db, () => {
      const userId = store.createUser(db, {
        username: username.trim(),
        hash,
        displayName: display_name.trim(),
        role: assignedRole,
      });

      // Add to current business via user_businesses
      store.addUserToBusiness(db, userId, req.businessId, assignedRole);

      const created = store.getUserByIdAndBusiness(db, userId, req.businessId);

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "user.created",
        entityType: "user",
        entityId: created.id,
        newValue: { username: created.username, role: created.role, display_name: created.display_name },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      return created;
    });

    res.status(201).json(user);
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "Username already exists" });
    }
    console.error("POST /api/users error:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// PUT /api/users/:id — update a user in current business
app.put("/api/users/:id", requireAuth(db, "users.edit"), (req, res) => {
  try {
    // Read old user outside transaction (validation)
    const oldUser = store.getUserByIdAndBusiness(db, req.params.id, req.businessId);

    if (!oldUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const { display_name, role } = req.body;
    const fields = {};

    if (display_name !== undefined) {
      fields.displayName = display_name.trim();
    }
    if (role !== undefined) {
      const validRoles = ["admin", "manager", "warehouse", "customer_service", "viewer", "marketing", "affiliate_manager", "manufacturing"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
      }
      fields.role = role;
    }

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const updated = store.transaction(db, () => {
      store.updateUser(db, req.params.id, req.businessId, fields);

      const fresh = store.getUserByIdAndBusiness(db, req.params.id, req.businessId);

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "user.updated",
        entityType: "user",
        entityId: oldUser.id,
        previousValue: { role: oldUser.role, display_name: oldUser.display_name },
        newValue: { role: fresh.role, display_name: fresh.display_name },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      return fresh;
    });

    res.json(updated);
  } catch (err) {
    console.error("PUT /api/users/:id error:", err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// DELETE /api/users/:id — delete a user in current business
app.delete("/api/users/:id", requireAuth(db, "users.delete"), (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Cannot delete self (validation outside transaction)
    if (userId === req.user.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Read user outside transaction (validation)
    const user = store.getUserByIdAndBusiness(db, userId, req.businessId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    store.transaction(db, () => {
      // Delete sessions for this user first
      store.deleteAllUserSessions(db, userId);
      // Delete password reset tokens
      store.deleteUserResetTokens(db, userId);
      // Delete the user
      store.deleteUser(db, userId, req.businessId);

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "user.deleted",
        entityType: "user",
        entityId: user.id,
        previousValue: { username: user.username, role: user.role },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });
    });

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/users/:id error:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// ── Audit log ──────────────────────────────────────────────────────────

// GET /api/audit-log — view audit entries (audit.read permission)
app.get("/api/audit-log", requireAuth(db, "audit.read"), (req, res) => {
  try {
    const entityType = req.query.entity_type || null;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const entries = store.getAuditLog(db, req.businessId, { entityType, limit, offset });
    const total = store.countAuditLog(db, req.businessId, entityType);
    const entityTypes = store.getAuditEntityTypes(db, req.businessId);

    res.json({
      entries,
      total,
      limit,
      offset,
      entityTypes,
    });
  } catch (err) {
    console.error("GET /api/audit-log error:", err);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

// ── Production Engine ──────────────────────────────────────────────────

// GET /api/production/boms — list all BOMs
app.get("/api/production/boms", requireAuth(db, "production.read"), (req, res) => {
  try {
    const boms = store.listBoms(db, req.businessId);
    // Attach items to each BOM
    const enriched = boms.map((bom) => {
      const items = store.getBomItems(db, bom.id);
      return { ...bom, items };
    });
    res.json(enriched);
  } catch (err) {
    console.error("GET /api/production/boms error:", err);
    res.status(500).json({ error: "Failed to fetch BOMs" });
  }
});

// POST /api/production/boms — create a BOM
app.post("/api/production/boms", requireAuth(db, "production.write"), (req, res) => {
  try {
    const { name, outputProductId, outputQuantity = 1, outputUnit = "unit", items = [] } = req.body;

    if (!name || !outputProductId) {
      return res.status(400).json({ error: "Name and outputProductId are required" });
    }

    // Validate output product exists
    const outputProduct = store.getProductById(db, outputProductId, req.businessId);
    if (!outputProduct) {
      return res.status(400).json({ error: "Output product not found" });
    }

    const result = store.transaction(db, () => {
      const bomId = store.createBom(db, {
        businessId: req.businessId,
        name: name.trim(),
        outputProductId,
        outputQuantity,
        outputUnit,
      });

      // Add items
      for (const item of items) {
        if (!item.inputProductId || !item.quantityPerBatch) continue;
        store.addBomItem(db, {
          bomId,
          inputProductId: item.inputProductId,
          quantityPerBatch: item.quantityPerBatch,
          unit: item.unit || "unit",
          sortOrder: item.sortOrder || 0,
        });
      }

      const bom = store.getBom(db, bomId, req.businessId);
      const bomItems = store.getBomItems(db, bomId);

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "bom.created",
        entityType: "bom",
        entityId: bomId,
        newValue: { name: bom.name, output_product: outputProduct.name, item_count: items.length },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      return { ...bom, items: bomItems };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error("POST /api/production/boms error:", err);
    res.status(500).json({ error: "Failed to create BOM" });
  }
});

// GET /api/production/boms/:id — get a single BOM with items
app.get("/api/production/boms/:id", requireAuth(db, "production.read"), (req, res) => {
  try {
    const bom = store.getBom(db, req.params.id, req.businessId);
    if (!bom) return res.status(404).json({ error: "BOM not found" });

    const items = store.getBomItems(db, req.params.id);
    res.json({ ...bom, items });
  } catch (err) {
    console.error("GET /api/production/boms/:id error:", err);
    res.status(500).json({ error: "Failed to fetch BOM" });
  }
});

// PUT /api/production/boms/:id — update a BOM
app.put("/api/production/boms/:id", requireAuth(db, "production.write"), (req, res) => {
  try {
    const oldBom = store.getBom(db, req.params.id, req.businessId);
    if (!oldBom) return res.status(404).json({ error: "BOM not found" });

    const { name, outputProductId, outputQuantity, outputUnit, isActive } = req.body;
    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (outputProductId !== undefined) fields.outputProductId = outputProductId;
    if (outputQuantity !== undefined) fields.outputQuantity = outputQuantity;
    if (outputUnit !== undefined) fields.outputUnit = outputUnit;
    if (isActive !== undefined) fields.isActive = isActive ? 1 : 0;

    store.updateBom(db, req.params.id, req.businessId, fields);
    const bom = store.getBom(db, req.params.id, req.businessId);
    const items = store.getBomItems(db, req.params.id);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "bom.updated",
      entityType: "bom",
      entityId: bom.id,
      previousValue: { name: oldBom.name, output_quantity: oldBom.output_quantity },
      newValue: { name: bom.name, output_quantity: bom.output_quantity },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    res.json({ ...bom, items });
  } catch (err) {
    console.error("PUT /api/production/boms/:id error:", err);
    res.status(500).json({ error: "Failed to update BOM" });
  }
});

// DELETE /api/production/boms/:id — delete a BOM
app.delete("/api/production/boms/:id", requireAuth(db, "production.write"), (req, res) => {
  try {
    const bom = store.deleteBom(db, req.params.id, req.businessId);
    if (!bom) return res.status(404).json({ error: "BOM not found" });

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "bom.deleted",
      entityType: "bom",
      entityId: bom.id,
      previousValue: { name: bom.name },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/production/boms/:id error:", err);
    res.status(500).json({ error: "Failed to delete BOM" });
  }
});

// ── BOM Items ────────────────────────────────────────────────────────

// POST /api/production/boms/:id/items — add an item to a BOM
app.post("/api/production/boms/:id/items", requireAuth(db, "production.write"), (req, res) => {
  try {
    const bomId = parseInt(req.params.id);
    const bom = store.getBom(db, bomId, req.businessId);
    if (!bom) return res.status(404).json({ error: "BOM not found" });

    const { inputProductId, quantityPerBatch, unit = "unit", sortOrder = 0 } = req.body;

    if (!inputProductId || quantityPerBatch === undefined) {
      return res.status(400).json({ error: "inputProductId and quantityPerBatch are required" });
    }

    // Validate input product exists
    const product = store.getProductById(db, inputProductId, req.businessId);
    if (!product) return res.status(400).json({ error: "Input product not found" });

    const itemId = store.addBomItem(db, { bomId, inputProductId, quantityPerBatch, unit, sortOrder });

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "bom.item_added",
      entityType: "bom_item",
      entityId: itemId,
      newValue: { bom_id: bomId, input_product: product.name, quantity: quantityPerBatch, unit },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    res.status(201).json({ id: itemId, bom_id: bomId, inputProductId, quantityPerBatch, unit, sortOrder });
  } catch (err) {
    console.error("POST /api/production/boms/:id/items error:", err);
    res.status(500).json({ error: "Failed to add BOM item" });
  }
});

// PUT /api/production/bom-items/:itemId — update a BOM item
app.put("/api/production/bom-items/:itemId", requireAuth(db, "production.write"), (req, res) => {
  try {
    const { inputProductId, quantityPerBatch, unit, sortOrder } = req.body;
    const fields = {};
    if (inputProductId !== undefined) fields.inputProductId = inputProductId;
    if (quantityPerBatch !== undefined) fields.quantityPerBatch = quantityPerBatch;
    if (unit !== undefined) fields.unit = unit;
    if (sortOrder !== undefined) fields.sortOrder = sortOrder;

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    store.updateBomItem(db, req.params.itemId, fields);
    res.json({ success: true });
  } catch (err) {
    console.error("PUT /api/production/bom-items/:itemId error:", err);
    res.status(500).json({ error: "Failed to update BOM item" });
  }
});

// DELETE /api/production/bom-items/:itemId — delete a BOM item
app.delete("/api/production/bom-items/:itemId", requireAuth(db, "production.write"), (req, res) => {
  try {
    store.deleteBomItem(db, req.params.itemId);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/production/bom-items/:itemId error:", err);
    res.status(500).json({ error: "Failed to delete BOM item" });
  }
});

// ── Production Batches ───────────────────────────────────────────────

// GET /api/production/batches — list batches
app.get("/api/production/batches", requireAuth(db, "production.read"), (req, res) => {
  try {
    const batches = store.listBatches(db, req.businessId);
    res.json(batches);
  } catch (err) {
    console.error("GET /api/production/batches error:", err);
    res.status(500).json({ error: "Failed to fetch batches" });
  }
});

// POST /api/production/batches — create a batch from a BOM
app.post("/api/production/batches", requireAuth(db, "production.write"), (req, res) => {
  try {
    const { bomId, batchSize = 1, notes = "" } = req.body;

    if (!bomId) return res.status(400).json({ error: "bomId is required" });

    const bom = store.getBom(db, bomId, req.businessId);
    if (!bom) return res.status(404).json({ error: "BOM not found" });
    if (!bom.is_active) return res.status(400).json({ error: "BOM is inactive" });

    const batchId = store.createBatch(db, {
      businessId: req.businessId,
      bomId,
      batchSize,
      notes,
      createdBy: req.user.id,
    });

    const batch = store.getBatch(db, batchId, req.businessId);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "production.batch_created",
      entityType: "production_batch",
      entityId: batchId,
      newValue: { bom_name: bom.name, batch_size: batchSize, output_product: bom.output_product_name },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    // Publish event
    emit("production.batch_created", {
      batchId,
      businessId: req.businessId,
      bomId,
      bomName: bom.name,
      batchSize,
      userId: req.user.id,
    });

    res.status(201).json(batch);
  } catch (err) {
    console.error("POST /api/production/batches error:", err);
    res.status(500).json({ error: "Failed to create batch" });
  }
});

// GET /api/production/batches/:id — get full batch with reservations, movements, availability
app.get("/api/production/batches/:id", requireAuth(db, "production.read"), (req, res) => {
  try {
    const batch = store.getBatchFull(db, req.params.id, req.businessId);
    if (!batch) return res.status(404).json({ error: "Batch not found" });

    res.json(batch);
  } catch (err) {
    console.error("GET /api/production/batches/:id error:", err);
    res.status(500).json({ error: "Failed to fetch batch" });
  }
});

// POST /api/production/batches/:id/execute — RUN the batch (V3.3: consume reservations)
app.post("/api/production/batches/:id/execute", requireAuth(db, "production.execute"), (req, res) => {
  try {
    // Mark reservations as consumed first
    db.run(
      "UPDATE inventory_reservations SET status = 'consumed' WHERE batch_id = ? AND business_id = ? AND status = 'reserved'",
      [req.params.id, req.businessId]
    );

    const result = store.executeBatch(db, req.params.id, req.businessId, req.user.id);

    // Audit
    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "production.batch_completed",
      entityType: "production_batch",
      entityId: result.batchId,
      newValue: {
        bom_name: result.bomName,
        batch_size: result.batchSize,
        consumed: result.consumed.map(c => `${c.productName}: ${c.actual} ${c.unit}`),
        produced: `${result.outputProductName}: ${result.outputQuantity} ${result.outputUnit}`,
      },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    // Audit each inventory change
    for (const c of result.consumed) {
      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "production.inventory_consumed",
        entityType: "inventory",
        entityId: c.productId,
        newValue: { product: c.productName, sku: c.sku, quantity: c.actual, unit: c.unit, batch_id: result.batchId },
        source: "production",
        reason: `Batch #${result.batchId}: ${result.bomName}`,
      });
    }

    for (const p of result.produced) {
      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "production.inventory_produced",
        entityType: "inventory",
        entityId: p.productId,
        newValue: { product: p.productName, sku: p.sku, quantity: p.actual, unit: p.unit, batch_id: result.batchId },
        source: "production",
        reason: `Batch #${result.batchId}: ${result.bomName}`,
      });
    }

    // Publish events for downstream departments (Warehouse + Purchasing)
    emit("production.batch_completed", { batchId: result.batchId, businessId: req.businessId, ...result });
    emit("production.inventory_consumed", { batchId: result.batchId, businessId: req.businessId, consumed: result.consumed });
    emit("production.inventory_produced", { batchId: result.batchId, businessId: req.businessId, produced: result.produced });

    res.json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message,
        ...(err.shortage && { shortage: err.shortage }),
      });
    }
    console.error("POST /api/production/batches/:id/execute error:", err);
    res.status(500).json({ error: "Failed to execute batch" });
  }
});

// POST /api/production/batches/:id/cancel — cancel batch (V3.3: draft releases reservations, completed reverses inventory)
app.post("/api/production/batches/:id/cancel", requireAuth(db, "production.execute"), (req, res) => {
  try {
    const { reason } = req.body || {};
    const result = store.cancelBatchV33(db, req.params.id, req.businessId, req.user.id, reason);

    if (result.reversals) {
      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "production.batch_cancelled",
        entityType: "production_batch",
        entityId: result.batchId,
        newValue: {
          reversals: result.reversals.map(r => `${r.productName}: ${r.direction} ${r.quantity} ${r.unit}`),
        },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
        reason: reason || "Batch cancelled — inventory reversed",
      });
    } else {
      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "production.batch_cancelled",
        entityType: "production_batch",
        entityId: result.batchId,
        newValue: result,
        source: "manual",
        deviceInfo: getDeviceInfo(req),
        reason: reason || "Batch cancelled — reservations released",
      });
    }

    res.json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("POST /api/production/batches/:id/cancel error:", err);
    res.status(500).json({ error: "Failed to cancel batch" });
  }
});
// POST /api/production/batches/:id/reserve — reserve inventory for a batch
app.post("/api/production/batches/:id/reserve", requireAuth(db, "production.execute"), (req, res) => {
  try {
    const result = store.reserveInventoryForBatch(db, req.params.id, req.businessId);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "production.reserved",
      entityType: "production_batch",
      entityId: result.batchId,
      newValue: result,
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    res.json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("POST /api/production/batches/:id/reserve error:", err);
    res.status(500).json({ error: "Failed to reserve inventory" });
  }
});

// POST /api/production/batches/:id/undo — undo a completed batch (full reversal)
app.post("/api/production/batches/:id/undo", requireAuth(db, "production.execute"), (req, res) => {
  try {
    const result = store.undoBatch(db, req.params.id, req.businessId, req.user.id);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "production.batch_undone",
      entityType: "production_batch",
      entityId: result.batchId,
      newValue: {
        reversals: result.reversals.map(r => `${r.productName}: ${r.direction} ${r.quantity} ${r.unit}`),
      },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
      reason: "Batch undone — all inventory reversed",
    });

    emit("production.batch_undone", { batchId: result.batchId, businessId: req.businessId, ...result });

    res.json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("POST /api/production/batches/:id/undo error:", err);
    res.status(500).json({ error: "Failed to undo batch" });
  }
});

// GET /api/production/requirements — what's needed to manufacture vs current stock
app.get("/api/production/requirements", requireAuth(db, "production.read"), (req, res) => {
  try {
    const result = store.getProductionRequirements(db, req.businessId);
    res.json(result);
  } catch (err) {
    console.error("GET /api/production/requirements error:", err);
    res.status(500).json({ error: "Failed to fetch production requirements" });
  }
});

// GET /api/production/pending — "What should I manufacture today?"
app.get("/api/production/pending", requireAuth(db, "production.read"), (req, res) => {
  try {
    const batches = store.getPendingBatches(db, req.businessId);

    // For each pending batch, check material shortages
    const enriched = batches.map((batch) => {
      const bomItems = store.getBomItems(db, batch.bom_id);
      const shortages = [];
      for (const item of bomItems) {
        const needed = item.quantity_per_batch * batch.batch_size;
        const available = item.input_stock_count || 0;
        if (available < needed) {
          shortages.push({
            productId: item.input_product_id,
            productName: item.input_product_name,
            sku: item.input_product_sku,
            needed,
            available,
            shortfall: needed - available,
            unit: item.unit,
          });
        }
      }
      return { ...batch, bomItems, shortages, canExecute: shortages.length === 0 };
    });

    res.json({
      pending: enriched,
      total: enriched.length,
      canExecuteCount: enriched.filter(b => b.canExecute).length,
      summary: enriched.length > 0
        ? `${enriched.length} batch(es) pending — ${enriched.filter(b => b.canExecute).length} ready to manufacture`
        : "No pending production batches",
    });
  } catch (err) {
    console.error("GET /api/production/pending error:", err);
    res.status(500).json({ error: "Failed to fetch pending batches" });
  }
});

// GET /api/production/summary — AI-consumable production summary
app.get("/api/production/summary", requireAuth(db, "production.read"), (req, res) => {
  try {
    const summary = getProductionSummary(db, req.businessId);
    res.json(summary);
  } catch (err) {
    console.error("GET /api/production/summary error:", err);
    res.status(500).json({ error: "Failed to fetch production summary" });
  }
});

// ── Calculation Engine ─────────────────────────────────────────────────

// GET /api/calc/templates — list public templates
app.get("/api/calc/templates", requireAuth(db, "calculation.read"), (req, res) => {
  try {
    const templates = store.listTemplates(db);
    res.json(templates);
  } catch (err) {
    console.error("GET /api/calc/templates error:", err);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

// POST /api/calc/templates/:id/instantiate — copy template to user formulas
app.post("/api/calc/templates/:id/instantiate", requireAuth(db, "calculation.execute"), (req, res) => {
  try {
    const templateId = req.params.id;
    const formula = store.instantiateTemplate(db, req.businessId, templateId);

    if (!formula) {
      return res.status(404).json({ error: "Template not found" });
    }

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "calculation.formula_created",
      entityType: "formula",
      entityId: formula.id,
      newValue: { name: formula.name, category: formula.category, fromTemplate: templateId },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    emit("calculation.formula_created", {
      formulaId: formula.id,
      businessId: req.businessId,
      name: formula.name,
      templateId,
      userId: req.user.id,
    });

    res.status(201).json(formula);
  } catch (err) {
    console.error("POST /api/calc/templates/:id/instantiate error:", err);
    res.status(500).json({ error: "Failed to instantiate template" });
  }
});

// GET /api/calc/formulas — list user formulas
app.get("/api/calc/formulas", requireAuth(db, "calculation.read"), (req, res) => {
  try {
    const category = req.query.category || null;
    const formulas = store.listFormulas(db, req.businessId, category);
    res.json(formulas);
  } catch (err) {
    console.error("GET /api/calc/formulas error:", err);
    res.status(500).json({ error: "Failed to fetch formulas" });
  }
});

// POST /api/calc/formulas/validate — validate expression without saving
app.post("/api/calc/formulas/validate", requireAuth(db, "calculation.execute"), (req, res) => {
  try {
    const { expression, inputs } = req.body;
    if (!expression || !inputs || !Array.isArray(inputs)) {
      return res.status(400).json({ error: "expression (string) and inputs (array) are required" });
    }
    const errors = [];
    const validInputs = inputs.filter(i => i && i.key);
    if (expression.trim()) {
      const knownKeys = new Set(validInputs.map(i => i.key));
      try {
        const usedVars = require("./calc.js").extractVariables(expression);
        for (const v of usedVars) {
          if (!knownKeys.has(v)) {
            errors.push({ message: `Unknown variable "${v}" — not defined in inputs`, variable: v });
          }
        }
      } catch (parseErr) {
        errors.push({ message: parseErr.message });
      }
      if (errors.length === 0) {
        try {
          const testInputs = {};
          for (const inp of validInputs) {
            testInputs[inp.key] = inp.default !== undefined ? inp.default : (inp.min || 1);
          }
          require("./calc.js").evaluate(expression, testInputs);
        } catch (evalErr) {
          errors.push({ message: evalErr.message, variable: evalErr.variable || undefined });
        }
      }
    }
    let variablesUsed = [];
    if (expression.trim()) {
      try {
        variablesUsed = require("./calc.js").extractVariables(expression);
      } catch {}
    }
    res.json({ valid: errors.length === 0, errors, variablesUsed });
  } catch (err) {
    console.error("POST /api/calc/formulas/validate error:", err);
    res.status(500).json({ error: "Validation failed" });
  }
});

// POST /api/calc/formulas — create a custom formula
app.post("/api/calc/formulas", requireAuth(db, "calculation.execute"), (req, res) => {
  try {
    const { name, description, category, inputs, outputExpression, outputLabel, outputUnit, isPublic } = req.body;

    if (!name || !inputs || !outputExpression || !outputLabel) {
      return res.status(400).json({ error: "Name, inputs, outputExpression, and outputLabel are required" });
    }

    const formulaId = store.createFormula(db, req.businessId, {
      name: name.trim(),
      description: description || null,
      category: category || "custom",
      inputs,
      outputExpression,
      outputLabel,
      outputUnit: outputUnit || null,
      isPublic: isPublic ? 1 : 0,
    });

    const formula = store.getFormula(db, formulaId);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "calculation.formula_created",
      entityType: "formula",
      entityId: formulaId,
      newValue: { name: formula.name, category: formula.category, isPublic: isPublic ? 1 : 0 },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    emit("calculation.formula_created", {
      formulaId,
      businessId: req.businessId,
      name: formula.name,
      userId: req.user.id,
    });

    res.status(201).json(formula);
  } catch (err) {
    console.error("POST /api/calc/formulas error:", err);
    res.status(500).json({ error: "Failed to create formula" });
  }
});

// GET /api/calc/formulas/:id — single formula
app.get("/api/calc/formulas/:id", requireAuth(db, "calculation.read"), (req, res) => {
  try {
    const formula = store.getFormula(db, req.params.id);
    if (!formula) return res.status(404).json({ error: "Formula not found" });
    res.json(formula);
  } catch (err) {
    console.error("GET /api/calc/formulas/:id error:", err);
    res.status(500).json({ error: "Failed to fetch formula" });
  }
});

// PUT /api/calc/formulas/:id — update a formula
app.put("/api/calc/formulas/:id", requireAuth(db, "calculation.execute"), (req, res) => {
  try {
    const oldFormula = store.getFormula(db, req.params.id);
    if (!oldFormula) return res.status(404).json({ error: "Formula not found" });

    const { name, description, category, inputs, outputExpression, outputLabel, outputUnit } = req.body;
    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (description !== undefined) fields.description = description;
    if (category !== undefined) fields.category = category;
    if (inputs !== undefined) fields.inputs = inputs;
    if (outputExpression !== undefined) fields.outputExpression = outputExpression;
    if (outputLabel !== undefined) fields.outputLabel = outputLabel;
    if (outputUnit !== undefined) fields.outputUnit = outputUnit;

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    store.updateFormula(db, req.params.id, req.businessId, fields);
    const formula = store.getFormula(db, req.params.id);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "calculation.formula_updated",
      entityType: "formula",
      entityId: formula.id,
      previousValue: { name: oldFormula.name, outputLabel: oldFormula.output_label },
      newValue: { name: formula.name, outputLabel: formula.output_label },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    res.json(formula);
  } catch (err) {
    console.error("PUT /api/calc/formulas/:id error:", err);
    res.status(500).json({ error: "Failed to update formula" });
  }
});

// DELETE /api/calc/formulas/:id — delete a formula
app.delete("/api/calc/formulas/:id", requireAuth(db, "calculation.execute"), (req, res) => {
  try {
    const formula = store.getFormula(db, req.params.id);
    if (!formula) return res.status(404).json({ error: "Formula not found" });

    store.deleteFormula(db, req.params.id, req.businessId);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "calculation.formula_deleted",
      entityType: "formula",
      entityId: formula.id,
      previousValue: { name: formula.name },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/calc/formulas/:id error:", err);
    res.status(500).json({ error: "Failed to delete formula" });
  }
});

// POST /api/calc/execute — execute a formula with inputs
app.post("/api/calc/execute", requireAuth(db, "calculation.execute"), (req, res) => {
  try {
    const { formulaId, inputs } = req.body;

    if (!formulaId || !inputs) {
      return res.status(400).json({ error: "formulaId and inputs are required" });
    }

    const formula = store.getFormula(db, formulaId);
    if (!formula) {
      return res.status(404).json({ error: "Formula not found" });
    }

    // Evaluate expression with provided inputs (in-memory, no DB round-trip)
    const result = evaluate(formula.output_expression, inputs);

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "calculation.executed",
      entityType: "formula",
      entityId: formula.id,
      newValue: {
        formulaName: formula.name,
        inputs,
        result,
        outputUnit: formula.output_unit,
        outputLabel: formula.output_label,
      },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    emit("calculation.formula_executed", {
      formulaId: formula.id,
      businessId: req.businessId,
      formulaName: formula.name,
      inputs,
      result,
      outputUnit: formula.output_unit,
      userId: req.user.id,
    });

    res.json({
      formulaId: formula.id,
      formulaName: formula.name,
      inputs,
      result,
      outputLabel: formula.output_label,
      outputUnit: formula.output_unit,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, ...(err.variable && { variable: err.variable }) });
    }
    console.error("POST /api/calc/execute error:", err);
    res.status(500).json({ error: "Failed to execute formula" });
  }
});

// GET /api/calc/summary — AI-consumable calculation summary
app.get("/api/calc/summary", requireAuth(db, "calculation.read"), (req, res) => {
  try {
    const summary = getCalculationSummary(db, req.businessId);
    res.json(summary);
  } catch (err) {
    console.error("GET /api/calc/summary error:", err);
    res.status(500).json({ error: "Failed to fetch calculation summary" });
  }
});

// ── HQ Dashboard ──────────────────────────────────────────────────────

// GET /api/hq/summary — aggregated HQ summary for owner dashboard
app.get("/api/hq/summary", requireAuth(db, "reports.read"), (req, res) => {
  try {
    const summary = getHQSummary(db, req.businessId);
    res.json(summary);
  } catch (err) {
    console.error("GET /api/hq/summary error:", err);
    res.status(500).json({ error: "Failed to fetch HQ summary" });
  }
});

// ── Order Scan (barcode) ─────────────────────────────────────────────
app.post("/api/orders/:id/scan", requireAuth(db, "orders.fulfill"), (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { barcode } = req.body;

    if (!barcode) {
      return res.status(400).json({ error: "barcode is required" });
    }

    // Try to find the order item by product barcode
    let item = store.getOrderItemByBarcode(db, orderId, barcode);
    // Fallback: try by SKU
    if (!item) {
      item = store.getOrderItemBySku(db, orderId, barcode);
    }

    if (!item) {
      return res.status(404).json({ error: "No order item found for this barcode/SKU" });
    }

    if (item.scanned_quantity >= item.quantity) {
      return res.status(400).json({ error: "This item has already been fully picked" });
    }

    store.incrementOrderItemScanned(db, item.id, 1);
    store.createOrderScan(db, {
      orderId,
      orderItemId: item.id,
      productId: item.product_id,
      barcode,
      userId: req.user.id,
      businessId: req.businessId,
    });

    // Update order status to 'picking' if currently pending
    const order = store.getOrderStatus(db, orderId);
    if (order && order.status === 'pending') {
      store.updateOrderStatus(db, orderId, 'picking');
    }

    emit(db, "order.item_scanned", {
      orderId,
      orderItemId: item.id,
      sku: item.sku,
      barcode,
      businessId: req.businessId,
    });

    res.json({
      success: true,
      orderItemId: item.id,
      sku: item.sku,
      productName: item.product_name,
      scanned: (item.scanned_quantity || 0) + 1,
      total: item.quantity,
      remaining: item.quantity - ((item.scanned_quantity || 0) + 1),
    });
  } catch (err) {
    console.error("POST /api/orders/:id/scan error:", err);
    res.status(500).json({ error: err.message || "Failed to process scan" });
  }
});

// ── Purchasing Intelligence Engine ──────────────────────────────────────
mountPurchasingRoutes(app, db);
mountTimelineRoutes(app, db);
mountBestieRoutes(app, db);
mountOpportunityRoutes(app, db);
mountHealthRoutes(app, db);
mountVariantRoutes(app, db, requireAuth);
mountWarehouseRoutes(app, db, requireAuth);
mountCsRoutes(app, db);
mountIndustryRoutes(app, db);
mountAffiliateRoutes(app, db);
mountCommerceRoutes(app, db);
mountCustomerRoutes(app, db);
mountEmailRoutes(app, db);
mountApprovalRoutes(app, db);
mountStudioRoutes(app, db);
  mountGrowthRoutes(app, db);
  mountNoviEvolutionRoutes(app, db);
  mountNoviMessageRoutes(app, db);
  initNoviDetection(db);
  initOpportunityBridge(db);
  mountTeamRoutes(app, db);
  mountFulfillmentRoutes(app, db);
  mountPartnerRoutes(app, db);
  mountAffiliateAttributionRoutes(app, db);
  mountStoreCreditRoutes(app, db);
  mountBrandSetupRoutes(app, db);
  mountOnboardingRoutes(app, db);
  mountMovementRoutes(app, db, requireAuth);
  // ── Shopify OAuth (multi-business self-serve) ────────────────
  mountShopifyOauthRoutes(app, db);
  mountShopifyWebhookRoutes(app, db);

// ── Dream Grant application endpoint ────────────────────────────────

app.post('/api/dream-grant/apply', (req, res) => {
  try {
    const { name, email, dream, build, stopping, change, mean } = req.body;
    if (!name || !email || !dream || !build || !change) {
      return res.status(400).json({ error: 'Name, email, dream, build, and change are required.' });
    }
    // Store in database for now (future: email notifications)
    db.run(
      `INSERT INTO dream_grant_applications (name, email, dream, build, stopping, change_field, mean_field, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [name, email, dream, build, stopping || '', change, mean || '']
    );
    console.log(`Dream Grant application received from ${name} <${email}>`);
    res.json({ success: true, message: 'Application received.' });
  } catch (err) {
    console.error('Dream Grant submission error:', err);
    res.status(500).json({ error: 'Failed to submit application. Please try again.' });
  }
});



// ── Founding Members status endpoint ───────────────────────────────
app.get('/api/founding-members/status', (req, res) => {
  try {
    const limit = parseInt(db.query("SELECT value FROM system_settings WHERE key = 'founding_member_limit'").get()?.value || '250');
    const claimed = db.query("SELECT COUNT(*) as c FROM founding_members").get().c;
    res.json({ limit, claimed, remaining: Math.max(0, limit - claimed) });
  } catch (err) {
    console.error('Founding members status error:', err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// ── Global error handler — sanitizes all uncaught errors ────────────
app.use((err, req, res, _next) => {
  console.error("[global-error]", err?.message || err);
  const { status, message } = sanitizeServerError(err);
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});


// ── Waitlist join endpoint ─────────────────────────────────────────
app.post('/api/waitlist/join', (req, res) => {
  try {
    const { name, email, business_type, current_software, pain_point } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
    db.run(
      `INSERT INTO waitlist (name, email, business_type, current_software, pain_point, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [name, email, business_type || '', current_software || '', pain_point || '']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Waitlist error:', err);
    res.status(500).json({ error: 'Failed to join waitlist.' });
  }
});

// Landing page (public/) — served BEFORE the SPA so / goes to the marketing page
const publicPath = path.join(import.meta.dirname, "..", "public");
app.use(express.static(publicPath));

// ── Static files & SPA fallback ───────────────────────────────────────

const distPath = path.join(import.meta.dirname, "..", "client", "dist");

app.use(express.static(distPath));

app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(distPath, "index.html"));
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ShimmerStock running on http://0.0.0.0:${PORT}`);
});
