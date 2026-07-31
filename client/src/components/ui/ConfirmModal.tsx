import React from 'react';
import Modal from './Modal';
import Button from './Button';

// ── ConfirmModal Props ───────────────────────────────────────────
export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'secondary' | 'danger';
  cancelLabel?: string;
  loading?: boolean;
}

// ── ConfirmModal Component ───────────────────────────────────────
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  cancelLabel = 'Cancel',
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-neutral-600">{message}</p>
      <div className="flex items-center justify-end gap-3 mt-6">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={confirmVariant}
          onClick={onConfirm}
          loading={loading}
          disabled={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export default ConfirmModal;
