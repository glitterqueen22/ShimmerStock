import Button from './Button';

export interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorBanner({ message, onRetry, onDismiss, className = '' }: ErrorBannerProps) {
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
      {onDismiss && (
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      )}
    </div>
  );
}

export default ErrorBanner;
