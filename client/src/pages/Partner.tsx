import { useState, useEffect } from 'react';
import { PageHeader, Tabs, Badge, Button, Modal, SearchBar, EmptyState, Skeleton, ErrorBanner, useToast } from '../components/ui';
import { apiGet, apiPost, apiPut, apiDelete, sanitizeError } from '../lib/api';
import NoviContextualPanel from '../components/novi/NoviContextualPanel';
import { NoviEmptyState } from '../components/novi/NoviArtwork';

// ── Types ──────────────────────────────────────────────────────────

interface PartnerProgram {
  id: number;
  business_id: number;
  name: string;
  slug: string;
  type: 'affiliate' | 'brand_rep' | 'creator' | 'wholesale' | 'ambassador' | 'influencer';
  description: string | null;
  logo_url: string | null;
  brand_color: string;
  is_active: number;
  default_commission_type: string;
  default_commission_rate: number;
  approval_mode: string;
  created_at: string;
  updated_at: string;
  active_members: number;
  total_members: number;
  total_revenue: number;
}

interface ProgramMember {
  id: number;
  program_id: number;
  partner_id: number;
  status: string;
  joined_at: string;
  rejected_at: string | null;
  custom_commission_rate: number | null;
  notes: string | null;
  partner_name: string;
  partner_email: string | null;
  discount_code: string;
  default_commission: number;
  total_referrals: number;
  total_revenue_generated: number;
  program_revenue: number;
}

interface ApplicationForm {
  id: number;
  program_id: number;
  business_id: number;
  is_active: number;
  title: string;
  description: string | null;
  fields: string;
  created_at: string;
  pending_count: number;
  total_submissions: number;
}

interface ApplicationSubmission {
  id: number;
  form_id: number;
  program_id: number;
  applicant_email: string;
  applicant_name: string;
  data: string;
  status: string;
  created_at: string;
  program_name: string;
  form_title: string;
}

interface ProgramAsset {
  id: number;
  program_id: number;
  name: string;
  type: string;
  url: string;
  is_watermarked: number;
  download_count: number;
  created_at: string;
  program_name?: string;
  brand_color?: string;
}

interface AttributionRecord {
  id: number;
  shopify_order_number: string;
  affiliate_name: string;
  affiliate_email: string;
  attribution_method: string;
  coupon_code_used: string | null;
  order_total_cents: number;
  eligible_amount_cents: number;
  commission_rate: number;
  commission_cents: number;
  status: string;
  is_self_referral: number;
  notes: string | null;
  created_at: string;
}

interface AttributionRules {
  id: number;
  cookie_duration_hours: number;
  attribution_model: string;
  coupon_overrides_referral: number;
  allow_self_referrals: number;
  require_fulfillment: number;
  require_return_window: number;
  return_window_days: number;
  repeat_customer_orders_qualify: number;
}

interface CommissionConfig {
  id: number;
  exclude_shipping: number;
  exclude_taxes: number;
  exclude_discounts: number;
  exclude_gift_cards: number;
  exclude_tips: number;
  excluded_product_ids: string | null;
  excluded_collection_ids: string | null;
  minimum_order_amount_cents: number | null;
}

interface ReferralLink {
  id: number;
  link_code: string;
  full_url: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  click_count: number;
  conversion_count: number;
  is_active: number;
  created_at: string;
}
interface ContentProtection {
  id: number;
  program_id: number;
  watermark_enabled: number;
  watermark_text: string;
  watermark_position: string;
  download_logging_enabled: number;
  viewer_overlay_enabled: number;
  viewer_overlay_message: string;
}

interface PartnerSummary {
  programCount: number;
  totalPartners: number;
  totalRevenue: number;
  pendingApplications: number;
}

interface Affiliate {
  id: number;
  name: string;
  email: string;
  discount_code: string;
  is_active: number;
}

// ── Constants ──────────────────────────────────────────────────────

const PROGRAM_TYPES: Record<string, { label: string; color: string; icon: string }> = {
  affiliate: { label: 'Affiliate', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: '🔗' },
  brand_rep: { label: 'Brand Rep', color: 'bg-pink-50 text-pink-700 border-pink-200', icon: '🌟' },
  creator: { label: 'Creator', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: '🎬' },
  wholesale: { label: 'Wholesale', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: '📦' },
  ambassador: { label: 'Ambassador', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '👑' },
  influencer: { label: 'Influencer', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: '📱' },
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  suspended: 'bg-gray-50 text-gray-700 border-gray-200',
};

// ── Component ──────────────────────────────────────────────────────
export default function Partner() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Summary
  const [summary, setSummary] = useState<PartnerSummary | null>(null);

  // Programs
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<PartnerProgram | null>(null);
  const [programDetailTab, setProgramDetailTab] = useState('overview');

  // Members
  const [members, setMembers] = useState<ProgramMember[]>([]);

  // Applications
  const [forms, setForms] = useState<ApplicationForm[]>([]);
  const [submissions, setSubmissions] = useState<ApplicationSubmission[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<ApplicationSubmission[]>([]);

  // Assets
  const [assets, setAssets] = useState<ProgramAsset[]>([]);
  const [allAssets, setAllAssets] = useState<ProgramAsset[]>([]);

  // Content Protection
  const [protection, setProtection] = useState<ContentProtection | null>(null);

  // Available affiliates for member add
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);

  // Modal state
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [editingProgram, setEditingProgram] = useState<PartnerProgram | null>(null);
  const [programForm, setProgramForm] = useState({ name: '', type: 'affiliate', description: '', brand_color: '#6366f1', approval_mode: 'auto', default_commission_rate: '5', default_commission_type: 'percentage' });

  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState({ partner_id: '', custom_commission_rate: '' });

  const [showAssetModal, setShowAssetModal] = useState(false);
  const [assetForm, setAssetForm] = useState({ name: '', type: 'image', url: '', is_watermarked: 0 });

  const [showFormModal, setShowFormModal] = useState(false);
  const [formBuilder, setFormBuilder] = useState({ title: '', description: '', fields: '[]' });

  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Invite state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', program_id: '', message: '' });
  const [inviteSaving, setInviteSaving] = useState(false);

  // Novi panel state
  const [noviPanelOpen, setNoviPanelOpen] = useState(false);

  // Attribution state
  const [attributionRules, setAttributionRules] = useState<AttributionRules | null>(null);
  const [commissionConfig, setCommissionConfig] = useState<CommissionConfig | null>(null);
  const [attributions, setAttributions] = useState<AttributionRecord[]>([]);
  const [pendingAttributions, setPendingAttributions] = useState<AttributionRecord[]>([]);
  // These state values are declared for future feature work; the getter is intentionally unused.
  const [_mySales] = useState<any[]>([]);
  const [_referralLinks] = useState<ReferralLink[]>([]);
  const [_showManualAttrModal, setShowManualAttrModal] = useState(false);
  const [_manualAttrForm] = useState({ orderId: '', affiliateId: '', reason: '', commissionCents: '' });
  const [attrSaving, setAttrSaving] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────
  async function loadSummary() {
    try {
      const data = await apiGet<PartnerSummary>('/api/partner/summary');
      setSummary(data);
    } catch (_) {}
  }

  async function loadPrograms() {
    try {
      const data = await apiGet<PartnerProgram[]>('/api/partner/programs');
      setPrograms(data);
    } catch (_) {}
  }

  async function loadAllSubmissions() {
    try {
      const data = await apiGet<ApplicationSubmission[]>('/api/partner/submissions');
      setAllSubmissions(data);
    } catch (_) {}
  }

  async function loadAllAssets() {
    try {
      const data = await apiGet<ProgramAsset[]>('/api/partner/assets');
      setAllAssets(data);
    } catch (_) {}
  }

  async function loadAffiliates() {
    try {
      const data = await apiGet<Affiliate[]>('/api/affiliates');
      setAffiliates(data);
    } catch (_) {}
  }


  async function selectProgram(program: PartnerProgram) {
    setSelectedProgram(program);
    setProgramDetailTab('overview');
    // Load all detail data
    try {
      const [membersData, formsData, assetsData, protectionData] = await Promise.all([
        apiGet<ProgramMember[]>(`/api/partner/programs/${program.id}/members`),
        apiGet<ApplicationForm[]>(`/api/partner/programs/${program.id}/application-forms`),
        apiGet<ProgramAsset[]>(`/api/partner/programs/${program.id}/assets`),
        apiGet<ContentProtection | null>(`/api/partner/programs/${program.id}/content-protection`),
      ]);
      setMembers(membersData || []);
      setForms(formsData || []);
      setAssets(assetsData || []);
      setProtection(protectionData);
    } catch (_) {}
  }

  async function loadSubmissionsForForm(formId: number) {
    try {
      const data = await apiGet<ApplicationSubmission[]>(`/api/partner/forms/${formId}/submissions`);
      setSubmissions(data);
    } catch (_) {}
  }

  function loadTabData(tab: string) {
    switch (tab) {
      case 'dashboard': loadSummary(); loadPrograms(); loadAllSubmissions(); break;
      case 'programs': loadPrograms(); break;
      case 'applications': loadAllSubmissions(); break;
      case 'content-vault': loadAllAssets(); break;
    }
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([loadSummary(), loadPrograms(), loadAllSubmissions(), loadAllAssets(), loadAffiliates()])
      .catch((err) => setError(sanitizeError(err)))
      .finally(() => setLoading(false));
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────

  // Program CRUD
  function openCreateProgram() {
    setEditingProgram(null);
    setProgramForm({ name: '', type: 'affiliate', description: '', brand_color: '#6366f1', approval_mode: 'auto', default_commission_rate: '5', default_commission_type: 'percentage' });
    setShowProgramModal(true);
  }

  function openInvitePartner() {
    setInviteForm({ email: '', program_id: programs.length === 1 ? String(programs[0].id) : '', message: '' });
    setShowInviteModal(true);
  }

  async function handleInvitePartner() {
    if (!inviteForm.email.trim() || !inviteForm.email.includes('@')) { toast('Valid email required', 'error'); return; }
    if (!inviteForm.program_id) { toast('Select a program', 'error'); return; }
    setInviteSaving(true);
    try {
      const result = await apiPost<{ id: number; email: string; status: string; program_name: string }>('/api/partner/invite', {
        email: inviteForm.email.trim(),
        program_id: parseInt(inviteForm.program_id),
        message: inviteForm.message.trim() || undefined,
      });
      toast(`Invitation created for ${result.email}`, 'success');
      setShowInviteModal(false);
      loadPrograms();
      loadSummary();
      loadAffiliates();
    } catch (e: any) { toast(e?.message || 'Failed to send invitation', 'error'); }
    finally { setInviteSaving(false); }
  }


  async function handleSaveProgram() {
    if (!programForm.name.trim()) { toast('Name required', 'error'); return; }
    setSaving(true);
    try {
      if (editingProgram) {
        await apiPut(`/api/partner/programs/${editingProgram.id}`, {
          name: programForm.name.trim(),
          type: programForm.type,
          description: programForm.description.trim() || null,
          brand_color: programForm.brand_color,
          approval_mode: programForm.approval_mode,
          default_commission_rate: parseFloat(programForm.default_commission_rate),
          default_commission_type: programForm.default_commission_type,
        });
        toast('Program updated', 'success');
      } else {
        await apiPost('/api/partner/programs', {
          name: programForm.name.trim(),
          type: programForm.type,
          description: programForm.description.trim() || null,
          brand_color: programForm.brand_color,
          approval_mode: programForm.approval_mode,
          default_commission_rate: parseFloat(programForm.default_commission_rate),
          default_commission_type: programForm.default_commission_type,
        });
        toast('Program created', 'success');
      }
      setShowProgramModal(false);
      loadPrograms();
      loadSummary();
    } catch (e: any) { toast(e?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  }

  async function handleDeleteProgram(id: number) {
    if (!confirm('Delete this program?')) return;
    try {
      await apiDelete(`/api/partner/programs/${id}`);
      toast('Program deleted', 'success');
      setSelectedProgram(null);
      loadPrograms();
      loadSummary();
    } catch (e: any) { toast(e?.message || 'Failed', 'error'); }
  }

  // Member management
  async function handleAddMember() {
    if (!selectedProgram || !memberForm.partner_id) { toast('Select a partner', 'error'); return; }
    setSaving(true);
    try {
      await apiPost(`/api/partner/programs/${selectedProgram.id}/members`, {
        partner_id: parseInt(memberForm.partner_id),
        custom_commission_rate: memberForm.custom_commission_rate ? parseFloat(memberForm.custom_commission_rate) : null,
      });
      toast('Member added', 'success');
      setShowMemberModal(false);
      setMemberForm({ partner_id: '', custom_commission_rate: '' });
      selectProgram(selectedProgram);
      loadPrograms();
    } catch (e: any) { toast(e?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  }

  async function handleUpdateMemberStatus(partnerId: number, status: string) {
    if (!selectedProgram) return;
    try {
      await apiPut(`/api/partner/programs/${selectedProgram.id}/members/${partnerId}`, { status });
      toast(`Member ${status}`, 'success');
      selectProgram(selectedProgram);
    } catch (e: any) { toast(e?.message || 'Failed', 'error'); }
  }

  async function handleRemoveMember(partnerId: number) {
    if (!selectedProgram || !confirm('Remove this member?')) return;
    try {
      await apiDelete(`/api/partner/programs/${selectedProgram.id}/members/${partnerId}`);
      toast('Member removed', 'success');
      selectProgram(selectedProgram);
    } catch (e: any) { toast(e?.message || 'Failed', 'error'); }
  }

  // Application review
  async function handleReviewSubmission(submissionId: number, status: string) {
    try {
      await apiPut(`/api/partner/submissions/${submissionId}/review`, { status });
      toast(`Application ${status}`, 'success');
      loadAllSubmissions();
      loadSummary();
      if (selectedProgram && forms.length > 0) {
        loadSubmissionsForForm(forms[0].id);
      }
    } catch (e: any) { toast(e?.message || 'Failed', 'error'); }
  }

  // Forms
  async function handleSaveForm() {
    if (!selectedProgram || !formBuilder.title.trim()) { toast('Title required', 'error'); return; }
    setSaving(true);
    try {
      if (forms.length > 0) {
        await apiPut(`/api/partner/programs/${selectedProgram.id}/application-forms/${forms[0].id}`, {
          title: formBuilder.title.trim(),
          description: formBuilder.description.trim() || null,
          fields: JSON.parse(formBuilder.fields || '[]'),
        });
      } else {
        await apiPost(`/api/partner/programs/${selectedProgram.id}/application-forms`, {
          title: formBuilder.title.trim(),
          description: formBuilder.description.trim() || null,
          fields: JSON.parse(formBuilder.fields || '[]'),
        });
      }
      toast('Form saved', 'success');
      setShowFormModal(false);
      selectProgram(selectedProgram);
    } catch (e: any) { toast(e?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  }

  // Assets
  async function handleSaveAsset() {
    if (!selectedProgram || !assetForm.name.trim() || !assetForm.url.trim()) { toast('Name and URL required', 'error'); return; }
    setSaving(true);
    try {
      await apiPost(`/api/partner/programs/${selectedProgram.id}/assets`, {
        name: assetForm.name.trim(),
        type: assetForm.type,
        url: assetForm.url.trim(),
        is_watermarked: assetForm.is_watermarked,
      });
      toast('Asset added', 'success');
      setShowAssetModal(false);
      setAssetForm({ name: '', type: 'image', url: '', is_watermarked: 0 });
      selectProgram(selectedProgram);
      loadAllAssets();
    } catch (e: any) { toast(e?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  }

  async function handleDeleteAsset(assetId: number) {
    if (!selectedProgram || !confirm('Delete this asset?')) return;
    try {
      await apiDelete(`/api/partner/programs/${selectedProgram.id}/assets/${assetId}`);
      toast('Asset deleted', 'success');
      selectProgram(selectedProgram);
      loadAllAssets();
    } catch (e: any) { toast(e?.message || 'Failed', 'error'); }
  }

  async function handleLogDownload(assetId: number) {
    try {
      await apiPost(`/api/partner/assets/${assetId}/download`, {});
      selectProgram(selectedProgram!);
      loadAllAssets();
    } catch (_) {}
  }

  // Content Protection
  async function handleSaveProtection() {
    if (!selectedProgram || !protection) return;
    try {
      await apiPut(`/api/partner/programs/${selectedProgram.id}/content-protection`, protection);
      toast('Content protection updated', 'success');
    } catch (e: any) { toast(e?.message || 'Failed', 'error'); }
  }

  // ── Attribution ──────────────────────────────────────────────────

  async function loadAttributionRules(programId?: number) {
    try {
      const data = await apiGet<AttributionRules>(`/api/affiliate-attribution/rules?program_id=${programId || ''}`);
      setAttributionRules(data);
    } catch (_) {}
  }

  async function loadCommissionConfig(programId?: number) {
    try {
      const data = await apiGet<CommissionConfig>(`/api/affiliate-attribution/commission-config?program_id=${programId || ''}`);
      setCommissionConfig(data);
    } catch (_) {}
  }

  async function handleSaveAttributionRules() {
    if (!attributionRules) return;
    setAttrSaving(true);
    try {
      await apiPut('/api/affiliate-attribution/rules', { ...attributionRules, program_id: selectedProgram?.id ?? null });
      toast('Attribution rules saved', 'success');
    } catch (e: any) { toast(e?.message || 'Failed to save rules', 'error'); }
    finally { setAttrSaving(false); }
  }

  async function handleSaveCommissionConfig() {
    if (!commissionConfig) return;
    setAttrSaving(true);
    try {
      await apiPut('/api/affiliate-attribution/commission-config', { ...commissionConfig, program_id: selectedProgram?.id ?? null });
      toast('Commission config saved', 'success');
    } catch (e: any) { toast(e?.message || 'Failed to save config', 'error'); }
    finally { setAttrSaving(false); }
  }

  async function loadAttributions(programId?: number) {
    try {
      const data = await apiGet<AttributionRecord[]>(`/api/affiliate-attribution/attributions?program_id=${programId || ''}`);
      setAttributions(data || []);
    } catch (_) { setAttributions([]); }
  }

  async function loadPendingAttributions() {
    try {
      const data = await apiGet<AttributionRecord[]>('/api/affiliate-attribution/pending');
      setPendingAttributions(data || []);
    } catch (_) { setPendingAttributions([]); }
  }

  async function handleReverseAttribution(attributionId: number) {
    if (!confirm('Reverse this attribution?')) return;
    try {
      await apiPost('/api/affiliate-attribution/reverse', { attributionId, reason: 'Admin reversal' });
      toast('Attribution reversed', 'success');
      loadAttributions(selectedProgram?.id);
      loadPendingAttributions();
    } catch (e: any) { toast(e?.message || 'Failed to reverse', 'error'); }
  }

  // Auto-load attribution data when entering the tab
  useEffect(() => {
    if (programDetailTab === 'attribution' && selectedProgram) {
      loadAttributionRules(selectedProgram.id);
      loadCommissionConfig(selectedProgram.id);
      loadAttributions(selectedProgram.id);
      loadPendingAttributions();
    }
  }, [programDetailTab, selectedProgram?.id]);

  // ── Tabs ─────────────────────────────────────────────────────────
  const PARTNER_TABS = [
    { key: 'dashboard', label: 'Dashboard', badge: null },
    { key: 'programs', label: 'Programs', badge: programs.length },
    { key: 'applications', label: 'Applications', badge: summary?.pendingApplications || 0 },
    { key: 'content-vault', label: 'Content Vault', badge: allAssets.length },
    { key: 'affiliates', label: 'Affiliate Tools', badge: null },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Partner HQ" subtitle="Multi-program partner management" />
        <Skeleton variant="card" />
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} variant="table-row" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Partner HQ" subtitle="Multi-program partner management" />
        <ErrorBanner message={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Partner HQ" subtitle="Multi-program partner management" />

      <Tabs tabs={PARTNER_TABS} activeTab={activeTab} onTabChange={(t) => { setActiveTab(t); loadTabData(t); }} />

      {/* ═══════════════════════════════════════════════════════ DASHBOARD ═══ */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* ── Get Started Screen (zero programs) ── */}
          {programs.length === 0 ? (
            <div className="space-y-4">
              <div className="text-center py-4">
                <h2 className="text-2xl font-bold text-neutral-900">Welcome to Partner HQ 💜</h2>
                <p className="text-neutral-500 mt-1">What would you like to do first?</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Create Program */}
                <div onClick={openCreateProgram} className="bg-white border border-neutral-200 rounded-xl p-5 cursor-pointer hover:border-purple-300 hover:shadow-md hover:shadow-purple-100/50 transition-all group">
                  <div className="text-3xl mb-3">🚀</div>
                  <h3 className="font-semibold text-neutral-900 group-hover:text-purple-700 transition-colors">Create my first program</h3>
                  <p className="text-sm text-neutral-500 mt-1">Set up an affiliate, ambassador, or creator program</p>
                </div>
                {/* Invite Partner */}
                <div onClick={openInvitePartner} className="bg-white border border-neutral-200 rounded-xl p-5 cursor-pointer hover:border-purple-300 hover:shadow-md hover:shadow-purple-100/50 transition-all group">
                  <div className="text-3xl mb-3">✉️</div>
                  <h3 className="font-semibold text-neutral-900 group-hover:text-purple-700 transition-colors">Invite a partner</h3>
                  <p className="text-sm text-neutral-500 mt-1">Send an email invitation to join your program</p>
                </div>
                {/* Review Applications */}
                <div onClick={() => setActiveTab('applications')} className="bg-white border border-neutral-200 rounded-xl p-5 cursor-pointer hover:border-purple-300 hover:shadow-md hover:shadow-purple-100/50 transition-all group">
                  <div className="text-3xl mb-3">📝</div>
                  <h3 className="font-semibold text-neutral-900 group-hover:text-purple-700 transition-colors">Review applications</h3>
                  <p className="text-sm text-neutral-500 mt-1">Approve or reject partner applications</p>
                </div>
                {/* Content Vault */}
                <div onClick={() => setActiveTab('content-vault')} className="bg-white border border-neutral-200 rounded-xl p-5 cursor-pointer hover:border-purple-300 hover:shadow-md hover:shadow-purple-100/50 transition-all group">
                  <div className="text-3xl mb-3">🗂️</div>
                  <h3 className="font-semibold text-neutral-900 group-hover:text-purple-700 transition-colors">Add marketing resources</h3>
                  <p className="text-sm text-neutral-500 mt-1">Upload banners, logos, and content for partners to share</p>
                </div>
                {/* Configure Rewards */}
                <div onClick={() => { setActiveTab('programs'); if (programs.length === 0) { openCreateProgram(); } }} className="bg-white border border-neutral-200 rounded-xl p-5 cursor-pointer hover:border-purple-300 hover:shadow-md hover:shadow-purple-100/50 transition-all group">
                  <div className="text-3xl mb-3">🎁</div>
                  <h3 className="font-semibold text-neutral-900 group-hover:text-purple-700 transition-colors">Configure rewards</h3>
                  <p className="text-sm text-neutral-500 mt-1">Set commission rates and reward structures for partners</p>
                </div>
                {/* Ask Novi */}
                <div onClick={() => setNoviPanelOpen(true)} className="bg-white border-2 border-purple-200 rounded-xl p-5 cursor-pointer hover:border-purple-400 hover:shadow-md hover:shadow-purple-100/50 transition-all group bg-purple-50/30">
                  <div className="text-3xl mb-3">💜</div>
                  <h3 className="font-semibold text-neutral-900 group-hover:text-purple-700 transition-colors">Ask Novi to help me set it up</h3>
                  <p className="text-sm text-neutral-500 mt-1">Let Novi guide you through creating your first program</p>
                </div>
              </div>
              {/* Also show Novi CTA at the bottom */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 text-center">
                <p className="text-purple-800 font-medium">Not sure where to start? Novi can help! 💜</p>
                <p className="text-purple-600 text-sm mt-1">Click "Ask Novi to help me set it up" above, or click the 💜 button to ask a question.</p>
              </div>
            </div>
          ) : (
            <>{/* ── Normal Dashboard (programs exist) ── */}
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-neutral-200 rounded-lg p-4">
                  <p className="text-xs text-neutral-500 uppercase tracking-wider">Programs</p>
                  <p className="text-2xl font-bold text-neutral-900">{summary?.programCount || 0}</p>
                </div>
                <div className="bg-white border border-neutral-200 rounded-lg p-4">
                  <p className="text-xs text-neutral-500 uppercase tracking-wider">Active Partners</p>
                  <p className="text-2xl font-bold text-emerald-600">{summary?.totalPartners || 0}</p>
                  {(summary?.totalPartners || 0) === 0 && (
                    <p className="text-xs text-neutral-400 mt-1">No active partners yet — <button onClick={openInvitePartner} className="text-purple-600 hover:underline font-medium">invite your first partner</button></p>
                  )}
                </div>
                <div className="bg-white border border-neutral-200 rounded-lg p-4">
                  <p className="text-xs text-neutral-500 uppercase tracking-wider">Total Revenue</p>
                  <p className="text-2xl font-bold text-purple-600">${((summary?.totalRevenue || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  {(summary?.totalRevenue || 0) === 0 && (
                    <p className="text-xs text-neutral-400 mt-1">$0 revenue — partners earn when you do</p>
                  )}
                </div>
                <div className="bg-white border border-neutral-200 rounded-lg p-4">
                  <p className="text-xs text-neutral-500 uppercase tracking-wider">Pending Apps</p>
                  <p className="text-2xl font-bold text-amber-600">{summary?.pendingApplications || 0}</p>
                  {(summary?.pendingApplications || 0) === 0 && (
                    <p className="text-xs text-neutral-400 mt-1">No applications — <button onClick={() => setActiveTab('programs')} className="text-purple-600 hover:underline font-medium">set up an application form</button></p>
                  )}
                </div>
              </div>

              {/* Quick Program Switcher */}
              <div className="bg-white border border-neutral-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">Programs</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {programs.map(p => {
                    const pt = PROGRAM_TYPES[p.type] || PROGRAM_TYPES.affiliate;
                    return (
                      <div
                        key={p.id}
                        onClick={() => { setActiveTab('programs'); selectProgram(p); }}
                        className="border border-neutral-200 rounded-lg p-4 cursor-pointer hover:border-purple-300 hover:shadow-sm transition-all"
                        style={{ borderLeftWidth: '4px', borderLeftColor: p.brand_color }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{pt.icon}</span>
                          <span className="font-semibold text-neutral-900">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={pt.color}>{pt.label}</Badge>
                          {p.approval_mode === 'manual' && <Badge className="bg-amber-50 text-amber-700 border-amber-200">Manual Approval</Badge>}
                        </div>
                        <div className="flex gap-4 text-sm text-neutral-500">
                          <span>{p.active_members} active</span>
                          <span>${p.total_revenue.toFixed(2)} revenue</span>
                        </div>
                      </div>
                    );
                  })}
                  <div
                    onClick={openCreateProgram}
                    className="border-2 border-dashed border-neutral-300 rounded-lg p-4 cursor-pointer hover:border-purple-300 hover:bg-purple-50/30 transition-all flex items-center justify-center min-h-[120px]"
                  >
                    <span className="text-neutral-400 font-medium">+ New Program</span>
                  </div>
                </div>
              </div>

              {/* Recent Applications */}
              {allSubmissions.filter(s => s.status === 'pending').length > 0 && (
                <div className="bg-white border border-neutral-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-neutral-900 mb-4">Pending Applications</h3>
                  <div className="space-y-2">
                    {allSubmissions.filter(s => s.status === 'pending').slice(0, 5).map(s => (
                      <div key={s.id} className="flex items-center justify-between border border-neutral-100 rounded p-3">
                        <div>
                          <p className="font-medium text-neutral-900">{s.applicant_name}</p>
                          <p className="text-sm text-neutral-500">{s.applicant_email} · {s.program_name}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleReviewSubmission(s.id, 'approved')}>Approve</Button>
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleReviewSubmission(s.id, 'rejected')}>Reject</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ PROGRAMS ═══ */}
      {activeTab === 'programs' && !selectedProgram && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SearchBar value={search} onChange={setSearch} placeholder="Search programs…" />
            <Button onClick={openCreateProgram}>+ New Program</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {programs.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase())).map(p => {
              const pt = PROGRAM_TYPES[p.type] || PROGRAM_TYPES.affiliate;
              return (
                <div
                  key={p.id}
                  onClick={() => selectProgram(p)}
                  className="bg-white border border-neutral-200 rounded-lg p-5 cursor-pointer hover:border-purple-300 hover:shadow-sm transition-all"
                  style={{ borderLeftWidth: '4px', borderLeftColor: p.brand_color }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{pt.icon}</span>
                        <h3 className="font-semibold text-neutral-900 text-lg">{p.name}</h3>
                      </div>
                      <p className="text-sm text-neutral-500 mb-3">{p.description || 'No description'}</p>
                      <div className="flex items-center gap-2">
                        <Badge className={pt.color}>{pt.label}</Badge>
                        {p.approval_mode === 'manual' && <Badge className="bg-amber-50 text-amber-700 border-amber-200">Manual Approval</Badge>}
                      </div>
                    </div>
                    <div className="text-right text-sm text-neutral-500">
                      <p>{p.active_members} active</p>
                      <p>{p.total_members} total</p>
                      <p className="font-medium text-neutral-900">${p.total_revenue.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {programs.length === 0 && (
            <EmptyState icon="🤝" title="No programs yet" description="Create your first partner program to get started." action={{ label: 'Create Program', onClick: openCreateProgram }} />
          )}
        </div>
      )}

      {/* ═════════════════════════════════════ PROGRAM DETAIL ═══ */}
      {activeTab === 'programs' && selectedProgram && (
        <div className="space-y-4">
          {/* Back + Header */}
          <div className="flex items-center gap-4">
            <button onClick={() => { setSelectedProgram(null); setProgramDetailTab('overview'); }} className="text-neutral-500 hover:text-neutral-700 text-sm">← Back to Programs</button>
            <h2 className="text-xl font-bold text-neutral-900" style={{ color: selectedProgram.brand_color }}>{selectedProgram.name}</h2>
            <Badge className={PROGRAM_TYPES[selectedProgram.type]?.color || ''}>{PROGRAM_TYPES[selectedProgram.type]?.label}</Badge>
          </div>

          {/* Detail Tabs */}
          <div className="flex max-w-full gap-2 overflow-x-auto border-b border-neutral-200 pb-2">
            {['overview', 'commission', 'applications', 'assets', 'settings', 'attribution'].map(tab => (
              <button
                key={tab}
                onClick={() => setProgramDetailTab(tab)}
                className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium rounded-t transition-colors capitalize ${
                  programDetailTab === tab
                    ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50/50'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {programDetailTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border rounded-lg p-4"><p className="text-xs text-neutral-500">Active Members</p><p className="text-xl font-bold">{selectedProgram.active_members}</p></div>
                <div className="bg-white border rounded-lg p-4"><p className="text-xs text-neutral-500">Total Revenue</p><p className="text-xl font-bold">${selectedProgram.total_revenue.toFixed(2)}</p></div>
                <div className="bg-white border rounded-lg p-4"><p className="text-xs text-neutral-500">Commission</p><p className="text-xl font-bold">{selectedProgram.default_commission_rate}%</p></div>
                <div className="bg-white border rounded-lg p-4"><p className="text-xs text-neutral-500">Approval</p><p className="text-xl font-bold capitalize">{selectedProgram.approval_mode}</p></div>
              </div>

              {/* Members List */}
              <div className="bg-white border border-neutral-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-neutral-900">Members ({members.length})</h3>
                  <Button size="sm" onClick={() => { setShowMemberModal(true); }}>+ Add Member</Button>
                </div>
                {members.length === 0 ? (
                  <NoviEmptyState
                    title="Build your first partner relationship"
                    description="Members are approved people who can share this program and earn its commission. An invite creates their program membership, connects their code, and makes attributed sales visible here. Nothing is counted until they join."
                    expression="comforting"
                    action={<Button onClick={openInvitePartner}>Invite Member</Button>}
                  >
                    <p className="mt-3 text-xs text-purple-700">Novi will keep applications, attribution, and commission exceptions together here once activity begins.</p>
                  </NoviEmptyState>
                ) : (
                  <div className="space-y-2">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center justify-between border border-neutral-100 rounded p-3">
                        <div>
                          <p className="font-medium text-neutral-900">{m.partner_name} <span className="text-neutral-400 text-xs">({m.discount_code})</span></p>
                          <p className="text-xs text-neutral-500">{m.partner_email || 'No email'} · {m.total_referrals} referrals · ${m.program_revenue.toFixed(2)} revenue</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={STATUS_COLORS[m.status]}>{m.status}</Badge>
                          {m.status === 'active' && (
                            <Button size="sm" variant="ghost" onClick={() => handleUpdateMemberStatus(m.partner_id, 'suspended')}>Suspend</Button>
                          )}
                          {m.status === 'suspended' && (
                            <Button size="sm" variant="ghost" onClick={() => handleUpdateMemberStatus(m.partner_id, 'active')}>Reactivate</Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleRemoveMember(m.partner_id)}>Remove</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Commission Tab */}
          {programDetailTab === 'commission' && (
            <div className="bg-white border border-neutral-200 rounded-lg p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Commission Rules</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b"><span className="text-neutral-500">Commission Type</span><span className="font-medium capitalize">{selectedProgram.default_commission_type}</span></div>
                <div className="flex justify-between py-2 border-b"><span className="text-neutral-500">Default Rate</span><span className="font-medium">{selectedProgram.default_commission_rate}%</span></div>
                <div className="flex justify-between py-2"><span className="text-neutral-500">Approval Mode</span><span className="font-medium capitalize">{selectedProgram.approval_mode}</span></div>
              </div>
              <p className="text-xs text-neutral-400 mt-4">Commission rules are configured per program. Advanced rules (tiered, lifetime) can be set up in the Affiliate Tools tab.</p>
            </div>
          )}

          {/* Applications Tab */}
          {programDetailTab === 'applications' && (
            <div className="space-y-4">
              <div className="bg-white border border-neutral-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-neutral-900">Application Form</h3>
                  <Button size="sm" onClick={() => {
                    if (forms.length > 0) {
                      const f = forms[0];
                      setFormBuilder({ title: f.title, description: f.description || '', fields: f.fields });
                    } else {
                      setFormBuilder({ title: '', description: '', fields: '[]' });
                    }
                    setShowFormModal(true);
                  }}>
                    {forms.length > 0 ? 'Edit Form' : 'Create Form'}
                  </Button>
                </div>
                {forms.length === 0 ? (
                  <EmptyState icon="📋" title="No application form" description="Create a form so partners can apply to join this program. You can ask for their name, social media profiles, and more." action={{ label: 'Create Form', onClick: () => {
                    setFormBuilder({ title: '', description: '', fields: '[]' });
                    setShowFormModal(true);
                  }}} />
                ) : (
                  <div>
                    <p className="font-medium">{forms[0].title}</p>
                    <p className="text-sm text-neutral-500">{forms[0].description || 'No description'}</p>
                    <p className="text-xs text-neutral-400 mt-2">{forms[0].pending_count} pending · {forms[0].total_submissions} total submissions</p>
                  </div>
                )}
              </div>

              {/* Submissions */}
              {forms.length > 0 && (
                <div className="bg-white border border-neutral-200 rounded-lg p-4">
                  <h3 className="font-semibold text-neutral-900 mb-4">Submissions</h3>
                  <button onClick={() => loadSubmissionsForForm(forms[0].id)} className="text-sm text-purple-600 mb-4 hover:underline">Refresh</button>
                  {submissions.length === 0 ? (
                    <EmptyState icon="📭" title="No submissions yet" description="Submissions will appear here when partners fill out your application form. Share your program to get the word out!" />
                  ) : (
                    <div className="space-y-2">
                      {submissions.map(s => (
                        <div key={s.id} className="flex items-center justify-between border border-neutral-100 rounded p-3">
                          <div>
                            <p className="font-medium text-neutral-900">{s.applicant_name}</p>
                            <p className="text-sm text-neutral-500">{s.applicant_email} · {new Date(s.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={STATUS_COLORS[s.status] || 'bg-gray-50 text-gray-700'}>{s.status}</Badge>
                            {s.status === 'pending' && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => handleReviewSubmission(s.id, 'approved')}>Approve</Button>
                                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleReviewSubmission(s.id, 'rejected')}>Reject</Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Assets Tab */}
          {programDetailTab === 'assets' && (
            <div className="space-y-4">
              <div className="bg-white border border-neutral-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-neutral-900">Assets ({assets.length})</h3>
                  <Button size="sm" onClick={() => setShowAssetModal(true)}>+ Add Asset</Button>
                </div>
                {assets.length === 0 ? (
                  <p className="text-sm text-neutral-400 py-8 text-center">No assets yet</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {assets.map(a => (
                      <div key={a.id} className="border border-neutral-100 rounded-lg p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{a.type === 'image' ? '🖼️' : a.type === 'video' ? '🎥' : a.type === 'document' ? '📄' : '🔗'}</span>
                          <div>
                            <p className="font-medium text-neutral-900 text-sm">{a.name}</p>
                            <p className="text-xs text-neutral-400">{a.type} · {a.download_count} downloads</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleLogDownload(a.id)} className="text-xs text-purple-600 hover:underline px-2">Download</button>
                          <button onClick={() => handleDeleteAsset(a.id)} className="text-xs text-red-500 hover:underline px-2">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Content Protection */}
              {protection && (
                <div className="bg-white border border-neutral-200 rounded-lg p-4">
                  <h3 className="font-semibold text-neutral-900 mb-4">Content Protection</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!protection.watermark_enabled} onChange={() => setProtection({ ...protection, watermark_enabled: protection.watermark_enabled ? 0 : 1 })} />
                      <span className="text-sm">Enable Watermark</span>
                    </label>
                    {!!protection.watermark_enabled && (
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">Watermark Text</label>
                        <input type="text" value={protection.watermark_text} onChange={e => setProtection({ ...protection, watermark_text: e.target.value })} className="border rounded px-2 py-1 text-sm w-full" />
                      </div>
                    )}
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!protection.download_logging_enabled} onChange={() => setProtection({ ...protection, download_logging_enabled: protection.download_logging_enabled ? 0 : 1 })} />
                      <span className="text-sm">Log All Downloads</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!protection.viewer_overlay_enabled} onChange={() => setProtection({ ...protection, viewer_overlay_enabled: protection.viewer_overlay_enabled ? 0 : 1 })} />
                      <span className="text-sm">Show Viewer Overlay</span>
                    </label>
                    {!!protection.viewer_overlay_enabled && (
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">Overlay Message</label>
                        <input type="text" value={protection.viewer_overlay_message} onChange={e => setProtection({ ...protection, viewer_overlay_message: e.target.value })} className="border rounded px-2 py-1 text-sm w-full" />
                      </div>
                    )}
                    <Button size="sm" onClick={handleSaveProtection}>Save Protection</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {programDetailTab === 'settings' && (
            <div className="bg-white border border-neutral-200 rounded-lg p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Program Settings</h3>
              <div className="space-y-4 max-w-lg">
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-1">Name</label>
                  <input type="text" value={programForm.name} onChange={e => setProgramForm({ ...programForm, name: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" />
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-1">Description</label>
                  <textarea value={programForm.description} onChange={e => setProgramForm({ ...programForm, description: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" rows={2} />
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-1">Brand Color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={programForm.brand_color} onChange={e => setProgramForm({ ...programForm, brand_color: e.target.value })} className="w-10 h-10 rounded border cursor-pointer" />
                    <input type="text" value={programForm.brand_color} onChange={e => setProgramForm({ ...programForm, brand_color: e.target.value })} className="border rounded px-3 py-2 text-sm flex-1" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-1">Approval Mode</label>
                  <select value={programForm.approval_mode} onChange={e => setProgramForm({ ...programForm, approval_mode: e.target.value })} className="border rounded px-3 py-2 text-sm w-full">
                    <option value="auto">Auto (immediate approval)</option>
                    <option value="manual">Manual (review required)</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSaveProgram} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>
                  <Button variant="ghost" className="text-red-600" onClick={() => handleDeleteProgram(selectedProgram.id)}>Delete Program</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


          {/* Attribution Tab */}
          {programDetailTab === 'attribution' && (
            <div className="space-y-4">
              {/* Rules Panel */}
              <div className="bg-white border border-neutral-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-neutral-900">Attribution Rules</h3>
                  <Button size="sm" onClick={() => { loadAttributionRules(selectedProgram?.id); loadCommissionConfig(selectedProgram?.id); }}>Refresh</Button>
                </div>
                {attributionRules ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">Tracking window (hours)</label>
                        <input type="number" value={attributionRules.cookie_duration_hours} onChange={e => setAttributionRules({ ...attributionRules, cookie_duration_hours: parseInt(e.target.value) || 720 })} className="border rounded px-2 py-1 text-sm w-full" />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">How partners earn credit</label>
                        <select value={attributionRules.attribution_model} onChange={e => setAttributionRules({ ...attributionRules, attribution_model: e.target.value })} className="border rounded px-2 py-1 text-sm w-full">
                          <option value="last_click">Last click gets credit</option>
                          <option value="first_click">First click gets credit</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!attributionRules.coupon_overrides_referral} onChange={e => setAttributionRules({ ...attributionRules, coupon_overrides_referral: e.target.checked ? 1 : 0 })} /><span className="text-sm">Coupons override partner referrals</span></label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!attributionRules.allow_self_referrals} onChange={e => setAttributionRules({ ...attributionRules, allow_self_referrals: e.target.checked ? 1 : 0 })} /><span className="text-sm">Allow self-referrals</span></label>
                    </div>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={!!attributionRules.require_fulfillment} onChange={e => setAttributionRules({ ...attributionRules, require_fulfillment: e.target.checked ? 1 : 0 })} /><span className="text-sm">Require fulfillment before commission</span></label>
                    {!!attributionRules.require_return_window && (
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">Return Window (days)</label>
                        <input type="number" value={attributionRules.return_window_days} onChange={e => setAttributionRules({ ...attributionRules, return_window_days: parseInt(e.target.value) || 30 })} className="border rounded px-2 py-1 text-sm w-32" />
                      </div>
                    )}
                    <label className="flex items-center gap-2"><input type="checkbox" checked={!!attributionRules.repeat_customer_orders_qualify} onChange={e => setAttributionRules({ ...attributionRules, repeat_customer_orders_qualify: e.target.checked ? 1 : 0 })} /><span className="text-sm">Repeat customer orders qualify</span></label>
                    <Button size="sm" onClick={handleSaveAttributionRules} disabled={attrSaving}>{attrSaving ? 'Saving...' : 'Save Rules'}</Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => loadAttributionRules(selectedProgram?.id)}>Load Rules</Button>
                  </div>
                )}
              </div>

              {/* Commission Config */}
              <div className="bg-white border border-neutral-200 rounded-lg p-4">
                <h3 className="font-semibold text-neutral-900 mb-4">Commission Configuration</h3>
                {commissionConfig ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!commissionConfig.exclude_shipping} onChange={e => setCommissionConfig({ ...commissionConfig, exclude_shipping: e.target.checked ? 1 : 0 })} /><span className="text-sm">Exclude Shipping</span></label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!commissionConfig.exclude_taxes} onChange={e => setCommissionConfig({ ...commissionConfig, exclude_taxes: e.target.checked ? 1 : 0 })} /><span className="text-sm">Exclude Taxes</span></label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!commissionConfig.exclude_discounts} onChange={e => setCommissionConfig({ ...commissionConfig, exclude_discounts: e.target.checked ? 1 : 0 })} /><span className="text-sm">Exclude Discounts</span></label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!commissionConfig.exclude_gift_cards} onChange={e => setCommissionConfig({ ...commissionConfig, exclude_gift_cards: e.target.checked ? 1 : 0 })} /><span className="text-sm">Exclude Gift Cards</span></label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!commissionConfig.exclude_tips} onChange={e => setCommissionConfig({ ...commissionConfig, exclude_tips: e.target.checked ? 1 : 0 })} /><span className="text-sm">Exclude Tips</span></label>
                    </div>
                    <Button size="sm" onClick={handleSaveCommissionConfig} disabled={attrSaving}>{attrSaving ? 'Saving...' : 'Save Config'}</Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => loadCommissionConfig(selectedProgram?.id)}>Load Config</Button>
                )}
              </div>

              {/* Recent Attributions */}
              <div className="bg-white border border-neutral-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-neutral-900">Recent Attributions</h3>
                  <Button size="sm" onClick={() => loadAttributions(selectedProgram?.id)}>Refresh</Button>
                </div>
                {attributions.length === 0 ? (
                  <p className="text-sm text-neutral-400 py-4 text-center">No attributions yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-neutral-500"><th className="py-2 px-2">Order</th><th className="py-2 px-2">Affiliate</th><th className="py-2 px-2">Method</th><th className="py-2 px-2">Eligible</th><th className="py-2 px-2">Commission</th><th className="py-2 px-2">Status</th><th className="py-2 px-2"></th></tr></thead>
                      <tbody>
                        {attributions.slice(0, 20).map(a => (
                          <tr key={a.id} className="border-b hover:bg-neutral-50">
                            <td className="py-2 px-2 font-medium">#{a.shopify_order_number}</td>
                            <td className="py-2 px-2">{a.affiliate_name}</td>
                            <td className="py-2 px-2"><span className="text-xs bg-neutral-100 px-1.5 py-0.5 rounded">{a.attribution_method}</span></td>
                            <td className="py-2 px-2">${(a.eligible_amount_cents / 100).toFixed(2)}</td>
                            <td className="py-2 px-2 font-medium">${(a.commission_cents / 100).toFixed(2)}</td>
                            <td className="py-2 px-2"><Badge className={a.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : a.status === 'pending' ? 'bg-amber-50 text-amber-700' : a.status === 'reversed' ? 'bg-red-50 text-red-700' : a.status === 'disputed' ? 'bg-orange-50 text-orange-700' : 'bg-gray-50 text-gray-700'}>{a.status}</Badge></td>
                            <td className="py-2 px-2">{a.status !== 'reversed' && <button onClick={() => handleReverseAttribution(a.id)} className="text-xs text-red-500 hover:underline">Reverse</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pending Review */}
              <div className="bg-white border border-neutral-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-neutral-900">Pending Review ({pendingAttributions.length})</h3>
                  <Button size="sm" onClick={loadPendingAttributions}>Refresh</Button>
                </div>
                {pendingAttributions.length === 0 ? (
                  <p className="text-sm text-neutral-400 py-4 text-center">No pending attributions</p>
                ) : (
                  <div className="space-y-2">
                    {pendingAttributions.map(a => (
                      <div key={a.id} className="flex items-center justify-between border border-neutral-100 rounded p-3">
                        <div>
                          <p className="font-medium text-neutral-900">#{a.shopify_order_number} · {a.affiliate_name}</p>
                          <p className="text-xs text-neutral-500">${(a.eligible_amount_cents / 100).toFixed(2)} eligible · {a.attribution_method} · {new Date(a.created_at).toLocaleDateString()}</p>
                          {a.is_self_referral ? <p className="text-xs text-amber-600 mt-1">⚠ Self-referral detected</p> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-amber-50 text-amber-700">{a.status}</Badge>
                          <button onClick={() => handleReverseAttribution(a.id)} className="text-xs text-red-500 hover:underline">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual Attribution */}
              <div className="bg-white border border-neutral-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-neutral-900">Manual Attribution</h3>
                  <Button size="sm" onClick={() => setShowManualAttrModal(true)}>+ Manual Attribution</Button>
                </div>
              </div>
            </div>
          )}
      {/* ════════════════════════════════════════════ APPLICATIONS ═══ */}
      {activeTab === 'applications' && (
        <div className="bg-white border border-neutral-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">All Applications ({allSubmissions.filter(s => s.status === 'pending').length} pending)</h3>
          {allSubmissions.length === 0 ? (
            <EmptyState icon="📝" title="No applications yet" description="Create an application form so partners can apply to your programs." action={{ label: 'Go to Programs', onClick: () => setActiveTab('programs') }} />
          ) : (
            <div className="space-y-2">
              {allSubmissions.map(s => (
                <div key={s.id} className="flex items-center justify-between border border-neutral-100 rounded p-3">
                  <div>
                    <p className="font-medium text-neutral-900">{s.applicant_name}</p>
                    <p className="text-sm text-neutral-500">{s.applicant_email} · {s.program_name} · {new Date(s.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_COLORS[s.status] || 'bg-gray-50 text-gray-700'}>{s.status}</Badge>
                    {s.status === 'pending' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleReviewSubmission(s.id, 'approved')}>Approve</Button>
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleReviewSubmission(s.id, 'rejected')}>Reject</Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════ CONTENT VAULT ═══ */}
      {activeTab === 'content-vault' && (
        <div className="space-y-4">
          <div className="bg-white border border-neutral-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Content Vault ({allAssets.length} assets)</h3>
            {allAssets.length === 0 ? (
              <EmptyState icon="🗂️" title="No assets yet" description="Add marketing resources like banners and logos for your partners to share." action={{ label: 'Go to Programs', onClick: () => setActiveTab('programs') }} />
            ) : (
              <div className="space-y-4">
                {/* Group by program */}
                {Object.entries(
                  allAssets.reduce((acc, a) => {
                    const key = a.program_name || 'Unknown';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(a);
                    return acc;
                  }, {} as Record<string, ProgramAsset[]>)
                ).map(([programName, programAssets]) => (
                  <div key={programName}>
                    <h4 className="font-medium text-neutral-700 mb-2">{programName}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {programAssets.map(a => (
                        <div key={a.id} className="border border-neutral-100 rounded-lg p-3 flex items-center gap-3">
                          <span className="text-2xl">{a.type === 'image' ? '🖼️' : a.type === 'video' ? '🎥' : a.type === 'document' ? '📄' : '🔗'}</span>
                          <div>
                            <p className="font-medium text-neutral-900 text-sm">{a.name}</p>
                            <p className="text-xs text-neutral-400">{a.download_count} downloads {a.is_watermarked ? '· watermarked' : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════ AFFILIATE TOOLS ═══ */}
      {activeTab === 'affiliates' && (
        <div className="bg-white border border-neutral-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">Affiliate Tools</h3>
          <p className="text-sm text-neutral-500 mb-4">Program-scoped affiliate tools. Use the program filter to scope wallets, coupons, fraud, goals, and toolkit per program.</p>

          {/* Program Filter */}
          <div className="mb-4">
            <label className="text-sm font-medium text-neutral-700 block mb-1">Scope to Program</label>
            <select className="border rounded px-3 py-2 text-sm w-64" onChange={e => {
              if (e.target.value) {
                const prog = programs.find(p => p.id === parseInt(e.target.value));
                if (prog) selectProgram(prog);
              }
            }}>
              <option value="">All Programs</option>
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {selectedProgram ? (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">
                Showing affiliate tools scoped to <strong style={{ color: selectedProgram.brand_color }}>{selectedProgram.name}</strong> ({members.length} members)
              </p>
              {/* Members quick view */}
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between border border-neutral-100 rounded p-2 text-sm">
                    <span>{m.partner_name} ({m.discount_code})</span>
                    <span className="text-neutral-500">{m.total_referrals} refs · ${m.program_revenue.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-400 py-4">Select a program above to see its affiliate tools.</p>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════ MODALS ═══ */}

      {/* Invite Partner Modal */}
      <Modal open={showInviteModal} onClose={() => setShowInviteModal(false)} title="Invite a Partner">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Email Address *</label>
            <input type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" placeholder="partner@example.com" />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Program *</label>
            <select value={inviteForm.program_id} onChange={e => setInviteForm({ ...inviteForm, program_id: e.target.value })} className="border rounded px-3 py-2 text-sm w-full">
              <option value="">Choose a program…</option>
              {programs.map(p => (
                <option key={p.id} value={p.id}>{PROGRAM_TYPES[p.type]?.icon} {p.name}</option>
              ))}
            </select>
            {programs.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">You need to create a program first before inviting partners.</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Personal Message (optional)</label>
            <textarea value={inviteForm.message} onChange={e => setInviteForm({ ...inviteForm, message: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" rows={3} placeholder="Hey! I'd love for you to join my affiliate program…" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowInviteModal(false)}>Cancel</Button>
            <Button onClick={handleInvitePartner} disabled={inviteSaving}>{inviteSaving ? 'Sending…' : 'Send Invitation'}</Button>
          </div>
        </div>
      </Modal>

      {/* Program Create/Edit Modal */}
      <Modal open={showProgramModal} onClose={() => setShowProgramModal(false)} title={editingProgram ? 'Edit Program' : 'New Program'}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Program Name *</label>
            <input type="text" value={programForm.name} onChange={e => setProgramForm({ ...programForm, name: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" placeholder="e.g. VIP Affiliate Program" />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Type</label>
            <select value={programForm.type} onChange={e => setProgramForm({ ...programForm, type: e.target.value })} className="border rounded px-3 py-2 text-sm w-full">
              {Object.entries(PROGRAM_TYPES).map(([key, val]) => (
                <option key={key} value={key}>{val.icon} {val.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Description</label>
            <textarea value={programForm.description} onChange={e => setProgramForm({ ...programForm, description: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-neutral-700 block mb-1">Commission Rate (%)</label>
              <input type="number" value={programForm.default_commission_rate} onChange={e => setProgramForm({ ...programForm, default_commission_rate: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" min="0" max="100" step="0.1" />
            </div>
            <div>
              <label className="text-sm font-medium text-neutral-700 block mb-1">Approval Mode</label>
              <select value={programForm.approval_mode} onChange={e => setProgramForm({ ...programForm, approval_mode: e.target.value })} className="border rounded px-3 py-2 text-sm w-full">
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Brand Color</label>
            <input type="color" value={programForm.brand_color} onChange={e => setProgramForm({ ...programForm, brand_color: e.target.value })} className="w-full h-10 rounded border cursor-pointer" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowProgramModal(false)}>Cancel</Button>
            <Button onClick={handleSaveProgram} disabled={saving}>{saving ? 'Saving…' : 'Save Program'}</Button>
          </div>
        </div>
      </Modal>

      {/* Add Member Modal */}
      <Modal open={showMemberModal} onClose={() => setShowMemberModal(false)} title="Add Member">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Select Partner *</label>
            <select value={memberForm.partner_id} onChange={e => setMemberForm({ ...memberForm, partner_id: e.target.value })} className="border rounded px-3 py-2 text-sm w-full">
              <option value="">Choose a partner…</option>
              {affiliates.filter(a => !members.some(m => m.partner_id === a.id)).map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.discount_code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Custom Commission Rate (%)</label>
            <input type="number" value={memberForm.custom_commission_rate} onChange={e => setMemberForm({ ...memberForm, custom_commission_rate: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" placeholder="Leave empty for default" min="0" max="100" step="0.1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowMemberModal(false)}>Cancel</Button>
            <Button onClick={handleAddMember} disabled={saving}>{saving ? 'Adding…' : 'Add Member'}</Button>
          </div>
        </div>
      </Modal>

      {/* Add Asset Modal */}
      <Modal open={showAssetModal} onClose={() => setShowAssetModal(false)} title="Add Asset">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Name *</label>
            <input type="text" value={assetForm.name} onChange={e => setAssetForm({ ...assetForm, name: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Type</label>
            <select value={assetForm.type} onChange={e => setAssetForm({ ...assetForm, type: e.target.value })} className="border rounded px-3 py-2 text-sm w-full">
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="document">Document</option>
              <option value="link">Link</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">URL *</label>
            <input type="text" value={assetForm.url} onChange={e => setAssetForm({ ...assetForm, url: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" placeholder="https://…" />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!assetForm.is_watermarked} onChange={e => setAssetForm({ ...assetForm, is_watermarked: e.target.checked ? 1 : 0 })} />
            <span className="text-sm">Watermarked</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowAssetModal(false)}>Cancel</Button>
            <Button onClick={handleSaveAsset} disabled={saving}>{saving ? 'Adding…' : 'Add Asset'}</Button>
          </div>
        </div>
      </Modal>

      {/* Application Form Builder Modal */}
      <Modal open={showFormModal} onClose={() => setShowFormModal(false)} title="Application Form">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Title *</label>
            <input type="text" value={formBuilder.title} onChange={e => setFormBuilder({ ...formBuilder, title: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Description</label>
            <textarea value={formBuilder.description} onChange={e => setFormBuilder({ ...formBuilder, description: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" rows={2} />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1">Fields (JSON)</label>
            <textarea
              value={formBuilder.fields}
              onChange={e => setFormBuilder({ ...formBuilder, fields: e.target.value })}
              className="border rounded px-3 py-2 text-sm w-full font-mono"
              rows={8}
              placeholder='[{"label":"Social Media URL","type":"url","required":true}]'
            />
            <p className="text-xs text-neutral-400 mt-1">JSON array of field objects: label, type (text|email|url|textarea|file|select), required, options[]</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowFormModal(false)}>Cancel</Button>
            <Button onClick={handleSaveForm} disabled={saving}>{saving ? 'Saving…' : 'Save Form'}</Button>
          </div>
        </div>
      </Modal>

      {/* Novi Contextual Panel */}
      <NoviContextualPanel />

      {/* Ask Novi floating button */}
      <button
        onClick={() => setNoviPanelOpen(!noviPanelOpen)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 bg-purple-500 text-white rounded-full shadow-lg hover:bg-purple-600 hover:shadow-xl transition-all flex items-center justify-center text-xl"
        title="Ask Novi"
      >
        💜
      </button>
    </div>
  );
}
