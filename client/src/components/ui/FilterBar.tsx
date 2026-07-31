import { RADIUS } from '../../design/tokens';

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterBarProps {
  filters: FilterOption[];
  active: string[];
  onChange: (ids: string[]) => void;
  multiSelect?: boolean;
  className?: string;
}

export function FilterBar({
  filters,
  active,
  onChange,
  multiSelect = true,
  className = '',
}: FilterBarProps) {
  function handleClick(id: string) {
    if (multiSelect) {
      if (active.includes(id)) {
        onChange(active.filter((a) => a !== id));
      } else {
        onChange([...active, id]);
      }
    } else {
      onChange(active.includes(id) ? [] : [id]);
    }
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="group" aria-label="Filter options">
      {filters.map((filter) => {
        const isActive = active.includes(filter.id);
        return (
          <button
            key={filter.id}
            onClick={() => handleClick(filter.id)}
            className={`${RADIUS.pill} px-4 py-2 text-sm font-medium transition-all duration-200
              touch-target inline-flex items-center gap-1.5
              ${isActive
                ? 'bg-gradient-to-r from-rose-400 to-rose-500 text-white shadow-sm shadow-rose-200/50'
                : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
              }`}
            aria-pressed={isActive}
          >
            <span>{filter.label}</span>
            {filter.count !== undefined && (
              <span
                className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
                            rounded-full text-xs font-semibold
                            ${isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-rose-200 text-rose-700'
                            }`}
              >
                {filter.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
