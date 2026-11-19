import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Grid2X2,
  Info,
  KeyRound,
  List,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LogoMark } from '../components/Logo';
import { Switch } from '../components/Controls';
import { useI18n } from '../i18n';
import { usePreferences } from '../lib/PreferencesContext';
import { useToast } from '../components/Toast';
import { api, ApiError } from '../lib/api';
import { translateError, type Language, type ThemeMode } from '../lib/preferences';
import { copyText } from '../lib/clipboard';
import type { SystemInfo } from '../types';

type SettingsTab = 'appearance' | 'security' | 'about';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  info: SystemInfo | null;
  onSignOut: () => void;
  onRefreshInfo: () => void;
}

export function SettingsDialog({ open, onClose, info, onSignOut }: SettingsDialogProps) {
  const { t } = useI18n();
  const { prefs, updatePrefs } = usePreferences();
  const { toast } = useToast();
  const [tab, setTab] = useState<SettingsTab>('appearance');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPasswordError('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswords(false);
  }, [open]);

  const themes: Array<{ id: ThemeMode; label: string; icon: ReactNode }> = [
    { id: 'system', label: t('settings.themeSystem'), icon: <Monitor size={16} /> },
    { id: 'light', label: t('settings.themeLight'), icon: <Sun size={16} /> },
    { id: 'dark', label: t('settings.themeDark'), icon: <Moon size={16} /> },
  ];
  const languages: Array<{ id: Language; label: string; code: string }> = [
    { id: 'en', label: 'English', code: 'EN' },
    { id: 'zh-CN', label: '简体中文', code: '简' },
    { id: 'zh-TW', label: '繁體中文', code: '繁' },
  ];

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (passwordBusy) return;
    setPasswordError('');
    if (newPassword.length < 8) {
      setPasswordError(t('auth.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('auth.passwordMismatch'));
      return;
    }
    setPasswordBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast({ type: 'success', title: t('settings.passwordUpdated') });
    } catch (caught) {
      setPasswordError(translateError(t, caught as ApiError));
    } finally {
      setPasswordBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    setSignOutBusy(true);
    try {
      await api.logoutAll();
      setSignOutOpen(false);
      onClose();
      onSignOut();
    } catch (caught) {
      toast({
        type: 'error',
        title: t('toast.operationFailed'),
        message: translateError(t, caught as ApiError),
      });
    } finally {
      setSignOutBusy(false);
    }
  };

  const copyInfo = async (value: string) => {
    const ok = await copyText(value);
    toast({ type: ok ? 'success' : 'error', title: ok ? t('toast.copiedPath') : t('common.copyFailed') });
  };

  const shortcuts = [
    { label: t('settings.shortcutSearch'), keys: ['Ctrl', 'K'] },
    { label: t('settings.shortcutNewFolder'), keys: ['Ctrl', '⇧', 'N'] },
    { label: t('settings.shortcutSelectAll'), keys: ['Ctrl', 'A'] },
    { label: t('settings.shortcutDelete'), keys: ['Del'] },
    { label: t('settings.shortcutRename'), keys: ['F2'] },
    { label: t('settings.shortcutUp'), keys: ['Alt', '↑'] },
    { label: t('settings.shortcutHelp'), keys: ['Esc'] },
  ];

  return (
    <>
      <Dialog open={open} onClose={onClose} className="dialog-settings">
        <div className="settings-layout">
          <aside className="settings-side">
            <div className="settings-brand">
              <LogoMark size={30} />
              <div>
                <strong>{t('settings.title')}</strong>
                <span>{t('app.name')}</span>
              </div>
            </div>
            <nav className="settings-tabs">
              <button
                type="button"
                className={tab === 'appearance' ? 'is-active' : ''}
                onClick={() => setTab('appearance')}
              >
                <Palette size={17} />
                {t('settings.appearance')}
              </button>
              <button
                type="button"
                className={tab === 'security' ? 'is-active' : ''}
                onClick={() => setTab('security')}
              >
                <ShieldCheck size={17} />
                {t('settings.security')}
              </button>
              <button
                type="button"
                className={tab === 'about' ? 'is-active' : ''}
                onClick={() => setTab('about')}
              >
                <Info size={17} />
                {t('settings.about')}
              </button>
            </nav>
            <div className="settings-side-foot">
              <ShieldCheck size={14} />
              <span>{t('app.description')}</span>
            </div>
          </aside>

          <section className="settings-main">
            <header className="settings-head">
              <h2>
                {tab === 'appearance'
                  ? t('settings.appearance')
                  : tab === 'security'
                    ? t('settings.security')
                    : t('settings.about')}
              </h2>
              <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
                <X size={19} />
              </button>
            </header>

            <div className="settings-scroll">
              {tab === 'appearance' && (
                <div className="settings-section">
                  <div className="settings-group">
                    <div className="settings-group-head">
                      <h3>{t('settings.theme')}</h3>
                      <p>{t('settings.themeBody')}</p>
                    </div>
                    <div className="theme-grid">
                      {themes.map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          className={`theme-option is-${theme.id}${prefs.theme === theme.id ? ' is-selected' : ''}`}
                          onClick={() => updatePrefs({ theme: theme.id })}
                        >
                          <span className={`theme-preview preview-${theme.id}`} aria-hidden="true">
                            <span className="theme-preview-side" />
                            <span className="theme-preview-main">
                              <span />
                              <span />
                              <span />
                            </span>
                          </span>
                          <span className="theme-option-label">
                            {theme.icon}
                            {theme.label}
                            {prefs.theme === theme.id && <Check size={14} className="theme-check" />}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="settings-group">
                    <div className="settings-group-head">
                      <h3>{t('settings.language')}</h3>
                      <p>{t('settings.languageBody')}</p>
                    </div>
                    <div className="language-grid">
                      {languages.map((language) => (
                        <button
                          key={language.id}
                          type="button"
                          className={`language-option${prefs.language === language.id ? ' is-selected' : ''}`}
                          onClick={() => updatePrefs({ language: language.id })}
                        >
                          <span className="language-code">{language.code}</span>
                          <span>{language.label}</span>
                          {prefs.language === language.id && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="settings-group">
                    <div className="settings-group-head">
                      <h3>{t('settings.defaultView')}</h3>
                    </div>
                    <div className="segmented">
                      <button
                        type="button"
                        className={prefs.view === 'list' ? 'is-active' : ''}
                        onClick={() => updatePrefs({ view: 'list' })}
                      >
                        <List size={15} />
                        {t('files.viewList')}
                      </button>
                      <button
                        type="button"
                        className={prefs.view === 'grid' ? 'is-active' : ''}
                        onClick={() => updatePrefs({ view: 'grid' })}
                      >
                        <Grid2X2 size={15} />
                        {t('files.viewGrid')}
                      </button>
                    </div>
                  </div>

                  <div className="settings-group settings-switches">
                    <Switch
                      checked={prefs.showHidden}
                      onChange={(checked) => updatePrefs({ showHidden: checked })}
                      label={t('settings.showHidden')}
                      description={t('settings.showHiddenBody')}
                    />
                    <Switch
                      checked={prefs.editorWrap}
                      onChange={(checked) => updatePrefs({ editorWrap: checked })}
                      label={t('settings.editorWrap')}
                    />
                  </div>

                  <div className="settings-group">
                    <div className="settings-group-head">
                      <h3>{t('settings.editorFontSize')}</h3>
                    </div>
                    <div className="font-size-row">
                      <input
                        type="range"
                        min={11}
                        max={22}
                        step={1}
                        value={prefs.editorFontSize}
                        onChange={(event) => updatePrefs({ editorFontSize: Number(event.target.value) })}
                      />
                      <span>{prefs.editorFontSize}px</span>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'security' && (
                <div className="settings-section">
                  <div className="settings-group">
                    <div className="settings-group-head">
                      <h3>{t('settings.changePassword')}</h3>
                    </div>
                    <form className="password-form" onSubmit={changePassword}>
                      {passwordError && <div className="form-error">{passwordError}</div>}
                      <label className="field">
                        <span className="field-label">{t('settings.currentPassword')}</span>
                        <div className="input-shell">
                          <KeyRound size={16} className="input-leading" />
                          <input
                            className="input has-leading has-trailing"
                            type={showPasswords ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(event) => setCurrentPassword(event.target.value)}
                            autoComplete="current-password"
                            required
                          />
                          <button
                            type="button"
                            className="input-trailing"
                            onClick={() => setShowPasswords((value) => !value)}
                            aria-label={showPasswords ? t('auth.hidePassword') : t('auth.showPassword')}
                          >
                            {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </label>
                      <label className="field">
                        <span className="field-label">{t('settings.newPassword')}</span>
                        <div className="input-shell">
                          <KeyRound size={16} className="input-leading" />
                          <input
                            className="input has-leading"
                            type={showPasswords ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            required
                          />
                        </div>
                      </label>
                      <label className="field">
                        <span className="field-label">{t('settings.confirmNewPassword')}</span>
                        <div className="input-shell">
                          <ShieldCheck size={16} className="input-leading" />
                          <input
                            className="input has-leading"
                            type={showPasswords ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
                            required
                          />
                        </div>
                      </label>
                      <button type="submit" className="btn btn-primary" disabled={passwordBusy}>
                        {passwordBusy ? <Loader2 size={16} className="spinner" /> : <KeyRound size={16} />}
                        {t('settings.updatePassword')}
                      </button>
                    </form>
                  </div>

                  <div className="settings-group">
                    <div className="settings-group-head">
                      <h3>{t('settings.signOutAll')}</h3>
                      <p>{t('settings.signOutAllBody')}</p>
                    </div>
                    <button type="button" className="btn btn-danger" onClick={() => setSignOutOpen(true)}>
                      <LogOut size={16} />
                      {t('settings.signOutAllButton')}
                    </button>
                  </div>

                  <div className="settings-privacy">
                    <ShieldCheck size={20} />
                    <div>
                      <strong>{t('settings.privacy')}</strong>
                      <p>{t('settings.privacyBody')}</p>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'about' && (
                <div className="settings-section">
                  <div className="about-hero">
                    <LogoMark size={54} />
                    <div>
                      <h3>FileAnywhere <span>随档</span></h3>
                      <p>{t('settings.aboutBody')}</p>
                      <span className="about-version">{t('settings.version', { version: info?.version || '1.0.0' })}</span>
                    </div>
                  </div>

                  <div className="settings-group">
                    <div className="settings-group-head">
                      <h3>{t('settings.server')}</h3>
                    </div>
                    <dl className="about-list">
                      <div>
                        <dt>{t('settings.host')}</dt>
                        <dd>{info?.hostname || t('common.unknown')}</dd>
                      </div>
                      <div>
                        <dt>{t('settings.server')}</dt>
                        <dd>
                          <a href={info?.localUrl} target="_blank" rel="noreferrer">
                            {info?.localUrl || '—'}
                          </a>
                          {info?.localUrl && (
                            <button
                              type="button"
                              className="icon-btn tiny"
                              onClick={() => void copyInfo(info.localUrl)}
                              aria-label={t('common.copyPath')}
                            >
                              <Copy size={13} />
                            </button>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('settings.dataFolder')}</dt>
                        <dd className="mono" title={info?.dataDir}>
                          {info?.dataDir || '—'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="settings-group">
                    <div className="settings-group-head">
                      <h3>{t('settings.shortcuts')}</h3>
                    </div>
                    <div className="shortcut-grid">
                      {shortcuts.map((shortcut) => (
                        <div key={shortcut.label} className="shortcut-row">
                          <span>{shortcut.label}</span>
                          <span className="shortcut-keys">
                            {shortcut.keys.map((key) => (
                              <kbd key={key}>{key}</kbd>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="settings-privacy">
                    <ShieldCheck size={20} />
                    <div>
                      <strong>{t('settings.privacy')}</strong>
                      <p>{t('settings.privacyBody')}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </Dialog>

      <ConfirmDialog
        open={signOutOpen}
        title={t('settings.signOutAllConfirm')}
        body={t('settings.signOutAllBody')}
        confirmLabel={t('settings.signOutAllButton')}
        cancelLabel={t('common.cancel')}
        tone="danger"
        busy={signOutBusy}
        icon={<LogOut size={22} />}
        onConfirm={() => void signOutEverywhere()}
        onCancel={() => setSignOutOpen(false)}
      />
    </>
  );
}
