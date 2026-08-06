const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|password|secret|encryption|credential|api[_-]?key)/i;

export function redactSensitiveValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveValue(entry));
  }
  if (typeof value === "object") {
    return sanitizeLogContext(value);
  }
  return "[REDACTED]";
}

export function sanitizeLogContext(context) {
  if (!context || typeof context !== "object") {
    return context;
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, redactSensitiveValue(value)];
      }
      if (value && typeof value === "object") {
        return [key, sanitizeLogContext(value)];
      }
      return [key, value];
    })
  );
}

export function logInfo(scope, message, context) {
  if (context) {
    console.log(`[${scope}] ${message}`, sanitizeLogContext(context));
    return;
  }
  console.log(`[${scope}] ${message}`);
}

export function logWarn(scope, message, context) {
  if (context) {
    console.warn(`[${scope}] ${message}`, sanitizeLogContext(context));
    return;
  }
  console.warn(`[${scope}] ${message}`);
}

export function logError(scope, message, context) {
  if (context) {
    console.error(`[${scope}] ${message}`, sanitizeLogContext(context));
    return;
  }
  console.error(`[${scope}] ${message}`);
}