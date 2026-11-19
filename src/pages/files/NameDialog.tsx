import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogFooter, DialogHeader } from '../../components/Dialog';
import { useI18n } from '../../i18n';

interface NameDialogProps {
  open: boolean;
  icon: ReactNode;
  title: string;
  body?: ReactNode;
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string;
  selectBasename?: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}

export function NameDialog({
  open,
  icon,
  title,
  body,
  label,
  placeholder,
  initialValue = '',
  confirmLabel,
  busy,
  error,
  selectBasename,
  onCancel,
  onSubmit,
}: NameDialogProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    const timer = window.setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      if (selectBasename) {
        const dot = initialValue.lastIndexOf('.');
        input.setSelectionRange(0, dot > 0 ? dot : initialValue.length);
      } else {
        input.select();
      }
    }, 30);
    return () => window.clearTimeout(timer);
  }, [open, initialValue, selectBasename]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onClose={busy ? () => undefined : onCancel} closeOnBackdrop={!busy}>
      <form onSubmit={submit}>
        <DialogHeader icon={icon} title={title} subtitle={body} />
        <label className="field">
          <span className="field-label">{label}</span>
          <input
            ref={inputRef}
            className="input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            maxLength={255}
            disabled={busy}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <DialogFooter>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !value.trim()}>
            {busy && <Loader2 size={16} className="spinner" />}
            {confirmLabel}
          </button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
