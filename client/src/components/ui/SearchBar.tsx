import { useState, useEffect, useRef, useCallback, type ChangeEvent } from 'react';
import { RADIUS } from '../../design/tokens';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  onDebounce?: (value: string) => void;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  onDebounce,
  className = '',
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced callback
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!onDebounce) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onDebounce(localValue);
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localValue, debounceMs]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      onChange(newValue);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    setLocalValue('');
    onChange('');
    if (onDebounce) onDebounce('');
  }, [onChange, onDebounce]);

  return (
    <div className={`relative ${className}`}>
      {/* Magnifying glass icon */}
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none text-base">
        🔍
      </span>

      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className={`w-full pl-10 pr-10 py-2.5 bg-rose-50 ${RADIUS.input} border border-rose-100
                    text-sm text-neutral-800 placeholder:text-rose-300
                    focus:border-rose-300 focus:ring-2 focus:ring-rose-100 focus:bg-white
                    outline-none transition-all duration-200`}
      />

      {/* Clear button */}
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600
                     transition-colors duration-150 p-0.5 touch-target flex items-center justify-center"
          aria-label="Clear search"
        >
          <span className="text-sm leading-none">✕</span>
        </button>
      )}
    </div>
  );
}
