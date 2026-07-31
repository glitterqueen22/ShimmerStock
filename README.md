# ShimmerStock

**Adaptive operating system for product-based businesses** — independently deployable platform engines that power any industry's workflows, from inventory through fulfillment to growth.

ShimmerStock replaces fragmented tools (inventory, orders, production, purchasing, CRM, affiliates, partners) with a single, coherent operating loop. Every engine answers business questions, publishes structured events, and exposes AI-consumable summaries — so operators and Novi (the proactive AI companion) always have the full picture.

## Key Features

- **28 Engines** — Inventory, Commerce (Shopify, Amazon, Etsy, TikTok Shop, WooCommerce, Faire), Production, Purchasing Intelligence, Fulfillment, Warehouse, Customer Hub, Partner HQ, Affiliate Attribution, Studio, Growth Intelligence, and more.
- **The Operating Loop™** — Every action hands off to the next department. No dead ends.
- **Novi** — Proactive business companion that watches your operations, surfaces opportunities, and answers questions in real time.
- **Multi-Channel Commerce** — Shopify OAuth integration (multi-business), plus marketplace connectors.
- **Multi-Tenant** — Business-level isolation with role-based access control.
- **Dream Foundation** — The Scott & Suzanne Dream Grant, investing in future founders.

## Quick Start

```bash
# Clone
git clone https://github.com/glitterqueen22/ShimmerStock.git
cd ShimmerStock

# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your values

# Start development server (port 3000)
bun run dev

# Seed demo data (optional)
bun run seed
```

The app will be running at `http://localhost:3000`.

## Documentation

- [Architecture](ARCHITECTURE.md) — System design and engine model
- [Setup](SETUP.md) — Full environment configuration
- [Database](DATABASE.md) — Schema, migrations, and data model
- [Deployment](DEPLOYMENT.md) — Production deployment guide
- [Backup](BACKUP.md) — Backup and restore procedures
- [Branch Strategy](BRANCH_STRATEGY.md) — Git workflow
- [Contributing](CONTRIBUTING.md) — How to contribute
- [Changelog](CHANGELOG.md) — Version history

## Tech Stack

- **Runtime**: Bun
- **Backend**: Express.js
- **Frontend**: React 19 + TanStack Start + Vite + Tailwind CSS 4
- **Database**: SQLite (WAL mode) → planned migration to PostgreSQL
- **Commerce**: Shopify API, multi-provider registry

## License

MIT — see [LICENSE](LICENSE)
