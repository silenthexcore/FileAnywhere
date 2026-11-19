import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  closeOnBackdrop?: boolean;
  hideClose?: boolean;
  closeLabel?: string;
}

export function Dialog({
  open,
  onClose,
  children,
  className = '',
  labelledBy,
  closeOnBackdrop = true,
  hideClose = true,
  closeLabel = 'Close',
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={labelledBy}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === ref.current) onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <div className="dialog-panel">
        {!hideClose && (
          <button type="button" className="dialog-x" onClick={onClose} aria-label={closeLabel}>
            <X size={18} />
          </button>
        )}
        {children}
      </div>
    </dialog>
  );
}

interface DialogHeaderProps {
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  id?: string;
  tone?: 'default' | 'danger' | 'warning';
}

export function DialogHeader({ icon, title, subtitle, id, tone = 'default' }: DialogHeaderProps) {
  return (
    <header className="dialog-header">
      {icon && <div className={`dialog-icon tone-${tone}`}>{icon}</div>}
      <div className="dialog-heading">
        <h2 id={id}>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <footer className="dialog-footer">{children}</footer>;
}
