import React from 'react';
import {
  ENGINE_CONFIG,
  STATUS_CONFIG,
  URGENCY_CONFIG,
  type EngineConfig,
  type StatusConfig,
  type UrgencyConfig,
} from '../../design/engineConfig';

// ── Badge Props ──────────────────────────────────────────────────
export interface BadgeProps {
  /** Engine name — looks up ENGINE_CONFIG for colors + icon + label */
  engine?: string;
  /** Status key — looks up STATUS_CONFIG */
  status?: string;
  /** Urgency key — looks up URGENCY_CONFIG */
  urgency?: string;
  /** Visual style variant */
  variant?: 'default' | 'outline' | 'dot';
  /** Override children (otherwise uses engine label or status icon+label) */
  children?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

// ── Badge Component ──────────────────────────────────────────────
export function Badge({
  engine,
  status,
  urgency,
  variant = 'default',
  children,
  className = '',
}: BadgeProps) {
  let config: {
    color: string;
    textColor: string;
    borderColor: string;
    icon: string;
    label: string;
  } | null = null;

  if (engine && ENGINE_CONFIG[engine]) {
    const ec: EngineConfig = ENGINE_CONFIG[engine];
    config = { ...ec, icon: ec.icon, label: ec.label };
  } else if (urgency && URGENCY_CONFIG[urgency]) {
    const uc: UrgencyConfig = URGENCY_CONFIG[urgency];
    config = { ...uc, label: uc.label };
  } else if (status && STATUS_CONFIG[status]) {
    const sc: StatusConfig = STATUS_CONFIG[status];
    config = { ...sc, label: status };
  }

  if (!config && !children) {
    return null;
  }

  const displayContent = children ?? (
    <>
      {config?.icon && <span className="mr-1">{config.icon}</span>}
      <span>{config?.label}</span>
    </>
  );

  // Dot variant — just a colored dot
  if (variant === 'dot') {
    return (
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${config?.color ?? 'bg-gray-50'} ${config?.borderColor ?? 'border-gray-200'} border ${className}`}
        title={config?.label}
      />
    );
  }

  // Outline variant — border-only, transparent bg
  if (variant === 'outline') {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config?.textColor ?? 'text-gray-700'} ${config?.borderColor ?? 'border-gray-200'} bg-transparent ${className}`}
      >
        {displayContent}
      </span>
    );
  }

  // Default variant — filled background
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config?.color ?? 'bg-gray-50'} ${config?.textColor ?? 'text-gray-700'} ${config?.borderColor ?? 'border-gray-200'} ${className}`}
    >
      {displayContent}
    </span>
  );
}

export default Badge;
