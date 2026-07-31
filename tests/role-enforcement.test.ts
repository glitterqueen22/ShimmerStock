/**
 * Role enforcement tests.
 *
 * A limited-role user (viewer) must be denied on privileged endpoints
 * while the owner of the same business succeeds.
 */
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { setupTest, loginAs } from "./helpers/test-harness.js";

let appUrl: string;
let cleanup: (() => Promise<void>) | undefined;
let tokenOwner: string;
let tokenViewer: string;

beforeAll(async () => {
  const env = await setupTest();
  appUrl = env.appUrl;
  cleanup = env.cleanup;
  tokenOwner = await loginAs(appUrl, "owner_a", "test1234");
  tokenViewer = await loginAs(appUrl, "viewer_a", "test1234");
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

async function authReq(method: string, path: string, token: string, body?: any) {
  return fetch(`${appUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Role enforcement — User management (privileged)", () => {
  it("owner can create a user", async () => {
    const res = await authReq("POST", "/api/users", tokenOwner, {
      username: "new_user_test",
      password: "newpass1234",
      display_name: "New Test User",
      role: "viewer",
    });
    expect(res.status).toBe(201);
  });

  it("viewer is denied creating a user", async () => {
    const res = await authReq("POST", "/api/users", tokenViewer, {
      username: "should_fail",
      password: "fail1234",
      display_name: "Should Fail",
      role: "viewer",
    });
    expect(res.status).toBe(403);
  });

  it("viewer is denied deleting a user", async () => {
    // Try to delete owner (user ID 1)
    const res = await authReq("DELETE", "/api/users/1", tokenViewer);
    expect(res.status).toBe(403);
  });

  it("owner can delete a user they created", async () => {
    // First create a user as owner, then delete them
    const createRes = await authReq("POST", "/api/users", tokenOwner, {
      username: "temp_to_delete",
      password: "temppass12",
      display_name: "Temp Delete",
      role: "viewer",
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    const deleteRes = await authReq("DELETE", `/api/users/${created.id}`, tokenOwner);
    // Owner should be able to delete a user they created
    expect([200, 204]).toContain(deleteRes.status);
  });
});

describe("Role enforcement — Product deletion (privileged)", () => {
  it("viewer is denied deleting a product", async () => {
    const res = await authReq("DELETE", "/api/products/1", tokenViewer);
    expect(res.status).toBe(403);
  });

  it("owner can delete a product", async () => {
    // Create a product first
    const createRes = await authReq("POST", "/api/products", tokenOwner, {
      name: "Temp Product",
      sku: "SKU-TEMP-DEL",
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    const deleteRes = await authReq("DELETE", `/api/products/${created.id}`, tokenOwner);
    expect(deleteRes.status).toBe(200);
  });
});

describe("Role enforcement — Settings", () => {
  it("viewer is denied access to settings-like endpoints", async () => {
    // Try to create a business (requires settings.write)
    const res = await authReq("POST", "/api/businesses", tokenViewer, {
      name: "Should Fail Biz",
      slug: "should-fail",
    });
    expect(res.status).toBe(403);
  });
});
