# Product Beta Standard

**Version:** Phase 1 · 2026-08-07

## Quality Gate

An engine page or feature may not be marked **Live** unless every item below is met.

### Data & Logic
- [ ] All counts, statuses, stock levels, dates, and thresholds are computed by application code, not inferred by AI
- [ ] Empty states return meaningful guidance, not blank screens
- [ ] Error states display a human-readable message and a retry or next-step action
- [ ] Loading states are clearly indicated (skeleton, spinner, or text)
- [ ] Demo data is labeled **Demo** at every surface where it appears
- [ ] No fabricated activity or fake completed actions

### Navigation
- [ ] Every button, link, and action either works end-to-end or is **disabled + explained**
- [ ] No silent click (button appears active, nothing happens)
- [ ] No navigation dead end (page with no way forward)
- [ ] Back navigation works correctly from all deep routes

### Novi
- [ ] Contextual Novi insight present (at minimum compact strip)
- [ ] Insight follows the standard data model: title, summary, reasoning, action, confidence, label
- [ ] Demo insights labeled `is_demo: true` and shown with **Demo** badge
- [ ] Actions use approved vocabulary (Show me why, Review, Approve, Dismiss, Remind me, Open queue, View source)
- [ ] No action claims automatic fix, automatic order, automatic refund, or automatic email unless verified

### Design
- [ ] Page uses approved spacing tokens (page gutter, section spacing, card padding)
- [ ] Typography follows approved scale (PageHeader, section title, body, caption)
- [ ] Purple used for intelligence / Novi; green used for health / progress / success
- [ ] No color-only meaning (icons or text also convey status)
- [ ] Mobile-responsive at 375px, 430px, 768px, 1024px, 1280px

### Accessibility
- [ ] Keyboard navigable (Tab, Enter, Space, Escape where applicable)
- [ ] Visible focus states on all interactive elements
- [ ] ARIA labels on icon-only buttons
- [ ] No color-only meaning
- [ ] Respects `prefers-reduced-motion`

### Security & Safety
- [ ] No write operations to Shopify without approved scope and verified implementation
- [ ] No secrets printed in logs, UI, or errors
- [ ] Auth check present on all protected routes
- [ ] Tenant isolation maintained (no data leakage between businesses)

---

## Status Definitions

| Status | Meaning |
|--------|---------|
| **Live** | Full quality gate met. Feature works end-to-end. No misleading claims. |
| **Beta** | Core functionality works. Some edge cases not handled. Labeled Beta. |
| **Early Access** | Selected users only. Functional but not fully validated. |
| **Demo** | Illustrative only. Not connected to real data. Clearly labeled. |
| **Planned** | Not yet built. Appears on roadmap. No fake activity. |

---

## First-Use Standard

A new beta user must be able to:

1. Complete onboarding in under 3 minutes
2. Understand the Command Center within 60 seconds
3. Find one Novi insight and act on it within 5 minutes
4. Navigate to at least 3 engine pages without confusion
5. Find the Shopify connection status page and understand the read-only model
