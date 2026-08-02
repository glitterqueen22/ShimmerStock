import { useState, useEffect, useCallback } from "react";
import Novi from "../components/Novi";
import { PageHeader, Button, Tabs, EmptyState, ErrorBanner, useToast } from "../components/ui";

// ── Types ──

interface TeamMember {
  id: number;
  email: string;
  name: string;
  status: string;
  roles: string | null;
  created_at: string;
  last_login: string | null;
}

interface TeamRole {
  id: number;
  name: string;
  is_default: number;
  permissionCount: number;
}

interface ActivityEntry {
  id: number;
  member_id: number | null;
  member_name: string | null;
  member_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: number | null;
  details: string | null;
  created_at: string;
}

interface PermissionMap {
  [resource: string]: boolean;
}

// ── Permission Groups ──

const PERMISSION_GROUPS: Record<string, { label: string; icon: string; resources: string[] }> = {
  Sales: {
    label: "Sales & Orders",
    icon: "📋",
    resources: ["orders.view", "orders.edit", "orders.create", "orders.refund", "orders.delete"],
  },
  Inventory: {
    label: "Inventory & Warehouse",
    icon: "📦",
    resources: [
      "inventory.view", "inventory.adjust", "inventory.create_po", "inventory.delete_product",
      "warehouse.view", "warehouse.receive", "warehouse.move", "warehouse.pick", "warehouse.pack", "warehouse.ship",
    ],
  },
  Customers: {
    label: "Customers & Service",
    icon: "💬",
    resources: [
      "customers.view", "customers.edit", "customers.delete",
      "customers.issue_store_credit", "customers.replace_orders",
    ],
  },
  "Affiliate HQ": {
    label: "Affiliates",
    icon: "🤝",
    resources: [
      "affiliates.view", "affiliates.approve", "affiliates.issue_rewards",
      "affiliates.view_spend", "affiliates.change_commission",
    ],
  },
  Studio: {
    label: "Marketing & Studio",
    icon: "🎨",
    resources: ["studio.view", "studio.create", "studio.edit", "studio.delete", "growth.view", "growth.export"],
  },
  Production: {
    label: "Production",
    icon: "🏭",
    resources: ["production.view", "production.create", "production.edit", "production.execute"],
  },
  Finance: {
    label: "Finance",
    icon: "💰",
    resources: [
      "finance.view_revenue", "finance.view_profit", "finance.view_margins",
      "finance.view_banking", "finance.view_payroll", "finance.view_vendor_costs", "finance.export",
    ],
  },
  Team: {
    label: "Team Management",
    icon: "👥",
    resources: ["team.view", "team.invite", "team.edit_roles", "team.remove"],
  },
  Settings: {
    label: "Settings",
    icon: "⚙️",
    resources: ["settings.view", "settings.edit"],
  },
};

const ROLE_RECOMMENDATIONS: Record<string, { role: string; description: string; icon: string }> = {
  warehouse: { role: "Warehouse", description: "Inventory & warehouse operations", icon: "📦" },
  customer_service: { role: "Customer Service", description: "Orders, returns & customer support", icon: "💬" },
  marketing: { role: "Marketing", description: "Studio, social & email campaigns", icon: "📱" },
  manager: { role: "General Manager", description: "Full operations oversight", icon: "👔" },
  accountant: { role: "Accounting", description: "Financials, reports & tax prep", icon: "💰" },
  affiliate_manager: { role: "Affiliate Manager", description: "Affiliates & rewards management", icon: "🤝" },
};

// ── Helpers ──

function getToken(): string | null {
  return localStorage.getItem("shimmerstock_token");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...options, headers: { ...authHeaders(), ...(options.headers as any || {}) } });
  if (res.status === 401) { localStorage.removeItem("shimmerstock_token"); window.location.href = "/login"; }
  return res;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Main Component ──

export default function Team() {
  const { toast } = useToast();
  const [tab, setTab] = useState("members");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [teamStats, setTeamStats] = useState<{ totalMembers: number; activeRoles: number }>({ totalMembers: 0, activeRoles: 0 });

  // Form states
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState<number | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [editingPerms, setEditingPerms] = useState<PermissionMap>({});
  const [newRoleName, setNewRoleName] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [activityMemberFilter, setActivityMemberFilter] = useState("");

  const [submitting, setSubmitting] = useState(false);

  // ── Data loading ──

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, rolesRes, activityRes, statsRes] = await Promise.all([
        apiFetch("/api/team/members"),
        apiFetch("/api/team/roles"),
        apiFetch("/api/team/activity?limit=50"),
        apiFetch("/api/team/stats"),
      ]);
      if (membersRes.ok) setMembers(await membersRes.json());
      if (rolesRes.ok) setRoles(await rolesRes.json());
      if (activityRes.ok) setActivityLog(await activityRes.json());
      if (statsRes.ok) setTeamStats(await statsRes.json());
    } catch (err: any) {
      setError(err.message || "Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Invite member ──

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail || !inviteName) return;
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/team/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, name: inviteName, roleId: inviteRoleId }),
      });
      if (res.ok) {
        toast("Invitation sent!", "success");
        setInviteEmail("");
        setInviteName("");
        setInviteRoleId(null);
        loadData();
      } else {
        const data = await res.json();
        toast(data.error || "Failed to invite", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Update member ──

  async function handleUpdateMember(memberId: number, fields: any) {
    try {
      const res = await apiFetch(`/api/team/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      if (res.ok) {
        toast("Member updated", "success");
        loadData();
      } else {
        const data = await res.json();
        toast(data.error || "Failed to update", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  }

  async function handleRemoveMember(memberId: number, name: string) {
    if (!confirm(`Remove ${name} from your team?`)) return;
    try {
      const res = await apiFetch(`/api/team/members/${memberId}`, { method: "DELETE" });
      if (res.ok) {
        toast("Member removed", "success");
        loadData();
      } else {
        const data = await res.json();
        toast(data.error || "Failed to remove", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  }

  // ── Role editing ──

  async function openRoleEditor(roleId: number) {
    setEditingRoleId(roleId);
    try {
      const res = await apiFetch(`/api/team/roles/${roleId}/permissions`);
      if (res.ok) {
        const data = await res.json();
        setEditingPerms(data.permissions || {});
      }
    } catch {}
  }

  async function saveRolePermissions() {
    if (!editingRoleId) return;
    // Also include explicitly false ones for resources with checkboxes
    const allPerms = Object.keys(editingPerms).map((resource) => ({
      resource,
      granted: editingPerms[resource] || false,
    }));

    try {
      const res = await apiFetch(`/api/team/roles/${editingRoleId}`, {
        method: "PUT",
        body: JSON.stringify({ permissions: allPerms }),
      });
      if (res.ok) {
        toast("Permissions saved", "success");
        setEditingRoleId(null);
        loadData();
      } else {
        const data = await res.json();
        toast(data.error || "Failed to save", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  }

  function togglePerm(resource: string) {
    setEditingPerms((prev) => ({ ...prev, [resource]: !prev[resource] }));
  }

  function toggleGroup(groupResources: string[], grant: boolean) {
    setEditingPerms((prev) => {
      const next = { ...prev };
      for (const r of groupResources) next[r] = grant;
      return next;
    });
  }

  // ── Create custom role ──

  async function handleCreateRole() {
    if (!newRoleName.trim()) return;
    try {
      const res = await apiFetch("/api/team/roles", {
        method: "POST",
        body: JSON.stringify({ name: newRoleName.trim(), permissions: [] }),
      });
      if (res.ok) {
        toast("Role created", "success");
        setNewRoleName("");
        loadData();
      } else {
        const data = await res.json();
        toast(data.error || "Failed to create", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  }

  async function handleDeleteRole(roleId: number) {
    const role = roles.find(r => r.id === roleId);
    if (!confirm(`Delete role "${role?.name}"?`)) return;
    try {
      const res = await apiFetch(`/api/team/roles/${roleId}`, { method: "DELETE" });
      if (res.ok) {
        toast("Role deleted", "success");
        loadData();
      } else {
        const data = await res.json();
        toast(data.error || "Failed to delete", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  }

  // ── Status Badge ──

  function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
      active: "bg-emerald-100 text-emerald-700",
      invited: "bg-amber-100 text-amber-700",
      disabled: "bg-neutral-100 text-neutral-500",
    };
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.invited}`}>
        {status}
      </span>
    );
  }

  // ── Loading / Error states ──

  if (loading) {
    return (
      <div>
        <PageHeader title="👥 Team" subtitle="Manage your team, roles, and permissions" />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Novi expression="thinking" size="lg" animated />
            <p className="text-rose-400 text-lg font-medium mt-4">Loading team…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="👥 Team" subtitle="Manage your team, roles, and permissions" />
        <ErrorBanner message={error} onRetry={loadData} />
      </div>
    );
  }

  // ── Render ──

  return (
    <div>
      <PageHeader title="👥 Team" subtitle="Manage your team, roles, and permissions" />

      {/* Novi stats banner */}
      {teamStats.totalMembers > 0 && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-4">
          <Novi expression="happy" size="sm" animated />
          <div>
            <p className="text-sm font-medium text-rose-800">
              You have {teamStats.totalMembers} team member{teamStats.totalMembers !== 1 ? "s" : ""} across {teamStats.activeRoles || roles.length} role{teamStats.activeRoles !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-rose-500 mt-0.5">Keep your team organized — assign the right roles for the right people</p>
          </div>
        </div>
      )}

      <Tabs
        tabs={[
          { key: "members", label: `Members (${members.length})` },
          { key: "roles", label: `Roles (${roles.length})` },
          { key: "permissions", label: "Permission Center" },
          { key: "activity", label: "Activity Log" },
          { key: "invite", label: "Invite" },
        ]}
        activeTab={tab}
        onChange={setTab}
      />

      <div className="mt-6">
        {/* ── Members Tab ── */}
        {tab === "members" && (
          members.length === 0 ? (
            <EmptyState
              icon="👥"
              title="No team members yet"
              description="Invite your first team member to get started."
              action={{ label: "Invite Someone", onClick: () => setTab("invite") }}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-neutral-600">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-600">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-600">Role</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-600">Last Login</th>
                    <th className="px-4 py-3 text-right font-medium text-neutral-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-medium text-neutral-800">{m.name}</td>
                      <td className="px-4 py-3 text-neutral-600">{m.email}</td>
                      <td className="px-4 py-3 text-neutral-600">{m.roles || "—"}</td>
                      <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                      <td className="px-4 py-3 text-neutral-500 text-xs">{formatDate(m.last_login)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {m.status === "active" && (
                            <button
                              onClick={() => handleUpdateMember(m.id, { status: "disabled" })}
                              className="text-xs px-2 py-1 rounded text-neutral-500 hover:bg-neutral-100"
                              title="Disable"
                            >⏸</button>
                          )}
                          {m.status === "disabled" && (
                            <button
                              onClick={() => handleUpdateMember(m.id, { status: "active" })}
                              className="text-xs px-2 py-1 rounded text-emerald-600 hover:bg-emerald-50"
                              title="Enable"
                            >▶</button>
                          )}
                          <button
                            onClick={() => handleRemoveMember(m.id, m.name)}
                            className="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50"
                            title="Remove"
                          >🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── Roles Tab ── */}
        {tab === "roles" && (
          <div>
            {/* Create new role */}
            <div className="mb-4 flex items-center gap-3">
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="New role name…"
                className="px-3 py-2 rounded-xl border border-neutral-200 text-sm flex-1 max-w-xs focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              <Button variant="primary" size="sm" onClick={handleCreateRole} disabled={!newRoleName.trim()}>
                + Create Role
              </Button>
            </div>

            {/* Role cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className={`rounded-xl border p-4 transition-all ${
                    editingRoleId === role.id ? "border-rose-300 ring-2 ring-rose-200 bg-rose-50/50" : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-neutral-800">{role.name}</h3>
                      <p className="text-xs text-neutral-500">
                        {role.permissionCount} permission{role.permissionCount !== 1 ? "s" : ""}
                        {role.is_default ? " · Default" : " · Custom"}
                      </p>
                    </div>
                    {!role.is_default && (
                      <button onClick={() => handleDeleteRole(role.id)} className="text-xs text-red-400 hover:text-red-600">🗑</button>
                    )}
                  </div>

                  {editingRoleId === role.id ? (
                    <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                      {Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => (
                        <div key={groupKey} className="border border-neutral-100 rounded-lg p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-neutral-600">
                              {group.icon} {group.label}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => toggleGroup(group.resources, true)}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                              >All</button>
                              <button
                                onClick={() => toggleGroup(group.resources, false)}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 hover:bg-red-100"
                              >None</button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {group.resources.map((res) => (
                              <label key={res} className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={!!editingPerms[res]}
                                  onChange={() => togglePerm(res)}
                                  className="accent-rose-500"
                                />
                                <span className="text-neutral-600">{res.split(".").slice(1).join(".")}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-2">
                        <Button variant="primary" size="sm" onClick={saveRolePermissions}>Save</Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingRoleId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => openRoleEditor(role.id)}
                      className="mt-2 text-xs text-rose-500 hover:text-rose-700 font-medium"
                    >
                      Edit permissions →
                    </button>
                  )}
                </div>
              ))}
            </div>

            {roles.length === 0 && (
              <EmptyState icon="🔑" title="No roles defined" description="Default roles are created automatically for each business." />
            )}
          </div>
        )}

        {/* ── Permission Center Tab ── */}
        {tab === "permissions" && (
          <div>
            <p className="text-sm text-neutral-600 mb-6">
              Manage role permissions. Click on the <strong>Roles</strong> tab and select a role to edit its permissions.
              The Permission Center shows all available permission resources grouped by department.
            </p>

            {/* Financial Privacy section */}
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
              <span className="text-2xl">🙈</span>
              <div>
                <h3 className="font-semibold text-amber-800">Financial Privacy</h3>
                <p className="text-sm text-amber-700 mt-0.5">
                  Financial permissions (revenue, profit, margins, banking, payroll, vendor costs) are only visible to Owner and Accounting roles.
                  These are hidden from all other non-owner roles by default.
                </p>
              </div>
            </div>

            {/* Permission groups display */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => (
                <div key={groupKey} className="rounded-xl border border-neutral-200 p-4">
                  <h3 className="font-medium text-neutral-800 mb-3">
                    {group.icon} {group.label}
                  </h3>
                  <div className="space-y-1">
                    {group.resources.map((res) => (
                      <div key={res} className="flex items-center gap-2 text-sm text-neutral-600">
                        <span className="text-neutral-400">•</span>
                        <code className="text-xs bg-neutral-100 px-1.5 py-0.5 rounded">{res}</code>
                        <span className="text-neutral-400 text-xs">{res.split(".").slice(1).join(".")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Activity Log Tab ── */}
        {tab === "activity" && (
          <div>
            {/* Filters */}
            <div className="mb-4 flex flex-wrap gap-3">
              <input
                type="text"
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                placeholder="Filter by action…"
                className="px-3 py-2 rounded-xl border border-neutral-200 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              <select
                value={activityMemberFilter}
                onChange={(e) => setActivityMemberFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              >
                <option value="">All members</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {activityLog.length === 0 ? (
              <EmptyState icon="📜" title="No activity yet" description="Activity will appear here as your team takes actions." />
            ) : (
              <div className="space-y-1">
                {activityLog
                  .filter((a) => {
                    if (activityFilter && !a.action.toLowerCase().includes(activityFilter.toLowerCase())) return false;
                    if (activityMemberFilter && a.member_id !== parseInt(activityMemberFilter)) return false;
                    return true;
                  })
                  .map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 px-4 py-2 rounded-lg hover:bg-neutral-50">
                      <span className="text-neutral-400 mt-0.5">•</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-800">
                          <span className="font-medium">{entry.member_name || "System"}</span>
                          {" "}
                          <span className="text-neutral-500">{entry.action}</span>
                        </p>
                        {entry.details && (
                          <p className="text-xs text-neutral-400 mt-0.5 truncate">{entry.details}</p>
                        )}
                      </div>
                      <span className="text-xs text-neutral-400 whitespace-nowrap">{formatDateTime(entry.created_at)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ── Invite Tab ── */}
        {tab === "invite" && (
          <div>
            {/* Novi-guided onboarding */}
            {members.length === 0 ? (
              <div className="mb-6 p-5 bg-gradient-to-r from-rose-50 to-purple-50 border border-rose-200 rounded-2xl">
                <div className="flex items-start gap-4">
                  <Novi expression="happy" size="md" animated />
                  <div>
                    <h3 className="font-semibold text-rose-800 text-lg">Let's build your team!</h3>
                    <p className="text-sm text-rose-600 mt-1">Who do you want to invite first?</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {Object.entries(ROLE_RECOMMENDATIONS).map(([key, rec]) => (
                        <button
                          key={key}
                          onClick={() => {
                            const match = roles.find((r) => r.name === rec.role);
                            if (match) setInviteRoleId(match.id);
                            setTab("invite");
                          }}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-rose-200 hover:border-rose-400 text-sm transition-colors"
                        >
                          <span className="text-lg">{rec.icon}</span>
                          <div className="text-left">
                            <div className="font-medium text-neutral-800">{rec.role}</div>
                            <div className="text-xs text-neutral-500">{rec.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-4">
                <Novi expression="calm" size="sm" animated />
                <p className="text-sm text-rose-800">
                  You have <strong>{teamStats.totalMembers} team member{teamStats.totalMembers !== 1 ? "s" : ""}</strong> across{" "}
                  <strong>{teamStats.activeRoles || roles.length} role{teamStats.activeRoles !== 1 ? "s" : ""}</strong>.
                  Ready to add another?
                </p>
              </div>
            )}

            {/* Invite form */}
            <form onSubmit={handleInvite} className="max-w-lg bg-white rounded-2xl border border-neutral-200 p-6 space-y-4">
              <h3 className="font-semibold text-neutral-800">Invite a team member</h3>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Name</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="jane@example.com"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Role</label>
                <select
                  value={inviteRoleId || ""}
                  onChange={(e) => setInviteRoleId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                >
                  <option value="">Select a role…</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.permissionCount} perms{r.is_default ? ", default" : ""})</option>
                  ))}
                </select>
              </div>

              <Button type="submit" variant="primary" disabled={submitting || !inviteEmail || !inviteName}>
                {submitting ? "Sending…" : "📨 Send Invitation"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
