import { describe, expect, it } from "bun:test";

const MEMORIAL_PATTERNS = [
  /in\s+(loving\s+)?memory\s+of/i,
  /passed\s+away/i,
  /no\s+longer\s+with\s+us/i,
  /\brip\b/i,
  /her\s+late\s+(dad|father|mom|mother|husband)/i,
  /his\s+late\s+(dad|father|mom|mother|wife)/i,
  /in\s+memoriam/i,
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
    expect(about).toContain("Pink — my spark — me");
    expect(about).toContain("Purple — steady support — my dad");
    expect(about).toContain("Green — the push forward — my mom");
    expect(about).toContain("Navy + grey — grounding partnership — my husband, Andrew");
    expect(about).toContain("wedding colors");
    expect(about).toContain("These are real people, actively part of my life today — not a memorial");
  });

  it("describes Dad and Mom in present tense rather than ambiguous past tense", async () => {
    const about = await Bun.file("public/about/index.html").text();

    expect(about).toContain("My dad's calm, steady support shows up in how I build this company");
    expect(about).toContain("My mom's drive and strength push me forward");
    expect(about).not.toMatch(/\bdad was\b/i);
    expect(about).not.toMatch(/\bmom was\b/i);
  });

  it("weaves Mr. Chunk into Novi's story alongside the family qualities", async () => {
    const about = await Bun.file("public/about/index.html").text();

    expect(about).toContain("Mr. Chunk's warmth woven into her personality");
    expect(about).toContain("<strong>From Mr. Chunk:</strong> warmth and personality");
    expect(about).toContain("<strong>From Andrew:</strong> grounded, comforting, honest, supportive");
  });

  it("connects the Dream Grant to passing support forward without fabricating state", async () => {
    const about = await Bun.file("public/about/index.html").text();
    const dreamGrant = await Bun.file("public/dream-grant/index.html").text();

    expect(about).toContain("I have people in my life who believe in me, encourage my ideas, keep me grounded, and help me keep going");
    expect(dreamGrant).toContain("pass some of that support forward to another small-business owner");
    expect(dreamGrant).toContain("Applications are not yet open.");
    expect(dreamGrant).not.toMatch(/\$\d/);
    expect(dreamGrant).not.toMatch(/\b(20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  });
});
