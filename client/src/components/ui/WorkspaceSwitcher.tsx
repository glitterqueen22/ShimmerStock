import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { MOTION } from '../../design/motion';

export interface WorkspaceSwitcherProps {
  className?: string;
}

export function WorkspaceSwitcher({ className = '' }: WorkspaceSwitcherProps) {
  const { user, switchBusiness } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const businesses = user?.businesses || [];
  const activeBusiness = businesses.find((b) => b.is_active === 1);
  const currentName = activeBusiness?.name || user?.business_name || 'ShimmerStock';

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function handleSwitch(businessId: number) {
    try {
      await switchBusiness(businessId);
      setOpen(false);
      window.location.reload();
    } catch (err: any) {
      console.error('Failed to switch business:', err);
    }
  }

  const truncatedName = currentName.length > 20 ? currentName.slice(0, 18) + '…' : currentName;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium
                   text-white/80 hover:bg-white/15 hover:text-white
                   transition-all duration-200"
      >
        <span className="truncate max-w-[160px]">{truncatedName}</span>
        <span className={`text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {open && (
        <div
          className={`absolute left-0 top-full mt-1 z-30 bg-white rounded-xl shadow-xl
                      border border-rose-100 overflow-hidden min-w-[220px] ${MOTION.scaleIn}`}
        >
          <div className="px-4 py-2 border-b border-rose-50">
            <p className="text-xs text-rose-400 font-medium uppercase tracking-wide">
              Your Businesses
            </p>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {businesses.map((biz) => (
              <button
                key={biz.business_id}
                onClick={() => handleSwitch(biz.business_id)}
                disabled={biz.is_active === 1}
                className={`w-full text-left px-4 py-3 text-sm transition-all duration-200 flex items-center gap-2
                  ${biz.is_active === 1
                    ? 'bg-rose-50 text-rose-600 font-semibold cursor-default'
                    : 'text-neutral-700 hover:bg-rose-50/50 font-medium'
                  }`}
              >
                <span>{biz.is_active === 1 ? '✨' : '🏢'}</span>
                <span className="flex-1 truncate">{biz.name}</span>
                <span className="text-xs text-rose-300/70">{biz.role}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
