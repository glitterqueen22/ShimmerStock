import * as store from "./store.js";

/**
 * Hash a password using bcrypt (via Bun.password).
 */
export function hashPassword(password) {
  return Bun.password.hash(password);
}

/**
 * Verify a password against a hash.
 */
export function verifyPassword(password, hash) {
  return Bun.password.verify(password, hash);
}

/**
 * Generate a random session token.
 */
export function generateToken() {
  return crypto.randomUUID();
}

/**
 * Generate a random reset token.
 */
export function generateResetToken() {
  return crypto.randomUUID();
}

/**
 * Express middleware: require authentication with optional permission check.
 * Reads token from Authorization: Bearer <token> header or "token" cookie.
 * On success attaches req.user and req.sessionId.
 * Returns 401 on failure, 403 on permission denied.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {string} [permission] - Optional permission to check (e.g. 'products.write')
 */
export function requireAuth(db, permission) {
  return (req, res, next) => {
    // Extract token
    let token = null;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }

    // Fallback to cookie
    if (!token && req.headers.cookie) {
      const cookies = parseCookies(req.headers.cookie);
      token = cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Look up session
    const session = store.getSessionByToken(db, token);

    if (!session) {
      return res.status(401).json({ error: "Invalid session" });
    }

    // Check session expiry
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < now) {
      store.deleteSession(db, session.id);
      return res.status(401).json({ error: "Session expired" });
    }

    // P0.3: Use effective_business_id from session (set by getSessionByToken)
    // Falls back to business_id for legacy compatibility with old sessions
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
    req.sessionId = session.id;

    // Check permission if specified — use business_role for permission lookup
    if (permission) {
      const businessRole = session.business_role || session.role;
      const hasPermission = store.getRolePermission(db, businessRole, permission);

      if (!hasPermission) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
    }

    next();
  };
}

/**
 * Refresh a session token's expiry if it's within 1 hour of expiration.
 * Call this on active API endpoints (like /api/auth/me) to extend sessions.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {string} token - The session token to potentially refresh
 */
export function refreshSession(db, token) {
  if (!token) return;

  const session = store.getSessionExpiry(db, token);

  if (!session) return;

  const now = new Date();
  const expiresAt = new Date(session.expires_at);
  const oneHour = 60 * 60 * 1000;

  // If within 1 hour of expiry, extend by 8 hours
  if (expiresAt.getTime() - now.getTime() < oneHour) {
    const newExpiry = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
    store.refreshSessionExpiry(db, session.id, newExpiry);
  }
}

/**
 * Parse Cookie header into an object.
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  cookieHeader.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx > 0) {
      const key = pair.substring(0, idx).trim();
      const value = pair.substring(idx + 1).trim();
      cookies[key] = decodeURIComponent(value);
    }
  });
  return cookies;
}