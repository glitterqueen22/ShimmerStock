/**
 * Workspace state — gates demo insights, first-day checklist, and empty states.
 *
 * Three exclusive states:
 *   EMPTY_REAL — new workspace, no data yet; no fake alerts
 *   DEMO       — explicitly in demo mode; illustrative data allowed
 *   REAL       — live business data; only real insights shown
 *
 * Demo insights (is_demo=true) are only displayed in DEMO state.
 * Switching demo industry never mutates real business records.
 */

import type { BusinessTypeId, DemoInsight } from "./businessDna";

export type WorkspaceState = "empty_real" | "demo" | "real";

export interface WorkspaceConfig {
  state: WorkspaceState;
  /** Active demo business type — only meaningful in "demo" state */
  demoTypeId: BusinessTypeId | null;
  /** Human-readable label for demo banner */
  demoLabel: string | null;
}

// Storage key for demo preference (session, not persisted across login)
const DEMO_STATE_KEY = "shimmerstock_workspace_demo_state";

/** Derive workspace state from server-returned business context */
export function deriveWorkspaceState(opts: {
  hasAnyProducts: boolean;
  hasAnyOrders: boolean;
  hasCompletedOnboarding: boolean;
  isDemoMode?: boolean;
  demoTypeId?: BusinessTypeId | null;
}): WorkspaceConfig {
  if (opts.isDemoMode) {
    const typeId = opts.demoTypeId ?? "craft_supplies";
    return {
      state: "demo",
      demoTypeId: typeId,
      demoLabel: `DEMO WORKSPACE — Illustrative data`,
    };
  }

  const hasRealData = opts.hasAnyProducts || opts.hasAnyOrders;
  if (!hasRealData) {
    return { state: "empty_real", demoTypeId: null, demoLabel: null };
  }

  return { state: "real", demoTypeId: null, demoLabel: null };
}

/** Get persisted demo preference from session storage */
export function getSessionDemoType(): BusinessTypeId | null {
  try {
    const val = sessionStorage.getItem(DEMO_STATE_KEY);
    return (val as BusinessTypeId) ?? null;
  } catch {
    return null;
  }
}

/** Persist demo industry preference to session (not localStorage — does not cross login) */
export function setSessionDemoType(typeId: BusinessTypeId | null): void {
  try {
    if (typeId) {
      sessionStorage.setItem(DEMO_STATE_KEY, typeId);
    } else {
      sessionStorage.removeItem(DEMO_STATE_KEY);
    }
  } catch {
    // Ignore storage errors in test environments
  }
}

/**
 * Filter insights by workspace state.
 * - EMPTY_REAL: returns [] (no fake alerts)
 * - DEMO: returns all is_demo insights
 * - REAL: returns only insights where is_demo !== true
 */
export function filterInsightsByWorkspaceState(
  insights: DemoInsight[],
  state: WorkspaceState,
): DemoInsight[] {
  switch (state) {
    case "empty_real":
      return [];
    case "demo":
      return insights.filter((i) => i.is_demo === true);
    case "real":
      return insights.filter((i) => i.is_demo !== true);
  }
}

/**
 * Whether a given workspace state should show demo data labels.
 * Only "demo" state shows the Demo badge.
 */
export function isDemoState(state: WorkspaceState): boolean {
  return state === "demo";
}
