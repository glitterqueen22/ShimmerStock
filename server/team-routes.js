/**
 * Team HQ Routes
 * ==============
 * Member management, roles, permissions, activity log.
 */

import { requireAuth } from "./auth.js";
import * as team from "./store.js";

// ── Permission resources (for requirePermission middleware) ──────────

const ALL_RESOURCES = [
  // Orders
  "orders.view", "orders.edit", "orders.create", "orders.refund", "orders.delete",
  // Inventory
  "inventory.view", "inventory.adjust", "inventory.create_po", "inventory.delete_product",
  // Warehouse
  "warehouse.view", "warehouse.receive", "warehouse.move", "warehouse.pick", "warehouse.pack", "warehouse.ship",
  // Production
  "production.view", "production.create", "production.edit", "production.execute",
  // Customers
  "customers.view", "customers.edit", "customers.delete", "customers.issue_store_credit", "customers.replace_orders",
  // Affiliates
  "affiliates.view", "affiliates.approve", "affiliates.issue_rewards", "affiliates.view_spend", "affiliates.change_commission",
  // Studio
  "studio.view", "studio.create", "studio.edit", "studio.delete",
  // Growth
  "growth.view", "growth.export",
  // Finance
  "finance.view_revenue", "finance.view_profit", "finance.view_margins", "finance.view_banking", "finance.view_payroll", "finance.view_vendor_costs", "finance.export",
  // Team
  "team.view", "team.invite", "team.edit_roles", "team.remove",
  // Settings
  "settings.view", "settings.edit",
];

/**
 * Lightweight middleware to check a team-level permission.
 * Uses req.user.id to look up team_member -> member_roles -> team_role_permissions.
 * Falls back to legacy role_permissions if no team_member match found.
 */
function requireTeamPermission(db, resource) {
  return (req, res, next) => {
    // Owner always passes
    if (req.businessRole === "owner") return next();

    // Look up team member by user id (via email match to users table)
    // As a fallback, allow based on existing role_permissions
    const member = db.query(
      "SELECT id FROM team_members WHERE business_id = ? AND email = (SELECT username FROM users WHERE id = ?) AND status = 'active'"
    ).get(req.businessId, req.user.id);

    if (member) {
      const hasPerm = team.checkMemberPermission(db, member.id, resource);
      if (hasPerm) return next();
    }

    // Fallback to legacy role_permissions
    const legacyPerm = team.getRolePermission(db, req.businessRole, resource);
    if (legacyPerm) return next();

    return res.status(403).json({ error: "Insufficient team permissions", resource });
  };
}

export function mountTeamRoutes(app, db) {

  // ── List all permission resources ──────────────────────────────────

  app.get("/api/team/permission-resources", requireAuth(db), (req, res) => {
    res.json({ resources: ALL_RESOURCES });
  });

  // ── Member Management ──────────────────────────────────────────────

  // POST /api/team/invite — Invite a new team member
  app.post("/api/team/invite", requireAuth(db), (req, res) => {
    try {
      const { email, name, roleId } = req.body;

      if (!email || !name) {
        return res.status(400).json({ error: "Email and name are required" });
      }

      // Check if already exists
      const existing = team.getTeamMemberByEmail(db, email.trim().toLowerCase(), req.businessId);
      if (existing) {
        return res.status(409).json({ error: "A team member with this email already exists" });
      }

      // Create member
      const memberId = team.createTeamMember(db, {
        businessId: req.businessId,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        status: "invited",
      });

      // Assign role if provided
      if (roleId) {
        team.assignMemberRole(db, memberId, roleId);
      }

      // Log activity
      team.logActivity(db, {
        businessId: req.businessId,
        memberId,
        action: "team.member_invited",
        resourceType: "team_member",
        resourceId: memberId,
        details: JSON.stringify({ email: email.trim().toLowerCase(), name: name.trim(), roleId }),
      });

      const member = team.getTeamMember(db, memberId, req.businessId);
      res.status(201).json({ ...member, message: "Invitation sent" });
    } catch (err) {
      console.error("POST /api/team/invite error:", err);
      res.status(500).json({ error: "Failed to invite team member" });
    }
  });

  // GET /api/team/members — List all members
  app.get("/api/team/members", requireAuth(db), (req, res) => {
    try {
      const members = team.listTeamMembers(db, req.businessId);
      res.json(members);
    } catch (err) {
      console.error("GET /api/team/members error:", err);
      res.status(500).json({ error: "Failed to fetch team members" });
    }
  });

  // PATCH /api/team/members/:id — Update member
  app.patch("/api/team/members/:id", requireAuth(db), (req, res) => {
    try {
      const memberId = parseInt(req.params.id);
      const member = team.getTeamMember(db, memberId, req.businessId);
      if (!member) return res.status(404).json({ error: "Member not found" });

      const { name, email, status, roleIds } = req.body;
      const fields = {};
      if (name !== undefined) fields.name = name.trim();
      if (email !== undefined) fields.email = email.trim().toLowerCase();
      if (status !== undefined) fields.status = status;

      if (Object.keys(fields).length > 0) {
        team.updateTeamMember(db, memberId, req.businessId, fields);
      }

      // Update roles if provided
      if (roleIds !== undefined) {
        team.setMemberRoles(db, memberId, roleIds);
      }

      // Log activity
      team.logActivity(db, {
        businessId: req.businessId,
        memberId,
        action: "team.member_updated",
        resourceType: "team_member",
        resourceId: memberId,
        details: JSON.stringify({ ...fields, roleIds }),
      });

      const updated = team.listTeamMembers(db, req.businessId).find(m => m.id === memberId);
      res.json(updated);
    } catch (err) {
      console.error("PATCH /api/team/members/:id error:", err);
      res.status(500).json({ error: "Failed to update member" });
    }
  });

  // DELETE /api/team/members/:id — Remove member
  app.delete("/api/team/members/:id", requireAuth(db), (req, res) => {
    try {
      const memberId = parseInt(req.params.id);
      const member = team.getTeamMember(db, memberId, req.businessId);
      if (!member) return res.status(404).json({ error: "Member not found" });

      team.deleteTeamMember(db, memberId, req.businessId);

      // Log activity (before delete so we have the data)
      team.logActivity(db, {
        businessId: req.businessId,
        memberId: null,
        action: "team.member_removed",
        resourceType: "team_member",
        resourceId: memberId,
        details: JSON.stringify({ email: member.email, name: member.name }),
      });

      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/team/members/:id error:", err);
      res.status(500).json({ error: "Failed to remove member" });
    }
  });

  // ── Role Management ────────────────────────────────────────────────

  // GET /api/team/roles — List all roles with permission counts
  app.get("/api/team/roles", requireAuth(db), (req, res) => {
    try {
      const roles = team.listTeamRoles(db, req.businessId);
      res.json(roles);
    } catch (err) {
      console.error("GET /api/team/roles error:", err);
      res.status(500).json({ error: "Failed to fetch roles" });
    }
  });

  // POST /api/team/roles — Create custom role
  app.post("/api/team/roles", requireAuth(db), (req, res) => {
    try {
      const { name, permissions } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Role name is required" });
      }

      const roleId = team.createTeamRole(db, {
        businessId: req.businessId,
        name: name.trim(),
        isDefault: 0,
      });

      // Set permissions if provided
      if (permissions && Array.isArray(permissions)) {
        team.setRolePermissionsBatch(db, roleId, permissions);
      }

      // Log activity
      team.logActivity(db, {
        businessId: req.businessId,
        action: "team.role_created",
        resourceType: "team_role",
        resourceId: roleId,
        details: JSON.stringify({ name: name.trim(), permissions }),
      });

      const role = team.getTeamRole(db, roleId, req.businessId);
      res.status(201).json(role);
    } catch (err) {
      if (err.message && err.message.includes("UNIQUE")) {
        return res.status(409).json({ error: "A role with that name already exists" });
      }
      console.error("POST /api/team/roles error:", err);
      res.status(500).json({ error: "Failed to create role" });
    }
  });

  // PUT /api/team/roles/:id — Update role permissions
  app.put("/api/team/roles/:id", requireAuth(db), (req, res) => {
    try {
      const roleId = parseInt(req.params.id);
      const role = team.getTeamRole(db, roleId, req.businessId);
      if (!role) return res.status(404).json({ error: "Role not found" });

      const { name, permissions } = req.body;

      if (name !== undefined) {
        team.updateTeamRole(db, roleId, req.businessId, { name: name.trim() });
      }

      if (permissions !== undefined && Array.isArray(permissions)) {
        team.setRolePermissionsBatch(db, roleId, permissions);
      }

      // Log activity
      team.logActivity(db, {
        businessId: req.businessId,
        action: "team.role_updated",
        resourceType: "team_role",
        resourceId: roleId,
        details: JSON.stringify({ name, permissionCount: permissions?.length }),
      });

      // Return updated role with permissions
      const perms = team.getRolePermissions(db, roleId);
      res.json({ ...role, ...(name && { name: name.trim() }), permissions: perms });
    } catch (err) {
      console.error("PUT /api/team/roles/:id error:", err);
      res.status(500).json({ error: "Failed to update role" });
    }
  });

  // DELETE /api/team/roles/:id — Delete custom role
  app.delete("/api/team/roles/:id", requireAuth(db), (req, res) => {
    try {
      const roleId = parseInt(req.params.id);
      const role = team.getTeamRole(db, roleId, req.businessId);
      if (!role) return res.status(404).json({ error: "Role not found" });
      if (role.is_default) {
        return res.status(400).json({ error: "Default roles cannot be deleted" });
      }

      team.deleteTeamRole(db, roleId, req.businessId);

      // Log activity
      team.logActivity(db, {
        businessId: req.businessId,
        action: "team.role_deleted",
        resourceType: "team_role",
        resourceId: roleId,
        details: JSON.stringify({ name: role.name }),
      });

      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/team/roles/:id error:", err);
      res.status(500).json({ error: "Failed to delete role" });
    }
  });

  // GET /api/team/roles/:id/permissions — Get permissions for a role
  app.get("/api/team/roles/:id/permissions", requireAuth(db), (req, res) => {
    try {
      const roleId = parseInt(req.params.id);
      const role = team.getTeamRole(db, roleId, req.businessId);
      if (!role) return res.status(404).json({ error: "Role not found" });

      const permissions = team.getRolePermissions(db, roleId);
      // Build a complete map of all resources with granted state
      const permMap = {};
      for (const r of ALL_RESOURCES) {
        permMap[r] = false;
      }
      for (const p of permissions) {
        permMap[p.resource] = !!p.granted;
      }

      res.json({ role, permissions: permMap });
    } catch (err) {
      console.error("GET /api/team/roles/:id/permissions error:", err);
      res.status(500).json({ error: "Failed to fetch role permissions" });
    }
  });

  // ── Permission Check ───────────────────────────────────────────────

  // GET /api/team/permissions/:memberId — Get permissions for a member
  app.get("/api/team/permissions/:memberId", requireAuth(db), (req, res) => {
    try {
      const memberId = parseInt(req.params.memberId);
      const permissions = team.getMemberPermissions(db, memberId);
      res.json({ memberId, permissions });
    } catch (err) {
      console.error("GET /api/team/permissions/:memberId error:", err);
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  });

  // ── Activity Log ───────────────────────────────────────────────────

  // GET /api/team/activity — List activity log
  app.get("/api/team/activity", requireAuth(db), (req, res) => {
    try {
      const { memberId, action, resourceType, limit, offset } = req.query;
      const activities = team.listActivityLog(db, req.businessId, {
        memberId: memberId ? parseInt(memberId) : undefined,
        action: action || undefined,
        resourceType: resourceType || undefined,
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
      });
      res.json(activities);
    } catch (err) {
      console.error("GET /api/team/activity error:", err);
      res.status(500).json({ error: "Failed to fetch activity log" });
    }
  });

  // ── Team Stats (for Novi) ──────────────────────────────────────────

  // GET /api/team/stats — Team summary stats
  app.get("/api/team/stats", requireAuth(db), (req, res) => {
    try {
      const stats = team.getTeamStats(db, req.businessId);
      res.json(stats);
    } catch (err) {
      console.error("GET /api/team/stats error:", err);
      res.status(500).json({ error: "Failed to fetch team stats" });
    }
  });

  console.log("Team HQ routes mounted");
}
