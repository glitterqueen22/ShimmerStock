# AI Cost and Safety

**Version:** Phase 1 · 2026-08-07

## Core Principle

**CODE CALCULATES. NOVI EXPLAINS.**

| Use deterministic code for | Use AI for |
|---------------------------|-----------|
| Counts, stock levels, reorder math | Explanation and summarization |
| Order status, queue lengths | Prioritization and ranking |
| Dates, delivery windows, lead times | Natural language interaction |
| Thresholds, margin calculations | Decision support and tone |
| Workflow state transitions | Context-appropriate voice |
| Reconciliation math | Uncertainty communication |

Never send an entire business database to a model. Select minimal, relevant context.

---

## Current Phase Status

**Phase 1: Demo + Stub mode**

All Novi insights in Phase 1 use `businessDna.ts` — deterministic, pre-written insights per business type. No paid AI model is called.

- `is_demo: true` on all current insights
- No API keys in codebase
- No real AI calls in this phase

**Phase 2 (future): Live AI integration**

Will require separate approved milestone with:
- Model provider approved
- API key in environment (never in code)
- Per-business usage tracking implemented
- Cost telemetry live
- Caching strategy reviewed
- Timeout/failure fallback tested

---

## Architecture Guardrails

### Context Selection
- Never send full products table, full orders table, or full audit log to AI
- Build compact summary: top N items by severity, counts, recent events only
- Maximum context: ~2,000 tokens per insight request (subject to review)

### Model Provider Abstraction
- All AI calls go through a single provider abstraction layer
- Swap providers without changing business logic
- Current provider: None (stub)
- Future providers: To be approved before activation

### Caching
- Morning Brief: Refreshed once per day per business (not on every page load)
- Insight cache: Per-engine insights cached for configurable TTL
- Invalidated when relevant data changes (order created, stock updated)

### Cost Telemetry (future)
- Track token usage per business per day
- Alert when business exceeds threshold
- Report aggregate cost to owner

### Timeout and Failure Fallback
- AI call timeout: 8 seconds
- On timeout or error: Show deterministic fallback message
- Never block page render on AI response

### Redaction
- Customer PII (name, email, address) is never sent to AI model
- Order numbers and SKUs may be sent (non-sensitive)
- Payment data is never sent

### Audit Logging
- All AI interactions logged (request summary + response summary, not full content)
- No secrets or credentials in log entries

### Confidence and Uncertainty
- Insights include `confidence: "high" | "medium" | "low"`
- Low-confidence insights shown with uncertainty label
- Novi does not claim certainty it doesn't have

---

## Demo Response Format (Current Phase)

```typescript
// All current Novi insights come from businessDna.ts
const insight: DemoInsight = {
  is_demo: true,
  engine: "inventory",
  severity: "warning",
  title: "Vanilla Base may run out before next delivery",
  summary: "You have 24 lbs in stock with a reorder point of 30.",
  reasoning: "stock_count=24 < reorder_point=30. No open PO found.",
  recommended_action: "Create a PO for Bulk Fragrance Co. now.",
  action_label: "Draft PO",
  action_link: "/purchasing",
  confidence: "high",
};
```

Demo insights are:
- Deterministic (same data always produces same insight)
- Testable (no network dependency)
- Clearly labeled in UI with **Demo** badge
- Never trigger real external actions
