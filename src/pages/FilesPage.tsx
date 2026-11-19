import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Grid2X2,
  Home,
  List,
  Lock,
  Menu as MenuIcon,
  MoreHorizontal,
  Move,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useI18n, type TranslationKey } from '../i18n';
import { usePreferences } from '../lib/PreferencesContext';
import { useToast } from '../components/Toast';
import { useProtection, type ProtectedOperation } from '../context/ProtectionContext';
import { useUploads } from '../context/UploadContext';
import { api, ApiError, archiveUrl, downloadUrl } from '../lib/api';
import { copyText } from '../lib/clipboard';
import {
  baseName,
  fileKind,
  formatBytes,
  formatDate,
  formatNumber,
  isTextLike,
  joinPath,
  parentPath,
  samePath,
  shortenMiddle,
  sortItems,
  typeLabelKey,
} from '../lib/files';
import { translateError } from '../lib/preferences';
import { useMediaQuery } from '../lib/useMediaQuery';
import { FileIcon } from '../components/FileIcon';
import { EmptyFolderIllustration } from '../components/Logo';
import { Checkbox, Spinner } from '../components/Controls';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContextMenu, DropdownMenu, MenuItem, MenuLabel, MenuSeparator } from '../components/Menu';
import { NameDialog } from './files/NameDialog';
import { CopyMoveDialog, type CopyMoveMode } from './files/CopyMoveDialog';
import { SearchPanel } from './files/SearchPanel';
import { PreviewDialog } from './files/PreviewDialog';
import { EditorDialog } from './files/EditorDialog';
import type { FsItem, Listing, SystemInfo } from '../types';

interface FilesPageProps {
  path: string;
  systemInfo: SystemInfo;
  onNavigate: (path: string) => void;
  onOpenSidebar: () => void;
  onOpenSettings: () => void;
  onOpenRemote: () => void;
  onRefreshSystem: () => void;
}

interface MenuState {
  point: { x: number; y: number };
  item: FsItem | null;
}

type NewKind = 'folder' | 'file';

export function FilesPage({ path, systemInfo, onNavigate, onOpenSidebar, onRefreshSystem }: FilesPageProps) {
  const { t, locale } = useI18n();
  const { prefs, updatePrefs } = usePreferences();
  const { toast } = useToast();
  const { askProtection } = useProtection();
  const { add: addUploads, lastUpload } = useUploads();
  const compact = useMediaQuery('(max-width: 760px)');

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flashPath, setFlashPath] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const [newKind, setNewKind] = useState<NewKind | null>(null);
  const [newBusy, setNewBusy] = useState(false);
  const [newError, setNewError] = useState('');

  const [renameTarget, setRenameTarget] = useState<FsItem | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState('');

  const [deleteTargets, setDeleteTargets] = useState<FsItem[] | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [copyMove, setCopyMove] = useState<{ mode: CopyMoveMode; targets: FsItem[] } | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState('');

  const [previewItem, setPreviewItem] = useState<FsItem | null>(null);
  const [editorItem, setEditorItem] = useState<FsItem | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const lastIndexRef = useRef(-1);
  const loadSequence = useRef(0);
  const crumbsRef = useRef<HTMLElement>(null);

  const load = useCallback(async (target: string, silent = false) => {
    const sequence = ++loadSequence.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const next = await api.list(target, false, controller.signal);
      if (sequence !== loadSequence.current) return;
      setListing(next);
      setError(null);
    } catch (caught) {
      if (controller.signal.aborted || (caught as Error)?.name === 'AbortError') return;
      if (sequence !== loadSequence.current) return;
      const apiError = caught as ApiError;
      setError({
        code: apiError.code,
        message:
          apiError.code === 'ACCESS_DENIED'
            ? t('files.accessDenied')
            : apiError.code === 'FORBIDDEN_PATH'
              ? t('error.FORBIDDEN_PATH')
              : translateError(t, apiError),
      });
      setListing(null);
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    setSelected(new Set());
    setListing(null);
    setError(null);
    setFlashPath(null);
    void load(path);
  }, [path, load]);

  useEffect(() => {
    if (!listing) return;
    setSelected((current) => {
      const valid = new Set(listing.items.map((item) => item.path));
      const next = new Set([...current].filter((item) => valid.has(item)));
      return next.size === current.size ? current : next;
    });
  }, [listing]);

  useEffect(() => {
    if (!lastUpload || !samePath(lastUpload.destination, path)) return;
    void load(path, true);
    // Only react to completed uploads, not to path changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpload?.nonce]);

  useEffect(() => {
    if (!flashPath) return;
    const timer = window.setTimeout(() => setFlashPath(null), 2400);
    return () => window.clearTimeout(timer);
  }, [flashPath]);

  // 移动端面包屑横向溢出时，默认把当前目录滚入可视区域
  useEffect(() => {
    const element = crumbsRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [path, listing]);

  const items = useMemo(() => {
    if (!listing) return [];
    const visible = listing.items.filter((item) => prefs.showHidden || !item.hidden);
    return sortItems(visible, prefs.sortBy, prefs.sortDirection, locale);
  }, [listing, prefs.showHidden, prefs.sortBy, prefs.sortDirection, locale]);

  const selectedItems = useMemo(() => {
    if (!listing) return [];
    return listing.items.filter((item) => selected.has(item.path));
  }, [listing, selected]);

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.path));

  const runProtected = async <T,>(
    operation: ProtectedOperation,
    paths: string[],
    run: (allowProtected: boolean) => Promise<T>,
  ): Promise<T> => {
    try {
      return await run(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'PROTECTED_PATH') {
        const allowed = await askProtection({ operation, paths });
        if (!allowed) throw new ApiError('CANCELLED_BY_USER', t('protection.cancelled'), 0);
        return run(true);
      }
      throw caught;
    }
  };

  const reportError = (caught: unknown) => {
    const apiError = caught as ApiError;
    if (apiError?.code === 'CANCELLED_BY_USER') {
      toast({ type: 'info', title: t('protection.cancelled') });
      return;
    }
    if (apiError?.code === 'CRITICAL_PATH') {
      toast({ type: 'error', title: t('delete.critical') });
      return;
    }
    toast({ type: 'error', title: t('toast.operationFailed'), message: translateError(t, apiError) });
  };

  const openItem = useCallback(
    (item: FsItem) => {
      if (item.isDir) onNavigate(item.path);
      else setPreviewItem(item);
    },
    [onNavigate],
  );

  const downloadItems = async (targets: FsItem[]) => {
    if (targets.length === 0) return;
    try {
      if (targets.length === 1) {
        window.location.href = downloadUrl(targets[0].path);
        return;
      }
      toast({ type: 'info', title: t('toast.downloadPreparing') });
      const { ticket } = await api.createArchiveTicket(targets.map((item) => item.path));
      window.location.href = archiveUrl(ticket);
    } catch (caught) {
      toast({
        type: 'error',
        title: t('toast.downloadFailed'),
        message: translateError(t, caught as ApiError),
      });
    }
  };

  const copyPath = async (target: FsItem | undefined) => {
    if (!target) return;
    const ok = await copyText(target.path);
    toast({ type: ok ? 'success' : 'error', title: ok ? t('toast.copiedPath') : t('common.copyFailed') });
  };

  const handleSelect = (item: FsItem, index: number, event: MouseEvent) => {
    if (compact) {
      if (event.ctrlKey || event.metaKey) {
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(item.path)) next.delete(item.path);
          else next.add(item.path);
          return next;
        });
        return;
      }
      openItem(item);
      return;
    }
    if (event.shiftKey && lastIndexRef.current >= 0) {
      const start = Math.min(lastIndexRef.current, index);
      const end = Math.max(lastIndexRef.current, index);
      setSelected((current) => {
        const next = new Set(current);
        for (let cursor = start; cursor <= end; cursor += 1) next.add(items[cursor].path);
        return next;
      });
      return;
    }
    lastIndexRef.current = index;
    if (event.ctrlKey || event.metaKey) {
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(item.path)) next.delete(item.path);
        else next.add(item.path);
        return next;
      });
      return;
    }
    setSelected(new Set([item.path]));
  };

  const toggleSelect = (item: FsItem, index: number) => {
    lastIndexRef.current = index;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(item.path)) next.delete(item.path);
      else next.add(item.path);
      return next;
    });
  };

  const openMenu = (item: FsItem | null, point: { x: number; y: number }) => {
    if (item) {
      setSelected((current) => {
        if (current.has(item.path)) return current;
        return new Set([item.path]);
      });
    }
    setMenu({ item, point });
  };

  const openRowMenu = (item: FsItem, event: MouseEvent) => {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu(item, { x: Math.max(rect.right - 238, 10), y: rect.bottom + 4 });
  };

  const openContextMenu = (item: FsItem, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openMenu(item, { x: event.clientX, y: event.clientY });
  };

  const menuTargets = useMemo(() => {
    if (!menu?.item) return [];
    if (selected.has(menu.item.path) && selectedItems.length > 0) return selectedItems;
    return [menu.item];
  }, [menu, selected, selectedItems]);

  const createNew = async (name: string) => {
    if (!newKind) return;
    setNewBusy(true);
    setNewError('');
    try {
      const targetPath = joinPath(path, name);
      await runProtected('create', [targetPath], (allow) =>
        newKind === 'folder' ? api.createFolder(path, name, allow) : api.createFile(path, name, allow),
      );
      setNewKind(null);
      toast({
        type: 'success',
        title: newKind === 'folder' ? t('newFolder.title') : t('newFile.success'),
        message: name,
      });
      await load(path, true);
    } catch (caught) {
      const apiError = caught as ApiError;
      setNewError(
        apiError?.code === 'CANCELLED_BY_USER' ? t('protection.cancelled') : translateError(t, apiError),
      );
    } finally {
      setNewBusy(false);
    }
  };

  const confirmRename = async (name: string) => {
    if (!renameTarget) return;
    setRenameBusy(true);
    setRenameError('');
    try {
      await runProtected('rename', [renameTarget.path], (allow) => api.rename(renameTarget.path, name, allow));
      setRenameTarget(null);
      toast({ type: 'success', title: t('rename.success'), message: name });
      await load(path, true);
    } catch (caught) {
      const apiError = caught as ApiError;
      setRenameError(
        apiError?.code === 'CANCELLED_BY_USER' ? t('protection.cancelled') : translateError(t, apiError),
      );
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargets || deleteTargets.length === 0) return;
    setDeleteBusy(true);
    const paths = deleteTargets.map((item) => item.path);
    try {
      const result = await runProtected('delete', paths, (allow) => api.remove(paths, allow));
      const succeeded = result.results.filter((entry) => entry.ok).length;
      if (succeeded === paths.length) {
        toast({ type: 'success', title: t('delete.success', { count: succeeded }) });
      } else {
        toast({
          type: 'warning',
          title: t('delete.partial'),
          message: t('delete.success', { count: succeeded }),
        });
      }
      setDeleteTargets(null);
      setSelected(new Set());
      await load(path, true);
      onRefreshSystem();
    } catch (caught) {
      reportError(caught);
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmCopyMove = async (destination: string) => {
    if (!copyMove) return;
    setCopyBusy(true);
    setCopyError('');
    const paths = copyMove.targets.map((item) => item.path);
    try {
      const result =
        copyMove.mode === 'copy'
          ? await runProtected('copy', [destination], (allow) => api.copy(paths, destination, allow))
          : await runProtected('move', paths, (allow) => api.move(paths, destination, allow));
      const succeeded = result.results.filter((entry) => entry.ok).length;
      if (succeeded === paths.length) {
        toast({
          type: 'success',
          title: t(copyMove.mode === 'copy' ? 'copyMove.copySuccess' : 'copyMove.moveSuccess', {
            count: succeeded,
          }),
        });
      } else {
        toast({
          type: 'warning',
          title: t('copyMove.partial'),
          message: t('copyMove.copySuccess', { count: succeeded }),
        });
      }
      setCopyMove(null);
      setSelected(new Set());
      await load(path, true);
      onRefreshSystem();
    } catch (caught) {
      const apiError = caught as ApiError;
      setCopyError(
        apiError?.code === 'CANCELLED_BY_USER' ? t('protection.cancelled') : translateError(t, apiError),
      );
    } finally {
      setCopyBusy(false);
    }
  };

  const handleFiles = (files: File[]) => {
    if (!files.length) return;
    addUploads(path, files);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const transfer = event.dataTransfer;
    const entries = Array.from(transfer.items || []).filter((item) => item.kind === 'file');
    const hasFolder = entries.some((item) => {
      const handle = (item as DataTransferItem & {
        webkitGetAsEntry?: () => { isDirectory: boolean } | null;
      }).webkitGetAsEntry?.();
      return Boolean(handle?.isDirectory);
    });
    const files = entries.length
      ? entries.map((item) => item.getAsFile()).filter((file): file is File => Boolean(file))
      : Array.from(transfer.files);
    if (hasFolder) toast({ type: 'warning', title: t('files.dropFolderUnsupported') });
    handleFiles(files);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (editorItem || previewItem || newKind || renameTarget || deleteTargets || copyMove || searchOpen) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (modifier && event.key.toLowerCase() === 'a') {
        if (items.length === 0) return;
        event.preventDefault();
        setSelected(new Set(items.map((item) => item.path)));
      } else if (event.key === 'Delete' && selectedItems.length > 0) {
        event.preventDefault();
        setDeleteTargets(selectedItems);
      } else if (event.key === 'F2' && selectedItems.length === 1) {
        event.preventDefault();
        setRenameTarget(selectedItems[0]);
        setRenameError('');
      } else if (event.altKey && event.key === 'ArrowUp' && listing?.parent) {
        event.preventDefault();
        onNavigate(listing.parent);
      } else if (event.key === 'Escape' && selected.size > 0) {
        setSelected(new Set());
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    copyMove,
    deleteTargets,
    editorItem,
    items,
    listing?.parent,
    newKind,
    onNavigate,
    previewItem,
    renameTarget,
    searchOpen,
    selected.size,
    selectedItems,
  ]);

  const heading = listing?.name || baseName(path) || t('files.title');
  const homePath = systemInfo.knownFolders.find((folder) => folder.key === 'home')?.path || systemInfo.drives[0]?.path || path;

  const sortLabel: Record<string, TranslationKey> = {
    name: 'files.sort.name',
    modified: 'files.sort.modified',
    size: 'files.sort.size',
    type: 'files.sort.type',
  };

  const selectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((item) => item.path)));
  };

  return (
    <div
      className={`files-page${dragActive ? ' is-dragging' : ''}`}
      onDragEnter={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragActive(true);
      }}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragActive(false);
      }}
      onDrop={onDrop}
    >
      <header className="files-head">
        <div className="files-head-main">
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            onClick={onOpenSidebar}
            aria-label={t('menu.more')}
          >
            <MenuIcon size={20} />
          </button>
          <div className="files-title-block">
            <div className="page-eyebrow">
              <span className="status-dot" />
              {systemInfo.hostname}
            </div>
            <h1 title={path}>{heading}</h1>
            <div className="files-subline">
              {listing ? (
                <>
                  <span>{t('files.itemsCount', { count: formatNumber(items.length, locale) })}</span>
                  {listing.directoryProtected && (
                    <span className="protected-inline">
                      <ShieldAlert size={12} />
                      {t('files.systemProtected')}
                    </span>
                  )}
                </>
              ) : (
                <span>{loading ? t('files.loadingFolder') : t('files.title')}</span>
              )}
            </div>
          </div>
        </div>

        <div className="files-head-actions">
          <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)}>
            <Search size={16} />
            <span>{t('search.placeholder')}</span>
            <kbd>{t('search.shortcut')}</kbd>
          </button>
          <button
            type="button"
            className="icon-btn search-mobile-btn"
            onClick={() => setSearchOpen(true)}
            aria-label={t('common.search')}
          >
            <Search size={19} />
          </button>

          <DropdownMenu
            width={210}
            trigger={
              <button type="button" className="btn btn-primary" aria-label={t('files.newMenu')}>
                <Plus size={16} />
                <span className="btn-label">{t('files.newMenu')}</span>
                <ChevronDown size={14} className="btn-caret" />
              </button>
            }
          >
            <MenuLabel>{t('menu.new')}</MenuLabel>
            <MenuItem
              icon={<FolderPlus size={16} />}
              label={t('files.newFolder')}
              shortcut="Ctrl ⇧ N"
              onSelect={() => {
                setNewError('');
                setNewKind('folder');
              }}
            />
            <MenuItem
              icon={<FilePlus2 size={16} />}
              label={t('files.newFile')}
              onSelect={() => {
                setNewError('');
                setNewKind('file');
              }}
            />
          </DropdownMenu>

          <button
            type="button"
            className="btn btn-secondary upload-btn"
            onClick={() => fileInputRef.current?.click()}
            aria-label={t('common.upload')}
            title={t('common.upload')}
          >
            <UploadCloud size={16} />
            <span className="btn-label">{t('common.upload')}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              handleFiles(Array.from(event.target.files || []));
              event.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="breadcrumb-bar">
        <button
          type="button"
          className="icon-btn breadcrumb-up"
          onClick={() => listing?.parent && onNavigate(listing.parent)}
          disabled={!listing?.parent}
          title={t('copyMove.up')}
          aria-label={t('copyMove.up')}
        >
          <ArrowUp size={17} />
        </button>
        <nav className="breadcrumbs" aria-label={path} ref={crumbsRef}>
          {(listing?.breadcrumbs || []).map((crumb, index) => {
            const last = index === (listing?.breadcrumbs.length || 0) - 1;
            return (
              <span key={crumb.path} className="breadcrumb-segment">
                {index > 0 && <ChevronRight size={13} className="breadcrumb-sep" />}
                <button
                  type="button"
                  className={`breadcrumb${last ? ' is-current' : ''}`}
                  onClick={() => !last && onNavigate(crumb.path)}
                  title={crumb.path}
                >
                  {index === 0 && <Home size={13} />}
                  {crumb.name}
                </button>
              </span>
            );
          })}
        </nav>
        <div className="breadcrumb-tools">
          <button
            type="button"
            className="icon-btn"
            onClick={() => updatePrefs({ view: prefs.view === 'list' ? 'grid' : 'list' })}
            title={prefs.view === 'list' ? t('files.viewGrid') : t('files.viewList')}
            aria-label={prefs.view === 'list' ? t('files.viewGrid') : t('files.viewList')}
          >
            {prefs.view === 'list' ? <Grid2X2 size={17} /> : <List size={17} />}
          </button>

          <DropdownMenu
            width={230}
            trigger={
              <button type="button" className="icon-btn tool-with-label" title={t('files.sortBy')}>
                <ArrowUpDown size={17} />
                <span>{t(sortLabel[prefs.sortBy] || 'files.sort.name')}</span>
              </button>
            }
          >
            <MenuLabel>{t('files.sortBy')}</MenuLabel>
            {(['name', 'modified', 'size', 'type'] as const).map((key) => (
              <MenuItem
                key={key}
                label={t(sortLabel[key])}
                selected={prefs.sortBy === key}
                onSelect={() => updatePrefs({ sortBy: key })}
              />
            ))}
            <MenuSeparator />
            <MenuItem
              label={t('files.sort.ascending')}
              selected={prefs.sortDirection === 'asc'}
              onSelect={() => updatePrefs({ sortDirection: 'asc' })}
            />
            <MenuItem
              label={t('files.sort.descending')}
              selected={prefs.sortDirection === 'desc'}
              onSelect={() => updatePrefs({ sortDirection: 'desc' })}
            />
          </DropdownMenu>

          <button
            type="button"
            className="icon-btn"
            onClick={() => void load(path, true)}
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
          >
            <RefreshCw size={17} className={refreshing ? 'spinner' : ''} />
          </button>

          <DropdownMenu
            width={240}
            trigger={
              <button type="button" className="icon-btn" title={t('files.more')} aria-label={t('files.more')}>
                <MoreHorizontal size={18} />
              </button>
            }
          >
            <MenuItem
              icon={<Eye size={16} />}
              label={prefs.showHidden ? t('files.hideHidden') : t('files.showHidden')}
              selected={prefs.showHidden}
              onSelect={() => updatePrefs({ showHidden: !prefs.showHidden })}
            />
            <MenuItem
              icon={<Check size={16} />}
              label={allSelected ? t('common.deselectAll') : t('common.selectAll')}
              disabled={items.length === 0}
              onSelect={selectAll}
            />
            <MenuSeparator />
            <MenuItem
              icon={<RefreshCw size={16} />}
              label={t('common.refresh')}
              onSelect={() => void load(path, true)}
            />
          </DropdownMenu>
        </div>
      </div>

      {listing?.truncated && <div className="files-banner">{t('files.truncated', { count: items.length })}</div>}

      <div className="files-content" onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('.file-row, .file-card')) return;
        event.preventDefault();
        setSelected(new Set());
        openMenu(null, { x: event.clientX, y: event.clientY });
      }}>
        {loading && (
          <div className="file-skeletons" aria-hidden="true">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="file-skeleton">
                <span className="skeleton-check" />
                <span className="skeleton-icon" />
                <span className="skeleton-name" style={{ width: `${28 + ((index * 11) % 38)}%` }} />
                <span className="skeleton-meta" />
                <span className="skeleton-meta short" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="files-state">
            <div className="files-state-icon is-error">
              {error.code === 'ACCESS_DENIED' ? <Lock size={30} /> : <AlertTriangle size={30} />}
            </div>
            <h2>{t('files.cannotOpen')}</h2>
            <p>{error.message}</p>
            <div className="files-state-actions">
              <button type="button" className="btn btn-primary" onClick={() => void load(path)}>
                <RefreshCw size={16} />
                {t('common.retry')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => onNavigate(homePath)}>
                <Home size={16} />
                {t('files.goHome')}
              </button>
            </div>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="files-state is-empty">
            <EmptyFolderIllustration />
            <h2>{t('files.emptyTitle')}</h2>
            <p>{t('files.emptyBody')}</p>
            <div className="files-state-actions">
              <button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                <UploadCloud size={16} />
                {t('files.uploadFiles')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setNewError('');
                  setNewKind('folder');
                }}
              >
                <FolderPlus size={16} />
                {t('files.newFolder')}
              </button>
            </div>
          </div>
        )}

        {!loading && !error && items.length > 0 && prefs.view === 'list' && (
          <div className="file-list" role="grid" aria-label={heading}>
            <div className="file-list-head" role="row">
              <div className="file-check">
                <Checkbox
                  checked={allSelected}
                  indeterminate={selected.size > 0 && !allSelected}
                  onChange={selectAll}
                  aria-label={t('common.selectAll')}
                />
              </div>
              <button
                type="button"
                className={`file-col-name sortable${prefs.sortBy === 'name' ? ' is-sorted' : ''}`}
                onClick={() => updatePrefs({ sortBy: 'name' })}
              >
                {t('files.colName')}
                {prefs.sortBy === 'name' && <ChevronDown size={12} className={prefs.sortDirection === 'asc' ? 'flip' : ''} />}
              </button>
              <button
                type="button"
                className={`file-col-type sortable${prefs.sortBy === 'type' ? ' is-sorted' : ''}`}
                onClick={() => updatePrefs({ sortBy: 'type' })}
              >
                {t('files.colType')}
              </button>
              <button
                type="button"
                className={`file-col-size sortable${prefs.sortBy === 'size' ? ' is-sorted' : ''}`}
                onClick={() => updatePrefs({ sortBy: 'size' })}
              >
                {t('files.colSize')}
              </button>
              <button
                type="button"
                className={`file-col-modified sortable${prefs.sortBy === 'modified' ? ' is-sorted' : ''}`}
                onClick={() => updatePrefs({ sortBy: 'modified' })}
              >
                {t('files.colModified')}
              </button>
              <div className="file-col-actions" />
            </div>

            {items.map((item, index) => (
              <FileRow
                key={item.path}
                item={item}
                index={index}
                selected={selected.has(item.path)}
                flash={flashPath === item.path}
                onSelect={handleSelect}
                onToggle={toggleSelect}
                onOpen={openItem}
                onMenu={openRowMenu}
                onContext={openContextMenu}
              />
            ))}
          </div>
        )}

        {!loading && !error && items.length > 0 && prefs.view === 'grid' && (
          <div className="file-grid" role="grid" aria-label={heading}>
            {items.map((item, index) => (
              <FileCard
                key={item.path}
                item={item}
                index={index}
                selected={selected.has(item.path)}
                flash={flashPath === item.path}
                onSelect={handleSelect}
                onToggle={toggleSelect}
                onOpen={openItem}
                onMenu={openRowMenu}
                onContext={openContextMenu}
              />
            ))}
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <div className="bulk-count">
            <span className="bulk-badge">{selected.size}</span>
            <span>{t('files.selectedCount', { count: selected.size })}</span>
          </div>
          <div className="bulk-actions">
            <button type="button" className="bulk-btn" onClick={() => void downloadItems(selectedItems)} aria-label={t('bulk.download')} title={t('bulk.download')}>
              <Download size={16} />
              <span>{t('bulk.download')}</span>
            </button>
            <button
              type="button"
              className="bulk-btn"
              onClick={() => {
                setCopyError('');
                setCopyMove({ mode: 'copy', targets: selectedItems });
              }}
              aria-label={t('bulk.copy')}
              title={t('bulk.copy')}
            >
              <Copy size={16} />
              <span>{t('bulk.copy')}</span>
            </button>
            <button
              type="button"
              className="bulk-btn"
              onClick={() => {
                setCopyError('');
                setCopyMove({ mode: 'move', targets: selectedItems });
              }}
              aria-label={t('bulk.move')}
              title={t('bulk.move')}
            >
              <Move size={16} />
              <span>{t('bulk.move')}</span>
            </button>
            <button type="button" className="bulk-btn is-danger" onClick={() => setDeleteTargets(selectedItems)} aria-label={t('bulk.delete')} title={t('bulk.delete')}>
              <Trash2 size={16} />
              <span>{t('bulk.delete')}</span>
            </button>
            <button
              type="button"
              className="bulk-btn is-icon"
              onClick={() => setSelected(new Set())}
              title={t('bulk.clear')}
              aria-label={t('bulk.clear')}
            >
              <X size={17} />
            </button>
          </div>
        </div>
      )}

      {dragActive && (
        <div className="drop-overlay">
          <div className="drop-card">
            <div className="drop-icon">
              <UploadCloud size={34} />
            </div>
            <h2>{t('files.dropTitle')}</h2>
            <p>{t('files.dropBody', { folder: heading })}</p>
          </div>
        </div>
      )}

      <SearchPanel
        open={searchOpen}
        basePath={path}
        onClose={() => setSearchOpen(false)}
        onOpen={(item) => {
          setSearchOpen(false);
          if (item.isDir) {
            onNavigate(item.path);
          } else {
            setPreviewItem(item);
          }
        }}
        onReveal={(item) => {
          setSearchOpen(false);
          const parent = parentPath(item.path);
          if (parent) {
            setFlashPath(item.path);
            onNavigate(parent);
          }
        }}
      />

      <ContextMenu open={Boolean(menu)} at={menu?.point || null} onClose={() => setMenu(null)} width={240}>
        {menu?.item ? (
          <>
            <MenuLabel>{shortenMiddle(menu.item.name, 34)}</MenuLabel>
            <MenuItem
              icon={menu.item.isDir ? <FolderOpen size={16} /> : <Eye size={16} />}
              label={t(menu.item.isDir ? 'actions.open' : 'actions.preview')}
              onSelect={() => openItem(menu.item!)}
            />
            {!menu.item.isDir && isTextLike(menu.item) && (
              <MenuItem
                icon={<Pencil size={16} />}
                label={t('actions.edit')}
                onSelect={() => setEditorItem(menu.item)}
              />
            )}
            <MenuItem
              icon={<Download size={16} />}
              label={t('actions.download')}
              onSelect={() => void downloadItems(menuTargets)}
            />
            <MenuSeparator />
            <MenuItem
              icon={<Copy size={16} />}
              label={t('actions.copyPath')}
              onSelect={() => void copyPath(menu.item || undefined)}
            />
            {parentPath(menu.item.path) && (
              <MenuItem
                icon={<FolderOpen size={16} />}
                label={t('actions.openLocation')}
                onSelect={() => {
                  const parent = parentPath(menu.item!.path);
                  if (parent) {
                    setFlashPath(menu.item!.path);
                    onNavigate(parent);
                  }
                }}
              />
            )}
            <MenuSeparator />
            <MenuItem
              icon={<Pencil size={16} />}
              label={t('actions.rename')}
              disabled={menuTargets.length !== 1}
              onSelect={() => {
                if (menuTargets.length === 1) {
                  setRenameError('');
                  setRenameTarget(menuTargets[0]);
                }
              }}
            />
            <MenuItem
              icon={<Copy size={16} />}
              label={t('actions.copy')}
              onSelect={() => {
                setCopyError('');
                setCopyMove({ mode: 'copy', targets: menuTargets });
              }}
            />
            <MenuItem
              icon={<Move size={16} />}
              label={t('actions.move')}
              onSelect={() => {
                setCopyError('');
                setCopyMove({ mode: 'move', targets: menuTargets });
              }}
            />
            <MenuSeparator />
            <MenuItem
              icon={<Trash2 size={16} />}
              label={t('actions.delete')}
              danger
              onSelect={() => setDeleteTargets(menuTargets)}
            />
          </>
        ) : (
          <>
            <MenuLabel>{t('menu.new')}</MenuLabel>
            <MenuItem
              icon={<FolderPlus size={16} />}
              label={t('files.newFolder')}
              onSelect={() => {
                setNewError('');
                setNewKind('folder');
              }}
            />
            <MenuItem
              icon={<FilePlus2 size={16} />}
              label={t('files.newFile')}
              onSelect={() => {
                setNewError('');
                setNewKind('file');
              }}
            />
            <MenuSeparator />
            <MenuItem
              icon={<UploadCloud size={16} />}
              label={t('files.uploadFiles')}
              onSelect={() => fileInputRef.current?.click()}
            />
            <MenuItem
              icon={<RefreshCw size={16} />}
              label={t('common.refresh')}
              onSelect={() => void load(path, true)}
            />
          </>
        )}
      </ContextMenu>

      <NameDialog
        open={Boolean(newKind)}
        icon={newKind === 'folder' ? <FolderPlus size={21} /> : <FilePlus2 size={21} />}
        title={newKind === 'folder' ? t('newFolder.title') : t('newFile.title')}
        body={
          newKind === 'folder'
            ? t('newFolder.body', { path: shortenMiddle(path, 60) })
            : t('newFile.body', { path: shortenMiddle(path, 60) })
        }
        label={newKind === 'folder' ? t('newFolder.name') : t('newFile.name')}
        placeholder={newKind === 'folder' ? t('newFolder.placeholder') : t('newFile.placeholder')}
        confirmLabel={t('common.create')}
        busy={newBusy}
        error={newError}
        onCancel={() => setNewKind(null)}
        onSubmit={(name) => void createNew(name)}
      />

      <NameDialog
        open={Boolean(renameTarget)}
        icon={<Pencil size={21} />}
        title={t('rename.title', { name: renameTarget?.name || '' })}
        label={t('rename.name')}
        initialValue={renameTarget?.name || ''}
        confirmLabel={t('common.rename')}
        busy={renameBusy}
        error={renameError}
        selectBasename
        onCancel={() => setRenameTarget(null)}
        onSubmit={(name) => void confirmRename(name)}
      />

      <ConfirmDialog
        open={Boolean(deleteTargets)}
        icon={<Trash2 size={22} />}
        title={t('delete.title')}
        tone="danger"
        busy={deleteBusy}
        confirmLabel={deleteBusy ? t('delete.working') : t('delete.confirm')}
        cancelLabel={t('common.cancel')}
        body={
          deleteTargets && deleteTargets.length > 1
            ? t('delete.bodyCount', {
                name: deleteTargets[0].name,
                count: deleteTargets.length - 1,
              })
            : t('delete.body')
        }
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTargets(null)}
      >
        {deleteTargets && (
          <div className="delete-summary">
            <ul className="delete-list">
              {deleteTargets.slice(0, 5).map((item) => (
                <li key={item.path}>
                  <FileIcon item={item} size={24} />
                  <span title={item.path}>{item.name}</span>
                </li>
              ))}
            </ul>
            {deleteTargets.length > 5 && (
              <div className="delete-more">+{deleteTargets.length - 5}</div>
            )}
            {deleteTargets.some((item) => item.protected || item.system) && (
              <div className="delete-protected">
                <ShieldAlert size={17} />
                <div>
                  <strong>{t('delete.protectedTitle')}</strong>
                  <p>{t('delete.protectedNote')}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>

      <CopyMoveDialog
        open={Boolean(copyMove)}
        mode={copyMove?.mode || 'copy'}
        targets={copyMove?.targets || []}
        startPath={path}
        info={systemInfo}
        busy={copyBusy}
        error={copyError}
        onClose={() => setCopyMove(null)}
        onConfirm={(destination) => void confirmCopyMove(destination)}
      />

      {previewItem && (
        <PreviewDialog
          item={previewItem}
          items={items}
          onClose={() => setPreviewItem(null)}
          onEdit={(item) => {
            setPreviewItem(null);
            setEditorItem(item);
          }}
        />
      )}

      {editorItem && (
        <EditorDialog
          item={editorItem}
          onClose={() => setEditorItem(null)}
          onSaved={() => void load(path, true)}
        />
      )}
    </div>
  );
}

interface EntryProps {
  item: FsItem;
  index: number;
  selected: boolean;
  flash: boolean;
  onSelect: (item: FsItem, index: number, event: MouseEvent) => void;
  onToggle: (item: FsItem, index: number) => void;
  onOpen: (item: FsItem) => void;
  onMenu: (item: FsItem, event: MouseEvent) => void;
  onContext: (item: FsItem, event: MouseEvent) => void;
}

function FileRow({ item, index, selected, flash, onSelect, onToggle, onOpen, onMenu, onContext }: EntryProps) {
  const { t, locale } = useI18n();
  const typeKey = typeLabelKey(fileKind(item)) as TranslationKey;
  return (
    <div
      className={`file-row${selected ? ' is-selected' : ''}${flash ? ' is-flash' : ''}${item.hidden ? ' is-hidden-file' : ''}`}
      role="row"
      tabIndex={0}
      aria-selected={selected}
      onClick={(event) => onSelect(item, index, event)}
      onDoubleClick={() => onOpen(item)}
      onContextMenu={(event) => onContext(item, event)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(item);
        if (event.key === ' ') {
          event.preventDefault();
          onToggle(item, index);
        }
      }}
    >
      <div className="file-check" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={selected}
          onChange={() => onToggle(item, index)}
          aria-label={t('files.checkbox', { name: item.name })}
        />
      </div>
      <div className="file-name-cell">
        <FileIcon item={item} size={38} />
        <div className="file-name-copy">
          <span className="file-name" title={item.name}>
            {item.name}
            {item.hidden && <span className="file-chip">{t('files.hiddenBadge')}</span>}
            {item.protected && (
              <span className="file-shield" title={t('files.systemProtected')}>
                <ShieldAlert size={12} />
              </span>
            )}
          </span>
          <span className="file-mobile-meta">
            {item.isDir ? t('common.folder') : formatBytes(item.size, locale)}
            <span className="dot-separator" />
            {formatDate(item.mtimeMs, locale, true)}
          </span>
        </div>
      </div>
      <div className="file-col-type file-type">{t(typeKey)}</div>
      <div className="file-col-size file-size">{item.isDir ? '—' : formatBytes(item.size, locale)}</div>
      <div className="file-col-modified file-modified">{formatDate(item.mtimeMs, locale, true)}</div>
      <div className="file-col-actions">
        <button
          type="button"
          className="file-more"
          onClick={(event) => onMenu(item, event)}
          aria-label={t('files.more')}
          title={t('files.more')}
        >
          <MoreHorizontal size={17} />
        </button>
      </div>
    </div>
  );
}

function FileCard({ item, index, selected, flash, onSelect, onToggle, onOpen, onMenu, onContext }: EntryProps) {
  const { t, locale } = useI18n();
  const typeKey = typeLabelKey(fileKind(item)) as TranslationKey;
  return (
    <div
      className={`file-card${selected ? ' is-selected' : ''}${flash ? ' is-flash' : ''}${item.hidden ? ' is-hidden-file' : ''}`}
      role="gridcell"
      tabIndex={0}
      aria-selected={selected}
      onClick={(event) => onSelect(item, index, event)}
      onDoubleClick={() => onOpen(item)}
      onContextMenu={(event) => onContext(item, event)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(item);
        if (event.key === ' ') {
          event.preventDefault();
          onToggle(item, index);
        }
      }}
    >
      <div className="file-card-top">
        <div onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={selected}
            onChange={() => onToggle(item, index)}
            aria-label={t('files.checkbox', { name: item.name })}
          />
        </div>
        <button
          type="button"
          className="file-more"
          onClick={(event) => onMenu(item, event)}
          aria-label={t('files.more')}
          title={t('files.more')}
        >
          <MoreHorizontal size={17} />
        </button>
      </div>
      <div className="file-card-icon">
        <FileIcon item={item} size={58} />
      </div>
      <div className="file-card-name" title={item.name}>
        {item.name}
      </div>
      <div className="file-card-meta">
        {item.isDir ? (
          t('common.folder')
        ) : (
          <>
            {formatBytes(item.size, locale)}
            <span className="dot-separator" />
            {t(typeKey)}
          </>
        )}
      </div>
      <div className="file-card-date">{formatDate(item.mtimeMs, locale, true)}</div>
      {item.protected && (
        <span className="file-card-shield" title={t('files.systemProtected')}>
          <ShieldAlert size={12} />
        </span>
      )}
    </div>
  );
}
