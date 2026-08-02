import { useState, useRef, useEffect, type ReactNode, type KeyboardEvent } from 'react';
import { MOTION } from '../../design/motion';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}

export function Dropdown({
  trigger,
  items,
  align = 'left',
  className = '',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  function handleKeyDown(e: KeyboardEvent) {
    if (!open) return;
    const enabledItems = items.filter((item) => !item.disabled);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % enabledItems.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + enabledItems.length) % enabledItems.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < enabledItems.length) {
          const item = enabledItems[activeIndex];
          item.onClick();
          setOpen(false);
          setActiveIndex(-1);
        }
        break;
      case 'Tab':
        setOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  function handleItemClick(item: DropdownItem) {
    if (item.disabled) return;
    item.onClick();
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`} onKeyDown={handleKeyDown}>
      <div onClick={() => { setOpen(!open); setActiveIndex(-1); }} className="cursor-pointer">
        {trigger}
      </div>

      {open && (
        <div
          ref={menuRef}
          className={`absolute top-full mt-1 z-30 bg-white rounded-xl shadow-lg border border-rose-100
                      overflow-hidden min-w-[180px] ${MOTION.scaleIn}
                      ${align === 'right' ? 'right-0' : 'left-0'}`}
          role="menu"
        >
          {items.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
              role="menuitem"
              className={`w-full text-left px-4 py-3 text-sm transition-all duration-150 flex items-center gap-2
                ${item.disabled
                  ? 'text-neutral-300 cursor-not-allowed'
                  : item.danger
                    ? 'text-red-600 hover:bg-red-50 font-medium'
                    : 'text-neutral-700 hover:bg-rose-50/50'
                }
                ${idx === activeIndex ? 'bg-rose-50' : ''}
              `}
            >
              {item.icon && <span className="text-base">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
