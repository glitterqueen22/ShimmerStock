import { MOTION } from '../../design/motion';

export interface ProgressBarProps {
  value: number; // 0-100
  color?: 'green' | 'blue' | 'orange' | 'red' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showPercentage?: boolean;
  className?: string;
}

const COLOR_CLASSES: Record<string, string> = {
  green: 'bg-emerald-500',
  blue: 'bg-blue-500',
  orange: 'bg-amber-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
};

const SIZE_CLASSES: Record<string, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export function ProgressBar({
  value,
  color = 'blue',
  size = 'md',
  label,
  showPercentage = false,
  className = '',
}: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const colorClass = COLOR_CLASSES[color] || COLOR_CLASSES.blue;
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  return (
    <div className={`w-full ${className}`}>
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-sm font-medium text-neutral-700">{label}</span>}
          {showPercentage && (
            <span className="text-xs font-medium text-neutral-500">{Math.round(clampedValue)}%</span>
          )}
        </div>
      )}
      <div className={`w-full ${sizeClass} bg-neutral-100 rounded-full overflow-hidden`}>
        <div
          className={`${sizeClass} ${colorClass} rounded-full ${MOTION.hover}`}
          style={{ width: `${clampedValue}%`, transition: 'width 0.6s ease-out' }}
          role="progressbar"
          aria-valuenow={clampedValue}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label || `Progress: ${clampedValue}%`}
        />
      </div>
    </div>
  );
}
