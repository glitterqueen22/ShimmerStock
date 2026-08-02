# ShimmerStock repository instructions

ShimmerStock is an existing multi-tenant e-commerce operating system for product-based businesses. Preserve the existing application and Git history. Do not rebuild the product from scratch.

## Work discipline

- Never work directly on `main`.
- One issue must produce one bounded branch and one pull request.
- Do not combine security, database, deployment, UI, or feature milestones unless the issue explicitly requires it.
- Inspect existing implementation before creating new code.
- Reuse verified code rather than duplicating modules.
- Never claim a task is complete because a screen exists or because an agent reports success.
- Completion requires the data path, authorization, failure behavior, automated tests, typecheck, build, and CI evidence required by the issue.
- Never remove or weaken a failing test merely to obtain a green result.
- Never rerun a flaky test until it passes by chance; identify and fix the cause.
- Stop at the issue's stated stop condition. Do not begin the next roadmap item automatically.

## Secrets and data

- Never commit or print `.env` files, API keys, Shopify tokens, webhook secrets, passwords, encryption keys, database URLs, private keys, backups, or real customer data.
- Redact authorization headers, cookies, upstream payloads, session values, and credentials from logs and errors.
- Never paste secret values into issues, pull requests, comments, documentation, test snapshots, CI logs, or generated reports.
- Use fake data for development and staging until an issue explicitly approves otherwise.

## Shopify safety

- GGE and all real merchant stores remain disconnected until a separate approved milestone.
- Shopify staging remains read-only until a separate operation-specific write milestone is approved.
- Do not request any `write_*` Shopify scope unless the assigned issue explicitly names the exact operation, permission, tests, audit behavior, and owner approval.
- Every Shopify Admin API request must use the centralized gateway.
- In read-only mode, REST write methods and GraphQL mutations must be rejected before network transmission.
- Missing, invalid, conflicting, or unapproved configuration must fail closed.
- Tenant-scoped requests must never fall back to another business or a global live Shopify credential.

## Deployment and databases

- Do not deploy, create paid infrastructure, or change production configuration unless the assigned issue explicitly authorizes it.
- Do not use Vercel for the existing stateful Bun/Express plus SQLite application.
- SQLite may be used only for controlled development/private staging until the PostgreSQL milestone is complete.
- Never mix development, staging, and production databases or credentials.

## Product truthfulness

- A simulated, stubbed, mock, or partial connector must be labeled `Demo`, `Beta`, or `Planned`.
- Never represent a simulated email, order, channel sync, chart, recommendation, or AI action as live activity.

## Required verification

Use the repository lockfile and the commands defined in `package.json`. For the current application, required P0 checks include:

- `bun install --frozen-lockfile`
- `node scripts/redact-secret-report.mjs --check` when that script exists
- `bun run check:safety` when that script exists
- `bun run typecheck`
- `bun test`
- `bun run build`

Report exact commands, results, test counts, files changed, known limitations, and any skipped or unavailable check.

## Pull requests

- Keep each PR focused.
- Do not merge automatically.
- Do not touch PR glitterqueen22/ShimmerStock#9 unless the assigned issue is specifically about PR glitterqueen22/ShimmerStock#9.
- Do not connect Shopify, deploy, or create paid resources from a code PR unless the issue explicitly authorizes those actions.
- Before requesting merge, confirm the diff contains no secret, live credential, database, backup, or real merchant data.
