import { useAuth } from '../../contexts/AuthContext';
import { RADIUS } from '../../design/tokens';
import { MOTION } from '../../design/motion';

export interface BusinessSwitcherProps {
  className?: string;
}

export function BusinessSwitcher({ className = '' }: BusinessSwitcherProps) {
  const { user, switchBusiness } = useAuth();

  const businesses = user?.businesses || [];
  const activeBusinessId = user?.business_id;

  async function handleSwitch(businessId: number) {
    if (businessId === activeBusinessId) return;
    try {
      await switchBusiness(businessId);
      window.location.reload();
    } catch (err: any) {
      console.error('Failed to switch business:', err);
    }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-col gap-3">
        {businesses.map((biz) => {
          const isActive = biz.business_id === activeBusinessId;
          return (
            <div
              key={biz.business_id}
              className={`${RADIUS.card} p-4 border transition-all duration-200 ${MOTION.hover}
                ${isActive
                  ? 'border-rose-300 bg-rose-50/50 shadow-sm'
                  : 'border-neutral-200 bg-white hover:shadow-sm hover:border-rose-200'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{isActive ? '✨' : '🏢'}</span>
                  <div>
                    <h3 className="text-base font-semibold text-neutral-800">{biz.name}</h3>
                    <p className="text-xs text-neutral-500">
                      Role: <span className="font-medium text-rose-500">{biz.role}</span>
                    </p>
                  </div>
                </div>
                {isActive ? (
                  <span className="px-3 py-1 text-xs font-semibold bg-rose-100 text-rose-600 rounded-full">
                    Current
                  </span>
                ) : (
                  <button
                    onClick={() => handleSwitch(biz.business_id)}
                    className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-rose-400 to-rose-500
                               text-white rounded-lg shadow-sm shadow-rose-200/30
                               hover:from-rose-500 hover:to-rose-600 active:scale-[0.98]
                               transition-all duration-200"
                  >
                    Switch
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create new business CTA */}
      <div className={`${RADIUS.card} p-4 border-2 border-dashed border-rose-200 bg-rose-50/30
                       text-center transition-all duration-200 hover:border-rose-300 hover:bg-rose-50/60`}>
        <button
          className="flex items-center gap-2 mx-auto text-sm font-semibold text-rose-500 hover:text-rose-600
                     transition-colors duration-200"
        >
          <span>➕</span>
          <span>Create New Business</span>
        </button>
      </div>
    </div>
  );
}
