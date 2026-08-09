import { describe, expect, it } from "bun:test";
import {
  buildShopifyAuthorizationUrl,
  fingerprintShopifyOAuthValue,
  resolveShopifyOAuthConfig,
  SHOPIFY_OAUTH_SCOPE_STRING,
} from "../server/shopify-oauth-config.js";

describe("Shopify OAuth config resolver", () => {
  it("uses SHOPIFY_CLIENT_ID as the only approved client-id source", () => {
    const config = resolveShopifyOAuthConfig({
      SHOPIFY_CLIENT_ID: "valid_client_id_1234567890",
      SHOPIFY_API_KEY: "legacy_stale_key_should_not_win",
      SHOPIFY_CLIENT_SECRET: "valid_client_secret_1234567890",
      SHIMMERSTOCK_URL: "http://localhost:3000",
    } as Record<string, string>);

    expect(config.ok).toBe(true);
    expect(config.clientId).toBe("valid_client_id_1234567890");
    expect(config.diagnostics.clientId.source).toBe("SHOPIFY_CLIENT_ID");
    expect(config.diagnostics.clientId.configured).toBe(true);
  });

  it("fails closed when only a legacy API key is present", () => {
    const config = resolveShopifyOAuthConfig({
      SHOPIFY_API_KEY: "legacy_stale_key_should_not_win",
      SHOPIFY_CLIENT_SECRET: "valid_client_secret_1234567890",
      SHIMMERSTOCK_URL: "http://localhost:3000",
    } as Record<string, string>);

    expect(config.ok).toBe(false);
    expect(config.error).toContain("SHOPIFY_CLIENT_ID");
    expect(config.clientId).toBeNull();
  });

  it("trims outer whitespace safely", () => {
    const config = resolveShopifyOAuthConfig({
      SHOPIFY_CLIENT_ID: "  valid_client_id_1234567890  ",
      SHOPIFY_CLIENT_SECRET: "valid_client_secret_1234567890",
      SHIMMERSTOCK_URL: "http://localhost:3000",
    } as Record<string, string>);

    expect(config.ok).toBe(true);
    expect(config.clientId).toBe("valid_client_id_1234567890");
    expect(config.diagnostics.clientId.whitespaceDetected).toBe(true);
    expect(config.diagnostics.clientId.trimmedLength).toBe("valid_client_id_1234567890".length);
    expect(config.diagnostics.clientId.fingerprintPrefix).toBe(
      fingerprintShopifyOAuthValue("valid_client_id_1234567890").slice(0, 12)
    );
  });

  it("rejects embedded newline characters", () => {
    const config = resolveShopifyOAuthConfig({
      SHOPIFY_CLIENT_ID: "valid\nclient_id_1234567890",
      SHOPIFY_CLIENT_SECRET: "valid_client_secret_1234567890",
      SHIMMERSTOCK_URL: "http://localhost:3000",
    } as Record<string, string>);

    expect(config.ok).toBe(false);
    expect(config.error).toContain("whitespace");
    expect(config.diagnostics.clientId.whitespaceDetected).toBe(true);
  });

  it("rejects surrounding quotes", () => {
    const config = resolveShopifyOAuthConfig({
      SHOPIFY_CLIENT_ID: '"valid_client_id_1234567890"',
      SHOPIFY_CLIENT_SECRET: "valid_client_secret_1234567890",
      SHIMMERSTOCK_URL: "http://localhost:3000",
    } as Record<string, string>);

    expect(config.ok).toBe(false);
    expect(config.error).toContain("quotes");
    expect(config.diagnostics.clientId.surroundingQuotesDetected).toBe(true);
  });

  it("rejects placeholder values", () => {
    const config = resolveShopifyOAuthConfig({
      SHOPIFY_CLIENT_ID: "your_client_id",
      SHOPIFY_CLIENT_SECRET: "valid_client_secret_1234567890",
      SHIMMERSTOCK_URL: "http://localhost:3000",
    } as Record<string, string>);

    expect(config.ok).toBe(false);
    expect(config.error).toContain("placeholder");
    expect(config.diagnostics.clientId.placeholderDetected).toBe(true);
  });
});

describe("Shopify OAuth authorization URL builder", () => {
  it("builds the authorize URL with the exact approved scopes and callback URI", () => {
    const url = new URL(buildShopifyAuthorizationUrl({
      shopDomain: "craft-supply-test.myshopify.com",
      clientId: "valid_client_id_1234567890",
      redirectUri: "https://shimmerstock-production.up.railway.app/api/shopify/auth/callback",
      state: "state-token-value",
    }));

    expect(url.origin).toBe("https://craft-supply-test.myshopify.com");
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("valid_client_id_1234567890");
    expect(url.searchParams.get("redirect_uri")).toBe("https://shimmerstock-production.up.railway.app/api/shopify/auth/callback");
    expect(url.searchParams.get("scope")).toBe(SHOPIFY_OAUTH_SCOPE_STRING);
    expect(url.searchParams.get("state")).toBe("state-token-value");
    expect(url.searchParams.has("client_secret")).toBe(false);
  });

  it("requests write_products only during the explicit Product Editing flow", () => {
    const url = new URL(buildShopifyAuthorizationUrl({
      shopDomain: "craft-supply-test.myshopify.com",
      clientId: "valid_client_id_1234567890",
      redirectUri: "https://app.example.com/api/shopify/auth/callback",
      state: "state-token-value",
      includeProductWriteback: true,
    }));
    expect(url.searchParams.get("scope")).toBe(`${SHOPIFY_OAUTH_SCOPE_STRING},write_products`);
    expect(url.searchParams.get("scope")).not.toContain("write_inventory");
    expect(url.searchParams.get("scope")).not.toContain("read_all_orders");
  });
});