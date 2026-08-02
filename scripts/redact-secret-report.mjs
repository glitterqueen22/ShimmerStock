#!/usr/bin/env node
/**
 * scripts/redact-secret-report.mjs
 *
 * Scans tracked files for patterns that look like committed secrets,
 * hard-coded credentials, or unsafe logging of sensitive values.
 *
 * Usage:
 *   node scripts/redact-secret-report.mjs           — report findings
 *   node scripts/redact-secret-report.mjs --check   — exit 1 if findings exist (for CI)
 *
 * Patterns checked:
 *   - Shopify API tokens (shpat_*, shpca_*)
 *   - Generic API key / secret assignments
 *   - Hard-coded passwords in source
 *   - console.log printing raw passwords or tokens
 *   - process.env.SHOPIFY_API_TOKEN raw value leaks
 *   - Authorization header values printed to logs
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const CHECK_MODE = process.argv.includes("--check");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── File list (tracked git files only) ──────────────────────────────────

function getTrackedFiles() {
  try {
    const output = execSync("git ls-files --cached --others --exclude-standard", {
      encoding: "utf8",
      cwd: repoRoot,
    });
    return output
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f && !f.startsWith(".env") && !f.endsWith(".db") && !f.endsWith(".db.gz.enc"));
  } catch {
    return [];
  }
}

// ── Secret patterns ──────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  {
    name: "Shopify Admin API token (shpat_)",
    pattern: /shpat_[0-9a-fA-F]{32,}/,
    severity: "CRITICAL",
  },
  {
    name: "Shopify Custom App token (shpca_)",
    pattern: /shpca_[0-9a-fA-F]{32,}/,
    severity: "CRITICAL",
  },
  {
    name: "Hard-coded API key assignment",
    pattern: /(?:api[_-]?key|apikey|api[_-]?token)\s*[:=]\s*["'][A-Za-z0-9+/]{20,}["']/i,
    severity: "HIGH",
    // Skip test files with obviously fake keys
    skipIn: /test|spec|fake|mock|stub|fixture|example/i,
  },
  {
    name: "Hard-coded secret assignment",
    pattern: /(?:secret|password|passwd|credential)\s*[:=]\s*["'][^"']{8,}["']/i,
    severity: "HIGH",
    skipIn: /test|spec|fake|mock|stub|fixture|example|\.example$/i,
  },
  {
    name: "Unsafe secret log (console.* with secret-bearing variable)",
    pattern: /console\.(?:log|warn|error)\s*\([^)]*(?:\$\{[^}]*[A-Za-z0-9_]*(?:password|passwd|secret|token)[A-Za-z0-9_]*[^}]*\}|[,({][A-Za-z0-9_]*(?:password|passwd|secret|token)[A-Za-z0-9_]*\s*[:),}])/i,
    severity: "HIGH",
    skipIn: /test|spec|\.md$/i,
  },
  {
    name: "Authorization header value in log",
    pattern: /console\.(?:log|warn|error)\s*\([^)]*authorization[^)]*\)/i,
    severity: "MEDIUM",
    skipIn: /test|spec/i,
  },
  {
    name: "X-Shopify-Access-Token header value in log",
    pattern: /console\.(?:log|warn|error)\s*\([^)]*X-Shopify-Access-Token[^)]*\)/i,
    severity: "HIGH",
    skipIn: /test|spec/i,
  },
];

// ── File extensions to scan ──────────────────────────────────────────────

const SCAN_EXTENSIONS = new Set([
  ".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx",
  ".json", ".env", ".yml", ".yaml", ".sh", ".md", ".txt",
]);

// ── Main scan ────────────────────────────────────────────────────────────

const files = getTrackedFiles();
const findings = [];

for (const relPath of files) {
  const ext = path.extname(relPath).toLowerCase();
  if (!SCAN_EXTENSIONS.has(ext) && ext !== "") continue;

  // Skip binary-ish and lock files
  if (relPath.includes("bun.lock") || relPath.includes("package-lock") || relPath.includes(".min.")) continue;

  const absPath = path.join(repoRoot, relPath);
  if (!existsSync(absPath)) continue;

  let content;
  try {
    content = readFileSync(absPath, "utf8");
  } catch {
    continue;
  }

  const lines = content.split("\n");

  for (const rule of SECRET_PATTERNS) {
    if (rule.skipIn && rule.skipIn.test(relPath)) continue;

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

// ── Report ───────────────────────────────────────────────────────────────

if (findings.length === 0) {
  console.log("✅  No secret patterns found in tracked files.");
  process.exit(0);
}

const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
findings.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

console.error(`\n⚠️  ${findings.length} potential secret(s) found:\n`);

for (const f of findings) {
  console.error(`  [${f.severity}] ${f.rule}`);
  console.error(`    File: ${f.file}:${f.line}`);
  console.error(`    Snippet: ${f.snippet}`);
  console.error();
}

if (CHECK_MODE) {
  console.error("❌  Secret scan failed. Remove or redact the items above before committing.");
  process.exit(1);
} else {
  console.error("Run with --check to make this exit 1 (e.g. in CI).");
  process.exit(0);
}
