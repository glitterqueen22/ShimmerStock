import { useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useIndustry } from '../../context/IndustryContext';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { RADIUS } from '../../design/tokens';
import { MOTION } from '../../design/motion';

// ── Link Configuration ────────────────────────────────────────────
interface NavLinkConfig {
  to: string;
  label: string;
  icon: string;
  engine?: string; // engine name for adaptive labels
  perm?: string;
  roles?: string[];
}

// ── Primary links: 4 (Commerce rendered separately) ────────────────
const PRIMARY_LINKS: NavLinkConfig[] = [
  { to: '/bestie', label: 'Novi', icon: '✨', engine: 'novi' },
  { to: '/hq', label: 'Dashboard', icon: '🏠' },
  { to: '/products', label: 'Products', icon: '📦', engine: 'products' },
  { to: '/orders', label: 'Orders', icon: '📋', engine: 'orders' },
];

// ── Commerce section (rendered as primary link with dropdown) ──────
const COMMERCE_LINKS: NavLinkConfig[] = [
  { to: '/commerce', label: 'Commerce Hub', icon: '🛒', engine: 'commerce' },
  { to: '/fulfillment', label: 'Fulfillment HQ', icon: '🚚', engine: 'fulfillment' },
  { to: '/customers', label: 'Customer Hub', icon: '👥', engine: 'customer_service' },
  { to: '/partners', label: 'Partners', icon: '🤝', engine: 'partners' },
  { to: '/brand-setup', label: 'Brand Setup', icon: '🏷️', engine: 'brand_setup' },
];

// ── Operations dropdown ────────────────────────────────────────────
const OPERATIONS_LINKS: NavLinkConfig[] = [
  { to: '/warehouse', label: 'Warehouse', icon: '🏗️', engine: 'warehouse', perm: 'inventory.read' },
  { to: '/production', label: 'Production', icon: '🏭', engine: 'production', perm: 'production.read' },
  { to: '/purchasing', label: 'Purchasing', icon: '📊', engine: 'purchasing', perm: 'purchasing.read' },
  { to: '/calc', label: 'Calculator', icon: '🧮', engine: 'calculation', perm: 'calculation.read' },
  { to: '/scan', label: 'Barcode Scanner', icon: '📷' },
];

// ── Growth dropdown ────────────────────────────────────────────────
const GROWTH_LINKS: NavLinkConfig[] = [
  { to: '/growth', label: 'Analytics', icon: '📈', engine: 'growth' },
  { to: '/studio', label: 'Studio', icon: '🎨', engine: 'studio' },
  { to: '/opportunities', label: 'Opportunities', icon: '💡', engine: 'opportunities' },
];

// ── Admin links (for Settings split-button dropdown) ───────────────
const ADMIN_LINKS: NavLinkConfig[] = [
  { to: '/team', label: 'Team', icon: '👥', engine: 'team' },
  { to: '/timeline', label: 'Timeline', icon: '📅', engine: 'timeline', roles: ['owner', 'admin', 'manager'] },
  { to: '/audit-log', label: 'Audit Log', icon: '🔍', roles: ['owner', 'admin', 'manager'] },
  { to: '/sync-log', label: 'Sync Log', icon: '🔄', roles: ['owner', 'admin', 'manager'] },
];

// Settings direct link (used in mobile drawer admin section)
const SETTINGS_DIRECT: NavLinkConfig[] = [
  { to: '/settings', label: 'Settings', icon: '⚙️', engine: 'settings' },
];

// Dropdown definitions for rendering (right utility zone)
interface DropdownGroup {
  key: string;
  label: string;
  icon: string;
  links: NavLinkConfig[];
}

const DROPDOWNS: DropdownGroup[] = [
  { key: 'ops', label: 'Ops', icon: '🏭', links: OPERATIONS_LINKS },
  { key: 'growth', label: 'Growth', icon: '📈', links: GROWTH_LINKS },
];

// Mobile drawer sections (grouped with headers)
const MOBILE_SECTIONS = [
  { header: null, links: PRIMARY_LINKS },
  { header: 'COMMERCE', links: COMMERCE_LINKS },
  { header: 'OPERATIONS', links: OPERATIONS_LINKS },
  { header: 'GROWTH', links: GROWTH_LINKS },
  { header: 'ADMIN', links: [...SETTINGS_DIRECT, ...ADMIN_LINKS] },
];

// ── Role-to-Permission mapping (synced with server/db.js) ─────────
const PERM_ROLES: Record<string, string[]> = {
  'production.read': ['owner', 'admin', 'manager', 'warehouse', 'manufacturing'],
  'inventory.read': ['owner', 'admin', 'manager', 'warehouse', 'manufacturing', 'customer_service'],
  'calculation.read': ['owner', 'admin', 'manager', 'manufacturing', 'warehouse'],
  'purchasing.read': ['owner', 'admin', 'manager', 'manufacturing', 'warehouse'],
};

// ── Component ─────────────────────────────────────────────────────
export function Navbar() {
  const { user, logout, logoutAll } = useAuth();
  const { getLabel } = useIndustry();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [oppBadge, setOppBadge] = useState(0);
  const [noviBadge, setNoviBadge] = useState(0);
  const [csBadge, setCsBadge] = useState(0);

  // ── Fetch opportunities badge count ──────────────────────────────
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('shimmerstock_token');
    if (!token) return;

    fetch('/api/opportunities/summary', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.summary?.total) {
          setOppBadge(data.summary.total);
        }
      })
      .catch(() => {});
  }, [user, location.pathname]);

  // ── Fetch Novi unread badge count ────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('shimmerstock_token');
    if (!token) return;

    fetch('/api/novi/messages/summary', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.unread_count) {
          setNoviBadge(data.unread_count);
        }
      })
      .catch(() => {});
  }, [user, location.pathname]);

  // ── Fetch CS inbox unread badge count ───────────────────────────
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('shimmerstock_token');
    if (!token) return;

    fetch('/api/cs/unread-count', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.total) {
          setCsBadge(data.total);
        } else {
          setCsBadge(0);
        }
      })
      .catch(() => {});
  }, [user, location.pathname]);

  // ── Close mobile drawer on route change ──────────────────────────
  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
    setOpenDropdown(null);
  }, [location.pathname]);

  // ── Lock body scroll when mobile drawer open ─────────────────────
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  // ── Link visibility ──────────────────────────────────────────────
  const isLinkVisible = useCallback(
    (link: NavLinkConfig): boolean => {
      if (!user) return false;
      if (link.roles && !link.roles.includes(user.role)) return false;
      if (link.perm) {
        const allowedRoles = PERM_ROLES[link.perm] || [];
        if (!allowedRoles.includes(user.role)) return false;
      }
      return true;
    },
    [user]
  );

  const visiblePrimary = PRIMARY_LINKS.filter(isLinkVisible);
  const visibleCommerceLinks = COMMERCE_LINKS.filter(isLinkVisible);
  const visibleDropdowns = DROPDOWNS.map(group => ({
    ...group,
    links: group.links.filter(isLinkVisible),
  })).filter(group => group.links.length > 0);
  const visibleAdminLinks = ADMIN_LINKS.filter(isLinkVisible);

  // ── Handlers ─────────────────────────────────────────────────────
  async function handleLogout() {
    setLoggingOut(true);
    setUserMenuOpen(false);
    await logout();
  }

  async function handleLogoutAll() {
    setLoggingOutAll(true);
    setUserMenuOpen(false);
    try {
      await logoutAll();
    } catch {
      setLoggingOutAll(false);
    }
  }

  // ── Shared nav link renderer ─────────────────────────────────────
  function renderLink(link: NavLinkConfig, isMobile = false) {
    const showBadge = link.to === '/opportunities' && oppBadge > 0;
    const showNoviBadge = link.to === '/bestie' && noviBadge > 0;
    const showCsBadge = link.to === '/customers' && csBadge > 0;
    const displayLabel = link.engine ? getLabel(link.engine) : link.label;

    return (
      <NavLink
        key={link.to}
        to={link.to}
        end={link.to === '/bestie'}
        onClick={() => { setMobileOpen(false); setUserMenuOpen(false); }}
        className={({ isActive }) =>
          `${isMobile ? 'w-full' : ''} touch-target flex items-center gap-2 px-4 py-2 ${RADIUS.button}
           text-sm font-medium transition-all duration-200
           ${isActive
             ? 'bg-rose-500 text-white shadow-sm shadow-rose-300/40'
             : isMobile
               ? 'text-neutral-600 hover:bg-rose-50 hover:text-rose-600'
               : 'text-white/80 hover:bg-white/15 hover:text-white'
           }`
        }
      >
        <span className="text-lg leading-none">{link.icon}</span>
        <span className="flex-1">{displayLabel}</span>
        {showBadge && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
                           rounded-full text-xs font-bold bg-amber-400 text-amber-900">
            {oppBadge}
          </span>
        )}
        {showNoviBadge && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
                           rounded-full text-xs font-bold bg-purple-400 text-purple-900">
            {noviBadge}
          </span>
        )}
        {showCsBadge && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
                           rounded-full text-xs font-bold bg-rose-400 text-rose-900">
            {csBadge}
          </span>
        )}
      </NavLink>
    );
  }

  // ── Dropdown item renderer (shared across all dropdowns) ─────────
  function renderDropdownItem(link: NavLinkConfig) {
    const showBadge = link.to === '/opportunities' && oppBadge > 0;
    const showNoviBadge = link.to === '/bestie' && noviBadge > 0;
    const showCsBadge = link.to === '/customers' && csBadge > 0;
    const displayLabel = link.engine ? getLabel(link.engine) : link.label;

    return (
      <NavLink
        key={link.to}
        to={link.to}
        onClick={() => setOpenDropdown(null)}
        className={({ isActive }) =>
          `flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all duration-150
           ${isActive
             ? 'bg-rose-50 text-rose-600 font-medium border-l-2 border-rose-400'
             : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
           }`
        }
      >
        <span className="text-base leading-none w-5 text-center">{link.icon}</span>
        <span className="flex-1">{displayLabel}</span>
        {showBadge && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
                           rounded-full text-xs font-bold bg-amber-400 text-amber-900">
            {oppBadge}
          </span>
        )}
        {showNoviBadge && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
                           rounded-full text-xs font-bold bg-purple-400 text-purple-900">
            {noviBadge}
          </span>
        )}
        {showCsBadge && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
                           rounded-full text-xs font-bold bg-rose-400 text-rose-900">
            {csBadge}
          </span>
        )}
      </NavLink>
    );
  }

  if (!user) return null;

  return (
    <>
      {/* ── Desktop/Mobile Navbar ────────────────────────────────────── */}
      <nav className="bg-gradient-to-r from-rose-300 via-rose-400 to-rose-300 text-white shadow-lg shadow-rose-200/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* ── Left: Hamburger + Brand + WorkspaceSwitcher ────────── */}
            <div className="flex items-center gap-2">
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileOpen(true)}
                className="touch-target flex items-center justify-center p-2 rounded-lg
                           text-white/90 hover:bg-white/15 transition-all duration-200 lg:hidden"
                aria-label="Open navigation menu"
              >
                <span className="text-xl leading-none">☰</span>
              </button>

              {/* Brand */}
              <span className="text-2xl drop-shadow-sm hidden sm:inline">✨</span>
              <span className="text-xl font-bold tracking-tight animate-shimmer font-[family-name:var(--font-heading)] hidden sm:inline">
                ShimmerStock
              </span>

              {/* Workspace switcher — always visible on desktop */}
              {user.business_name && (
                <div className="hidden lg:flex items-center gap-2 ml-1">
                  <span className="text-white/50 text-lg font-light">·</span>
                  <WorkspaceSwitcher />
                </div>
              )}
            </div>

            {/* ── Center: Desktop primary links + Commerce pill ──────── */}
            <div className="hidden lg:flex items-center gap-1">
              {/* 4 standard primary links */}
              {visiblePrimary.map((link) => renderLink(link, false))}

              {/* Commerce — section-style primary link (pill) */}
              {visibleCommerceLinks.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'commerce' ? null : 'commerce')}
                    className={`touch-target flex items-center gap-1.5 px-4 py-2 rounded-full
                      text-sm font-medium transition-all duration-200
                      ${openDropdown === 'commerce'
                        ? 'bg-white/30 text-white ring-1 ring-white/30'
                        : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                  >
                    <span className="text-lg leading-none">🛒</span>
                    <span>Commerce</span>
                    <span className="text-[10px] ml-0.5">{openDropdown === 'commerce' ? '▴' : '▾'}</span>
                  </button>

                  {openDropdown === 'commerce' && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)} />
                      <div className={`absolute left-0 top-full mt-1 z-20 bg-white rounded-xl shadow-xl
                                      border border-rose-100 overflow-hidden min-w-[220px] ${MOTION.scaleIn}`}>
                        {/* Section header */}
                        <div className="px-4 pt-3 pb-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            COMMERCE
                          </span>
                        </div>
                        {/* Sell group */}
                        {visibleCommerceLinks.slice(0, 3).map(renderDropdownItem)}
                        {/* Divider + Grow group */}
                        {visibleCommerceLinks.length > 3 && (
                          <>
                            <div className="border-t border-neutral-100 mx-3 my-1" />
                            {visibleCommerceLinks.slice(3).map(renderDropdownItem)}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Right: Utility zone (Ops, Growth, Settings-split, User) */}
            <div className="flex items-center gap-2">
              {/* Ops + Growth dropdowns (desktop) */}
              <div className="hidden lg:flex items-center gap-2">
                {visibleDropdowns.map((group) => (
                  <div key={group.key} className="relative">
                    <button
                      onClick={() => setOpenDropdown(openDropdown === group.key ? null : group.key)}
                      className={`touch-target flex items-center gap-1.5 px-2.5 py-2 ${RADIUS.button}
                        text-sm font-medium transition-all duration-200
                        ${openDropdown === group.key
                          ? 'bg-rose-500 text-white shadow-sm shadow-rose-300/40'
                          : 'text-white/80 hover:bg-white/15 hover:text-white'
                        }`}
                    >
                      <span className="text-base leading-none">{group.icon}</span>
                      <span>{group.label}</span>
                      <span className="text-[10px] opacity-60">{openDropdown === group.key ? '▴' : '▾'}</span>
                    </button>

                    {openDropdown === group.key && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)} />
                        <div className={`absolute right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-xl
                                        border border-rose-100 overflow-hidden min-w-[180px] ${MOTION.scaleIn}`}>
                          <div className="py-1">
                            {group.links.map(renderDropdownItem)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Settings split button (desktop) */}
              <div className="hidden lg:inline-flex rounded-lg overflow-hidden">
                <button
                  onClick={() => navigate('/settings')}
                  className={`touch-target flex items-center px-2 py-2 text-sm font-medium
                             transition-all duration-200
                             ${openDropdown === 'admin'
                               ? 'bg-rose-500 text-white'
                               : 'text-white/80 hover:bg-white/15 hover:text-white'
                             }`}
                  aria-label="Settings"
                >
                  <span className="text-lg leading-none">⚙️</span>
                </button>
                {visibleAdminLinks.length > 0 && (
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'admin' ? null : 'admin')}
                    className={`touch-target flex items-center px-1 py-2 text-sm font-medium
                               transition-all duration-200 border-l border-white/20
                               ${openDropdown === 'admin'
                                 ? 'bg-rose-500 text-white'
                                 : 'text-white/60 hover:bg-white/15 hover:text-white'
                               }`}
                    aria-label="Admin menu"
                  >
                    <span className="text-[10px]">{openDropdown === 'admin' ? '▴' : '▾'}</span>
                  </button>
                )}

                {/* Admin dropdown */}
                {openDropdown === 'admin' && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)} />
                    <div className={`absolute right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-xl
                                    border border-rose-100 overflow-hidden min-w-[180px] ${MOTION.scaleIn}`}>
                      <div className="py-1">
                        {visibleAdminLinks.map(renderDropdownItem)}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* User info — compact */}
              <div className="hidden sm:flex items-center gap-2 text-xs text-white/70">
                <span className="truncate max-w-[100px] font-medium">{user.display_name}</span>
              </div>

              {/* User dropdown trigger */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="touch-target flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium
                             text-white/90 hover:bg-white/15 hover:text-white transition-all duration-200"
                >
                  <span className="text-lg leading-none">👤</span>
                  <span className="hidden sm:inline text-xs opacity-80">▼</span>
                </button>

                {/* User dropdown */}
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                    <div
                      className={`absolute right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-xl
                                  border border-rose-100 overflow-hidden min-w-[200px] ${MOTION.scaleIn}`}
                    >
                      {/* User info */}
                      <div className="px-4 py-3 border-b border-rose-50">
                        <p className="text-sm font-semibold text-neutral-800">{user.display_name}</p>
                        <p className="text-xs text-rose-400">@{user.username}</p>
                        <p className="text-xs text-rose-300 mt-0.5">{user.role}</p>
                      </div>

                      {/* Mobile-only workspace switcher */}
                      {user.business_name && (
                        <div className="lg:hidden border-b border-rose-50 px-4 py-3">
                          <p className="text-xs text-rose-400 font-medium uppercase tracking-wide mb-2">
                            Workspace
                          </p>
                          <WorkspaceSwitcher />
                        </div>
                      )}

                      {/* Logout */}
                      <button
                        onClick={handleLogout}
                        disabled={loggingOut || loggingOutAll}
                        className="w-full text-left px-4 py-3 text-sm text-red-600 font-medium
                                   hover:bg-red-50 transition-all duration-200
                                   disabled:opacity-50 flex items-center gap-2"
                      >
                        <span>{loggingOut ? '⏳' : '🚪'}</span>
                        <span>{loggingOut ? 'Signing out…' : 'Logout'}</span>
                      </button>

                      {/* Logout all */}
                      <button
                        onClick={handleLogoutAll}
                        disabled={loggingOut || loggingOutAll}
                        className="w-full text-left px-4 py-3 text-sm text-amber-600 font-medium
                                   hover:bg-amber-50 transition-all duration-200
                                   disabled:opacity-50 flex items-center gap-2
                                   border-t border-rose-50"
                      >
                        <span>{loggingOutAll ? '⏳' : '🔒'}</span>
                        <span>{loggingOutAll ? 'Signing out…' : 'Log out all devices'}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile Drawer Overlay ────────────────────────────────────── */}
      {mobileOpen && (
        <>
          {/* Dark backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />

          {/* Slide-in drawer */}
          <div
            className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white shadow-2xl
                        lg:hidden flex flex-col ${MOTION.slideRight}`}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between p-4 border-b border-rose-100">
              <div className="flex items-center gap-2">
                <span className="text-2xl">✨</span>
                <span className="text-lg font-bold font-[family-name:var(--font-heading)] text-rose-500">
                  ShimmerStock
                </span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="touch-target flex items-center justify-center p-2 rounded-lg
                           text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100
                           transition-all duration-200"
                aria-label="Close navigation menu"
              >
                <span className="text-lg leading-none">✕</span>
              </button>
            </div>

            {/* Nav links — grouped with section headers */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {MOBILE_SECTIONS.filter(
                (section) => section.links.some(isLinkVisible)
              ).map((section) => (
                <div key={section.header || 'primary'}>
                  {section.header && (
                    <div className="px-4 pt-4 pb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                        {section.header}
                      </span>
                    </div>
                  )}
                  {section.links.filter(isLinkVisible).map((link) => renderLink(link, true))}
                </div>
              ))}
            </div>

            {/* Workspace info at bottom */}
            <div className="p-4 border-t border-rose-100 bg-rose-50/30">
              <div className="flex items-center gap-3">
                <span className="text-2xl">👤</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-800 truncate">
                    {user.display_name}
                  </p>
                  <p className="text-xs text-rose-400 truncate">
                    @{user.username} · {user.role}
                  </p>
                  {user.business_name && (
                    <p className="text-xs text-rose-500 font-medium truncate mt-0.5">
                      ✨ {user.business_name}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
