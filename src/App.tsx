import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, UNAUTHORIZED_EVENT } from './lib/api';
import { useI18n } from './i18n';
import { useToast } from './components/Toast';
import { BootError, BootScreen, LoginPage, SetupPage } from './pages/Auth';
import { AppShell } from './pages/AppShell';
import type { Health } from './types';

type Phase = 'loading' | 'setup' | 'login' | 'ready' | 'error';

export default function App() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('loading');
  const [health, setHealth] = useState<Health | null>(null);
  const [bootNonce, setBootNonce] = useState(0);
  const phaseRef = useRef<Phase>('loading');
  phaseRef.current = phase;
  const expiredNotified = useRef(false);

  const boot = useCallback(async () => {
    setPhase('loading');
    try {
      const nextHealth = await api.health();
      setHealth(nextHealth);
      if (nextHealth.setupRequired) {
        setPhase('setup');
        return;
      }
      try {
        await api.me();
        setPhase('ready');
      } catch (error) {
        if (error instanceof ApiError && error.code !== 'NETWORK') {
          setPhase('login');
        } else {
          setPhase('error');
        }
      }
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot, bootNonce]);

  useEffect(() => {
    const handleUnauthorized = () => {
      if (phaseRef.current !== 'ready') return;
      setPhase('login');
      if (!expiredNotified.current) {
        expiredNotified.current = true;
        toast({ type: 'warning', title: t('auth.sessionExpired') });
        window.setTimeout(() => {
          expiredNotified.current = false;
        }, 3000);
      }
    };
    const handleOnline = () => toast({ type: 'success', title: t('toast.online') });
    const handleOffline = () => toast({ type: 'warning', title: t('toast.offline'), duration: 7000 });
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [t, toast]);

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      /* cookie is cleared client-side by the server if reachable */
    }
    setPhase('login');
    toast({ type: 'info', title: t('toast.signedOut') });
  };

  if (phase === 'loading') return <BootScreen />;
  if (phase === 'error') return <BootError onRetry={() => setBootNonce((value) => value + 1)} />;
  if (phase === 'setup') {
    return (
      <SetupPage
        health={health || {
          ok: true,
          app: 'FileAnywhere',
          version: '1.0.0',
          setupRequired: true,
          remoteCodeRequired: false,
          isLocal: true,
          platform: 'win32',
        }}
        onComplete={() => setPhase('ready')}
      />
    );
  }
  if (phase === 'login') {
    return <LoginPage onSignedIn={() => setPhase('ready')} />;
  }
  return <AppShell onSignOut={signOut} />;
}
