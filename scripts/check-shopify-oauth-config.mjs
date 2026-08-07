#!/usr/bin/env node
import { resolveShopifyOAuthConfig } from "../server/shopify-oauth-config.js";

function printField(label, value) {
  console.log(`${label}: ${value}`);
}

async function readAllStdin() {
  let buffer = "";
  for await (const chunk of process.stdin) {
    buffer += chunk;
  }
  return buffer;
}

const fingerprintMode = process.argv.includes("--fingerprint-stdin");

if (fingerprintMode) {
  const rawClientId = await readAllStdin();
  const fingerprintCheck = resolveShopifyOAuthConfig({
    SHOPIFY_CLIENT_ID: rawClientId,
    SHIMMERSTOCK_URL: "http://localhost:3000",
  }, { requireClientSecret: false });

  if (!fingerprintCheck.ok) {
    console.error(`client ID fingerprint failed: ${fingerprintCheck.error}`);
    process.exit(1);
  }

  printField("client ID fingerprint prefix", fingerprintCheck.diagnostics.clientId.fingerprintPrefix);
  process.exit(0);
}

const config = resolveShopifyOAuthConfig(process.env);

printField("client ID configured", config.diagnostics.clientId.configured ? "yes" : "no");
printField("source environment-variable name", config.diagnostics.clientId.source);
printField("trimmed client-ID length", config.diagnostics.clientId.trimmedLength);
printField("SHA-256 fingerprint prefix of the client ID", config.diagnostics.clientId.fingerprintPrefix || "n/a");
printField("whether whitespace/newlines were detected", config.diagnostics.clientId.whitespaceDetected ? "yes" : "no");
printField("whether surrounding quotes were detected", config.diagnostics.clientId.surroundingQuotesDetected ? "yes" : "no");
printField("client secret configured", config.diagnostics.clientSecret.configured ? "yes" : "no");
printField("resolved redirect URI", config.redirectUri || "n/a");
printField("resolved app URL", config.appUrl || "n/a");
printField("exact requested scopes", config.requestedScopes);
printField("Shopify Admin API version", config.apiVersion);

if (!config.ok) {
  process.exit(1);
}