function parseBooleanFlag(value) {
  return String(value || "").toLowerCase() === "true";
}

function parsePort(rawPort) {
  if (rawPort === undefined || rawPort === null || rawPort === "") {
    return 3000;
  }

  const parsed = Number.parseInt(String(rawPort), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return parsed;
}

function parseSameSite(rawSameSite) {
  const normalized = String(rawSameSite || "lax").toLowerCase();
  if (!["lax", "strict", "none"].includes(normalized)) {
    throw new Error("SESSION_COOKIE_SAME_SITE must be one of: lax, strict, none");
  }
  return normalized;
}

function parseUrl(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch {
    throw new Error("SHIMMERSTOCK_URL must be a valid absolute URL");
  }
}

export function getRuntimeConfig(env = process.env) {
  const isTest = parseBooleanFlag(env.SHIMMERSTOCK_TEST);
  const isProduction = env.NODE_ENV === "production";
  const isPrivateMode = parseBooleanFlag(env.SHIMMERSTOCK_PRIVATE_MODE);
  const isProductionLike = !isTest && (isProduction || isPrivateMode);
  const sameSite = parseSameSite(env.SESSION_COOKIE_SAME_SITE);
  const cookieSecure = isProductionLike || parseBooleanFlag(env.SESSION_COOKIE_SECURE);

  const config = {
    isTest,
    isProduction,
    isPrivateMode,
    isProductionLike,
    port: parsePort(env.PORT),
    dbPath: env.SHIMMERSTOCK_DB_PATH,
    appUrl: env.SHIMMERSTOCK_URL,
    corsAllowedOrigin: env.CORS_ALLOWED_ORIGIN || null,
    trustProxy: isProductionLike,
    sessionCookieName: "token",
    sessionCookieHttpOnly: true,
    sessionCookieSameSite: sameSite,
    sessionCookieSecure: cookieSecure,
  };

  if (config.sessionCookieSameSite === "none" && !config.sessionCookieSecure) {
    throw new Error("SESSION_COOKIE_SAME_SITE=none requires secure cookies");
  }

  if (isProductionLike) {
    if (!config.appUrl) {
      throw new Error("SHIMMERSTOCK_URL is required when staging/private mode or production mode is enabled");
    }

    const parsedUrl = parseUrl(config.appUrl);
    if (parsedUrl.protocol !== "https:") {
      throw new Error("SHIMMERSTOCK_URL must use https in staging/private mode or production mode");
    }
  }

  return config;
}
