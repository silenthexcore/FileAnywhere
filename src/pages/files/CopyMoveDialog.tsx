import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ChevronRight,
  CornerLeftUp,
  Copy,
  FolderPlus,
  Folder as FolderIcon,
  Loader2,
  Move,
} from 'lucide-react';
import { Dialog, DialogFooter, DialogHeader } from '../../components/Dialog';
import { Spinner } from '../../components/Controls';
import { QuickIcon } from '../../components/FileIcon';
import { useI18n } from '../../i18n';
import { useProtection } from '../../context/ProtectionContext';
import { api, ApiError } from '../../lib/api';
import {
  joinPath,
  parentPath,
  quickFolderIconKey,
  samePath,
  shortenMiddle,
} from '../../lib/files';
import { translateError } from '../../lib/preferences';
import type { FsItem, SystemInfo } from '../../types';

export type CopyMoveMode = 'copy' | 'move';

interface CopyMoveDialogProps {
  open: boolean;
  mode: CopyMoveMode;
  targets: FsItem[];
  startPath: string;
  info: SystemInfo | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (destination: string) => void;
}

export function CopyMoveDialog({
  open,
  mode,
  targets,
  startPath,
  info,
  busy,
  error,
  onClose,
  onConfirm,
}: CopyMoveDialogProps) {
  const { t } = useI18n();
  const { askProtection } = useProtection();
  const [current, setCurrent] = useState(startPath);
  const [folders, setFolders] = useState<FsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [browseError, setBrowseError] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBusy, setNewBusy] = useState(false);
  const [newError, setNewError] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setCurrent(startPath);
    setNewOpen(false);
    setNewName('');
    setNewError('');
  }, [open, startPath]);

  useEffect(() => {
    if (!open) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setBrowseError('');
    api
      .list(current, true, controller.signal)
      .then((listing) => {
        setFolders(listing.items);
        setLoading(false);
      })
      .catch((caught) => {
        if (controller.signal.aborted || (caught as Error)?.name === 'AbortError') return;
        setBrowseError(translateError(t, caught as ApiError));
        setFolders([]);
        setLoading(false);
      });
    return () => controller.abort();
  }, [open, current, t]);

  const title = mode === 'copy' ? t('copyMove.copyTitle') : t('copyMove.moveTitle');
  const body =
    targets.length === 1
      ? t(mode === 'copy' ? 'copyMove.singleCopyBody' : 'copyMove.singleMoveBody', { name: targets[0].name })
      : t(mode === 'copy' ? 'copyMove.copyBody' : 'copyMove.moveBody', { count: targets.length });

  const up = parentPath(current);
  const quickFolders = (info?.knownFolders || []).filter((folder) => folder.exists);
  const alreadyHere =
    mode === 'move' && targets.length > 0 && targets.every((item) => {
      const parent = parentPath(item.path);
      return parent ? samePath(parent, current) : false;
    });

  const go = (next: string) => {
    setCurrent(next);
    setNewOpen(false);
    setNewError('');
  };

  const createFolder = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || newBusy) return;
    setNewBusy(true);
    setNewError('');
    try {
      const target = joinPath(current, name);
      try {
        await api.createFolder(current, name, false);
      } catch (caught) {
        if (caught instanceof ApiError && caught.code === 'PROTECTED_PATH') {
          const allowed = await askProtection({ operation: 'create', paths: [target] });
          if (!allowed) return;
          await api.createFolder(current, name, true);
        } else {
          throw caught;
        }
      }
      setNewOpen(false);
      setNewName('');
      const listing = await api.list(current, true);
      setFolders(listing.items);
    } catch (caught) {
      setNewError(translateError(t, caught as ApiError));
    } finally {
      setNewBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? () => undefined : onClose} className="dialog-copymove" closeOnBackdrop={!busy}>
      <DialogHeader
        icon={mode === 'copy' ? <Copy size={21} /> : <Move size={21} />}
        title={title}
        subtitle={body}
      />

      <div className="copymove-layout">
        <aside className="copymove-side">
          <div className="copymove-side-label">{t('copyMove.quickPlaces')}</div>
          <div className="copymove-places">
            {quickFolders.map((folder) => {
              const kind = quickFolderIconKey(folder.key);
              return (
                <button
                  key={folder.key}
                  type="button"
                  className={`copymove-place${samePath(current, folder.path) ? ' is-active' : ''}`}
                  onClick={() => go(folder.path)}
                >
                  <QuickIcon kind={kind} size={26} />
                  <span>{t(`quick.${kind}`)}</span>
                </button>
              );
            })}
          </div>
          <div className="copymove-side-label">{t('copyMove.drives')}</div>
          <div className="copymove-places">
            {(info?.drives || []).map((drive) => (
              <button
                key={drive.path}
                type="button"
                className={`copymove-place${samePath(current, drive.path) ? ' is-active' : ''}`}
                onClick={() => go(drive.path)}
              >
                <span className="copymove-drive-letter">{drive.letter}</span>
                <span className="copymove-drive-name">
                  {drive.label || (drive.type === 'fixed' ? t('drives.localDisk') : t(`drives.${drive.type}`))}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="copymove-main">
          <div className="copymove-pathbar">
            <button
              type="button"
              className="icon-btn"
              onClick={() => up && go(up)}
              disabled={!up}
              title={t('copyMove.up')}
              aria-label={t('copyMove.up')}
            >
              <CornerLeftUp size={18} />
            </button>
            <span className="copymove-path" title={current}>
              {shortenMiddle(current, 74)}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setNewOpen(true);
                setNewName('');
                setNewError('');
              }}
            >
              <FolderPlus size={15} />
              {t('copyMove.newFolder')}
            </button>
          </div>

          {newOpen && (
            <form className="copymove-new" onSubmit={createFolder}>
              <FolderIcon size={16} className="copymove-new-icon" />
              <input
                className="input input-sm"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={t('copyMove.newFolderPlaceholder')}
                autoFocus
                disabled={newBusy}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={newBusy || !newName.trim()}>
                {newBusy && <Loader2 size={14} className="spinner" />}
                {t('common.create')}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setNewOpen(false)}
                disabled={newBusy}
              >
                {t('common.cancel')}
              </button>
            </form>
          )}
          {newError && <div className="form-error copymove-error">{newError}</div>}

          <div className="copymove-list">
            {loading && (
              <div className="copymove-loading">
                <Spinner size={20} />
                {t('common.loading')}
              </div>
            )}
            {!loading && browseError && <div className="form-error">{browseError}</div>}
            {!loading && !browseError && folders.length === 0 && (
              <div className="copymove-empty">{t('copyMove.noFolders')}</div>
            )}
            {!loading &&
              folders.map((folder) => (
                <button
                  key={folder.path}
                  type="button"
                  className="copymove-folder"
                  onClick={() => go(folder.path)}
                  onDoubleClick={() => onConfirm(folder.path)}
                >
                  <span className="copymove-folder-icon">
                    <FolderIcon size={18} fill="currentColor" strokeWidth={1.4} />
                  </span>
                  <span className="copymove-folder-name">{folder.name}</span>
                  <ChevronRight size={16} className="copymove-folder-arrow" />
                </button>
              ))}
          </div>

          <div className="copymove-destination">
            <span>{t('copyMove.destination')}</span>
            <strong title={current}>{shortenMiddle(current, 80)}</strong>
          </div>
        </section>
      </div>

      {error && <div className="form-error">{error}</div>}
      {alreadyHere && <div className="copymove-note">{t('copyMove.alreadyHere')}</div>}
      <p className="copymove-hint">{t('copyMove.conflictNote')}</p>

      <DialogFooter>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onConfirm(current)} disabled={busy}>
          {busy && <Loader2 size={16} className="spinner" />}
          {busy
            ? t(mode === 'copy' ? 'copyMove.copying' : 'copyMove.moving')
            : t(mode === 'copy' ? 'copyMove.copyHere' : 'copyMove.moveHere')}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
