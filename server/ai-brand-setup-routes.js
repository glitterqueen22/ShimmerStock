/**
 * AI Brand Setup Routes
 * ======================
 * Mounted at /api/brand-setup
 *
 * Novi auto-generates branded business documents from a logo + website URL.
 * Builds on Fulfillment HQ 1.1's fulfillment_templates system.
 */

import { requireAuth } from "./auth.js";
import { auditLog, getDeviceInfo } from "./audit.js";
import * as store from "./store.js";
import {
  STYLE_PRESETS,
  TEMPLATE_TYPES,
  extractBrandFromLogo,
  extractBrandFromWebsite,
  buildBrandKit,
  generateTemplateConfig,
  parseConversationalEdit,
} from "./ai-brand-setup.js";

export function mountBrandSetupRoutes(app, db) {

  // ── GET /api/brand-setup/styles ────────────────────────────────────
  app.get("/api/brand-setup/styles", requireAuth(db, "reports.read"), (req, res) => {
    const styles = Object.entries(STYLE_PRESETS).map(([key, preset]) => ({
      id: key,
      name: preset.name,
      icon: preset.icon,
      description: preset.description,
      colors: preset.colors,
      fonts: preset.fonts,
      tone: preset.tone,
      preview: {
        background: preset.colors.background,
        primary: preset.colors.primary,
        text: preset.colors.text,
      },
    }));
    res.json({ styles });
  });

  // ── POST /api/brand-setup/analyze-logo ─────────────────────────────
  app.post("/api/brand-setup/analyze-logo", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const { logoUrl } = req.body;
      if (!logoUrl) return res.status(400).json({ error: "logoUrl is required" });

      const analysis = extractBrandFromLogo(logoUrl);
      res.json({
        logoUrl: analysis.logoUrl,
        suggestedStyle: analysis.suggestedStyle,
        suggestedFontStyle: analysis.suggestedFontStyle,
        isDarkLogo: analysis.isDarkLogo,
        message: analysis.isDarkLogo
          ? "Your logo has a dark theme — I'll use light text on dark backgrounds."
          : "I've analyzed your logo and identified a great style direction.",
      });
    } catch (err) {
      console.error("POST /api/brand-setup/analyze-logo error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/brand-setup/analyze-website ──────────────────────────
  app.post("/api/brand-setup/analyze-website", requireAuth(db, "reports.read"), async (req, res) => {
    try {
      const { websiteUrl } = req.body;
      if (!websiteUrl) return res.status(400).json({ error: "websiteUrl is required" });

      const data = await extractBrandFromWebsite(websiteUrl);
      res.json(data);
    } catch (err) {
      console.error("POST /api/brand-setup/analyze-website error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/brand-setup/create-brand-kit ─────────────────────────
  app.post("/api/brand-setup/create-brand-kit", requireAuth(db, "reports.read"), async (req, res) => {
    try {
      const { logoUrl, websiteUrl, brandColors, brandName, style } = req.body;

      // Analyze logo
      const logoAnalysis = extractBrandFromLogo(logoUrl);

      // Analyze website (if provided)
      let websiteData = null;
      if (websiteUrl) {
        websiteData = await extractBrandFromWebsite(websiteUrl);
      }

      // Build brand kit
      const brandKit = buildBrandKit({
        logoUrl,
        websiteData,
        brandColors,
        brandName,
        style: style || logoAnalysis.suggestedStyle,
      });

      // Add style options context
      const matchedStyle = STYLE_PRESETS[brandKit.style] || STYLE_PRESETS.modern;

      res.json({
        brandKit,
        styleInfo: {
          id: brandKit.style,
          name: matchedStyle.name,
          icon: matchedStyle.icon,
          description: matchedStyle.description,
        },
        alternatives: Object.entries(STYLE_PRESETS)
          .filter(([k]) => k !== brandKit.style)
          .slice(0, 2)
          .map(([k, p]) => ({ id: k, name: p.name, icon: p.icon, description: p.description })),
      });
    } catch (err) {
      console.error("POST /api/brand-setup/create-brand-kit error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/brand-setup/generate-all ─────────────────────────────
  app.post("/api/brand-setup/generate-all", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const { brandKit } = req.body;
      if (!brandKit) return res.status(400).json({ error: "brandKit is required" });
      if (!brandKit.brand_name) return res.status(400).json({ error: "brandKit.brand_name is required" });

      const generated = [];
      const errors = [];

      for (const templateType of TEMPLATE_TYPES) {
        try {
          // Check if a Novi-generated template of this type already exists
          const existing = store.getFulfillmentTemplates(db, req.businessId, templateType.type)
            .filter(t => {
              try {
                const cfg = JSON.parse(t.config || "{}");
                return cfg.generated_by === "novi";
              } catch { return false; }
            });

          // Delete old Novi-generated templates of this type
          for (const old of existing) {
            store.deleteFulfillmentTemplate(db, old.id, req.businessId);
          }

          const config = generateTemplateConfig(templateType.type, brandKit);
          const id = store.createFulfillmentTemplate(db, {
            businessId: req.businessId,
            type: templateType.type,
            name: `${brandKit.brand_name} — ${templateType.label}`,
            config,
            isDefault: true,
          });

          generated.push({
            id,
            type: templateType.type,
            label: templateType.label,
            icon: templateType.icon,
            name: `${brandKit.brand_name} — ${templateType.label}`,
          });
        } catch (err) {
          errors.push({ type: templateType.type, error: err.message });
        }
      }

      const timestamp = new Date().toISOString();

      auditLog(db, { actionType: "brand_setup.generate_all", entityType: "fulfillment_template",
        businessId: req.businessId,
        userId: req.user?.id,
        entityId: generated.length,
        source: "novi",
        deviceInfo: getDeviceInfo(req),
      });

      res.status(201).json({
        message: `Generated ${generated.length} branded templates`,
        count: generated.length,
        templates: generated,
        errors: errors.length > 0 ? errors : undefined,
        timestamp,
      });
    } catch (err) {
      console.error("POST /api/brand-setup/generate-all error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/brand-setup/generate-single ──────────────────────────
  app.post("/api/brand-setup/generate-single", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const { brandKit, templateType } = req.body;
      if (!brandKit) return res.status(400).json({ error: "brandKit is required" });
      if (!templateType) return res.status(400).json({ error: "templateType is required" });

      const templateInfo = TEMPLATE_TYPES.find(t => t.type === templateType);
      if (!templateInfo) return res.status(400).json({ error: `Unknown template type: ${templateType}` });

      // Delete old Novi-generated templates of this type
      const existing = store.getFulfillmentTemplates(db, req.businessId, templateType)
        .filter(t => {
          try {
            const cfg = JSON.parse(t.config || "{}");
            return cfg.generated_by === "novi";
          } catch { return false; }
        });
      for (const old of existing) {
        store.deleteFulfillmentTemplate(db, old.id, req.businessId);
      }

      const config = generateTemplateConfig(templateType, brandKit);
      const id = store.createFulfillmentTemplate(db, {
        businessId: req.businessId,
        type: templateType,
        name: `${brandKit.brand_name} — ${templateInfo.label}`,
        config,
        isDefault: true,
      });

      res.status(201).json({
        id,
        type: templateType,
        label: templateInfo.label,
        icon: templateInfo.icon,
        name: `${brandKit.brand_name} — ${templateInfo.label}`,
        config,
      });
    } catch (err) {
      console.error("POST /api/brand-setup/generate-single error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── PUT /api/brand-setup/conversational-edit ───────────────────────
  app.put("/api/brand-setup/conversational-edit", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const { templateId, instruction, brandKit } = req.body;
      if (!templateId) return res.status(400).json({ error: "templateId is required" });
      if (!instruction) return res.status(400).json({ error: "instruction is required" });

      // Get current template
      const existing = store.getFulfillmentTemplateById(db, templateId, req.businessId);
      if (!existing) return res.status(404).json({ error: "Template not found" });

      const currentConfig = JSON.parse(existing.config || "{}");
      const { updatedConfig, changesDescription, noviMessage } = parseConversationalEdit(
        instruction,
        brandKit || null,
        currentConfig
      );

      // Update template
      store.updateFulfillmentTemplate(db, templateId, req.businessId, { config: updatedConfig });

      res.json({
        message: noviMessage || changesDescription,
        changes: changesDescription,
        templateId,
        config: updatedConfig,
      });
    } catch (err) {
      console.error("PUT /api/brand-setup/conversational-edit error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/brand-setup/has-templates ─────────────────────────────
  // Used by Novi to check if business has branded templates
  app.get("/api/brand-setup/has-templates", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const templates = store.getFulfillmentTemplates(db, req.businessId);
      const noviGenerated = templates.filter(t => {
        try {
          const cfg = JSON.parse(t.config || "{}");
          return cfg.generated_by === "novi";
        } catch { return false; }
      });

      res.json({
        hasTemplates: templates.length > 0,
        hasBrandedTemplates: noviGenerated.length > 0,
        totalTemplates: templates.length,
        brandedCount: noviGenerated.length,
        needsBrandSetup: noviGenerated.length === 0,
      });
    } catch (err) {
      console.error("GET /api/brand-setup/has-templates error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/brand-setup/create-memory ────────────────────────────
  // Novi creates a celebration memory after brand setup
  app.post("/api/brand-setup/create-memory", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const { eventType, title, description } = req.body;
      if (!title) return res.status(400).json({ error: "title is required" });

      db.run(
        `INSERT INTO novi_memory (business_id, event_type, title, description, occurred_at) 
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [req.businessId, eventType || "brand_setup", title, description || ""]
      );

      res.status(201).json({ message: "Memory created" });
    } catch (err) {
      console.error("POST /api/brand-setup/create-memory error:", err);
      res.status(500).json({ error: err.message });
    }
  });
}
