# Testing ShimmerStock

This document outlines the testing strategy, currently implemented coverage, and guidelines for adding new tests to the ShimmerStock platform.

## Current Coverage (Part 1 - Automated Test Foundation)

The current test suite covers the foundational platform components required for production readiness:

- **Boot Safety:** Validates that the server refuses to boot if critical configuration (like `ENCRYPTION_KEY`) is missing or invalid.
- **Session Expiry:** Ensures expired sessions are rejected with a 401 Unauthorized status, preventing stale token access.
- **Tenant Isolation:** Enforces strict multi-tenancy. Ensures that a user authenticated to Business A cannot read, list, update, or delete records belonging to Business B (coverage includes products, orders, inventory, and users). Validates that forged `business_id` payloads in request bodies or query strings cannot override the session's effective business ID.
- **Role Enforcement:** Validates role-based access control (RBAC). Ensures that limited-role users (e.g., viewers) are denied access to privileged endpoints (such as user management, product deletion, and settings endpoints) while owners succeed.

*Note: Part 2 (Shopify OAuth/webhooks, duplicate prevention, inventory, etc.) is queued for a future iteration.*

## Running the Tests

Tests are executed using the Bun test runner. Each test file runs in an isolated environment and uses an isolated SQLite database to prevent interference.

To run the complete test suite locally:

```bash
ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" bun test
```

### Continuous Integration (CI)

The test suite is automatically executed on every push and pull request via GitHub Actions (`.github/workflows/ci.yml`). Merging to `main` is blocked if any test fails.

## Adding New Tests

1. **Test Location:** Add new test files to the `tests/` directory with the `.test.ts` extension.
2. **Test Harness:** Use the provided test harness to set up an isolated database and server instance for your tests. Import `setupTest` from `tests/helpers/test-harness.js`.

   ```typescript
   import { describe, expect, it, beforeAll, afterAll } from "bun:test";
   import { setupTest, loginAs } from "./helpers/test-harness.js";

   let appUrl: string;
   let cleanup: () => Promise<void>;
   let token: string;

   beforeAll(async () => {
     const env = await setupTest();
     appUrl = env.appUrl;
     cleanup = env.cleanup;
     token = await loginAs(appUrl, "owner_a", "test1234");
   });

   afterAll(async () => {
     if (cleanup) await cleanup();
   });
   ```

3. **Isolated State:** `setupTest` automatically creates a unique SQLite database (`/tmp/shimmerstock-test-*.db`), seeds it with standard multi-tenant fixtures (Business A & Business B with respective owners, viewers, products, and orders), and spins up the Express server on an ephemeral port.
4. **Cache Busting:** The harness correctly handles module isolation via ESM query string cache-busting, ensuring parallel tests do not share the same database connection or application state.
