#!/usr/bin/env node
/**
 * scripts/check-gateway-bypass.mjs
 *
 * Safety check: detects Shopify Admin API bypasses outside the approved centralized
 * gateway (server/providers/shopify-gateway.js).
 *
 * Checks for:
 *   1. Direct X-Shopify-Access-Token header construction outside the gateway
 *   2. Direct /admin/api/ URL construction outside the gateway
 *   3. Direct fetch calls to *.myshopify.com outside the gateway
 *
 * Allowlisted paths (gateway implementation + test fixtures):
 *   - server/providers/shopify-gateway.js  (the gateway itself)
 *   - tests/                               (test fixtures may reference patterns)
 *   - design/                              (documentation)
 *   - *.md                                 (markdown docs)
 *   - scripts/                             (this script and related)
 *
 * Usage:
 *   node scripts/check-gateway-bypass.mjs           — report findings
 *   node scripts/check-gateway-bypass.mjs --check   — exit 1 if findings exist (CI)
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const CHECK_MODE = process.argv.includes("--check");

// ── File allowlist ────────────────────────────────────────────────────────────
// Files that are permitted to reference these patterns (the gateway itself, tests).
const ALLOWLISTED_PATHS = [
  /^server\/providers\/shopify-gateway\.js$/,  // the gateway implementation
  /^tests\//,                                   // test fixtures
  /^design\//,                                  // documentation
  /\.md$/,                                      // markdown docs
  /^scripts\//,                                 // scripts (this file)
  /^\.github\//,                                // CI config
];

// ── Bypass patterns ───────────────────────────────────────────────────────────
const BYPASS_PATTERNS = [
  {
    name: "Direct X-Shopify-Access-Token header construction (bypass gateway)",
    // Matches constructing the header value in code: "X-Shopify-Access-Token": token
    // The gateway itself is allowlisted so this only catches code outside it.
    pattern: /['"]X-Shopify-Access-Token['"]\s*:/i,
    severity: "CRITICAL",
  },
  {
    name: "Direct /admin/api/ URL construction (bypass gateway)",
    // Matches hardcoded /admin/api/ paths in fetch/request calls.
    pattern: /\/admin\/api\/[0-9a-z-]+\//i,
    severity: "CRITICAL",
  },
  {
    name: "Direct myshopify.com API call (bypass gateway)",
    // Matches fetch/http calls directly to a myshopify.com admin endpoint.
    pattern: /https?:\/\/[a-z0-9._-]+\.myshopify\.com\/admin/i,
    severity: "CRITICAL",
  },
];

// ── Code-only extensions (skip non-executable files) ─────────────────────────
const CODE_EXTENSIONS = new Set([
  ".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx", ".sh",
]);

// ── Path resolution ────────────────────────────────────────────────────────────
function resolveRepoRoot(moduleUrl) {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..");
}

function selfTestPathResolution() {
  const simulatedUrl = "file:///tmp/shimmer%20stock/scripts/check-gateway-bypass.mjs";
  const resolved = resolveRepoRoot(simulatedUrl);
  if (resolved.includes("%20") || path.basename(resolved) !== "shimmer stock") {
    throw new Error("Path resolution self-test failed for URL-encoded spaces");
  }
}

selfTestPathResolution();

// ── Get tracked files ─────────────────────────────────────────────────────────
const repoRoot = resolveRepoRoot(import.meta.url);

function getTrackedFiles() {
  try {
    const output = execSync("git ls-files --cached --others --exclude-standard", {
      encoding: "utf8",
      cwd: repoRoot,
    });
    return output
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f && !f.startsWith(".env") && !f.endsWith(".db"));
  } catch {
    return [];
  }
}

const files = getTrackedFiles();
const findings = [];

for (const relPath of files) {
  // Only scan code files
  const ext = path.extname(relPath).toLowerCase();
  if (!CODE_EXTENSIONS.has(ext)) continue;

  // Skip allowlisted paths
  if (ALLOWLISTED_PATHS.some((re) => re.test(relPath))) continue;

  // Skip lock files and minified
  if (relPath.includes("bun.lock") || relPath.includes(".min.")) continue;

  const absPath = path.join(repoRoot, relPath);
  if (!existsSync(absPath)) continue;

  let content;
  try {
    content = readFileSync(absPath, "utf8");
  } catch {
    continue;
  }

  const lines = content.split("\n");

  for (const rule of BYPASS_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (rule.pattern.test(lines[i])) {
        findings.push({
          severity: rule.severity,
          rule: rule.name,
          file: relPath,
          line: i + 1,
          snippet: lines[i].trim().substring(0, 120),
        });
      }
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
if (findings.length === 0) {
  console.log("✅  No Shopify gateway bypass patterns found in tracked code files.");
  process.exit(0);
}

const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
findings.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

console.error(`\n⚠️  ${findings.length} potential Shopify gateway bypass(es) found:\n`);

for (const f of findings) {
  console.error(`  [${f.severity}] ${f.rule}`);
  console.error(`    File: ${f.file}:${f.line}`);
  console.error(`    Snippet: ${f.snippet}`);
  console.error();
}

if (CHECK_MODE) {
  console.error("❌  Gateway bypass check failed. All Shopify Admin API calls must go through server/providers/shopify-gateway.js.");
  process.exit(1);
} else {
  console.error("Run with --check to make this exit 1 (e.g. in CI).");
  process.exit(0);
}
