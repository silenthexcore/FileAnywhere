import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  DownloadCloud,
  ExternalLink,
  Globe2,
  Loader2,
  Menu as MenuIcon,
  Monitor,
  Network,
  Play,
  QrCode,
  RefreshCw,
  Router,
  ShieldCheck,
  Square,
  Wifi,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { api, ApiError } from '../lib/api';
import { copyText } from '../lib/clipboard';
import { useToast } from '../components/Toast';
import { Switch } from '../components/Controls';
import { shortenMiddle } from '../lib/files';
import type { SystemInfo, TunnelStatus } from '../types';

interface RemotePageProps {
  info: SystemInfo;
  onBack: () => void;
  onOpenSidebar: () => void;
  onRefreshSystem: () => void;
}

type TunnelAction = 'install' | 'start' | 'stop' | 'auto' | null;

export function RemotePage({ info, onBack, onOpenSidebar, onRefreshSystem }: RemotePageProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [selectedLan, setSelectedLan] = useState(0);
  const [action, setAction] = useState<TunnelAction>(null);
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState('');
  const copyTimer = useRef<number | null>(null);

  const loadStatus = async () => {
    try {
      setStatus(await api.tunnelStatus());
    } catch {
      /* the card stays in its loading state */
    }
  };

  useEffect(() => {
    void loadStatus();
    return () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!status?.installing && !status?.starting) return;
    const timer = window.setInterval(() => {
      api
        .tunnelStatus()
        .then(setStatus)
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [status?.installing, status?.starting]);

  const latestsLan = info.lanAddresses[Math.min(selectedLan, Math.max(info.lanAddresses.length - 1, 0))];
  const qrUrl = latestsLan?.url || info.lanAddresses[0]?.url || info.localUrl;
  const port = info.port;
  const firewallCommand = `New-NetFirewallRule -DisplayName "FileAnywhere" -Direction Inbound -Protocol TCP -LocalPort ${port} -Action Allow`;

  const markCopied = (key: string) => {
    setCopied(key);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(''), 1800);
  };

  const copyValue = async (key: string, value: string, title = t('remote.copied')) => {
    const ok = await copyText(value);
    if (ok) {
      markCopied(key);
      toast({ type: 'success', title });
    } else {
      toast({ type: 'error', title: t('common.copyFailed') });
    }
  };

  const runTunnelAction = async (kind: Exclude<TunnelAction, null | 'auto'>) => {
    setAction(kind);
    setActionError('');
    try {
      const next =
        kind === 'install'
          ? await api.installTunnel()
          : kind === 'start'
            ? await api.startTunnel()
            : await api.stopTunnel();
      setStatus(next);
      if (kind === 'install') toast({ type: 'success', title: t('remote.installSuccess') });
      if (kind === 'start' && next.url) toast({ type: 'success', title: t('remote.tunnelRunning') });
      if (kind === 'stop') toast({ type: 'info', title: t('remote.tunnelStopped') });
    } catch (caught) {
      const message =
        caught instanceof ApiError && caught.message ? caught.message : t('remote.tunnelError');
      setActionError(message);
      toast({
        type: 'error',
        title: t(
          kind === 'install'
            ? 'remote.installFailed'
            : kind === 'start'
              ? 'remote.startFailed'
              : 'remote.stopFailed',
        ),
        message,
      });
    } finally {
      setAction(null);
    }
  };

  const toggleAutoStart = async (enabled: boolean) => {
    setAction('auto');
    try {
      setStatus(await api.setTunnelAutoStart(enabled));
    } catch (caught) {
      toast({ type: 'error', title: t('toast.operationFailed'), message: (caught as ApiError).message });
    } finally {
      setAction(null);
    }
  };

  const tunnelBusy = Boolean(status?.installing || status?.starting || action === 'install' || action === 'start');
  const autoBusy = action === 'auto';

  return (
    <div className="remote-page">
      <header className="remote-head">
        <div className="remote-head-left">
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            onClick={onOpenSidebar}
            aria-label={t('menu.more')}
          >
            <MenuIcon size={20} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm remote-back" onClick={onBack}>
            <ArrowLeft size={16} />
            {t('remote.backToFiles')}
          </button>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            onRefreshSystem();
            void loadStatus();
          }}
          title={t('common.refresh')}
          aria-label={t('common.refresh')}
        >
          <RefreshCw size={17} />
        </button>
      </header>

      <div className="remote-scroll">
        <section className="remote-intro">
          <span className="remote-eyebrow">
            <Globe2 size={14} />
            {t('app.localServer')}
          </span>
          <h1>{t('remote.title')}</h1>
          <p>{t('remote.subtitle')}</p>
          <div className="remote-badges">
            <span className="pill pill-accent">
              <ShieldCheck size={13} />
              {t('remote.secureBadge')}
            </span>
            <span className="pill">
              <Wifi size={13} />
              {t('remote.localBadge')}
            </span>
            <span className="pill">
              <Cloud size={13} />
              {t('remote.tunnelBadge')}
            </span>
            <span className="pill pill-muted">{t('remote.port', { port })}</span>
          </div>
        </section>

        <div className="remote-grid">
          <section className="remote-card">
            <header className="remote-card-head">
              <div className="remote-card-icon tone-teal">
                <Router size={21} />
              </div>
              <div className="remote-card-title">
                <h2>{t('remote.lanTitle')}</h2>
                <p>{t('remote.lanBody')}</p>
              </div>
            </header>

            <div className="lan-layout">
              <div className="lan-list">
                {info.lanAddresses.length === 0 && (
                  <div className="remote-empty">
                    <AlertTriangle size={18} />
                    {t('remote.lanEmpty')}
                  </div>
                )}
                {info.lanAddresses.map((address, index) => (
                  <div
                    key={address.address}
                    className={`address-row${index === selectedLan ? ' is-selected' : ''}`}
                    onClick={() => setSelectedLan(index)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setSelectedLan(index);
                    }}
                  >
                    <span className="address-radio" aria-hidden="true" />
                    <span className="address-copy">
                      <span className="address-label">
                        {address.name || t('remote.lanTitle')}
                        <span className="address-ip">{address.address}</span>
                      </span>
                      <span className="address-url">{address.url}</span>
                    </span>
                    <span className="address-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          void copyValue(`lan-${index}`, address.url);
                        }}
                        title={t('remote.copyAddress')}
                        aria-label={t('remote.copyAddress')}
                      >
                        {copied === `lan-${index}` ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                      <a
                        className="icon-btn"
                        href={address.url}
                        target="_blank"
                        rel="noreferrer"
                        title={t('remote.openAddress')}
                        aria-label={t('remote.openAddress')}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <ExternalLink size={15} />
                      </a>
                    </span>
                  </div>
                ))}

                <div className="address-row is-static">
                  <span className="address-static-icon">
                    <Monitor size={16} />
                  </span>
                  <span className="address-copy">
                    <span className="address-label">{t('remote.localAddress')}</span>
                    <span className="address-url">{info.localUrl}</span>
                  </span>
                  <span className="address-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => void copyValue('local', info.localUrl)}
                      title={t('remote.copyAddress')}
                      aria-label={t('remote.copyAddress')}
                    >
                      {copied === 'local' ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </span>
                </div>

                <div className="address-row is-static">
                  <span className="address-static-icon">
                    <Network size={16} />
                  </span>
                  <span className="address-copy">
                    <span className="address-label">{t('remote.hostnameAddress')}</span>
                    <span className="address-url">{info.hostnameUrl}</span>
                  </span>
                  <span className="address-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => void copyValue('hostname', info.hostnameUrl)}
                      title={t('remote.copyAddress')}
                      aria-label={t('remote.copyAddress')}
                    >
                      {copied === 'hostname' ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </span>
                </div>
              </div>

              <div className="qr-card">
                <div className="qr-shell">
                  <QRCodeSVG value={qrUrl} size={150} level="M" bgColor="transparent" fgColor="currentColor" />
                </div>
                <div className="qr-caption">
                  <QrCode size={14} />
                  {t('remote.qrHint')}
                </div>
                <code title={qrUrl}>{shortenMiddle(qrUrl, 34)}</code>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm qr-copy"
                  onClick={() => void copyValue('qr', qrUrl)}
                >
                  {copied === 'qr' ? <Check size={14} /> : <Copy size={14} />}
                  {t('remote.copyAddress')}
                </button>
              </div>
            </div>
          </section>

          <section className="remote-card tunnel-card">
            <header className="remote-card-head">
              <div className="remote-card-icon tone-accent">
                <Cloud size={21} />
              </div>
              <div className="remote-card-title">
                <h2>{t('remote.tunnelTitle')}</h2>
                <p>{t('remote.tunnelBody')}</p>
              </div>
            </header>

            {!status && (
              <div className="remote-loading">
                <Loader2 size={20} className="spinner" />
                {t('common.loading')}
              </div>
            )}

            {status && !status.installed && (
              <div className="tunnel-install">
                <div className="tunnel-install-icon">
                  <DownloadCloud size={24} />
                </div>
                <div>
                  <h3>{t('remote.tunnelNotInstalled')}</h3>
                  <p>{t('remote.tunnelInstallNote')}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void runTunnelAction('install')}
                  disabled={status.installing || action === 'install'}
                >
                  {(status.installing || action === 'install') && <Loader2 size={15} className="spinner" />}
                  {status.installing || action === 'install'
                    ? t('remote.tunnelInstalling')
                    : t('remote.tunnelInstall')}
                </button>
              </div>
            )}

            {status && status.installed && (
              <>
                <div className={`tunnel-status${status.running ? ' is-live' : ''}`}>
                  <span className="tunnel-status-dot" />
                  <div className="tunnel-status-copy">
                    <strong>
                      {status.running
                        ? t('remote.tunnelRunning')
                        : status.starting || action === 'start'
                          ? t('remote.tunnelStarting')
                          : t('remote.tunnelStopped')}
                    </strong>
                    <span>
                      {status.running && status.url
                        ? status.url
                        : status.supported
                          ? t('remote.tunnelOffline')
                          : t('remote.tunnelError')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`btn ${status.running ? 'btn-secondary' : 'btn-primary'}`}
                    onClick={() => void runTunnelAction(status.running ? 'stop' : 'start')}
                    disabled={tunnelBusy || action === 'stop'}
                  >
                    {tunnelBusy ? (
                      <Loader2 size={15} className="spinner" />
                    ) : status.running ? (
                      <Square size={14} />
                    ) : (
                      <Play size={14} />
                    )}
                    {status.running ? t('remote.tunnelStop') : t('remote.tunnelStart')}
                  </button>
                </div>

                {status.url && (
                  <div className="tunnel-url-box">
                    <span className="tunnel-url-label">{t('remote.tunnelUrl')}</span>
                    <div className="tunnel-url-row">
                      <a href={status.url} target="_blank" rel="noreferrer" className="tunnel-url">
                        {status.url}
                      </a>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => status.url && void copyValue('tunnel', status.url, t('remote.copied'))}
                        title={t('remote.copyPublic')}
                        aria-label={t('remote.copyPublic')}
                      >
                        {copied === 'tunnel' ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                      <a
                        className="icon-btn"
                        href={status.url}
                        target="_blank"
                        rel="noreferrer"
                        title={t('remote.openPublic')}
                        aria-label={t('remote.openPublic')}
                      >
                        <ExternalLink size={16} />
                      </a>
                    </div>
                    <div className="tunnel-warning">
                      <ShieldCheck size={15} />
                      {t('remote.tunnelWarning')}
                    </div>
                  </div>
                )}

                <div className="tunnel-settings">
                  <Switch
                    checked={status.autoStart}
                    onChange={(enabled) => void toggleAutoStart(enabled)}
                    disabled={autoBusy || status.installing}
                    label={t('remote.autoStart')}
                    description={t('remote.autoStartBody')}
                  />
                </div>

                {status.error && (
                  <div className="remote-error">
                    <AlertTriangle size={16} />
                    <div>
                      <strong>{t('remote.tunnelError')}</strong>
                      <span>{status.error}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {actionError && (
              <div className="remote-error">
                <AlertTriangle size={16} />
                <span>{actionError}</span>
              </div>
            )}

            <div className="tunnel-foot">
              <span>{t('remote.publicNote')}</span>
              <a
                href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
                target="_blank"
                rel="noreferrer"
              >
                {t('remote.learnCloudflare')}
                <ChevronRight size={13} />
              </a>
            </div>
          </section>
        </div>

        <div className="remote-grid remote-grid-secondary">
          <section className="remote-card">
            <header className="remote-card-head">
              <div className="remote-card-icon tone-amber">
                <ShieldCheck size={21} />
              </div>
              <div className="remote-card-title">
                <h2>{t('remote.firewallTitle')}</h2>
                <p>{t('remote.firewallBody')}</p>
              </div>
            </header>
            <div className="command-box">
              <code>{firewallCommand}</code>
              <button
                type="button"
                className="icon-btn"
                onClick={() => void copyValue('firewall', firewallCommand)}
                title={t('remote.firewallCopy')}
                aria-label={t('remote.firewallCopy')}
              >
                {copied === 'firewall' ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <div className="secure-list">
              <span>
                <Check size={14} />
                {t('remote.secure1')}
              </span>
              <span>
                <Check size={14} />
                {t('remote.secure3')}
              </span>
            </div>
          </section>

          <section className="remote-card">
            <header className="remote-card-head">
              <div className="remote-card-icon tone-violet">
                <Globe2 size={21} />
              </div>
              <div className="remote-card-title">
                <h2>{t('remote.otherTitle')}</h2>
                <p>{t('remote.otherBody')}</p>
              </div>
            </header>
            <div className="other-list">
              <div className="other-item">
                <Network size={18} />
                <div>
                  <strong>{t('remote.otherTailscale')}</strong>
                  <span>{t('remote.otherTailscaleBody')}</span>
                </div>
              </div>
              <div className="other-item">
                <Cloud size={18} />
                <div>
                  <strong>{t('remote.otherCloudflared')}</strong>
                  <span>{t('remote.otherCloudflaredBody')}</span>
                </div>
              </div>
              <div className="other-item">
                <Router size={18} />
                <div>
                  <strong>{t('remote.otherFrp')}</strong>
                  <span>{t('remote.otherFrpBody')}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="remote-secure-strip">
          <ShieldCheck size={18} />
          <div>
            <strong>{t('remote.secureTitle')}</strong>
            <span>{t('remote.secure2')}</span>
          </div>
          <span className="remote-secure-item">
            <Check size={13} />
            {t('remote.secure4')}
          </span>
        </div>
      </div>
    </div>
  );
}
