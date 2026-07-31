import React from 'react';

// ── Tabs Props ───────────────────────────────────────────────────
export interface Tab {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

// ── Tabs Component ───────────────────────────────────────────────
export function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <div className={`bg-rose-50 p-1 rounded-xl inline-flex gap-0.5 ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500
              touch-target
              ${
                isActive
                  ? 'bg-white text-rose-600 shadow-sm'
                  : 'text-neutral-500 hover:text-rose-500 hover:bg-white/50'
              }
            `.trim()}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`
                  ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
                  text-xs font-semibold rounded-full
                  ${isActive ? 'bg-rose-100 text-rose-600' : 'bg-neutral-200 text-neutral-600'}
                `.trim()}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
