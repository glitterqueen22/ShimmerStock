import crypto from "crypto";
import { SHOPIFY_API_VERSION } from "./providers/shopify-gateway.js";

export const SHOPIFY_OAUTH_REQUIRED_SCOPES = Object.freeze([
  "read_orders",
  "read_products",
  "read_inventory",
  "read_locations",
]);

export const SHOPIFY_OAUTH_OPTIONAL_SCOPES = Object.freeze(["write_products"]);

export const SHOPIFY_OAUTH_SCOPE_STRING = SHOPIFY_OAUTH_REQUIRED_SCOPES.join(",");
export const SHOPIFY_OAUTH_CLIENT_ID_ENV = "SHOPIFY_CLIENT_ID";
export const SHOPIFY_OAUTH_CLIENT_SECRET_ENV = "SHOPIFY_CLIENT_SECRET";

const PLACEHOLDER_PATTERNS = [
  /^your[-_\s]/i,
  /^replace[-_\s]/i,
  /^placeholder(?:[-_\s].*)?$/i,
  /^dummy[-_\s]/i,
  /^fake[-_\s]/i,
  /^sample[-_\s]/i,
  /^example[-_\s]/i,
  /^changeme(?:[-_\s].*)?$/i,
  /^change[-_\s]?me(?:[-_\s].*)?$/i,
  /^todo(?:[-_\s].*)?$/i,
  /^tbd(?:[-_\s].*)?$/i,
  /^redacted(?:[-_\s].*)?$/i,
];

function fingerprintPrefix(value, length = 12) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, length);
}

function isPlaceholderValue(value) {
  const lowered = value.toLowerCase();
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(lowered));
}

function sanitizeCredential(rawValue, sourceEnvVar) {
  const source = sourceEnvVar;
  const raw = rawValue == null ? "" : String(rawValue);
  const trimmed = raw.trim();
  const hadOuterWhitespace = raw !== trimmed;

  if (!trimmed) {
    return {
      ok: false,
      source,
      configured: false,
      trimmedLength: 0,
      fingerprintPrefix: null,
      whitespaceDetected: hadOuterWhitespace,
      surroundingQuotesDetected: false,
      placeholderDetected: false,
      error: `${source} is missing or empty`,
    };
  }

  const surroundingQuotesDetected = (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  );

  if (surroundingQuotesDetected) {
    return {
      ok: false,
      source,
      configured: true,
      trimmedLength: trimmed.length,
      fingerprintPrefix: null,
      whitespaceDetected: hadOuterWhitespace,
      surroundingQuotesDetected: true,
      placeholderDetected: false,
      error: `${source} is wrapped in quotes`,
    };
  }

  const embeddedWhitespaceDetected = /\s/.test(trimmed);
  if (embeddedWhitespaceDetected) {
    return {
      ok: false,
      source,
      configured: true,
      trimmedLength: trimmed.length,
      fingerprintPrefix: null,
      whitespaceDetected: true,
      surroundingQuotesDetected: false,
      placeholderDetected: false,
      error: `${source} contains whitespace`,
    };
  }

  if (isPlaceholderValue(trimmed)) {
    return {
      ok: false,
      source,
      configured: true,
      trimmedLength: trimmed.length,
      fingerprintPrefix: null,
      whitespaceDetected: hadOuterWhitespace,
      surroundingQuotesDetected: false,
      placeholderDetected: true,
      error: `${source} appears to be a placeholder value`,
    };
  }

  return {
    ok: true,
    source,
    configured: true,
    value: trimmed,
    trimmedLength: trimmed.length,
    fingerprintPrefix: fingerprintPrefix(trimmed),
    whitespaceDetected: hadOuterWhitespace,
    surroundingQuotesDetected: false,
    placeholderDetected: false,
    error: null,
  };
}

function resolveAppUrl(env, overrideAppUrl) {
  const raw = overrideAppUrl != null && overrideAppUrl !== ""
    ? String(overrideAppUrl)
    : String(env.SHIMMERSTOCK_PUBLIC_URL || env.SHIMMERSTOCK_URL || "");
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: true,
      source: overrideAppUrl != null && overrideAppUrl !== "" ? "mount option" : (env.SHIMMERSTOCK_PUBLIC_URL ? "SHIMMERSTOCK_PUBLIC_URL" : (env.SHIMMERSTOCK_URL ? "SHIMMERSTOCK_URL" : "default")),
      configured: false,
      value: "http://localhost:3000",
      error: null,
    };
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return {
      ok: false,
      source: overrideAppUrl != null && overrideAppUrl !== "" ? "mount option" : (env.SHIMMERSTOCK_PUBLIC_URL ? "SHIMMERSTOCK_PUBLIC_URL" : "SHIMMERSTOCK_URL"),
      configured: true,
      value: null,
      error: "Shopify app URL is wrapped in quotes",
    };
  }

  try {
    const parsed = new URL(trimmed);
    return {
      ok: true,
      source: overrideAppUrl != null && overrideAppUrl !== "" ? "mount option" : (env.SHIMMERSTOCK_PUBLIC_URL ? "SHIMMERSTOCK_PUBLIC_URL" : "SHIMMERSTOCK_URL"),
      configured: true,
      value: parsed.origin,
      error: null,
    };
  } catch {
    return {
      ok: false,
      source: overrideAppUrl != null && overrideAppUrl !== "" ? "mount option" : (env.SHIMMERSTOCK_PUBLIC_URL ? "SHIMMERSTOCK_PUBLIC_URL" : "SHIMMERSTOCK_URL"),
      configured: true,
      value: null,
      error: "Shopify app URL must be a valid absolute URL",
    };
  }
}

export function resolveShopifyOAuthConfig(env = process.env, options = {}) {
  const requireClientId = options.requireClientId !== false;
  const requireClientSecret = options.requireClientSecret !== false;
  const clientId = sanitizeCredential(env.SHOPIFY_CLIENT_ID, SHOPIFY_OAUTH_CLIENT_ID_ENV);
  const clientSecret = sanitizeCredential(env.SHOPIFY_CLIENT_SECRET, SHOPIFY_OAUTH_CLIENT_SECRET_ENV);
  const appUrl = resolveAppUrl(env, options.appUrl);

  const diagnostics = {
    clientId: {
      configured: clientId.configured,
      source: clientId.source,
      trimmedLength: clientId.trimmedLength,
      fingerprintPrefix: clientId.fingerprintPrefix,
      whitespaceDetected: clientId.whitespaceDetected,
      surroundingQuotesDetected: clientId.surroundingQuotesDetected,
      placeholderDetected: clientId.placeholderDetected,
    },
    clientSecret: {
      configured: clientSecret.configured,
      source: clientSecret.source,
      trimmedLength: clientSecret.trimmedLength,
      whitespaceDetected: clientSecret.whitespaceDetected,
      surroundingQuotesDetected: clientSecret.surroundingQuotesDetected,
      placeholderDetected: clientSecret.placeholderDetected,
    },
    appUrl: {
      configured: appUrl.configured,
      source: appUrl.source,
      value: appUrl.value,
    },
    redirectUri: appUrl.value ? `${appUrl.value}/api/shopify/auth/callback` : null,
    requestedScopes: SHOPIFY_OAUTH_SCOPE_STRING,
    apiVersion: SHOPIFY_API_VERSION,
  };

  if (requireClientId && !clientId.ok) {
    return {
      ok: false,
      error: clientId.error,
      diagnostics,
      clientId: null,
      clientSecret: clientSecret.ok ? clientSecret.value : null,
      appUrl: appUrl.ok ? appUrl.value : null,
      redirectUri: diagnostics.redirectUri,
      requestedScopes: SHOPIFY_OAUTH_SCOPE_STRING,
      apiVersion: SHOPIFY_API_VERSION,
    };
  }

  if (requireClientSecret && !clientSecret.ok) {
    return {
      ok: false,
      error: clientSecret.error,
      diagnostics,
      clientId: clientId.value,
      clientSecret: null,
      appUrl: appUrl.ok ? appUrl.value : null,
      redirectUri: diagnostics.redirectUri,
      requestedScopes: SHOPIFY_OAUTH_SCOPE_STRING,
      apiVersion: SHOPIFY_API_VERSION,
    };
  }

  if (!appUrl.ok) {
    return {
      ok: false,
      error: appUrl.error,
      diagnostics,
      clientId: clientId.value,
      clientSecret: clientSecret.value,
      appUrl: null,
      redirectUri: null,
      requestedScopes: SHOPIFY_OAUTH_SCOPE_STRING,
      apiVersion: SHOPIFY_API_VERSION,
    };
  }

  return {
    ok: true,
    error: null,
    diagnostics,
    clientId: clientId.ok ? clientId.value : null,
    clientSecret: clientSecret.ok ? clientSecret.value : null,
    appUrl: appUrl.value,
    redirectUri: diagnostics.redirectUri,
    requestedScopes: SHOPIFY_OAUTH_SCOPE_STRING,
    apiVersion: SHOPIFY_API_VERSION,
  };
}

export function buildShopifyAuthorizationUrl({ shopDomain, clientId, redirectUri, state, includeProductWriteback = false }) {
  const url = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  const scopes = includeProductWriteback
    ? [...SHOPIFY_OAUTH_REQUIRED_SCOPES, ...SHOPIFY_OAUTH_OPTIONAL_SCOPES]
    : SHOPIFY_OAUTH_REQUIRED_SCOPES;
  url.searchParams.set("scope", scopes.join(","));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export function getShopifyOAuthDiagnostics(env = process.env, options = {}) {
  return resolveShopifyOAuthConfig(env, options).diagnostics;
}

export function fingerprintShopifyOAuthValue(value) {
  return fingerprintPrefix(String(value || ""));
}