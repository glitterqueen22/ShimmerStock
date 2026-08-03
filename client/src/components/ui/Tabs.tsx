// ── Tabs Props ───────────────────────────────────────────────────
export interface Tab {
  id?: string;
  key?: string;
  label: string;
  count?: number;
  badge?: number | null;
}

export interface TabsProps {
  tabs: Tab[];
  active?: string;
  activeId?: string;
  activeTab?: string;
  onChange?: (id: string) => void;
  onTabChange?: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, activeId, activeTab, onChange, onTabChange, className = '' }: TabsProps) {
  const tabIdFor = (tab: Tab, index: number) => tab.id ?? tab.key ?? `tab-${index}`;
  const currentActive = active ?? activeId ?? activeTab ?? (tabs[0] ? tabIdFor(tabs[0], 0) : "");
  const handleChange = onChange ?? onTabChange ?? (() => {});

  return (
    <div className={`bg-rose-50 p-1 rounded-xl inline-flex gap-0.5 ${className}`}>
      {tabs.map((tab, index) => {
        const tabId = tabIdFor(tab, index);
        const count = tab.count ?? (typeof tab.badge === 'number' ? tab.badge : undefined);
        const isActive = tabId === currentActive;

        return (
          <button
            key={tabId}
            onClick={() => handleChange(tabId)}
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
            {count !== undefined && (
              <span
                className={`
                  ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
                  text-xs font-semibold rounded-full
                  ${isActive ? 'bg-rose-100 text-rose-600' : 'bg-neutral-200 text-neutral-600'}
                `.trim()}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
