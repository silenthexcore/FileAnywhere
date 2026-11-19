import { useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Loader2,
  LockKeyhole,
  MonitorSmartphone,
  Moon,
  Recycle,
  ShieldCheck,
  Sun,
  Wifi,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { usePreferences } from '../lib/PreferencesContext';
import { api, ApiError } from '../lib/api';
import { translateError, type Language, type ThemeMode } from '../lib/preferences';
import { LogoMark, Logo } from '../components/Logo';
import { DropdownMenu, MenuItem } from '../components/Menu';
import { Checkbox } from '../components/Controls';
import type { Health } from '../types';

export function BootScreen() {
  const { t } = useI18n();
  return (
    <div className="boot-screen">
      <div className="boot-glow" />
      <LogoMark size={58} className="boot-logo" />
      <div className="boot-title">{t('app.name')}</div>
      <div className="boot-subtitle">{t('app.tagline')}</div>
      <div className="boot-loader" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function ThemeAndLanguage({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { prefs, setLanguage, setTheme, resolvedTheme } = usePreferences();
  const languages: Array<{ id: Language; label: string }> = [
    { id: 'en', label: 'English' },
    { id: 'zh-CN', label: '简体中文' },
    { id: 'zh-TW', label: '繁體中文' },
  ];
  const themes: Array<{ id: ThemeMode; label: string; icon: ReactNode }> = [
    { id: 'system', label: t('theme.system'), icon: <MonitorSmartphone size={15} /> },
    { id: 'light', label: t('theme.light'), icon: <Sun size={15} /> },
    { id: 'dark', label: t('theme.dark'), icon: <Moon size={15} /> },
  ];
  return (
    <div className={`auth-prefs ${compact ? 'is-compact' : ''}`}>
      <DropdownMenu
        align="end"
        width={190}
        trigger={
          <button type="button" className="auth-pref-btn" aria-label={t('auth.language')}>
            <Globe2 size={17} />
            <span>{languages.find((item) => item.id === prefs.language)?.label}</span>
          </button>
        }
      >
        {languages.map((item) => (
          <MenuItem
            key={item.id}
            label={item.label}
            selected={prefs.language === item.id}
            onSelect={() => setLanguage(item.id)}
          />
        ))}
        <div className="menu-separator" />
        {themes.map((item) => (
          <MenuItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            selected={prefs.theme === item.id}
            onSelect={() => setTheme(item.id)}
          />
        ))}
      </DropdownMenu>
      <button
        type="button"
        className="auth-icon-btn"
        aria-label={t('auth.theme')}
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      >
        {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="auth-feature">
      <div className="auth-feature-icon">{icon}</div>
      <div>
        <div className="auth-feature-title">{title}</div>
        <p>{body}</p>
      </div>
    </div>
  );
}

function DeviceMock() {
  const { t } = useI18n();
  return (
    <div className="auth-mock" aria-hidden="true">
      <div className="mock-bar">
        <div className="mock-dots">
          <span />
          <span />
          <span />
        </div>
        <span className="mock-title">{t('auth.demoWindowTitle')}</span>
        <span className="mock-dot-menu">•••</span>
      </div>
      <div className="mock-body">
        <div className="mock-side">
          <span className="mock-pill active" />
          <span className="mock-pill" />
          <span className="mock-pill short" />
          <span className="mock-pill" />
        </div>
        <div className="mock-content">
          <div className="mock-storage">
            <div className="mock-storage-head">
              <span>{t('auth.demoStorage')}</span>
              <span>72%</span>
            </div>
            <div className="mock-storage-bar">
              <span />
            </div>
          </div>
          <div className="mock-section">{t('auth.demoFiles')}</div>
          <div className="mock-row">
            <span className="mock-file-icon folder" />
            <span className="mock-file-name">{t('auth.demoFolderWork')}</span>
            <span className="mock-file-meta">12</span>
          </div>
          <div className="mock-row">
            <span className="mock-file-icon folder" />
            <span className="mock-file-name">{t('auth.demoFolderPhotos')}</span>
            <span className="mock-file-meta">86</span>
          </div>
          <div className="mock-row">
            <span className="mock-file-icon pdf" />
            <span className="mock-file-name">{t('auth.demoFileReport')}</span>
            <span className="mock-file-meta">2.4 MB</span>
          </div>
          <div className="mock-row">
            <span className="mock-file-icon code" />
            <span className="mock-file-name">{t('auth.demoFileNotes')}</span>
            <span className="mock-file-meta">8 KB</span>
          </div>
          <div className="mock-row">
            <span className="mock-file-icon video" />
            <span className="mock-file-name">{t('auth.demoFileVideo')}</span>
            <span className="mock-file-meta">128 MB</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { prefs } = usePreferences();
  const host = window.location.hostname || 'this PC';
  return (
    <div className="auth-shell">
      <div className="auth-backdrop" aria-hidden="true">
        <span className="auth-orb orb-one" />
        <span className="auth-orb orb-two" />
      </div>
      <section className="auth-art">
        <div className="auth-art-inner">
          <Logo size={48} />
          <div className="auth-art-copy">
            <span className="auth-eyebrow">
              <Wifi size={14} />
              {t('app.localServer')}
            </span>
            <h1>{t('auth.secureTitle')}</h1>
            <p>{t('auth.secureBody')}</p>
          </div>
          <div className="auth-features">
            <Feature
              icon={<MonitorSmartphone size={19} />}
              title={t('auth.featureAnywhere')}
              body={t('auth.featureAnywhereBody')}
            />
            <Feature
              icon={<Recycle size={19} />}
              title={t('auth.featureRecycle')}
              body={t('auth.featureRecycleBody')}
            />
            <Feature
              icon={<ShieldCheck size={19} />}
              title={t('auth.featurePrivate')}
              body={t('auth.featurePrivateBody')}
            />
          </div>
          <DeviceMock />
          <div className="auth-art-footer">
            <span className="status-dot" />
            FileAnywhere 1.0 · {prefs.language === 'en' ? 'Runs on your PC' : t('app.localServer')}
          </div>
        </div>
      </section>
      <main className="auth-main">
        <div className="auth-topbar">
          <div className="auth-mobile-brand">
            <LogoMark size={34} />
            <span>FileAnywhere</span>
          </div>
          <ThemeAndLanguage compact />
        </div>
        <div className="auth-center">
          <div className="auth-card">{children}</div>
          <p className="auth-footnote">
            <LockKeyhole size={13} />
            {t('auth.footer', { host })}
          </p>
        </div>
      </main>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="auth-error" role="alert">
      <span className="auth-error-dot" />
      <span>{message}</span>
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const { t } = useI18n();
  const score = (() => {
    if (!password) return 0;
    let points = 0;
    if (password.length >= 8) points += 1;
    if (password.length >= 12) points += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) points += 1;
    if (/\d/.test(password)) points += 1;
    if (/[^A-Za-z0-9]/.test(password)) points += 1;
    return Math.min(points, 4);
  })();
  const labels = [
    t('auth.passwordStrength.weak'),
    t('auth.passwordStrength.weak'),
    t('auth.passwordStrength.fair'),
    t('auth.passwordStrength.good'),
    t('auth.passwordStrength.strong'),
  ];
  return (
    <div className={`password-strength level-${score}`}>
      <div className="strength-bars">
        {[1, 2, 3, 4].map((index) => (
          <span key={index} className={score >= index ? 'is-on' : ''} />
        ))}
      </div>
      <span>{password ? labels[score] : t('auth.passwordHint')}</span>
    </div>
  );
}

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.login(password, remember);
      onSignedIn();
    } catch (caught) {
      const apiError = caught as ApiError;
      const message =
        apiError?.code === 'TOO_MANY_ATTEMPTS'
          ? translateError(t, apiError)
          : apiError?.code === 'NETWORK'
            ? t('error.NETWORK')
            : apiError?.code === 'INVALID_PASSWORD'
              ? t('error.INVALID_PASSWORD')
              : translateError(t, apiError);
      setError(message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-form-head">
        <div className="auth-form-icon">
          <LockKeyhole size={20} />
        </div>
        <h2>{t('auth.loginTitle')}</h2>
        <p>{t('auth.loginBody')}</p>
      </div>
      <form onSubmit={submit} className="auth-form">
        {error && <ErrorBanner message={error} />}
        <label className="field">
          <span className="field-label">{t('auth.password')}</span>
          <div className={`input-shell ${show ? 'is-plain' : ''}`}>
            <KeyRound size={17} className="input-leading" />
            <input
              className="input has-leading has-trailing"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              autoComplete="current-password"
              autoFocus
              required
            />
            <button
              type="button"
              className="input-trailing"
              onClick={() => setShow((value) => !value)}
              aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
        <div className="auth-options">
          <Checkbox checked={remember} onChange={(event) => setRemember(event.target.checked)}>
            {t('auth.remember')}
          </Checkbox>
          <span className="auth-remember-note">{t('auth.rememberNote')}</span>
        </div>
        <button type="submit" className="btn btn-primary auth-submit" disabled={busy || !password}>
          {busy ? <Loader2 size={17} className="spinner" /> : <ArrowRight size={17} />}
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </form>
      <div className="auth-hint-row">
        <ShieldCheck size={15} />
        <span>{t('settings.privacyBody')}</span>
      </div>
    </AuthLayout>
  );
}

export function SetupPage({ health, onComplete }: { health: Health; onComplete: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await api.setup(password, health.remoteCodeRequired ? setupCode : undefined);
      onComplete();
    } catch (caught) {
      setError(translateError(t, caught as ApiError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-form-head">
        <div className="auth-form-icon accent">
          <ShieldCheck size={20} />
        </div>
        <h2>{t('auth.setupTitle')}</h2>
        <p>{t('auth.setupBody')}</p>
      </div>
      <form onSubmit={submit} className="auth-form">
        {error && <ErrorBanner message={error} />}
        {health.remoteCodeRequired && (
          <div className="auth-remote-note">
            <KeyRound size={16} />
            <span>{t('auth.setupCodeRequired')}</span>
          </div>
        )}
        <label className="field">
          <span className="field-label">{t('auth.newPassword')}</span>
          <div className="input-shell">
            <KeyRound size={17} className="input-leading" />
            <input
              className="input has-leading has-trailing"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              autoComplete="new-password"
              autoFocus
              required
              minLength={8}
              maxLength={200}
            />
            <button
              type="button"
              className="input-trailing"
              onClick={() => setShow((value) => !value)}
              aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
        <PasswordStrength password={password} />
        <label className="field">
          <span className="field-label">{t('auth.confirmPassword')}</span>
          <div className="input-shell">
            <ShieldCheck size={17} className="input-leading" />
            <input
              className="input has-leading"
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder={t('auth.confirmPassword')}
              autoComplete="new-password"
              required
            />
          </div>
        </label>
        {health.remoteCodeRequired && (
          <label className="field">
            <span className="field-label">{t('auth.setupCode')}</span>
            <div className="input-shell">
              <KeyRound size={17} className="input-leading" />
              <input
                className="input has-leading mono"
                value={setupCode}
                onChange={(event) => setSetupCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </div>
            <span className="field-hint">{t('auth.setupCodeHint')}</span>
          </label>
        )}
        <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
          {busy ? <Loader2 size={17} className="spinner" /> : <ArrowRight size={17} />}
          {busy ? t('auth.creating') : t('auth.createAccount')}
        </button>
      </form>
      <div className="auth-hint-row">
        <ShieldCheck size={15} />
        <span>{t('auth.featurePrivateBody')}</span>
      </div>
    </AuthLayout>
  );
}

export function BootError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="boot-screen boot-error">
      <LogoMark size={54} />
      <h1>{t('empty.errorTitle')}</h1>
      <p>{t('error.NETWORK')}</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        {t('common.retry')}
      </button>
    </div>
  );
}
