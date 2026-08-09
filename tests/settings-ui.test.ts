import { describe, expect, it } from "bun:test";

describe("Settings UX contract", () => {
  it("provides every owner-facing settings destination from one searchable hub", async () => {
    const source = await Bun.file("client/src/pages/Settings.tsx").text();
    for (const section of [
      "Account & Security", "Business Profile", "Current Access", "Team & Permissions",
      "Integrations", "Novi Preferences", "Notifications", "Printing & Labels",
      "Support", "Data & Privacy",
    ]) expect(source).toContain(section);
    expect(source).toContain('placeholder="Search settings"');
    expect(source).toContain('navigate("/team")');
    expect(source).toContain('navigate("/commerce")');
    expect(source).toContain('navigate("/products/sku-label-studio")');
    expect(source).toContain('navigate("/bestie")');
  });

  it("uses persisted APIs for support, passwords, business profile, and Novi alerts", async () => {
    const source = await Bun.file("client/src/pages/Settings.tsx").text();
    expect(source).toContain('apiGet<SettingsOverview>("/api/settings/overview")');
    expect(source).toContain('apiPost<{ reference: string }>("/api/settings/support-requests"');
    expect(source).toContain('apiGet<{ requests: SupportRequest[] }>("/api/settings/support-requests")');
    expect(source).toContain("changePassword(passwords.current, passwords.next, passwords.confirmation)");
    expect(source).toContain('apiPut("/api/business/settings"');
    expect(source).toContain('apiPut<NoviSettings>("/api/novi/settings"');
    expect(source).toContain("Do not include passwords, access tokens, API keys, authorization headers, or customer data.");
  });

  it("does not fabricate paid billing or Shopify capabilities", async () => {
    const source = await Bun.file("client/src/pages/Settings.tsx").text();
    expect(source).toContain('overview.access.billing.configured ? "Configured" : "Not configured"');
    expect(source).toContain('shopify.connectionMode === "product_writeback" ? "SKU/barcode product writeback" : "Read-only"');
    expect(source).not.toContain("Upgrade now");
    expect(source).not.toContain("Next billing date");
    expect(source).not.toContain("Full Shopify sync");
  });

  it("keeps Help and Contact globally available in the authenticated user menu", async () => {
    const source = await Bun.file("client/src/components/ui/Navbar.tsx").text();
    expect(source).toContain("Help / Contact ShimmerStock");
    expect(source).toContain("navigate('/settings#support')");
  });

  it("shows truthful password recovery instead of claiming an email was sent", async () => {
    const source = await Bun.file("client/src/pages/Login.tsx").text();
    expect(source).toContain("{forgotMessage}");
    expect(source).toContain("Check Recovery Options");
    expect(source).toContain('view === "forgot-sent" ? "Recovery options"');
    expect(source).not.toContain("a reset link has been sent");
    expect(source).not.toContain("Send Reset Link");
    expect(source).not.toContain("Check your email");
  });
});