/**
 * Thin wrapper around same-origin fetch for cookie-based auth.
 * On 401 responses, clears auth state and redirects to /login.
 *
 * MOBILE NOTE: The `window.location.href` redirect pattern (lines 26, 103) is
 * web-only. A React Native/Expo mobile app must NOT import this file — it should
 * implement its own API client with native secure storage and navigation-based
 * 401 handling instead of `window.location.href`.
 */

import { measureApiCall } from './perf';

export const AUTH_REQUIRED_EVENT = "shimmerstock:auth-required";

/**
 * Sanitize error messages for display — strip stack traces, JSON dumps,
 * and internal dev labels. Returns a Novi-friendly message.
 */
export function sanitizeError(raw: unknown): string {
  if (!raw) return "Something went wrong. Please try again.";
  const msg = typeof raw === 'string' ? raw : (raw as any)?.message || String(raw);
  // If it looks like a stack trace or raw JSON, use a generic message
  if (msg.includes(' at ') && (msg.includes('.tsx:') || msg.includes('.js:') || msg.includes('.ts:'))) {
    return "Something went wrong. Please try again.";
  }
  if (msg.startsWith('{') || msg.startsWith('[')) {
    return "Something went wrong. Please try again.";
  }
  // Strip any "Error:" prefix noise but keep the meaningful part
  const cleaned = msg.replace(/^(Error|TypeError|ReferenceError|SyntaxError):\s*/i, '');
  // If the message is very long (likely a dump), truncate
  if (cleaned.length > 200) {
    return cleaned.substring(0, 200) + '…';
  }
  return cleaned || "Something went wrong. Please try again.";
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...extra };
}

/**
 * If the response is 401, clear the stored token and redirect to /login.
 * Returns true if a redirect was triggered (caller should stop and not continue).
 */
function handleAuthError(res: Response): boolean {
  if (res.status === 401) {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
    window.location.href = "/login";
    return true;
  }
  return false;
}

export async function apiGet<T = any>(url: string): Promise<T> {
  const start = performance.now();
  const res = await fetch(url, { headers: authHeaders(), credentials: "same-origin" });
  measureApiCall(url, performance.now() - start);
  if (handleAuthError(res)) {
    // Redirect triggered — return a never-resolving promise to halt execution
    return new Promise(() => {});
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiPost<T = any>(url: string, body?: any): Promise<T> {
  const start = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  measureApiCall(url, performance.now() - start);
  if (handleAuthError(res)) {
    return new Promise(() => {});
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiPut<T = any>(url: string, body?: any): Promise<T> {
  const start = performance.now();
  const res = await fetch(url, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  measureApiCall(url, performance.now() - start);
  if (handleAuthError(res)) {
    return new Promise(() => {});
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiDelete<T = any>(url: string): Promise<T> {
  const start = performance.now();
  const res = await fetch(url, {
    method: "DELETE",
    headers: authHeaders(),
    credentials: "same-origin",
  });
  measureApiCall(url, performance.now() - start);
  if (handleAuthError(res)) {
    return new Promise(() => {});
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Raw fetch for cases where we need the Response object directly (e.g. scanning).
 * Also handles 401 redirect for consistency.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = authHeaders(
    options.headers ? (options.headers as Record<string, string>) : {}
  );
  const res = await fetch(url, { ...options, headers, credentials: "same-origin" });
  if (res.status === 401) {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
    window.location.href = "/login";
  }
  return res;
}
