/**
 * ShimmerStock Partner API Routes (Partner HQ 3.0)
 * =================================================
 * Multi-Program Partner Management Engine.
 * Mounted in server/index.js
 */

import * as partnerStore from "./partner-store.js";
import { requireAuth } from "./auth.js";
import { emit } from "./events.js";
import { auditLog, getDeviceInfo } from "./audit.js";

function bizId(req) {
  return req.businessId || req.user?.business_id || 1;
}

export function mountPartnerRoutes(app, db) {

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/partner/summary", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const summary = partnerStore.getPartnerSummary(db, bizId(req));
      res.json(summary);
    } catch (err) {
      console.error("GET /api/partner/summary error:", err);
      res.status(500).json({ error: "Failed to load partner summary" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // PROGRAMS
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/partner/programs — list all programs
  app.get("/api/partner/programs", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const programs = partnerStore.getPartnerPrograms(db, bizId(req));
      res.json(programs);
    } catch (err) {
      console.error("GET /api/partner/programs error:", err);
      res.status(500).json({ error: "Failed to load programs" });
    }
  });

  // POST /api/partner/programs — create program
  app.post("/api/partner/programs", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const { name, type, description, logo_url, brand_color, default_commission_type, default_commission_rate, approval_mode, slug } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Program name is required" });
      }
      const id = partnerStore.createPartnerProgram(db, {
        businessId: bizId(req),
        name,
        type: type || 'affiliate',
        description,
        logo_url,
        brand_color,
        default_commission_type,
        default_commission_rate,
        approval_mode: approval_mode || 'auto',
        slug,
      });
      const program = partnerStore.getPartnerProgramById(db, id, bizId(req));
      emit("partner_program_created", { businessId: bizId(req), programId: id, name });
      auditLog(db, {
        businessId: bizId(req),
        userId: req.user?.id,
        actionType: "partner_program.create",
        entityType: "partner_program",
        entityId: id,
        newValue: { name, type },
      });
      res.status(201).json(program);
    } catch (err) {
      console.error("POST /api/partner/programs error:", err);
      res.status(500).json({ error: "Failed to create program" });
    }
  });

  // GET /api/partner/programs/:id — single program
  app.get("/api/partner/programs/:id", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const program = partnerStore.getPartnerProgramById(db, parseInt(req.params.id), bizId(req));
      if (!program) {
        return res.status(404).json({ error: "Program not found" });
      }
      res.json(program);
    } catch (err) {
      console.error("GET /api/partner/programs/:id error:", err);
      res.status(500).json({ error: "Failed to load program" });
    }
  });

  // PUT /api/partner/programs/:id — update program
  app.put("/api/partner/programs/:id", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = partnerStore.getPartnerProgramById(db, id, bizId(req));
      if (!existing) {
        return res.status(404).json({ error: "Program not found" });
      }
      partnerStore.updatePartnerProgram(db, id, bizId(req), req.body);
      const updated = partnerStore.getPartnerProgramById(db, id, bizId(req));
      auditLog(db, {
        businessId: bizId(req),
        userId: req.user?.id,
        actionType: "partner_program.update",
        entityType: "partner_program",
        entityId: id,
        newValue: req.body,
      });
      res.json(updated);
    } catch (err) {
      console.error("PUT /api/partner/programs/:id error:", err);
      res.status(500).json({ error: "Failed to update program" });
    }
  });

  // DELETE /api/partner/programs/:id — soft delete
  app.delete("/api/partner/programs/:id", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = partnerStore.getPartnerProgramById(db, id, bizId(req));
      if (!existing) {
        return res.status(404).json({ error: "Program not found" });
      }
      partnerStore.deletePartnerProgram(db, id, bizId(req));
      auditLog(db, {
        businessId: bizId(req),
        userId: req.user?.id,
        actionType: "partner_program.delete",
        entityType: "partner_program",
        entityId: id,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/partner/programs/:id error:", err);
      res.status(500).json({ error: "Failed to delete program" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // MEMBERS
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/partner/programs/:id/members
  app.get("/api/partner/programs/:id/members", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const programId = parseInt(req.params.id);
      const members = partnerStore.getProgramMembers(db, programId, bizId(req));
      res.json(members);
    } catch (err) {
      console.error("GET /api/partner/programs/:id/members error:", err);
      res.status(500).json({ error: "Failed to load members" });
    }
  });

  // POST /api/partner/programs/:id/members — add member
  app.post("/api/partner/programs/:id/members", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const programId = parseInt(req.params.id);
      const { partner_id, status, custom_commission_rate, notes } = req.body;
      if (!partner_id) {
        return res.status(400).json({ error: "partner_id is required" });
      }
      const id = partnerStore.addMemberToProgram(db, programId, partner_id, {
        status, custom_commission_rate, notes,
      });
      auditLog(db, {
        businessId: bizId(req),
        userId: req.user?.id,
        actionType: "partner_member.create",
        entityType: "partner_program_member",
        entityId: id,
        newValue: { programId, partner_id },
      });
      res.status(201).json({ id, program_id: programId, partner_id });
    } catch (err) {
      console.error("POST /api/partner/programs/:id/members error:", err);
      res.status(500).json({ error: "Failed to add member" });
    }
  });

  // PUT /api/partner/programs/:id/members/:memberId — update member status
  app.put("/api/partner/programs/:id/members/:memberId", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const programId = parseInt(req.params.id);
      const partnerId = parseInt(req.params.memberId);
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: "status is required" });
      }
      partnerStore.updateMemberStatus(db, programId, partnerId, status);
      emit("partner_member_updated", { businessId: bizId(req), programId, partnerId, status });
      res.json({ success: true });
    } catch (err) {
      console.error("PUT /api/partner/programs/:id/members/:memberId error:", err);
      res.status(500).json({ error: "Failed to update member" });
    }
  });

  // DELETE /api/partner/programs/:id/members/:memberId
  app.delete("/api/partner/programs/:id/members/:memberId", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const programId = parseInt(req.params.id);
      const partnerId = parseInt(req.params.memberId);
      partnerStore.removeMemberFromProgram(db, programId, partnerId);
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/partner/programs/:id/members/:memberId error:", err);
      res.status(500).json({ error: "Failed to remove member" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // APPLICATION FORMS
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/partner/programs/:id/application-forms
  app.get("/api/partner/programs/:id/application-forms", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const programId = parseInt(req.params.id);
      const forms = partnerStore.getApplicationForms(db, programId, bizId(req));
      res.json(forms);
    } catch (err) {
      console.error("GET /api/partner/programs/:id/application-forms error:", err);
      res.status(500).json({ error: "Failed to load forms" });
    }
  });

  // POST /api/partner/programs/:id/application-forms — create form
  app.post("/api/partner/programs/:id/application-forms", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const programId = parseInt(req.params.id);
      const { title, description, fields } = req.body;
      if (!title) {
        return res.status(400).json({ error: "Form title is required" });
      }
      const id = partnerStore.createApplicationForm(db, {
        program_id: programId,
        businessId: bizId(req),
        title,
        description,
        fields: fields || [],
      });
      const forms = partnerStore.getApplicationForms(db, programId, bizId(req));
      emit("partner_application_form_created", { businessId: bizId(req), programId, formId: id });
      res.status(201).json(forms[0] || { id });
    } catch (err) {
      console.error("POST /api/partner/programs/:id/application-forms error:", err);
      res.status(500).json({ error: "Failed to create form" });
    }
  });

  // PUT /api/partner/programs/:id/application-forms/:formId
  app.put("/api/partner/programs/:id/application-forms/:formId", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const formId = parseInt(req.params.formId);
      partnerStore.updateApplicationForm(db, formId, bizId(req), req.body);
      res.json({ success: true });
    } catch (err) {
      console.error("PUT /api/partner/programs/:id/application-forms/:formId error:", err);
      res.status(500).json({ error: "Failed to update form" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // APPLICATION SUBMISSIONS (public + admin)
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/partner/forms/:formId/submissions
  app.get("/api/partner/forms/:formId/submissions", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const formId = parseInt(req.params.formId);
      const submissions = partnerStore.getFormSubmissions(db, formId, bizId(req));
      res.json(submissions);
    } catch (err) {
      console.error("GET /api/partner/forms/:formId/submissions error:", err);
      res.status(500).json({ error: "Failed to load submissions" });
    }
  });

  // GET /api/partner/submissions — all submissions
  app.get("/api/partner/submissions", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const submissions = partnerStore.getAllSubmissions(db, bizId(req));
      res.json(submissions);
    } catch (err) {
      console.error("GET /api/partner/submissions error:", err);
      res.status(500).json({ error: "Failed to load submissions" });
    }
  });

  // POST /api/partner/forms/:formId/submissions — public submission (no auth)
  app.post("/api/partner/forms/:formId/submissions", (req, res) => {
    try {
      const formId = parseInt(req.params.formId);
      const { applicant_email, applicant_name, data, program_id, business_id } = req.body;

      if (!applicant_email || !applicant_name) {
        return res.status(400).json({ error: "Name and email are required" });
      }

      // Determine program_id and business_id from the form
      const form = db.query(
        "SELECT program_id, business_id FROM partner_application_forms WHERE id = ?"
      ).get(formId);

      if (!form) {
        return res.status(404).json({ error: "Application form not found" });
      }

      const id = partnerStore.createFormSubmission(db, {
        form_id: formId,
        program_id: form.program_id,
        businessId: form.business_id,
        applicant_email,
        applicant_name,
        data: data || {},
      });

      emit("partner_application_submitted", {
        businessId: form.business_id,
        formId,
        submissionId: id,
      });

      res.status(201).json({ id, message: "Application submitted successfully" });
    } catch (err) {
      console.error("POST /api/partner/forms/:formId/submissions error:", err);
      res.status(500).json({ error: "Failed to submit application" });
    }
  });

  // PUT /api/partner/submissions/:submissionId/review — approve/reject
  app.put("/api/partner/submissions/:submissionId/review", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const submissionId = parseInt(req.params.submissionId);
      const { status } = req.body;
      if (!status || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
      }

      partnerStore.reviewSubmission(db, submissionId, status, req.user?.id);

      emit("partner_application_reviewed", {
        businessId: bizId(req),
        submissionId,
        status,
        reviewedBy: req.user?.id,
      });

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user?.id,
        actionType: `partner_application.${status}`,
        entityType: "partner_application_submission",
        entityId: submissionId,
        newValue: { status },
      });

      res.json({ success: true, status });
    } catch (err) {
      console.error("PUT /api/partner/submissions/:submissionId/review error:", err);
      res.status(500).json({ error: "Failed to review submission" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // ASSETS
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/partner/programs/:id/assets
  app.get("/api/partner/programs/:id/assets", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const programId = parseInt(req.params.id);
      const assets = partnerStore.getProgramAssets(db, programId, bizId(req));
      res.json(assets);
    } catch (err) {
      console.error("GET /api/partner/programs/:id/assets error:", err);
      res.status(500).json({ error: "Failed to load assets" });
    }
  });

  // GET /api/partner/assets — all assets across all programs
  app.get("/api/partner/assets", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const assets = partnerStore.getAllAssets(db, bizId(req));
      res.json(assets);
    } catch (err) {
      console.error("GET /api/partner/assets error:", err);
      res.status(500).json({ error: "Failed to load assets" });
    }
  });

  // POST /api/partner/programs/:id/assets — create asset
  app.post("/api/partner/programs/:id/assets", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const programId = parseInt(req.params.id);
      const { name, type, url, is_watermarked } = req.body;
      if (!name || !url) {
        return res.status(400).json({ error: "name and url are required" });
      }
      const id = partnerStore.createProgramAsset(db, {
        program_id: programId,
        businessId: bizId(req),
        name,
        type: type || 'image',
        url,
        is_watermarked,
      });
      res.status(201).json({ id, program_id: programId, name, type, url });
    } catch (err) {
      console.error("POST /api/partner/programs/:id/assets error:", err);
      res.status(500).json({ error: "Failed to create asset" });
    }
  });

  // DELETE /api/partner/programs/:id/assets/:assetId
  app.delete("/api/partner/programs/:id/assets/:assetId", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const assetId = parseInt(req.params.assetId);
      partnerStore.deleteProgramAsset(db, assetId, bizId(req));
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/partner/programs/:id/assets/:assetId error:", err);
      res.status(500).json({ error: "Failed to delete asset" });
    }
  });

  // POST /api/partner/assets/:assetId/download — log download
  app.post("/api/partner/assets/:assetId/download", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const assetId = parseInt(req.params.assetId);
      partnerStore.logAssetDownload(db, assetId, req.user?.id);
      res.json({ success: true });
    } catch (err) {
      console.error("POST /api/partner/assets/:assetId/download error:", err);
      res.status(500).json({ error: "Failed to log download" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // CONTENT PROTECTION
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/partner/programs/:id/content-protection
  app.get("/api/partner/programs/:id/content-protection", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const programId = parseInt(req.params.id);
      const protection = partnerStore.getContentProtection(db, programId, bizId(req));
      res.json(protection || null);
    } catch (err) {
      console.error("GET /api/partner/programs/:id/content-protection error:", err);
      res.status(500).json({ error: "Failed to load content protection" });
    }
  });

  // PUT /api/partner/programs/:id/content-protection
  app.put("/api/partner/programs/:id/content-protection", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const programId = parseInt(req.params.id);
      partnerStore.updateContentProtection(db, programId, bizId(req), req.body);
      const updated = partnerStore.getContentProtection(db, programId, bizId(req));
      res.json(updated);
    } catch (err) {
      console.error("PUT /api/partner/programs/:id/content-protection error:", err);
      res.status(500).json({ error: "Failed to update content protection" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // INVITE PARTNER
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/partner/invite — invite a new partner by email
  app.post("/api/partner/invite", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const { email, program_id, message } = req.body;
      if (!email || !email.includes("@")) {
        return res.status(400).json({ error: "A valid email address is required" });
      }
      if (!program_id) {
        return res.status(400).json({ error: "Program ID is required" });
      }

      const bid = bizId(req);

      // Check if an affiliate with this email already exists
      const existing = db.query(
        "SELECT id FROM affiliates WHERE email = ? AND business_id = ?"
      ).get(email, bid);

      let affiliateId;
      if (existing) {
        affiliateId = existing.id;
      } else {
        // Generate a unique discount code from the email
        const prefix = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
        const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const discountCode = `${prefix}${suffix}`;

        const result = db.run(
          `INSERT INTO affiliates (business_id, name, email, discount_code, discount_type, discount_value, commission_rate, is_active, notes)
           VALUES (?, ?, ?, ?, 'percentage', 10, 0, 0, ?)`,
          [bid, email.split("@")[0], email, discountCode, message || null]
        );
        affiliateId = Number(result.lastInsertRowid);
      }

      // Add to the selected program with "invited" status
      const memberResult = db.run(
        `INSERT OR IGNORE INTO partner_program_members (program_id, partner_id, status)
         VALUES (?, ?, 'invited')`,
        [program_id, affiliateId]
      );

      // Get program name for the response
      const program = db.query(
        "SELECT name FROM partner_programs WHERE id = ? AND business_id = ?"
      ).get(program_id, bid);

      emit("partner_invited", {
        businessId: bid,
        programId: program_id,
        affiliateId,
        email,
      });

      auditLog(db, {
        businessId: bid,
        userId: req.user?.id,
        actionType: "partner.invite",
        entityType: "affiliate",
        entityId: affiliateId,
        newValue: { email, program_id, invited_by: req.user?.id },
      });

      res.status(201).json({
        id: affiliateId,
        email,
        program_id,
        program_name: program ? program.name : null,
        status: "invited",
        message: `Invitation created for ${email}. Share their unique link to get started.`,
      });
    } catch (err) {
      console.error("POST /api/partner/invite error:", err);
      res.status(500).json({ error: "Failed to send invitation" });
    }
  });

  console.log("Partner HQ 3.0 routes mounted");
}
