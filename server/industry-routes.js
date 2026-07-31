/**
 * P4.1 Adaptive HQ — Industry Configuration API Routes
 *
 * GET  /api/industry               — list all available industry profiles
 * GET  /api/industry/:id           — get one profile with full terminology
 * GET  /api/business/settings      — get current business's industry settings
 * PUT  /api/business/settings      — update business industry config (admin only)
 */

import { requireAuth } from "./auth.js";
import { getLabel, getAllLabels, getIndustryConfigForApi, clearLabelCache } from "./engine-labels.js";

export function mountIndustryRoutes(app, db) {
  // ── GET /api/industry — list all industry profiles ────────────────
  app.get("/api/industry", requireAuth(db), (req, res) => {
    try {
      const industries = db
        .query(
          `SELECT id, name, icon, terminology, default_engines, workflow_order, default_units, created_at
           FROM industry_configs
           ORDER BY name`
        )
        .all()
        .map((row) => ({
          id: row.id,
          name: row.name,
          icon: row.icon,
          terminology: JSON.parse(row.terminology || "{}"),
          defaultEngines: JSON.parse(row.default_engines || "[]"),
          workflowOrder: JSON.parse(row.workflow_order || "[]"),
          defaultUnits: JSON.parse(row.default_units || "[]"),
          createdAt: row.created_at,
        }));

      res.json({ industries });
    } catch (err) {
      console.error("GET /api/industry error:", err);
      res.status(500).json({ error: "Failed to fetch industry profiles" });
    }
  });

  // ── GET /api/industry/:id — get one profile ───────────────────────
  app.get("/api/industry/:id", requireAuth(db), (req, res) => {
    try {
      const row = db
        .query(
          `SELECT id, name, icon, terminology, default_engines, workflow_order, default_units, created_at
           FROM industry_configs
           WHERE id = ?`
        )
        .get(req.params.id);

      if (!row) {
        return res.status(404).json({ error: "Industry profile not found" });
      }

      res.json({
        id: row.id,
        name: row.name,
        icon: row.icon,
        terminology: JSON.parse(row.terminology || "{}"),
        defaultEngines: JSON.parse(row.default_engines || "[]"),
        workflowOrder: JSON.parse(row.workflow_order || "[]"),
        defaultUnits: JSON.parse(row.default_units || "[]"),
        createdAt: row.created_at,
      });
    } catch (err) {
      console.error("GET /api/industry/:id error:", err);
      res.status(500).json({ error: "Failed to fetch industry profile" });
    }
  });

  // ── GET /api/business/settings — current business settings ────────
  app.get("/api/business/settings", requireAuth(db, "settings.read"), (req, res) => {
    try {
      const row = db
        .query(
          `SELECT bs.business_id, bs.industry_config_id, bs.settings,
                  ic.name AS industry_name, ic.icon AS industry_icon
           FROM business_settings bs
           LEFT JOIN industry_configs ic ON bs.industry_config_id = ic.id
           WHERE bs.business_id = ?`
        )
        .get(req.businessId);

      if (!row) {
        // No settings configured yet — return defaults
        return res.json({
          businessId: req.businessId,
          industryConfigId: null,
          industryName: null,
          industryIcon: null,
          settings: {},
          labels: getAllLabels(req.businessId, db),
        });
      }

      res.json({
        businessId: row.business_id,
        industryConfigId: row.industry_config_id,
        industryName: row.industry_name,
        industryIcon: row.industry_icon,
        settings: JSON.parse(row.settings || "{}"),
        labels: getAllLabels(req.businessId, db),
      });
    } catch (err) {
      console.error("GET /api/business/settings error:", err);
      res.status(500).json({ error: "Failed to fetch business settings" });
    }
  });

  // ── PUT /api/business/settings — update industry config ──────────
  app.put("/api/business/settings", requireAuth(db, "settings.write"), (req, res) => {
    try {
      const { industryConfigId, settings } = req.body;

      if (industryConfigId !== undefined && industryConfigId !== null) {
        // Validate that the industry config exists
        const industry = db
          .query("SELECT id FROM industry_configs WHERE id = ?")
          .get(industryConfigId);

        if (!industry) {
          return res.status(400).json({ error: "Invalid industry config ID" });
        }
      }

      const existing = db
        .query("SELECT business_id FROM business_settings WHERE business_id = ?")
        .get(req.businessId);

      const settingsJson = JSON.stringify(settings || {});

      if (existing) {
        db.run(
          `UPDATE business_settings
           SET industry_config_id = ?, settings = ?
           WHERE business_id = ?`,
          [industryConfigId || null, settingsJson, req.businessId]
        );
      } else {
        db.run(
          `INSERT INTO business_settings (business_id, industry_config_id, settings)
           VALUES (?, ?, ?)`,
          [req.businessId, industryConfigId || null, settingsJson]
        );
      }

      // Clear the label cache for this business
      clearLabelCache(req.businessId);

      // Return updated settings
      const updatedRow = db
        .query(
          `SELECT bs.business_id, bs.industry_config_id, bs.settings,
                  ic.name AS industry_name, ic.icon AS industry_icon
           FROM business_settings bs
           LEFT JOIN industry_configs ic ON bs.industry_config_id = ic.id
           WHERE bs.business_id = ?`
        )
        .get(req.businessId);

      res.json({
        businessId: updatedRow.business_id,
        industryConfigId: updatedRow.industry_config_id,
        industryName: updatedRow.industry_name,
        industryIcon: updatedRow.industry_icon,
        settings: JSON.parse(updatedRow.settings || "{}"),
        labels: getAllLabels(req.businessId, db),
      });
    } catch (err) {
      console.error("PUT /api/business/settings error:", err);
      res.status(500).json({ error: "Failed to update business settings" });
    }
  });
}
