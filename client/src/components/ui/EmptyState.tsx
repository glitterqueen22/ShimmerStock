import React from 'react';
import Button from './Button';

// ── EmptyState Props ─────────────────────────────────────────────
export interface EmptyStateProps {
  /** Large emoji or icon at the top */
  icon?: string;
  /** Title heading */
  title: string;
  /** Muted description — always directional ("do X to get started") */
  description: string;
  /** Optional call-to-action */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Additional CSS classes */
  className?: string;
}

// ── EmptyState Component ─────────────────────────────────────────
export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <span className="text-5xl mb-4" aria-hidden="true">
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-neutral-900 mb-1">{title}</h3>
      <p className="text-sm text-neutral-500 max-w-sm mb-6">{description}</p>
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export default EmptyState;
