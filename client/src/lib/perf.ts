/**
 * Lightweight performance measurement utility.
 * Logs to console.debug — non-intrusive, dev-friendly.
 */

const SLOW_API_THRESHOLD_MS = 1000;
const recorded = new Set<string>();

export function measurePageLoad(pageName: string) {
  if (typeof window === 'undefined') return;
  const start = performance.now();
  window.addEventListener('load', () => {
    const elapsed = Math.round(performance.now() - start);
    console.debug(`[perf] ${pageName} page load: ${elapsed}ms`);
  }, { once: true });
}

export function measureApiCall(endpoint: string, durationMs: number) {
  if (durationMs > SLOW_API_THRESHOLD_MS) {
    console.warn(`[perf] SLOW API: ${endpoint} took ${Math.round(durationMs)}ms`);
  }
  // Log first call of each endpoint once for baseline
  if (!recorded.has(endpoint)) {
    recorded.add(endpoint);
    console.debug(`[perf] ${endpoint}: ${Math.round(durationMs)}ms (first call)`);
  }
}

/**
 * Measure a large list render — logs when a table renders with many rows.
 */
export function measureListRender(component: string, itemCount: number) {
  if (itemCount > 100) {
    console.debug(`[perf] LARGE LIST: ${component} rendering ${itemCount} items`);
  }
}
