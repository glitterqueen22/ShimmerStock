import { describe, expect, it } from "bun:test";

const MEMORIAL_PATTERNS = [
  /in\s+(loving\s+)?memory\s+of/i,
  /passed\s+away/i,
  /no\s+longer\s+with\s+us/i,
  /\brip\b/i,
  /her\s+late\s+(dad|father|mom|mother|husband)/i,
  /his\s+late\s+(dad|father|mom|mother|wife)/i,
];

describe("People Behind the Colors — living, ongoing brand story", () => {
  it("never uses memorial or posthumous language", async () => {
    const about = await Bun.file("public/about/index.html").text();
    const dreamGrant = await Bun.file("public/dream-grant/index.html").text();

    for (const pattern of MEMORIAL_PATTERNS) {
      expect(about).not.toMatch(pattern);
      expect(dreamGrant).not.toMatch(pattern);
    }
  });

  it("represents all four colors as living, ongoing relationships", async () => {
    const about = await Bun.file("public/about/index.html").text();

    expect(about).toContain('id="people-behind-the-colors"');
    expect(about).toContain("Pink — the spark — Monica");
    expect(about).toContain("Purple — the steady support — Dad");
    expect(about).toContain("Green — the push forward — Mom");
    expect(about).toContain("Navy + grey — the grounding partnership — her husband");
    expect(about).toContain("wedding colors");
    expect(about).toContain("living, ongoing parts of Monica's life — not a memorial");
  });

  it("describes Dad and Mom in present tense rather than ambiguous past tense", async () => {
    const about = await Bun.file("public/about/index.html").text();

    expect(about).toContain("Dad is the kind of person");
    expect(about).toContain("Mom is sassy, funny, and relentlessly determined");
    expect(about).not.toContain("Dad was the kind of person");
    expect(about).not.toContain("Mom was sassy");
  });

  it("connects the Dream Grant to passing support forward without fabricating state", async () => {
    const about = await Bun.file("public/about/index.html").text();
    const dreamGrant = await Bun.file("public/dream-grant/index.html").text();

    expect(about).toContain("I was supported while building my dream. I want to help someone else keep building theirs.");
    expect(dreamGrant).toContain("pass that support forward to another product-business founder");
    expect(dreamGrant).toContain("Applications are not yet open.");
    expect(dreamGrant).not.toMatch(/\$\d/);
    expect(dreamGrant).not.toMatch(/\b(20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  });
});
