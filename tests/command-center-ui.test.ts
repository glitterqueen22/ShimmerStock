import { describe, expect, it } from "bun:test";

describe("Novi Command Center UI contract", () => {
  it("renders live tenant exceptions and safe module handoffs without demo claims", async () => {
    const source = await Bun.file("client/src/pages/HQ.tsx").text();
    expect(source).toContain("Live workspace");
    expect(source).toContain("No operational exceptions right now.");
    expect(source).toContain("Preview mission");
    expect(source).toContain("review and approve the work");
    expect(source).toContain("What Novi remembers");
    expect(source).not.toContain("getDemoInsights");
    expect(source).not.toContain("Demo ·");
  });

  it("keeps live fulfillment queues separate from demo and verified-ready claims", async () => {
    const source = await Bun.file("client/src/pages/Fulfillment.tsx").text();
    expect(source).toContain("Packing Queue");
    expect(source).toContain("order.fully_picked ? 'Ready to Ship'");
    expect(source).toContain("No orders are waiting in the packing queue.");
    expect(source).not.toContain("getDemoInsights");
    expect(source).not.toContain("Everything is shipped");
  });

  it("uses one reusable approved wordmark and favicon treatment", async () => {
    const brand = await Bun.file("client/src/components/BrandMark.tsx").text();
    const navbar = await Bun.file("client/src/components/ui/Navbar.tsx").text();
    const html = await Bun.file("client/index.html").text();
    expect(brand).toContain('aria-label="ShimmerStock"');
    expect(brand).toContain("/brand/shimmerstock-logo-horizontal.svg");
    expect(brand).toContain("/brand/shimmerstock-mark-dark.svg");
    expect(navbar.match(/<BrandMark/g)).toHaveLength(2);
    expect(html).toContain('href="/brand/favicon.svg"');
    expect(html).toContain('content="#0F172A"');
  });

  it("renders Novi from an explicit approved-art manifest without generating character artwork", async () => {
    const source = await Bun.file("client/src/components/Novi.tsx").text();
    const wrappers = await Bun.file("client/src/components/novi/NoviArtwork.tsx").text();
    const styles = await Bun.file("client/src/components/Novi.css").text();

    for (const asset of ["idle-desk", "alert", "focused", "thinking", "serious", "success", "cozy-end"]) {
      expect(source).toContain(`/assets/novi/novi-${asset}.webp`);
    }
    expect(source).toContain('<img');
    expect(source).toContain('loading={priority || size === "micro" || size === "sm" ? "eager" : "lazy"}');
    expect(source).toContain('decoding="async"');
    expect(source).toContain('data-art-status="approved"');
    expect(source).not.toContain("TEMPORARY_REFERENCE_ASSET");
    expect(source).not.toContain("VITE_NOVI_APPROVED_ART");
    expect(wrappers).toContain("export function NoviAvatar");
    expect(wrappers).toContain("export function NoviState");
    expect(wrappers).toContain("export function NoviCallout");
    expect(wrappers).toContain("export function NoviEmptyState");
    expect(wrappers).toContain("export function NoviHomepageAppearance");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(await Bun.file("client/public/brand/novi/novi-art-pending.svg").exists()).toBe(false);
    expect(await Bun.file("client/src/components/NoviCharacter.tsx").exists()).toBe(false);
  });
});