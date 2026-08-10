import { describe, expect, it } from "bun:test";

describe("repository instruction safety contract", () => {
  it("keeps tenant, Shopify, truth, and production-data boundaries explicit", async () => {
    const instructions = await Bun.file(".github/copilot-instructions.md").text();

    expect(instructions).toContain("authenticated `business_id`");
    expect(instructions).toContain("test cross-tenant denial");
    expect(instructions).toContain("Never read, edit, delete, migrate, seed, or otherwise manipulate production data");
    expect(instructions).toContain("`read_orders`, `read_products`, `read_inventory`, and `read_locations`");
    expect(instructions).toContain("The only optional write scope is `write_products`");
    expect(instructions).toContain("Never request `write_inventory`, `write_orders`, `write_locations`, `read_all_orders`");
    expect(instructions).toContain("mutation gateway is deny-by-default");
    expect(instructions).toContain("Shopify re-read verifies the matching value");
  });

  it("locks Novi identity and the semantic brand hierarchy", async () => {
    const instructions = await Bun.file(".github/copilot-instructions.md").text();

    expect(instructions).toContain("black-and-white tuxedo-cat mascot");
    expect(instructions).toContain("Final Novi character and logo artwork require owner approval");
    expect(instructions).toContain("not GGE software");
    expect(instructions).toContain("pink for Monica's spark and primary brand personality");
    expect(instructions).toContain("navy and grey for her husband's grounding partnership");
    expect(instructions).toContain("living people who continue to influence and support Monica");
    expect(instructions).toContain("never use memorial, remembrance, or posthumous framing");
    expect(instructions).toContain("wedding colors");
    expect(instructions).toContain("why it is trustworthy before introducing the people behind the colors");
    expect(instructions).toContain("It honors Monica's parents' living influence");
    expect(instructions).toContain("supports owners without becoming a yes-machine");
    expect(instructions).toContain("Public family-story wording");
  });

  it("requires accessible, performant experiences and bounded merge behavior", async () => {
    const instructions = await Bun.file(".github/copilot-instructions.md").text();

    expect(instructions).toContain("complete reduced-motion equivalents");
    expect(instructions).toContain("Native scrolling remains authoritative");
    expect(instructions).toContain("Protect LCP, CLS, INP, mobile CPU/memory, and bundle size");
    expect(instructions).toContain("may use repository auto-merge only after every required check is green");
    expect(instructions).toContain("Never auto-merge changes to database migrations");
    expect(instructions).toContain("Never bypass branch protection");
    expect(instructions).toContain("`git diff --check`");
  });
});