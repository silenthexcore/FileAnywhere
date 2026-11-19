import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastInput {
  type?: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastRecord extends ToastInput {
  id: number;
  type: ToastType;
}

interface ToastContextValue {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId++;
      const record: ToastRecord = {
        ...input,
        id,
        type: input.type || 'info',
        duration: input.duration ?? (input.type === 'error' ? 8000 : 4500),
      };
      setToasts((current) => [...current.slice(-3), record]);
      if ((record.duration || 0) > 0) {
        const timer = window.setTimeout(() => dismiss(id), record.duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      for (const timer of currentTimers.values()) window.clearTimeout(timer);
      currentTimers.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-stack" role="region" aria-live="polite" aria-label="Notifications">
          {toasts.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastRecord; onDismiss: () => void }) {
  const Icon =
    item.type === 'success' ? CheckCircle2 : item.type === 'error' ? XCircle : item.type === 'warning' ? AlertTriangle : Info;
  return (
    <div className={`toast toast-${item.type}`} role={item.type === 'error' ? 'alert' : 'status'}>
      <div className="toast-icon">
        <Icon size={19} />
      </div>
      <div className="toast-content">
        <div className="toast-title">{item.title}</div>
        {item.message && <div className="toast-message">{item.message}</div>}
        {item.action && (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              item.action?.onClick();
              onDismiss();
            }}
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        <X size={15} />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
