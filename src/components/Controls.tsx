import { useEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, Loader2, Minus } from 'lucide-react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  indeterminate?: boolean;
  children?: ReactNode;
}

export function Checkbox({ label, indeterminate, children, className = '', ...props }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !props.checked;
  }, [indeterminate, props.checked]);
  return (
    <label className={`checkbox ${className}`}>
      <input ref={ref} type="checkbox" {...props} />
      <span className="checkbox-box" aria-hidden="true">
        {indeterminate && !props.checked ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3.2} />}
      </span>
      {(label || children) && <span className="checkbox-label">{children || label}</span>}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}) {
  return (
    <label className={`switch-row${disabled ? ' is-disabled' : ''}`}>
      <span className="switch-copy">
        <span className="switch-label">{label}</span>
        {description && <span className="switch-description">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch${checked ? ' is-on' : ''}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </label>
  );
}

export function Spinner({ size = 18, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`spinner ${className}`} aria-hidden="true" />;
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="loading-block">
      <Spinner size={22} />
      <span>{label}</span>
    </div>
  );
}
