import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

// ── Toast Types ──────────────────────────────────────────────────
export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'opportunity';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

// ── Type → Style Mapping ─────────────────────────────────────────
const typeStyles: Record<ToastType, { bg: string; text: string; border: string; icon: string }> = {
  success: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: '✅',
  },
  error: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: '❌',
  },
  warning: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: '⚠️',
  },
  info: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: 'ℹ️',
  },
  opportunity: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: '💡',
  },
};

// ── Context ──────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null);

// ── Toast Item ───────────────────────────────────────────────────
function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);
  const style = typeStyles[toast.type];

  useEffect(() => {
    if (!paused) {
      timerRef.current = setTimeout(() => onDismiss(toast.id), 4000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, paused, onDismiss]);

  return (
    <div
      className={`
        flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg border
        ${style.bg} ${style.text} ${style.border}
        ${toast.exiting ? 'animate-out fade-out slide-out-to-right duration-200' : 'animate-slide-in'}
        cursor-pointer max-w-sm
      `.trim()}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => onDismiss(toast.id)}
      role="alert"
    >
      <span className="text-base flex-shrink-0">{style.icon}</span>
      <span className="text-sm font-medium flex-1">{toast.message}</span>
    </div>
  );
}

// ── ToastProvider ────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, type }]);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — fixed bottom-right on mobile, top-right on desktop */}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 sm:top-20 sm:bottom-auto"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── useToast Hook ────────────────────────────────────────────────
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}

export default ToastProvider;
