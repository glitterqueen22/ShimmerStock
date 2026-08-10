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
- Never read, edit, delete, migrate, seed, or otherwise manipulate production data from a development task.

## Tenant and status truth

- Every business-owned read, write, aggregate, cache key, import, export, scan, and background operation must be scoped by the authenticated `business_id`.
- Never accept a client-provided tenant identifier as authorization. Resolve business context from the authenticated server session and test cross-tenant denial.
- Canonical inventory and identifier services own shared quantity, SKU, and barcode semantics. UI surfaces must not invent independent calculations or fallback merchant identifiers.
- Preserve explicit pending, partial, failed, mismatch, and review-required states. A generated or locally saved value is not an upstream update.
- Never report a Shopify identifier as updated until the allowlisted mutation succeeds and a Shopify re-read verifies the matching value.

## Shopify safety

- GGE and all real merchant stores remain disconnected until a separate approved milestone.
- Shopify staging remains read-only until a separate operation-specific write milestone is approved.
- Required access is limited to `read_orders`, `read_products`, `read_inventory`, and `read_locations`. The only optional write scope is `write_products`, and only for separately approved SKU/barcode writeback.
- Never request `write_inventory`, `write_orders`, `write_locations`, `read_all_orders`, or unrelated write permissions.
- Do not request any optional Shopify scope unless the assigned issue explicitly names the exact operation, permission, tests, audit behavior, and owner approval.
- Every Shopify Admin API request must use the centralized gateway.
- The mutation gateway is deny-by-default. In read-only mode, REST write methods and GraphQL mutations must be rejected before network transmission; only an explicitly allowlisted identifier writeback may pass in approved editing mode.
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
- Audit and recommendation flows do not mutate data. Novi may inspect, prepare, preview, and recommend; owner approval and verified execution remain distinct states.
- Errors must say what failed, what succeeded, what remains safe, and the next available action. Never invent successful states or hide partial failures.

## Novi and brand

- Novi is ShimmerStock's fluffy black-and-white tuxedo-cat mascot. Do not redesign Novi as another animal, a robot, orb, blob, generic AI assistant, CSS drawing, emoji, or improvised SVG character.
- Final Novi character and logo artwork require owner approval. Until approved assets exist, use clearly labeled neutral/reference slots through the established asset manifest; do not fabricate replacement identity.
- ShimmerStock is an independent product-business operating-system brand, not GGE software. GGE may be described only as founder experience that informed the product.
- Use semantic color hierarchy: pink for Monica's spark and primary brand personality, purple for her dad's steady support, green for her mom's forward drive, navy and grey for her husband's grounding partnership, and cream for breathing room. Keep pink visually primary and avoid rainbow UI.
- The people behind the colors are living people who continue to influence and support Monica. Family-brand and Dream Grant stories must express gratitude, ongoing love, partnership, encouragement, and passing support forward; never use memorial, remembrance, or posthumous framing.
- Navy and grey carry additional meaning as Monica and her husband's wedding colors. Use them thoughtfully for structure, trust, serious states, and Novi's grounded truth-telling without displacing pink as the foreground energy.
- Public family-story wording and its final personal details require owner approval. Never infer or expose private family or medical information.
- Public storytelling must establish what ShimmerStock does, why a product-business owner needs it, and why it is trustworthy before introducing the people behind the colors. The product must remain useful without knowledge of the founder's family.
- Dream Grant content must use an authoritative `Coming Soon`, `Applications Open`, `Applications Closed`, or `Next Round Coming` state. It honors Monica's parents' living influence by extending the support she received to another founder; it is not a memorial, sweepstakes, lead magnet, or source of invented dates, amounts, recipients, or application counts.
- Novi combines the colors' qualities: creative and bold, steady and comforting, practical and forward-moving, grounded and honest. Novi supports owners without becoming a yes-machine and tells the truth plainly when needed.
- Use shimmer rarely as a signature highlight, never as wallpaper, confetti, or an effect that obscures content.

## Experience quality

- Preserve keyboard access, visible focus, semantic structure, screen-reader labels, sufficient contrast, 44px touch targets where practical, and complete reduced-motion equivalents.
- Native scrolling remains authoritative. Never introduce scroll-jacking, permanently hidden no-JavaScript content, or motion required to understand or operate the interface.
- Protect LCP, CLS, INP, mobile CPU/memory, and bundle size. Measure before and after significant public-experience work and document intentional dependency impact.
- Operational screens prioritize clarity, density, explicit feedback, and efficient repeated action. Do not apply landing-page motion or decorative card layouts to data tables and warehouse workflows.
- Empty, loading, partial-success, and error states must explain what is happening and provide the next useful action without fabricating activity.

## Required verification

Use the repository lockfile and the commands defined in `package.json`. For the current application, required P0 checks include:

- `bun install --frozen-lockfile`
- `node scripts/redact-secret-report.mjs --check` when that script exists
- `bun run check:safety` when that script exists
- `bun run typecheck`
- `bun test`
- `bun run build`
- `git diff --check`

Report exact commands, results, test counts, files changed, known limitations, and any skipped or unavailable check.

## Pull requests

- Keep each PR focused.
- Safe, focused frontend, accessibility, test, and documentation PRs may use repository auto-merge only after every required check is green, the branch is conflict-free, and no owner creative decision remains.
- Never auto-merge changes to database migrations, authentication/session security, tenant authorization, Shopify scopes or mutation architecture, provider credentials, secrets, production/deployment configuration, workflows, billing, destructive operations, final personal story copy, final logo art, or final Novi character art.
- Never bypass branch protection, reviews, required checks, or Actions approval to make a PR merge.
- Do not touch PR glitterqueen22/ShimmerStock#9 unless the assigned issue is specifically about PR glitterqueen22/ShimmerStock#9.
- Do not connect Shopify, deploy, or create paid resources from a code PR unless the issue explicitly authorizes those actions.
- Before requesting merge, confirm the diff contains no secret, live credential, database, backup, or real merchant data.
