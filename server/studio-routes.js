/**
 * ShimmerStock Studio Routes (P4.5)
 * ==================================
 * Creative workspace for generating and managing marketing assets.
 * Mounted in server/index.js
 */

import { requireAuth } from "./auth.js";
import { auditLog, getDeviceInfo } from "./audit.js";

function bizId(req) {
  return req.businessId || req.user?.business_id || 1;
}

export function mountStudioRoutes(app, db) {

  // ═══════════════════════════════════════════════════════════════════
  // TEMPLATES CRUD
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/studio/templates — list templates, optionally filtered by type
  app.get("/api/studio/templates", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const type = req.query.type || null;
      let rows;
      if (type) {
        rows = db
          .query("SELECT * FROM studio_templates WHERE business_id = ? AND type = ? ORDER BY created_at DESC")
          .all(bizId(req), type);
      } else {
        rows = db
          .query("SELECT * FROM studio_templates WHERE business_id = ? ORDER BY type, created_at DESC")
          .all(bizId(req));
      }
      // Parse layout JSON
      const templates = rows.map((r) => ({
        ...r,
        layout: typeof r.layout === "string" ? JSON.parse(r.layout) : r.layout,
      }));
      res.json(templates);
    } catch (err) {
      console.error("GET /api/studio/templates error:", err);
      res.status(500).json({ error: "Failed to list templates" });
    }
  });

  // GET /api/studio/templates/:id — single template
  app.get("/api/studio/templates/:id", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const row = db
        .query("SELECT * FROM studio_templates WHERE id = ? AND business_id = ?")
        .get(parseInt(req.params.id), bizId(req));
      if (!row) return res.status(404).json({ error: "Template not found" });
      res.json({
        ...row,
        layout: typeof row.layout === "string" ? JSON.parse(row.layout) : row.layout,
      });
    } catch (err) {
      console.error("GET /api/studio/templates/:id error:", err);
      res.status(500).json({ error: "Failed to get template" });
    }
  });

  // POST /api/studio/templates — create a custom template
  app.post("/api/studio/templates", requireAuth(db, "settings.write"), (req, res) => {
    try {
      const { name, type, layout } = req.body;
      if (!name || !type || !layout) {
        return res.status(400).json({ error: "name, type, and layout are required" });
      }
      const validTypes = ["product_graphics", "social_post", "email_banner", "launch_asset"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
      }

      const layoutJson = typeof layout === "string" ? layout : JSON.stringify(layout);
      const result = db.run(
        "INSERT INTO studio_templates (business_id, name, type, layout) VALUES (?, ?, ?, ?)",
        [bizId(req), name.trim(), type, layoutJson]
      );

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "studio.template_created",
        entityType: "studio_template",
        entityId: result.lastInsertRowid,
        newValue: { name, type },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      const created = db
        .query("SELECT * FROM studio_templates WHERE id = ?")
        .get(result.lastInsertRowid);

      res.status(201).json({
        ...created,
        layout: typeof created.layout === "string" ? JSON.parse(created.layout) : created.layout,
      });
    } catch (err) {
      console.error("POST /api/studio/templates error:", err);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  // DELETE /api/studio/templates/:id
  app.delete("/api/studio/templates/:id", requireAuth(db, "settings.write"), (req, res) => {
    try {
      const row = db
        .query("SELECT * FROM studio_templates WHERE id = ? AND business_id = ?")
        .get(parseInt(req.params.id), bizId(req));
      if (!row) return res.status(404).json({ error: "Template not found" });

      db.run("DELETE FROM studio_templates WHERE id = ?", [parseInt(req.params.id)]);

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "studio.template_deleted",
        entityType: "studio_template",
        entityId: parseInt(req.params.id),
        previousValue: { name: row.name, type: row.type },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/studio/templates/:id error:", err);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // ASSET GENERATION
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/studio/generate — generate asset HTML preview
  app.post("/api/studio/generate", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const { template_id, product_id, text_overrides } = req.body;

      // Get template
      const template = db
        .query("SELECT * FROM studio_templates WHERE id = ? AND business_id = ?")
        .get(template_id ? parseInt(template_id) : null, bizId(req));

      if (!template && template_id) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Get product data if product_id provided
      let productData = null;
      if (product_id) {
        const product = db
          .query("SELECT p.*, pv.price FROM products p LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.business_id = p.business_id WHERE p.id = ? AND p.business_id = ? LIMIT 1")
          .get(parseInt(product_id), bizId(req));
        if (product) {
          productData = {
            id: product.id,
            name: product.name,
            sku: product.sku,
            price: product.price,
            barcode: product.barcode,
          };
          // Get first variant price as fallback if no product-level price
          if (!productData.price) {
            const variant = db
              .query("SELECT price FROM product_variants WHERE product_id = ? AND business_id = ? AND price IS NOT NULL LIMIT 1")
              .get(product.id, bizId(req));
            if (variant) productData.price = variant.price;
          }
        }
      }

      // Get brand settings
      const brandSettings = db
        .query("SELECT brand_colors, brand_logo_url, brand_font FROM business_settings WHERE business_id = ?")
        .get(bizId(req));

      const brandColors = brandSettings?.brand_colors
        ? (typeof brandSettings.brand_colors === "string"
            ? JSON.parse(brandSettings.brand_colors)
            : brandSettings.brand_colors)
        : ["#f43f5e", "#fda4af", "#fff1f2"];
      const brandLogoUrl = brandSettings?.brand_logo_url || null;
      const brandFont = brandSettings?.brand_font || "Inter";

      // Build override data
      const headline = text_overrides?.headline || productData?.name || "Your Product";
      const subtitle = text_overrides?.subtitle || (productData?.price ? `$${parseFloat(productData.price).toFixed(2)}` : "");
      const cta = text_overrides?.cta || "Shop Now";

      // Determine asset type
      const assetType = template?.type || "social_post";

      // Build layout JSON
      const layout = template?.layout
        ? (typeof template.layout === "string" ? JSON.parse(template.layout) : template.layout)
        : getDefaultLayout(assetType);

      // Generate HTML preview
      const html = generateAssetHtml({
        type: assetType,
        layout,
        productData,
        brandColors,
        brandLogoUrl,
        brandFont,
        headline,
        subtitle,
        cta,
      });

      res.json({
        success: true,
        html,
        metadata: {
          template_id: template?.id || null,
          product_id: product_id || null,
          type: assetType,
          headline,
          subtitle,
          cta,
          brandColors,
        },
      });
    } catch (err) {
      console.error("POST /api/studio/generate error:", err);
      res.status(500).json({ error: "Failed to generate asset" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // SAVED ASSETS CRUD
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/studio/assets — list saved assets
  app.get("/api/studio/assets", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const rows = db
        .query(
          `SELECT sa.*, st.name as template_name, p.name as product_name
           FROM studio_assets sa
           LEFT JOIN studio_templates st ON sa.template_id = st.id
           LEFT JOIN products p ON sa.product_id = p.id
           WHERE sa.business_id = ?
           ORDER BY sa.created_at DESC`
        )
        .all(bizId(req));
      res.json(rows);
    } catch (err) {
      console.error("GET /api/studio/assets error:", err);
      res.status(500).json({ error: "Failed to list assets" });
    }
  });

  // POST /api/studio/assets — save a generated asset
  app.post("/api/studio/assets", requireAuth(db, "settings.write"), (req, res) => {
    try {
      const { template_id, product_id, type, title, html_content } = req.body;
      if (!type || !title || !html_content) {
        return res.status(400).json({ error: "type, title, and html_content are required" });
      }

      const result = db.run(
        `INSERT INTO studio_assets (business_id, template_id, product_id, type, title, html_content)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          bizId(req),
          template_id || null,
          product_id || null,
          type,
          title.trim(),
          html_content,
        ]
      );

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "studio.asset_saved",
        entityType: "studio_asset",
        entityId: result.lastInsertRowid,
        newValue: { title, type },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      const created = db
        .query("SELECT * FROM studio_assets WHERE id = ?")
        .get(result.lastInsertRowid);

      res.status(201).json(created);
    } catch (err) {
      console.error("POST /api/studio/assets error:", err);
      res.status(500).json({ error: "Failed to save asset" });
    }
  });

  // DELETE /api/studio/assets/:id
  app.delete("/api/studio/assets/:id", requireAuth(db, "settings.write"), (req, res) => {
    try {
      const row = db
        .query("SELECT * FROM studio_assets WHERE id = ? AND business_id = ?")
        .get(parseInt(req.params.id), bizId(req));
      if (!row) return res.status(404).json({ error: "Asset not found" });

      db.run("DELETE FROM studio_assets WHERE id = ?", [parseInt(req.params.id)]);

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "studio.asset_deleted",
        entityType: "studio_asset",
        entityId: parseInt(req.params.id),
        previousValue: { title: row.title, type: row.type },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/studio/assets/:id error:", err);
      res.status(500).json({ error: "Failed to delete asset" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // BRAND SETTINGS
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/studio/brand — get brand settings
  app.get("/api/studio/brand", requireAuth(db, "settings.read"), (req, res) => {
    try {
      let settings = db
        .query("SELECT brand_colors, brand_logo_url, brand_font FROM business_settings WHERE business_id = ?")
        .get(bizId(req));

      if (!settings) {
        // Create default settings row
        db.run(
          "INSERT INTO business_settings (business_id, brand_colors, brand_logo_url, brand_font) VALUES (?, '[]', NULL, 'Inter')",
          [bizId(req)]
        );
        settings = { brand_colors: "[]", brand_logo_url: null, brand_font: "Inter" };
      }

      res.json({
        brandColors: typeof settings.brand_colors === "string"
          ? JSON.parse(settings.brand_colors)
          : (settings.brand_colors || []),
        brandLogoUrl: settings.brand_logo_url || null,
        brandFont: settings.brand_font || "Inter",
      });
    } catch (err) {
      console.error("GET /api/studio/brand error:", err);
      res.status(500).json({ error: "Failed to get brand settings" });
    }
  });

  // PUT /api/studio/brand — update brand settings
  app.put("/api/studio/brand", requireAuth(db, "settings.write"), (req, res) => {
    try {
      const { brandColors, brandLogoUrl, brandFont } = req.body;

      // Ensure row exists
      const existing = db
        .query("SELECT business_id FROM business_settings WHERE business_id = ?")
        .get(bizId(req));
      if (!existing) {
        db.run(
          "INSERT INTO business_settings (business_id, brand_colors, brand_logo_url, brand_font) VALUES (?, '[]', NULL, 'Inter')",
          [bizId(req)]
        );
      }

      if (brandColors !== undefined) {
        db.run(
          "UPDATE business_settings SET brand_colors = ? WHERE business_id = ?",
          [JSON.stringify(brandColors), bizId(req)]
        );
      }
      if (brandLogoUrl !== undefined) {
        db.run(
          "UPDATE business_settings SET brand_logo_url = ? WHERE business_id = ?",
          [brandLogoUrl, bizId(req)]
        );
      }
      if (brandFont !== undefined) {
        db.run(
          "UPDATE business_settings SET brand_font = ? WHERE business_id = ?",
          [brandFont, bizId(req)]
        );
      }

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "studio.brand_updated",
        entityType: "business_settings",
        entityId: bizId(req),
        newValue: { brandColors, brandLogoUrl, brandFont },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.json({ success: true });
    } catch (err) {
      console.error("PUT /api/studio/brand error:", err);
      res.status(500).json({ error: "Failed to update brand settings" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // PRODUCTS LIST (for product selector)
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/studio/products — list products for asset generation picker
  app.get("/api/studio/products", requireAuth(db, "products.read"), (req, res) => {
    try {
      const rows = db
        .query(
          `SELECT p.id, p.name, p.sku, p.barcode, p.stock_count,
                  (SELECT price FROM product_variants WHERE product_id = p.id AND business_id = p.business_id AND price IS NOT NULL LIMIT 1) as price
           FROM products p
           WHERE p.business_id = ?
           ORDER BY p.name`
        )
        .all(bizId(req));
      res.json(rows);
    } catch (err) {
      console.error("GET /api/studio/products error:", err);
      res.status(500).json({ error: "Failed to list products" });
    }
  });
}

// ── Helper: default layouts per asset type ──────────────────────────

function getDefaultLayout(type) {
  const layouts = {
    social_post: {
      width: 1080,
      height: 1080,
      sections: [
        { type: "image", y: 0, height: "60%", placeholder: true },
        { type: "text", y: "60%", height: "40%", content: "headline", style: "heading" },
        { type: "text", content: "subtitle", style: "body" },
        { type: "text", content: "cta", style: "button" },
      ],
    },
    email_banner: {
      width: 600,
      height: 200,
      sections: [
        { type: "text", y: 0, height: "40%", content: "headline", style: "heading", align: "center" },
        { type: "text", y: "40%", height: "30%", content: "subtitle", style: "body", align: "center" },
        { type: "text", y: "70%", height: "30%", content: "cta", style: "button", align: "center" },
      ],
    },
    product_graphics: {
      width: 800,
      height: 800,
      sections: [
        { type: "image", y: 0, height: "65%", placeholder: true },
        { type: "text", y: "65%", height: "10%", content: "headline", style: "heading" },
        { type: "text", y: "75%", height: "10%", content: "subtitle", style: "body" },
        { type: "text", y: "85%", height: "15%", content: "cta", style: "button" },
      ],
    },
    launch_asset: {
      width: 1200,
      height: 630,
      sections: [
        { type: "text", y: 0, height: "20%", content: "Launching Soon", style: "overline" },
        { type: "text", y: "20%", height: "40%", content: "headline", style: "hero" },
        { type: "image", y: "60%", height: "40%", placeholder: true },
      ],
    },
  };
  return layouts[type] || layouts.social_post;
}

// ── Helper: generate asset HTML ─────────────────────────────────────

function generateAssetHtml({ type, layout, productData, brandColors, brandLogoUrl, brandFont, headline, subtitle, cta }) {
  const primary = brandColors[0] || "#f43f5e";
  const secondary = brandColors[1] || "#fda4af";
  const background = brandColors[2] || "#fff1f2";
  const textColor = "#1f2937";

  const w = layout.width || 800;
  const h = layout.height || 800;

  // Scale factor for preview (max 400px wide)
  const scale = Math.min(1, 400 / w);

  const sectionHtml = (layout.sections || []).map((s) => {
    const top = typeof s.y === "string" ? s.y : `${s.y}px`;
    const height = typeof s.height === "string" ? s.height : `${s.height}px`;
    const align = s.align || "center";

    switch (s.type) {
      case "image":
        if (s.placeholder) {
          return `<div style="position:absolute;top:${top};left:0;width:100%;height:${height};display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,${secondary}33,${primary}22);border:2px dashed ${primary}44;border-radius:12px;margin:8px;width:calc(100%-16px);">
            <div style="text-align:center;color:${primary}88;">
              <div style="font-size:${Math.round(36*scale)}px;">📸</div>
              <div style="font-size:${Math.round(12*scale)}px;margin-top:4px;">Product Image</div>
            </div>
          </div>`;
        }
        return `<div style="position:absolute;top:${top};left:0;width:100%;height:${height};background:${secondary}22;"></div>`;

      case "text":
        const styleMap = {
          heading: `font-size:${Math.round(28*scale)}px;font-weight:700;color:${textColor};`,
          hero: `font-size:${Math.round(42*scale)}px;font-weight:800;color:${textColor};line-height:1.1;`,
          body: `font-size:${Math.round(18*scale)}px;color:${textColor};opacity:0.8;`,
          button: `font-size:${Math.round(16*scale)}px;font-weight:600;color:#fff;background:${primary};padding:${Math.round(10*scale)}px ${Math.round(24*scale)}px;border-radius:${Math.round(8*scale)}px;display:inline-block;`,
          overline: `font-size:${Math.round(14*scale)}px;font-weight:600;color:${primary};text-transform:uppercase;letter-spacing:2px;`,
        };
        const style = styleMap[s.style] || styleMap.body;

        let content = "";
        switch (s.content) {
          case "headline": content = headline; break;
          case "subtitle": content = subtitle; break;
          case "cta": content = cta; break;
          default: content = s.content || "";
        }

        return `<div style="position:absolute;top:${top};left:0;width:100%;height:${height};display:flex;align-items:center;justify-content:${align};padding:16px;">
          <span style="${style}">${content}</span>
        </div>`;

      default:
        return "";
    }
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: '${brandFont}', -apple-system, sans-serif; }
</style>
</head>
<body style="width:${w}px;height:${h}px;background:${background};position:relative;overflow:hidden;">
  ${brandLogoUrl ? `<div style="position:absolute;top:8px;right:8px;z-index:10;"><img src="${brandLogoUrl}" style="max-height:${Math.round(24*scale)}px;opacity:0.8;" alt="Logo" /></div>` : ""}
  ${sectionHtml}
</body>
</html>`;
}
