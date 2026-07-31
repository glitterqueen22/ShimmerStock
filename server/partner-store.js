/**
 * ShimmerStock Partner Store (Partner HQ 3.0)
 * ===========================================
 * Multi-Program Partner Management Data Access Layer.
 * Partner programs sit ABOVE affiliate tables — an affiliate
 * can belong to multiple programs.
 */

// ═══════════════════════════════════════════════════════════════════
// PROGRAMS
// ═══════════════════════════════════════════════════════════════════

export function getPartnerPrograms(db, businessId) {
  return db.query(`
    SELECT pp.*,
      (SELECT COUNT(*) FROM partner_program_members pm WHERE pm.program_id = pp.id AND pm.status = 'active') as active_members,
      (SELECT COUNT(*) FROM partner_program_members pm WHERE pm.program_id = pp.id) as total_members,
      COALESCE((SELECT SUM(ar.commission_earned)
        FROM partner_program_members pm
        JOIN affiliate_referrals ar ON ar.affiliate_id = pm.partner_id
        WHERE pm.program_id = pp.id AND pm.status = 'active'), 0) as total_revenue
    FROM partner_programs pp
    WHERE pp.business_id = ? AND pp.is_active = 1
    ORDER BY pp.created_at DESC
  `).all(businessId);
}

export function getPartnerProgramById(db, id, businessId) {
  return db.query(`
    SELECT pp.*,
      (SELECT COUNT(*) FROM partner_program_members pm WHERE pm.program_id = pp.id AND pm.status = 'active') as active_members,
      (SELECT COUNT(*) FROM partner_program_members pm WHERE pm.program_id = pp.id) as total_members,
      COALESCE((SELECT SUM(ar.commission_earned)
        FROM partner_program_members pm
        JOIN affiliate_referrals ar ON ar.affiliate_id = pm.partner_id
        WHERE pm.program_id = pp.id AND pm.status = 'active'), 0) as total_revenue
    FROM partner_programs pp
    WHERE pp.id = ? AND pp.business_id = ?
  `).get(id, businessId);
}

export function createPartnerProgram(db, data) {
  const result = db.run(
    `INSERT INTO partner_programs (business_id, name, slug, type, description, logo_url, brand_color, is_active, default_commission_type, default_commission_rate, approval_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.businessId,
      data.name,
      data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
      data.type || 'affiliate',
      data.description || null,
      data.logo_url || null,
      data.brand_color || '#6366f1',
      data.is_active !== undefined ? data.is_active : 1,
      data.default_commission_type || 'percentage',
      data.default_commission_rate || 5,
      data.approval_mode || 'auto',
    ]
  );
  return result.lastInsertRowid;
}

export function updatePartnerProgram(db, id, businessId, data) {
  const fields = [];
  const values = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.slug !== undefined) { fields.push('slug = ?'); values.push(data.slug); }
  if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.logo_url !== undefined) { fields.push('logo_url = ?'); values.push(data.logo_url); }
  if (data.brand_color !== undefined) { fields.push('brand_color = ?'); values.push(data.brand_color); }
  if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active); }
  if (data.default_commission_type !== undefined) { fields.push('default_commission_type = ?'); values.push(data.default_commission_type); }
  if (data.default_commission_rate !== undefined) { fields.push('default_commission_rate = ?'); values.push(data.default_commission_rate); }
  if (data.approval_mode !== undefined) { fields.push('approval_mode = ?'); values.push(data.approval_mode); }

  if (fields.length === 0) return null;

  fields.push('updated_at = datetime(\'now\')');
  values.push(id, businessId);

  return db.run(
    `UPDATE partner_programs SET ${fields.join(', ')} WHERE id = ? AND business_id = ?`,
    values
  );
}

export function deletePartnerProgram(db, id, businessId) {
  return db.run(
    'UPDATE partner_programs SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ? AND business_id = ?',
    [id, businessId]
  );
}

// ═══════════════════════════════════════════════════════════════════
// MEMBERS
// ═══════════════════════════════════════════════════════════════════

export function getProgramMembers(db, programId, businessId) {
  return db.query(`
    SELECT pm.*, a.name as partner_name, a.email as partner_email,
      a.discount_code, a.commission_rate as default_commission,
      a.total_referrals, a.total_revenue_generated,
      COALESCE((SELECT SUM(ar.commission_earned)
        FROM affiliate_referrals ar
        WHERE ar.affiliate_id = pm.partner_id), 0) as program_revenue
    FROM partner_program_members pm
    JOIN affiliates a ON pm.partner_id = a.id
    JOIN partner_programs pp ON pm.program_id = pp.id
    WHERE pm.program_id = ? AND pp.business_id = ?
    ORDER BY pm.joined_at DESC
  `).all(programId, businessId);
}

export function addMemberToProgram(db, programId, partnerId, data) {
  const result = db.run(
    `INSERT OR IGNORE INTO partner_program_members (program_id, partner_id, status, custom_commission_rate, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [
      programId,
      partnerId,
      data.status || 'active',
      data.custom_commission_rate || null,
      data.notes || null,
    ]
  );
  return result.lastInsertRowid;
}

export function updateMemberStatus(db, programId, partnerId, status) {
  const updates = { status };
  if (status === 'rejected') {
    updates.rejected_at = new Date().toISOString();
  }
  return db.run(
    `UPDATE partner_program_members SET status = ?, rejected_at = ? WHERE program_id = ? AND partner_id = ?`,
    [updates.status, updates.rejected_at || null, programId, partnerId]
  );
}

export function removeMemberFromProgram(db, programId, partnerId) {
  return db.run(
    'DELETE FROM partner_program_members WHERE program_id = ? AND partner_id = ?',
    [programId, partnerId]
  );
}

// ═══════════════════════════════════════════════════════════════════
// APPLICATION FORMS
// ═══════════════════════════════════════════════════════════════════

export function getApplicationForms(db, programId, businessId) {
  return db.query(`
    SELECT af.*,
      (SELECT COUNT(*) FROM partner_application_submissions pas WHERE pas.form_id = af.id AND pas.status = 'pending') as pending_count,
      (SELECT COUNT(*) FROM partner_application_submissions pas WHERE pas.form_id = af.id) as total_submissions
    FROM partner_application_forms af
    WHERE af.program_id = ? AND af.business_id = ?
    ORDER BY af.created_at DESC
  `).all(programId, businessId);
}

export function createApplicationForm(db, data) {
  const result = db.run(
    `INSERT INTO partner_application_forms (program_id, business_id, is_active, title, description, fields)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.program_id,
      data.businessId,
      data.is_active !== undefined ? data.is_active : 1,
      data.title,
      data.description || null,
      JSON.stringify(data.fields || []),
    ]
  );
  return result.lastInsertRowid;
}

export function updateApplicationForm(db, formId, businessId, data) {
  const fields = [];
  const values = [];

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.fields !== undefined) { fields.push('fields = ?'); values.push(JSON.stringify(data.fields)); }
  if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active); }

  if (fields.length === 0) return null;

  values.push(formId, businessId);
  return db.run(
    `UPDATE partner_application_forms SET ${fields.join(', ')} WHERE id = ? AND business_id = ?`,
    values
  );
}

// ═══════════════════════════════════════════════════════════════════
// APPLICATION SUBMISSIONS
// ═══════════════════════════════════════════════════════════════════

export function getFormSubmissions(db, formId, businessId) {
  return db.query(`
    SELECT pas.*, pp.name as program_name, paf.title as form_title
    FROM partner_application_submissions pas
    JOIN partner_programs pp ON pas.program_id = pp.id
    JOIN partner_application_forms paf ON pas.form_id = paf.id
    WHERE pas.form_id = ? AND pas.business_id = ?
    ORDER BY pas.created_at DESC
  `).all(formId, businessId);
}

export function getAllSubmissions(db, businessId) {
  return db.query(`
    SELECT pas.*, pp.name as program_name, paf.title as form_title
    FROM partner_application_submissions pas
    JOIN partner_programs pp ON pas.program_id = pp.id
    JOIN partner_application_forms paf ON pas.form_id = paf.id
    WHERE pas.business_id = ?
    ORDER BY pas.created_at DESC
  `).all(businessId);
}

export function createFormSubmission(db, data) {
  const result = db.run(
    `INSERT INTO partner_application_submissions (form_id, program_id, business_id, applicant_email, applicant_name, data, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [
      data.form_id,
      data.program_id,
      data.businessId,
      data.applicant_email,
      data.applicant_name,
      JSON.stringify(data.data || {}),
    ]
  );
  return result.lastInsertRowid;
}

export function reviewSubmission(db, submissionId, status, reviewerId) {
  return db.run(
    `UPDATE partner_application_submissions SET status = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`,
    [status, reviewerId, submissionId]
  );
}

export function getPendingApplicationCount(db, businessId) {
  const row = db.query(
    `SELECT COUNT(*) as count FROM partner_application_submissions WHERE business_id = ? AND status = 'pending'`
  ).get(businessId);
  return row ? row.count : 0;
}

// ═══════════════════════════════════════════════════════════════════
// ASSETS
// ═══════════════════════════════════════════════════════════════════

export function getProgramAssets(db, programId, businessId) {
  return db.query(`
    SELECT * FROM partner_assets
    WHERE program_id = ? AND business_id = ?
    ORDER BY created_at DESC
  `).all(programId, businessId);
}

export function getAllAssets(db, businessId) {
  return db.query(`
    SELECT pa.*, pp.name as program_name, pp.brand_color
    FROM partner_assets pa
    JOIN partner_programs pp ON pa.program_id = pp.id
    WHERE pa.business_id = ?
    ORDER BY pa.created_at DESC
  `).all(businessId);
}

export function createProgramAsset(db, data) {
  const result = db.run(
    `INSERT INTO partner_assets (program_id, business_id, name, type, url, is_watermarked)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.program_id,
      data.businessId,
      data.name,
      data.type || 'image',
      data.url,
      data.is_watermarked || 0,
    ]
  );
  return result.lastInsertRowid;
}

export function deleteProgramAsset(db, assetId, businessId) {
  return db.run(
    'DELETE FROM partner_assets WHERE id = ? AND business_id = ?',
    [assetId, businessId]
  );
}

export function logAssetDownload(db, assetId, userId) {
  // Increment counter
  db.run(
    'UPDATE partner_assets SET download_count = download_count + 1 WHERE id = ?',
    [assetId]
  );
  // Write timestamp
  db.run(
    'INSERT INTO partner_asset_downloads (asset_id, user_id) VALUES (?, ?)',
    [assetId, userId || null]
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONTENT PROTECTION
// ═══════════════════════════════════════════════════════════════════

export function getContentProtection(db, programId, businessId) {
  return db.query(`
    SELECT * FROM partner_content_protection
    WHERE program_id = ? AND business_id = ?
  `).get(programId, businessId);
}

export function updateContentProtection(db, programId, businessId, data) {
  // Upsert
  const existing = db.query(
    'SELECT id FROM partner_content_protection WHERE program_id = ? AND business_id = ?'
  ).get(programId, businessId);

  if (existing) {
    const fields = [];
    const values = [];
    if (data.watermark_enabled !== undefined) { fields.push('watermark_enabled = ?'); values.push(data.watermark_enabled); }
    if (data.watermark_text !== undefined) { fields.push('watermark_text = ?'); values.push(data.watermark_text); }
    if (data.watermark_position !== undefined) { fields.push('watermark_position = ?'); values.push(data.watermark_position); }
    if (data.download_logging_enabled !== undefined) { fields.push('download_logging_enabled = ?'); values.push(data.download_logging_enabled); }
    if (data.viewer_overlay_enabled !== undefined) { fields.push('viewer_overlay_enabled = ?'); values.push(data.viewer_overlay_enabled); }
    if (data.viewer_overlay_message !== undefined) { fields.push('viewer_overlay_message = ?'); values.push(data.viewer_overlay_message); }

    if (fields.length === 0) return null;

    fields.push('updated_at = datetime(\'now\')');
    values.push(programId, businessId);

    return db.run(
      `UPDATE partner_content_protection SET ${fields.join(', ')} WHERE program_id = ? AND business_id = ?`,
      values
    );
  } else {
    return db.run(
      `INSERT INTO partner_content_protection (program_id, business_id, watermark_enabled, watermark_text, watermark_position, download_logging_enabled, viewer_overlay_enabled, viewer_overlay_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        programId,
        businessId,
        data.watermark_enabled || 0,
        data.watermark_text || 'ShimmerStock Partner',
        data.watermark_position || 'bottom-right',
        data.download_logging_enabled || 0,
        data.viewer_overlay_enabled || 0,
        data.viewer_overlay_message || 'For authorized partners only',
      ]
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════

export function getPartnerSummary(db, businessId) {
  const programCount = db.query(
    'SELECT COUNT(*) as count FROM partner_programs WHERE business_id = ? AND is_active = 1'
  ).get(businessId);

  const totalPartners = db.query(`
    SELECT COUNT(DISTINCT pm.partner_id) as count
    FROM partner_program_members pm
    JOIN partner_programs pp ON pm.program_id = pp.id
    WHERE pp.business_id = ? AND pm.status = 'active'
  `).get(businessId);

  const totalRevenue = db.query(`
    SELECT COALESCE(SUM(ar.commission_earned), 0) as total
    FROM affiliate_referrals ar
    JOIN partner_program_members pm ON ar.affiliate_id = pm.partner_id
    JOIN partner_programs pp ON pm.program_id = pp.id
    WHERE pp.business_id = ? AND pm.status = 'active'
  `).get(businessId);

  const pendingApps = db.query(
    'SELECT COUNT(*) as count FROM partner_application_submissions WHERE business_id = ? AND status = \'pending\''
  ).get(businessId);

  return {
    programCount: programCount ? programCount.count : 0,
    totalPartners: totalPartners ? totalPartners.count : 0,
    totalRevenue: totalRevenue ? totalRevenue.total : 0,
    pendingApplications: pendingApps ? pendingApps.count : 0,
  };
}
