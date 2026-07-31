import React from 'react';
import Button from './Button';

// ── ErrorBanner Props ────────────────────────────────────────────
export interface ErrorBannerProps {
  /** Error message to display */
  message: string;
  /** Optional retry callback — renders a retry button if provided */
  onRetry?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ── ErrorBanner Component ────────────────────────────────────────
export function ErrorBanner({ message, onRetry, className = '' }: ErrorBannerProps) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border bg-red-50 border-red-200 text-red-700 ${className}`}
      role="alert"
    >
      <span className="text-lg flex-shrink-0" aria-hidden="true">
        ❌
      </span>
      <p className="text-sm font-medium flex-1">{message}</p>
      {onRetry && (
        <Button variant="danger" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export default ErrorBanner;
