import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiGet } from "../lib/api";
import {
  PageHeader,
  Button,
  Tabs,
  ConfirmModal,
  EmptyState,
  Dropdown,
} from "../components/ui";
import type { DropdownItem } from "../components/ui/Dropdown";
import OpportunityCard from "../components/OpportunityCard";
import type { SnoozeDuration } from "../components/OpportunityCard";
import OpportunityCardSkeleton from "../components/OpportunityCardSkeleton";

// ── Types ───────────────────────────────────────────────────────────

interface Opportunity {
  id: string;
  type: string;
  engine: string;
  icon: string;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  confidence: number;
  explanation: string;
  citedData?: Record<string, any>;
  actionLabel: string;
  actionRoute: string;
  action?: string;
  noviAssistPrompt?: string;
  status: "active" | "snoozed" | "completed" | "dismissed";
  snoozedUntil?: string;
  createdAt: string;
}

interface OppSummary {
  total: number;
  active: number;
  snoozed: number;
  completed: number;
  highImpact: number;
}

interface OppListResponse {
  opportunities: Opportunity[];
  summary?: OppSummary;
}

// ── Sort options ───────────────────────────────────────────────────

type SortMode = "impact" | "confidence" | "recent";

const SORT_OPTIONS: { id: SortMode; label: string; icon: string }[] = [
  { id: "impact", label: "By Impact", icon: "🔴" },
  { id: "confidence", label: "By Confidence", icon: "📊" },
  { id: "recent", label: "Most Recent", icon: "🕐" },
];

function sortOpportunities(opps: Opportunity[], mode: SortMode): Opportunity[] {
  const sorted = [...opps];
  switch (mode) {
    case "impact": {
      const order = { high: 0, medium: 1, low: 2 };
      sorted.sort(
        (a, b) => (order[a.impact] ?? 99) - (order[b.impact] ?? 99)
      );
      break;
    }
    case "confidence":
      sorted.sort((a, b) => b.confidence - a.confidence);
      break;
    case "recent":
      sorted.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      break;
  }
  return sorted;
}

// ── Page ───────────────────────────────────────────────────────────

export default function Opportunities() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab state
  const initialTab = (searchParams.get("tab") as "active" | "snoozed" | "completed") || "active";
  const [activeTab, setActiveTab] = useState<"active" | "snoozed" | "completed">(initialTab);
  const [sortMode, setSortMode] = useState<SortMode>("impact");

  // Data
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [summary, setSummary] = useState<OppSummary>({
    total: 0, active: 0, snoozed: 0, completed: 0, highImpact: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Confirm modals
  const [confirmComplete, setConfirmComplete] = useState<string | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Highlight param
  const highlightId = searchParams.get("highlight");

  // ── Fetch opportunities ──────────────────────────────────────────

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<OppListResponse>(
        `/api/opportunities?status=${activeTab}`
      );
      setOpportunities(data.opportunities || []);
      setSummary(
        data.summary || {
          total: 0,
          active: 0,
          snoozed: 0,
          completed: 0,
          highImpact: 0,
        }
      );
    } catch (err: any) {
      setError(err.message || "Failed to load opportunities");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  // Sync tab to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", activeTab);
    if (highlightId && activeTab === "active") {
      params.set("highlight", highlightId);
    }
    setSearchParams(params, { replace: true });
  }, [activeTab]);

  // ── Actions ──────────────────────────────────────────────────────

  async function postAction(
    id: string,
    action: string,
    body?: Record<string, any>
  ) {
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/opportunities/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error("Action failed");
      // Refresh list
      await fetchOpportunities();
    } catch {
      // silently fail — card stays in place
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  function handleAction(_id: string) {
    // Navigate handled by OpportunityCard's actionRoute
  }

  function handleNoviAssist(_id: string, prompt: string) {
    navigate(`/bestie?prompt=${encodeURIComponent(prompt)}`);
  }

  function handleSnooze(id: string, duration: SnoozeDuration) {
    const now = new Date();
    switch (duration) {
      case "1_day":
        now.setDate(now.getDate() + 1);
        break;
      case "1_week":
        now.setDate(now.getDate() + 7);
        break;
      case "1_month":
        now.setMonth(now.getMonth() + 1);
        break;
    }
    postAction(id, "snooze", { snooze_until: now.toISOString() });
  }

  function handleComplete(id: string) {
    setConfirmComplete(null);
    postAction(id, "complete");
  }

  function handleDismiss(id: string) {
    setConfirmDismiss(null);
    postAction(id, "dismiss");
  }


  async function handleRefresh() {
    await fetchOpportunities();
  }

  // ── Computed ─────────────────────────────────────────────────────

  const sortedOpps = sortOpportunities(opportunities, sortMode);
  const tabCounts = {
    active: summary.active ?? opportunities.filter((o) => o.status === "active").length,
    snoozed: summary.snoozed ?? 0,
    completed: summary.completed ?? 0,
  };

  // ── Render helpers ───────────────────────────────────────────────

  const sortTrigger = (
    <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 rounded-lg transition-colors">
      <span>{SORT_OPTIONS.find((s) => s.id === sortMode)?.icon}</span>
      <span>{SORT_OPTIONS.find((s) => s.id === sortMode)?.label}</span>
      <span className="text-neutral-300">▾</span>
    </button>
  );

  const sortDropdownItems: DropdownItem[] = SORT_OPTIONS.map((opt) => ({
    id: opt.id,
    label: `${opt.icon}  ${opt.label}`,
    onClick: () => setSortMode(opt.id),
  }));

  function renderCard(opp: Opportunity) {
    const isHighlighted = opp.id === highlightId;
    return (
      <div
        key={opp.id}
        className={isHighlighted ? "ring-2 ring-amber-400 rounded-2xl animate-pulse" : ""}
      >
        <OpportunityCard
          id={opp.id}
          type={opp.type}
          engine={opp.engine}
          icon={opp.icon}
          title={opp.title}
          description={opp.description}
          impact={opp.impact}
          confidence={opp.confidence}
          explanation={opp.explanation}
          citedData={opp.citedData}
          actionLabel={opp.actionLabel}
          actionRoute={opp.actionRoute}
          noviAssistPrompt={opp.noviAssistPrompt}
          status={opp.status}
          snoozedUntil={opp.snoozedUntil}
          createdAt={opp.createdAt}
          onAction={handleAction}
          onNoviAssist={handleNoviAssist}
          onSnooze={handleSnooze}
          onComplete={(id) => setConfirmComplete(id)}
          onDismiss={(id) => setConfirmDismiss(id)}
        />
      </div>
    );
  }

  // ── Loading state ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="💡 Opportunity Center"
          description="Actionable opportunities detected across all your business engines"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <OpportunityCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="💡 Opportunity Center" />
        <div className="bg-white rounded-2xl border border-red-100 p-6 text-center shadow-sm">
          <div className="text-5xl mb-4">💜</div>
          <h3 className="text-lg font-semibold text-[#121212] mb-2">
            Novi hit a snag
          </h3>
          <p className="text-sm text-neutral-500 max-w-sm mx-auto mb-4">
            I had trouble loading your opportunities. This usually fixes itself — let's try again.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="primary" onClick={handleRefresh}>
              🔄 Try Again
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/bestie?prompt=Scan for business opportunities")}
            >
              💜 Ask Novi
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────

  const renderEmptyState = () => {
    if (activeTab === "active") {
      return (
        <EmptyState
          icon="✨"
          title="No opportunities right now"
          description="Novi watches for inventory shortages, order patterns, supplier issues, and more. As you use ShimmerStock, opportunities will appear here with clear actions you can take."
          action={{
            label: "💜 Ask Novi to scan for opportunities",
            onClick: () =>
              navigate("/bestie?prompt=Scan my business for opportunities"),
          }}
        />
      );
    }
    if (activeTab === "snoozed") {
      return (
        <EmptyState
          icon="💤"
          title="Nothing snoozed"
          description="Opportunities you snooze will appear here until they're ready for your attention again."
        />
      );
    }
    return (
      <EmptyState
        icon="✅"
        title="Nothing completed yet"
        description="When you mark opportunities as complete, they'll show up here."
      />
    );
  };

  // ── Main render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="💡 Opportunity Center"
        description="Actionable opportunities detected across all your business engines"
        actions={
          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <Dropdown
              align="right"
              trigger={sortTrigger}
              items={sortDropdownItems}
            />

            {/* Ask Novi shortcut */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                navigate("/bestie?prompt=Scan my business for opportunities")
              }
            >
              💜 Ask Novi
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "active", label: "Active", count: tabCounts.active },
          { id: "snoozed", label: "Snoozed", count: tabCounts.snoozed },
          { id: "completed", label: "Completed", count: tabCounts.completed },
        ]}
        active={activeTab}
        onChange={(id) => setActiveTab(id as "active" | "snoozed" | "completed")}
      />

      {/* Card Grid or Empty */}
      {sortedOpps.length === 0 ? (
        renderEmptyState()
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedOpps.map(renderCard)}
        </div>
      )}

      {/* Confirm Complete Modal */}
      <ConfirmModal
        open={!!confirmComplete}
        onClose={() => setConfirmComplete(null)}
        onConfirm={() => { if (confirmComplete) { handleComplete(confirmComplete); } }}
        title="Complete Opportunity"
        message="Mark this opportunity as complete? It will move to the Completed tab."
        confirmLabel="Complete"
        confirmVariant="primary"
        loading={!!(confirmComplete && actionLoading[confirmComplete])}
      />

      {/* Confirm Dismiss Modal */}
      <ConfirmModal
        open={!!confirmDismiss}
        onClose={() => setConfirmDismiss(null)}
        onConfirm={() => { if (confirmDismiss) { handleDismiss(confirmDismiss); } }}
        title="Dismiss Opportunity"
        message="Dismiss this opportunity? You won't see it again."
        confirmLabel="Dismiss"
        confirmVariant="danger"
        loading={!!(confirmDismiss && actionLoading[confirmDismiss])}
      />
    </div>
  );
}
