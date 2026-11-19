import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useI18n } from '../i18n';
import { Dialog } from '../components/Dialog';
import { Checkbox } from '../components/Controls';
import { shortenMiddle } from '../lib/files';
import type { TranslationKey } from '../i18n';

export type ProtectedOperation = 'delete' | 'move' | 'copy' | 'rename' | 'save' | 'create' | 'upload';

interface ProtectionRequest {
  operation: ProtectedOperation;
  paths: string[];
  count?: number;
}

interface ProtectionContextValue {
  askProtection: (request: ProtectionRequest) => Promise<boolean>;
}

const ProtectionContext = createContext<ProtectionContextValue | null>(null);

export function ProtectionProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [request, setRequest] = useState<ProtectionRequest | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setRequest(null);
    setBusy(false);
    setChecked(false);
  }, []);

  const askProtection = useCallback((next: ProtectionRequest) => {
    if (resolverRef.current) resolverRef.current(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setChecked(false);
      setBusy(false);
      setRequest(next);
    });
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
    };
  }, []);

  const operationKey = `protection.operation.${request?.operation || 'delete'}` as TranslationKey;

  return (
    <ProtectionContext.Provider value={{ askProtection }}>
      {children}
      <Dialog
        open={Boolean(request)}
        onClose={() => settle(false)}
        className="dialog-protection"
        closeOnBackdrop={false}
      >
        <div className="protection-header">
          <div className="protection-shield">
            <ShieldAlert size={26} />
          </div>
          <div>
            <h2>{t('protection.title')}</h2>
            <p>{t('protection.body')}</p>
          </div>
        </div>
        <div className="protection-operation">
          <span className="protection-op-icon">!</span>
          <p>
            {t('protection.aboutTo', {
              operation: t(operationKey),
            })}
          </p>
        </div>
        <div className="protection-paths">
          <div className="protection-paths-label">{t('protection.paths')}</div>
          <ul>
            {(request?.paths || []).slice(0, 5).map((path) => (
              <li key={path} title={path}>
                {shortenMiddle(path, 92)}
              </li>
            ))}
          </ul>
          {request && request.paths.length > 5 && (
            <div className="protection-more">{t('protection.morePaths', { count: request.paths.length - 5 })}</div>
          )}
        </div>
        <Checkbox checked={checked} onChange={(event) => setChecked(event.target.checked)}>
          {t('protection.checkbox')}
        </Checkbox>
        <p className="protection-logged">{t('protection.logged')}</p>
        <div className="dialog-footer">
          <button type="button" className="btn btn-secondary" onClick={() => settle(false)} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!checked || busy}
            onClick={() => {
              setBusy(true);
              settle(true);
            }}
          >
            {busy && <Loader2 size={16} className="spinner" />}
            {t('protection.continue')}
          </button>
        </div>
      </Dialog>
    </ProtectionContext.Provider>
  );
}

export function useProtection(): ProtectionContextValue {
  const context = useContext(ProtectionContext);
  if (!context) throw new Error('useProtection must be used inside ProtectionProvider');
  return context;
}
