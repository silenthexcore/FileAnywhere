import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FolderOpen,
  Globe2,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { Logo, LogoMark } from '../components/Logo';
import { DriveIcon, QuickIcon } from '../components/FileIcon';
import { Spinner } from '../components/Controls';
import { formatBytes, quickFolderIconKey, samePath } from '../lib/files';
import { UploadProvider } from '../context/UploadContext';
import { FilesPage } from './FilesPage';
import { RemotePage } from './RemotePage';
import { SettingsDialog } from './SettingsDialog';
import type { SystemInfo } from '../types';

type Route = 'files' | 'remote';

const PATH_KEY = 'fa.lastPath.v1';

function initialRoute(): Route {
  return window.location.pathname.replace(/\/+$/, '') === '/remote' ? 'remote' : 'files';
}

export function AppShell({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [route, setRoute] = useState<Route>(initialRoute);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [infoError, setInfoError] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadInfo = useCallback(async (refresh = false) => {
    setRefreshing(true);
    try {
      const next = await api.systemInfo(refresh);
      setInfo(next);
      setInfoError(false);
      setPath((current) => {
        if (current) return current;
        const stored = (() => {
          try {
            return localStorage.getItem(PATH_KEY);
          } catch {
            return null;
          }
        })();
        if (stored) return stored;
        const home = next.knownFolders.find((folder) => folder.key === 'home' && folder.exists);
        return home?.path || next.drives[0]?.path || 'C:\\';
      });
    } catch {
      setInfoError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  useEffect(() => {
    const onPop = () => setRoute(initialRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [route, path]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const navigateRoute = useCallback((next: Route) => {
    const url = next === 'remote' ? '/remote' : '/';
    if (window.location.pathname !== url) window.history.pushState({}, '', url);
    setRoute(next);
  }, []);

  const navigatePath = useCallback((next: string) => {
    try {
      localStorage.setItem(PATH_KEY, next);
    } catch {
      /* ignore */
    }
    setPath(next);
    navigateRoute('files');
  }, [navigateRoute]);

  const handleSettingsRefresh = useCallback(() => {
    void loadInfo(true);
  }, [loadInfo]);

  const sidebar = useMemo(
    () => (
      <SidebarContent
        info={info}
        activePath={path}
        route={route}
        refreshing={refreshing}
        onNavigate={navigatePath}
        onRoute={navigateRoute}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefresh={() => void loadInfo(true)}
        onSignOut={onSignOut}
        onClose={() => setDrawerOpen(false)}
      />
    ),
    [info, path, route, refreshing, navigatePath, navigateRoute, loadInfo, onSignOut],
  );

  return (
    <UploadProvider>
      <div className="app-shell">
        <aside className="sidebar">{sidebar}</aside>

        {drawerOpen && (
          <div className="drawer-layer" role="presentation">
            <button
              type="button"
              className="drawer-backdrop"
              onClick={() => setDrawerOpen(false)}
              aria-label={t('common.close')}
            />
            <aside className="sidebar sidebar-drawer">
              <button
                type="button"
                className="drawer-close icon-btn"
                onClick={() => setDrawerOpen(false)}
                aria-label={t('common.close')}
              >
                <X size={19} />
              </button>
              {sidebar}
            </aside>
          </div>
        )}

        <main className="app-main">
          {!info && !infoError && (
            <div className="app-loading">
              <LogoMark size={46} />
              <Spinner size={20} />
              <span>{t('common.loading')}</span>
            </div>
          )}

          {infoError && !info && (
            <div className="app-error">
              <LogoMark size={52} />
              <h1>{t('empty.errorTitle')}</h1>
              <p>{t('error.NETWORK')}</p>
              <button type="button" className="btn btn-primary" onClick={() => void loadInfo()}>
                <RefreshCw size={16} />
                {t('common.retry')}
              </button>
            </div>
          )}

          {info && path && route === 'files' && (
            <FilesPage
              path={path}
              systemInfo={info}
              onNavigate={navigatePath}
              onOpenSidebar={() => setDrawerOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenRemote={() => navigateRoute('remote')}
              onRefreshSystem={() => void loadInfo(true)}
            />
          )}

          {info && route === 'remote' && (
            <RemotePage
              info={info}
              onBack={() => navigateRoute('files')}
              onOpenSidebar={() => setDrawerOpen(true)}
              onRefreshSystem={() => void loadInfo(true)}
            />
          )}
        </main>

        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          info={info}
          onSignOut={onSignOut}
          onRefreshInfo={handleSettingsRefresh}
        />
      </div>
    </UploadProvider>
  );
}

interface SidebarProps {
  info: SystemInfo | null;
  activePath: string | null;
  route: Route;
  refreshing: boolean;
  onNavigate: (path: string) => void;
  onRoute: (route: Route) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onClose: () => void;
}

function SidebarContent({
  info,
  activePath,
  route,
  refreshing,
  onNavigate,
  onRoute,
  onOpenSettings,
  onRefresh,
  onSignOut,
  onClose,
}: SidebarProps) {
  const { t, locale } = useI18n();
  const quickFolders = (info?.knownFolders || []).filter((folder) => folder.exists);

  return (
    <div className="sidebar-inner">
      <div className="sidebar-brand">
        <Logo size={36} />
      </div>

      <nav className="sidebar-nav" aria-label={t('nav.files')}>
        <button
          type="button"
          className={`nav-link${route === 'files' ? ' is-active' : ''}`}
          onClick={() => {
            onRoute('files');
            onClose();
          }}
        >
          <span className="nav-link-icon tone-accent">
            <FolderOpen size={19} strokeWidth={1.9} />
          </span>
          <span>{t('nav.files')}</span>
        </button>
        <button
          type="button"
          className={`nav-link${route === 'remote' ? ' is-active' : ''}`}
          onClick={() => {
            onRoute('remote');
            onClose();
          }}
        >
          <span className="nav-link-icon tone-teal">
            <Globe2 size={19} strokeWidth={1.9} />
          </span>
          <span>{t('nav.remote')}</span>
        </button>
      </nav>

      <div className="sidebar-scroll">
        {quickFolders.length > 0 && (
          <section className="sidebar-section">
            <div className="sidebar-label">{t('nav.quickAccess')}</div>
            <div className="sidebar-list">
              {quickFolders.map((folder) => {
                const kind = quickFolderIconKey(folder.key);
                const active = route === 'files' && activePath !== null && samePath(activePath, folder.path);
                return (
                  <button
                    key={folder.key}
                    type="button"
                    className={`place-link${active ? ' is-active' : ''}`}
                    title={folder.path}
                    onClick={() => {
                      onNavigate(folder.path);
                      onClose();
                    }}
                  >
                    <QuickIcon kind={kind} size={28} />
                    <span className="place-copy">
                      <span className="place-name">{t(`quick.${kind}`)}</span>
                      <span className="place-path">{folder.path}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="sidebar-section">
          <div className="sidebar-label-row">
            <span className="sidebar-label">{t('nav.drives')}</span>
            <button
              type="button"
              className="sidebar-mini-btn"
              onClick={onRefresh}
              title={t('drives.refresh')}
              aria-label={t('drives.refresh')}
            >
              <RefreshCw size={13} className={refreshing ? 'spinner' : ''} />
            </button>
          </div>
          <div className="sidebar-list">
            {(info?.drives || []).map((drive) => {
              const active = route === 'files' && activePath !== null && samePath(activePath, drive.path);
              const usedPercent = drive.total > 0 ? Math.min(100, Math.round(((drive.total - drive.free) / drive.total) * 100)) : 0;
              return (
                <button
                  key={drive.path}
                  type="button"
                  className={`drive-link${active ? ' is-active' : ''}`}
                  title={drive.path}
                  onClick={() => {
                    onNavigate(drive.path);
                    onClose();
                  }}
                >
                  <DriveIcon drive={drive} size={28} />
                  <span className="drive-copy">
                    <span className="drive-name">
                      {drive.letter}
                      {drive.label ? <span className="drive-label-text">{drive.label}</span> : null}
                    </span>
                    <span className="drive-meta">
                      {drive.total > 0
                        ? t('drives.freeOf', {
                            free: formatBytes(drive.free, locale),
                            total: formatBytes(drive.total, locale),
                          })
                        : drive.type === 'fixed'
                          ? t('drives.localDisk')
                          : t(`drives.${drive.type}`)}
                    </span>
                    {drive.total > 0 && (
                      <span className="drive-meter" aria-hidden="true">
                        <span style={{ width: `${usedPercent}%` }} />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="sidebar-footer">
        <button type="button" className="nav-link is-quiet" onClick={onOpenSettings}>
          <span className="nav-link-icon tone-slate">
            <Settings size={19} strokeWidth={1.9} />
          </span>
          <span>{t('nav.settings')}</span>
        </button>

        <div className="sidebar-account">
          <span className="account-avatar">{(info?.username || '?').slice(0, 1).toUpperCase()}</span>
          <span className="account-copy">
            <span className="account-name" title={t('nav.connectedAs', { name: info?.username || '' })}>
              {info?.username || t('common.unknown')}
            </span>
            <span className="account-host" title={info?.hostname}>
              <ShieldCheck size={11} />
              {info?.hostname || t('nav.thisComputer')}
            </span>
          </span>
          <button
            type="button"
            className="icon-btn account-signout"
            onClick={onSignOut}
            title={t('nav.signOut')}
            aria-label={t('nav.signOut')}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
