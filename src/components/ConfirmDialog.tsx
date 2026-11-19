import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'default' | 'danger' | 'warning';
  icon?: ReactNode;
  busy?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  icon,
  busy,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={busy ? () => undefined : onCancel} closeOnBackdrop={!busy}>
      <div className={`confirm-dialog tone-${tone}`}>
        <div className="confirm-icon">
          {icon || <AlertTriangle size={22} />}
        </div>
        <div className="confirm-copy">
          <h2>{title}</h2>
          {body && <div className="confirm-body">{body}</div>}
          {children}
        </div>
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn ${tone === 'danger' ? 'btn-danger' : tone === 'warning' ? 'btn-warning' : 'btn-primary'}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy && <Loader2 size={16} className="spinner" />}
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
