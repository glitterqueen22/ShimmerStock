import { useState, useEffect } from 'react';
import { PageHeader, Tabs, Badge, Button, Modal, SearchBar, EmptyState, ProgressBar, useToast } from '../components/ui';
import { apiGet, apiPost, apiPut } from '../lib/api';
import Novi from '../components/Novi';

// ── Types ──────────────────────────────────────────────────────────
interface Wallet {
  id: number;
  affiliateId: number;
  balanceCents: number;
  balanceDollars: number;
  lifetimeEarnedCents: number;
  lifetimeEarnedDollars: number;
  transactions: WalletTransaction[];
}

interface WalletTransaction {
  id: number;
  orderId: number | null;
  amountCents: number;
  amountDollars: number;
  type: 'earned' | 'redeemed' | 'adjusted' | 'payout';
  description: string | null;
  createdAt: string;
}

interface Affiliate {
  id: number;
  name: string;
  email: string | null;
  discount_code: string;
  discount_type: string;
  discount_value: number;
  commission_rate: number;
  store_credit_balance: number;
  total_referrals: number;
  total_revenue_generated: number;
  is_active: number;
  notes: string | null;
  created_at: string;
  referral_count: number;
  wallet_balance_cents?: number;
  referrals?: Referral[];
}

interface Referral {
  id: number;
  affiliate_id: number;
  order_id: number;
  discount_amount: number;
  commission_earned: number;
  store_credit_issued: number;
  status: string;
  created_at: string;
  affiliate_name: string;
  discount_code: string;
  order_number: number;
  customer_name: string;
  customer_email: string;
  order_total: number;
}

interface DashboardData {
  totalAffiliates: number;
  activeAffiliates: number;
  monthReferrals: number;
  monthCommission: number;
  pendingPayouts: number;
  activeChallenges: number;
  pendingFraudFlags: number;
  leaderboardPreview: LeaderboardItem[];
  recentActivity: Referral[];
}

interface LeaderboardItem {
  id: number;
  name: string;
  discount_code: string;
  is_active: number;
  referral_count: number;
  total_commissions: number;
  wallet_balance_cents: number;
  walletBalanceDollars: number;
}

interface EarningsEntry {
  id: number;
  commission_earned: number;
  store_credit_issued: number;
  discount_amount: number;
  status: string;
  created_at: string;
  order_number: number;
  customer_name: string;
  customer_email: string;
  order_total: number;
}

interface Coupon {
  id: number;
  affiliate_id: number;
  code: string;
  amount_cents: number;
  status: string;
  created_at: string;
}

interface RewardSettings {
  businessId: number;
  rewardType: string;
  config: Record<string, any>;
}

interface CommissionRules {
  businessId: number;
  commissionType: string;
  rate: number;
  options: Record<string, any>;
}

interface FraudFlag {
  id: number;
  business_id: number;
  affiliate_id: number | null;
  order_id: number | null;
  flag_type: string;
  details: string;
  status: string;
  affiliate_name: string | null;
  discount_code: string | null;
  order_number: number | null;
  created_at: string;
}

interface Goal {
  id: number;
  affiliate_id: number;
  business_id: number;
  title: string;
  target: number;
  current: number;
  reward: string | null;
  status: string;
  created_at: string;
}

interface Toolkit {
  affiliateId: number;
  affiliateName: string;
  referralLink: string;
  couponCode: string;
  linkClicks: number;
  conversions: number;
  revenueGeneratedCents: number;
  revenueGeneratedDollars: number;
}

interface Payout {
  id: number;
  affiliate_id: number;
  amount: number;
  method: string;
  status: string;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  affiliate_name: string;
  discount_code: string;
}

interface PayoutSummary {
  pending: any[];
  totalPending: number;
  totalPaid: number;
  allPayouts: Payout[];
}

// ── Constants ──────────────────────────────────────────────────────
const REWARD_TYPES = [
  { value: 'store_credit', label: 'Store Credit' },
  { value: 'cash', label: 'Cash Payout' },
  { value: 'gift_card', label: 'Gift Cards' },
  { value: 'points', label: 'Points System' },
  { value: 'custom', label: 'Custom Rewards' },
];

const COMMISSION_TYPES = [
  { value: 'percentage', label: 'Percentage of Order' },
  { value: 'flat', label: 'Flat Amount per Order' },
  { value: 'tiered', label: 'Tiered (Volume-Based)' },
  { value: 'lifetime', label: 'Lifetime Commission' },
];

// ── Status badges ───────────────────────────────────────────────────
function txnColor(type: string) {
  switch (type) {
    case 'earned': return 'text-emerald-600';
    case 'redeemed': return 'text-rose-600';
    case 'adjusted': return 'text-amber-600';
    case 'payout': return 'text-blue-600';
    default: return 'text-neutral-600';
  }
}

function txnIcon(type: string) {
  switch (type) {
    case 'earned': return '+';
    case 'redeemed': return '-';
    case 'adjusted': return '~';
    case 'payout': return '↓';
    default: return '';
  }
}

// ── Component ──────────────────────────────────────────────────────
export default function Affiliates() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [, setLoading] = useState(true);

  // Dashboard
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  // Affiliates list
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [search, setSearch] = useState('');

  // Detail modal
  const [detailAffiliate, setDetailAffiliate] = useState<Affiliate | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailTab, setDetailTab] = useState('overview');

  // Wallet
  const [wallet, setWallet] = useState<Wallet | null>(null);

  // Earnings
  const [earnings, setEarnings] = useState<EarningsEntry[]>([]);

  // Coupons
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponAmount, setCouponAmount] = useState('25');
  const [generatedCoupon, setGeneratedCoupon] = useState<Coupon | null>(null);

  // Goals
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('10');
  const [goalReward, setGoalReward] = useState('25 store credit');

  // Toolkit
  const [toolkit, setToolkit] = useState<Toolkit | null>(null);

  // Payouts
  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary | null>(null);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAffiliateId, setPayoutAffiliateId] = useState<number | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('store_credit');

  // Rules
  const [rewardSettings, setRewardSettings] = useState<RewardSettings | null>(null);
  const [commissionRules, setCommissionRules] = useState<CommissionRules | null>(null);

  // Fraud
  const [fraudFlags, setFraudFlags] = useState<FraudFlag[]>([]);

  // Create/edit affiliate
  const [showAffModal, setShowAffModal] = useState(false);
  const [editingAffiliate, setEditingAffiliate] = useState<Affiliate | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDiscountType, setFormDiscountType] = useState('percentage');
  const [formDiscountValue, setFormDiscountValue] = useState('10');
  const [formCommissionRate, setFormCommissionRate] = useState('5');
  const [formNotes, setFormNotes] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────
  async function loadDashboard() {
    try {
      const data = await apiGet<DashboardData>('/api/affiliates/dashboard');
      setDashboard(data);
    } catch (_) {}
  }

  async function loadAffiliates() {
    try {
      const data = await apiGet<Affiliate[]>('/api/affiliates');
      setAffiliates(data);
    } catch (_) {}
  }

  async function loadPayouts() {
    try {
      const data = await apiGet<PayoutSummary>('/api/affiliates/payouts/summary');
      setPayoutSummary(data);
    } catch (_) {}
  }

  async function loadRewardSettings() {
    try {
      const data = await apiGet<RewardSettings>('/api/affiliates/reward-settings');
      setRewardSettings(data);
    } catch (_) {}
  }

  async function loadCommissionRules() {
    try {
      const data = await apiGet<CommissionRules>('/api/affiliates/commission-rules');
      setCommissionRules(data);
    } catch (_) {}
  }

  async function loadFraudFlags() {
    try {
      const data = await apiGet<FraudFlag[]>('/api/affiliates/fraud-check');
      setFraudFlags(data);
    } catch (_) {}
  }

  function loadTab(tab: string) {
    switch (tab) {
      case 'dashboard': loadDashboard(); loadAffiliates(); break;
      case 'affiliates': loadAffiliates(); break;
      case 'payouts': loadPayouts(); break;
      case 'rules': loadRewardSettings(); loadCommissionRules(); break;
      case 'fraud': loadFraudFlags(); break;
    }
  }

  useEffect(() => { loadAll(); }, []);
  function loadAll() {
    setLoading(true);
    loadDashboard();
    loadAffiliates();
    loadPayouts();
    loadRewardSettings();
    loadCommissionRules();
    loadFraudFlags();
    setLoading(false);
  }

  // ── Detail helpers ───────────────────────────────────────────────
  async function openDetail(affId: number) {
    try {
      const aff = await apiGet<Affiliate>(`/api/affiliates/${affId}`);
      setDetailAffiliate(aff);
      setDetailTab('overview');
      setShowDetail(true);
      setGeneratedCoupon(null);
      // Load all detail data
      loadWallet(affId);
      loadEarnings(affId);
      loadCoupons(affId);
      loadGoals(affId);
      loadToolkit(affId);
    } catch (e: any) {
      toast(e?.message || 'Failed to load details', 'error');
    }
  }

  async function loadWallet(affId: number) {
    try { setWallet(await apiGet<Wallet>(`/api/affiliates/${affId}/wallet`)); } catch (_) {}
  }

  async function loadEarnings(affId: number) {
    try { setEarnings(await apiGet<EarningsEntry[]>(`/api/affiliates/${affId}/earnings`)); } catch (_) {}
  }

  async function loadCoupons(affId: number) {
    try { setCoupons(await apiGet<Coupon[]>(`/api/affiliates/${affId}/coupons`)); } catch (_) {}
  }

  async function loadGoals(affId: number) {
    try { setGoals(await apiGet<Goal[]>(`/api/affiliates/${affId}/goals`)); } catch (_) {}
  }

  async function loadToolkit(affId: number) {
    try { setToolkit(await apiGet<Toolkit>(`/api/affiliates/${affId}/toolkit`)); } catch (_) {}
  }

  // ── Handlers ─────────────────────────────────────────────────────

  // Affiliate CRUD
  function openCreate() {
    setEditingAffiliate(null);
    setFormName(''); setFormEmail(''); setFormCode('');
    setFormDiscountType('percentage'); setFormDiscountValue('10');
    setFormCommissionRate('5'); setFormNotes(''); setFormIsActive(true);
    setShowAffModal(true);
  }

  function openEdit(aff: Affiliate) {
    setEditingAffiliate(aff);
    setFormName(aff.name); setFormEmail(aff.email || ''); setFormCode(aff.discount_code);
    setFormDiscountType(aff.discount_type); setFormDiscountValue(String(aff.discount_value));
    setFormCommissionRate(String(aff.commission_rate)); setFormNotes(aff.notes || '');
    setFormIsActive(!!aff.is_active);
    setShowAffModal(true);
  }

  async function handleSaveAffiliate() {
    if (!formName.trim() || !formCode.trim()) {
      toast('Name and discount code are required', 'error'); return;
    }
    setSaving(true);
    try {
      if (editingAffiliate) {
        await apiPut(`/api/affiliates/${editingAffiliate.id}`, {
          name: formName.trim(), email: formEmail.trim() || null,
          discountCode: formCode.trim().toUpperCase(), discountType: formDiscountType,
          discountValue: parseFloat(formDiscountValue), commissionRate: parseFloat(formCommissionRate),
          notes: formNotes.trim() || null, isActive: formIsActive,
        });
        toast('Affiliate updated', 'success');
      } else {
        await apiPost('/api/affiliates', {
          name: formName.trim(), email: formEmail.trim() || null,
          discountCode: formCode.trim().toUpperCase(), discountType: formDiscountType,
          discountValue: parseFloat(formDiscountValue), commissionRate: parseFloat(formCommissionRate),
          notes: formNotes.trim() || null,
        });
        toast('Affiliate created', 'success');
      }
      setShowAffModal(false);
      loadAll();
    } catch (e: any) {
      toast(e?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  }

  // Coupon generation
  async function handleGenerateCoupon() {
    if (!detailAffiliate) return;
    const amt = parseFloat(couponAmount);
    if (!amt || amt < 5) { toast('Minimum $5', 'error'); return; }
    if (wallet && amt > wallet.balanceDollars) { toast('Insufficient balance', 'error'); return; }
    setSaving(true);
    try {
      const result = await apiPost<{ coupon: Coupon }>(`/api/affiliates/${detailAffiliate.id}/coupons`, { amountDollars: amt });
      setGeneratedCoupon(result.coupon);
      toast(`Coupon ${result.coupon.code} generated`, 'success');
      loadWallet(detailAffiliate.id);
      loadCoupons(detailAffiliate.id);
    } catch (e: any) {
      toast(e?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  }

  // Goal creation
  async function handleCreateGoal() {
    if (!detailAffiliate || !goalTitle.trim()) { toast('Title required', 'error'); return; }
    setSaving(true);
    try {
      await apiPost(`/api/affiliates/${detailAffiliate.id}/goals`, {
        title: goalTitle.trim(), target: parseInt(goalTarget), reward: goalReward,
      });
      toast('Goal created', 'success');
      setShowGoalModal(false);
      setGoalTitle(''); setGoalTarget('10'); setGoalReward('25 store credit');
      loadGoals(detailAffiliate.id);
    } catch (e: any) {
      toast(e?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  }

  // Commission rules update
  async function handleSaveCommissionRules() {
    if (!commissionRules) return;
    setSaving(true);
    try {
      const result = await apiPut<{ rules: CommissionRules }>('/api/affiliates/commission-rules', commissionRules);
      setCommissionRules(result.rules);
      toast('Rules saved', 'success');
    } catch (e: any) {
      toast(e?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  }

  // Reward settings update
  async function handleSaveRewardSettings() {
    if (!rewardSettings) return;
    setSaving(true);
    try {
      const result = await apiPut<{ settings: RewardSettings }>('/api/affiliates/reward-settings', rewardSettings);
      setRewardSettings(result.settings);
      toast('Settings saved', 'success');
    } catch (e: any) {
      toast(e?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  }

  // Payout
  async function handleIssuePayout(affId: number) {
    const amt = parseFloat(payoutAmount);
    if (!amt || amt <= 0) { toast('Enter positive amount', 'error'); return; }
    setSaving(true);
    try {
      await apiPost(`/api/affiliates/${affId}/payout`, {
        amount: amt, method: payoutMethod, status: 'paid',
      });
      toast(`$${amt.toFixed(2)} payout issued`, 'success');
      setShowPayoutModal(false);
      loadPayouts(); loadDashboard(); loadAffiliates();
    } catch (e: any) {
      toast(e?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  }

  // Fraud review
  async function handleFraudReview(flagId: number, status: string) {
    try {
      await apiPost(`/api/affiliates/fraud-flags/${flagId}/review`, { status });
      toast(`Flag ${status}`, 'success');
      loadFraudFlags();
    } catch (e: any) {
      toast(e?.message || 'Failed', 'error');
    }
  }

  // ── Filtering ────────────────────────────────────────────────────
  const filteredAffiliates = search
    ? affiliates.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.discount_code.toLowerCase().includes(search.toLowerCase()) ||
        (a.email && a.email.toLowerCase().includes(search.toLowerCase()))
      )
    : affiliates;

  // ── Compute wallet-based stats ───────────────────────────────────
  const totalWalletBalance = affiliates.reduce((sum, a) => sum + (a.wallet_balance_cents || 0), 0) / 100;

  // ── Tabs ─────────────────────────────────────────────────────────
  const TABS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'affiliates', label: 'Affiliates' },
    { id: 'payouts', label: 'Payouts' },
    { id: 'rules', label: 'Rules' },
    { id: 'fraud', label: `Fraud${fraudFlags.filter(f => f.status === 'pending').length > 0 ? ` (${fraudFlags.filter(f => f.status === 'pending').length})` : ''}` },
  ];

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Affiliate HQ"
        description="Grow through advocates — manage affiliates, rewards, and commissions"
        novi={<Novi size="sm" accessory="affiliate" />}
        actions={
          <Button variant="primary" onClick={openCreate}>+ New Affiliate</Button>
        }
      />

      {/* ── Stats Bar ─────────────────────────────────────────────── */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatBox value={dashboard.totalAffiliates} label="Affiliates" />
          <StatBox value={dashboard.activeAffiliates} label="Active" color="emerald" />
          <StatBox value={dashboard.monthReferrals} label="Referrals (30d)" color="rose" />
          <StatBox value={`$${totalWalletBalance.toFixed(0)}`} label="Wallet Balance" color="amber" />
          <StatBox value={`$${(dashboard.monthCommission || 0).toFixed(0)}`} label="Commission (30d)" color="emerald" />
          <StatBox value={`$${(dashboard.pendingPayouts || 0).toFixed(0)}`} label="Pending Payouts" color="amber" />
          {dashboard.pendingFraudFlags > 0 && (
            <StatBox value={dashboard.pendingFraudFlags} label="Flags" color="red" />
          )}
        </div>
      )}

      <Tabs tabs={TABS} activeTab={activeTab} onTabChange={(t) => { setActiveTab(t); loadTab(t); }} />

      {/* ═══════════════════════════════════════════════════════════════
          TAB: DASHBOARD
          ════════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && dashboard && (
        <div className="space-y-6">
          {/* Leaderboard preview */}
          <div>
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">🏆 Top Performers (30 days)</h3>
            {dashboard.leaderboardPreview.length === 0 ? (
              <div className="p-6 bg-white rounded-xl border text-center text-neutral-400 text-sm">No referral activity yet</div>
            ) : (
              <div className="space-y-2">
                {dashboard.leaderboardPreview.map((entry, idx) => (
                  <div key={entry.id}
                    className={`flex items-center gap-4 p-3 rounded-xl border cursor-pointer hover:shadow-sm transition-shadow ${
                      idx === 0 ? 'bg-amber-50 border-amber-200' : idx === 1 ? 'bg-gray-50 border-gray-200' : idx === 2 ? 'bg-orange-50 border-orange-200' : 'bg-white border-neutral-200'}`}
                    onClick={() => openDetail(entry.id)}>
                    <span className="text-xl w-8 text-center">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-800 text-sm">{entry.name}</p>
                      <span className="font-mono text-xs text-rose-500">{entry.discount_code}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-neutral-800">{entry.referral_count}</p>
                      <p className="text-xs text-neutral-400">referrals</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-600">${(entry.walletBalanceDollars || 0).toFixed(2)}</p>
                      <p className="text-xs text-neutral-400">balance</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent activity */}
          {dashboard.recentActivity.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">📋 Recent Activity</h3>
              <div className="space-y-2">
                {dashboard.recentActivity.map((ref) => (
                  <div key={ref.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-neutral-200 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-neutral-800">{ref.affiliate_name}</span>
                      <span className="text-xs text-neutral-400">→</span>
                      <span className="font-mono text-xs bg-neutral-100 px-2 py-0.5 rounded">#{ref.order_number}</span>
                      <span className="text-neutral-600">{ref.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-emerald-600 font-medium">+${(ref.commission_earned || 0).toFixed(2)}</span>
                      <span className="text-neutral-400">{new Date(ref.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: AFFILIATES
          ════════════════════════════════════════════════════════════ */}
      {activeTab === 'affiliates' && (
        <div className="space-y-4">
          <SearchBar value={search} onChange={setSearch} placeholder="Search affiliates..." />

          {filteredAffiliates.length === 0 ? (
            <EmptyState icon="🤝" title="No affiliates yet"
              description="Create your first affiliate to start tracking referrals and commissions."
              action={{ label: 'Create Affiliate', onClick: openCreate }} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-neutral-500 font-medium border-b border-neutral-200">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Discount</th>
                    <th className="px-4 py-3 text-right">Referrals</th>
                    <th className="px-4 py-3 text-right">Wallet</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredAffiliates.map((aff) => (
                    <tr key={aff.id} className="hover:bg-rose-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => openDetail(aff.id)}
                          className="text-rose-600 hover:text-rose-800 font-medium text-left hover:underline">
                          {aff.name}
                        </button>
                        {aff.email && <p className="text-xs text-neutral-400">{aff.email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">{aff.discount_code}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-600">
                        {aff.discount_type === 'percentage' ? `${aff.discount_value}% off` : `$${aff.discount_value} off`}
                        {aff.commission_rate > 0 && <span className="text-neutral-400"> / {aff.commission_rate}%</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{aff.total_referrals}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">
                        ${((aff.wallet_balance_cents || 0) / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">${(aff.total_revenue_generated || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <Badge status={aff.is_active ? 'success' : 'neutral'}>{aff.is_active ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openDetail(aff.id)}
                            className="text-xs px-2 py-1 rounded-lg hover:bg-rose-50 text-rose-600 font-medium">View</button>
                          <button onClick={() => openEdit(aff)}
                            className="text-xs px-2 py-1 rounded-lg hover:bg-neutral-100 text-neutral-600 font-medium">Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: PAYOUTS
          ════════════════════════════════════════════════════════════ */}
      {activeTab === 'payouts' && (
        <div className="space-y-6">
          {payoutSummary && (
            <>
              <div className="flex items-center gap-6 text-sm">
                <span className="text-neutral-500">Total Pending: <strong className="text-amber-600">${payoutSummary.totalPending.toFixed(2)}</strong></span>
                <span className="text-neutral-500">Total Paid: <strong className="text-emerald-600">${payoutSummary.totalPaid.toFixed(2)}</strong></span>
              </div>

              {payoutSummary.pending.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-700">Pending Balances</h3>
                  {payoutSummary.pending.map((p) => (
                    <div key={p.affiliate_id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-neutral-200">
                      <div>
                        <p className="font-medium text-neutral-800">{p.name}</p>
                        <p className="text-xs text-neutral-400">{p.discount_code}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-amber-600">${p.store_credit_balance.toFixed(2)}</span>
                        <Button variant="primary" size="sm" onClick={() => {
                          setPayoutAffiliateId(p.affiliate_id);
                          setPayoutAmount(String(p.store_credit_balance));
                          setShowPayoutModal(true);
                        }}>Pay</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {payoutSummary.allPayouts.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-neutral-700 mb-3">Recent Payouts</h3>
                  <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 text-left text-neutral-500 font-medium border-b border-neutral-200">
                        <tr>
                          <th className="px-4 py-3">Affiliate</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                          <th className="px-4 py-3">Method</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {payoutSummary.allPayouts.slice(0, 30).map((p) => (
                          <tr key={p.id}>
                            <td className="px-4 py-3"><p className="font-medium">{p.affiliate_name}</p></td>
                            <td className="px-4 py-3 text-right font-medium">${p.amount.toFixed(2)}</td>
                            <td className="px-4 py-3 text-xs capitalize">{p.method.replace('_', ' ')}</td>
                            <td className="px-4 py-3"><Badge status={p.status === 'paid' ? 'success' : 'warning'}>{p.status}</Badge></td>
                            <td className="px-4 py-3 text-xs text-neutral-400">{new Date(p.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: RULES
          ════════════════════════════════════════════════════════════ */}
      {activeTab === 'rules' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Commission Rules */}
          <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
            <h3 className="font-semibold text-neutral-800">Commission Rules</h3>
            {commissionRules && (
              <>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Commission Type</label>
                  <select value={commissionRules.commissionType}
                    onChange={(e) => setCommissionRules({ ...commissionRules, commissionType: e.target.value })}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white">
                    {COMMISSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Rate {commissionRules.commissionType === 'percentage' ? '(%)' : '($)'}</label>
                  <input type="number" value={commissionRules.rate}
                    onChange={(e) => setCommissionRules({ ...commissionRules, rate: parseFloat(e.target.value) })}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm" min="0" step="0.1" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">Options</label>
                  {[
                    { key: 'include_shipping', label: 'Include shipping in commission base' },
                    { key: 'include_tax', label: 'Include tax in commission base' },
                    { key: 'exclude_discounts', label: 'Exclude discounts from commission' },
                    { key: 'exclude_gift_cards', label: 'Exclude gift card purchases' },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-2">
                      <input type="checkbox" checked={!!commissionRules.options[opt.key]}
                        onChange={(e) => setCommissionRules({
                          ...commissionRules,
                          options: { ...commissionRules.options, [opt.key]: e.target.checked }
                        })}
                        className="rounded border-neutral-300 text-rose-500 focus:ring-rose-200" />
                      <span className="text-sm text-neutral-600">{opt.label}</span>
                    </label>
                  ))}
                  <div className="mt-2">
                    <label className="text-xs text-neutral-500">Product Eligibility</label>
                    <select value={commissionRules.options.product_eligibility || 'all'}
                      onChange={(e) => setCommissionRules({
                        ...commissionRules,
                        options: { ...commissionRules.options, product_eligibility: e.target.value }
                      })}
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white mt-1">
                      <option value="all">All Products</option>
                      <option value="specific_collections">Specific Collections</option>
                      <option value="exclude_categories">Exclude Categories</option>
                    </select>
                  </div>
                  <div className="mt-2">
                    <label className="text-xs text-neutral-500">Reward Timing</label>
                    <select value={commissionRules.options.reward_timing || 'after_fulfillment'}
                      onChange={(e) => setCommissionRules({
                        ...commissionRules,
                        options: { ...commissionRules.options, reward_timing: e.target.value }
                      })}
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white mt-1">
                      <option value="after_fulfillment">After Fulfillment</option>
                      <option value="after_delivery">After Delivery</option>
                      <option value="after_return_window">After Return Window</option>
                    </select>
                  </div>
                </div>
                <Button variant="primary" onClick={handleSaveCommissionRules} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Rules'}
                </Button>
              </>
            )}
          </div>

          {/* Reward Settings */}
          <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
            <h3 className="font-semibold text-neutral-800">Reward Type</h3>
            {rewardSettings && (
              <>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">How do affiliates earn rewards?</label>
                  <select value={rewardSettings.rewardType}
                    onChange={(e) => setRewardSettings({ ...rewardSettings, rewardType: e.target.value })}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white">
                    {REWARD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <p className="text-xs text-neutral-400">
                  {rewardSettings.rewardType === 'store_credit' && 'Commissions automatically become store credit. Affiliates can redeem for coupons or payouts.'}
                  {rewardSettings.rewardType === 'cash' && 'Affiliates earn cash that can be paid out via PayPal or bank transfer.'}
                  {rewardSettings.rewardType === 'gift_card' && 'Affiliates earn partner gift cards (e.g., Amazon, Starbucks).'}
                  {rewardSettings.rewardType === 'points' && 'Affiliates earn points they can redeem for rewards in a catalog.'}
                  {rewardSettings.rewardType === 'custom' && 'Define custom reward logic — e.g., product bundles, exclusive perks.'}
                </p>
                {rewardSettings.rewardType === 'cash' && (
                  <div className="space-y-3 border-t pt-3">
                    <div>
                      <label className="text-xs font-medium text-neutral-600">Payout Threshold ($)</label>
                      <input type="number" className="w-full border rounded-lg px-3 py-1.5 text-sm mt-1" defaultValue="50"
                        onChange={(e) => setRewardSettings({ ...rewardSettings, config: { ...rewardSettings.config, threshold: parseFloat(e.target.value) } })} />
                    </div>
                  </div>
                )}
                <Button variant="primary" onClick={handleSaveRewardSettings} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: FRAUD
          ════════════════════════════════════════════════════════════ */}
      {activeTab === 'fraud' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-700">Fraud Detection</h3>
            <Button variant="secondary" size="sm" onClick={loadFraudFlags}>🔄 Refresh</Button>
          </div>

          {fraudFlags.length === 0 ? (
            <EmptyState icon="🛡️" title="No flags detected"
              description="All affiliate activity looks clean. Fraud checks run automatically." />
          ) : (
            <div className="space-y-3">
              {fraudFlags.map((flag) => (
                <div key={flag.id} className={`p-4 rounded-xl border ${
                  flag.status === 'pending' ? 'bg-amber-50 border-amber-200' :
                  flag.status === 'dismissed' ? 'bg-gray-50 border-gray-200' :
                  'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge status={flag.status === 'pending' ? 'warning' : flag.status === 'dismissed' ? 'neutral' : 'success'}>
                          {flag.status}
                        </Badge>
                        <span className="text-xs font-medium text-neutral-500 uppercase">{flag.flag_type.replace('_', ' ')}</span>
                      </div>
                      <p className="text-sm text-neutral-700">{flag.details}</p>
                      {flag.affiliate_name && (
                        <p className="text-xs text-neutral-400 mt-1">
                          Affiliate: {flag.affiliate_name} ({flag.discount_code})
                          {flag.order_number && ` — Order #${flag.order_number}`}
                        </p>
                      )}
                    </div>
                    {flag.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <Button variant="primary" size="sm" onClick={() => handleFraudReview(flag.id, 'dismissed')}>Dismiss</Button>
                        <Button variant="secondary" size="sm" onClick={() => handleFraudReview(flag.id, 'confirmed')}>Confirm</Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          AFFILIATE DETAIL MODAL
          ════════════════════════════════════════════════════════════ */}
      {showDetail && detailAffiliate && (
        <Modal open={true} title="" onClose={() => setShowDetail(false)} size="lg">
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-neutral-800">{detailAffiliate.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">{detailAffiliate.discount_code}</span>
                  <Badge status={detailAffiliate.is_active ? 'success' : 'neutral'}>{detailAffiliate.is_active ? 'Active' : 'Inactive'}</Badge>
                  {detailAffiliate.email && <span className="text-xs text-neutral-400">{detailAffiliate.email}</span>}
                </div>
              </div>
              <button onClick={() => setShowDetail(false)} className="text-neutral-400 hover:text-neutral-600 text-xl">&times;</button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-4 gap-3">
              <QuickStat label="Referrals" value={detailAffiliate.total_referrals} />
              <QuickStat label="Wallet" value={`$${(wallet?.balanceDollars || 0).toFixed(2)}`} color="emerald" />
              <QuickStat label="Revenue" value={`$${(detailAffiliate.total_revenue_generated || 0).toFixed(2)}`} color="amber" />
              <QuickStat label="Lifetime" value={`$${(wallet?.lifetimeEarnedDollars || 0).toFixed(2)}`} color="blue" />
            </div>

            {/* Detail tabs */}
            <div className="flex items-center gap-1 border-b pb-2">
              {['overview', 'earnings', 'wallet', 'coupons', 'goals', 'toolkit'].map(t => (
                <button key={t} onClick={() => setDetailTab(t)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-colors ${
                    detailTab === t ? 'bg-rose-500 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* Overview */}
            {detailTab === 'overview' && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-neutral-400">Discount:</span> <strong>{detailAffiliate.discount_type === 'percentage' ? `${detailAffiliate.discount_value}%` : `$${detailAffiliate.discount_value}`}</strong></div>
                  <div><span className="text-neutral-400">Commission:</span> <strong>{detailAffiliate.commission_rate}%</strong></div>
                  <div><span className="text-neutral-400">Active:</span> <Badge status={detailAffiliate.is_active ? 'success' : 'neutral'}>{detailAffiliate.is_active ? 'Yes' : 'No'}</Badge></div>
                  <div><span className="text-neutral-400">Joined:</span> <strong>{new Date(detailAffiliate.created_at).toLocaleDateString()}</strong></div>
                </div>
                {detailAffiliate.notes && (
                  <div className="bg-neutral-50 rounded-lg p-3">
                    <p className="text-xs text-neutral-400 font-medium mb-1">Notes</p>
                    <p className="text-sm text-neutral-600">{detailAffiliate.notes}</p>
                  </div>
                )}
                {/* Recent referrals */}
                {detailAffiliate.referrals && detailAffiliate.referrals.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-neutral-400 mb-2">Recent Referrals</p>
                    <div className="space-y-2">
                      {detailAffiliate.referrals.slice(0, 5).map(ref => (
                        <div key={ref.id} className="flex items-center justify-between text-xs p-2 bg-neutral-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="font-mono bg-white px-1.5 py-0.5 rounded border">#{ref.order_number}</span>
                            <span>{ref.customer_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-600">+${(ref.commission_earned || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Earnings Timeline */}
            {detailTab === 'earnings' && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-neutral-700">Earnings Timeline</h4>
                {earnings.length === 0 ? (
                  <p className="text-sm text-neutral-400 text-center py-4">No earnings yet</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {earnings.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-neutral-100">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 text-sm font-bold">$</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded">#{e.order_number}</span>
                            <span className="text-sm text-neutral-700">{e.customer_name}</span>
                          </div>
                          <p className="text-xs text-neutral-400">{new Date(e.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600">+${(e.commission_earned || 0).toFixed(2)}</p>
                          <p className="text-xs text-neutral-400">Order: ${(e.order_total || 0).toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Wallet */}
            {detailTab === 'wallet' && wallet && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-emerald-50 rounded-xl p-4">
                    <p className="text-xs text-emerald-500 font-medium">Available Balance</p>
                    <p className="text-2xl font-bold text-emerald-700">${wallet.balanceDollars.toFixed(2)}</p>
                  </div>
                  <div className="flex-1 bg-blue-50 rounded-xl p-4">
                    <p className="text-xs text-blue-500 font-medium">Lifetime Earned</p>
                    <p className="text-2xl font-bold text-blue-700">${wallet.lifetimeEarnedDollars.toFixed(2)}</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-neutral-700 mb-2">Transactions</h4>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {wallet.transactions.map((txn) => (
                      <div key={txn.id} className="flex items-center justify-between p-2 text-sm hover:bg-neutral-50 rounded">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-sm ${txnColor(txn.type)}`}>{txnIcon(txn.type)}${txn.amountDollars.toFixed(2)}</span>
                          <span className="text-xs text-neutral-400 capitalize">{txn.type}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-neutral-500">{txn.description}</p>
                          <p className="text-xs text-neutral-300">{new Date(txn.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Coupons */}
            {detailTab === 'coupons' && (
              <div className="space-y-4">
                {wallet && (
                  <div className="bg-rose-50 rounded-xl p-4">
                    <p className="text-sm font-medium text-rose-700 mb-2">Create Coupon from Balance</p>
                    <p className="text-xs text-rose-500 mb-3">Available: ${wallet.balanceDollars.toFixed(2)}</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <input type="range" min="5" max={Math.floor(wallet.balanceDollars)} value={couponAmount}
                          onChange={(e) => setCouponAmount(e.target.value)}
                          className="w-full accent-rose-500" />
                        <div className="flex justify-between text-xs text-neutral-400 mt-1">
                          <span>$5</span><span>${couponAmount}</span><span>${Math.floor(wallet.balanceDollars)}</span>
                        </div>
                      </div>
                      <Button variant="primary" size="sm" onClick={handleGenerateCoupon} disabled={saving || wallet.balanceDollars < 5}>
                        {saving ? '...' : 'Generate'}
                      </Button>
                    </div>
                  </div>
                )}

                {generatedCoupon && (
                  <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                    <p className="text-sm font-medium text-emerald-700">✅ Coupon Generated!</p>
                    <div className="flex items-center gap-3 mt-2">
                      <code className="text-lg font-bold text-emerald-800 bg-white px-3 py-1 rounded border">{generatedCoupon.code}</code>
                      <span className="text-sm text-emerald-600">${(generatedCoupon.amount_cents / 100).toFixed(2)} value</span>
                    </div>
                    <button onClick={() => {
                      navigator.clipboard.writeText(generatedCoupon.code);
                      toast('Code copied', 'success');
                    }} className="text-xs text-emerald-600 hover:underline mt-1">Copy code</button>
                  </div>
                )}

                {coupons.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-700 mb-2">Previous Coupons</h4>
                    <div className="space-y-1">
                      {coupons.map((c) => (
                        <div key={c.id} className="flex items-center justify-between p-2 text-sm bg-neutral-50 rounded">
                          <div>
                            <code className="text-xs font-mono text-neutral-700">{c.code}</code>
                            <span className="text-xs text-neutral-400 ml-2">${(c.amount_cents / 100).toFixed(2)}</span>
                          </div>
                          <Badge status={c.status === 'active' ? 'success' : 'neutral'}>{c.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Goals */}
            {detailTab === 'goals' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-neutral-700">Goals & Milestones</h4>
                  <Button variant="primary" size="sm" onClick={() => setShowGoalModal(true)}>+ New Goal</Button>
                </div>
                {goals.length === 0 ? (
                  <p className="text-sm text-neutral-400 text-center py-4">No goals set yet</p>
                ) : (
                  <div className="space-y-3">
                    {goals.map((g) => (
                      <div key={g.id} className={`p-3 rounded-xl border ${g.status === 'completed' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-neutral-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-medium text-sm text-neutral-800">{g.title}</p>
                            {g.reward && <p className="text-xs text-neutral-400">Reward: {g.reward}</p>}
                          </div>
                          <Badge status={g.status === 'completed' ? 'success' : g.status === 'active' ? 'warning' : 'neutral'}>
                            {g.status}
                          </Badge>
                        </div>
                        <ProgressBar value={g.target > 0 ? Math.round((g.current / g.target) * 100) : 0} />
                        <p className="text-xs text-neutral-400 mt-1">{g.current} / {g.target}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Toolkit */}
            {detailTab === 'toolkit' && toolkit && (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-neutral-700">Referral Toolkit</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl border p-3 text-center">
                    <p className="text-2xl font-bold text-neutral-800">{toolkit.linkClicks}</p>
                    <p className="text-xs text-neutral-400">Link Clicks</p>
                  </div>
                  <div className="bg-white rounded-xl border p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-600">{toolkit.conversions}</p>
                    <p className="text-xs text-neutral-400">Conversions</p>
                  </div>
                  <div className="bg-white rounded-xl border p-3 text-center">
                    <p className="text-2xl font-bold text-amber-600">${toolkit.revenueGeneratedDollars.toFixed(2)}</p>
                    <p className="text-xs text-neutral-400">Revenue</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-medium text-neutral-500">Referral Link</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-xs bg-neutral-100 p-2 rounded truncate">{toolkit.referralLink}</code>
                      <button onClick={() => { navigator.clipboard.writeText(toolkit.referralLink); toast('Link copied', 'success'); }}
                        className="text-xs px-2 py-1.5 bg-rose-50 text-rose-600 rounded-lg font-medium hover:bg-rose-100">Copy</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-500">Discount Code</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-lg font-bold bg-rose-50 text-rose-700 p-2 rounded text-center">{toolkit.couponCode}</code>
                      <button onClick={() => { navigator.clipboard.writeText(toolkit.couponCode); toast('Code copied', 'success'); }}
                        className="text-xs px-2 py-1.5 bg-rose-50 text-rose-600 rounded-lg font-medium hover:bg-rose-100">Copy</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MODALS
          ════════════════════════════════════════════════════════════ */}

      {/* Create/Edit Affiliate */}
      {showAffModal && (
        <Modal open={true} title={editingAffiliate ? 'Edit Affiliate' : 'New Affiliate'} onClose={() => setShowAffModal(false)}
          footer={
            <div className="flex items-center gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowAffModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSaveAffiliate} disabled={saving}>
                {saving ? 'Saving...' : editingAffiliate ? 'Save Changes' : 'Create Affiliate'}
              </Button>
            </div>
          }>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Name *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" placeholder="Affiliate name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
              <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" placeholder="affiliate@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Discount Code *</label>
              <input type="text" value={formCode} onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                className="w-full font-mono border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" placeholder="VIPTEN" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Discount Type</label>
                <select value={formDiscountType} onChange={(e) => setFormDiscountType(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed_amount">Fixed Amount ($)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">{formDiscountType === 'percentage' ? 'Discount %' : 'Discount $'}</label>
                <input type="number" value={formDiscountValue} onChange={(e) => setFormDiscountValue(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" min="0" step="0.01" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Commission Rate (%)</label>
              <input type="number" value={formCommissionRate} onChange={(e) => setFormCommissionRate(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" min="0" max="100" step="0.1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Notes</label>
              <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" rows={2} placeholder="Internal notes..." />
            </div>
            {editingAffiliate && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-neutral-300 text-rose-500 focus:ring-rose-200" />
                <span className="text-sm text-neutral-700">Active</span>
              </label>
            )}
          </div>
        </Modal>
      )}

      {/* Payout Modal */}
      {showPayoutModal && (
        <Modal open={true} title="Issue Payout" onClose={() => setShowPayoutModal(false)}
          footer={
            <div className="flex items-center gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowPayoutModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => handleIssuePayout(payoutAffiliateId!)} disabled={saving}>
                {saving ? 'Processing...' : 'Issue Payout'}
              </Button>
            </div>
          }>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Amount ($)</label>
              <input type="number" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm" min="0.01" step="0.01" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Method</label>
              <select value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="store_credit">Store Credit</option>
                <option value="paypal">PayPal</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* Goal Modal */}
      {showGoalModal && (
        <Modal open={true} title="Create Goal" onClose={() => setShowGoalModal(false)}
          footer={
            <div className="flex items-center gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowGoalModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreateGoal} disabled={saving}>
                {saving ? 'Creating...' : 'Create Goal'}
              </Button>
            </div>
          }>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Title *</label>
              <input type="text" value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="Reach 50 referrals" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Target *</label>
              <input type="number" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm" min="1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Reward</label>
              <input type="text" value={goalReward} onChange={(e) => setGoalReward(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm" placeholder="50 store credit" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Micro-components ───────────────────────────────────────────────

function StatBox({ value, label, color = 'neutral' }: { value: any; label: string; color?: string }) {
  const colors: Record<string, string> = {
    neutral: 'text-neutral-800',
    emerald: 'text-emerald-600',
    rose: 'text-rose-500',
    amber: 'text-amber-500',
    red: 'text-red-500',
    blue: 'text-blue-600',
  };
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-3 text-center">
      <p className={`text-xl font-bold ${colors[color] || colors.neutral}`}>{value}</p>
      <p className="text-xs text-neutral-400">{label}</p>
    </div>
  );
}

function QuickStat({ label, value, color = 'neutral' }: { label: string; value: string | number; color?: string }) {
  const colors: Record<string, string> = {
    neutral: 'bg-neutral-50 text-neutral-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
  };
  return (
    <div className={`rounded-xl p-3 text-center ${colors[color] || colors.neutral}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
