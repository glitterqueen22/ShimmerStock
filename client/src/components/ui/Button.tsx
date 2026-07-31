import React from 'react';

// ── Button Props ─────────────────────────────────────────────────
export interface ButtonProps {
  /** Visual style variant */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
  /** Size */
  size?: 'sm' | 'md' | 'lg';
  /** Disabled state */
  disabled?: boolean;
  /** Loading state — shows spinner and disables interaction */
  loading?: boolean;
  /** Click handler */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Button contents */
  children?: React.ReactNode;
  /** Additional CSS classes for one-off overrides */
  className?: string;
  /** Button type attribute */
  type?: 'button' | 'submit' | 'reset';
}

// ── Variant → Tailwind Classes ───────────────────────────────────
const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-gradient-to-r from-rose-400 to-rose-500 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
  secondary:
    'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-colors',
  danger:
    'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors',
  ghost:
    'bg-transparent text-rose-600 hover:bg-rose-50 transition-colors',
  icon:
    'bg-transparent text-rose-600 hover:bg-rose-50 transition-colors inline-flex items-center justify-center min-w-[44px] min-h-[44px]',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-lg',
};

// ── Spinner ──────────────────────────────────────────────────────
function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin -ml-1 mr-2 h-4 w-4 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ── Button Component ─────────────────────────────────────────────
export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  children,
  className = '',
  type = 'button',
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const baseClasses =
    'inline-flex items-center justify-center font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0';

  // Icon variant doesn't use size classes (it's square)
  const sizeClass = variant === 'icon' ? '' : sizeClasses[size];

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClass} ${className}`.trim()}
    >
      {loading && <Spinner className={variant === 'primary' ? 'text-white' : 'text-rose-500'} />}
      {children}
    </button>
  );
}

export default Button;
