import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useIndustry } from "../context/IndustryContext";
import { useAuth } from "../contexts/AuthContext";
import { Button, ErrorBanner, PageHeader, Skeleton, useToast } from "../components/ui";
import { apiGet, apiPost, apiPut } from "../lib/api";

interface IndustryProfile {
  id: string;
  name: string;
  icon: string;
}

interface SettingsOverview {
  account: { id: number; username: string; displayName: string; role: string };
  business: { id: number; name: string; slug: string; created_at: string };
  access: {
    name: string;
    status: string;
    statusLabel: string;
    capabilities: string[];
    usage: { ordersLast30Days: number; teamMembers: number; products: number };
    billing: { configured: boolean; renewalDate: string | null; paymentMethod: string | null; invoices: unknown[] };
    recommendation: { verdict: string; why: string; whatChanges: string; cost: number | null; benefit: string };
  };
  integrations: {
    shopify: {
      connected: boolean;
      shopDomain?: string;
      shopName?: string;
      connectionMode?: "read_only" | "product_writeback";
      connectionState?: "disconnected" | "pending_validation" | "connected" | "failed";
      syncStatus?: string;
      latestImportState?: string;
      lastSuccessfulImportAt?: string | null;
    };
  };
  noviPreferences: { preferredWorkflow: string; productionPriority: string; packingPreference: string | null };
  printingAndLabels: {
    skuPattern: string;
    skuSeparator: string;
    skuCase: string;
    preserveExisting: boolean;
    preferredLabelSize: string;
    labelFields: string[];
    productWritebackEnabled: boolean;
    automaticWritebackEnabled: boolean;
  };
}

interface NoviSettings {
  frequency: "proactive" | "balanced" | "minimal" | "quiet";
  sound_enabled: boolean;
  popup_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
}

interface SupportRequest {
  id: number;
  reference: string;
  category: string;
  subject: string;
  status: string;
  createdAt: string;
}

const SECTIONS = [
  ["account", "Account & Security", "account security password username"],
  ["business", "Business Profile", "business profile industry workspace"],
  ["access", "Current Access", "plan access usage billing early"],
  ["team", "Team & Permissions", "team permissions members roles"],
  ["integrations", "Integrations", "shopify integration sync connection"],
  ["novi", "Novi Preferences", "novi workflow priority packing"],
  ["notifications", "Notifications", "notifications alerts popup sound frequency"],
  ["printing", "Printing & Labels", "printing labels sku barcode pattern"],
  ["support", "Support", "support help contact request"],
  ["privacy", "Data & Privacy", "data privacy request terms"],
] as const;

const SUPPORT_CATEGORIES = [
  ["technical", "Technical"], ["shopify", "Shopify"], ["billing", "Billing"],
  ["inventory", "Inventory"], ["account", "Account"], ["feature", "Feature request"],
  ["feedback", "Feedback"], ["other", "Other"],
] as const;

function formatLabel(value: string | null | undefined) {
  if (!value) return "Not set";
  return value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleString([], {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function SettingSection({ id, title, description, children }: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-neutral-200 px-5 py-6 sm:px-7 last:border-b-0">
      <div className="grid gap-5 lg:grid-cols-[minmax(180px,0.35fr)_minmax(0,1fr)]">
        <div>
          <h2 className="text-base font-bold text-neutral-900">{title}</h2>
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

function ReadOnlyRow({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-neutral-100 py-3 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-left text-sm font-semibold text-neutral-800 sm:max-w-md sm:text-right">
        {value}
        {detail && <span className="mt-0.5 block text-xs font-normal text-neutral-500">{detail}</span>}
      </span>
    </div>
  );
}

export default function Settings() {
  const { changePassword } = useAuth();
  const { industry, loading: industryLoading, refresh: refreshIndustry } = useIndustry();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [overview, setOverview] = useState<SettingsOverview | null>(null);
  const [industries, setIndustries] = useState<IndustryProfile[]>([]);
  const [noviSettings, setNoviSettings] = useState<NoviSettings | null>(null);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [selectedIndustryId, setSelectedIndustryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingIndustry, setSavingIndustry] = useState(false);
  const [savingNotification, setSavingNotification] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirmation: "" });
  const [support, setSupport] = useState({ category: "technical", subject: "", message: "" });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, industryData, requestsData] = await Promise.all([
        apiGet<SettingsOverview>("/api/settings/overview"),
        apiGet<{ industries: IndustryProfile[] }>("/api/industry"),
        apiGet<{ requests: SupportRequest[] }>("/api/settings/support-requests"),
      ]);
      setOverview(overviewData);
      setIndustries(industryData.industries || []);
      setSupportRequests(requestsData.requests || []);
      try {
        setNoviSettings(await apiGet<NoviSettings>("/api/novi/settings"));
      } catch {
        setNoviSettings(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Settings could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { setSelectedIndustryId(industry?.id || null); }, [industry]);
  useEffect(() => {
    if (!loading && location.hash) {
      requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [loading, location.hash]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleSections = new Set(SECTIONS.filter(([, label, keywords]) =>
    !normalizedQuery || `${label} ${keywords}`.toLowerCase().includes(normalizedQuery)
  ).map(([id]) => id));

  async function saveIndustry() {
    setSavingIndustry(true);
    try {
      await apiPut("/api/business/settings", { industryConfigId: selectedIndustryId, settings: {} });
      await refreshIndustry();
      toast("Business profile updated", "success");
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : "Business profile could not be updated", "error");
    } finally {
      setSavingIndustry(false);
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (passwords.next !== passwords.confirmation) {
      toast("New password and confirmation do not match", "error");
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(passwords.current, passwords.next, passwords.confirmation);
      setPasswords({ current: "", next: "", confirmation: "" });
      toast("Password changed. Other sessions were signed out.", "success");
    } catch (passwordError) {
      toast(passwordError instanceof Error ? passwordError.message : "Password could not be changed", "error");
    } finally {
      setChangingPassword(false);
    }
  }

  async function updateNotifications(patch: Partial<NoviSettings>) {
    if (!noviSettings) return;
    setSavingNotification(true);
    try {
      const updated = await apiPut<NoviSettings>("/api/novi/settings", { ...noviSettings, ...patch });
      setNoviSettings(updated);
      toast("Notification preferences updated", "success");
    } catch (notificationError) {
      toast(notificationError instanceof Error ? notificationError.message : "Notification preferences could not be updated", "error");
    } finally {
      setSavingNotification(false);
    }
  }

  async function submitSupport(event: FormEvent) {
    event.preventDefault();
    setSubmittingSupport(true);
    try {
      const created = await apiPost<{ reference: string }>("/api/settings/support-requests", {
        ...support,
        safeContext: { currentRoute: location.pathname },
      });
      setSupport({ category: "technical", subject: "", message: "" });
      const requests = await apiGet<{ requests: SupportRequest[] }>("/api/settings/support-requests");
      setSupportRequests(requests.requests || []);
      toast(`Support request ${created.reference} received`, "success");
    } catch (supportError) {
      toast(supportError instanceof Error ? supportError.message : "Support request could not be submitted", "error");
    } finally {
      setSubmittingSupport(false);
    }
  }

  if (loading || industryLoading) {
    return <div className="space-y-5"><PageHeader title="Settings" icon="⚙️" /><Skeleton variant="card" /><Skeleton variant="card" /></div>;
  }
  if (error || !overview) {
    return <div className="space-y-5"><PageHeader title="Settings" icon="⚙️" /><ErrorBanner message={error || "Settings could not be loaded"} onRetry={load} /></div>;
  }

  const shopify = overview.integrations.shopify;
  const canManageWorkspaceNotifications = ["owner", "admin"].includes(overview.account.role);

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" icon="⚙️" subtitle={`${overview.business.name} · ${overview.access.name}`} />

      <div className="border-y border-neutral-200 bg-white px-4 py-4 sm:px-6">
        <label htmlFor="settings-search" className="sr-only">Search settings</label>
        <div className="relative max-w-2xl">
          <span className="pointer-events-none absolute left-3 top-2.5 text-neutral-400">⌕</span>
          <input id="settings-search" type="search" value={query} onChange={event => setQuery(event.target.value)}
            placeholder="Search settings" className="w-full rounded-md border border-neutral-300 bg-neutral-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-rose-400 focus:bg-white" />
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden border-l-2 border-neutral-200 lg:block">
          {SECTIONS.filter(([id]) => visibleSections.has(id)).map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block border-l-2 border-transparent px-4 py-2 text-sm text-neutral-600 -ml-0.5 hover:border-rose-400 hover:text-neutral-900">{label}</a>
          ))}
        </nav>

        <div className="overflow-hidden border border-neutral-200 bg-white shadow-sm">
          {visibleSections.size === 0 && <p className="px-7 py-12 text-center text-sm text-neutral-500">No settings match “{query}”.</p>}

          {visibleSections.has("account") && <SettingSection id="account" title="Account & Security" description="Your sign-in identity and password.">
            <div className="mb-5">
              <ReadOnlyRow label="Display name" value={overview.account.displayName} />
              <ReadOnlyRow label="Username" value={`@${overview.account.username}`} />
              <ReadOnlyRow label="Access role" value={formatLabel(overview.account.role)} />
            </div>
            <form onSubmit={submitPassword} className="grid gap-3 border-t border-neutral-200 pt-5 sm:grid-cols-3">
              <label className="text-sm font-medium text-neutral-700">Current password
                <input type="password" autoComplete="current-password" required value={passwords.current} onChange={event => setPasswords({ ...passwords, current: event.target.value })} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-neutral-700">New password
                <input type="password" autoComplete="new-password" minLength={8} required value={passwords.next} onChange={event => setPasswords({ ...passwords, next: event.target.value })} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-neutral-700">Confirm new password
                <input type="password" autoComplete="new-password" minLength={8} required value={passwords.confirmation} onChange={event => setPasswords({ ...passwords, confirmation: event.target.value })} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-normal" />
              </label>
              <div className="sm:col-span-3"><Button type="submit" disabled={changingPassword}>{changingPassword ? "Changing…" : "Change password"}</Button></div>
            </form>
          </SettingSection>}

          {visibleSections.has("business") && <SettingSection id="business" title="Business Profile" description="Workspace identity and industry language.">
            <ReadOnlyRow label="Business" value={overview.business.name} />
            <ReadOnlyRow label="Workspace slug" value={overview.business.slug} />
            <div className="mt-4 flex flex-col gap-3 border-t border-neutral-200 pt-4 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-sm font-medium text-neutral-700">Industry profile
                <select value={selectedIndustryId || ""} onChange={event => setSelectedIndustryId(event.target.value || null)} className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal">
                  <option value="">Generic / Default</option>
                  {industries.map(option => <option key={option.id} value={option.id}>{option.icon} {option.name}</option>)}
                </select>
              </label>
              <Button onClick={saveIndustry} disabled={savingIndustry || selectedIndustryId === (industry?.id || null)}>{savingIndustry ? "Saving…" : "Save profile"}</Button>
            </div>
          </SettingSection>}

          {visibleSections.has("access") && <SettingSection id="access" title="Current Access" description="Authoritative access and usage, without estimated billing.">
            <ReadOnlyRow label="Access" value={overview.access.name} detail={formatLabel(overview.access.status)} />
            <div className="my-4 grid grid-cols-3 divide-x divide-neutral-200 border-y border-neutral-200 py-4 text-center">
              <div><strong className="block text-xl text-neutral-900">{overview.access.usage.ordersLast30Days}</strong><span className="text-xs text-neutral-500">Orders · 30 days</span></div>
              <div><strong className="block text-xl text-neutral-900">{overview.access.usage.products}</strong><span className="text-xs text-neutral-500">Products</span></div>
              <div><strong className="block text-xl text-neutral-900">{overview.access.usage.teamMembers}</strong><span className="text-xs text-neutral-500">Team members</span></div>
            </div>
            <ReadOnlyRow label="Billing" value={overview.access.billing.configured ? "Configured" : "Not configured"} detail={overview.access.billing.configured ? undefined : "No renewal date, payment method, or invoice is available."} />
            <ReadOnlyRow label="Recommendation" value="Stay on current access" detail={overview.access.recommendation.why} />
          </SettingSection>}

          {visibleSections.has("team") && <SettingSection id="team" title="Team & Permissions" description="Members, roles, and workspace access.">
            <ReadOnlyRow label="Members" value={overview.access.usage.teamMembers} />
            <div className="mt-4"><Button variant="secondary" onClick={() => navigate("/team")}>Open Team & Permissions</Button></div>
          </SettingSection>}

          {visibleSections.has("integrations") && <SettingSection id="integrations" title="Integrations" description="Connected providers and their approved operating mode.">
            <ReadOnlyRow label="Shopify" value={shopify.connected ? (shopify.shopName || shopify.shopDomain || "Connected") : formatLabel(shopify.connectionState || "disconnected")}
              detail={shopify.connected ? `${shopify.connectionMode === "product_writeback" ? "SKU/barcode product writeback" : "Read-only"} · ${formatLabel(shopify.latestImportState || shopify.syncStatus)}` : undefined} />
            {shopify.connected && <ReadOnlyRow label="Last successful import" value={formatDate(shopify.lastSuccessfulImportAt)} />}
            <div className="mt-4"><Button variant="secondary" onClick={() => navigate("/commerce")}>Manage Shopify connection</Button></div>
          </SettingSection>}

          {visibleSections.has("novi") && <SettingSection id="novi" title="Novi Preferences" description="Saved operational defaults for Novi workflows.">
            <ReadOnlyRow label="Preferred workflow" value={formatLabel(overview.noviPreferences.preferredWorkflow)} />
            <ReadOnlyRow label="Production priority" value={formatLabel(overview.noviPreferences.productionPriority)} />
            <ReadOnlyRow label="Packing preference" value={formatLabel(overview.noviPreferences.packingPreference)} />
            <div className="mt-4"><Button variant="secondary" onClick={() => navigate("/bestie")}>Open Novi Command Center</Button></div>
          </SettingSection>}

          {visibleSections.has("notifications") && <SettingSection id="notifications" title="Notifications" description="Workspace-wide Novi alert behavior.">
            {!noviSettings ? <p className="text-sm text-neutral-600">Notification settings are not available for your role.</p> : <>
            <label className="block text-sm font-medium text-neutral-700">Alert frequency
              <select disabled={savingNotification || !canManageWorkspaceNotifications} value={noviSettings.frequency} onChange={event => updateNotifications({ frequency: event.target.value as NoviSettings["frequency"] })} className="mt-1 w-full max-w-sm rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal">
                <option value="proactive">Proactive</option><option value="balanced">Balanced</option><option value="minimal">Minimal</option><option value="quiet">Quiet</option>
              </select>
            </label>
            <div className="mt-4 divide-y divide-neutral-100 border-y border-neutral-200">
              <label className="flex items-center justify-between gap-4 py-3 text-sm font-medium text-neutral-700">Popup alerts
                <input type="checkbox" checked={noviSettings.popup_enabled} disabled={savingNotification || !canManageWorkspaceNotifications} onChange={event => updateNotifications({ popup_enabled: event.target.checked })} className="h-4 w-4 accent-rose-500" />
              </label>
              <label className="flex items-center justify-between gap-4 py-3 text-sm font-medium text-neutral-700">Alert sounds
                <input type="checkbox" checked={noviSettings.sound_enabled} disabled={savingNotification || !canManageWorkspaceNotifications} onChange={event => updateNotifications({ sound_enabled: event.target.checked })} className="h-4 w-4 accent-rose-500" />
              </label>
            </div>
            {!canManageWorkspaceNotifications && <p className="mt-3 text-xs text-neutral-500">An owner or admin can change workspace notification settings.</p>}
            </>}
          </SettingSection>}

          {visibleSections.has("printing") && <SettingSection id="printing" title="Printing & Labels" description="Current SKU and thermal-label defaults.">
            <ReadOnlyRow label="SKU pattern" value={<span className="font-mono">{overview.printingAndLabels.skuPattern}</span>} />
            <ReadOnlyRow label="Label size" value={overview.printingAndLabels.preferredLabelSize} />
            <ReadOnlyRow label="Existing identifiers" value={overview.printingAndLabels.preserveExisting ? "Preserved" : "Replacement allowed"} />
            <ReadOnlyRow label="Shopify product writeback" value={overview.printingAndLabels.productWritebackEnabled ? "Enabled for SKU/barcode" : "Not enabled"} />
            <div className="mt-4"><Button variant="secondary" onClick={() => navigate("/products/sku-label-studio")}>Open SKU & Label Studio</Button></div>
          </SettingSection>}

          {visibleSections.has("support") && <SettingSection id="support" title="Support" description="Contact ShimmerStock and keep a real request reference.">
            <form onSubmit={submitSupport} className="grid gap-3">
              <label className="text-sm font-medium text-neutral-700">Category
                <select value={support.category} onChange={event => setSupport({ ...support, category: event.target.value })} className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal">
                  {SUPPORT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-neutral-700">Subject
                <input required minLength={3} maxLength={120} value={support.subject} onChange={event => setSupport({ ...support, subject: event.target.value })} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-neutral-700">Message
                <textarea required minLength={10} maxLength={5000} rows={5} value={support.message} onChange={event => setSupport({ ...support, message: event.target.value })} className="mt-1 w-full resize-y rounded-md border border-neutral-300 px-3 py-2 font-normal" />
              </label>
              <p className="text-xs text-neutral-500">Do not include passwords, access tokens, API keys, authorization headers, or customer data.</p>
              <div><Button type="submit" disabled={submittingSupport}>{submittingSupport ? "Submitting…" : "Submit support request"}</Button></div>
            </form>
            {supportRequests.length > 0 && <div className="mt-6 border-t border-neutral-200 pt-4">
              <h3 className="text-sm font-bold text-neutral-800">Recent requests</h3>
              <div className="mt-2 divide-y divide-neutral-100">{supportRequests.slice(0, 5).map(request => (
                <div key={request.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-semibold text-neutral-800">{request.subject}</p><p className="text-xs text-neutral-500">{request.reference} · {formatLabel(request.category)}</p></div>
                  <span className="text-xs font-semibold text-neutral-600">{formatLabel(request.status)}</span>
                </div>
              ))}</div>
            </div>}
          </SettingSection>}

          {visibleSections.has("privacy") && <SettingSection id="privacy" title="Data & Privacy" description="Published policies and data-rights requests.">
            <div className="divide-y divide-neutral-100 border-y border-neutral-200">
              <a href="/privacy/" className="flex items-center justify-between py-3 text-sm font-semibold text-neutral-800 hover:text-rose-600"><span>Privacy policy</span><span aria-hidden="true">→</span></a>
              <a href="/data-request/" className="flex items-center justify-between py-3 text-sm font-semibold text-neutral-800 hover:text-rose-600"><span>Submit a data request</span><span aria-hidden="true">→</span></a>
              <a href="/terms/" className="flex items-center justify-between py-3 text-sm font-semibold text-neutral-800 hover:text-rose-600"><span>Terms of service</span><span aria-hidden="true">→</span></a>
            </div>
          </SettingSection>}
        </div>
      </div>
    </div>
  );
}