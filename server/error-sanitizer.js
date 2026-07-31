// ── Server-side error sanitization ─────────────────────────────────
// Strips stack traces, SQL errors, and internal dev labels from error messages
// before they reach the client. Used by the global error handler middleware.

function sanitizeServerError(err) {
  // If it's a known user-facing error with status, keep it
  if (err.statusCode && err.userMessage) {
    return { status: err.statusCode, message: err.userMessage };
  }
  const msg = err?.message || String(err);
  // Strip stack traces
  if (msg.includes(' at ') && (msg.includes('.js:') || msg.includes('.ts:'))) {
    return { status: 500, message: "Something went wrong. Please try again." };
  }
  // Strip raw JSON dumps
  if (msg.startsWith('{') || msg.startsWith('[')) {
    return { status: 500, message: "Something went wrong. Please try again." };
  }
  // Don't expose SQL errors
  if (msg.includes('SQLITE_') || msg.includes('UNIQUE constraint') || msg.includes('FOREIGN KEY')) {
    return { status: 500, message: "Something went wrong. Please try again." };
  }
  // Don't expose system errors
  if (msg.includes('ENOENT') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')) {
    return { status: 500, message: "Something went wrong. Please try again." };
  }
  // Truncate very long messages (likely dumps)
  const cleaned = msg.length > 200 ? msg.substring(0, 200) + '…' : msg;
  return { status: 500, message: cleaned || "Something went wrong. Please try again." };
}

export { sanitizeServerError };
