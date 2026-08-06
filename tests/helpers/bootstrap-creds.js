/**
 * Explicit temporary bootstrap credentials used only in test contexts.
 *
 * These are supplied to initDb so the production fail-closed validation passes.
 * They are immediately wiped by seedFixtures() and never reach production.
 * Update here if the minimum-length or blocked-values policy changes.
 */
export const TEST_OWNER_INITIAL_PASSWORD = "TestOwner!Bootstrap#2025";
export const TEST_ADMIN_INITIAL_PASSWORD = "TestAdmin!Bootstrap#2025";
