import React, { useEffect, useCallback } from 'react';
import Button from './Button';

// ── Modal Props ──────────────────────────────────────────────────
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

// ── Modal Component ──────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className = '',
}: ModalProps) {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Dialog'}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className={`
          relative w-full ${sizeClasses[size]} bg-white rounded-2xl shadow-xl
          animate-in zoom-in-95 duration-200
          ${className}
        `.trim()}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 pt-5 pb-0">
            <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="!min-w-[36px] !min-h-[36px] !p-0"
            >
              ✕
            </Button>
          </div>
        )}

        {/* Close button when no title */}
        {!title && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="absolute top-3 right-3 !min-w-[36px] !min-h-[36px] !p-0"
          >
            ✕
          </Button>
        )}

        {/* Body */}
        <div className="px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 pb-5 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
