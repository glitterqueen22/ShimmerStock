import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs, Badge, Button, Modal, SearchBar, EmptyState, Skeleton, ErrorBanner, useToast } from '../components/ui';
import { apiGet, apiPost, apiPut, apiDelete, sanitizeError } from '../lib/api';
import Novi from '../components/Novi';

// ── Types ──────────────────────────────────────────────────────────
interface StoreCreditEntry {
  id: number;
  customer_email: string;
  store_credit_code: string;
  amount_issued: number;
  amount_remaining: number;
  is_active: number;
  issued_at: string;
  expires_at: string | null;
  order_number: number | null;
  return_refund_id: number;
}

interface StoreCreditRedemption {
  id: number;
  credit_id: number;
  order_id: number;
  amount_applied: number;
  created_at: string;
  store_credit_code: string;
  order_number: number;
}

interface CustomerStoreCredit {
  credits: StoreCreditEntry[];
  totalBalance: number;
  redemptions: StoreCreditRedemption[];
}

interface ReturnRefund {
  id: number;
  order_id: number;
  order_item_id: number | null;
  type: string;
  status: string;
  amount: number | null;
  reason: string | null;
  replacement_order_id: number | null;
  store_credit_code: string | null;
  order_number: number;
  customer_name: string;
  customer_email: string;
  source: string;
  notes: string | null;
  created_at: string;
}

interface CustomerNote {
  id: number;
  customer_email: string;
  order_id: number | null;
  note: string;
  note_type: string;
  created_by_name: string | null;
  created_at: string;
}

interface CustomerSummary {
  customer_email: string;
  customer_name: string;
  total_orders: number;
  lifetime_value: number;
  first_order_date: string;
  last_order_date: string;
}

interface CustomerHQ {
  profile: {
    email: string;
    name: string;
    firstOrderDate: string;
    lastOrderDate: string;
    totalOrders: number;
    lifetimeValue: number;
    avgOrderValue: number;
    tags: string[];
  };
  orders: any[];
  returns: any[];
  communications: any[];
  affiliate: any | null;
  activityFeed: any[];
}

interface TimelineEvent {
  id: string;
  timestamp: string;
  engine: string;
  action: string;
  label: string;
  details: string;
}

interface OrderTimeline {
  order: any;
  events: TimelineEvent[];
}

interface PackingProof {
  id: number;
  proof_type: string;
  data: string;
  created_by_name: string | null;
  created_at: string;
}

interface Approval {
  id: number;
  type: string;
  request_data: any;
  requested_by_name: string;
  reviewed_by_name: string | null;
  status: string;
  created_at: string;
}

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  created_at: string;
}

// ── Inbox Types ────────────────────────────────────────────────────
interface Conversation {
  id: number;
  business_id: number;
  customer_email: string;
  subject: string | null;
  source: string;
  source_ref: string | null;
  status: string;
  priority: string;
  assigned_to: number | null;
  tags: string;
  last_message_at: string | null;
  created_at: string;
  resolved_at: string | null;
  assignee_name: string | null;
  unread_count: number;
  last_message_preview: string | null;
  last_message_time: string | null;
}

interface Message {
  id: number;
  conversation_id: number;
  business_id: number;
  direction: string;
  sender_type: string;
  sender_name: string | null;
  body: string;
  drafted_by_novi: number;
  novi_draft_context: string | null;
  is_read: number;
  created_at: string;
}

interface InboxStats {
  open: number;
  waiting_on_customer: number;
  waiting_on_team: number;
  high_priority: number;
  unassigned: number;
}

// ── Tabs ───────────────────────────────────────────────────────────
const TABS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'search', label: 'Customer Search' },
  { id: 'returns', label: 'Returns & Refunds' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'templates', label: 'Email Templates' },
  { id: 'timeline', label: 'Order Timeline' },
  { id: 'packing', label: 'Packing Proof' },
];

// ── Helpers ────────────────────────────────────────────────────────
function statusColor(status: string) {
  switch (status) {
    case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'approved': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'processed': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'rejected': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

function engineIcon(engine: string) {
  switch (engine) {
    case 'commerce': return '📋';
    case 'production': return '🏭';
    case 'fulfillment': return '🚚';
    case 'customer_service': return '💬';
    default: return '📌';
  }
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return `$${n.toFixed(2)}`;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function CustomerHub() {
  const [activeTab, setActiveTab] = useState('inbox');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Customer Search ──────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerHQ | null>(null);
  const [hqLoading, setHqLoading] = useState(false);

  // ── Returns & Refunds ───────────────────────────────────────────
  const [returns, setReturns] = useState<ReturnRefund[]>([]);
  const [returnsFilter, setReturnsFilter] = useState('');
  const [returnsTypeFilter, setReturnsTypeFilter] = useState('');

  // ── Approvals ───────────────────────────────────────────────────
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [approvalFilter, setApprovalFilter] = useState('');

  // ── Email Templates ─────────────────────────────────────────────
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);

  // ── Timeline ────────────────────────────────────────────────────
  const [timelineOrderId, setTimelineOrderId] = useState('');
  const [timeline, setTimeline] = useState<OrderTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // ── Packing ─────────────────────────────────────────────────────
  const [packingOrderId, setPackingOrderId] = useState('');
  const [packingProofs, setPackingProofs] = useState<PackingProof[]>([]);
  const [packingLoading, setPackingLoading] = useState(false);

  // ── Modals ──────────────────────────────────────────────────────
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteCustomerEmail, setNoteCustomerEmail] = useState('');
  const [noteOrderId, setNoteOrderId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [noteSaving, setNoteSaving] = useState(false);

  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [draftContext, setDraftContext] = useState('general');
  const [draftResponse, setDraftResponse] = useState<{ subject: string; body: string } | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftOrderId, setDraftOrderId] = useState<number | null>(null);
  const [emailSending, setEmailSending] = useState(false);

  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofOrderIdInput, setProofOrderIdInput] = useState('');
  const [proofType, setProofType] = useState('photo');
  const [proofNotes, setProofNotes] = useState('');
  const [proofWeight, setProofWeight] = useState('');
  const [proofSaving, setProofSaving] = useState(false);

  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagSaving, setTagSaving] = useState(false);

  // ── Store Credit ────────────────────────────────────────────────
  const [storeCredit, setStoreCredit] = useState<CustomerStoreCredit | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);

  // ── Create Return/Refund Modal ────────────────────────────────────
  const [createReturnModalOpen, setCreateReturnModalOpen] = useState(false);
  const [createReturnOrderId, setCreateReturnOrderId] = useState('');
  const [createReturnType, setCreateReturnType] = useState('refund');
  const [createReturnReason, setCreateReturnReason] = useState('');
  const [createReturnAmount, setCreateReturnAmount] = useState('');
  const [createReturnSaving, setCreateReturnSaving] = useState(false);
  const [prefillOrderId, setPrefillOrderId] = useState<number | null>(null);

  // ── Inbox ───────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [inboxFilter, setInboxFilter] = useState('all');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxStats, setInboxStats] = useState<InboxStats>({ open: 0, waiting_on_customer: 0, waiting_on_team: 0, high_priority: 0, unassigned: 0 });
  const [replyText, setReplyText] = useState('');
  const [replyIsInternalNote, setReplyIsInternalNote] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [noviDrafting, setNoviDrafting] = useState(false);
  const [noviDraftResult, setNoviDraftResult] = useState<{ draft: string; confidence: number; suggested_action: string } | null>(null);
  const [newConvModalOpen, setNewConvModalOpen] = useState(false);
  const [newConvEmail, setNewConvEmail] = useState('');
  const [newConvSubject, setNewConvSubject] = useState('');
  const [newConvSaving, setNewConvSaving] = useState(false);
  const [customerContext, setCustomerContext] = useState<any>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [searchHasOpenConvs, setSearchHasOpenConvs] = useState<Record<string, number>>({});

  // ── Load data on mount ───────────────────────────────────────────
  useEffect(() => {
    loadReturns();
    loadApprovals();
    loadTemplates();
    loadInboxStats();
    loadConversations();
  }, []);

  // ── Handle returnOrderId param (from Orders page) ────────────────
  useEffect(() => {
    const orderId = searchParams.get('returnOrderId');
    if (orderId) {
      setActiveTab('returns');
      setCreateReturnOrderId(orderId);
      setCreateReturnType('refund');
      setCreateReturnReason('');
      setCreateReturnAmount('');
      setCreateReturnModalOpen(true);
      // Clear the param so it doesn't re-trigger
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('returnOrderId');
      setSearchParams(newParams, { replace: true });
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // CUSTOMER SEARCH
  // ═══════════════════════════════════════════════════════════════════

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: searchQuery.trim(), limit: '30' });
      const res = await apiGet(`/api/customers?${params.toString()}`);
      setCustomers(Array.isArray(res) ? res : []);
      setSelectedCustomer(null);
    } catch (err) {
      toast('Failed to search customers', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleViewCustomer(email: string) {
    setHqLoading(true);
    setSelectedCustomer(null);
    setStoreCredit(null);
    try {
      const res = await apiGet(`/api/customers/${encodeURIComponent(email)}/hq`);
      setSelectedCustomer(res);
      // Also fetch store credit
      fetchStoreCredit(email);
    } catch (err) {
      toast('Failed to load customer details', 'error');
    } finally {
      setHqLoading(false);
    }
  }

  async function fetchStoreCredit(email: string) {
    setCreditLoading(true);
    try {
      const res = await apiGet(`/api/customers/credit?email=${encodeURIComponent(email)}`);
      setStoreCredit(res);
    } catch {
      // Store credit is optional
      setStoreCredit(null);
    } finally {
      setCreditLoading(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // RETURNS & REFUNDS
  // ═══════════════════════════════════════════════════════════════════

  async function loadReturns() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (returnsFilter) params.set('status', returnsFilter);
      if (returnsTypeFilter) params.set('type', returnsTypeFilter);
      const res = await apiGet(`/api/cs/returns?${params.toString()}`);
      setReturns(Array.isArray(res) ? res : []);
    } catch (err) {
      toast('Failed to load returns', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: number) {
    try {
      await apiPut(`/api/cs/returns/${id}/approve`, {});
      toast('Return approved', 'success');
      loadReturns();
    } catch (err: any) {
      toast(err?.message || 'Failed to approve', 'error');
    }
  }

  async function handleProcess(id: number) {
    try {
      const res = await apiPut(`/api/cs/returns/${id}/process`, {});
      toast('Return processed' + (res?.replacement ? ' — replacement order created' : ''), 'success');
      loadReturns();
    } catch (err: any) {
      toast(err?.message || 'Failed to process', 'error');
    }
  }

  async function handleReject(id: number) {
    try {
      await apiPut(`/api/cs/returns/${id}/reject`, { reason: 'Request rejected by CS' });
      toast('Return rejected', 'success');
      loadReturns();
    } catch (err: any) {
      toast(err?.message || 'Failed to reject', 'error');
    }
  }

  function openCreateReturn(orderId?: number) {
    setCreateReturnOrderId(orderId ? String(orderId) : '');
    setCreateReturnType('refund');
    setCreateReturnReason('');
    setCreateReturnAmount('');
    setCreateReturnModalOpen(true);
  }

  async function handleCreateReturn() {
    if (!createReturnOrderId.trim()) {
      toast('Order ID is required', 'error');
      return;
    }
    setCreateReturnSaving(true);
    try {
      const res = await apiPost('/api/cs/returns', {
        orderId: parseInt(createReturnOrderId),
        type: createReturnType,
        reason: createReturnReason || undefined,
        amount: createReturnAmount ? parseFloat(createReturnAmount) : undefined,
      });
      if (res.success) {
        toast('Return/refund created!', 'success');
        setCreateReturnModalOpen(false);
        setCreateReturnOrderId('');
        setCreateReturnReason('');
        setCreateReturnAmount('');
        loadReturns();
      }
    } catch (err: any) {
      toast(err?.message || 'Failed to create return/refund', 'error');
    } finally {
      setCreateReturnSaving(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // APPROVALS
  // ═══════════════════════════════════════════════════════════════════

  async function loadApprovals() {
    try {
      const params = new URLSearchParams();
      if (approvalFilter) params.set('status', approvalFilter);
      const res = await apiGet(`/api/approvals?${params.toString()}`);
      setApprovals(Array.isArray(res) ? res : []);
    } catch (err) {
      // silent
    }
  }

  async function handleApproveApproval(id: number) {
    try {
      await apiPut(`/api/approvals/${id}`, { status: 'approved' });
      toast('Approval granted', 'success');
      loadApprovals();
    } catch (err: any) {
      toast(err?.message || 'Failed to approve', 'error');
    }
  }

  async function handleDenyApproval(id: number) {
    try {
      await apiPut(`/api/approvals/${id}`, { status: 'denied' });
      toast('Approval denied', 'success');
      loadApprovals();
    } catch (err: any) {
      toast(err?.message || 'Failed to deny', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // EMAIL TEMPLATES
  // ═══════════════════════════════════════════════════════════════════

  async function loadTemplates() {
    try {
      const res = await apiGet('/api/email/templates');
      setTemplates(Array.isArray(res) ? res : []);
    } catch (err) {
      // silent
    }
  }

  function openNewTemplate() {
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateSubject('');
    setTemplateBody('');
    setTemplateModalOpen(true);
  }

  function openEditTemplate(t: EmailTemplate) {
    setEditingTemplate(t);
    setTemplateName(t.name);
    setTemplateSubject(t.subject);
    setTemplateBody(t.body);
    setTemplateModalOpen(true);
  }

  async function handleSaveTemplate() {
    if (!templateName || !templateSubject || !templateBody) {
      toast('All fields are required', 'error');
      return;
    }
    setTemplateSaving(true);
    try {
      if (editingTemplate) {
        await apiPut(`/api/email/templates/${editingTemplate.id}`, {
          name: templateName,
          subject: templateSubject,
          body: templateBody,
        });
        toast('Template updated', 'success');
      } else {
        await apiPost('/api/email/templates', {
          name: templateName,
          subject: templateSubject,
          body: templateBody,
        });
        toast('Template created', 'success');
      }
      setTemplateModalOpen(false);
      loadTemplates();
    } catch (err: any) {
      toast(err?.message || 'Failed to save template', 'error');
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleDeleteTemplate(id: number) {
    try {
      await apiDelete(`/api/email/templates/${id}`);
      toast('Template deleted', 'success');
      loadTemplates();
    } catch (err: any) {
      toast(err?.message || 'Failed to delete', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // AI DRAFT RESPONSE
  // ═══════════════════════════════════════════════════════════════════

  async function handleDraftResponse() {
    if (!selectedCustomer) return;
    setDraftLoading(true);
    setDraftResponse(null);
    try {
      const res = await apiPost('/api/cs/draft-response', {
        customerId: selectedCustomer.profile.email,
        orderId: draftOrderId,
        context: draftContext,
      });
      setDraftResponse(res.draft);
    } catch (err: any) {
      toast(err?.message || 'Failed to draft response', 'error');
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleSendDraft() {
    if (!draftResponse || !selectedCustomer) return;
    setEmailSending(true);
    try {
      await apiPost('/api/email/send', {
        customerEmail: selectedCustomer.profile.email,
        subject: draftResponse.subject,
        body: draftResponse.body,
      });
      toast('Email sent!', 'success');
      setDraftModalOpen(false);
      setDraftResponse(null);
    } catch (err: any) {
      toast(err?.message || 'Failed to send email', 'error');
    } finally {
      setEmailSending(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CUSTOMER NOTES
  // ═══════════════════════════════════════════════════════════════════

  async function handleAddNote() {
    if (!noteCustomerEmail || !noteText.trim()) return;
    setNoteSaving(true);
    try {
      await apiPost('/api/cs/notes', {
        customerEmail: noteCustomerEmail.trim().toLowerCase(),
        orderId: noteOrderId,
        note: noteText.trim(),
        noteType,
      });
      toast('Note added', 'success');
      setNoteModalOpen(false);
      setNoteText('');
      setNoteType('general');
      if (selectedCustomer && selectedCustomer.profile.email === noteCustomerEmail) {
        handleViewCustomer(noteCustomerEmail);
      }
    } catch (err: any) {
      toast(err?.message || 'Failed to add note', 'error');
    } finally {
      setNoteSaving(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CUSTOMER TAGS
  // ═══════════════════════════════════════════════════════════════════

  async function handleAddTag() {
    if (!tagInput.trim() || !selectedCustomer) return;
    setTagSaving(true);
    try {
      await apiPost(`/api/customers/${encodeURIComponent(selectedCustomer.profile.email)}/tags`, {
        tag: tagInput.trim(),
      });
      toast('Tag added', 'success');
      setTagInput('');
      setTagModalOpen(false);
      handleViewCustomer(selectedCustomer.profile.email);
    } catch (err: any) {
      toast(err?.message || 'Failed to add tag', 'error');
    } finally {
      setTagSaving(false);
    }
  }

  async function handleRemoveTag(tag: string) {
    if (!selectedCustomer) return;
    try {
      await apiDelete(`/api/customers/${encodeURIComponent(selectedCustomer.profile.email)}/tags/${encodeURIComponent(tag)}`);
      toast('Tag removed', 'success');
      handleViewCustomer(selectedCustomer.profile.email);
    } catch (err: any) {
      toast(err?.message || 'Failed to remove tag', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // TIMELINE
  // ═══════════════════════════════════════════════════════════════════

  async function handleTimelineLookup() {
    if (!timelineOrderId.trim()) return;
    setTimelineLoading(true);
    setTimeline(null);
    try {
      const res = await apiGet(`/api/cs/orders/${timelineOrderId.trim()}/timeline`);
      setTimeline(res);
    } catch (err) {
      toast('Order not found or error', 'error');
    } finally {
      setTimelineLoading(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PACKING PROOF
  // ═══════════════════════════════════════════════════════════════════

  async function handlePackingLookup() {
    if (!packingOrderId.trim()) return;
    setPackingLoading(true);
    setPackingProofs([]);
    try {
      const res = await apiGet(`/api/cs/orders/${packingOrderId.trim()}/packing-proof`);
      setPackingProofs(Array.isArray(res) ? res : []);
    } catch (err) {
      toast('Failed to load packing proof', 'error');
    } finally {
      setPackingLoading(false);
    }
  }

  async function handleAddPackingProof() {
    if (!proofOrderIdInput.trim()) return;
    setProofSaving(true);
    try {
      const data: any = {};
      if (proofNotes) data.notes = proofNotes;
      if (proofWeight) data.weightCheck = proofWeight;
      await apiPost(`/api/cs/orders/${proofOrderIdInput.trim()}/packing-proof`, {
        proofType,
        data,
      });
      toast('Packing proof added', 'success');
      setProofModalOpen(false);
      setProofNotes('');
      setProofWeight('');
      setPackingOrderId(proofOrderIdInput);
    } catch (err: any) {
      toast(err?.message || 'Failed to add proof', 'error');
    } finally {
      setProofSaving(false);
    }
  }


  // ═══════════════════════════════════════════════════════════════════
  // INBOX FUNCTIONS (V4.0 Phase 1)
  // ═══════════════════════════════════════════════════════════════════

  async function loadInboxStats() {
    try {
      const res = await apiGet('/api/cs/inbox-stats');
      setInboxStats(res);
    } catch { /* silent */ }
  }

  async function loadConversations() {
    setInboxLoading(true);
    try {
      const params = new URLSearchParams();
      if (inboxFilter === 'open') params.set('status', 'open');
      else if (inboxFilter === 'waiting_on_customer') params.set('status', 'waiting_on_customer');
      else if (inboxFilter === 'waiting_on_team') params.set('status', 'open');
      else if (inboxFilter === 'resolved') params.set('status', 'resolved');
      else if (inboxFilter === 'assigned_to_me') params.set('assigned_to', 'me');
      else if (inboxFilter === 'unassigned') params.set('assigned_to', 'unassigned');
      else if (inboxFilter === 'high') params.set('priority', 'high');
      const res = await apiGet(`/api/cs/conversations?${params.toString()}`);
      setConversations(Array.isArray(res) ? res : []);
    } catch (err) {
      toast('Failed to load conversations', 'error');
    } finally {
      setInboxLoading(false);
    }
  }

  async function selectConversation(conv: Conversation) {
    setSelectedConversation(conv);
    setNoviDraftResult(null);
    setReplyText('');
    setReplyIsInternalNote(false);
    try {
      const res = await apiGet(`/api/cs/conversations/${conv.id}`);
      setMessages(res.messages || []);
    } catch (err) {
      toast('Failed to load messages', 'error');
    }
    // Load customer context
    setContextLoading(true);
    setShowContext(false);
    try {
      const ctx = await apiGet(`/api/cs/customers/${encodeURIComponent(conv.customer_email)}`);
      setCustomerContext(ctx);
      setShowContext(true);
    } catch {
      setCustomerContext(null);
      setShowContext(false);
    } finally {
      setContextLoading(false);
    }
  }

  async function handleSendReply() {
    if (!replyText.trim() || !selectedConversation) return;
    setReplySending(true);
    try {
      const direction = replyIsInternalNote ? 'internal_note' : 'outbound';
      await apiPost(`/api/cs/conversations/${selectedConversation.id}/messages`, {
        body: replyText.trim(),
        direction,
      });
      setReplyText('');
      setNoviDraftResult(null);
      setReplyIsInternalNote(false);
      toast(replyIsInternalNote ? 'Internal note saved' : 'Reply sent!', 'success');
      // Refresh messages
      selectConversation(selectedConversation);
      loadConversations();
      loadInboxStats();
    } catch (err: any) {
      toast(err?.message || 'Failed to send', 'error');
    } finally {
      setReplySending(false);
    }
  }

  async function handleNoviDraft() {
    if (!selectedConversation) return;
    setNoviDrafting(true);
    setNoviDraftResult(null);
    try {
      const res = await apiPost(`/api/cs/conversations/${selectedConversation.id}/novi-draft`, {});
      setNoviDraftResult(res);
      setReplyText(res.draft);
    } catch (err: any) {
      toast(err?.message || 'Failed to draft', 'error');
    } finally {
      setNoviDrafting(false);
    }
  }

  async function handleResolveConversation() {
    if (!selectedConversation) return;
    try {
      await apiPut(`/api/cs/conversations/${selectedConversation.id}`, { status: 'resolved' });
      toast('Conversation resolved', 'success');
      setSelectedConversation(null);
      setMessages([]);
      loadConversations();
      loadInboxStats();
    } catch (err: any) {
      toast(err?.message || 'Failed to resolve', 'error');
    }
  }

  async function handleUpdatePriority(priority: string) {
    if (!selectedConversation) return;
    try {
      await apiPut(`/api/cs/conversations/${selectedConversation.id}`, { priority });
      setSelectedConversation({ ...selectedConversation, priority });
      loadConversations();
    } catch (err: any) {
      toast(err?.message || 'Failed to update', 'error');
    }
  }

  async function handleCreateConversation() {
    if (!newConvEmail.trim()) return;
    setNewConvSaving(true);
    try {
      await apiPost('/api/cs/conversations', {
        customer_email: newConvEmail.trim(),
        subject: newConvSubject.trim() || undefined,
        source: 'email',
      });
      toast('Conversation created', 'success');
      setNewConvModalOpen(false);
      setNewConvEmail('');
      setNewConvSubject('');
      loadConversations();
      loadInboxStats();
    } catch (err: any) {
      toast(err?.message || 'Failed to create', 'error');
    } finally {
      setNewConvSaving(false);
    }
  }

  function relativeTime(dateStr: string | null): string {
    if (!dateStr) return '';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  function priorityDot(priority: string) {
    switch (priority) {
      case 'urgent': return '🔴';
      case 'high': return '🟠';
      case 'normal': return '🟢';
      case 'low': return '⚪';
      default: return '🟢';
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Inbox Tab
  // ═══════════════════════════════════════════════════════════════════
  function renderInboxTab() {
    const filterButtons: { key: string; label: string; count: number }[] = [
      { key: 'all', label: 'All', count: inboxStats.open + inboxStats.waiting_on_customer + inboxStats.waiting_on_team + inboxStats.unassigned },
      { key: 'open', label: 'Open', count: inboxStats.open },
      { key: 'waiting_on_customer', label: 'Waiting on Customer', count: inboxStats.waiting_on_customer },
      { key: 'waiting_on_team', label: 'Waiting on Team', count: inboxStats.waiting_on_team },
      { key: 'resolved', label: 'Resolved', count: 0 },
      { key: 'assigned_to_me', label: 'Assigned to Me', count: 0 },
      { key: 'unassigned', label: 'Unassigned', count: inboxStats.unassigned },
      { key: 'high', label: 'High Priority', count: inboxStats.high_priority },
    ];

    return (
      <div className="flex flex-col lg:flex-row gap-0 lg:gap-0 h-[calc(100vh-280px)] min-h-[500px]">
        {/* ── Left Sidebar: Filters ────────────────────────────────── */}
        <div className="w-full lg:w-56 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-rose-100 bg-white lg:bg-rose-50/30 p-3 lg:overflow-y-auto">
          <Button size="sm" className="w-full mb-3" onClick={() => { setNewConvEmail(''); setNewConvSubject(''); setNewConvModalOpen(true); }}>
            ➕ New Conversation
          </Button>
          <div className="space-y-0.5">
            {filterButtons.map((fb) => (
              <button
                key={fb.key}
                onClick={() => { setInboxFilter(fb.key); setSelectedConversation(null); setMessages([]); setTimeout(loadConversations, 0); }}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all flex items-center justify-between
                  ${inboxFilter === fb.key ? 'bg-rose-100 text-rose-700 font-medium' : 'text-neutral-600 hover:bg-rose-50 hover:text-rose-600'}`}
              >
                <span>{fb.label}</span>
                {fb.count > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold
                    ${fb.key === 'high' ? 'bg-red-100 text-red-700' : 'bg-rose-100 text-rose-600'}`}>
                    {fb.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Middle: Conversation List ─────────────────────────────── */}
        <div className={`w-full flex-1 border-r border-rose-100 bg-white overflow-y-auto ${selectedConversation ? 'hidden lg:block' : ''}`}>
          {inboxLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} variant="table-row" />)}
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              title="No conversations"
              description="Customer messages will appear here as they come in. Create a new conversation to get started."
            />
          ) : (
            <div className="divide-y divide-rose-50">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
                  className={`p-3 cursor-pointer transition-all hover:bg-rose-50/50
                    ${selectedConversation?.id === conv.id ? 'bg-rose-50 border-l-2 border-rose-400' : 'border-l-2 border-transparent'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-neutral-800 truncate">
                        {conv.customer_email}
                      </p>
                      <p className="text-xs text-neutral-500 truncate mt-0.5">
                        {conv.subject || (conv.last_message_preview ? conv.last_message_preview.substring(0, 60) : 'No messages')}
                      </p>
                      {conv.last_message_preview && (
                        <p className="text-xs text-neutral-400 truncate mt-0.5">
                          {conv.last_message_preview.substring(0, 80)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px]" title={conv.priority}>{priorityDot(conv.priority)}</span>
                        <span className="text-[10px] text-neutral-400">{relativeTime(conv.last_message_time || conv.created_at)}</span>
                      </div>
                      {conv.unread_count > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">
                          {conv.unread_count}
                        </span>
                      )}
                      {conv.status === 'resolved' && (
                        <span className="text-[10px] text-emerald-600 font-medium">✓</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right Panel: Message Thread ───────────────────────────── */}
        <div className={`w-full flex-1 flex flex-col bg-white ${!selectedConversation ? 'hidden lg:flex lg:items-center lg:justify-center' : ''}`}>
          {!selectedConversation ? (
            <EmptyState
              title="Select a conversation"
              description="Choose a conversation from the list to view messages and reply."
            />
          ) : (
            <>
              {/* Thread Header */}
              <div className="flex items-center justify-between p-3 border-b border-rose-100 bg-rose-50/30 flex-shrink-0 flex-wrap gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-800 truncate">
                    {selectedConversation.subject || selectedConversation.customer_email}
                  </p>
                  <p className="text-xs text-neutral-500">{selectedConversation.customer_email}</p>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusColor(selectedConversation.status)}`}>
                    {selectedConversation.status.replace('_', ' ')}
                  </span>
                  <select
                    value={selectedConversation.priority}
                    onChange={e => handleUpdatePriority(e.target.value)}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-rose-200 bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  {selectedConversation.status !== 'resolved' && (
                    <button
                      onClick={handleResolveConversation}
                      className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
                      title="Resolve"
                    >
                      ✓ Resolve
                    </button>
                  )}
                  <button
                    onClick={() => setShowContext(!showContext)}
                    className={`text-[10px] px-2 py-0.5 rounded border ${showContext ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-gray-50 text-gray-500 border-gray-200'} hover:bg-gray-100`}
                  >
                    👤 {showContext ? 'Hide' : 'Customer'}
                  </button>
                </div>
              </div>

              {/* Message Thread + Customer Context */}
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center py-8">No messages yet.</p>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : msg.direction === 'internal_note' ? 'justify-center' : 'justify-start'}`}>
                        {msg.direction === 'internal_note' ? (
                          <div className="max-w-[80%] bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800 italic">
                            <p className="text-[10px] font-medium text-yellow-600 mb-0.5">📝 Internal Note — {msg.sender_name}</p>
                            <p className="whitespace-pre-wrap">{msg.body}</p>
                            <p className="text-[10px] text-yellow-500 mt-1">{relativeTime(msg.created_at)}</p>
                          </div>
                        ) : (
                          <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm
                            ${msg.direction === 'outbound'
                              ? 'bg-purple-50 text-neutral-800 border border-purple-200 rounded-br-sm'
                              : 'bg-gray-100 text-neutral-800 border border-gray-200 rounded-bl-sm'
                            }
                            ${msg.is_read === 0 && msg.direction === 'inbound' ? 'border-l-2 border-l-purple-400' : ''}
                          `}>
                            <p className="text-[10px] font-medium text-neutral-500 mb-0.5">
                              {msg.sender_name || (msg.direction === 'inbound' ? 'Customer' : 'Team')}
                              {msg.drafted_by_novi === 1 && <span className="ml-1 text-purple-500">💜 Novi</span>}
                            </p>
                            <p className="whitespace-pre-wrap">{msg.body}</p>
                            <p className="text-[10px] text-neutral-400 mt-1">{relativeTime(msg.created_at)}</p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Customer Context Sidebar */}
                {showContext && (
                  <div className="w-48 flex-shrink-0 border-l border-rose-100 bg-rose-50/20 p-3 overflow-y-auto hidden lg:block">
                    {contextLoading ? (
                      <p className="text-xs text-neutral-400">Loading...</p>
                    ) : customerContext ? (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-neutral-700">Customer Profile</p>
                        <div className="text-[10px] space-y-1.5">
                          <p className="text-neutral-600">📦 Orders: <strong>{customerContext.order_count || 0}</strong></p>
                          <p className="text-neutral-600">💰 LTV: <strong>{formatCurrency(customerContext.lifetime_value)}</strong></p>
                          <p className="text-neutral-600">📅 Last: <strong>{formatDate(customerContext.orders?.[0]?.created_at)}</strong></p>
                          <p className="text-neutral-600">🔄 Returns: <strong>{customerContext.returns?.length || 0}</strong></p>
                          {customerContext.notes?.length > 0 && (
                            <p className="text-neutral-600">📝 Notes: <strong>{customerContext.notes.length}</strong></p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-400">No data available</p>
                    )}
                  </div>
                )}
              </div>

              {/* Reply Box */}
              <div className="p-3 border-t border-rose-100 bg-white flex-shrink-0">
                {noviDraftResult && (
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                      💜 Novi suggested · {Math.round(noviDraftResult.confidence * 100)}% confidence
                    </span>
                    <span className="text-[10px] text-neutral-400">{noviDraftResult.suggested_action?.replace(/_/g, ' ')}</span>
                  </div>
                )}
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  rows={3}
                  placeholder="Type your reply..."
                  className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-300"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-2">
                  <label className="flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={replyIsInternalNote}
                      onChange={e => setReplyIsInternalNote(e.target.checked)}
                      className="rounded border-rose-300"
                    />
                    Internal note
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleNoviDraft}
                      loading={noviDrafting}
                      disabled={!selectedConversation}
                    >
                      💜 Draft with Novi
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSendReply}
                      loading={replySending}
                      disabled={!replyText.trim() || !selectedConversation}
                    >
                      {replyIsInternalNote ? '📝 Save Note' : '📤 Send'}
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] text-neutral-400 mt-1">Cmd+Enter to send</p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Customer Search Tab
  // ═══════════════════════════════════════════════════════════════════
  function renderSearchTab() {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name, email, or order number..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1 px-4 py-2 rounded-lg border border-rose-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          <Button onClick={handleSearch} loading={loading}>
            🔍 Search
          </Button>
        </div>

        {/* Results list */}
        {customers.length > 0 && !selectedCustomer && (
          <div className="space-y-2">
            {customers.map((c, i) => (
              <div
                key={i}
                className="bg-white rounded-lg border border-rose-100 p-4 cursor-pointer hover:border-rose-300 hover:shadow-sm transition-all"
                onClick={() => handleViewCustomer(c.customer_email)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-neutral-800">{c.customer_name}</p>
                    <p className="text-xs text-neutral-500">{c.customer_email}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-neutral-600">📦 {c.total_orders} orders</span>
                    <span className="text-neutral-600">💰 {formatCurrency(c.lifetime_value)}</span>
                    <span className="text-xs text-neutral-400">Last: {formatDate(c.last_order_date)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Customer HQ */}
        {hqLoading && <Skeleton variant="card" className="mb-4" />}

        {selectedCustomer && (
          <div className="space-y-4">
            {/* Back button */}
            <Button variant="secondary" size="sm" onClick={() => setSelectedCustomer(null)}>
              ← Back to search
            </Button>

            {/* Stats Bar */}
            <div className="bg-gradient-to-r from-rose-50 to-white rounded-xl border border-rose-100 p-5">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-neutral-800">
                    {selectedCustomer.profile.name}
                  </h3>
                  <p className="text-sm text-neutral-500">{selectedCustomer.profile.email}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedCustomer.profile.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                        {tag}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag); }}
                          className="ml-0.5 hover:text-purple-900"
                        >×</button>
                      </span>
                    ))}
                    <button
                      onClick={() => { setTagInput(''); setTagModalOpen(true); }}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                    >
                      + tag
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDraftOrderId(null);
                      setDraftContext('general');
                      setDraftResponse(null);
                      setDraftModalOpen(true);
                    }}
                  >
                    ✏️ Draft Email
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setNoteCustomerEmail(selectedCustomer.profile.email);
                      setNoteOrderId(null);
                      setNoteText('');
                      setNoteType('general');
                      setNoteModalOpen(true);
                    }}
                  >
                    📝 Add Note
                  </Button>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                <div className="bg-white rounded-lg p-3 border border-rose-50">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">Total Orders</p>
                  <p className="text-lg font-semibold text-neutral-800">{selectedCustomer.profile.totalOrders}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-rose-50">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">Lifetime Value</p>
                  <p className="text-lg font-semibold text-neutral-800">{formatCurrency(selectedCustomer.profile.lifetimeValue)}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-rose-50">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">Avg Order</p>
                  <p className="text-lg font-semibold text-neutral-800">{formatCurrency(selectedCustomer.profile.avgOrderValue)}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-rose-50">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">First Order</p>
                  <p className="text-lg font-semibold text-neutral-800">{formatDate(selectedCustomer.profile.firstOrderDate)}</p>
                </div>
              </div>

              {/* Affiliate info */}
              {selectedCustomer.affiliate && (
                <div className="mt-3 bg-purple-50 rounded-lg p-3 border border-purple-100">
                  <p className="text-sm font-medium text-purple-800">🎁 Affiliate: {selectedCustomer.affiliate.discount_code}</p>
                  <p className="text-xs text-purple-600 mt-1">
                    {selectedCustomer.affiliate.total_referrals} referrals · {formatCurrency(selectedCustomer.affiliate.total_revenue_generated)} revenue · {formatCurrency(selectedCustomer.affiliate.store_credit_balance)} credit
                  </p>
                </div>
              )}

              {/* Store Credit */}
              {storeCredit && storeCredit.totalBalance > 0 && (
                <div className="mt-3 bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-blue-800">💰 Available Store Credit</p>
                    <p className="text-lg font-bold text-blue-700">{formatCurrency(storeCredit.totalBalance)}</p>
                  </div>
                  {storeCredit.credits.map((sc) => (
                    <div key={sc.id} className="mt-2 bg-white rounded-lg p-2 border border-blue-100 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-medium text-blue-700">{sc.store_credit_code}</span>
                        <span className="text-blue-600">{formatCurrency(sc.amount_remaining)} of {formatCurrency(sc.amount_issued)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-blue-400">
                        <span>Issued: {formatDate(sc.issued_at)}</span>
                        {sc.order_number && <span>via Order #{sc.order_number}</span>}
                      </div>
                    </div>
                  ))}
                  {/* Redemption history */}
                  {storeCredit.redemptions.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-blue-200">
                      <p className="text-xs font-medium text-blue-600 mb-1">Redemption History</p>
                      {storeCredit.redemptions.map((r) => (
                        <div key={r.id} className="text-xs text-blue-500 flex justify-between">
                          <span>{formatCurrency(r.amount_applied)} applied to Order #{r.order_number}</span>
                          <span>{formatDate(r.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Order History */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide mb-2">Order History</h4>
              {selectedCustomer.orders.length === 0 ? (
                <p className="text-sm text-neutral-400">No orders found.</p>
              ) : (
                <div className="space-y-2">
                  {selectedCustomer.orders.map((order: any) => (
                    <div key={order.id} className="bg-white rounded-lg border border-rose-50 p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-sm text-neutral-800">#{order.order_number}</span>
                        <span className="text-xs text-neutral-400">{order.source}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${statusColor(order.status)}`}>
                          {order.status}
                        </span>
                        {order.cs_status && order.cs_status !== 'none' && (
                          <span className="text-xs text-purple-600">{order.cs_status}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-neutral-600">
                        <span>{order.item_count} items</span>
                        <span>{formatCurrency(order.total_amount)}</span>
                        <span className="text-xs text-neutral-400">{formatDate(order.created_at)}</span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setDraftOrderId(order.id);
                            setDraftContext('general');
                            setDraftResponse(null);
                            setDraftModalOpen(true);
                          }}
                        >
                          ✏️
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Returns History */}
            {selectedCustomer.returns.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide mb-2">Returns & Refunds</h4>
                <div className="space-y-2">
                  {selectedCustomer.returns.map((rr: any) => (
                    <div key={rr.id} className="bg-white rounded-lg border border-rose-50 p-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(rr.status)}`}>
                        {rr.status}
                      </span>
                      <span className="ml-2 text-xs text-neutral-600">{rr.type} · Order #{rr.order_number}</span>
                      {rr.amount && <span className="ml-2 text-xs text-neutral-500">{formatCurrency(rr.amount)}</span>}
                      {rr.reason && <p className="text-xs text-neutral-500 mt-1">Reason: {rr.reason}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Communication Timeline */}
            {selectedCustomer.communications.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide mb-2">Communications</h4>
                <div className="space-y-2">
                  {selectedCustomer.communications.slice(0, 10).map((comm: any, i: number) => (
                    <div key={i} className={`rounded-lg border p-3 ${comm.source === 'email' ? 'bg-blue-50 border-blue-100' : 'bg-yellow-50 border-yellow-100'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">{comm.source === 'email' ? '📧 Email' : '📝 Note'}</span>
                        {comm.note_type && <span className="text-xs text-neutral-500">· {comm.note_type}</span>}
                        {comm.status && comm.source === 'email' && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${comm.status === 'sent' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                            {comm.status}
                          </span>
                        )}
                      </div>
                      {comm.source === 'email' ? (
                        <>
                          <p className="text-sm font-medium text-neutral-700">{comm.subject}</p>
                          <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{comm.content}</p>
                        </>
                      ) : (
                        <p className="text-sm text-neutral-700">{comm.content}</p>
                      )}
                      <p className="text-xs text-neutral-400 mt-1">{formatDate(comm.created_at)}{comm.created_by_name ? ` — ${comm.created_by_name}` : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {customers.length === 0 && !loading && !selectedCustomer && (
          <EmptyState
            title="Search Customers"
            description="Search by name, email, or order number to find customer profiles, order history, and communication timelines."
          />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Returns & Refunds
  // ═══════════════════════════════════════════════════════════════════
  function renderReturnsTab() {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <select
            value={returnsFilter}
            onChange={e => { setReturnsFilter(e.target.value); setTimeout(loadReturns, 0); }}
            className="px-3 py-2 rounded-lg border border-rose-200 text-sm bg-white"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="processed">Processed</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={returnsTypeFilter}
            onChange={e => { setReturnsTypeFilter(e.target.value); setTimeout(loadReturns, 0); }}
            className="px-3 py-2 rounded-lg border border-rose-200 text-sm bg-white"
          >
            <option value="">All Types</option>
            <option value="refund">Refund</option>
            <option value="replacement">Replacement</option>
            <option value="store_credit">Store Credit</option>
          </select>
          <Button variant="secondary" size="sm" onClick={loadReturns}>
            🔄 Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => openCreateReturn()}>
            ➕ New Return/Refund
          </Button>
        </div>

        {loading ? (
          <div className="space-y-1">
            {[1, 2, 3].map(i => <Skeleton key={i} variant="table-row" />)}
          </div>
        ) : returns.length === 0 ? (
          <EmptyState
            title="No returns or refunds"
            description="Returns will appear here when customers request refunds, replacements, or store credit."
          />
        ) : (
          <div className="space-y-3">
            {returns.map((rr) => (
              <div key={rr.id} className="bg-white rounded-xl border border-rose-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(rr.status)}`}>
                        {rr.status}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-medium">
                        {rr.type.replace('_', ' ')}
                      </span>
                      <span className="text-sm text-neutral-500">Order #{rr.order_number}</span>
                    </div>
                    <p className="text-sm font-medium text-neutral-800">{rr.customer_name} ({rr.customer_email})</p>
                    {rr.reason && <p className="text-xs text-neutral-500 mt-1">Reason: {rr.reason}</p>}
                    {rr.notes && <p className="text-xs text-neutral-400 mt-0.5 italic">{rr.notes}</p>}
                    {rr.amount != null ? <p className="text-xs text-neutral-500 mt-0.5">Amount: {formatCurrency(rr.amount)}</p> : null}
                    {rr.replacement_order_id ? <p className="text-xs text-emerald-600 mt-0.5">Replacement: #{rr.replacement_order_id}</p> : null}
                    {rr.store_credit_code ? <p className="text-xs text-blue-600 mt-0.5">Credit: {rr.store_credit_code}</p> : null}
                    <p className="text-xs text-neutral-400 mt-1">{formatDate(rr.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {rr.status === 'pending' && (
                      <>
                        <Button size="sm" variant="primary" onClick={() => handleApprove(rr.id)}>✅ Approve</Button>
                        <Button size="sm" variant="danger" onClick={() => handleReject(rr.id)}>❌ Reject</Button>
                      </>
                    )}
                    {rr.status === 'approved' && (
                      <Button size="sm" variant="primary" onClick={() => handleProcess(rr.id)}>🔧 Process</Button>
                    )}
                    {rr.status === 'processed' && (
                      <span className="text-xs text-emerald-600 font-medium px-2 py-1">✅ Complete</span>
                    )}
                    {rr.status === 'rejected' && (
                      <span className="text-xs text-red-500 font-medium px-2 py-1">🚫 Rejected</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Approvals
  // ═══════════════════════════════════════════════════════════════════
  function renderApprovalsTab() {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <select
            value={approvalFilter}
            onChange={e => { setApprovalFilter(e.target.value); setTimeout(loadApprovals, 0); }}
            className="px-3 py-2 rounded-lg border border-rose-200 text-sm bg-white"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="denied">Denied</option>
          </select>
          <Button variant="secondary" size="sm" onClick={loadApprovals}>🔄 Refresh</Button>
        </div>

        {approvals.length === 0 ? (
          <EmptyState
            title="No approvals"
            description="Approval requests for large credits, refund overrides, and replacements will appear here."
          />
        ) : (
          <div className="space-y-3">
            {approvals.map((a) => (
              <div key={a.id} className="bg-white rounded-xl border border-rose-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(a.status)}`}>
                        {a.status}
                      </span>
                      <span className="text-xs font-medium text-purple-600 uppercase">{a.type.replace('_', ' ')}</span>
                    </div>
                    <p className="text-sm text-neutral-700">
                      Requested by <strong>{a.requested_by_name}</strong>
                    </p>
                    {a.request_data && (
                      <div className="mt-2 text-xs text-neutral-500 space-y-1">
                        {a.request_data.order_id && <p>Order: #{a.request_data.order_id}</p>}
                        {a.request_data.customer_email && <p>Customer: {a.request_data.customer_email}</p>}
                        {a.request_data.requested_amount && <p>Amount: {formatCurrency(a.request_data.requested_amount)}</p>}
                        {a.request_data.reason && <p>Reason: {a.request_data.reason}</p>}
                        {a.request_data.notes && <p className="italic">{a.request_data.notes}</p>}
                      </div>
                    )}
                    {a.reviewed_by_name && (
                      <p className="text-xs text-neutral-400 mt-1">Reviewed by {a.reviewed_by_name}</p>
                    )}
                    <p className="text-xs text-neutral-400 mt-1">{formatDate(a.created_at)}</p>
                  </div>
                  {a.status === 'pending' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" variant="primary" onClick={() => handleApproveApproval(a.id)}>✅ Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => handleDenyApproval(a.id)}>❌ Deny</Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Email Templates
  // ═══════════════════════════════════════════════════════════════════
  function renderTemplatesTab() {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Button onClick={openNewTemplate}>➕ New Template</Button>
        </div>

        {templates.length === 0 ? (
          <EmptyState
            title="No email templates"
            description="Create reusable email templates with merge fields like {{customer_name}} for quick, consistent customer communication."
          />
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <div key={t.id} className="bg-white rounded-xl border border-rose-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm text-neutral-800">{t.name}</h4>
                    <p className="text-xs text-neutral-500 mt-0.5">{t.subject}</p>
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{t.body}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="secondary" onClick={() => openEditTemplate(t)}>✏️</Button>
                    <Button size="sm" variant="danger" onClick={() => handleDeleteTemplate(t.id)}>🗑️</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Timeline
  // ═══════════════════════════════════════════════════════════════════
  function renderTimelineTab() {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <input
            type="number"
            placeholder="Order ID"
            value={timelineOrderId}
            onChange={e => setTimelineOrderId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTimelineLookup()}
            className="w-48 px-4 py-2 rounded-lg border border-rose-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          <Button onClick={handleTimelineLookup} loading={timelineLoading}>📅 Show Timeline</Button>
        </div>

        {timeline && (
          <div>
            <div className="bg-white rounded-xl border border-rose-100 p-4 mb-4">
              <h3 className="font-semibold text-neutral-800">Order #{timeline.order.order_number}</h3>
              <p className="text-sm text-neutral-500">{timeline.order.customer_name} · {timeline.order.source} · Status: {timeline.order.status}</p>
            </div>

            <div className="relative">
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-rose-200" />
              <div className="space-y-4">
                {timeline.events.map((event, i) => (
                  <div key={event.id || i} className="relative flex items-start gap-4 pl-12">
                    <div className="absolute left-3.5 w-3 h-3 rounded-full bg-rose-400 border-2 border-white shadow-sm" />
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-600 border border-rose-200 flex-shrink-0">
                      {engineIcon(event.engine)} {event.engine}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800">{event.label}</p>
                      <p className="text-xs text-neutral-500">{event.details}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{formatDate(event.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!timeline && !timelineLoading && (
          <EmptyState
            title="View an order timeline"
            description="Enter an order ID to see the complete journey: created → production → packed → shipped → CS actions."
          />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: Packing Proof
  // ═══════════════════════════════════════════════════════════════════
  function renderPackingTab() {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <input
            type="number"
            placeholder="Order ID"
            value={packingOrderId}
            onChange={e => setPackingOrderId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePackingLookup()}
            className="w-48 px-4 py-2 rounded-lg border border-rose-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          <Button onClick={handlePackingLookup} loading={packingLoading}>🔍 Load Proof</Button>
          <Button variant="secondary" onClick={() => {
            setProofOrderIdInput(packingOrderId);
            setProofType('photo');
            setProofNotes('');
            setProofWeight('');
            setProofModalOpen(true);
          }}>➕ Add Proof</Button>
        </div>

        {packingProofs.length > 0 ? (
          <div className="space-y-3">
            {packingProofs.map((pp) => {
              let data: any = {};
              try { data = JSON.parse(pp.data); } catch {}
              return (
                <div key={pp.id} className="bg-white rounded-xl border border-rose-100 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{pp.proof_type === 'photo' ? '📸' : pp.proof_type === 'weight_check' ? '⚖️' : '✅'}</span>
                    <span className="text-sm font-medium text-neutral-700 capitalize">{pp.proof_type.replace('_', ' ')}</span>
                    <span className="text-xs text-neutral-400">— {formatDate(pp.created_at)}</span>
                  </div>
                  {data.notes && <p className="text-sm text-neutral-600">{data.notes}</p>}
                  {data.weightCheck && <p className="text-sm text-neutral-500">Weight: {data.weightCheck}</p>}
                  {pp.created_by_name && <p className="text-xs text-neutral-400 mt-2">By {pp.created_by_name}</p>}
                </div>
              );
            })}
          </div>
        ) : !packingLoading && packingOrderId ? (
          <EmptyState title="No packing proof yet" description="Add packing proof using the 'Add Proof' button." />
        ) : (
          <EmptyState title="View packing proof" description="Enter an order ID to see packing proof records." />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div>
      <PageHeader
        title="Customer Hub"
        description="Search customers, manage returns & refunds, approvals, email templates, order timelines, and packing proof."
        novi={<Novi size="sm" accessory="customer-service" />}
      />

      <div className="mt-6 mb-6">
        <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'inbox' && renderInboxTab()}
      {activeTab === 'search' && renderSearchTab()}
      {activeTab === 'returns' && renderReturnsTab()}
      {activeTab === 'approvals' && renderApprovalsTab()}
      {activeTab === 'templates' && renderTemplatesTab()}
      {activeTab === 'timeline' && renderTimelineTab()}
      {activeTab === 'packing' && renderPackingTab()}

      {/* ── Add Note Modal ─────────────────────────────────────────── */}
      <Modal open={noteModalOpen} onClose={() => setNoteModalOpen(false)} title="Add Customer Note">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Customer Email</label>
            <input type="text" value={noteCustomerEmail} onChange={e => setNoteCustomerEmail(e.target.value)}
              placeholder="customer@email.com" disabled={!!selectedCustomer}
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Order ID (optional)</label>
            <input type="number" value={noteOrderId ?? ''} onChange={e => setNoteOrderId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Note Type</label>
            <select value={noteType} onChange={e => setNoteType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm">
              <option value="general">General</option>
              <option value="complaint">Complaint</option>
              <option value="compliment">Compliment</option>
              <option value="follow_up">Follow Up</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Note</label>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm resize-none"
              placeholder="Enter note..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setNoteModalOpen(false)}>Cancel</Button>
          <Button onClick={handleAddNote} loading={noteSaving} disabled={!noteCustomerEmail || !noteText.trim()}>Save Note</Button>
        </div>
      </Modal>

      {/* ── Draft Email Modal ──────────────────────────────────────── */}
      <Modal open={draftModalOpen} onClose={() => { setDraftModalOpen(false); setDraftResponse(null); }} title="Draft Customer Response">
        <div className="space-y-4">
          {!draftResponse ? (
            <>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Context</label>
                <select value={draftContext} onChange={e => setDraftContext(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm">
                  <option value="general">General</option>
                  <option value="refund">Refund</option>
                  <option value="replacement">Replacement</option>
                  <option value="complaint">Complaint</option>
                  <option value="follow_up">Follow Up</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Order ID (optional)</label>
                <input type="number" value={draftOrderId ?? ''} onChange={e => setDraftOrderId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm" />
              </div>
              <Button onClick={handleDraftResponse} loading={draftLoading} className="w-full">
                ✨ Draft Response
              </Button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Subject</label>
                <input type="text" value={draftResponse.subject} onChange={e => setDraftResponse({ ...draftResponse, subject: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Body</label>
                <textarea value={draftResponse.body} onChange={e => setDraftResponse({ ...draftResponse, body: e.target.value })} rows={10}
                  className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm resize-none font-sans" />
              </div>
              <div className="flex justify-between gap-2 mt-4">
                <Button variant="secondary" onClick={() => setDraftResponse(null)}>← Back</Button>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setDraftModalOpen(false)}>Cancel</Button>
                  <Button onClick={handleSendDraft} loading={emailSending}>📧 Send Email</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Add Packing Proof Modal ─────────────────────────────────── */}
      <Modal open={proofModalOpen} onClose={() => setProofModalOpen(false)} title="Add Packing Proof">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Order ID</label>
            <input type="number" value={proofOrderIdInput} onChange={e => setProofOrderIdInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Proof Type</label>
            <select value={proofType} onChange={e => setProofType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm">
              <option value="photo">Photo</option>
              <option value="weight_check">Weight Check</option>
              <option value="checklist">Checklist</option>
            </select>
          </div>
          {proofType === 'weight_check' && (
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Weight</label>
              <input type="text" value={proofWeight} onChange={e => setProofWeight(e.target.value)}
                placeholder="e.g. 2.5oz" className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Notes</label>
            <textarea value={proofNotes} onChange={e => setProofNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm resize-none"
              placeholder="e.g. Checked item before shipping..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setProofModalOpen(false)}>Cancel</Button>
          <Button onClick={handleAddPackingProof} loading={proofSaving} disabled={!proofOrderIdInput.trim()}>Save Proof</Button>
        </div>
      </Modal>

      {/* ── Email Template Modal ───────────────────────────────────── */}
      <Modal open={templateModalOpen} onClose={() => setTemplateModalOpen(false)} title={editingTemplate ? 'Edit Template' : 'New Template'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Template Name</label>
            <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)}
              placeholder="e.g. Refund Confirmation" className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Subject</label>
            <input type="text" value={templateSubject} onChange={e => setTemplateSubject(e.target.value)}
              placeholder="Subject line (use {{variable}} for merge fields)"
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">
              Body <span className="text-xs text-neutral-400">(use {'{{customer_name}}'}, {'{{order_number}}'}, {'{{refund_amount}}'}, etc.)</span>
            </label>
            <textarea value={templateBody} onChange={e => setTemplateBody(e.target.value)} rows={8}
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm resize-none font-sans"
              placeholder="Write your template body..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setTemplateModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveTemplate} loading={templateSaving} disabled={!templateName || !templateSubject || !templateBody}>
            Save Template
          </Button>
        </div>
      </Modal>

      {/* ── Add Tag Modal ──────────────────────────────────────────── */}
      <Modal open={tagModalOpen} onClose={() => setTagModalOpen(false)} title="Add Customer Tag">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Tag</label>
            <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTag()}
              placeholder="e.g. vip, wholesale, problematic"
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setTagModalOpen(false)}>Cancel</Button>
          <Button onClick={handleAddTag} loading={tagSaving} disabled={!tagInput.trim()}>Add Tag</Button>
        </div>
      </Modal>

      {/* ── Create Return/Refund Modal ──────────────────────────────── */}
      <Modal open={createReturnModalOpen} onClose={() => setCreateReturnModalOpen(false)} title="Create Return/Refund">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Order ID *</label>
            <input
              type="number"
              value={createReturnOrderId}
              onChange={e => setCreateReturnOrderId(e.target.value)}
              placeholder="Enter the order ID..."
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm"
              autoFocus
            />
            <p className="text-xs text-neutral-400 mt-1">The order number (e.g. order ID from the Orders page)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Return Type *</label>
            <select
              value={createReturnType}
              onChange={e => setCreateReturnType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm"
            >
              <option value="refund">Refund</option>
              <option value="replacement">Replacement</option>
              <option value="store_credit">Store Credit</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Reason</label>
            <input
              type="text"
              value={createReturnReason}
              onChange={e => setCreateReturnReason(e.target.value)}
              placeholder="e.g. Damaged in transit, wrong item, customer changed mind..."
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Amount (optional)</label>
            <input
              type="number"
              value={createReturnAmount}
              onChange={e => setCreateReturnAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setCreateReturnModalOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateReturn}
            loading={createReturnSaving}
            disabled={!createReturnOrderId.trim() || !createReturnType}
          >
            Create Return/Refund
          </Button>
        </div>
      </Modal>

      {/* ── New Conversation Modal ────────────────────────────────── */}
      <Modal open={newConvModalOpen} onClose={() => setNewConvModalOpen(false)} title="New Conversation">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Customer Email *</label>
            <input
              type="email"
              value={newConvEmail}
              onChange={e => setNewConvEmail(e.target.value)}
              placeholder="customer@example.com"
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">Subject</label>
            <input
              type="text"
              value={newConvSubject}
              onChange={e => setNewConvSubject(e.target.value)}
              placeholder="Optional subject line..."
              className="w-full px-3 py-2 rounded-lg border border-rose-200 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setNewConvModalOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateConversation} loading={newConvSaving} disabled={!newConvEmail.trim()}>
            Create Conversation
          </Button>
        </div>
      </Modal>
    </div>
  );
}
