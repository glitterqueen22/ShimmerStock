# Changelog

All notable changes to ShimmerStock will be documented in this file.

## [v0.1.0] — Pre-release (2025-07-31)

### Core Platform
- Express + Bun server with SQLite (WAL mode) database
- React 19 + TanStack Start + Vite + Tailwind CSS 4 frontend
- Multi-tenant architecture with business-level isolation
- Role-based access control with granular permissions
- Authentication system with bcrypt password hashing and session tokens
- Event bus for inter-engine communication
- Audit logging across all write operations

### 28 Engines Implemented (code present, pre-validation)
- Inventory & Warehouse
- Commerce — Shopify (OAuth + API), Amazon, Etsy, TikTok Shop, WooCommerce, Faire
- Production — Bills of materials, batch manufacturing, inventory consumption
- Calculation — Formula engine with visual builder
- Purchasing Intelligence — Suppliers, purchase orders, receiving
- Novi Companion — Proactive AI with memory, goals, detection
- Opportunity Center — Business opportunity detection and surfacing
- Business Health Score — Periodic snapshots
- Manual Orders — Create and manage orders outside commerce channels
- PO Receiving — Inventory received against purchase orders
- Warehouse Operations — Bin management, transfers
- Customer Service — Unified inbox, conversations, messages
- Partner HQ — Multi-program partner management
- Daily Business Replay — Timeline of business activity
- Customer Hub — CRM, notes, tags, store credit
- Studio — Brand templates and assets
- Growth Intelligence — Business growth tracking
- Novi Evolution — Learning and adaptation
- Team HQ — Team member management and roles
- Fulfillment HQ — Shipments, pack verification, unboxing rules
- Adaptive Onboarding — Step-by-step business setup
- Affiliate Attribution — Multi-touch attribution engine
- Affiliate Program — Full affiliate management suite
- AI Brand Setup — Automated brand kit generation
- Industry Config — Per-industry settings
- Store Credit — Customer store credit system

### Features
- Shopify multi-business OAuth connection system
- Provider registry for commerce integrations
- Order management with barcode scanning
- Production batch tracking with material consumption
- Purchasing intelligence with reorder recommendations
- Warehouse bin and location management
- Customer Hub unified inbox
- Novi contextual panel and ask widget
- Opportunity detection bridge
- Business Health dashboard
- Affiliate program with challenges, training, assets
- Partner program with application forms and content protection
- Fulfillment with split shipments and pack verification
- Brand setup with 4-phase flow (discovery, preview, generation, editing)
- Dream Grant application system
- Founding member registration
- Waitlist management

### Known Issues
- Production-readiness audit found 13 red areas (security, multi-tenancy, backups, tests)
- No automated test suite
- SQLite not suitable for multi-user production (PostgreSQL migration planned)
- Session multi-tenancy not fully enforced
- Hardcoded secrets in some fallback code paths
- No structured logging or monitoring
- No separate dev/staging/production environments

### Next
- P0 production hardening sprint
- Session multi-tenancy fix
- Credential rotation
- Automated encrypted backups
- Test suite implementation
- PostgreSQL migration
